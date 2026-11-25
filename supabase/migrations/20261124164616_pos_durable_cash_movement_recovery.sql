-- Protect POS cash entries from duplicate retries after a lost network response.
-- The client persists the original payload/key before calling this RPC. A retry
-- with that exact payload returns the original movement even after shift close.
create or replace function public.record_cash_session_movement(
  p_session uuid,
  p_direction text,
  p_amount numeric,
  p_reason text,
  p_key text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.cash_sessions%rowtype;
  v_m public.cash_session_movements%rowtype;
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_amount numeric;
  v_reason text;
  v_key text;
begin
  v_amount := round(p_amount, 2);
  v_reason := left(trim(coalesce(p_reason, '')), 500);
  v_key := trim(coalesce(p_key, ''));

  if v_user is null
    or p_session is null
    or p_direction is null
    or p_direction not in ('in', 'out')
    or p_amount is null
    or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or v_amount <= 0
    or length(v_reason) < 3
    or length(v_key) < 12 then
    raise exception 'Revisa tipo, monto, motivo y clave.' using errcode = '22023';
  end if;

  -- Lock the session so closing it cannot race a new cash movement.
  select * into v_s
  from public.cash_sessions
  where id = p_session
  for update;

  if not found then
    raise exception 'No encontramos el turno original y no hay un movimiento registrado con esta clave.' using errcode = '55000';
  end if;

  -- Resolve a previous attempt before requiring an open shift. This is safe
  -- only when the authenticated creator and every submitted field match.
  select * into v_m
  from public.cash_session_movements
  where organization_id = v_s.organization_id
    and idempotency_key = v_key
  for update;

  if found then
    if v_m.session_id <> v_s.id
      or v_m.direction <> p_direction
      or v_m.amount <> v_amount
      or v_m.reason <> v_reason
      or v_m.created_by <> v_user then
      raise exception 'La clave de recuperación ya existe con otros datos; el movimiento no se modificó.' using errcode = '22023';
    end if;
    return v_m.id;
  end if;

  if v_s.status <> 'open' then
    raise exception 'La caja ya se cerró y no se encontró un movimiento registrado con esta clave.' using errcode = '55000';
  end if;

  if v_s.opened_by = v_user then
    if not (
      app_private.has_visualcorp_access(v_s.organization_id, 'sales', 'edit', v_s.branch_id)
      or app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id)
    ) then
      raise exception 'No tienes permiso para registrar movimientos en esta caja.' using errcode = '42501';
    end if;
  elsif not app_private.has_visualcorp_access(v_s.organization_id, 'cash', 'manage_cash', v_s.branch_id) then
    raise exception 'Los movimientos manuales en turnos de otros usuarios requieren autorización administrativa.' using errcode = '42501';
  end if;

  insert into public.cash_session_movements (
    organization_id, session_id, direction, amount, reason, idempotency_key, created_by
  ) values (
    v_s.organization_id, v_s.id, p_direction, v_amount, v_reason, v_key, v_user
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  -- A different session could race with the same key. Re-read the winner and
  -- apply the same exact-payload comparison instead of silently accepting it.
  select * into v_m
  from public.cash_session_movements
  where organization_id = v_s.organization_id
    and idempotency_key = v_key
  for update;

  if not found then
    raise exception 'No se pudo confirmar el movimiento. Reintenta con la misma clave.' using errcode = '40001';
  end if;

  if v_m.session_id <> v_s.id
    or v_m.direction <> p_direction
    or v_m.amount <> v_amount
    or v_m.reason <> v_reason
    or v_m.created_by <> v_user then
    raise exception 'La clave de recuperación ya existe con otros datos; el movimiento no se modificó.' using errcode = '22023';
  end if;

  return v_m.id;
end;
$$;

revoke all on function public.record_cash_session_movement(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.record_cash_session_movement(uuid, text, numeric, text, text) to authenticated;
