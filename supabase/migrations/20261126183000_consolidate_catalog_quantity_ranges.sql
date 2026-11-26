-- Consolidate verified per-unit schedules while retaining legacy IDs for historical documents.
do $migration$
declare
  family record;
  base_row public.catalog_products%rowtype;
  entry public.catalog_products%rowtype;
  bounds text[];
  min_qty integer;
  max_qty integer;
  last_max integer;
  scales jsonb;
  legacy_skus text[];
  row_ids text[];
  option_names text[];
  expected_options text[];
begin
  for family in select * from (values
    ('dtf-a3-colores', 'Camiseta DTF A3 Colores', 10),
    ('dtf-a4-colores', 'Camiseta DTF A4 Colores', 10),
    ('polo-bordado', 'Polo Bordado', 10),
    ('sublimacion-a3', 'Camiseta Sublimación A3', 10),
    ('sublimacion-a4', 'Camiseta Sublimación A4', 10),
    ('almohadas-blanco', 'Almohadas Blanco', 8),
    ('body-recien-nacido', 'Body Recién Nacido', 6),
    ('bolso-cambrella', 'Bolso Cambrella', 5),
    ('mochila-tela-rodeo', 'Mochila Tela Rodeo', 5)
  ) as families(stem, title, expected_rows)
  loop
    select array_agg(p.id order by substring(p.name from '^[0-9]+')::int)
      into row_ids
    from public.catalog_products p
    join public.organizations org on org.id=p.organization_id and org.slug='visual-corp'
    where p.id ~ ('^prod-' || family.stem || '-[0-9]+(-[0-9]+)?$')
      and p.is_published and p.calc_type='scale'
      and p.name ~ '^[0-9]+([[:space:]]*[-–][[:space:]]*[0-9]+)?$';

    if row_ids is null then continue; end if;
    if cardinality(row_ids) <> family.expected_rows then
      raise exception 'Unexpected number of quantity rows for %', family.stem;
    end if;

    select * into strict base_row from public.catalog_products where id=row_ids[1] for update;
    perform 1 from public.catalog_products where id=any(row_ids) for update;
    if exists (select 1 from public.catalog_inventory_links where catalog_product_id=any(row_ids))
      or exists (select 1 from public.catalog_material_recipes where catalog_product_id=any(row_ids))
      or exists (select 1 from public.catalog_product_workflow_routes where catalog_product_id=any(row_ids))
      or exists (select 1 from public.catalog_product_area_routes where catalog_product_id=any(row_ids)) then
      raise exception 'Review product links before consolidating %', family.stem;
    end if;

    select array_agg(s->>'option' order by s->>'option') into expected_options
      from jsonb_array_elements(base_row.price_scales) as s;
    last_max := null;
    scales := '[]'::jsonb;
    legacy_skus := array[]::text[];
    for entry in select p.* from unnest(row_ids) with ordinality as ids(id, position)
      join public.catalog_products p on p.id=ids.id order by ids.position
    loop
      bounds := regexp_split_to_array(entry.name, '[[:space:]]*[-–][[:space:]]*');
      min_qty := bounds[1]::int;
      max_qty := coalesce(bounds[2]::int, min_qty);
      select array_agg(s->>'option' order by s->>'option') into option_names
        from jsonb_array_elements(entry.price_scales) as s;
      if min_qty < 1 or max_qty < min_qty or (last_max is not null and min_qty <> last_max + 1)
        or entry.price is null or entry.price <= 0 or entry.currency <> 'USD'
        or entry.product_type is distinct from base_row.product_type
        or entry.product_kind is distinct from base_row.product_kind
        or entry.custom_options <> '{}'::jsonb
        or option_names is distinct from expected_options
        or (entry.price_scales->0->>'option') is distinct from (base_row.price_scales->0->>'option')
        or (jsonb_array_length(entry.price_scales)>0 and (entry.price_scales->0->>'price')::numeric is distinct from entry.price)
        or exists (select 1 from jsonb_array_elements(entry.price_scales) s
                   where nullif(s->>'option','') is null or coalesce((s->>'price')::numeric,0) <= 0) then
        raise exception 'Review quantity range or rates for %', entry.id;
      end if;
      scales := scales || jsonb_build_array(jsonb_build_object(
        'qty', min_qty, 'max_qty', max_qty, 'pvp', entry.price, 'price_inst', entry.price_inst,
        'price_corp', entry.price_corp, 'option_prices', entry.price_scales));
      if entry.sku is not null then legacy_skus := array_append(legacy_skus, entry.sku); end if;
      last_max := max_qty;
    end loop;

    update public.catalog_products
      set name=family.title, slug=regexp_replace(base_row.slug, '-[0-9]+(-[0-9]+)?$', ''),
          price_scales=scales || base_row.price_scales,
          custom_options=jsonb_build_object('quantity_pricing', jsonb_build_object('legacy_skus', legacy_skus, 'legacy_ids', row_ids)),
          updated_at=now()
      where id=base_row.id;
    update public.catalog_products
      set is_published=false, updated_at=now()
      where id=any(row_ids) and id<>base_row.id;
  end loop;
end;
$migration$;
