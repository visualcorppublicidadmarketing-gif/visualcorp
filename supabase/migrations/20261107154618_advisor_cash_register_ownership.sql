-- Cash register setup is limited to advisors creating their own registers and
-- store managers/admins managing registers within their authorized branches.

drop policy if exists cash_registers_access_insert on public.cash_registers;
create policy cash_registers_access_insert on public.cash_registers
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      (
        assigned_advisor_id = (select auth.uid())
        and app_private.has_org_role(organization_id, branch_id, array['advisor'])
        and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
      )
      or (
        app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
        and app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
      )
    )
  );

drop policy if exists cash_registers_access_update on public.cash_registers;
create policy cash_registers_access_update on public.cash_registers
  for update to authenticated
  using (
    (
      app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
      and app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
    )
    or (
      assigned_advisor_id = (select auth.uid())
      and app_private.has_org_role(organization_id, branch_id, array['advisor'])
      and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    )
  )
  with check (
    (
      app_private.has_org_role(organization_id, branch_id, array['owner', 'admin', 'manager'])
      and app_private.has_visualcorp_access(organization_id, 'finance', 'manage_finance', branch_id)
    )
    or (
      assigned_advisor_id = (select auth.uid())
      and app_private.has_org_role(organization_id, branch_id, array['advisor'])
      and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    )
  );

-- Do not expose ownership/audit columns to UPDATE requests. The RPCs only need
-- the listed columns; RLS still decides which rows each role can change.
revoke update on public.cash_registers from authenticated;
grant update (branch_id, name, active) on public.cash_registers to authenticated;
revoke update on public.cash_register_weekly_goals from authenticated;
grant update (goal_amount, updated_by, updated_at) on public.cash_register_weekly_goals to authenticated;

create or replace function app_private.protect_cash_register_advisor_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.assigned_advisor_id is distinct from old.assigned_advisor_id
    or new.created_by is distinct from old.created_by then
    raise exception 'La organización, la persona asignada y la autoría de la caja no se pueden modificar.' using errcode = '42501';
  end if;

  if app_private.has_org_role(old.organization_id, old.branch_id, array['advisor'])
    and not app_private.has_org_role(old.organization_id, old.branch_id, array['owner', 'admin', 'manager'])
    and new.branch_id is distinct from old.branch_id then
    raise exception 'Solo un encargado o administrador puede cambiar la sucursal asignada a una caja.' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function app_private.protect_cash_register_advisor_assignment() from public, anon, authenticated;
drop trigger if exists cash_registers_protect_advisor_assignment on public.cash_registers;
create trigger cash_registers_protect_advisor_assignment
  before update on public.cash_registers
  for each row execute function app_private.protect_cash_register_advisor_assignment();

drop policy if exists cash_register_weekly_goals_access_insert on public.cash_register_weekly_goals;
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
        and (
          (
            app_private.has_org_role(register.organization_id, register.branch_id, array['owner', 'admin', 'manager'])
            and app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
          )
          or (
            register.assigned_advisor_id = (select auth.uid())
            and app_private.has_org_role(register.organization_id, register.branch_id, array['advisor'])
            and app_private.has_visualcorp_access(register.organization_id, 'sales', 'edit', register.branch_id)
          )
        )
    )
  );

drop policy if exists cash_register_weekly_goals_access_update on public.cash_register_weekly_goals;
create policy cash_register_weekly_goals_access_update on public.cash_register_weekly_goals
  for update to authenticated
  using (exists (
    select 1 from public.cash_registers register
    where register.id = cash_register_weekly_goals.cash_register_id
      and register.organization_id = cash_register_weekly_goals.organization_id
      and (
        (
          app_private.has_org_role(register.organization_id, register.branch_id, array['owner', 'admin', 'manager'])
          and app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
        )
        or (
          register.assigned_advisor_id = (select auth.uid())
          and app_private.has_org_role(register.organization_id, register.branch_id, array['advisor'])
          and app_private.has_visualcorp_access(register.organization_id, 'sales', 'edit', register.branch_id)
        )
      )
  ))
  with check (
    updated_by = (select auth.uid())
    and week_start >= date_trunc('week', timezone('America/Guayaquil', now()))::date
    and exists (
      select 1 from public.cash_registers register
      where register.id = cash_register_weekly_goals.cash_register_id
        and register.organization_id = cash_register_weekly_goals.organization_id
        and register.active
        and (
          (
            app_private.has_org_role(register.organization_id, register.branch_id, array['owner', 'admin', 'manager'])
            and app_private.has_visualcorp_access(register.organization_id, 'finance', 'manage_finance', register.branch_id)
          )
          or (
            register.assigned_advisor_id = (select auth.uid())
            and app_private.has_org_role(register.organization_id, register.branch_id, array['advisor'])
            and app_private.has_visualcorp_access(register.organization_id, 'sales', 'edit', register.branch_id)
          )
        )
    )
  );
