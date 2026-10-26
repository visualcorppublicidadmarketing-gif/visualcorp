create or replace function public.seed_visualcorp_ink_catalog_extensions()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_items integer; v_variants integer;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para preparar el catálogo de consumibles.'; end if;
  select id into v_org from public.organizations where slug='visual-corp';
  if v_org is null or not app_private.has_visualcorp_access(v_org,'inventory','edit',null) then
    raise exception 'Tu perfil no permite preparar el catálogo de consumibles.';
  end if;

  insert into public.inventory_categories (organization_id,code,name)
  values (v_org,'CAT-IMP-TINTAS','Tintas de impresión')
  on conflict (organization_id,code) do update set name=excluded.name;

  with seed(sku,name,description,item_type,custom_fields,tags) as (values
    ('VC-INK-EPSON-T664','Tinta Epson T664','Familia de botellas Epson T664; existencia y compatibilidad con impresoras Visual Corp pendientes de verificar. No confundir con el código 644, que no se ha podido confirmar en etiqueta ni catálogo oficial.','Tinta acuosa para EcoTank','{"brand":"Epson","ink_family":"T664","technology":"aqueous-ink","source_status":"catalog_suggestion","stock_count_required":true,"compatible_models_pending":true,"source_url":"https://epson.com.ec/Para-el-hogar/Tintas/Botellas-de-Tinta-Epson-T664/i/T664"}'::jsonb,ARRAY['tinta','epson','T664','existencia pendiente']),
    ('VC-TONER-RICOH-MPC3503','Tóner Ricoh MP C3503','Tóner de color para la multifunción Ricoh MP C3503 fotografiada. Registrar cada color por separado; cantidad y código del cartucho local pendientes de comprobar.','Tóner láser','{"brand":"Ricoh","family":"MP C3503","technology":"laser-toner","source_status":"catalog_suggestion","stock_count_required":true,"compatible_model_verified":"MP C3503","source_url":"https://assets.ricoh-usa.com/j2jqn9lauv41/2zrkgxs485tRgOCQWNKQK7/61de9b8e50e78c9d91670ed6ed1a14a3/mpc3503.pdf"}'::jsonb,ARRAY['tóner','láser','ricoh','MP C3503','existencia pendiente'])
  )
  insert into public.inventory_items (organization_id,category_id,sku,name,description,base_unit,item_type,tags,custom_fields,created_by)
  select v_org,c.id,seed.sku,seed.name,seed.description,'botella',seed.item_type,seed.tags,seed.custom_fields,null
  from seed join public.inventory_categories c on c.organization_id=v_org and c.code='CAT-IMP-TINTAS'
  on conflict (organization_id,sku) do update set description=excluded.description,item_type=excluded.item_type,tags=excluded.tags,custom_fields=public.inventory_items.custom_fields||excluded.custom_fields,updated_at=now();

  with ink(item_sku,color) as (values
    ('VC-INK-EPSON-T664','Cyan'),('VC-INK-EPSON-T664','Magenta'),('VC-INK-EPSON-T664','Yellow'),('VC-INK-EPSON-T664','Black'),
    ('VC-TONER-RICOH-MPC3503','Cyan'),('VC-TONER-RICOH-MPC3503','Magenta'),('VC-TONER-RICOH-MPC3503','Yellow'),('VC-TONER-RICOH-MPC3503','Black')
  )
  insert into public.inventory_variants (organization_id,item_id,sku,label,attributes,active)
  select v_org,i.id,i.sku||'-'||upper(ink.color),ink.color,jsonb_build_object('color',ink.color,'source_status','count_pending','stock_count_required',true),true
  from ink join public.inventory_items i on i.organization_id=v_org and i.sku=ink.item_sku
  on conflict (organization_id,sku) do update set label=excluded.label,attributes=public.inventory_variants.attributes||excluded.attributes,active=true;

  -- Catalog pages are HTML rather than image assets. Leave the photographed Epson bottle image blank until a real photo is uploaded.
  update public.inventory_items set reference_image_url=null,updated_at=now()
  where organization_id=v_org and sku='VC-INK-EPSON-T544' and reference_image_url like 'https://epson.com.ec/%';

  select count(*) into v_items from public.inventory_items where organization_id=v_org and sku in ('VC-INK-EPSON-T664','VC-TONER-RICOH-MPC3503');
  select count(*) into v_variants from public.inventory_variants where organization_id=v_org and (sku like 'VC-INK-EPSON-T664-%' or sku like 'VC-TONER-RICOH-MPC3503-%');
  return jsonb_build_object('items',v_items,'variants',v_variants,'stock_created',false);
end;
$$;
revoke all on function public.seed_visualcorp_ink_catalog_extensions() from public, anon;
grant execute on function public.seed_visualcorp_ink_catalog_extensions() to authenticated;
