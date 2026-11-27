-- Priority 1: Branch-scoped memberships/permissions, role-escalation guards,
-- org-wide administration enforcement, and real schedule exposure in access RPC.

-- 1. Support branch_id on pending invitations and allow distinct global vs branch scopes.
alter table public.organization_access_invitations
  add column if not exists branch_id uuid;

do $$
begin
  if to_regclass('public.branches') is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.organization_access_invitations'::regclass
      and conname = 'organization_access_invitations_branch_fk'
  ) then
    alter table public.organization_access_invitations
      add constraint organization_access_invitations_branch_fk
      foreign key (branch_id, organization_id)
      references public.branches(id, organization_id)
      on delete restrict;
  end if;
end;
$$;

drop index if exists public.organization_access_invitations_pending_uq;
create unique index if not exists organization_access_invitations_pending_global_uq
  on public.organization_access_invitations (organization_id, normalized_email, profile_id)
  where status = 'pending' and branch_id is null;
create unique index if not exists organization_access_invitations_pending_branch_uq
  on public.organization_access_invitations (organization_id, normalized_email, profile_id, branch_id)
  where status = 'pending' and branch_id is not null;

-- Keep audit constraint aligned with all access control and branch assignment events.
alter table public.access_audit_log
  drop constraint if exists access_audit_log_event_key_check;
alter table public.access_audit_log
  add constraint access_audit_log_event_key_check
  check (event_key in (
    'profile_created','profile_updated','profile_activated','profile_deactivated',
    'profile_assigned','membership_activated','membership_deactivated',
    'membership_branch_assigned',
    'user_access_blocked','user_access_reactivated','user_access_removed',
    'profile_invited','profile_invitation_accepted','profile_invitation_revoked',
    'access_request_approved','access_request_dismissed'
  ));

-- 2. Enforce branch_id isolation on finance_expenses and finance_expense_payments.
drop policy if exists finance_expenses_access_select on public.finance_expenses;
create policy finance_expenses_access_select
  on public.finance_expenses
  for select to authenticated
  using (
    (
      branch_id is null
      and app_private.has_visualcorp_access_orgwide(organization_id, 'finance', 'view')
    )
    or (
      branch_id is not null
      and app_private.has_visualcorp_access(organization_id, 'finance', 'view', branch_id)
    )
  );

drop policy if exists finance_expense_payments_access_select on public.finance_expense_payments;
create policy finance_expense_payments_access_select
  on public.finance_expense_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.finance_expenses e
      where e.id = finance_expense_payments.expense_id
        and e.organization_id = finance_expense_payments.organization_id
        and (
          (
            e.branch_id is null
            and app_private.has_visualcorp_access_orgwide(e.organization_id, 'finance', 'view')
          )
          or (
            e.branch_id is not null
            and app_private.has_visualcorp_access(e.organization_id, 'finance', 'view', e.branch_id)
          )
        )
    )
  );

-- 3. Harden save_visualcorp_access_profile with explicit p_base_role, ceiling & orgwide guards.
drop function if exists public.save_visualcorp_access_profile(uuid, text, text, text, jsonb);
create or replace function public.save_visualcorp_access_profile(
  p_profile_id uuid,
  p_key text,
  p_name text,
  p_description text,
  p_permissions jsonb,
  p_base_role text default 'advisor'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_profile public.access_profiles%rowtype;
  v_key text;
  v_base_role text;
  v_item jsonb;
  v_module text;
  v_action text;
  v_enabled boolean;
  v_owner boolean;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para configurar perfiles.' using errcode = '42501';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    raise exception 'No se encontró la organización.' using errcode = 'P0002';
  end if;

  v_owner := exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = v_org
      and om.user_id = v_actor
      and om.active
      and om.branch_id is null
      and om.role = 'owner'
  );

  if not v_owner and not app_private.has_visualcorp_access_orgwide(v_org, 'team', 'manage_profiles') then
    raise exception 'No tienes permiso para configurar perfiles en toda la organización.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_permissions) <> 'array' then
    raise exception 'La matriz de permisos no tiene un formato válido.';
  end if;

  v_base_role := lower(trim(coalesce(nullif(trim(p_base_role), ''), 'advisor')));
  if v_base_role not in ('owner','admin','manager','advisor','warehouse','production','marketing','website_admin') then
    raise exception 'El rol base del perfil no es válido.' using errcode = '22023';
  end if;

  if not v_owner and v_base_role in ('owner','admin','website_admin') then
    raise exception 'Solo el propietario puede configurar perfiles con rol base owner, admin o website_admin.' using errcode = '42501';
  end if;

  v_key := coalesce(nullif(trim(p_key), ''), trim(both '_' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '_', 'g')));
  if v_key !~ '^[a-z0-9_]{2,48}$' or length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'El nombre o identificador del perfil no es válido.';
  end if;

  if p_profile_id is not null then
    select * into v_profile
    from public.access_profiles
    where id = p_profile_id and organization_id = v_org
    for update;

    if not found or v_profile.profile_key = 'owner' or v_profile.base_role = 'owner' then
      raise exception 'El perfil de propietario está reservado.' using errcode = '42501';
    end if;
    if v_profile.profile_key <> v_key then
      raise exception 'El identificador de un perfil existente no se puede cambiar.';
    end if;
    if not v_owner and v_profile.base_role in ('owner','admin','website_admin') then
      raise exception 'Solo el propietario puede modificar perfiles administrativos.' using errcode = '42501';
    end if;
  end if;

  if not v_owner then
    if not exists (
      select 1
      from public.organization_memberships actor_membership
      join public.access_profiles actor_profile
        on actor_profile.id = coalesce(actor_membership.profile_id, (
          select legacy.id
          from public.access_profiles legacy
          where legacy.organization_id = actor_membership.organization_id
            and legacy.profile_key = case actor_membership.role
              when 'manager' then 'gerencia'
              when 'advisor' then 'asesoras'
              when 'warehouse' then 'inventario'
              when 'production' then 'personal_taller'
              else actor_membership.role
            end
          limit 1
        ))
        and actor_profile.organization_id = actor_membership.organization_id
      where actor_membership.organization_id = v_org
        and actor_membership.user_id = v_actor
        and actor_membership.active
        and actor_membership.branch_id is null
        and actor_profile.active
        and (
          actor_membership.role = v_base_role
          or (
            actor_membership.role = 'admin'
            and v_base_role in ('manager','advisor','warehouse','production','marketing')
          )
          or (
            actor_membership.role = 'manager'
            and v_base_role in ('advisor','warehouse','production','marketing')
          )
        )
        and (
          p_profile_id is null
          or actor_membership.role = v_profile.base_role
          or (
            actor_membership.role = 'admin'
            and v_profile.base_role in ('manager','advisor','warehouse','production','marketing')
          )
          or (
            actor_membership.role = 'manager'
            and v_profile.base_role in ('advisor','warehouse','production','marketing')
          )
        )
    ) then
      raise exception 'No puedes configurar un perfil con un rol base superior al tuyo.' using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_permissions) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'module_key', '') not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel','finance','team_schedule')
      or coalesce(item->>'action_key', '') not in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash','view_compensation','edit_compensation','manage_finance','approve_content','manage_suggestions')
      or jsonb_typeof(item->'enabled') <> 'boolean'
  ) then
    raise exception 'La matriz contiene un permiso no reconocido.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
    where action_key in ('view_compensation','edit_compensation') and module_key <> 'personnel'
  ) then
    raise exception 'Los permisos de remuneración pertenecen al módulo Personal.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_permissions) as permission(module_key text, action_key text, enabled boolean)
    where permission.module_key = 'team' and permission.action_key = 'manage_suggestions' and permission.enabled
  ) and not exists (
    select 1 from jsonb_to_recordset(p_permissions) as permission(module_key text, action_key text, enabled boolean)
    where permission.module_key = 'team' and permission.action_key = 'view' and permission.enabled
  ) then
    raise exception 'Gestionar sugerencias requiere acceso de lectura a Equipo.';
  end if;

  if exists (
    select module_key, action_key
    from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
    group by module_key, action_key
    having count(*) > 1
  ) then
    raise exception 'No repitas permisos en la matriz.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
    where action_key = 'manage_owner' and enabled
  ) then
    raise exception 'La propiedad no se puede asignar desde la matriz.' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
    where enabled and module_key = 'personnel' and action_key in ('view_compensation','edit_compensation')
      and not exists (
        select 1 from jsonb_to_recordset(p_permissions) as base(module_key text, action_key text, enabled boolean)
        where base.module_key = 'personnel' and base.action_key = 'view' and base.enabled
      )
  ) then
    raise exception 'Ver remuneraciones requiere acceso de lectura al módulo Personal.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
    where enabled and module_key = 'personnel' and action_key = 'edit_compensation'
      and not exists (
        select 1 from jsonb_to_recordset(p_permissions) as base(module_key text, action_key text, enabled boolean)
        where base.module_key = 'personnel' and base.action_key = 'edit' and base.enabled
      )
  ) then
    raise exception 'Editar remuneraciones requiere permiso para editar fichas de Personal.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
    where enabled and module_key = 'personnel' and action_key = 'edit_compensation'
      and not exists (
        select 1 from jsonb_to_recordset(p_permissions) as base(module_key text, action_key text, enabled boolean)
        where base.module_key = 'personnel' and base.action_key = 'view_compensation' and base.enabled
      )
  ) then
    raise exception 'Editar remuneraciones requiere también permiso para consultarlas.';
  end if;

  for v_item in select value from jsonb_array_elements(p_permissions)
  loop
    v_module := v_item->>'module_key';
    v_action := v_item->>'action_key';
    v_enabled := (v_item->>'enabled')::boolean;
    if v_enabled and not v_owner and not app_private.has_visualcorp_access_orgwide(v_org, v_module, v_action) then
      raise exception 'No puedes conceder el permiso %.%.', v_module, v_action using errcode = '42501';
    end if;
    if v_action = 'edit' and v_enabled and not coalesce((
      select x.enabled from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean)
      where x.module_key = v_module and x.action_key = 'view'
    ), false) then
      raise exception 'Editar requiere también permiso para ver el módulo %.', v_module;
    end if;
  end loop;

  if p_profile_id is not null then
    update public.access_profiles
    set name = trim(p_name),
        description = coalesce(p_description, ''),
        base_role = case when v_profile.is_system then v_profile.base_role else v_base_role end,
        updated_at = now()
    where id = p_profile_id
    returning * into v_profile;

    if not v_profile.is_system then
      update public.organization_memberships
      set role = v_profile.base_role
      where organization_id = v_org
        and profile_id = v_profile.id
        and role is distinct from v_profile.base_role;
    end if;
  else
    if v_key in ('owner','admin','website_admin') then
      raise exception 'Ese identificador está reservado.' using errcode = '42501';
    end if;
    if not v_owner and v_key in ('gerencia','coordinador_ventas') then
      raise exception 'Solo el propietario puede crear perfiles con base de coordinación administrativa.' using errcode = '42501';
    end if;
    insert into public.access_profiles (organization_id, profile_key, name, description, base_role, is_system, created_by)
    values (v_org, v_key, trim(p_name), coalesce(p_description, ''), v_base_role, false, v_actor)
    returning * into v_profile;
  end if;

  delete from public.access_profile_permissions where profile_id = v_profile.id;
  insert into public.access_profile_permissions (profile_id, module_key, action_key, enabled)
  select v_profile.id, x.module_key, x.action_key, x.enabled
  from jsonb_to_recordset(p_permissions) as x(module_key text, action_key text, enabled boolean);

  insert into public.access_audit_log (organization_id, actor_user_id, profile_id, event_key, details)
  values (
    v_org,
    v_actor,
    v_profile.id,
    case when p_profile_id is null then 'profile_created' else 'profile_updated' end,
    jsonb_build_object('profile_key', v_profile.profile_key, 'name', trim(p_name), 'base_role', v_profile.base_role)
  );

  return v_profile.id;
end;
$$;

revoke all on function public.save_visualcorp_access_profile(uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.save_visualcorp_access_profile(uuid, text, text, text, jsonb, text) to authenticated;

-- 4. Update get_my_visualcorp_access() with finance for owner, branch_scopes, and real schedule info.
create or replace function public.get_my_visualcorp_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid := auth.uid();
  v_roles jsonb;
  v_permissions jsonb;
  v_owner_permissions jsonb := '{}'::jsonb;
  v_branch_scopes jsonb := '[]'::jsonb;
  v_open boolean;
  v_work_hours jsonb := '[]'::jsonb;
  v_work_exception jsonb := null;
  v_local timestamp;
begin
  if v_user is null then
    raise exception 'Inicia sesión para consultar el acceso.' using errcode = '42501';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    return jsonb_build_object(
      'organization_id', null,
      'roles', '[]'::jsonb,
      'permissions', '{}'::jsonb,
      'branch_scopes', '[]'::jsonb,
      'work_access_open', false,
      'work_hours', '[]'::jsonb,
      'work_exception', null
    );
  end if;

  if to_regclass('public.team_work_hours') is not null then
    execute $q$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'weekday', h.weekday,
          'is_open', h.is_open,
          'opens_at', to_char(h.opens_at, 'HH24:MI'),
          'closes_at', to_char(h.closes_at, 'HH24:MI')
        ) order by h.weekday
      ), '[]'::jsonb)
      from public.team_work_hours h
      where h.organization_id = $1
    $q$ into v_work_hours using v_org;
  end if;

  if to_regclass('public.team_work_exceptions') is not null then
    v_local := now() at time zone 'America/Guayaquil';
    execute $q$
      select jsonb_build_object(
        'work_date', e.work_date::text,
        'kind', e.kind,
        'opens_at', to_char(e.opens_at, 'HH24:MI'),
        'closes_at', to_char(e.closes_at, 'HH24:MI'),
        'note', e.note,
        'personal', (e.user_id is not null)
      )
      from public.team_work_exceptions e
      where e.organization_id = $1
        and e.work_date = $2::date
        and (e.user_id = $3 or e.user_id is null)
      order by (e.user_id is not null) desc
      limit 1
    $q$ into v_work_exception using v_org, v_local::date, v_user;
  end if;

  v_open := app_private.is_work_access_open(v_org, v_user);
  if not v_open then
    return jsonb_build_object(
      'organization_id', v_org,
      'roles', '[]'::jsonb,
      'permissions', '{}'::jsonb,
      'branch_scopes', '[]'::jsonb,
      'work_access_open', false,
      'work_timezone', 'America/Guayaquil',
      'work_hours', coalesce(v_work_hours, '[]'::jsonb),
      'work_exception', v_work_exception
    );
  end if;

  select coalesce(jsonb_agg(distinct jsonb_build_object('key', p.profile_key, 'name', p.name, 'role', m.role)), '[]'::jsonb)
  into v_roles
  from public.organization_memberships m
  join public.access_profiles p on p.id = coalesce(m.profile_id, (
    select legacy.id
    from public.access_profiles legacy
    where legacy.organization_id = m.organization_id
      and legacy.profile_key = case m.role
        when 'manager' then 'gerencia'
        when 'advisor' then 'asesoras'
        when 'warehouse' then 'inventario'
        when 'production' then 'personal_taller'
        else m.role
      end
    limit 1
  )) and p.organization_id = m.organization_id
  where m.organization_id = v_org and m.user_id = v_user and m.active and p.active;

  select coalesce(jsonb_object_agg(module_key, permissions), '{}'::jsonb)
  into v_permissions
  from (
    select permission.module_key, jsonb_object_agg(permission.action_key, permission.enabled) as permissions
    from public.organization_memberships m
    join public.access_profiles p on p.id = coalesce(m.profile_id, (
      select legacy.id
      from public.access_profiles legacy
      where legacy.organization_id = m.organization_id
        and legacy.profile_key = case m.role
          when 'manager' then 'gerencia'
          when 'advisor' then 'asesoras'
          when 'warehouse' then 'inventario'
          when 'production' then 'personal_taller'
          else m.role
        end
      limit 1
    )) and p.organization_id = m.organization_id
    join public.access_profile_permissions permission on permission.profile_id = p.id and permission.enabled
    where m.organization_id = v_org and m.user_id = v_user and m.active and p.active
    group by permission.module_key
  ) granted;

  select coalesce(jsonb_object_agg(module_key, jsonb_build_object('view', true, 'edit', true)), '{}'::jsonb)
  into v_owner_permissions
  from (values
    ('dashboard'),('website'),('crm'),('sales'),('quotes'),
    ('inventory'),('inventory_costs'),('purchases'),('workshop'),('marketing'),
    ('team'),('catalog_admin'),('backup'),('cash'),('finance')
  ) modules(module_key);

  v_owner_permissions := v_owner_permissions || jsonb_build_object(
    'personnel', jsonb_build_object('view', true, 'edit', true, 'view_compensation', true, 'edit_compensation', true),
    'finance', jsonb_build_object('view', true, 'edit', true, 'manage_finance', true),
    'team', jsonb_build_object('view', true, 'edit', true, 'manage_members', true, 'manage_profiles', true, 'manage_suggestions', true),
    'team_schedule', jsonb_build_object('view', true, 'edit', true)
  );

  if exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org and m.user_id = v_user and m.active and m.role = 'owner'
  ) then
    v_permissions := v_permissions || v_owner_permissions;
  end if;

  if exists (
    select 1
    from public.organization_memberships m
    left join public.access_profiles p on p.id = m.profile_id and p.organization_id = m.organization_id
    where m.organization_id = v_org
      and m.user_id = v_user
      and m.active
      and coalesce(p.active, true)
      and (m.role in ('owner','admin') or p.profile_key in ('owner','admin','encargado_local'))
  ) or coalesce((v_permissions->'team_schedule'->>'edit')::boolean, false) then
    v_permissions := v_permissions || jsonb_build_object('team_schedule', jsonb_build_object('view', true, 'edit', true));
  end if;

  select coalesce(
    jsonb_agg(
      scope_row
      order by (scope_row->>'branch_id' is not null), scope_row->>'branch_name', scope_row->>'profile_key'
    ),
    '[]'::jsonb
  )
  into v_branch_scopes
  from (
    select jsonb_build_object(
      'branch_id', m.branch_id,
      'branch_name', b.name,
      'branch_code', b.code,
      'role', m.role,
      'profile_key', p.profile_key,
      'permissions', case
        when m.role = 'owner' then v_owner_permissions
        else coalesce((
          select jsonb_object_agg(mod_perms.module_key, mod_perms.actions)
          from (
            select perm.module_key, jsonb_object_agg(perm.action_key, perm.enabled) as actions
            from public.access_profile_permissions perm
            where perm.profile_id = p.id and perm.enabled
            group by perm.module_key
          ) mod_perms
        ), '{}'::jsonb) || case
          when m.role = 'admin' or p.profile_key in ('admin', 'encargado_local')
            then jsonb_build_object('team_schedule', jsonb_build_object('view', true, 'edit', true))
          else '{}'::jsonb
        end
      end
    ) as scope_row
    from public.organization_memberships m
    join public.access_profiles p on p.id = coalesce(m.profile_id, (
      select legacy.id
      from public.access_profiles legacy
      where legacy.organization_id = m.organization_id
        and legacy.profile_key = case m.role
          when 'manager' then 'gerencia'
          when 'advisor' then 'asesoras'
          when 'warehouse' then 'inventario'
          when 'production' then 'personal_taller'
          else m.role
        end
      limit 1
    )) and p.organization_id = m.organization_id
    left join public.branches b on b.id = m.branch_id and b.organization_id = m.organization_id
    where m.organization_id = v_org and m.user_id = v_user and m.active and p.active
  ) scopes;

  return jsonb_build_object(
    'organization_id', v_org,
    'roles', v_roles,
    'permissions', v_permissions,
    'branch_scopes', coalesce(v_branch_scopes, '[]'::jsonb),
    'work_access_open', true,
    'work_timezone', 'America/Guayaquil',
    'work_hours', coalesce(v_work_hours, '[]'::jsonb),
    'work_exception', v_work_exception
  );
end;
$$;

revoke all on function public.get_my_visualcorp_access() from public, anon;
grant execute on function public.get_my_visualcorp_access() to authenticated;

-- 5. Branch-aware invitations, claims, and access request approvals.
drop function if exists app_private.create_organization_access_invitation(uuid, text, uuid);
drop function if exists public.create_organization_access_invitation(uuid, text, uuid);

create or replace function app_private.create_organization_access_invitation(
  p_organization_id uuid,
  p_email text,
  p_profile_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_actor_email text;
  v_owner boolean;
  v_profile public.access_profiles%rowtype;
  v_user uuid;
  v_confirmed boolean := false;
  v_invitation public.organization_access_invitations%rowtype;
  v_pending record;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501';
  end if;
  if v_email is null or length(v_email) not between 3 and 320
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido.' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.active
  ) then
    raise exception 'La sucursal seleccionada no pertenece a la organización o no está activa.' using errcode = '22023';
  end if;

  select lower(trim(u.email)) into v_actor_email
  from auth.users u
  where u.id = v_actor;
  if v_actor_email is not null and v_email = v_actor_email then
    raise exception 'No puedes asignarte un perfil a tu propia cuenta.' using errcode = '42501';
  end if;

  v_owner := exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = v_actor
      and om.active
      and om.branch_id is null
      and om.role = 'owner'
  ) and app_private.has_org_role(p_organization_id, null, array['owner']);

  if not v_owner then
    if p_branch_id is null then
      if not app_private.has_visualcorp_access_orgwide(p_organization_id, 'team', 'manage_members') then
        raise exception 'No tienes permiso para asignar perfiles en toda la organización.' using errcode = '42501';
      end if;
    else
      if not app_private.has_visualcorp_access(p_organization_id, 'team', 'manage_members', p_branch_id) then
        raise exception 'No tienes permiso para asignar perfiles en la sucursal seleccionada.' using errcode = '42501';
      end if;
    end if;
  end if;

  select * into v_profile
  from public.access_profiles
  where id = p_profile_id
    and organization_id = p_organization_id
    and active
  for share;

  if not found or v_profile.profile_key = 'owner' or v_profile.base_role = 'owner' then
    raise exception 'El perfil no existe o no se puede asignar.' using errcode = '42501';
  end if;

  if not v_owner then
    if v_profile.base_role in ('admin', 'website_admin') then
      raise exception 'Solo el propietario puede asignar perfiles administrativos.' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.organization_memberships actor_membership
      join public.access_profiles actor_profile
        on actor_profile.id = coalesce(actor_membership.profile_id, (
          select legacy.id
          from public.access_profiles legacy
          where legacy.organization_id = actor_membership.organization_id
            and legacy.profile_key = case actor_membership.role
              when 'manager' then 'gerencia'
              when 'advisor' then 'asesoras'
              when 'warehouse' then 'inventario'
              when 'production' then 'personal_taller'
              else actor_membership.role
            end
          limit 1
        ))
        and actor_profile.organization_id = actor_membership.organization_id
      where actor_membership.organization_id = p_organization_id
        and actor_membership.user_id = v_actor
        and actor_membership.active
        and actor_profile.active
        and (
          (p_branch_id is null and actor_membership.branch_id is null)
          or (p_branch_id is not null and (actor_membership.branch_id is null or actor_membership.branch_id = p_branch_id))
        )
        and (
          actor_membership.role = v_profile.base_role
          or (
            actor_membership.role = 'admin'
            and v_profile.base_role in ('manager', 'advisor', 'warehouse', 'production', 'marketing')
          )
          or (
            actor_membership.role = 'manager'
            and v_profile.base_role in ('advisor', 'warehouse', 'production', 'marketing')
          )
        )
    ) then
      raise exception 'No puedes asignar un perfil con un rol base superior al tuyo.' using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.access_profile_permissions target_permission
      where target_permission.profile_id = v_profile.id
        and target_permission.enabled
        and (
          (
            p_branch_id is null
            and not app_private.has_visualcorp_access_orgwide(
              p_organization_id,
              target_permission.module_key,
              target_permission.action_key
            )
          )
          or (
            p_branch_id is not null
            and not app_private.has_visualcorp_access(
              p_organization_id,
              target_permission.module_key,
              target_permission.action_key,
              p_branch_id
            )
          )
        )
    ) then
      raise exception 'No puedes delegar permisos que tu perfil no tiene en el alcance seleccionado.' using errcode = '42501';
    end if;
  end if;

  select u.id, u.email_confirmed_at is not null
  into v_user, v_confirmed
  from auth.users u
  where lower(trim(u.email)) = v_email
  order by u.created_at
  limit 1;

  if v_user = v_actor then
    raise exception 'No puedes asignarte un perfil a tu propia cuenta.' using errcode = '42501';
  end if;

  if v_user is not null and v_confirmed then
    if p_branch_id is null then
      insert into public.organization_memberships(organization_id, user_id, role, active, profile_id, branch_id)
      values (p_organization_id, v_user, v_profile.base_role, true, v_profile.id, null)
      on conflict (organization_id, user_id, profile_id) where branch_id is null and profile_id is not null
      do update set role = excluded.role, active = true;
    else
      insert into public.organization_memberships(organization_id, user_id, role, active, profile_id, branch_id)
      values (p_organization_id, v_user, v_profile.base_role, true, v_profile.id, p_branch_id)
      on conflict (organization_id, user_id, profile_id, branch_id) where branch_id is not null and profile_id is not null
      do update set role = excluded.role, active = true;
    end if;

    for v_pending in
      update public.organization_access_invitations
      set status = 'revoked'
      where organization_id = p_organization_id
        and normalized_email = v_email
        and profile_id = v_profile.id
        and branch_id is not distinct from p_branch_id
        and status = 'pending'
      returning id
    loop
      insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, profile_id, event_key, details)
      values (
        p_organization_id, v_actor, v_user, v_profile.id, 'profile_invitation_revoked',
        jsonb_build_object('invitation_id', v_pending.id, 'reason', 'access_assigned', 'branch_id', p_branch_id)
      );
    end loop;

    insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, profile_id, event_key, details)
    values (
      p_organization_id, v_actor, v_user, v_profile.id, 'profile_assigned',
      jsonb_build_object('profile_key', v_profile.profile_key, 'branch_id', p_branch_id)
    );

    return jsonb_build_object('status', 'assigned', 'email', v_email, 'profile_id', v_profile.id, 'branch_id', p_branch_id);
  end if;

  if p_branch_id is null then
    insert into public.organization_access_invitations(organization_id, profile_id, branch_id, invited_email, invited_by, expires_at)
    values (p_organization_id, v_profile.id, null, v_email, v_actor, now() + interval '7 days')
    on conflict (organization_id, normalized_email, profile_id) where status = 'pending' and branch_id is null
    do update set invited_email = excluded.invited_email, invited_by = excluded.invited_by,
                  created_at = now(), expires_at = excluded.expires_at
    returning * into v_invitation;
  else
    insert into public.organization_access_invitations(organization_id, profile_id, branch_id, invited_email, invited_by, expires_at)
    values (p_organization_id, v_profile.id, p_branch_id, v_email, v_actor, now() + interval '7 days')
    on conflict (organization_id, normalized_email, profile_id, branch_id) where status = 'pending' and branch_id is not null
    do update set invited_email = excluded.invited_email, invited_by = excluded.invited_by,
                  created_at = now(), expires_at = excluded.expires_at
    returning * into v_invitation;
  end if;

  insert into public.access_audit_log(organization_id, actor_user_id, profile_id, event_key, details)
  values (
    p_organization_id, v_actor, v_profile.id, 'profile_invited',
    jsonb_build_object('invitation_id', v_invitation.id, 'email', v_email, 'profile_key', v_profile.profile_key, 'branch_id', p_branch_id)
  );

  return jsonb_build_object(
    'status', 'pending',
    'email', v_email,
    'profile_id', v_profile.id,
    'branch_id', p_branch_id,
    'invitation_id', v_invitation.id,
    'expires_at', v_invitation.expires_at
  );
end;
$$;

create or replace function public.create_organization_access_invitation(
  p_organization_id uuid,
  p_email text,
  p_profile_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_organization_access_invitation(p_organization_id, p_email, p_profile_id, p_branch_id);
$$;

revoke all on function app_private.create_organization_access_invitation(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.create_organization_access_invitation(uuid, text, uuid, uuid) from public, anon;
grant execute on function app_private.create_organization_access_invitation(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.create_organization_access_invitation(uuid, text, uuid, uuid) to authenticated;

drop function if exists app_private.list_organization_access_invitations(uuid);
drop function if exists public.list_organization_access_invitations(uuid);

create or replace function app_private.list_organization_access_invitations(p_organization_id uuid)
returns table(
  id uuid,
  invited_email text,
  profile_id uuid,
  profile_name text,
  branch_id uuid,
  branch_name text,
  branch_code text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_orgwide boolean;
begin
  if auth.uid() is null or (
    not app_private.has_org_role(p_organization_id, null, array['owner'])
    and not app_private.has_visualcorp_access(p_organization_id, 'team', 'manage_members')
  ) then
    raise exception 'No tienes permiso para consultar las invitaciones.' using errcode = '42501';
  end if;

  v_orgwide := app_private.has_org_role(p_organization_id, null, array['owner'])
    or app_private.has_visualcorp_access_orgwide(p_organization_id, 'team', 'manage_members');

  return query
    select i.id, i.invited_email, i.profile_id, p.name, i.branch_id, b.name, b.code, i.created_at, i.expires_at
    from public.organization_access_invitations i
    join public.access_profiles p on p.id = i.profile_id and p.organization_id = i.organization_id
    left join public.branches b on b.id = i.branch_id and b.organization_id = i.organization_id
    where i.organization_id = p_organization_id
      and i.status = 'pending'
      and i.expires_at > now()
      and (
        v_orgwide
        or (i.branch_id is not null and app_private.has_visualcorp_access(p_organization_id, 'team', 'manage_members', i.branch_id))
      )
    order by i.created_at desc;
end;
$$;

create or replace function public.list_organization_access_invitations(p_organization_id uuid)
returns table(
  id uuid,
  invited_email text,
  profile_id uuid,
  profile_name text,
  branch_id uuid,
  branch_name text,
  branch_code text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app_private.list_organization_access_invitations(p_organization_id);
$$;

revoke all on function app_private.list_organization_access_invitations(uuid) from public, anon;
revoke all on function public.list_organization_access_invitations(uuid) from public, anon;
grant execute on function app_private.list_organization_access_invitations(uuid) to authenticated;
grant execute on function public.list_organization_access_invitations(uuid) to authenticated;

create or replace function app_private.revoke_organization_access_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.organization_access_invitations%rowtype;
  v_owner boolean;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501';
  end if;
  select * into v_invitation
  from public.organization_access_invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'La invitación ya no está disponible.';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_invitation.organization_id
      and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_invitation.organization_id, null, array['owner']);

  if not v_owner then
    if v_invitation.branch_id is null then
      if not app_private.has_visualcorp_access_orgwide(v_invitation.organization_id, 'team', 'manage_members') then
        raise exception 'No tienes permiso para cancelar esta invitación global.' using errcode = '42501';
      end if;
    else
      if not app_private.has_visualcorp_access(v_invitation.organization_id, 'team', 'manage_members', v_invitation.branch_id) then
        raise exception 'No tienes permiso para cancelar esta invitación.' using errcode = '42501';
      end if;
    end if;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'La invitación ya fue procesada.';
  end if;

  update public.organization_access_invitations set status = 'revoked' where id = p_invitation_id;
  insert into public.access_audit_log(organization_id, actor_user_id, profile_id, event_key, details)
  values (
    v_invitation.organization_id, v_actor, v_invitation.profile_id, 'profile_invitation_revoked',
    jsonb_build_object('invitation_id', v_invitation.id, 'email', v_invitation.invited_email, 'branch_id', v_invitation.branch_id)
  );
end;
$$;

create or replace function app_private.claim_organization_access_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_count integer := 0;
  v_authorized boolean;
  v_revoke_reason text;
  v_invitation record;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para aceptar invitaciones.' using errcode = '42501';
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_actor and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for v_invitation in
    select i.id, i.organization_id, i.profile_id, i.branch_id, i.invited_by, i.invited_email,
      p.base_role, p.profile_key, p.active as profile_active
    from public.organization_access_invitations i
    join public.access_profiles p
      on p.id = i.profile_id and p.organization_id = i.organization_id
    where i.normalized_email = v_email
      and i.status = 'pending'
      and i.expires_at > now()
    for update of i
  loop
    v_revoke_reason := null;

    if not v_invitation.profile_active
      or v_invitation.profile_key = 'owner'
      or v_invitation.base_role = 'owner' then
      v_revoke_reason := 'target_profile_unavailable';
    elsif v_invitation.branch_id is not null and not exists (
      select 1 from public.branches b
      where b.id = v_invitation.branch_id
        and b.organization_id = v_invitation.organization_id
        and b.active
    ) then
      v_revoke_reason := 'target_branch_unavailable';
    else
      select
        exists (
          select 1
          from public.organization_memberships owner_membership
          where owner_membership.organization_id = v_invitation.organization_id
            and owner_membership.user_id = v_invitation.invited_by
            and owner_membership.active
            and owner_membership.branch_id is null
            and owner_membership.role = 'owner'
        )
        or exists (
          select 1
          from public.organization_memberships inviter_membership
          join public.access_profiles inviter_profile
            on inviter_profile.id = coalesce(inviter_membership.profile_id, (
              select legacy.id
              from public.access_profiles legacy
              where legacy.organization_id = inviter_membership.organization_id
                and legacy.profile_key = case inviter_membership.role
                  when 'manager' then 'gerencia'
                  when 'advisor' then 'asesoras'
                  when 'warehouse' then 'inventario'
                  when 'production' then 'personal_taller'
                  else inviter_membership.role
                end
              limit 1
            ))
            and inviter_profile.organization_id = inviter_membership.organization_id
          where inviter_membership.organization_id = v_invitation.organization_id
            and inviter_membership.user_id = v_invitation.invited_by
            and inviter_membership.active
            and (
              (v_invitation.branch_id is null and inviter_membership.branch_id is null)
              or (v_invitation.branch_id is not null and (inviter_membership.branch_id is null or inviter_membership.branch_id = v_invitation.branch_id))
            )
            and inviter_profile.active
            and v_invitation.base_role not in ('owner', 'admin', 'website_admin')
            and exists (
              select 1
              from public.access_profile_permissions manage_permission
              where manage_permission.profile_id = inviter_profile.id
                and manage_permission.module_key = 'team'
                and manage_permission.action_key = 'manage_members'
                and manage_permission.enabled
            )
            and (
              inviter_membership.role = v_invitation.base_role
              or (
                inviter_membership.role = 'admin'
                and v_invitation.base_role in ('manager', 'advisor', 'warehouse', 'production', 'marketing')
              )
              or (
                inviter_membership.role = 'manager'
                and v_invitation.base_role in ('advisor', 'warehouse', 'production', 'marketing')
              )
            )
            and not exists (
              select 1
              from public.access_profile_permissions target_permission
              where target_permission.profile_id = v_invitation.profile_id
                and target_permission.enabled
                and not exists (
                  select 1
                  from public.access_profile_permissions inviter_permission
                  where inviter_permission.profile_id = inviter_profile.id
                    and inviter_permission.module_key = target_permission.module_key
                    and inviter_permission.enabled
                    and (
                      inviter_permission.action_key = target_permission.action_key
                      or (
                        target_permission.action_key = 'view'
                        and inviter_permission.action_key = 'edit'
                      )
                    )
                )
            )
        )
      into v_authorized;

      if not v_authorized then
        v_revoke_reason := 'inviter_authority_or_permissions_changed';
      end if;
    end if;

    if v_revoke_reason is not null then
      update public.organization_access_invitations
      set status = 'revoked'
      where id = v_invitation.id;

      insert into public.access_audit_log(
        organization_id, actor_user_id, target_user_id, profile_id, event_key, details
      ) values (
        v_invitation.organization_id, v_actor, v_actor, v_invitation.profile_id,
        'profile_invitation_revoked',
        jsonb_build_object(
          'invitation_id', v_invitation.id,
          'email', v_invitation.invited_email,
          'invited_by', v_invitation.invited_by,
          'branch_id', v_invitation.branch_id,
          'reason', v_revoke_reason
        )
      );
      continue;
    end if;

    if v_invitation.branch_id is null then
      insert into public.organization_memberships(organization_id, user_id, role, active, profile_id, branch_id)
      values (v_invitation.organization_id, v_actor, v_invitation.base_role, true, v_invitation.profile_id, null)
      on conflict (organization_id, user_id, profile_id) where branch_id is null and profile_id is not null
      do update set role = excluded.role, active = true;
    else
      insert into public.organization_memberships(organization_id, user_id, role, active, profile_id, branch_id)
      values (v_invitation.organization_id, v_actor, v_invitation.base_role, true, v_invitation.profile_id, v_invitation.branch_id)
      on conflict (organization_id, user_id, profile_id, branch_id) where branch_id is not null and profile_id is not null
      do update set role = excluded.role, active = true;
    end if;

    update public.organization_access_invitations
      set status = 'accepted', accepted_by = v_actor, accepted_at = now()
      where id = v_invitation.id;
    insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, profile_id, event_key, details)
    values (
      v_invitation.organization_id, v_actor, v_actor, v_invitation.profile_id, 'profile_invitation_accepted',
      jsonb_build_object('invitation_id', v_invitation.id, 'profile_key', v_invitation.profile_key, 'branch_id', v_invitation.branch_id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 6. Harden org-wide access request queue & membership/profile lifecycle RPCs.
create or replace function app_private.list_organization_access_requests(p_organization_id uuid)
returns table(id uuid, user_id uuid, email text, full_name text, avatar_url text,
              requested_at timestamptz, last_seen_at timestamptz, request_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'No tienes permiso para consultar las solicitudes de acceso.' using errcode = '42501';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid() and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(p_organization_id, null, array['owner']);

  if not v_owner and not app_private.has_visualcorp_access_orgwide(p_organization_id, 'team', 'manage_members') then
    raise exception 'No tienes permiso para consultar las solicitudes de acceso.' using errcode = '42501';
  end if;

  return query
  select r.id, r.user_id, r.email, r.full_name, r.avatar_url, r.requested_at, r.last_seen_at, r.request_count
  from public.organization_access_requests r
  where r.organization_id = p_organization_id and r.status = 'pending'
  order by r.last_seen_at desc;
end;
$$;

drop function if exists app_private.approve_organization_access_request(uuid, uuid);
drop function if exists public.approve_organization_access_request(uuid, uuid);

create or replace function app_private.approve_organization_access_request(
  p_request_id uuid,
  p_profile_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.organization_access_requests%rowtype;
  v_profile public.access_profiles%rowtype;
  v_owner boolean;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501';
  end if;
  select * into v_req from public.organization_access_requests where id = p_request_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = v_req.organization_id
      and b.active
  ) then
    raise exception 'La sucursal seleccionada no pertenece a la organización o no está activa.' using errcode = '22023';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_req.organization_id
      and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_req.organization_id, null, array['owner']);

  if not v_owner then
    if p_branch_id is null then
      if not app_private.has_visualcorp_access_orgwide(v_req.organization_id, 'team', 'manage_members') then
        raise exception 'No tienes permiso para aprobar solicitudes con alcance global.' using errcode = '42501';
      end if;
    else
      if not app_private.has_visualcorp_access(v_req.organization_id, 'team', 'manage_members', p_branch_id) then
        raise exception 'No tienes permiso para asignar perfiles en la sucursal seleccionada.' using errcode = '42501';
      end if;
    end if;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'La solicitud ya fue resuelta.' using errcode = '22023';
  end if;
  select * into v_profile from public.access_profiles
  where id = p_profile_id and organization_id = v_req.organization_id and active;
  if not found then
    raise exception 'El perfil no existe o no está activo.' using errcode = '22023';
  end if;

  perform app_private.create_organization_access_invitation(v_req.organization_id, v_req.email, p_profile_id, p_branch_id);

  update public.organization_access_requests
  set status = 'approved', resolved_by = v_actor, resolved_at = now()
  where id = v_req.id;
  insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, profile_id, event_key, details)
  values (
    v_req.organization_id, v_actor, v_req.user_id, v_profile.id, 'access_request_approved',
    jsonb_build_object('request_id', v_req.id, 'email', v_req.email, 'branch_id', p_branch_id)
  );
  return jsonb_build_object('status', 'approved', 'email', v_req.email, 'profile_name', v_profile.name, 'branch_id', p_branch_id);
end;
$$;

create or replace function public.approve_organization_access_request(
  p_request_id uuid,
  p_profile_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.approve_organization_access_request(p_request_id, p_profile_id, p_branch_id);
$$;

revoke all on function app_private.approve_organization_access_request(uuid, uuid, uuid) from public, anon;
revoke all on function public.approve_organization_access_request(uuid, uuid, uuid) from public, anon;
grant execute on function app_private.approve_organization_access_request(uuid, uuid, uuid) to authenticated;
grant execute on function public.approve_organization_access_request(uuid, uuid, uuid) to authenticated;

create or replace function app_private.dismiss_organization_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.organization_access_requests%rowtype;
  v_owner boolean;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501';
  end if;
  select * into v_req from public.organization_access_requests where id = p_request_id for update;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_req.organization_id
      and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_req.organization_id, null, array['owner']);

  if not v_owner and not app_private.has_visualcorp_access_orgwide(v_req.organization_id, 'team', 'manage_members') then
    raise exception 'No tienes permiso para gestionar solicitudes.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    return;
  end if;
  update public.organization_access_requests
  set status = 'dismissed', resolved_by = v_actor, resolved_at = now()
  where id = v_req.id;
  insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, event_key, details)
  values (
    v_req.organization_id, v_actor, v_req.user_id, 'access_request_dismissed',
    jsonb_build_object('request_id', v_req.id, 'email', v_req.email)
  );
end;
$$;

create or replace function public.set_visualcorp_profile_active(p_profile_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_profile public.access_profiles%rowtype;
  v_owner boolean;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para cambiar perfiles.' using errcode = '42501';
  end if;
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_org and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_org, null, array['owner']);

  if not v_owner and not app_private.has_visualcorp_access_orgwide(v_org, 'team', 'manage_profiles') then
    raise exception 'No tienes permiso para cambiar perfiles en toda la organización.' using errcode = '42501';
  end if;

  select * into v_profile from public.access_profiles where id = p_profile_id and organization_id = v_org for update;
  if not found or v_profile.profile_key = 'owner' or v_profile.base_role = 'owner' then
    raise exception 'El perfil de propietario está protegido.' using errcode = '42501';
  end if;
  if not v_owner and (v_profile.profile_key in ('admin','website_admin') or v_profile.base_role in ('admin','website_admin')) then
    raise exception 'Solo el propietario puede cambiar ese perfil.' using errcode = '42501';
  end if;
  if not p_active and exists (select 1 from public.organization_memberships m where m.profile_id = p_profile_id and m.active) then
    raise exception 'Reasigna las cuentas antes de desactivar este perfil.' using errcode = '42501';
  end if;
  if not p_active and v_profile.profile_key = 'admin' and not exists (
    select 1 from public.organization_memberships m join public.access_profiles p on p.id = m.profile_id
    where m.organization_id = v_org and m.active and p.active and p.profile_key = 'admin' and p.id <> p_profile_id
  ) then
    raise exception 'Debe quedar al menos un perfil Admin activo.' using errcode = '42501';
  end if;

  update public.access_profiles set active = p_active, updated_at = now() where id = p_profile_id;
  insert into public.access_audit_log(organization_id, actor_user_id, profile_id, event_key, details)
  values (
    v_org, v_actor, p_profile_id,
    case when p_active then 'profile_activated' else 'profile_deactivated' end,
    jsonb_build_object('profile_key', v_profile.profile_key)
  );
end;
$$;

revoke all on function public.set_visualcorp_profile_active(uuid, boolean) from public, anon;
grant execute on function public.set_visualcorp_profile_active(uuid, boolean) to authenticated;

create or replace function public.set_visualcorp_membership_active(p_membership_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership public.organization_memberships%rowtype;
  v_org uuid;
  v_actor uuid := auth.uid();
  v_owner boolean;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para cambiar accesos.' using errcode = '42501';
  end if;
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_org and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_org, null, array['owner']);

  select * into v_membership from public.organization_memberships where id = p_membership_id and organization_id = v_org for update;
  if not found or v_membership.role = 'owner' then
    raise exception 'El acceso de propietario está protegido.' using errcode = '42501';
  end if;

  if not v_owner then
    if v_membership.branch_id is null then
      if not app_private.has_visualcorp_access_orgwide(v_org, 'team', 'manage_members') then
        raise exception 'No tienes permiso para cambiar membresías globales.' using errcode = '42501';
      end if;
    else
      if not app_private.has_visualcorp_access(v_org, 'team', 'manage_members', v_membership.branch_id) then
        raise exception 'No tienes permiso para cambiar accesos en esta sucursal.' using errcode = '42501';
      end if;
    end if;

    if v_membership.role in ('admin', 'website_admin') then
      raise exception 'Solo el propietario puede modificar perfiles administrativos.' using errcode = '42501';
    end if;
  end if;

  if not p_active and v_membership.role = 'admin' and (
    select count(*) from public.organization_memberships where organization_id = v_org and role = 'admin' and active
  ) <= 1 then
    raise exception 'No se puede desactivar al último perfil Admin activo.' using errcode = '42501';
  end if;

  update public.organization_memberships set active = p_active where id = p_membership_id;
  insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, profile_id, event_key, details)
  values (
    v_org, v_actor, v_membership.user_id, v_membership.profile_id,
    case when p_active then 'membership_activated' else 'membership_deactivated' end,
    jsonb_build_object('membership_id', p_membership_id, 'role', v_membership.role, 'branch_id', v_membership.branch_id)
  );
end;
$$;

revoke all on function public.set_visualcorp_membership_active(uuid, boolean) from public, anon;
grant execute on function public.set_visualcorp_membership_active(uuid, boolean) to authenticated;

create or replace function public.set_visualcorp_user_access_active(
  p_user_id uuid,
  p_active boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_owner boolean;
  v_changed integer := 0;
  v_active_admins integer;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para cambiar el acceso.' using errcode = '42501';
  end if;
  if p_user_id is null or p_active is null then
    raise exception 'Selecciona una cuenta y un estado válido.' using errcode = '22004';
  end if;
  if v_actor = p_user_id then
    raise exception 'No puedes bloquear tu propia cuenta.' using errcode = '42501';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    raise exception 'No se encontró la organización.';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_org and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_org, null, array['owner']);

  if not v_owner and not app_private.has_visualcorp_access_orgwide(v_org, 'team', 'manage_members') then
    raise exception 'No tienes permiso para cambiar accesos globales del equipo.' using errcode = '42501';
  end if;

  perform 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id
    for update;
  if not found then
    raise exception 'La cuenta no tiene accesos de Visual Corp para actualizar.';
  end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'El acceso de propietario está protegido.' using errcode = '42501';
  end if;
  if not v_owner and exists (
    select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role in ('admin', 'website_admin')
  ) then
    raise exception 'Solo el propietario puede modificar cuentas administrativas.' using errcode = '42501';
  end if;

  if not p_active then
    select count(*) into v_active_admins from public.organization_memberships
      where organization_id = v_org and role = 'admin' and active and user_id <> p_user_id;
    if exists (select 1 from public.organization_memberships
      where organization_id = v_org and user_id = p_user_id and role = 'admin' and active)
      and v_active_admins = 0 then
      raise exception 'No se puede bloquear a la última cuenta Admin activa.' using errcode = '42501';
    end if;
  end if;

  update public.organization_memberships
    set active = p_active
    where organization_id = v_org and user_id = p_user_id and active <> p_active;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into public.access_audit_log(
      organization_id, actor_user_id, target_user_id, event_key, details
    ) values (
      v_org, v_actor, p_user_id,
      case when p_active then 'user_access_reactivated' else 'user_access_blocked' end,
      jsonb_build_object('memberships_changed', v_changed, 'scope', 'visual-corp')
    );
  end if;
  return v_changed;
end;
$$;

revoke all on function public.set_visualcorp_user_access_active(uuid, boolean) from public, anon;
grant execute on function public.set_visualcorp_user_access_active(uuid, boolean) to authenticated;

create or replace function public.remove_visualcorp_user_access(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_owner boolean;
  v_removed integer := 0;
  v_admin_memberships integer;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para retirar accesos.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Selecciona una cuenta válida.' using errcode = '22004';
  end if;
  if v_actor = p_user_id then
    raise exception 'No puedes retirar tu propia cuenta.' using errcode = '42501';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    raise exception 'No se encontró la organización.';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = v_org and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(v_org, null, array['owner']);

  if not v_owner and not app_private.has_visualcorp_access_orgwide(v_org, 'team', 'manage_members') then
    raise exception 'No tienes permiso para retirar accesos globales del equipo.' using errcode = '42501';
  end if;

  perform 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id
    for update;
  if not found then
    raise exception 'La cuenta no tiene perfiles asignados en Visual Corp.';
  end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'El acceso de propietario está protegido.' using errcode = '42501';
  end if;
  if not v_owner and exists (
    select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role in ('admin', 'website_admin')
  ) then
    raise exception 'Solo el propietario puede retirar cuentas administrativas.' using errcode = '42501';
  end if;
  if not v_owner and exists (
    select 1 from public.organization_memberships target_membership
    where target_membership.organization_id = v_org
      and target_membership.user_id = p_user_id
      and not exists (
        select 1 from public.organization_memberships actor_membership
        join public.access_profiles actor_profile
          on actor_profile.id = actor_membership.profile_id
         and actor_profile.organization_id = actor_membership.organization_id
         and actor_profile.active
        where actor_membership.organization_id = v_org
          and actor_membership.user_id = v_actor
          and actor_membership.active
          and actor_membership.branch_id is null
          and (
            actor_membership.role = target_membership.role
            or (actor_membership.role = 'admin' and target_membership.role in ('manager','advisor','warehouse','production','marketing'))
            or (actor_membership.role = 'manager' and target_membership.role in ('advisor','warehouse','production','marketing'))
          )
      )
  ) then
    raise exception 'No puedes retirar una cuenta con rol superior al tuyo.' using errcode = '42501';
  end if;

  select count(*) into v_admin_memberships from public.organization_memberships
    where organization_id = v_org and role = 'admin' and active and user_id <> p_user_id;
  if exists (select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role = 'admin' and active)
    and v_admin_memberships = 0 then
    raise exception 'No se puede retirar la última cuenta Admin activa.' using errcode = '42501';
  end if;

  delete from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    insert into public.access_audit_log(
      organization_id, actor_user_id, target_user_id, event_key, details
    ) values (
      v_org, v_actor, p_user_id, 'user_access_removed',
      jsonb_build_object('memberships_removed', v_removed, 'scope', 'visual-corp')
    );
  end if;
  return v_removed;
end;
$$;

revoke all on function public.remove_visualcorp_user_access(uuid) from public, anon;
grant execute on function public.remove_visualcorp_user_access(uuid) to authenticated;

-- 7. RPC to assign or change a membership's branch scope (org-wide admins only).
create or replace function public.assign_visualcorp_membership_branch(
  p_organization_id uuid,
  p_membership_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_owner boolean;
  v_membership public.organization_memberships%rowtype;
  v_branch_name text := null;
  v_branch_code text := null;
  v_prev_branch uuid;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para cambiar la sucursal de una membresía.' using errcode = '42501';
  end if;
  if p_organization_id is null or p_membership_id is null then
    raise exception 'Selecciona una organización y membresía válidas.' using errcode = '22004';
  end if;

  v_owner := exists (
    select 1 from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = v_actor and om.active and om.branch_id is null and om.role = 'owner'
  ) and app_private.has_org_role(p_organization_id, null, array['owner']);

  if not v_owner and not app_private.has_visualcorp_access_orgwide(p_organization_id, 'team', 'manage_members') then
    raise exception 'No tienes permiso en toda la organización para reasignar sucursales.' using errcode = '42501';
  end if;

  select * into v_membership
  from public.organization_memberships
  where id = p_membership_id and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'No se encontró la membresía indicada.' using errcode = 'P0002';
  end if;
  if v_membership.role = 'owner' then
    raise exception 'La cuenta de propietario aplica a toda la organización.' using errcode = '42501';
  end if;
  if not v_owner and v_membership.role in ('admin', 'website_admin') then
    raise exception 'Solo el propietario puede modificar perfiles administrativos.' using errcode = '42501';
  end if;

  if not v_owner then
    if not exists (
      select 1
      from public.organization_memberships actor_membership
      join public.access_profiles actor_profile on actor_profile.id = actor_membership.profile_id
      where actor_membership.organization_id = p_organization_id
        and actor_membership.user_id = v_actor
        and actor_membership.active
        and actor_membership.branch_id is null
        and actor_profile.active
        and (
          actor_membership.role = v_membership.role
          or (actor_membership.role = 'admin' and v_membership.role in ('manager','advisor','warehouse','production','marketing'))
          or (actor_membership.role = 'manager' and v_membership.role in ('advisor','warehouse','production','marketing'))
        )
    ) then
      raise exception 'No puedes reasignar una membresía con rol superior al tuyo.' using errcode = '42501';
    end if;
  end if;

  if p_branch_id is not null then
    select b.name, b.code
    into v_branch_name, v_branch_code
    from public.branches b
    where b.id = p_branch_id and b.organization_id = p_organization_id and b.active;

    if not found then
      raise exception 'La sucursal seleccionada no pertenece a la organización o no está activa.' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1
    from public.organization_memberships dup
    where dup.organization_id = v_membership.organization_id
      and dup.user_id = v_membership.user_id
      and dup.profile_id is not distinct from v_membership.profile_id
      and dup.branch_id is not distinct from p_branch_id
      and dup.id <> v_membership.id
  ) then
    raise exception 'El usuario ya tiene ese perfil asignado en esa sucursal.' using errcode = '23505';
  end if;

  v_prev_branch := v_membership.branch_id;
  update public.organization_memberships
  set branch_id = p_branch_id
  where id = v_membership.id;

  insert into public.access_audit_log(organization_id, actor_user_id, target_user_id, profile_id, event_key, details)
  values (
    p_organization_id,
    v_actor,
    v_membership.user_id,
    v_membership.profile_id,
    'membership_branch_assigned',
    jsonb_build_object(
      'membership_id', v_membership.id,
      'previous_branch_id', v_prev_branch,
      'branch_id', p_branch_id
    )
  );

  return jsonb_build_object(
    'membership_id', v_membership.id,
    'branch_id', p_branch_id,
    'branch_name', v_branch_name,
    'branch_code', v_branch_code
  );
end;
$$;

revoke all on function public.assign_visualcorp_membership_branch(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_visualcorp_membership_branch(uuid, uuid, uuid) to authenticated;

-- 8. Return branch metadata from list_visualcorp_team_members with branch isolation.
drop function if exists public.list_visualcorp_team_members();
create or replace function public.list_visualcorp_team_members()
returns table(
  id uuid,
  user_id uuid,
  role text,
  profile_id uuid,
  active boolean,
  created_at timestamptz,
  full_name text,
  email text,
  last_sign_in_at timestamptz,
  access_profile_name text,
  access_profile_key text,
  branch_id uuid,
  branch_name text,
  branch_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_orgwide boolean;
begin
  select o.id into v_org
  from public.organizations o
  where o.slug = 'visual-corp'
  limit 1;

  if auth.uid() is null or v_org is null or not app_private.has_visualcorp_access(v_org, 'team', 'view') then
    return;
  end if;

  v_orgwide := app_private.has_org_role(v_org, null, array['owner'])
    or app_private.has_visualcorp_access_orgwide(v_org, 'team', 'view');

  return query
    select m.id, m.user_id, m.role, m.profile_id, m.active, m.created_at,
      p.full_name, p.email, u.last_sign_in_at, ap.name, ap.profile_key,
      m.branch_id, b.name, b.code
    from public.organization_memberships m
    left join public.profiles p on p.user_id = m.user_id
    left join auth.users u on u.id = m.user_id
    left join public.access_profiles ap on ap.id = m.profile_id and ap.organization_id = m.organization_id
    left join public.branches b on b.id = m.branch_id and b.organization_id = m.organization_id
    where m.organization_id = v_org
      and (
        v_orgwide
        or (m.branch_id is not null and app_private.has_visualcorp_access(v_org, 'team', 'view', m.branch_id))
      )
    order by m.created_at;
end;
$$;

revoke all on function public.list_visualcorp_team_members() from public, anon;
grant execute on function public.list_visualcorp_team_members() to authenticated;
