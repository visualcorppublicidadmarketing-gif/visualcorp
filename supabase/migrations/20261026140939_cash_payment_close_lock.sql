-- Serialize cash payments with the close operation so a payment cannot land
-- in a shift after its expected balance has already been calculated.
create or replace function app_private.attach_open_cash_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.method <> 'cash' then
    new.cash_session_id := null;
    return new;
  end if;

  -- close_cash_session locks this same row before calculating expected cash.
  -- The lock makes the payment commit first, or makes this query observe the
  -- closed shift and reject the payment; both paths keep the close accurate.
  select cs.id
    into new.cash_session_id
    from public.cash_sessions as cs
   where cs.organization_id = new.organization_id
     and cs.branch_id = (
       select s.branch_id
         from public.sales as s
        where s.id = new.sale_id
          and s.organization_id = new.organization_id
     )
     and cs.opened_by = new.created_by
     and cs.status = 'open'
   for update;

  if new.cash_session_id is null then
    raise exception 'No hay una caja abierta para este pago. Actualiza la pantalla y abre un nuevo turno antes de registrar efectivo.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;
