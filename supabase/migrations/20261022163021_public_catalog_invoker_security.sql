-- Public views run with caller privileges; anon receives only the catalog columns
-- intentionally used by the public site and quote calculator.
drop policy if exists catalog_products_public_read on public.catalog_products;
create policy catalog_products_public_read on public.catalog_products
  for select to anon, authenticated
  using (is_published and exists (
    select 1 from public.organizations org
    where org.id = catalog_products.organization_id and org.slug = 'visual-corp'
  ));
grant select (id,name,slug,description,product_type,category_id,subcategory_id,subcategory,calc_type,
  price,price_inst,price_corp,price_scales,custom_options,currency,is_featured,is_published,
  sort_order,image_url,images,features) on public.catalog_products to anon, authenticated;

drop policy if exists website_product_overrides_public_read on public.website_product_overrides;
create policy website_product_overrides_public_read on public.website_product_overrides
  for select to anon, authenticated
  using (is_published and exists (
    select 1 from public.organizations org
    where org.id = website_product_overrides.organization_id and org.slug = 'visual-corp'
  ));
grant select (organization_id,product_id,display_name,display_description,display_category,
  display_image_url,display_images,display_features,is_published,sort_order)
  on public.website_product_overrides to anon, authenticated;

alter view public.public_catalog_products set (security_invoker = true);
alter view public.public_quote_catalog_products set (security_invoker = true);

-- Membership updates are authorized by the caller's existing RLS role.
create or replace function public.assign_visualcorp_role(p_email text, p_role text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_user uuid;
  v_caller_is_owner boolean;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then raise exception 'Visual Corp no está configurado.'; end if;
  v_caller_is_owner := app_private.has_org_role(v_org, null, array['owner']);
  if not v_caller_is_owner and not app_private.has_org_role(v_org, null, array['admin']) then
    raise exception 'Solo el propietario o un administrador puede gestionar perfiles.';
  end if;
  if p_role not in ('admin','manager','advisor','warehouse','production','marketing','website_admin') then
    raise exception 'El perfil solicitado no está permitido.';
  end if;
  if p_role = 'website_admin' and not v_caller_is_owner then
    raise exception 'Solo el propietario puede asignar administración de la página web.';
  end if;
  select user_id into v_user from public.profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'Ese correo todavía no ha iniciado sesión en Visual Corp.'; end if;
  insert into public.organization_memberships (organization_id, user_id, role, active)
  values (v_org, v_user, p_role, true)
  on conflict (organization_id, user_id, role) where branch_id is null
  do update set active = true;
end;
$$;
revoke all on function public.assign_visualcorp_role(text,text) from public, anon;
grant execute on function public.assign_visualcorp_role(text,text) to authenticated;
