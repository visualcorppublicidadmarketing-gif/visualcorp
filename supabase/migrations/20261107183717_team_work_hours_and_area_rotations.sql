-- Visual Corp Suite: work-window authorization and recurring area duties.
-- All times are interpreted in America/Guayaquil. No remote data is changed by this file alone.
alter table public.access_profile_permissions drop constraint if exists access_profile_permissions_module_key_check;
alter table public.access_profile_permissions add constraint access_profile_permissions_module_key_check
  check (module_key in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','finance','personnel','team_schedule'));
create table public.team_work_hours (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_open boolean not null default false,
  opens_at time,
  closes_at time,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, weekday),
  check ((not is_open and opens_at is null and closes_at is null)
    or (is_open and opens_at is not null and closes_at is not null and opens_at < closes_at))
);

insert into public.team_work_hours(organization_id,weekday,is_open,opens_at,closes_at)
select o.id,d.weekday,d.is_open,d.opens_at,d.closes_at from public.organizations o
cross join (values
  (0,false,null::time,null::time),(1,true,'08:00'::time,'18:30'::time),
  (2,true,'08:00'::time,'18:30'::time),(3,true,'08:00'::time,'18:30'::time),
  (4,true,'08:00'::time,'18:30'::time),(5,true,'08:00'::time,'18:30'::time),
  (6,true,'08:00'::time,'13:00'::time)
) d(weekday,is_open,opens_at,closes_at) where o.slug='visual-corp'
on conflict (organization_id,weekday) do nothing;

insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select p.id,'team_schedule',action_key,true
from public.access_profiles p
join public.organizations o on o.id=p.organization_id
cross join (values ('view'),('edit')) actions(action_key)
where o.slug='visual-corp' and p.active and p.profile_key in ('owner','admin','encargado_local')
on conflict (profile_id,module_key,action_key) do update set enabled=true;

create table public.team_work_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_date date not null,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('open','closed')),
  opens_at time,
  closes_at time,
  note text not null default '' check (length(note) <= 300),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  check ((kind='closed' and opens_at is null and closes_at is null)
    or (kind='open' and opens_at is not null and closes_at is not null and opens_at < closes_at))
);
create unique index team_work_exception_general_uq on public.team_work_exceptions(organization_id,work_date) where user_id is null;
create unique index team_work_exception_member_uq on public.team_work_exceptions(organization_id,work_date,user_id) where user_id is not null;
create index team_work_exceptions_calendar_idx on public.team_work_exceptions(organization_id,work_date);

create table public.team_area_rotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  area_name text not null check (length(trim(area_name)) between 2 and 100),
  task_name text not null check (length(trim(task_name)) between 3 and 120),
  weekday smallint not null check (weekday between 0 and 6),
  starts_on date not null,
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  note text not null default '' check (length(note) <= 500),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(id,organization_id),
  check (starts_at < ends_at)
);
create index team_area_rotations_org_day_idx on public.team_area_rotations(organization_id,weekday,active);

create table public.team_area_rotation_members (
  rotation_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  position smallint not null check (position between 1 and 30),
  primary key(rotation_id,user_id),
  unique(rotation_id,position),
  foreign key(rotation_id,organization_id) references public.team_area_rotations(id,organization_id) on delete cascade
);

create table public.team_schedule_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  entity text not null,
  entity_id text not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
create index team_schedule_audit_recent_idx on public.team_schedule_audit(organization_id,created_at desc);

alter table public.team_work_hours enable row level security;
alter table public.team_work_exceptions enable row level security;
alter table public.team_area_rotations enable row level security;
alter table public.team_area_rotation_members enable row level security;
alter table public.team_schedule_audit enable row level security;
revoke all on public.team_work_hours,public.team_work_exceptions,public.team_area_rotations,
  public.team_area_rotation_members,public.team_schedule_audit from public,anon,authenticated;

create or replace function app_private.can_manage_team_schedule(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_memberships m
    left join public.access_profiles p on p.id=m.profile_id and p.organization_id=m.organization_id
    where m.organization_id=p_org and m.user_id=auth.uid() and m.active
      and coalesce(p.active,true)
      and (m.role in ('owner','admin') or p.profile_key in ('owner','admin','encargado_local'))
  ) or app_private.has_visualcorp_access(p_org,'team_schedule','edit');
$$;
revoke all on function app_private.can_manage_team_schedule(uuid) from public,anon;
grant execute on function app_private.can_manage_team_schedule(uuid) to authenticated;

create or replace function app_private.can_view_team_schedule(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.can_manage_team_schedule(p_org)
    or app_private.has_visualcorp_access(p_org,'team_schedule','view');
$$;
revoke all on function app_private.can_view_team_schedule(uuid) from public,anon;
grant execute on function app_private.can_view_team_schedule(uuid) to authenticated;

create or replace function app_private.is_active_team_member(p_org uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.can_manage_team_schedule(p_org) and exists(
    select 1 from public.organization_memberships m
    where m.organization_id=p_org and m.user_id=p_user and m.active
      and not exists(select 1 from public.personnel_account_links l
        left join public.personnel_records r on r.organization_id=l.organization_id and r.id=l.personnel_id
        where l.organization_id=m.organization_id and l.user_id=m.user_id and coalesce(r.status,'')<>'active')
  );
$$;
revoke all on function app_private.is_active_team_member(uuid,uuid) from public,anon;
grant execute on function app_private.is_active_team_member(uuid,uuid) to authenticated;

grant select,insert,update on public.team_work_hours to authenticated;
grant select,insert,update,delete on public.team_work_exceptions to authenticated;
grant select on public.team_area_rotations,public.team_area_rotation_members,public.team_schedule_audit to authenticated;
create policy team_hours_read on public.team_work_hours for select to authenticated
  using (app_private.can_view_team_schedule(organization_id));
create policy team_hours_insert on public.team_work_hours for insert to authenticated
  with check (app_private.can_manage_team_schedule(organization_id));
create policy team_hours_update on public.team_work_hours for update to authenticated
  using (app_private.can_manage_team_schedule(organization_id))
  with check (app_private.can_manage_team_schedule(organization_id));
create policy team_exceptions_read on public.team_work_exceptions for select to authenticated
  using (app_private.can_view_team_schedule(organization_id));
create policy team_exceptions_insert on public.team_work_exceptions for insert to authenticated
  with check (app_private.can_manage_team_schedule(organization_id)
    and (user_id is null or app_private.is_active_team_member(organization_id,user_id)));
create policy team_exceptions_update on public.team_work_exceptions for update to authenticated
  using (app_private.can_manage_team_schedule(organization_id))
  with check (app_private.can_manage_team_schedule(organization_id)
    and (user_id is null or app_private.is_active_team_member(organization_id,user_id)));
create policy team_exceptions_delete on public.team_work_exceptions for delete to authenticated
  using (app_private.can_manage_team_schedule(organization_id));
create policy team_rotations_read on public.team_area_rotations for select to authenticated
  using (app_private.can_view_team_schedule(organization_id));
create policy team_rotation_members_read on public.team_area_rotation_members for select to authenticated
  using (app_private.can_view_team_schedule(organization_id));
create policy team_schedule_audit_read on public.team_schedule_audit for select to authenticated
  using (app_private.can_view_team_schedule(organization_id));

create or replace function app_private.log_team_schedule_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb; v_org uuid; v_id text;
begin
  v_before:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_after:=case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_org:=coalesce((v_after->>'organization_id')::uuid,(v_before->>'organization_id')::uuid);
  v_id:=coalesce(v_after->>'id',v_before->>'id',v_after->>'weekday',v_before->>'weekday',v_after->>'rotation_id',v_before->>'rotation_id');
  insert into public.team_schedule_audit(organization_id,actor_user_id,entity,entity_id,action,before_value,after_value)
    values(v_org,auth.uid(),tg_table_name,coalesce(v_id,''),lower(tg_op),v_before,v_after);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.log_team_schedule_change() from public,anon,authenticated;
create trigger team_hours_audit after insert or update or delete on public.team_work_hours
  for each row execute function app_private.log_team_schedule_change();
create trigger team_exceptions_audit after insert or update or delete on public.team_work_exceptions
  for each row execute function app_private.log_team_schedule_change();
create trigger team_rotations_audit after insert or update or delete on public.team_area_rotations
  for each row execute function app_private.log_team_schedule_change();
create trigger team_rotation_members_audit after insert or update or delete on public.team_area_rotation_members
  for each row execute function app_private.log_team_schedule_change();

create or replace function app_private.is_work_access_open(p_org uuid,p_user uuid,p_at timestamptz default now())
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_local timestamp; v_kind text; v_start time; v_end time; v_open boolean; v_weekday int;
begin
  if p_org is null or p_user is null then return false; end if;
  if not exists(select 1 from public.organization_memberships m
    left join public.access_profiles p on p.id=m.profile_id and p.organization_id=m.organization_id
    where m.organization_id=p_org and m.user_id=p_user and m.active and coalesce(p.active,true)) then return false; end if;
  if exists(select 1 from public.organization_memberships m
    left join public.access_profiles p on p.id=m.profile_id and p.organization_id=m.organization_id
    where m.organization_id=p_org and m.user_id=p_user and m.active and coalesce(p.active,true)
      and (m.role in ('owner','admin') or p.profile_key in ('owner','admin','encargado_local'))) then return true; end if;
  v_local:=p_at at time zone 'America/Guayaquil';
  select e.kind,e.opens_at,e.closes_at into v_kind,v_start,v_end
    from public.team_work_exceptions e
    where e.organization_id=p_org and e.work_date=v_local::date and (e.user_id=p_user or e.user_id is null)
    order by (e.user_id is not null) desc limit 1;
  if found then return v_kind='open' and v_local::time>=v_start and v_local::time<v_end; end if;
  v_weekday:=extract(dow from v_local)::int;
  select h.is_open,h.opens_at,h.closes_at into v_open,v_start,v_end from public.team_work_hours h
    where h.organization_id=p_org and h.weekday=v_weekday;
  if found then return v_open and v_local::time>=v_start and v_local::time<v_end; end if;
  return (v_weekday between 1 and 5 and v_local::time>=time '08:00' and v_local::time<time '18:30')
    or (v_weekday=6 and v_local::time>=time '08:00' and v_local::time<time '13:00');
end;
$$;
revoke all on function app_private.is_work_access_open(uuid,uuid,timestamptz) from public,anon,authenticated;

-- The existing RLS policies call these central helpers. Re-evaluate the work
-- window on every database request so an old browser session does not keep access.
create or replace function app_private.has_org_role(p_org uuid,p_branch uuid default null,p_roles text[] default null)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_work_access_open(p_org,auth.uid()) and exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_org and m.user_id=auth.uid() and m.active
      and (p_branch is null or m.branch_id is null or m.branch_id=p_branch)
      and (p_roles is null or m.role=any(p_roles))
  );
$$;

create or replace function app_private.has_visualcorp_access(p_org uuid,p_module text,p_action text,p_branch uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_work_access_open(p_org,auth.uid()) and exists (
    select 1 from public.organization_memberships m
    join public.access_profiles p on p.id=coalesce(m.profile_id,(
      select legacy.id from public.access_profiles legacy
      where legacy.organization_id=m.organization_id and legacy.profile_key=m.role limit 1
    )) and p.organization_id=m.organization_id
    left join public.access_profile_permissions permission
      on permission.profile_id=p.id and permission.module_key=p_module
      and permission.action_key=p_action and permission.enabled
    where m.organization_id=p_org and m.user_id=auth.uid() and m.active and p.active
      and (p_branch is null or m.branch_id is null or m.branch_id=p_branch)
      and (m.role='owner' or permission.profile_id is not null
        or (p_action='view' and exists(select 1 from public.access_profile_permissions ep
          where ep.profile_id=p.id and ep.module_key=p_module and ep.action_key='edit' and ep.enabled)))
  );
$$;

create or replace function app_private.has_visualcorp_access_orgwide(p_org uuid,p_module text,p_action text)
returns boolean language sql stable security definer set search_path='' as $$
  select app_private.is_work_access_open(p_org,auth.uid()) and exists (
    select 1 from public.organization_memberships m
    join public.access_profiles p on p.id=coalesce(m.profile_id,(
      select legacy.id from public.access_profiles legacy
      where legacy.organization_id=m.organization_id and legacy.profile_key=m.role limit 1
    )) and p.organization_id=m.organization_id
    left join public.access_profile_permissions permission
      on permission.profile_id=p.id and permission.module_key=p_module
      and permission.action_key=p_action and permission.enabled
    where m.organization_id=p_org and m.user_id=auth.uid() and m.active and m.branch_id is null and p.active
      and (m.role='owner' or permission.profile_id is not null
        or (p_action='view' and exists(select 1 from public.access_profile_permissions ep
          where ep.profile_id=p.id and ep.module_key=p_module and ep.action_key='edit' and ep.enabled)))
  );
$$;

create or replace function public.get_my_visualcorp_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_roles jsonb; v_permissions jsonb; v_open boolean;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar el acceso.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null then return jsonb_build_object('organization_id',null,'roles','[]'::jsonb,'permissions','{}'::jsonb,'work_access_open',false); end if;
  v_open:=app_private.is_work_access_open(v_org,auth.uid());
  if not v_open then
    return jsonb_build_object('organization_id',v_org,'roles','[]'::jsonb,'permissions','{}'::jsonb,
      'work_access_open',false,'work_timezone','America/Guayaquil');
  end if;
  select coalesce(jsonb_agg(distinct jsonb_build_object('key',p.profile_key,'name',p.name,'role',m.role)),'[]'::jsonb)
    into v_roles from public.organization_memberships m
    join public.access_profiles p on p.id=coalesce(m.profile_id,(select legacy.id from public.access_profiles legacy
      where legacy.organization_id=m.organization_id and legacy.profile_key=case m.role
        when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario'
        when 'production' then 'personal_taller' else m.role end limit 1))
    where m.organization_id=v_org and m.user_id=auth.uid() and m.active and p.active;
  select coalesce(jsonb_object_agg(module_key,permissions),'{}'::jsonb) into v_permissions from (
    select permission.module_key,jsonb_object_agg(permission.action_key,permission.enabled) permissions
    from public.organization_memberships m join public.access_profiles p on p.id=coalesce(m.profile_id,
      (select legacy.id from public.access_profiles legacy where legacy.organization_id=m.organization_id
        and legacy.profile_key=case m.role when 'manager' then 'gerencia' when 'advisor' then 'asesoras'
        when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else m.role end limit 1))
    join public.access_profile_permissions permission on permission.profile_id=p.id and permission.enabled
    where m.organization_id=v_org and m.user_id=auth.uid() and m.active and p.active group by permission.module_key
  ) granted;
  if exists(select 1 from public.organization_memberships m where m.organization_id=v_org and m.user_id=auth.uid() and m.active and m.role='owner') then
    select v_permissions || jsonb_build_object('personnel',jsonb_build_object('view',true,'edit',true,'view_compensation',true,'edit_compensation',true)) into v_permissions;
    select v_permissions || coalesce(jsonb_object_agg(module_key,jsonb_build_object('view',true,'edit',true)),'{}'::jsonb)
      into v_permissions from (values ('dashboard'),('website'),('crm'),('sales'),('quotes'),('inventory'),('inventory_costs'),('purchases'),('workshop'),('marketing'),('team'),('catalog_admin'),('backup'),('cash')) modules(module_key);
  end if;
  if app_private.can_manage_team_schedule(v_org) then
    select v_permissions || jsonb_build_object('team_schedule',jsonb_build_object('view',true,'edit',true)) into v_permissions;
  end if;
  return jsonb_build_object('organization_id',v_org,'roles',v_roles,'permissions',v_permissions,
    'work_access_open',true,'work_timezone','America/Guayaquil');
end;
$$;
revoke all on function public.get_my_visualcorp_access() from public,anon;
grant execute on function public.get_my_visualcorp_access() to authenticated;

create or replace function public.list_team_schedule_members()
returns table(user_id uuid,display_name text,profile_names text)
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.can_view_team_schedule(v_org) then
    raise exception 'No tienes permiso para consultar el equipo.' using errcode='42501';
  end if;
  return query
    select m.user_id,coalesce(nullif(trim(p.full_name),''),u.email::text,'Cuenta del equipo'),
      string_agg(distinct ap.name,', ' order by ap.name)
    from public.organization_memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.user_id=m.user_id
    left join public.access_profiles ap on ap.id=m.profile_id and ap.active
    left join public.personnel_account_links l on l.organization_id=m.organization_id and l.user_id=m.user_id
    left join public.personnel_records r on r.organization_id=l.organization_id and r.id=l.personnel_id
    where m.organization_id=v_org and m.active and (l.id is null or r.status='active')
    group by m.user_id,p.full_name,u.email order by lower(coalesce(nullif(trim(p.full_name),''),u.email::text));
end;
$$;
revoke all on function public.list_team_schedule_members() from public,anon;
grant execute on function public.list_team_schedule_members() to authenticated;

-- Keep the profile editor's module allow-list aligned with the new permission.
do $team_schedule_profile_permission_migration$
declare
  v_definition text := pg_catalog.pg_get_functiondef('public.save_visualcorp_access_profile(uuid,text,text,text,jsonb)'::regprocedure);
  v_old_modules text := $old$not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel','finance')$old$;
  v_new_modules text := $new$not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel','finance','team_schedule')$new$;
begin
  if pg_catalog.strpos(v_definition,v_old_modules)=0 then
    raise exception 'La función de perfiles cambió; revisa el validador antes de ampliar Horarios y turnos.';
  end if;
  execute pg_catalog.replace(v_definition,v_old_modules,v_new_modules);
end;
$team_schedule_profile_permission_migration$;

create or replace function public.save_team_area_rotation(
  p_id uuid,p_area_name text,p_task_name text,p_weekday smallint,p_starts_on date,
  p_starts_at time,p_ends_at time,p_member_ids uuid[],p_note text,p_active boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid; v_count int;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.can_manage_team_schedule(v_org) then raise exception 'No tienes permiso para gestionar horarios.' using errcode='42501'; end if;
  if length(trim(coalesce(p_area_name,''))) not between 2 and 100
    or length(trim(coalesce(p_task_name,''))) not between 3 and 120
    or p_weekday is null or p_weekday not between 0 and 6 or p_starts_on is null or p_starts_at is null or p_ends_at is null
    or p_starts_at>=p_ends_at or length(coalesce(p_note,''))>500 then raise exception 'Revisa los datos del turno.'; end if;
  v_count:=coalesce(array_length(p_member_ids,1),0);
  if v_count not between 1 and 30 or (select count(distinct x) from unnest(p_member_ids) x)<>v_count
    or exists(select 1 from unnest(p_member_ids) x where not exists(
      select 1 from public.organization_memberships m where m.organization_id=v_org and m.user_id=x and m.active
        and not exists(select 1 from public.personnel_account_links l
          left join public.personnel_records r on r.organization_id=l.organization_id and r.id=l.personnel_id
          where l.organization_id=m.organization_id and l.user_id=m.user_id and coalesce(r.status,'')<>'active')))
    then raise exception 'Selecciona entre 1 y 30 integrantes activos, sin repetir.'; end if;
  if p_id is null then
    insert into public.team_area_rotations(organization_id,area_name,task_name,weekday,starts_on,starts_at,ends_at,active,note,updated_by)
      values(v_org,trim(p_area_name),trim(p_task_name),p_weekday,p_starts_on,p_starts_at,p_ends_at,coalesce(p_active,true),coalesce(p_note,''),auth.uid()) returning id into v_id;
  else
    update public.team_area_rotations set area_name=trim(p_area_name),task_name=trim(p_task_name),weekday=p_weekday,
      starts_on=p_starts_on,starts_at=p_starts_at,ends_at=p_ends_at,active=coalesce(p_active,true),note=coalesce(p_note,''),updated_by=auth.uid(),updated_at=now()
      where id=p_id and organization_id=v_org returning id into v_id;
    if v_id is null then raise exception 'El turno no existe.'; end if;
    delete from public.team_area_rotation_members where rotation_id=v_id and organization_id=v_org;
  end if;
  insert into public.team_area_rotation_members(rotation_id,organization_id,user_id,position)
    select v_id,v_org,x.user_id,x.ordinality::smallint from unnest(p_member_ids) with ordinality x(user_id,ordinality);
  return v_id;
end;
$$;
revoke all on function public.save_team_area_rotation(uuid,text,text,smallint,date,time,time,uuid[],text,boolean) from public,anon;
grant execute on function public.save_team_area_rotation(uuid,text,text,smallint,date,time,time,uuid[],text,boolean) to authenticated;
