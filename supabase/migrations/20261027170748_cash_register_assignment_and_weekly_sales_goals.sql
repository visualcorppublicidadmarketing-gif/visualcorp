-- Named checkout registers map one active advisor per branch and store goals per week.
create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  assigned_advisor_id uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);

create unique index cash_registers_active_name_uq
  on public.cash_registers (organization_id, branch_id, lower(name)) where active;
create unique index cash_registers_active_advisor_uq
  on public.cash_registers (organization_id, branch_id, assigned_advisor_id) where active;
create index cash_registers_advisor_org_idx
  on public.cash_registers (organization_id, assigned_advisor_id) where active;

create or replace function app_private.validate_cash_register_advisor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.user_id = new.assigned_advisor_id
      and membership.active
      and membership.role in ('advisor', 'owner', 'admin', 'manager')
      and (membership.branch_id is null or membership.branch_id = new.branch_id)
      and exists (
        select 1
        from public.access_profiles access_profile
        where access_profile.id = coalesce(membership.profile_id, (
          select legacy.id
          from public.access_profiles legacy
          where legacy.organization_id = membership.organization_id
            and legacy.profile_key = case membership.role
              when 'manager' then 'gerencia'
              when 'advisor' then 'asesoras'
              when 'warehouse' then 'inventario'
              when 'production' then 'personal_taller'
              else membership.role
            end
          limit 1
        ))
          and access_profile.organization_id = membership.organization_id
          and access_profile.active
      )
  ) then
    raise exception 'Selecciona una asesora activa asignada a esta sucursal.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_cash_register_advisor() from public, anon, authenticated;
create trigger cash_registers_validate_advisor
  before insert or update of organization_id, branch_id, assigned_advisor_id
  on public.cash_registers
  for each row execute function app_private.validate_cash_register_advisor();

create table public.cash_register_weekly_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  cash_register_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  goal_amount numeric(14,2) not null check (goal_amount > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, cash_register_id, week_start),
  foreign key (cash_register_id, organization_id)
    references public.cash_registers(id, organization_id) on delete restrict
);
create index cash_register_weekly_goals_period_idx
  on public.cash_register_weekly_goals (organization_id, week_start, cash_register_id);

alter table public.cash_sessions add column cash_register_id uuid;
alter table public.cash_sessions add constraint cash_sessions_register_org_fkey
  foreign key (cash_register_id, organization_id)
  references public.cash_registers(id, organization_id) on delete restrict;
create index cash_sessions_register_history_idx
  on public.cash_sessions (organization_id, cash_register_id)
  where cash_register_id is not null;
create unique index cash_sessions_one_open_register
  on public.cash_sessions (organization_id, cash_register_id)
  where status = 'open' and cash_register_id is not null;

create or replace function app_private.protect_cash_register_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cash_sessions session
    where session.organization_id = old.organization_id
      and session.cash_register_id = old.id
      and session.status = 'open'
  ) and not new.active then
    raise exception 'Cierra el turno de esta caja antes de desactivarla.';
  end if;

  if (
    new.branch_id is distinct from old.branch_id
    or new.assigned_advisor_id is distinct from old.assigned_advisor_id
  ) and (
    exists (
      select 1 from public.cash_sessions session
      where session.organization_id = old.organization_id
        and session.cash_register_id = old.id
    )
    or exists (
      select 1 from public.cash_register_weekly_goals goal
      where goal.organization_id = old.organization_id
        and goal.cash_register_id = old.id
    )
  ) then
    raise exception 'Esta caja ya tiene turnos o metas históricas. Desactívala y crea otra asignación para conservar los registros.';
  end if;

  if new.name is distinct from old.name and exists (
    select 1 from public.cash_sessions session
    where session.organization_id = old.organization_id
      and session.cash_register_id = old.id
  ) then
    raise exception 'Esta caja ya tiene turnos registrados. Desactívala y crea otra asignación para conservar los registros.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.protect_cash_register_history() from public, anon, authenticated;
create trigger cash_registers_protect_history
  before update of branch_id, name, assigned_advisor_id, active
  on public.cash_registers
  for each row execute function app_private.protect_cash_register_history();

alter table public.cash_registers enable row level security;
alter table public.cash_register_weekly_goals enable row level security;

create policy cash_registers_access_select on public.cash_registers
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'finance', 'view', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
  );
create policy cash_registers_access_insert on public.cash_registers
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
  );
create policy cash_registers_access_update on public.cash_registers
  for update to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id))
  with check (app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id));

create policy cash_register_weekly_goals_access_select on public.cash_register_weekly_goals
  for select to authenticated
  using (exists (
    select 1 from public.cash_registers register
    where register.id = cash_register_weekly_goals.cash_register_id
      and register.organization_id = cash_register_weekly_goals.organization_id
      and (
        app_private.has_visualcorp_access(register.organization_id, 'finance', 'view', register.branch_id)
        or app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
        or app_private.has_visualcorp_access(register.organization_id, 'cash', 'view', register.branch_id)
      )
  ));
create policy cash_register_weekly_goals_access_insert on public.cash_register_weekly_goals
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and week_start >= date_trunc('week', timezone('America/Guayaquil', now()))::date
    and exists (
      select 1 from public.cash_registers register
      where register.id = cash_register_weekly_goals.cash_register_id
        and register.organization_id = cash_register_weekly_goals.organization_id
        and register.active
        and app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
    )
  );
create policy cash_register_weekly_goals_access_update on public.cash_register_weekly_goals
  for update to authenticated
  using (exists (
    select 1 from public.cash_registers register
    where register.id = cash_register_weekly_goals.cash_register_id
      and register.organization_id = cash_register_weekly_goals.organization_id
      and app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
  ))
  with check (
    updated_by = (select auth.uid())
    and week_start >= date_trunc('week', timezone('America/Guayaquil', now()))::date
    and exists (
      select 1 from public.cash_registers register
      where register.id = cash_register_weekly_goals.cash_register_id
        and register.organization_id = cash_register_weekly_goals.organization_id
        and register.active
        and app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
    )
  );
grant select, insert, update on public.cash_registers to authenticated;
grant select, insert, update on public.cash_register_weekly_goals to authenticated;
grant all on public.cash_registers, public.cash_register_weekly_goals to service_role;
revoke all on public.cash_registers, public.cash_register_weekly_goals from anon;

create or replace function public.list_visualcorp_cash_register_advisors(p_branch_id uuid)
returns table (user_id uuid, role text, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization.id into v_org
  from public.organizations organization
  where organization.slug = 'visual-corp'
  limit 1;

  if v_org is null or auth.uid() is null
    or not app_private.has_visualcorp_access(v_org, 'finance', 'manage_finance', p_branch_id) then
    raise exception 'No tienes permiso para consultar las asesoras habilitadas para esta sucursal.' using errcode = '42501';
  end if;

  if p_branch_id is null or not exists (
    select 1 from public.branches branch
    where branch.id = p_branch_id and branch.organization_id = v_org and branch.active
  ) then
    raise exception 'La sucursal no existe o está inactiva.' using errcode = '22023';
  end if;

  return query
    select distinct on (membership.user_id)
      membership.user_id,
      membership.role,
      coalesce(nullif(trim(profile.full_name), ''), 'Usuario ' || left(membership.user_id::text, 8))
    from public.organization_memberships membership
    left join public.profiles profile on profile.user_id = membership.user_id
    where membership.organization_id = v_org
      and membership.active
      and membership.role in ('advisor', 'owner', 'admin', 'manager')
      and (membership.branch_id is null or membership.branch_id = p_branch_id)
      and exists (
        select 1
        from public.access_profiles access_profile
        where access_profile.id = coalesce(membership.profile_id, (
          select legacy.id
          from public.access_profiles legacy
          where legacy.organization_id = membership.organization_id
            and legacy.profile_key = case membership.role
              when 'manager' then 'gerencia'
              when 'advisor' then 'asesoras'
              when 'warehouse' then 'inventario'
              when 'production' then 'personal_taller'
              else membership.role
            end
          limit 1
        ))
          and access_profile.organization_id = membership.organization_id
          and access_profile.active
      )
    order by membership.user_id, (membership.branch_id = p_branch_id) desc, membership.created_at desc;
end;
$$;
revoke all on function public.list_visualcorp_cash_register_advisors(uuid) from public, anon;
grant execute on function public.list_visualcorp_cash_register_advisors(uuid) to authenticated;

create or replace function public.create_cash_register_with_weekly_goal(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_assigned_advisor_id uuid,
  p_week_start date,
  p_goal_amount numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cash_register_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  insert into public.cash_registers (
    organization_id, branch_id, name, assigned_advisor_id, active, created_by
  ) values (
    p_organization_id, p_branch_id, trim(p_name), p_assigned_advisor_id, true, v_user_id
  ) returning id into v_cash_register_id;

  insert into public.cash_register_weekly_goals (
    organization_id, cash_register_id, week_start, goal_amount, created_by, updated_by
  ) values (
    p_organization_id, v_cash_register_id, p_week_start, p_goal_amount, v_user_id, v_user_id
  );

  return v_cash_register_id;
end;
$$;
revoke all on function public.create_cash_register_with_weekly_goal(uuid, uuid, text, uuid, date, numeric) from public, anon;
grant execute on function public.create_cash_register_with_weekly_goal(uuid, uuid, text, uuid, date, numeric) to authenticated;

create or replace function public.update_cash_register_and_weekly_goal(
  p_organization_id uuid,
  p_cash_register_id uuid,
  p_branch_id uuid,
  p_name text,
  p_active boolean,
  p_week_start date,
  p_goal_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if p_active then
    -- Reactivation must happen before the goal upsert because goal policies
    -- only allow writes while the register is active. Any later failure rolls
    -- the activation back in the same transaction.
    update public.cash_registers
    set branch_id = p_branch_id, name = trim(p_name), active = true
    where id = p_cash_register_id and organization_id = p_organization_id;

    if not found then
      raise exception 'No tienes permiso para actualizar esta caja o ya no existe.';
    end if;
  end if;

  insert into public.cash_register_weekly_goals (
    organization_id, cash_register_id, week_start, goal_amount, created_by, updated_by
  ) values (
    p_organization_id, p_cash_register_id, p_week_start, p_goal_amount, v_user_id, v_user_id
  ) on conflict (organization_id, cash_register_id, week_start)
  do update set goal_amount = excluded.goal_amount, updated_by = v_user_id, updated_at = now();

  if not p_active then
    update public.cash_registers
    set branch_id = p_branch_id, name = trim(p_name), active = false
    where id = p_cash_register_id and organization_id = p_organization_id;

    if not found then
      raise exception 'No tienes permiso para actualizar esta caja o ya no existe.';
    end if;
  end if;
end;
$$;
revoke all on function public.update_cash_register_and_weekly_goal(uuid, uuid, uuid, text, boolean, date, numeric) from public, anon;
grant execute on function public.update_cash_register_and_weekly_goal(uuid, uuid, uuid, text, boolean, date, numeric) to authenticated;

-- Existing branches keep working before setup. Once a branch has a register,
-- an open turn must point to an active box assigned to its opener.
create policy cash_sessions_register_assignment on public.cash_sessions
  as restrictive for insert to authenticated
  with check (
    (
      cash_register_id is null
      and not exists (
        select 1 from public.cash_registers register
        where register.organization_id = cash_sessions.organization_id
          and register.branch_id = cash_sessions.branch_id
      )
    )
    or exists (
      select 1 from public.cash_registers register
      where register.id = cash_sessions.cash_register_id
        and register.organization_id = cash_sessions.organization_id
        and register.branch_id = cash_sessions.branch_id
        and register.assigned_advisor_id = cash_sessions.opened_by
        and register.active
    )
  );

-- An assigned advisor may operate only their own register and own sessions.
-- This avoids granting the broader manage_cash permission, which also allows
-- manual movements and closing other people's shifts.
create policy cash_registers_assigned_advisor_select on public.cash_registers
  for select to authenticated
  using (
    assigned_advisor_id = (select auth.uid())
    and (
      app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id)
      or app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id)
    )
  );

create policy cash_register_weekly_goals_assigned_advisor_select on public.cash_register_weekly_goals
  for select to authenticated
  using (exists (
    select 1 from public.cash_registers register
    where register.id = cash_register_weekly_goals.cash_register_id
      and register.organization_id = cash_register_weekly_goals.organization_id
      and register.assigned_advisor_id = (select auth.uid())
      and (
        app_private.has_visualcorp_access(register.organization_id, 'sales', 'view', register.branch_id)
        or app_private.has_visualcorp_access(register.organization_id, 'cash', 'view', register.branch_id)
      )
  ));

create policy cash_sessions_assigned_advisor_select on public.cash_sessions
  for select to authenticated
  using (
    (
      opened_by = (select auth.uid())
      and (
        app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id)
        or app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id)
      )
    )
    or exists (
      select 1 from public.cash_registers register
      where register.id = cash_sessions.cash_register_id
        and register.organization_id = cash_sessions.organization_id
        and register.assigned_advisor_id = (select auth.uid())
        and (
          app_private.has_visualcorp_access(register.organization_id, 'sales', 'view', register.branch_id)
          or app_private.has_visualcorp_access(register.organization_id, 'cash', 'view', register.branch_id)
        )
    )
  );

create policy cash_sessions_assigned_register_insert on public.cash_sessions
  for insert to authenticated
  with check (
    opened_by = (select auth.uid())
    and status = 'open'
    and cash_register_id is not null
    and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    and exists (
      select 1 from public.cash_registers register
      where register.id = cash_sessions.cash_register_id
        and register.organization_id = cash_sessions.organization_id
        and register.branch_id = cash_sessions.branch_id
        and register.assigned_advisor_id = (select auth.uid())
        and register.active
    )
  );

create policy cash_movements_assigned_advisor_select on public.cash_session_movements
  for select to authenticated
  using (exists (
    select 1 from public.cash_sessions session
    where session.id = cash_session_movements.session_id
      and session.organization_id = cash_session_movements.organization_id
      and session.opened_by = (select auth.uid())
  ));

-- Keep the server-side close rule in sync with the UI and row policies. An
-- active sales editor may close only their own shift; cash managers retain
-- authority to close any shift in their allowed branch.
create or replace function public.close_cash_session(
  p_session uuid,
  p_counted_cash numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions%rowtype;
  v_expected numeric(14,2);
  v_user uuid := (select auth.uid());
begin
  if v_user is null or p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'Revisa sesión y efectivo contado.';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'La caja ya está cerrada o no existe.';
  end if;

  if not app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id)
    and (
      v_session.opened_by <> v_user
      or not app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'edit', v_session.branch_id)
    ) then
    raise exception 'No tienes permiso para cerrar esta caja.' using errcode = '42501';
  end if;

  select v_session.opening_cash
    + coalesce((
      select sum(case when direction = 'in' then amount else -amount end)
      from public.cash_session_movements
      where session_id = v_session.id
    ), 0)
    + coalesce((
      select sum(amount)
      from public.sale_payments
      where cash_session_id = v_session.id and method = 'cash'
    ), 0)
  into v_expected;

  update public.cash_sessions
  set status = 'closed', closed_by = v_user, closed_at = now(),
      counted_cash = round(p_counted_cash, 2), expected_cash = round(v_expected, 2),
      difference = round(p_counted_cash - v_expected, 2), closing_note = left(coalesce(p_note, ''), 1000)
  where id = v_session.id;

  return jsonb_build_object(
    'session_id', v_session.id,
    'expected_cash', round(v_expected, 2),
    'counted_cash', round(p_counted_cash, 2),
    'difference', round(p_counted_cash - v_expected, 2)
  );
end;
$$;
revoke all on function public.close_cash_session(uuid, numeric, text) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, text) to authenticated;
