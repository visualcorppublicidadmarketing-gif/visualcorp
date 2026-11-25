set local app.pos_rpc_bypass = 'true';
update public.catalog_products set is_published = true, updated_at = now() where id = 'VC-SV-LOGOS' and product_kind = 'service' and price_scales @> '[{"option":"Básico","price":30},{"option":"Completo","price":100},{"option":"Universo Visual","price":500},{"option":"Cambio adicional","price":10}]'::jsonb and custom_options #>> '{service,changeFee}' = '10';
set local app.pos_rpc_bypass = 'false';
create or replace view public.public_catalog_products with (security_barrier = true, security_invoker = true) as
  select p.id, coalesce(o.display_name, p.name) as name, p.slug, coalesce(o.display_description, p.description) as description, p.product_type as type, p.category_id, p.subcategory_id, coalesce(o.display_category, p.subcategory, p.category_id) as category, p.calc_type, p.currency, p.is_featured as featured, p.is_published, coalesce(o.sort_order, p.sort_order) as sort_order, coalesce(o.display_image_url, p.image_url) as image, coalesce(o.display_images, p.images) as images, coalesce(o.display_features, p.features) as features, p.sku
  from public.catalog_products p left join public.website_product_overrides o on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and coalesce(o.is_published, true) and coalesce(p.product_kind, 'catalog') <> 'service';
grant select on public.public_catalog_products to anon, authenticated;
comment on view public.public_catalog_products is 'Published public storefront products; service catalog items are surfaced in POS and quote catalog only.';
create or replace view public.public_quote_catalog_products with (security_barrier = true, security_invoker = true) as
  select p.id, p.name, p.slug, p.description, p.product_type as type, p.category_id, p.subcategory_id, coalesce(o.display_category, p.subcategory, p.category_id) as category, p.calc_type, p.price, p.price_inst, p.price_corp, p.price_scales, p.custom_options, p.currency, p.is_featured as featured, p.is_published, coalesce(o.sort_order, p.sort_order) as sort_order, coalesce(o.display_image_url, p.image_url) as image, coalesce(o.display_images, p.images) as images, coalesce(o.display_features, p.features) as features, p.sku, p.product_kind
  from public.catalog_products p left join public.website_product_overrides o on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and (coalesce(p.product_kind, 'catalog') = 'service' or coalesce(o.is_published, true)) and exists (select 1 from public.organizations org where org.id = p.organization_id and org.slug = 'visual-corp');
grant select on public.public_quote_catalog_products to anon, authenticated;
