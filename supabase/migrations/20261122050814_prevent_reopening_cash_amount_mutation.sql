-- Reopening an already active till must be idempotent: the amount submitted by
-- the client only applies when creating a new session. Changes to a live
-- session must go through the authorized, audited cash-management workflow.
create or replace function public.open_pos_cash_session(
  p_branch_id uuid,
  p_opening_cash numeric default 0,
  p_register_name text default null,
  p_cash_register_id uuid default null,
  p_opened_by uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_branch public.branches%rowtype;
  v_target_user uuid;
  v_existing_session public.cash_sessions%rowtype;
  v_register_id uuid;
  v_reg_name text;
  v_session public.cash_sessions%rowtype;
begin
  if v_caller is null then
    raise exception 'Inicia sesión para abrir turno de caja.' using errcode = '42501';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id and active = true;

  if not found then
    raise exception 'La sucursal seleccionada no existe o no está activa.' using errcode = '22023';
  end if;

  v_target_user := coalesce(p_opened_by, v_caller);

  if v_target_user <> v_caller then
    if not app_private.has_visualcorp_access(v_branch.organization_id, 'cash', 'manage_cash', v_branch.id) then
      raise exception 'Abrir turnos para otros usuarios requiere autorización administrativa de caja.' using errcode = '42501';
    end if;
  else
    if not (
      app_private.has_visualcorp_access(v_branch.organization_id, 'sales', 'edit', v_branch.id)
      or app_private.has_visualcorp_access(v_branch.organization_id, 'cash', 'manage_cash', v_branch.id)
    ) then
      raise exception 'No tienes permiso para abrir turno de caja en esta sucursal.' using errcode = '42501';
    end if;
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);
  perform pg_advisory_xact_lock(hashtextextended(v_branch.organization_id::text || ':open_cash:' || v_target_user::text, 0));

  select * into v_existing_session
  from public.cash_sessions
  where organization_id = v_branch.organization_id
    and branch_id = v_branch.id
    and opened_by = v_target_user
    and status = 'open'
  for update;

  if found then
    -- Keep the recorded opening amount immutable through this idempotent RPC.
    return jsonb_build_object(
      'session_id', v_existing_session.id,
      'branch_id', v_existing_session.branch_id,
      'cash_register_id', v_existing_session.cash_register_id,
      'opening_cash', v_existing_session.opening_cash,
      'opened_by', v_existing_session.opened_by,
      'opened_at', v_existing_session.opened_at,
      'already_open', true
    );
  end if;

  v_register_id := p_cash_register_id;

  if v_register_id is not null then
    if exists (
      select 1 from public.cash_registers
      where id = v_register_id and organization_id = v_branch.organization_id and branch_id = v_branch.id
    ) then
      update public.cash_registers set active = true where id = v_register_id and not active;
    else
      v_register_id := null;
    end if;
  end if;

  if v_register_id is null then
    select id into v_register_id
    from public.cash_registers
    where organization_id = v_branch.organization_id
      and branch_id = v_branch.id
      and assigned_advisor_id = v_target_user
    order by active desc, created_at desc
    limit 1;

    if v_register_id is not null then
      update public.cash_registers set active = true where id = v_register_id and not active;
    else
      v_reg_name := coalesce(nullif(trim(p_register_name), ''), 'Caja ' || v_branch.name);
      if exists (
        select 1 from public.cash_registers
        where organization_id = v_branch.organization_id
          and branch_id = v_branch.id
          and lower(name) = lower(v_reg_name)
          and active
      ) then
        v_reg_name := v_reg_name || ' ' || left(replace(v_target_user::text, '-', ''), 4);
      end if;

      insert into public.cash_registers (
        organization_id, branch_id, name, assigned_advisor_id, active, created_by
      ) values (
        v_branch.organization_id, v_branch.id, v_reg_name, v_target_user, true, v_caller
      ) returning id into v_register_id;
    end if;
  end if;

  if v_register_id is not null and exists (
    select 1 from public.cash_sessions
    where organization_id = v_branch.organization_id
      and cash_register_id = v_register_id
      and status = 'open'
  ) then
    v_register_id := null;
  end if;

  insert into public.cash_sessions (
    organization_id, branch_id, cash_register_id, opened_by,
    opening_cash, status, opened_at, closing_denominations
  ) values (
    v_branch.organization_id,
    v_branch.id,
    v_register_id,
    v_target_user,
    round(greatest(coalesce(p_opening_cash, 0), 0), 2),
    'open',
    now(),
    '{}'::jsonb
  ) returning * into v_session;

  return jsonb_build_object(
    'session_id', v_session.id,
    'branch_id', v_session.branch_id,
    'cash_register_id', v_session.cash_register_id,
    'opening_cash', v_session.opening_cash,
    'opened_by', v_session.opened_by,
    'opened_at', v_session.opened_at,
    'already_open', false
  );
end;
$$;

revoke all on function public.open_pos_cash_session(uuid, numeric, text, uuid, uuid) from public, anon;
grant execute on function public.open_pos_cash_session(uuid, numeric, text, uuid, uuid) to authenticated;
