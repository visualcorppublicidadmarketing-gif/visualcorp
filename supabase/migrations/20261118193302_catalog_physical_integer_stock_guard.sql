-- Keep catalog-linked physical unit stock integral at the database boundary.
-- Measured products, services, and non-catalog materials retain their precision.

create or replace function app_private.enforce_catalog_physical_integer_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_countable boolean;
begin
  select exists (
    select 1
    from public.catalog_inventory_links l
    join public.catalog_products c
      on c.id = l.catalog_product_id
     and c.organization_id = l.organization_id
    where l.organization_id = new.organization_id
      and l.inventory_variant_id = new.variant_id
      and l.branch_id = new.branch_id
      and l.location_code = new.location_code
      and l.active
      and pg_catalog.lower(pg_catalog.btrim(coalesce(c.product_type, ''))) = 'physical'
      and pg_catalog.lower(pg_catalog.btrim(coalesce(c.calc_type, ''))) not in ('m2', 'area')
  ) into v_is_countable;

  if v_is_countable and (
    new.quantity <> pg_catalog.trunc(new.quantity)
    or coalesce(new.reserved_quantity, 0) <> pg_catalog.trunc(coalesce(new.reserved_quantity, 0))
  ) then
    raise exception 'El stock de un producto físico por unidad debe usar cantidades enteras.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_catalog_physical_integer_stock() from public, anon, authenticated;

drop trigger if exists catalog_physical_integer_stock_guard on public.inventory_stock;
create trigger catalog_physical_integer_stock_guard
before insert or update of organization_id, variant_id, branch_id, location_code, quantity, reserved_quantity
on public.inventory_stock
for each row
execute function app_private.enforce_catalog_physical_integer_stock();

create or replace function app_private.validate_catalog_physical_inventory_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_type text;
  v_calc_type text;
  v_published boolean;
  v_variant_active boolean;
  v_item_active boolean;
  v_unit_key text;
begin
  if not new.active then
    return new;
  end if;

  select pg_catalog.lower(pg_catalog.btrim(coalesce(c.product_type, ''))),
         pg_catalog.lower(pg_catalog.btrim(coalesce(c.calc_type, ''))),
         c.is_published,
         iv.active,
         i.active,
         pg_catalog.translate(
           pg_catalog.lower(pg_catalog.btrim(coalesce(i.base_unit, ''))),
           'áéíóúüñ',
           'aeiouun'
         )
    into v_product_type, v_calc_type, v_published, v_variant_active, v_item_active, v_unit_key
    from public.catalog_products c
    join public.inventory_variants iv
      on iv.id = new.inventory_variant_id
     and iv.organization_id = new.organization_id
    join public.inventory_items i
      on i.id = iv.item_id
     and i.organization_id = iv.organization_id
    where c.id = new.catalog_product_id
      and c.organization_id = new.organization_id;

  if not found then
    raise exception 'El vínculo requiere un producto de catálogo y una variante del mismo negocio.'
      using errcode = '22023';
  end if;

  if v_product_type = 'physical' and v_calc_type not in ('m2', 'area') then
    if not coalesce(v_published, false) then
      raise exception 'Solo se pueden vincular productos físicos publicados.' using errcode = '22023';
    end if;
    if not coalesce(v_variant_active, false) or not coalesce(v_item_active, false) then
      raise exception 'Activa la ficha y la variante de inventario antes de vincularlas.' using errcode = '22023';
    end if;
    if pg_catalog.upper(pg_catalog.btrim(coalesce(new.location_code, ''))) <> 'MAIN' then
      raise exception 'Los productos físicos del catálogo deben vincularse a MAIN.' using errcode = '22023';
    end if;
    if v_unit_key not in ('unidad','unidades','unit','units','pieza','piezas','pza','pzas','pz','ud','uds','item','items','articulo','articulos') then
      raise exception 'El inventario de un producto físico del catálogo debe contarse por unidad o pieza.' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.inventory_stock s
      where s.organization_id = new.organization_id
        and s.variant_id = new.inventory_variant_id
        and s.branch_id = new.branch_id
        and s.location_code = new.location_code
        and (
          s.quantity <> pg_catalog.trunc(s.quantity)
          or coalesce(s.reserved_quantity, 0) <> pg_catalog.trunc(coalesce(s.reserved_quantity, 0))
        )
    ) then
      raise exception 'El saldo o las reservas existentes tienen fracciones. Confirma un conteo y libera reservas antes de vincular.'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_catalog_physical_inventory_link() from public, anon, authenticated;

drop trigger if exists catalog_physical_inventory_link_guard on public.catalog_inventory_links;
create trigger catalog_physical_inventory_link_guard
before insert or update of organization_id, catalog_product_id, inventory_variant_id, branch_id, location_code, active
on public.catalog_inventory_links
for each row
execute function app_private.validate_catalog_physical_inventory_link();
