-- Keep physical catalog SKUs countable end to end, including sale amendments
-- that bypass the standard POS form. Measured products and manual concepts
-- retain their existing fractional quantity support.

create or replace function app_private.enforce_physical_catalog_integer_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_type text;
  v_calc_type text;
begin
  if new.catalog_product_id is null then
    return new;
  end if;

  select pg_catalog.lower(pg_catalog.btrim(coalesce(p.product_type, ''))),
         pg_catalog.lower(pg_catalog.btrim(coalesce(p.calc_type, '')))
  into v_product_type, v_calc_type
  from public.catalog_products p
  where p.id = new.catalog_product_id
    and p.organization_id = new.organization_id;

  if found
    and v_product_type = 'physical'
    and coalesce(v_calc_type, '') <> 'm2'
    and new.quantity <> pg_catalog.trunc(new.quantity) then
    raise exception 'La cantidad del producto físico debe ser un número entero.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_physical_catalog_integer_quantity() from public, anon, authenticated;

create trigger sale_lines_physical_catalog_integer_quantity
before insert or update of organization_id, catalog_product_id, quantity
on public.sale_lines
for each row
execute function app_private.enforce_physical_catalog_integer_quantity();
