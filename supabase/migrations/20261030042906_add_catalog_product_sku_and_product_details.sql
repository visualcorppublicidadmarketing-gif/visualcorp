-- Give every catalog item a stable, visible code while preserving existing IDs.
alter table public.catalog_products
  add column if not exists sku text generated always as (id) stored;

comment on column public.catalog_products.sku is
  'Stable product identification code derived from the catalog product ID. The ID is the canonical SKU across catalog, website, quoting and operations.';

-- Keep both public catalog readers aligned with the source product SKU.
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
    p.sku
  from public.catalog_products p
  left join public.website_product_overrides o
    on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and coalesce(o.is_published, true);
grant select on public.public_catalog_products to anon, authenticated;

create or replace view public.public_quote_catalog_products
  with (security_barrier = true, security_invoker = true) as
  select p.id, p.name, p.slug, p.description, p.product_type as type,
    p.category_id, p.subcategory_id, coalesce(o.display_category, p.subcategory, p.category_id) as category,
    p.calc_type, p.price, p.price_inst, p.price_corp, p.price_scales, p.custom_options,
    p.currency, p.is_featured as featured, p.is_published,
    coalesce(o.sort_order, p.sort_order) as sort_order,
    coalesce(o.display_image_url, p.image_url) as image,
    coalesce(o.display_images, p.images) as images,
    coalesce(o.display_features, p.features) as features,
    p.sku
  from public.catalog_products p
  left join public.website_product_overrides o
    on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and coalesce(o.is_published, true)
    and exists (select 1 from public.organizations org where org.id = p.organization_id and org.slug = 'visual-corp');
grant select on public.public_quote_catalog_products to anon, authenticated;

