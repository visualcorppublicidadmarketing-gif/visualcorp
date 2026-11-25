-- Reorganize the existing vinyl/lona materials into a roll collection and add
-- rigid sheet master data without asserting any uncounted physical quantity.
-- Keep the privileged write-guard bypass scoped to this migration transaction.
select set_config('app.pos_rpc_bypass', 'true', true);

do $$
declare
  v_org uuid;
  v_roll_group uuid;
  v_rigid_group uuid;
  v_variant_ids uuid[];
  v_item_count integer;
  v_variant_count integer;
  v_stock_count integer;
  v_stock_total numeric;
  v_reserved_total numeric;
  v_movement_count integer;
  v_count_audit_count integer;
  v_active_roll_count integer;
  v_roll_log_count integer;
begin
  select id into v_org from public.organizations where slug='visual-corp';
  if v_org is null then raise exception 'No se encontró la organización visual-corp; no se limpió ningún dato.'; end if;

  select array_agg(v.id order by v.id) into v_variant_ids
    from public.inventory_variants v
    join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id
    join public.inventory_categories c on c.id=i.category_id and c.organization_id=i.organization_id
   where i.organization_id=v_org
     and c.code in ('CAT-IMP-LONAS','CAT-IMP-VINILES','CAT-LONAS','CAT-TRO-VINILES','CAT-VINILES');

  select count(*) into v_item_count
    from public.inventory_items i
    join public.inventory_categories c on c.id=i.category_id and c.organization_id=i.organization_id
   where i.organization_id=v_org
     and c.code in ('CAT-IMP-LONAS','CAT-IMP-VINILES','CAT-LONAS','CAT-TRO-VINILES','CAT-VINILES');
  v_variant_count := coalesce(cardinality(v_variant_ids),0);
  select count(*),coalesce(sum(quantity),0),coalesce(sum(reserved_quantity),0)
    into v_stock_count,v_stock_total,v_reserved_total
    from public.inventory_stock where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[]));
  select count(*) into v_movement_count from public.inventory_movements where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[]));
  select count(*) into v_count_audit_count from public.inventory_count_audits where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[]));
  select count(*) into v_active_roll_count from public.inventory_active_rolls where organization_id=v_org;
  select count(*) into v_roll_log_count from public.inventory_roll_logs where organization_id=v_org;

  if v_item_count<>18 or v_variant_count<>48 or v_stock_count<>2 or v_stock_total<>3 or v_reserved_total<>0
     or v_movement_count<>2 or v_count_audit_count<>2 or v_active_roll_count<>8 or v_roll_log_count<>3
     or exists(select 1 from public.catalog_inventory_links where inventory_variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.catalog_material_recipes where inventory_variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.inventory_item_costs where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.purchase_order_lines where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.purchase_request_lines where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.stock_transfer_lines where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.sale_lines where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.sale_material_consumptions where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.inventory_count_session_lines where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[])))
     or exists(select 1 from public.inventory_count_task_lines where variant_id=any(coalesce(v_variant_ids,'{}'::uuid[]))) then
    raise exception 'Limpieza de rollos cancelada porque cambió el inventario auditado (fichas %, variantes %, filas stock %, cantidad stock %, reservado %, movimientos %, conteos %, rollos %, registros %). No se borró historial.',
      v_item_count,v_variant_count,v_stock_count,v_stock_total,v_reserved_total,v_movement_count,v_count_audit_count,v_active_roll_count,v_roll_log_count;
  end if;

  insert into public.inventory_groups (organization_id,name,description,icon_key,color_key,show_in_main,display_order)
  values
    (v_org,'Rollos de impresión','Rollos físicos administrados por ancho y metros restantes; los saldos requieren conteo.','package','violet',false,10),
    (v_org,'Sustratos rígidos','Planchas rígidas estándar de 120 × 240 cm. El stock queda pendiente de conteo físico.','box','slate',false,11)
  on conflict do nothing;

  select id into v_roll_group from public.inventory_groups where organization_id=v_org and lower(name)='rollos de impresión' and archived_at is null;
  select id into v_rigid_group from public.inventory_groups where organization_id=v_org and lower(name)='sustratos rígidos' and archived_at is null;
  if v_roll_group is null or v_rigid_group is null then raise exception 'No se pudieron crear las colecciones de rollos y sustratos rígidos.'; end if;

  -- Reset only the audited legacy rolls for Visual Corp; keep other tenants' rolls and history.
  delete from public.inventory_roll_logs where organization_id=v_org;
  delete from public.inventory_active_rolls where organization_id=v_org;
  delete from public.inventory_count_audits where variant_id=any(v_variant_ids);
  delete from public.inventory_movements where variant_id=any(v_variant_ids);
  delete from public.inventory_stock where variant_id=any(v_variant_ids);

  -- Keep material SKUs/variants as stable links for the POS catalog, but remove their
  -- legacy roll/cut-piece balances and put only linear-meter materials in this collection.
  update public.inventory_items i
     set inventory_group_id=v_roll_group,
         base_unit='metro lineal',
         custom_fields=i.custom_fields||jsonb_build_object('inventory_model','roll','physical_count_required',true,'default_nominal_roll_length_m',200),
         updated_at=now()
    from public.inventory_categories c
   where c.id=i.category_id and c.organization_id=i.organization_id
     and i.organization_id=v_org
     and c.code in ('CAT-IMP-LONAS','CAT-IMP-VINILES','CAT-LONAS','CAT-TRO-VINILES','CAT-VINILES')
     and lower(trim(i.base_unit)) in ('m','metro','metros','metro lineal','metros lineales');

  -- These six legacy records represent fixed cut pieces, not roll stock. Keep
  -- their identifiers for audit/history, but remove them from active inventory.
  update public.inventory_variants v
     set active=false,
         attributes=coalesce(v.attributes,'{}'::jsonb)||jsonb_build_object('source_status','archived_legacy_cut_piece','archived_at',now())
    from public.inventory_items i
   where i.id=v.item_id and i.organization_id=v.organization_id
     and i.organization_id=v_org
     and i.sku in ('VC-INV-IMP-011','VC-INV-IMP-012','VC-INV-IMP-013','VC-INV-IMP-014','VC-INV-IMP-015','VC-INV-IMP-016');
  update public.inventory_items i
     set active=false,inventory_group_id=null,
         custom_fields=coalesce(i.custom_fields,'{}'::jsonb)||jsonb_build_object('inventory_model','legacy_cut_piece_archived','archived_reason','Reemplazado por control de rollos en metros lineales','archived_at',now()),
         updated_at=now()
   where i.organization_id=v_org
     and i.sku in ('VC-INV-IMP-011','VC-INV-IMP-012','VC-INV-IMP-013','VC-INV-IMP-014','VC-INV-IMP-015','VC-INV-IMP-016');
end;
$$;

insert into public.inventory_categories (organization_id,code,name,active)
select id,'CAT-SUS-RIGIDOS','Sustratos rígidos',true
  from public.organizations where slug='visual-corp'
on conflict (organization_id,code) do update set name=excluded.name,active=true;

with org as (
  select id from public.organizations where slug='visual-corp'
), category as (
  select c.id,c.organization_id from public.inventory_categories c join org on org.id=c.organization_id where c.code='CAT-SUS-RIGIDOS'
), group_row as (
  select g.id,g.organization_id from public.inventory_groups g join org on org.id=g.organization_id where lower(g.name)='sustratos rígidos' and g.archived_at is null
), branch as (
  select b.id,b.organization_id from public.branches b join org on org.id=b.organization_id where b.code='VIS' and b.active
), seed(sku,name,thickness_mm,material,color) as (
  values
    ('VC-RIG-CINTRA-1MM','Cintra PVC 1 mm',1,'Cintra PVC',''),
    ('VC-RIG-CINTRA-2MM','Cintra PVC 2 mm',2,'Cintra PVC',''),
    ('VC-RIG-CINTRA-3MM','Cintra PVC 3 mm',3,'Cintra PVC',''),
    ('VC-RIG-CINTRA-4MM','Cintra PVC 4 mm',4,'Cintra PVC',''),
    ('VC-RIG-ACR-BLANCO-2MM','Acrílico blanco 2 mm',2,'Acrílico','blanco'),
    ('VC-RIG-ACR-BLANCO-3MM','Acrílico blanco 3 mm',3,'Acrílico','blanco'),
    ('VC-RIG-ACR-NEGRO-2MM','Acrílico negro 2 mm',2,'Acrílico','negro'),
    ('VC-RIG-ACR-NEGRO-3MM','Acrílico negro 3 mm',3,'Acrílico','negro'),
    ('VC-RIG-ACR-NEGRO-ESPEJO-2MM','Acrílico negro espejo 2 mm',2,'Acrílico','negro espejo'),
    ('VC-RIG-ACR-NEGRO-ESPEJO-3MM','Acrílico negro espejo 3 mm',3,'Acrílico','negro espejo'),
    ('VC-RIG-ACR-DORADO-2MM','Acrílico dorado 2 mm',2,'Acrílico','dorado'),
    ('VC-RIG-ACR-DORADO-3MM','Acrílico dorado 3 mm',3,'Acrílico','dorado'),
    ('VC-RIG-MDF-2MM','MDF 2 mm',2,'MDF',''),
    ('VC-RIG-MDF-3MM','MDF 3 mm',3,'MDF',''),
    ('VC-RIG-ACR-ESPEJO-2MM','Acrílico espejo 2 mm',2,'Acrílico','espejo'),
    ('VC-RIG-ACR-AZUL-2MM','Acrílico azul 2 mm',2,'Acrílico','azul'),
    ('VC-RIG-ACR-VERDE-2MM','Acrílico verde 2 mm',2,'Acrílico','verde'),
    ('VC-RIG-ACR-ROJO-2MM','Acrílico rojo 2 mm',2,'Acrílico','rojo'),
    ('VC-RIG-ALUCOBOND-3MM','Alucobond 3 mm',3,'Alucobond','')
), item_rows as (
  insert into public.inventory_items (
    organization_id,category_id,sku,name,description,base_unit,minimum_quantity,active,item_type,tags,custom_fields,inventory_group_id,created_by
  )
  select category.organization_id,category.id,seed.sku,seed.name,
         'Hoja estándar 120 × 240 cm (2,88 m²). Conteo físico pendiente; el consumo calculado es aproximado y no incluye desperdicio.',
         'hoja',0,true,'sustrato rígido',array['sustrato-rigido','conteo-pendiente'],
         jsonb_build_object('inventory_model','rigid_sheet','material_family',seed.material,'thickness_mm',seed.thickness_mm,'color',seed.color,'width_cm',120,'height_cm',240,'area_m2',2.88,'physical_count_required',true,'source_status','count_pending'),
         group_row.id,null
    from seed cross join category cross join group_row
  on conflict (organization_id,sku) do update set
    category_id=excluded.category_id,name=excluded.name,description=excluded.description,base_unit=excluded.base_unit,
    active=true,item_type=excluded.item_type,tags=excluded.tags,custom_fields=public.inventory_items.custom_fields||excluded.custom_fields,
    inventory_group_id=excluded.inventory_group_id,updated_at=now()
  returning id,organization_id,sku
)
insert into public.inventory_variants (organization_id,item_id,sku,label,attributes,active)
select item_rows.organization_id,item_rows.id,
       item_rows.sku||'-HOJA-120X240','Hoja 120 × 240 cm',
       jsonb_build_object('width_cm',120,'height_cm',240,'area_m2',2.88,'unit','hoja','source_status','count_pending','initial_branch_id',branch.id),true
  from item_rows join branch on branch.organization_id=item_rows.organization_id
on conflict (organization_id,sku) do update set
  item_id=excluded.item_id,label=excluded.label,attributes=public.inventory_variants.attributes||excluded.attributes,active=true;

-- A laminated print consumes both the printable vinyl and a separate cold
-- laminate film roll. Start both at zero and require a physical roll receipt.
with org as (
  select id from public.organizations where slug='visual-corp'
), category as (
  select c.id,c.organization_id from public.inventory_categories c join org on org.id=c.organization_id where c.code in ('CAT-IMP-VINILES','CAT-VINILES') order by (c.code='CAT-IMP-VINILES') desc limit 1
), group_row as (
  select g.id,g.organization_id from public.inventory_groups g join org on org.id=g.organization_id where lower(g.name)='rollos de impresión' and g.archived_at is null
), branch as (
  select b.id,b.organization_id from public.branches b join org on org.id=b.organization_id where b.code='VIS' and b.active
), item_row as (
  insert into public.inventory_items(organization_id,category_id,sku,name,description,base_unit,minimum_quantity,active,item_type,tags,custom_fields,inventory_group_id,created_by)
  select category.organization_id,category.id,'VC-INV-IMP-LAMINADO','Laminado frío','Película para laminación de impresiones; ancho y largo se confirman al recibir cada rollo.','metro lineal',0,true,'Rollo de laminado',array['rollo','laminado','conteo-pendiente'],
    jsonb_build_object('inventory_model','roll','material_family','laminado','physical_count_required',true,'default_nominal_roll_length_m',200,'source_status','count_pending'),group_row.id,null
    from category cross join group_row
  on conflict (organization_id,sku) do update set
    category_id=excluded.category_id,name=excluded.name,description=excluded.description,base_unit=excluded.base_unit,
    active=true,item_type=excluded.item_type,tags=excluded.tags,
    custom_fields=public.inventory_items.custom_fields||excluded.custom_fields,inventory_group_id=excluded.inventory_group_id,updated_at=now()
  returning id,organization_id
)
insert into public.inventory_variants(organization_id,item_id,sku,label,attributes,active)
select item_row.organization_id,item_row.id,'VC-INV-IMP-LAMINADO-01','Ancho por confirmar',
  jsonb_build_object('source_status','count_pending','stock_count_required',true,'initial_branch_id',branch.id),true
  from item_row join branch on branch.organization_id=item_row.organization_id
on conflict (organization_id,sku) do update set
  item_id=excluded.item_id,label=excluded.label,
  attributes=public.inventory_variants.attributes||excluded.attributes,active=true;

-- These catalog products are different lona grades/finishes. Give each its own
-- zero-stock roll material so one grade cannot falsely satisfy another's need.
with org as (
  select id from public.organizations where slug='visual-corp'
), category as (
  select c.id,c.organization_id from public.inventory_categories c join org on org.id=c.organization_id where c.code in ('CAT-IMP-LONAS','CAT-LONAS') order by (c.code='CAT-IMP-LONAS') desc limit 1
), roll_group as (
  select g.id,g.organization_id from public.inventory_groups g join org on org.id=g.organization_id where lower(g.name)='rollos de impresión' and g.archived_at is null
), branch as (
  select b.id,b.organization_id from public.branches b join org on org.id=b.organization_id where b.code='VIS' and b.active
), seed(sku,name,catalog_product_id) as (
  values
    ('VC-ROLL-LONA-CAMPANA-9OZ','Lona de campaña 9 oz brillante','lona_campana_9oz_brillante'),
    ('VC-ROLL-LONA-PREMIUM-13OZ','Lona premium 13 oz brillante','lona_premium_13oz_brillante'),
    ('VC-ROLL-LONA-PREMIUM-MATE-12OZ','Lona premium 12 oz mate','lona_premium_12oz_mate'),
    ('VC-ROLL-LONA-STANDARD-11OZ','Lona estándar 11 oz brillante','lona_standard_11oz_brillante')
), item_rows as (
  insert into public.inventory_items(
    organization_id,category_id,sku,name,description,base_unit,minimum_quantity,active,item_type,tags,custom_fields,inventory_group_id,created_by
  )
  select category.organization_id,category.id,seed.sku,seed.name,
    'Material vinculado al producto del catálogo. Ancho y stock pendiente de confirmar al recibir cada rollo.',
    'metro lineal',0,true,'Rollo de lona',array['rollo','lona','conteo-pendiente'],
    jsonb_build_object('inventory_model','roll','material_family','lona','catalog_product_id',seed.catalog_product_id,'physical_count_required',true,'default_nominal_roll_length_m',200,'source_status','count_pending'),
    roll_group.id,null
  from seed cross join category cross join roll_group
  on conflict (organization_id,sku) do update set
    category_id=excluded.category_id,name=excluded.name,description=excluded.description,base_unit=excluded.base_unit,
    active=true,item_type=excluded.item_type,tags=excluded.tags,custom_fields=public.inventory_items.custom_fields||excluded.custom_fields,
    inventory_group_id=excluded.inventory_group_id,updated_at=now()
  returning id,organization_id,sku,name
)
insert into public.inventory_variants(organization_id,item_id,sku,label,attributes,active)
select item_rows.organization_id,item_rows.id,item_rows.sku||'-01','Ancho por confirmar',
  jsonb_build_object('source_status','count_pending','stock_count_required',true,'initial_branch_id',branch.id),true
from item_rows join branch on branch.organization_id=item_rows.organization_id
on conflict (organization_id,sku) do update set
  item_id=excluded.item_id,label=excluded.label,attributes=public.inventory_variants.attributes||excluded.attributes,active=true;

-- One recipe row represents one required material component. Alternative widths
-- are intentionally not entered as parallel recipes because recipes are additive.
do $$
declare
  v_rows integer;
begin
  with mappings(product_id,variant_sku,calculation_mode,quantity_per_basis,waste_percent) as (values
    ('lona_campana_9oz_brillante','VC-ROLL-LONA-CAMPANA-9OZ-01','area_to_linear',1::numeric,0::numeric),
    ('lona_premium_13oz_brillante','VC-ROLL-LONA-PREMIUM-13OZ-01','area_to_linear',1::numeric,0::numeric),
    ('lona_premium_12oz_mate','VC-ROLL-LONA-PREMIUM-MATE-12OZ-01','area_to_linear',1::numeric,0::numeric),
    ('lona_standard_11oz_brillante','VC-ROLL-LONA-STANDARD-11OZ-01','area_to_linear',1::numeric,0::numeric),
    ('panaflex_traslucida_13oz','VC-INV-IMP-008-01','area_to_linear',1::numeric,0::numeric),
    ('microperforado','VC-INV-TRO-005-01','area_to_linear',1::numeric,0::numeric),
    ('vinil_adh_brillante','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric),
    ('vinil_adh_laminado','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric),
    ('vinil_adh_laminado','VC-INV-IMP-LAMINADO-01','area_to_linear',1::numeric,0::numeric),
    ('vinil_adh_mate','VC-INV-IMP-VIN-MATE-107CM','area_to_linear',1::numeric,0::numeric),
    ('vinil_adh_transparente','VC-INV-IMP-006-01','area_to_linear',1::numeric,0::numeric),
    ('vinil_arenado','VC-INV-TRO-004-01','area_to_linear',1::numeric,0::numeric),
    ('vinil_reflectivo_impreso','VC-INV-TRO-003-01','area_to_linear',1::numeric,0::numeric),
    ('cintra_pvc_1mm','VC-RIG-CINTRA-1MM-HOJA-120X240','per_billed_unit',1::numeric/2.88,0::numeric),
    ('cintra_pvc_1mm','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric),
    ('cintra_pvc_2mm','VC-RIG-CINTRA-2MM-HOJA-120X240','per_billed_unit',1::numeric/2.88,0::numeric),
    ('cintra_pvc_2mm','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric),
    ('cintra_pvc_3mm','VC-RIG-CINTRA-3MM-HOJA-120X240','per_billed_unit',1::numeric/2.88,0::numeric),
    ('cintra_pvc_3mm','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric),
    ('cintra_pvc_3mm_laminado','VC-RIG-CINTRA-3MM-HOJA-120X240','per_billed_unit',1::numeric/2.88,0::numeric),
    ('cintra_pvc_3mm_laminado','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric),
    ('cintra_pvc_3mm_laminado','VC-INV-IMP-LAMINADO-01','area_to_linear',1::numeric,0::numeric),
    ('alucobond_3mm_int','VC-RIG-ALUCOBOND-3MM-HOJA-120X240','per_billed_unit',1::numeric/2.88,0::numeric),
    ('alucobond_3mm_int','VC-INV-IMP-005-01','area_to_linear',1::numeric,0::numeric)
  ), target as (
    select o.id organization_id,m.product_id,iv.id inventory_variant_id,b.id branch_id,m.calculation_mode,m.quantity_per_basis,m.waste_percent
      from mappings m
      join public.organizations o on o.slug='visual-corp'
      join public.catalog_products cp on cp.organization_id=o.id and cp.id=m.product_id
      join public.inventory_variants iv on iv.organization_id=o.id and iv.sku=m.variant_sku and iv.active
      join public.branches b on b.organization_id=o.id and b.code='VIS' and b.active
  )
  insert into public.catalog_material_recipes(
    organization_id,catalog_product_id,inventory_variant_id,branch_id,location_code,
    calculation_mode,fulfillment_stage,quantity_per_basis,waste_percent,active
  )
  select organization_id,product_id,inventory_variant_id,branch_id,'MAIN',calculation_mode,'sale',quantity_per_basis,waste_percent,true
    from target
  on conflict (organization_id,catalog_product_id,inventory_variant_id,branch_id) do update set
    location_code=excluded.location_code,calculation_mode=excluded.calculation_mode,fulfillment_stage=excluded.fulfillment_stage,
    quantity_per_basis=excluded.quantity_per_basis,waste_percent=excluded.waste_percent,active=true,updated_at=now();
  get diagnostics v_rows=row_count;
  if v_rows<>24 then
    raise exception 'Se crearon % de 24 recetas de materiales esperadas. Revisa catálogo, sucursal y variantes antes de publicar.',v_rows;
  end if;
end;
$$;

comment on table public.inventory_active_rolls is
  'One row per physical roll. remaining_m is the usable length; inventory_stock stores aggregate meters per material variant.';
