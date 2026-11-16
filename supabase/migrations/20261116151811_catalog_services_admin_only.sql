-- Reusable service offerings share the catalog and pricing engine with POS/quotes.
alter table public.catalog_products
  drop constraint if exists catalog_products_product_kind_check;
alter table public.catalog_products
  add constraint catalog_products_product_kind_check
  check (product_kind in ('catalog','standard_custom','service'));

-- Editors with operational pricing access may still view, but only owners/admins
-- can create, alter, publish, or remove catalog products and services.
drop policy if exists catalog_products_admin_write on public.catalog_products;
drop policy if exists vc_access_member on public.catalog_products;
drop policy if exists vc_access_insert on public.catalog_products;
drop policy if exists vc_access_update on public.catalog_products;
drop policy if exists vc_access_delete on public.catalog_products;
create policy vc_access_insert on public.catalog_products
  as restrictive for insert to authenticated
  with check (app_private.has_org_role(organization_id, null, array['owner','admin']));
create policy vc_access_update on public.catalog_products
  as restrictive for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin']));
create policy vc_access_delete on public.catalog_products
  as restrictive for delete to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin']));
create policy catalog_products_admin_insert on public.catalog_products
  for insert to authenticated
  with check (app_private.has_org_role(organization_id, null, array['owner','admin']));
create policy catalog_products_admin_update on public.catalog_products
  for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin']));
create policy catalog_products_admin_delete on public.catalog_products
  for delete to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin']));
grant delete on public.catalog_products to authenticated;
grant select (product_kind, sku) on public.catalog_products to anon, authenticated;

drop policy if exists catalog_product_images_insert on storage.objects;
create policy catalog_product_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id='catalog-product-images'
    and app_private.has_org_role((storage.foldername(name))[1]::uuid, null, array['owner','admin']));
drop policy if exists catalog_product_images_update on storage.objects;
create policy catalog_product_images_update on storage.objects
  for update to authenticated
  using (bucket_id='catalog-product-images'
    and app_private.has_org_role((storage.foldername(name))[1]::uuid, null, array['owner','admin']))
  with check (bucket_id='catalog-product-images'
    and app_private.has_org_role((storage.foldername(name))[1]::uuid, null, array['owner','admin']));
drop policy if exists catalog_product_images_delete on storage.objects;
create policy catalog_product_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id='catalog-product-images'
    and app_private.has_org_role((storage.foldername(name))[1]::uuid, null, array['owner','admin']));

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
    p.sku, p.product_kind
  from public.catalog_products p
  left join public.website_product_overrides o
    on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and coalesce(o.is_published, true)
    and exists (select 1 from public.organizations org where org.id = p.organization_id and org.slug = 'visual-corp');
grant select on public.public_quote_catalog_products to anon, authenticated;

-- Add the requested service templates as drafts. Administrators review scope
-- and publish them before they become sellable through public quote channels.
-- The migration role has no interactive staff identity, so bypass the application
-- write guard for these reviewed, unpublished seed rows only.
set local app.pos_rpc_bypass = 'true';
insert into public.catalog_products (
  id, organization_id, name, slug, description, product_type, category_id,
  subcategory, calc_type, price, price_scales, custom_options, features,
  is_published, product_kind
)
select 'VC-SV-LOGOS', o.id, 'Creación de logos', 'servicio-creacion-de-logos',
  'Diseño de identidad visual. El alcance final se confirma con el cliente antes de iniciar.',
  'service', 'Diseño de identidad', 'Diseño de identidad', 'unit', 30,
  '[{"option":"Básico","price":30},{"option":"Completo","price":100},{"option":"Universo Visual","price":500},{"option":"Cambio adicional","price":10}]'::jsonb,
  '{"service":{"type":"logo","brief":"Definir objetivo, público, personalidad y referencias de marca.","deliverables":"Archivos y formatos por confirmar con el cliente.","conditions":"Alcance, entregables y tiempos se confirman antes de aceptar el pedido.","changeFee":10,"packages":[{"label":"Básico","price":30},{"label":"Completo","price":100},{"label":"Universo Visual","price":500}]}}'::jsonb,
  '["Alcance pendiente de revisión por administración","$10 por cada cambio adicional"]'::jsonb,
  false, 'service'
from public.organizations o where o.slug = 'visual-corp'
on conflict (id) do nothing;

insert into public.catalog_products (
  id, organization_id, name, slug, description, product_type, category_id,
  subcategory, calc_type, price, price_scales, custom_options, features,
  is_published, product_kind
)
select 'VC-SV-PUBLICIDAD-DIGITAL', o.id, 'Publicidad digital para negocios', 'publicidad-digital-para-negocios',
  'Servicio para planificar y preparar publicidad digital. Paquetes y alcance comercial pendientes de definición.',
  'service', 'Marketing digital', 'Marketing digital', 'unit', 0,
  '[]'::jsonb,
  '{"service":{"type":"digital-ads","brief":"Pendiente de definir.","deliverables":"Pendiente de definir.","conditions":"Definir plataformas, entregables, accesos, inversión publicitaria, calendario y condiciones antes de publicar.","changeFee":null,"packages":[{"label":"Paquete por definir","price":null}]}}'::jsonb,
  '["Paquetes y tarifa pendientes de definir"]'::jsonb,
  false, 'service'
from public.organizations o where o.slug = 'visual-corp'
on conflict (id) do nothing;
set local app.pos_rpc_bypass = 'false';

create or replace function public.assign_catalog_product_skus()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_changed integer := 0;
begin
  select o.id into v_organization_id from public.organizations o where o.slug = 'visual-corp' limit 1;
  if v_organization_id is null then raise exception 'No se encontró la organización Visual Corp.' using errcode = 'P0002'; end if;
  if not app_private.has_org_role(v_organization_id, null, array['owner','admin']) then
    raise exception 'Solo administración puede asignar o modificar códigos de producto.' using errcode = '42501';
  end if;
  with pending as (
    select p.id,
      app_private.catalog_product_sku_prefix(p.product_kind, p.product_type, p.subcategory_id, p.subcategory) as prefix,
      row_number() over (
        partition by app_private.catalog_product_sku_prefix(p.product_kind, p.product_type, p.subcategory_id, p.subcategory)
        order by (p.id = 'rollup_80x200_premium') desc, p.sort_order nulls last, p.name collate "C", p.id
      ) as position
    from public.catalog_products p where p.organization_id = v_organization_id and p.sku = p.id
  ), updated as (
    update public.catalog_products p set sku = pending.prefix || case when pending.position < 1000 then lpad(pending.position::text, 3, '0') else pending.position::text end
    from pending where p.organization_id = v_organization_id and p.id = pending.id and p.sku = p.id returning p.id
  ) select count(*)::integer into v_changed from updated;
  return v_changed;
end;
$$;
