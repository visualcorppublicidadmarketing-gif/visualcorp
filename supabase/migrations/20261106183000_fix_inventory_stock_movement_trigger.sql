-- Fix inventory stock movement trigger to prevent negative candidate insert tuple violating inventory_stock_quantity_check

create or replace function app_private.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc text;
  v_current numeric(14,3);
  v_reserved numeric(14,3);
begin
  v_loc := coalesce(nullif(trim(new.location_code), ''), 'MAIN');

  -- Ensure the stock row exists with 0 quantity so check constraint (quantity >= 0) is never violated during initial row creation
  insert into public.inventory_stock (
    organization_id,
    variant_id,
    branch_id,
    location_code,
    quantity,
    reserved_quantity,
    updated_at
  )
  values (
    new.organization_id,
    new.variant_id,
    new.branch_id,
    v_loc,
    0,
    0,
    now()
  )
  on conflict (organization_id, variant_id, branch_id, location_code)
  do nothing;

  -- Lock and read current quantities to validate availability
  select quantity, coalesce(reserved_quantity, 0)
    into v_current, v_reserved
    from public.inventory_stock
    where organization_id = new.organization_id
      and variant_id = new.variant_id
      and branch_id = new.branch_id
      and location_code = v_loc
    for update;

  if (v_current + new.quantity_delta) < 0 then
    raise exception 'Existencia física insuficiente en la ubicación %: saldo actual %, variación solicitada %.',
      v_loc, v_current, new.quantity_delta;
  end if;

  if (v_current + new.quantity_delta) < v_reserved then
    raise exception 'No se puede reducir el stock por debajo de la cantidad reservada (%) en la ubicación %: saldo actual %, variación %.',
      v_reserved, v_loc, v_current, new.quantity_delta;
  end if;

  -- Apply the delta to stock
  update public.inventory_stock
  set quantity = quantity + new.quantity_delta,
      updated_at = now()
  where organization_id = new.organization_id
    and variant_id = new.variant_id
    and branch_id = new.branch_id
    and location_code = v_loc;

  return new;
end;
$$;
