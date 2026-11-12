-- Serialize the creation of physical-count lines by organization, branch,
-- variant and location. The guard lives on the table so both guided and
-- scheduled counts receive the same protection.
create or replace function app_private.guard_inventory_count_scope_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.inventory_count_sessions%rowtype;
begin
  new.location_code := coalesce(nullif(trim(new.location_code), ''), 'MAIN');

  select * into v_session
  from public.inventory_count_sessions
  where id = new.session_id
    and organization_id = new.organization_id;

  if not found or v_session.branch_id is distinct from new.branch_id then
    raise exception 'La línea de conteo no coincide con su sucursal.' using errcode = '23514';
  end if;
  if v_session.status <> 'open' then
    raise exception 'No se pueden agregar artículos a una sesión de conteo cerrada.' using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.format('inventory-count-scope:%s:%s:%s:%s',
        new.organization_id, new.branch_id, new.variant_id, new.location_code),
      0
    )
  );

  if exists (
    select 1
    from public.inventory_count_session_lines other_line
    join public.inventory_count_sessions other_session
      on other_session.id = other_line.session_id
     and other_session.organization_id = other_line.organization_id
    where other_session.status = 'open'
      and other_line.status = 'pending'
      and other_line.organization_id = new.organization_id
      and other_line.branch_id = new.branch_id
      and other_line.variant_id = new.variant_id
      and other_line.location_code = new.location_code
      and other_line.session_id <> new.session_id
  ) then
    raise exception 'Este artículo y ubicación ya están incluidos en otro conteo abierto. Completa o cancela ese conteo antes de iniciarlo aquí.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_inventory_count_scope_overlap() from public, anon, authenticated;
create trigger inventory_count_session_line_a_scope_guard_before_insert
  before insert on public.inventory_count_session_lines
  for each row execute function app_private.guard_inventory_count_scope_overlap();

-- Insert multi-line sessions in the same deterministic scope order used by
-- the trigger. This avoids deadlocks when two sessions overlap partially.
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
  v_scope_matches boolean := true;
  v_requested_scope text[];
  v_open_scope text[];
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

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.format('inventory-count:%s:%s:%s',v_org,p_branch_id,(select auth.uid())),0));

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

  if v_reused then
    select coalesce(array_agg(scope_key order by scope_key),'{}'::text[])
      into v_requested_scope
      from (
        select distinct format(
          '%s|%s',
          nullif(value->>'variant_id','')::uuid,
          coalesce(nullif(trim(value->>'location_code'),''),'MAIN')
        ) as scope_key
        from jsonb_array_elements(p_lines)
      ) requested;
    select coalesce(array_agg(format('%s|%s',line.variant_id,line.location_code) order by line.variant_id,line.location_code),'{}'::text[])
      into v_open_scope
      from public.inventory_count_session_lines line
      where line.session_id=v_session;
    v_scope_matches := v_requested_scope=v_open_scope;
  end if;

  if not v_reused then
    for v_input in
      select input.value, input.ordinality::integer as ordinal
      from jsonb_array_elements(p_lines) with ordinality as input(value,ordinality)
      order by nullif(input.value->>'variant_id','')::uuid,
        coalesce(nullif(trim(input.value->>'location_code'),''),'MAIN')
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
    'scope_matches',v_scope_matches,
    'lines',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',line.id,'variant_id',line.variant_id,'branch_id',line.branch_id,'location_code',line.location_code,
      'expected_quantity',line.expected_quantity,'counted_quantity',line.counted_quantity,'status',line.status,'note',line.note
    ) order by line.sequence_no),'[]'::jsonb) from public.inventory_count_session_lines line where line.session_id=v_session)
  );
end;
$$;

revoke all on function public.begin_inventory_count_session(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.begin_inventory_count_session(uuid,jsonb,uuid,text) to authenticated;

-- Scheduled counts create their lines through a separate RPC, so keep their
-- insertion order aligned with guided sessions before row triggers acquire locks.
create or replace function app_private.start_inventory_count_task(p_task_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_task public.inventory_count_tasks%rowtype;
  v_session uuid;
  v_lines jsonb;
begin
  select * into v_task from public.inventory_count_tasks where id=p_task_id for update;
  if not found or v_user is null
    or not app_private.has_visualcorp_access(v_task.organization_id,'inventory','edit',v_task.branch_id) then
    raise exception 'No tienes permiso para iniciar este conteo.' using errcode='42501';
  end if;
  if v_task.status='in_progress' and v_task.session_id is not null then
    v_session := v_task.session_id;
  elsif v_task.status='scheduled' then
    insert into public.inventory_count_sessions(
      organization_id,branch_id,idempotency_key,note,created_by
    ) values (
      v_task.organization_id,v_task.branch_id,v_task.id,
      left(concat_ws(' · ','Conteo programado',v_task.scope_label,v_task.note),1000),v_user
    ) returning id into v_session;

    insert into public.inventory_count_session_lines(
      organization_id,session_id,sequence_no,variant_id,branch_id,location_code,expected_quantity
    )
    select v_task.organization_id,v_session,
      row_number() over(order by task_line.created_at,task_line.id)::integer,
      task_line.variant_id,v_task.branch_id,task_line.location_code,
      coalesce(stock.quantity,0)
    from public.inventory_count_task_lines task_line
    left join public.inventory_stock stock
      on stock.organization_id=task_line.organization_id
      and stock.variant_id=task_line.variant_id
      and stock.branch_id=v_task.branch_id
      and stock.location_code=task_line.location_code
    where task_line.task_id=v_task.id
      and task_line.organization_id=v_task.organization_id
    order by task_line.variant_id,
      coalesce(nullif(trim(task_line.location_code),''),'MAIN');
    if not found then raise exception 'El alcance guardado ya no tiene artículos para contar.' using errcode='22023'; end if;

    update public.inventory_count_tasks
      set status='in_progress',session_id=v_session,updated_at=now()
      where id=v_task.id and organization_id=v_task.organization_id;
    insert into public.inventory_count_task_events(organization_id,task_id,event_type,details,note,actor_id)
    values (v_task.organization_id,v_task.id,'started',
      jsonb_build_object('session_id',v_session,'started_by',v_user,'scheduled_for',v_task.scheduled_for),
      'La sesión creó una línea base actual al iniciar.',v_user);
  else
    raise exception 'El conteo ya fue cerrado y no se puede iniciar.' using errcode='55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',session_line.id,'variant_id',session_line.variant_id,'branch_id',session_line.branch_id,
    'location_code',session_line.location_code,'expected_quantity',session_line.expected_quantity,
    'counted_quantity',session_line.counted_quantity,'status',session_line.status,
    'name_snapshot',task_line.name_snapshot,'sku_snapshot',task_line.sku_snapshot,'unit_snapshot',task_line.unit_snapshot
  ) order by session_line.sequence_no),'[]'::jsonb)
  into v_lines
  from public.inventory_count_session_lines session_line
  join public.inventory_count_task_lines task_line
    on task_line.task_id=v_task.id
    and task_line.organization_id=v_task.organization_id
    and task_line.variant_id=session_line.variant_id
    and task_line.location_code=session_line.location_code
  where session_line.session_id=v_session;

  return jsonb_build_object(
    'task_id',v_task.id,'session_id',v_session,'status','in_progress',
    'reused',v_task.session_id is not null,'lines',v_lines
  );
end;
$$;

revoke all on function app_private.start_inventory_count_task(uuid) from public, anon, authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.start_inventory_count_task(uuid) to authenticated;
