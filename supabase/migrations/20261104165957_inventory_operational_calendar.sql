-- Operational inventory calendar: count plans are separate from stock movements.
-- Scheduling or starting a count never changes inventory_stock. Only the existing
-- record_inventory_count_session_line RPC applies a physical count.

create table public.inventory_count_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  scheduled_for date not null,
  scope_type text not null check (scope_type in ('all','area','location','selected')),
  scope_label text not null default 'Inventario seleccionado'
    check (char_length(btrim(scope_label)) between 1 and 120),
  assigned_to uuid references auth.users(id) on delete set null,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','completed','cancelled')),
  session_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id),
  unique (session_id),
  foreign key (branch_id,organization_id)
    references public.branches(id,organization_id) on delete restrict,
  foreign key (session_id,organization_id)
    references public.inventory_count_sessions(id,organization_id) on delete restrict
);

create table public.inventory_count_task_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null,
  variant_id uuid not null,
  location_code text not null check (char_length(btrim(location_code)) between 1 and 80),
  name_snapshot text not null default '' check (char_length(name_snapshot) <= 180),
  sku_snapshot text not null default '' check (char_length(sku_snapshot) <= 80),
  unit_snapshot text not null default '' check (char_length(unit_snapshot) <= 40),
  created_at timestamptz not null default now(),
  unique (task_id,variant_id,location_code),
  foreign key (task_id,organization_id)
    references public.inventory_count_tasks(id,organization_id) on delete cascade,
  foreign key (variant_id,organization_id)
    references public.inventory_variants(id,organization_id) on delete restrict
);

create table public.inventory_count_task_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  task_id uuid not null,
  event_type text not null check (event_type in (
    'scheduled','rescheduled','assignment_updated','started','completed','cancelled'
  )),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  note text not null default '' check (char_length(note) <= 1000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (task_id,organization_id)
    references public.inventory_count_tasks(id,organization_id) on delete restrict
);

create index inventory_count_tasks_calendar_idx
  on public.inventory_count_tasks (organization_id,scheduled_for,branch_id,status);
create index inventory_count_tasks_branch_calendar_idx
  on public.inventory_count_tasks (organization_id,branch_id,scheduled_for,status);
create index inventory_count_task_lines_variant_idx
  on public.inventory_count_task_lines (organization_id,variant_id,location_code);
create index inventory_count_task_events_history_idx
  on public.inventory_count_task_events (organization_id,task_id,created_at desc);

alter table public.inventory_count_tasks enable row level security;
alter table public.inventory_count_task_lines enable row level security;
alter table public.inventory_count_task_events enable row level security;

revoke all on public.inventory_count_tasks,public.inventory_count_task_lines,public.inventory_count_task_events
  from public,anon,authenticated;
grant select on public.inventory_count_tasks,public.inventory_count_task_lines,public.inventory_count_task_events
  to authenticated;

create policy inventory_count_tasks_read on public.inventory_count_tasks
  for select to authenticated
  using (app_private.has_visualcorp_access(organization_id,'inventory','view',branch_id));
create policy inventory_count_task_lines_read on public.inventory_count_task_lines
  for select to authenticated
  using (exists (
    select 1 from public.inventory_count_tasks task
    where task.id=inventory_count_task_lines.task_id
      and task.organization_id=inventory_count_task_lines.organization_id
      and app_private.has_visualcorp_access(task.organization_id,'inventory','view',task.branch_id)
  ));
create policy inventory_count_task_events_read on public.inventory_count_task_events
  for select to authenticated
  using (exists (
    select 1 from public.inventory_count_tasks task
    where task.id=inventory_count_task_events.task_id
      and task.organization_id=inventory_count_task_events.organization_id
      and app_private.has_visualcorp_access(task.organization_id,'inventory','view',task.branch_id)
  ));

-- The assignee picker only exposes active members whose effective access profile
-- grants inventory.edit for this organization and branch. It does not depend on team.view.
create or replace function app_private.inventory_member_can_edit(
  p_organization_id uuid,p_branch_id uuid,p_user_id uuid
) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.access_profiles profile
      on profile.id=coalesce(membership.profile_id,(
        select legacy.id from public.access_profiles legacy
        where legacy.organization_id=membership.organization_id
          and legacy.profile_key=case membership.role
            when 'manager' then 'gerencia'
            when 'advisor' then 'asesoras'
            when 'warehouse' then 'inventario'
            when 'production' then 'personal_taller'
            else membership.role end
        limit 1
      ))
      and profile.organization_id=membership.organization_id
    where membership.organization_id=p_organization_id
      and membership.user_id=p_user_id
      and membership.active
      and profile.active
      and (membership.branch_id is null or membership.branch_id=p_branch_id)
      and (
        membership.role='owner'
        or exists (
          select 1 from public.access_profile_permissions permission
          where permission.profile_id=profile.id
            and permission.module_key='inventory'
            and permission.action_key='edit'
            and permission.enabled
        )
      )
  );
$$;
revoke all on function app_private.inventory_member_can_edit(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function app_private.list_inventory_count_assignees(
  p_organization_id uuid,p_branch_id uuid
) returns table(user_id uuid,display_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null
    or not app_private.has_visualcorp_access(p_organization_id,'inventory','edit',p_branch_id) then
    raise exception 'No tienes permiso para consultar responsables de inventario.' using errcode='42501';
  end if;
  return query
    select distinct membership.user_id,
      coalesce(nullif(btrim(profile.full_name),''),'Integrante '||left(membership.user_id::text,8))::text
    from public.organization_memberships membership
    left join public.profiles profile on profile.user_id=membership.user_id
    where membership.organization_id=p_organization_id
      and membership.active
      and (membership.branch_id is null or membership.branch_id=p_branch_id)
      and app_private.inventory_member_can_edit(p_organization_id,p_branch_id,membership.user_id)
    order by 2,1;
end;
$$;

create or replace function app_private.create_inventory_count_task(
  p_organization_id uuid,p_branch_id uuid,p_scheduled_for date,p_scope_type text,
  p_scope_label text,p_lines jsonb,p_assigned_to uuid default null,p_note text default ''
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_task uuid;
  v_line jsonb;
  v_variant uuid;
  v_location text;
begin
  if v_user is null
    or not app_private.has_visualcorp_access(p_organization_id,'inventory','edit',p_branch_id) then
    raise exception 'No tienes permiso para programar conteos en esta sucursal.' using errcode='42501';
  end if;
  if p_scheduled_for is null then raise exception 'Selecciona una fecha para el conteo.' using errcode='22023'; end if;
  if p_scope_type is null or p_scope_type not in ('all','area','location','selected') then raise exception 'El alcance del conteo no es válido.' using errcode='22023'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota supera el máximo de 1000 caracteres.' using errcode='22001'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 5000 then
    raise exception 'Selecciona entre 1 y 5000 artículos y ubicaciones para el conteo.' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id=p_branch_id and branch.organization_id=p_organization_id and branch.active
  ) then raise exception 'La sucursal no está activa en esta organización.' using errcode='22023'; end if;
  if p_assigned_to is not null
    and not app_private.inventory_member_can_edit(p_organization_id,p_branch_id,p_assigned_to) then
    raise exception 'El responsable debe ser un integrante activo con permiso de edición de inventario en esta sucursal.' using errcode='42501';
  end if;

  insert into public.inventory_count_tasks(
    organization_id,branch_id,scheduled_for,scope_type,scope_label,assigned_to,note,created_by
  ) values (
    p_organization_id,p_branch_id,p_scheduled_for,p_scope_type,
    left(coalesce(nullif(btrim(p_scope_label),''),'Inventario seleccionado'),120),
    p_assigned_to,left(coalesce(p_note,''),1000),v_user
  ) returning id into v_task;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_variant := nullif(v_line->>'variant_id','')::uuid;
    v_location := coalesce(nullif(btrim(v_line->>'location_code'),''),'MAIN');
    if v_variant is null or length(v_location)>80
      or not exists (
        select 1
        from public.inventory_variants variant
        join public.inventory_items item
          on item.id=variant.item_id and item.organization_id=variant.organization_id
        join public.inventory_locations location
          on location.organization_id=p_organization_id
          and location.branch_id=p_branch_id
          and location.code=v_location and location.active
        where variant.id=v_variant
          and variant.organization_id=p_organization_id
          and variant.active and item.active
      ) then
      raise exception 'Uno de los artículos o ubicaciones ya no está activo en esta sucursal.' using errcode='22023';
    end if;
    insert into public.inventory_count_task_lines(
      organization_id,task_id,variant_id,location_code,name_snapshot,sku_snapshot,unit_snapshot
    ) values (
      p_organization_id,v_task,v_variant,v_location,
      left(coalesce(v_line->>'name_snapshot',''),180),
      left(coalesce(v_line->>'sku_snapshot',''),80),
      left(coalesce(v_line->>'unit_snapshot',''),40)
    );
  end loop;

  insert into public.inventory_count_task_events(organization_id,task_id,event_type,details,note,actor_id)
  values (
    p_organization_id,v_task,'scheduled',
    jsonb_build_object('scheduled_for',p_scheduled_for,'branch_id',p_branch_id,
      'scope_type',p_scope_type,'scope_label',left(coalesce(p_scope_label,''),120),
      'line_count',jsonb_array_length(p_lines),'assigned_to',p_assigned_to),
    left(coalesce(p_note,''),1000),v_user
  );
  return v_task;
end;
$$;

create or replace function app_private.reschedule_inventory_count_task(
  p_task_id uuid,p_scheduled_for date,p_assigned_to uuid default null,p_note text default ''
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_task public.inventory_count_tasks%rowtype;
begin
  select * into v_task from public.inventory_count_tasks where id=p_task_id for update;
  if not found or v_user is null
    or not app_private.has_visualcorp_access(v_task.organization_id,'inventory','edit',v_task.branch_id) then
    raise exception 'No tienes permiso para reprogramar este conteo.' using errcode='42501';
  end if;
  if v_task.status<>'scheduled' then raise exception 'Solo se pueden reprogramar conteos pendientes.' using errcode='55000'; end if;
  if p_scheduled_for is null then raise exception 'Selecciona una fecha válida.' using errcode='22023'; end if;
  if p_assigned_to is not null
    and not app_private.inventory_member_can_edit(v_task.organization_id,v_task.branch_id,p_assigned_to) then
    raise exception 'El responsable debe tener permiso activo de edición de inventario en esta sucursal.' using errcode='42501';
  end if;
  if v_task.scheduled_for=p_scheduled_for and v_task.assigned_to is not distinct from p_assigned_to then
    return jsonb_build_object('task_id',v_task.id,'status',v_task.status,'replayed',true);
  end if;
  update public.inventory_count_tasks
    set scheduled_for=p_scheduled_for,assigned_to=p_assigned_to,updated_at=now()
    where id=v_task.id and organization_id=v_task.organization_id;
  insert into public.inventory_count_task_events(
    organization_id,task_id,event_type,details,note,actor_id
  ) values (
    v_task.organization_id,v_task.id,
    case when v_task.scheduled_for<>p_scheduled_for then 'rescheduled' else 'assignment_updated' end,
    jsonb_build_object('from_date',v_task.scheduled_for,'to_date',p_scheduled_for,
      'from_assigned_to',v_task.assigned_to,'to_assigned_to',p_assigned_to),
    left(coalesce(p_note,''),1000),v_user
  );
  return jsonb_build_object('task_id',v_task.id,'status','scheduled','scheduled_for',p_scheduled_for,'assigned_to',p_assigned_to);
end;
$$;

create or replace function app_private.cancel_inventory_count_task(
  p_task_id uuid,p_note text default ''
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := (select auth.uid());
  v_task public.inventory_count_tasks%rowtype;
begin
  select * into v_task from public.inventory_count_tasks where id=p_task_id for update;
  if not found or v_user is null
    or not app_private.has_visualcorp_access(v_task.organization_id,'inventory','edit',v_task.branch_id) then
    raise exception 'No tienes permiso para cancelar este conteo.' using errcode='42501';
  end if;
  if v_task.status<>'scheduled' then raise exception 'Solo se pueden cancelar conteos pendientes.' using errcode='55000'; end if;
  update public.inventory_count_tasks
    set status='cancelled',cancelled_at=now(),updated_at=now()
    where id=v_task.id and organization_id=v_task.organization_id;
  insert into public.inventory_count_task_events(organization_id,task_id,event_type,details,note,actor_id)
  values (v_task.organization_id,v_task.id,'cancelled',
    jsonb_build_object('scheduled_for',v_task.scheduled_for,'assigned_to',v_task.assigned_to),
    left(coalesce(p_note,''),1000),v_user);
  return jsonb_build_object('task_id',v_task.id,'status','cancelled');
end;
$$;

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
    order by task_line.created_at,task_line.id;
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

create or replace function app_private.sync_inventory_count_task_session_status()
returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_task public.inventory_count_tasks%rowtype;
  v_next_status text;
  v_event text;
  v_actor uuid;
begin
  if old.status is not distinct from new.status or new.status not in ('completed','cancelled') then
    return new;
  end if;
  select * into v_task
    from public.inventory_count_tasks
    where session_id=new.id and organization_id=new.organization_id
    for update;
  if not found or v_task.status<>'in_progress' then return new; end if;
  v_next_status := case new.status when 'completed' then 'completed' else 'cancelled' end;
  v_event := case new.status when 'completed' then 'completed' else 'cancelled' end;
  v_actor := coalesce(new.completed_by,(select auth.uid()),new.created_by);
  update public.inventory_count_tasks
    set status=v_next_status,
      completed_at=case when v_next_status='completed' then coalesce(new.completed_at,now()) else completed_at end,
      cancelled_at=case when v_next_status='cancelled' then now() else cancelled_at end,
      updated_at=now()
    where id=v_task.id and organization_id=v_task.organization_id;
  insert into public.inventory_count_task_events(organization_id,task_id,event_type,details,note,actor_id)
  values (v_task.organization_id,v_task.id,v_event,
    jsonb_build_object('session_id',new.id,'session_status',new.status),
    case when new.status='completed' then 'La sesión física quedó cerrada.' else 'La sesión física se canceló.' end,
    v_actor);
  return new;
end;
$$;
revoke all on function app_private.sync_inventory_count_task_session_status() from public,anon,authenticated;
create trigger inventory_count_task_session_status_sync
  after update of status on public.inventory_count_sessions
  for each row execute function app_private.sync_inventory_count_task_session_status();

revoke all on function app_private.list_inventory_count_assignees(uuid,uuid) from public,anon,authenticated;
revoke all on function app_private.create_inventory_count_task(uuid,uuid,date,text,text,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function app_private.reschedule_inventory_count_task(uuid,date,uuid,text) from public,anon,authenticated;
revoke all on function app_private.cancel_inventory_count_task(uuid,text) from public,anon,authenticated;
revoke all on function app_private.start_inventory_count_task(uuid) from public,anon,authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.list_inventory_count_assignees(uuid,uuid) to authenticated;
grant execute on function app_private.create_inventory_count_task(uuid,uuid,date,text,text,jsonb,uuid,text) to authenticated;
grant execute on function app_private.reschedule_inventory_count_task(uuid,date,uuid,text) to authenticated;
grant execute on function app_private.cancel_inventory_count_task(uuid,text) to authenticated;
grant execute on function app_private.start_inventory_count_task(uuid) to authenticated;

create or replace function public.list_inventory_count_assignees(
  p_organization_id uuid,p_branch_id uuid
) returns table(user_id uuid,display_name text)
language sql stable security invoker set search_path='' as $$
  select * from app_private.list_inventory_count_assignees($1,$2);
$$;
create or replace function public.create_inventory_count_task(
  p_organization_id uuid,p_branch_id uuid,p_scheduled_for date,p_scope_type text,
  p_scope_label text,p_lines jsonb,p_assigned_to uuid default null,p_note text default ''
) returns uuid
language sql security invoker set search_path='' as $$
  select app_private.create_inventory_count_task($1,$2,$3,$4,$5,$6,$7,$8);
$$;
create or replace function public.reschedule_inventory_count_task(
  p_task_id uuid,p_scheduled_for date,p_assigned_to uuid default null,p_note text default ''
) returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.reschedule_inventory_count_task($1,$2,$3,$4);
$$;
create or replace function public.cancel_inventory_count_task(
  p_task_id uuid,p_note text default ''
) returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.cancel_inventory_count_task($1,$2);
$$;
create or replace function public.start_inventory_count_task(p_task_id uuid)
returns jsonb
language sql security invoker set search_path='' as $$
  select app_private.start_inventory_count_task($1);
$$;

revoke all on function public.list_inventory_count_assignees(uuid,uuid) from public,anon;
revoke all on function public.create_inventory_count_task(uuid,uuid,date,text,text,jsonb,uuid,text) from public,anon;
revoke all on function public.reschedule_inventory_count_task(uuid,date,uuid,text) from public,anon;
revoke all on function public.cancel_inventory_count_task(uuid,text) from public,anon;
revoke all on function public.start_inventory_count_task(uuid) from public,anon;
grant execute on function public.list_inventory_count_assignees(uuid,uuid) to authenticated;
grant execute on function public.create_inventory_count_task(uuid,uuid,date,text,text,jsonb,uuid,text) to authenticated;
grant execute on function public.reschedule_inventory_count_task(uuid,date,uuid,text) to authenticated;
grant execute on function public.cancel_inventory_count_task(uuid,text) to authenticated;
grant execute on function public.start_inventory_count_task(uuid) to authenticated;
