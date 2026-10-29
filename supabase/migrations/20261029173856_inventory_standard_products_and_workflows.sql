-- Standard custom products share the existing catalog so published items feed
-- the website, public quote flow, and POS from one source of truth.
alter table public.catalog_products
  add column if not exists product_kind text not null default 'catalog'
  check (product_kind in ('catalog','standard_custom'));

grant select, insert, update on public.production_workflow_templates to authenticated;
create policy production_templates_manage on public.production_workflow_templates
  for all to authenticated
  using (app_private.has_visualcorp_access(organization_id,'sales','edit')
    and app_private.has_visualcorp_access(organization_id,'workshop','edit'))
  with check (app_private.has_visualcorp_access(organization_id,'sales','edit')
    and app_private.has_visualcorp_access(organization_id,'workshop','edit'));

insert into public.production_workflow_templates (organization_id,code,name,steps)
select o.id,'custom_acrylic_memento','Recuerdo de acrílico personalizado',
  '[{"key":"intake","area":"ASE","title":"Confirmar foto, nombres y medidas","depends_on":[]},{"key":"design","area":"DIS","title":"Preparar la composición personalizada","depends_on":["intake"]},{"key":"print","area":"IMP","title":"Imprimir la foto","depends_on":["design"]},{"key":"laser","area":"LAS","title":"Grabar nombres y cortar la silueta","depends_on":["print"]},{"key":"workshop","area":"TAL","title":"Revisar acabado y preparar entrega","depends_on":["laser"]}]'::jsonb
from public.organizations o where o.slug='visual-corp'
on conflict (organization_id,code) do nothing;

-- Public catalog photos are intentionally public once uploaded; only catalog
-- editors can add or remove objects. UUID folders avoid exposing draft files.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('catalog-product-images','catalog-product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy catalog_product_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id='catalog-product-images'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid,'catalog_admin','edit'));
create policy catalog_product_images_update on storage.objects
  for update to authenticated
  using (bucket_id='catalog-product-images'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid,'catalog_admin','edit'))
  with check (bucket_id='catalog-product-images'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid,'catalog_admin','edit'));
create policy catalog_product_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id='catalog-product-images'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid,'catalog_admin','edit'));
