-- Let sales advisers see only their own open shifts so they can complete
-- the cash count. Cash managers keep the existing branch-wide visibility.
create policy cash_sessions_advisor_own_open_select
on public.cash_sessions
for select to authenticated
using (
  status = 'open'
  and opened_by = (select auth.uid())
  and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
);

-- Reuse the existing close RPC for a read-only expected-cash preview when
-- p_counted_cash is null. A preview is limited to the opener with sales.edit;
-- actual close calls still require a non-negative physical count. The final
-- close RPC recalculates the expected amount under its row lock.
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
  if v_user is null or (p_counted_cash is not null and p_counted_cash < 0) then
    raise exception 'Revisa sesión y efectivo contado.';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'La caja ya está cerrada o no existe.';
  end if;

  if p_counted_cash is null then
    if v_session.opened_by <> v_user
      or not app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'edit', v_session.branch_id) then
      raise exception 'Solo quien abrió la caja puede consultar su esperado.' using errcode = '42501';
    end if;
  elsif not app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'manage_cash', v_session.branch_id)
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

  if p_counted_cash is null then
    return jsonb_build_object(
      'session_id', v_session.id,
      'expected_cash', round(v_expected, 2),
      'counted_cash', null,
      'difference', null,
      'preview', true
    );
  end if;

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
