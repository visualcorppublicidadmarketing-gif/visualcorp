create table public.inventory_count_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  branch_id uuid not null,
  idempotency_key uuid not null,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid not null references auth.users(id),
  completed_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id,created_by,idempotency_key),
  unique (id,organization_id),
  foreign key (branch_id,organization_id) references public.branches(id,organization_id)
);

create table public.inventory_count_session_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null,
  sequence_no integer not null check (sequence_no > 0),
  variant_id uuid not null,
  branch_id uuid not null,
  location_code text not null default 'MAIN' check (char_length(location_code) between 1 and 80),
  expected_quantity numeric(14,3) not null default 0 check (expected_quantity >= 0),
  counted_quantity numeric(14,3) check (counted_quantity is null or counted_quantity >= 0),
  status text not null default 'pending' check (status in ('pending','counted','skipped')),
  note text not null default '' check (char_length(note) <= 1000),
  counted_by uuid references auth.users(id),
  counted_at timestamptz,
  unique (session_id,variant_id,location_code),
  unique (id,session_id,organization_id),
  foreign key (session_id,organization_id) references public.inventory_count_sessions(id,organization_id),
  foreign key (variant_id,organization_id) references public.inventory_variants(id,organization_id),
  foreign key (branch_id,organization_id) references public.branches(id,organization_id)
);

create table public.inventory_count_session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null,
  line_id uuid,
  event_type text not null check (event_type in ('counted','skipped','completed','cancelled')),
  counted_quantity numeric(14,3) check (counted_quantity is null or counted_quantity >= 0),
  note text not null default '' check (char_length(note) <= 1000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (session_id,organization_id) references public.inventory_count_sessions(id,organization_id),
  foreign key (line_id,session_id,organization_id) references public.inventory_count_session_lines(id,session_id,organization_id)
);

create index inventory_count_sessions_open_idx
  on public.inventory_count_sessions(organization_id,branch_id,created_by,opened_at desc)
  where status='open';
create index inventory_count_session_lines_work_idx
  on public.inventory_count_session_lines(session_id,sequence_no,status);
create index inventory_count_session_events_history_idx
  on public.inventory_count_session_events(organization_id,session_id,created_at desc);

alter table public.inventory_count_sessions enable row level security;
alter table public.inventory_count_session_lines enable row level security;
alter table public.inventory_count_session_events enable row level security;

revoke all on public.inventory_count_sessions,public.inventory_count_session_lines,public.inventory_count_session_events from public,anon,authenticated;
grant select on public.inventory_count_sessions,public.inventory_count_session_lines,public.inventory_count_session_events to authenticated;
create policy inventory_count_sessions_read on public.inventory_count_sessions
  for select to authenticated using(app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','warehouse','production']));
create policy inventory_count_session_lines_read on public.inventory_count_session_lines
  for select to authenticated using(app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','warehouse','production']));
create policy inventory_count_session_events_read on public.inventory_count_session_events
  for select to authenticated using(exists(
    select 1 from public.inventory_count_sessions session
    where session.id=inventory_count_session_events.session_id
      and session.organization_id=inventory_count_session_events.organization_id
      and app_private.has_org_role(session.organization_id,session.branch_id,array['owner','admin','manager','warehouse','production'])
  ));

create or replace function public.begin_inventory_count_session(
  p_branch_id uuid,
  p_lines jsonb,
  p_idempotency_key uuid,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_session uuid;
  v_reused boolean := false;
  v_line jsonb;
  v_input record;
  v_variant uuid;
  v_location text;
  v_ordinal integer;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para abrir un conteo.'; end if;
  if p_idempotency_key is null then raise exception 'Falta la clave de la sesión de conteo.'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Selecciona al menos un artículo para contar.';
  end if;

  select organization_id into v_org from public.branches where id=p_branch_id;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para contar en esta sucursal.';
  end if;

  select id into v_session
    from public.inventory_count_sessions
    where organization_id=v_org and branch_id=p_branch_id and created_by=(select auth.uid()) and status='open'
    order by opened_at desc limit 1 for update;
  if v_session is not null then
    v_reused := true;
  else
    insert into public.inventory_count_sessions(organization_id,branch_id,idempotency_key,note,created_by)
    values(v_org,p_branch_id,p_idempotency_key,left(coalesce(p_note,''),1000),(select auth.uid()))
    on conflict(organization_id,created_by,idempotency_key) do nothing returning id into v_session;
    if v_session is null then
      select id into v_session from public.inventory_count_sessions where organization_id=v_org and created_by=(select auth.uid()) and idempotency_key=p_idempotency_key;
      v_reused := true;
    end if;
  end if;

  if not v_reused then
    for v_input in
      select value,ordinality::integer as ordinal from jsonb_array_elements(p_lines) with ordinality as input(value,ordinality)
    loop
      v_line := v_input.value;
      v_ordinal := v_input.ordinal;
      v_variant := nullif(v_line->>'variant_id','')::uuid;
      v_location := coalesce(nullif(trim(v_line->>'location_code'),''),'MAIN');
      if v_variant is null or not exists(
        select 1 from public.inventory_variants where id=v_variant and organization_id=v_org and active
      ) then raise exception 'Una de las variantes ya no está activa en esta organización.'; end if;
      insert into public.inventory_count_session_lines(
        organization_id,session_id,sequence_no,variant_id,branch_id,location_code,expected_quantity
      ) values(
        v_org,v_session,v_ordinal,v_variant,p_branch_id,v_location,
        coalesce((select quantity from public.inventory_stock where organization_id=v_org and variant_id=v_variant and branch_id=p_branch_id and location_code=v_location),0)
      ) on conflict(session_id,variant_id,location_code) do nothing;
    end loop;
  end if;

  return jsonb_build_object(
    'session_id',v_session,
    'reused',v_reused,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',line.id,'variant_id',line.variant_id,'branch_id',line.branch_id,'location_code',line.location_code,
      'expected_quantity',line.expected_quantity,'counted_quantity',line.counted_quantity,'status',line.status,'note',line.note
    ) order by line.sequence_no),'[]'::jsonb) from public.inventory_count_session_lines line where line.session_id=v_session)
  );
end;
$$;

create or replace function public.record_inventory_count_session_line(
  p_session_id uuid,
  p_line_id uuid,
  p_counted_quantity numeric,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_line public.inventory_count_session_lines%rowtype;
  v_result jsonb;
  v_note text;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para guardar el conteo.'; end if;
  if p_counted_quantity is null or p_counted_quantity<0 then raise exception 'El conteo debe ser cero o mayor.'; end if;
  select * into v_session from public.inventory_count_sessions where id=p_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'La sesión de conteo ya no está abierta.'; end if;
  if not app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para modificar esta sesión.';
  end if;
  select * into v_line from public.inventory_count_session_lines where id=p_line_id and session_id=p_session_id for update;
  if not found then raise exception 'El artículo no pertenece a esta sesión.'; end if;
  v_note := left(format('Sesión %s · saldo al iniciar %s · observado %s · %s',p_session_id,v_line.expected_quantity,p_counted_quantity,coalesce(nullif(trim(p_note),''),'Conteo físico')),1000);
  v_result := public.set_inventory_count(v_line.variant_id,v_line.branch_id,p_counted_quantity,v_line.location_code,v_note);
  update public.inventory_count_session_lines set counted_quantity=p_counted_quantity,status='counted',note=left(coalesce(p_note,''),1000),counted_by=(select auth.uid()),counted_at=now() where id=p_line_id;
  insert into public.inventory_count_session_events(organization_id,session_id,line_id,event_type,counted_quantity,note,actor_id)
  values(v_session.organization_id,p_session_id,p_line_id,'counted',p_counted_quantity,left(coalesce(p_note,''),1000),(select auth.uid()));
  if not exists(select 1 from public.inventory_count_session_lines where session_id=p_session_id and status='pending') then
    update public.inventory_count_sessions set status='completed',completed_by=(select auth.uid()),completed_at=now() where id=p_session_id;
    insert into public.inventory_count_session_events(organization_id,session_id,event_type,note,actor_id)
    values(v_session.organization_id,p_session_id,'completed','Todos los artículos contados',(select auth.uid()));
  end if;
  return v_result;
end;
$$;

create or replace function public.skip_inventory_count_session_line(
  p_session_id uuid,
  p_line_id uuid,
  p_note text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_session public.inventory_count_sessions%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para omitir un artículo.'; end if;
  select * into v_session from public.inventory_count_sessions where id=p_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'La sesión de conteo ya no está abierta.'; end if;
  if not app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para modificar esta sesión.';
  end if;
  update public.inventory_count_session_lines set status='skipped',note=left(coalesce(p_note,'Omitido durante el recorrido'),1000),counted_by=(select auth.uid()),counted_at=now()
    where id=p_line_id and session_id=p_session_id and status<>'counted';
  if not found then raise exception 'El artículo no pertenece a esta sesión o ya fue contado.'; end if;
  insert into public.inventory_count_session_events(organization_id,session_id,line_id,event_type,note,actor_id)
  values(v_session.organization_id,p_session_id,p_line_id,'skipped',left(coalesce(p_note,'Omitido durante el recorrido'),1000),(select auth.uid()));
end;
$$;

create or replace function public.complete_inventory_count_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_pending integer;
  v_skipped integer;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para cerrar el conteo.'; end if;
  select * into v_session from public.inventory_count_sessions where id=p_session_id for update;
  if not found then raise exception 'No se encontró la sesión de conteo.'; end if;
  if not app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para cerrar esta sesión.';
  end if;
  if v_session.status='completed' then
    return jsonb_build_object('session_id',v_session.id,'status',v_session.status,'replayed',true);
  end if;
  if v_session.status<>'open' then raise exception 'La sesión no se puede cerrar desde su estado actual.'; end if;
  select count(*) filter(where status='pending'),count(*) filter(where status='skipped') into v_pending,v_skipped
    from public.inventory_count_session_lines where session_id=p_session_id;
  update public.inventory_count_sessions set status='completed',completed_by=(select auth.uid()),completed_at=now() where id=p_session_id;
  insert into public.inventory_count_session_events(organization_id,session_id,event_type,note,actor_id)
  values(v_session.organization_id,p_session_id,'completed',format('%s pendiente(s), %s omitido(s)',v_pending,v_skipped),(select auth.uid()));
  return jsonb_build_object('session_id',p_session_id,'status','completed','pending',v_pending,'skipped',v_skipped,'replayed',false);
end;
$$;

create or replace function public.cancel_inventory_count_session(p_session_id uuid,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_session public.inventory_count_sessions%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para cerrar el recorrido.'; end if;
  select * into v_session from public.inventory_count_sessions where id=p_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'La sesión de conteo ya no está abierta.'; end if;
  if not app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para cerrar esta sesión.';
  end if;
  update public.inventory_count_sessions set status='cancelled',completed_by=(select auth.uid()),completed_at=now() where id=p_session_id;
  insert into public.inventory_count_session_events(organization_id,session_id,event_type,note,actor_id)
  values(v_session.organization_id,p_session_id,'cancelled',left(coalesce(p_note,'Recorrido cancelado'),1000),(select auth.uid()));
end;
$$;

revoke all on function public.begin_inventory_count_session(uuid,jsonb,uuid,text) from public,anon;
revoke all on function public.record_inventory_count_session_line(uuid,uuid,numeric,text) from public,anon;
revoke all on function public.skip_inventory_count_session_line(uuid,uuid,text) from public,anon;
revoke all on function public.complete_inventory_count_session(uuid) from public,anon;
revoke all on function public.cancel_inventory_count_session(uuid,text) from public,anon;
grant execute on function public.begin_inventory_count_session(uuid,jsonb,uuid,text) to authenticated;
grant execute on function public.record_inventory_count_session_line(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.skip_inventory_count_session_line(uuid,uuid,text) to authenticated;
grant execute on function public.complete_inventory_count_session(uuid) to authenticated;
grant execute on function public.cancel_inventory_count_session(uuid,text) to authenticated;
