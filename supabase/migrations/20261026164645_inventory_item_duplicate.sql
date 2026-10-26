-- Duplicate inventory definitions while keeping all physical and financial ledgers independent.
create or replace function public.duplicate_visualcorp_inventory_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.inventory_items%rowtype;
  v_org uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_sku text;
  v_variants integer := 0;
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Inicia sesión para duplicar un artículo.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_visualcorp_access(v_org,'inventory','edit',null) then
    raise exception 'No tienes permiso para duplicar artículos de inventario.' using errcode='42501';
  end if;
  select * into v_source from public.inventory_items where id=p_item_id and organization_id=v_org and active for share;
  if not found then raise exception 'El artículo no existe o está archivado.'; end if;

  v_new_sku := left(v_source.sku,120) || '-COPIA-' || upper(substr(replace(v_new_id::text,'-',''),1,8));
  insert into public.inventory_items (
    id,organization_id,category_id,area_id,sku,name,description,item_type,tags,
    reference_image_url,custom_fields,base_unit,minimum_quantity,active,created_by
  ) values (
    v_new_id,v_source.organization_id,v_source.category_id,v_source.area_id,v_new_sku,
    left(v_source.name || ' (copia)',200),v_source.description,v_source.item_type,v_source.tags,
    v_source.reference_image_url,
    (v_source.custom_fields - 'initial_branch_id' - 'default_location_code') || jsonb_build_object('source_status','count_pending','stock_count_required',true,'duplicated_from',v_source.id),
    v_source.base_unit,v_source.minimum_quantity,true,v_actor
  );

  insert into public.inventory_variants (organization_id,item_id,sku,label,attributes,active)
  select v_org,v_new_id,
    left(v_new_sku || '-V' || lpad(row_number() over (order by id)::text,3,'0'),180),
    label || case when label='' then 'Conteo físico pendiente' else ' · copia · conteo pendiente' end,
    (attributes - 'branch_id' - 'location_code' - 'initial_branch_id') || jsonb_build_object('source_status','count_pending','stock_count_required',true),
    true
  from public.inventory_variants where organization_id=v_org and item_id=v_source.id and active;
  get diagnostics v_variants = row_count;

  return jsonb_build_object('item_id',v_new_id,'sku',v_new_sku,'name',v_source.name || ' (copia)','variants',v_variants,'source_status','count_pending');
end;
$$;
revoke all on function public.duplicate_visualcorp_inventory_item(uuid) from public,anon;
grant execute on function public.duplicate_visualcorp_inventory_item(uuid) to authenticated;
