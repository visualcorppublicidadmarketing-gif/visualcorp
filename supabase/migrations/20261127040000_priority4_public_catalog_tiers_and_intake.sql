-- Priority 4: Public storefront safe quantity_tiers projection + public intake hardening.
-- Exposes ONLY [{ min_qty, max_qty }] in public_catalog_products when
-- custom_options->'quantity_pricing' exists; NEVER exposes internal prices,
-- price_scales, option_prices, or legacy SKU arrays.

create or replace view public.public_catalog_products
  with (security_barrier = true, security_invoker = true) as
  select p.id,
    coalesce(o.display_name, p.name) as name,
    p.slug,
    coalesce(o.display_description, p.description) as description,
    p.product_type as type,
    p.category_id,
    p.subcategory_id,
    coalesce(o.display_category, p.subcategory, p.category_id) as category,
    p.calc_type,
    p.currency,
    p.is_featured as featured,
    p.is_published,
    coalesce(o.sort_order, p.sort_order) as sort_order,
    coalesce(o.display_image_url, p.image_url) as image,
    coalesce(o.display_images, p.images) as images,
    coalesce(o.display_features, p.features) as features,
    p.sku,
    case
      when jsonb_typeof(p.custom_options->'quantity_pricing') = 'object' then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'min_qty', (scale->>'qty')::numeric::int,
            'max_qty', (scale->>'max_qty')::numeric::int
          )
          order by elem.ordinality
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(p.price_scales) = 'array' then p.price_scales
            else '[]'::jsonb
          end
        ) with ordinality as elem(scale, ordinality)
        where jsonb_typeof(scale) = 'object'
          and scale ? 'qty'
          and scale ? 'max_qty'
          and (scale->>'qty') ~ '^[0-9]+(\.[0-9]+)?$'
          and (scale->>'max_qty') ~ '^[0-9]+(\.[0-9]+)?$'
          and (scale->>'qty')::numeric >= 1
          and (scale->>'max_qty')::numeric >= (scale->>'qty')::numeric
      ), '[]'::jsonb)
      else '[]'::jsonb
    end as quantity_tiers
  from public.catalog_products p
  left join public.website_product_overrides o
    on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published
    and coalesce(o.is_published, true)
    and coalesce(p.product_kind, 'catalog') <> 'service'
    and exists (
      select 1
      from public.organizations org
      where org.id = p.organization_id
        and org.slug = 'visual-corp'
    );

grant select on public.public_catalog_products to anon, authenticated;

comment on view public.public_catalog_products is
  'Published public storefront products with safe quantity_tiers ([{min_qty, max_qty}]) and without internal prices or price_scales.';

-- Public intake hardening: keep anon column grants explicit and reject blank-only names on new rows.
grant insert (request_type, name, phone, email, company, service, message, quote_data)
  on public.public_requests to anon;

do $intake_constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.public_requests'::regclass
      and conname = 'public_requests_name_not_blank_check'
  ) then
    alter table public.public_requests
      add constraint public_requests_name_not_blank_check
      check (char_length(btrim(name)) > 0) not valid;
  end if;
end;
$intake_constraint$;
