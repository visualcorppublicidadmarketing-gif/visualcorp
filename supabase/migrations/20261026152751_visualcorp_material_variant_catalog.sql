-- Material catalog improvements requested by Visual Corp.
-- Catalog rows are seeded only by an authenticated user with the existing inventory edit permission.
create or replace function public.seed_visualcorp_material_variant_catalog()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_item_count integer;
  v_variant_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para preparar el catálogo de materiales.'; end if;
  select id into v_org from public.organizations where slug='visual-corp';
  if v_org is null or not app_private.has_visualcorp_access(v_org,'inventory','edit',null) then
    raise exception 'Tu perfil no permite preparar el catálogo de inventario.';
  end if;
with org as (
  select id from public.organizations where slug = 'visual-corp'
), item_seed(sku, name, description, area_code, category_code, base_unit, image_path, custom_fields, tags) as (
  values
    ('VC-INV-IMP-001','Papel bond','Papel bond por formato A5, A4, A3 y A2. Presentación de compra pendiente de confirmar.','IMP','CAT-IMP-PAPELER-A','hoja','/inventory/catalog-materials/papel-bond-formatos.svg',
      '{"material_family":"papel_bond","purchase_unit":null,"package_conversion_pending":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['papel','bond','formatos']),
    ('VC-INV-IMP-005','Vinil adhesivo brillante','Rollo de vinil adhesivo brillante con variantes de color y ancho. El largo de cada rollo se confirma en recepción; 25 m es solo referencia habitual.','IMP','CAT-IMP-VINILES','metro lineal','/inventory/catalog-materials/viniles-rollos.svg',
      '{"material_family":"vinil_adhesivo","finish":"brillante","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['vinil','adhesivo','brillante','rollo']),
    ('VC-INV-IMP-006','Vinil transparente','Rollo de vinil transparente; ancho 107 o 127 cm. Largo por confirmar para cada recepción.','IMP','CAT-IMP-VINILES','metro lineal','/inventory/catalog-materials/viniles-rollos.svg',
      '{"material_family":"vinil_adhesivo","finish":"transparente","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['vinil','transparente','rollo']),
    ('VC-INV-TRO-004','Vinil arenado (esmerilado)','Rollo de vinil de acabado arenado/esmerilado; ancho 107 o 127 cm. Largo por confirmar para cada recepción.','TRO','CAT-TRO-VINILES','metro lineal','/inventory/catalog-materials/viniles-rollos.svg',
      '{"material_family":"vinil_arenado","finish":"arenado","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['vinil','arenado','esmerilado','rollo']),
    ('VC-INV-IMP-VIN-MATE','Vinil adhesivo mate','Rollo de vinil adhesivo mate con variantes de color y ancho. El largo de cada rollo se confirma en recepción; 25 m es solo referencia habitual.','IMP','CAT-IMP-VINILES','metro lineal','/inventory/catalog-materials/viniles-rollos.svg',
      '{"material_family":"vinil_adhesivo","finish":"mate","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['vinil','adhesivo','mate','rollo']),
    ('VC-INV-IMP-VIN-DORADO','Vinil adhesivo dorado','Rollo de vinil adhesivo dorado; ancho 107 o 127 cm. Largo por confirmar para cada recepción.','IMP','CAT-IMP-VINILES','metro lineal','/inventory/catalog-materials/viniles-rollos.svg',
      '{"material_family":"vinil_adhesivo","finish":"metalizado","color":"dorado","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['vinil','adhesivo','dorado','rollo']),
    ('VC-INV-TRO-VIN-TRANS','Vinil de transferencia','Vinil de transferencia; ancho 107 o 127 cm. Largo y presentación por confirmar en cada recepción.','TRO','CAT-TRO-TRANSFERENCIA','metro lineal','/inventory/catalog-materials/viniles-rollos.svg',
      '{"material_family":"vinil_transferencia","finish":"transferencia","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['vinil','transferencia','rollo']),
    ('VC-INV-IMP-007','Lona estándar','Rollo de lona por ancho. El rollo de 310 cm puede cortarse longitudinalmente en 107 cm y 203 cm; los anchos 107 y 207 cm también se manejan como variantes de compra. Largo por confirmar al recibir.','IMP','CAT-IMP-LONAS','metro lineal','/inventory/catalog-materials/lona-cortes.svg',
      '{"material_family":"lona","purchase_unit":"rollo","roll_length_provider_dependent":true,"roll_length_confirmation_required":true,"cut_profiles":[{"input_width_cm":310,"output_widths_cm":[107,203],"source":"user_confirmed"}],"source_status":"catalog_configured_stock_pending","stock_count_required":true}'::jsonb,ARRAY['lona','rollo','corte','ancho'])
)
insert into public.inventory_items (organization_id, category_id, area_id, sku, name, description, base_unit, minimum_quantity, active, item_type, tags, reference_image_url, custom_fields)
select org.id, category.id, area.id, item_seed.sku, item_seed.name, item_seed.description, item_seed.base_unit, 0, true, 'material', item_seed.tags, item_seed.image_path, item_seed.custom_fields
from org cross join item_seed
join public.areas area on area.organization_id=org.id and area.code=item_seed.area_code
join public.inventory_categories category on category.organization_id=org.id and category.code=item_seed.category_code
on conflict (organization_id, sku) do update set
  name=excluded.name,
  description=excluded.description,
  base_unit=excluded.base_unit,
  active=true,
  item_type=excluded.item_type,
  tags=(select array(select distinct tag from unnest(coalesce(inventory_items.tags,'{}'::text[]) || excluded.tags) tag)),
  reference_image_url=excluded.reference_image_url,
  custom_fields=public.inventory_items.custom_fields || excluded.custom_fields,
  updated_at=now();

with org as (select id from public.organizations where slug='visual-corp'), variant_seed(item_sku, variant_sku, label, attributes) as (
  values
    ('VC-INV-IMP-001','VC-INV-IMP-001-A5','A5 · 148 × 210 mm','{"paper_size":"A5","width_mm":148,"height_mm":210}'::jsonb),
    ('VC-INV-IMP-001','VC-INV-IMP-001-A4','A4 · 210 × 297 mm','{"paper_size":"A4","width_mm":210,"height_mm":297}'::jsonb),
    ('VC-INV-IMP-001','VC-INV-IMP-001-A3','A3 · 297 × 420 mm','{"paper_size":"A3","width_mm":297,"height_mm":420}'::jsonb),
    ('VC-INV-IMP-001','VC-INV-IMP-001-A2','A2 · 420 × 594 mm','{"paper_size":"A2","width_mm":420,"height_mm":594}'::jsonb),
    ('VC-INV-TRO-VIN-TRANS','VC-INV-TRO-VIN-TRANS-107CM','Transferencia · 107 cm','{"finish":"transferencia","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-TRO-VIN-TRANS','VC-INV-TRO-VIN-TRANS-127CM','Transferencia · 127 cm','{"finish":"transferencia","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-006','VC-INV-IMP-006-107CM','Transparente · 107 cm','{"finish":"transparente","color":"transparente","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-006','VC-INV-IMP-006-127CM','Transparente · 127 cm','{"finish":"transparente","color":"transparente","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-TRO-004','VC-INV-TRO-004-107CM','Arenado · 107 cm','{"finish":"arenado","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-TRO-004','VC-INV-TRO-004-127CM','Arenado · 127 cm','{"finish":"arenado","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-DORADO','VC-INV-IMP-VIN-DORADO-107CM','Dorado · 107 cm','{"finish":"metalizado","color":"dorado","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-DORADO','VC-INV-IMP-VIN-DORADO-127CM','Dorado · 127 cm','{"finish":"metalizado","color":"dorado","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-107CM','Mate · color por registrar · 107 cm','{"finish":"mate","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-127CM','Mate · color por registrar · 127 cm','{"finish":"mate","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-NEG-107CM','Brillante · negro · 107 cm','{"finish":"brillante","color":"negro","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-NEG-127CM','Brillante · negro · 127 cm','{"finish":"brillante","color":"negro","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-AMA-107CM','Brillante · amarillo · 107 cm','{"finish":"brillante","color":"amarillo","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-AMA-127CM','Brillante · amarillo · 127 cm','{"finish":"brillante","color":"amarillo","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-AZU-107CM','Brillante · azul · 107 cm','{"finish":"brillante","color":"azul","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-AZU-127CM','Brillante · azul · 127 cm','{"finish":"brillante","color":"azul","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-VER-107CM','Brillante · verde · 107 cm','{"finish":"brillante","color":"verde","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-VER-127CM','Brillante · verde · 127 cm','{"finish":"brillante","color":"verde","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-ROJ-107CM','Brillante · rojo · 107 cm','{"finish":"brillante","color":"rojo","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-005','VC-INV-IMP-005-ROJ-127CM','Brillante · rojo · 127 cm','{"finish":"brillante","color":"rojo","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-NEG-107CM','Mate · negro · 107 cm','{"finish":"mate","color":"negro","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-NEG-127CM','Mate · negro · 127 cm','{"finish":"mate","color":"negro","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-AMA-107CM','Mate · amarillo · 107 cm','{"finish":"mate","color":"amarillo","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-AMA-127CM','Mate · amarillo · 127 cm','{"finish":"mate","color":"amarillo","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-AZU-107CM','Mate · azul · 107 cm','{"finish":"mate","color":"azul","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-AZU-127CM','Mate · azul · 127 cm','{"finish":"mate","color":"azul","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-VER-107CM','Mate · verde · 107 cm','{"finish":"mate","color":"verde","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-VER-127CM','Mate · verde · 127 cm','{"finish":"mate","color":"verde","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-ROJ-107CM','Mate · rojo · 107 cm','{"finish":"mate","color":"rojo","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-MATE-ROJ-127CM','Mate · rojo · 127 cm','{"finish":"mate","color":"rojo","width_cm":127,"width_unit":"cm","purchase_unit":"rollo","roll_length_reference_m":25,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-007','VC-INV-IMP-007-310CM','Rollo de lona · 310 cm · entrada sin cortar','{"material_family":"lona","width_cm":310,"width_unit":"cm","purchase_unit":"rollo","cut_profile_cm":[107,203],"cut_profile_total_cm":310,"cut_profile_verified_by":"user","roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-007','VC-INV-IMP-007-107CM','Lona · 107 cm · compra directa o corte desde 310 cm','{"material_family":"lona","width_cm":107,"width_unit":"cm","purchase_unit":"rollo","supply_modes":["direct_purchase","cut_from_310"],"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-007','VC-INV-IMP-007-207CM','Lona · 207 cm · rollo comprado','{"material_family":"lona","width_cm":207,"width_unit":"cm","purchase_unit":"rollo","supply_modes":["direct_purchase"],"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb),
    ('VC-INV-IMP-007','VC-INV-IMP-007-203CM','Lona · 203 cm · corte interno desde rollo de 310 cm','{"material_family":"lona","width_cm":203,"width_unit":"cm","purchase_unit":"metro lineal","supply_modes":["cut_from_310"],"source_width_cm":310,"roll_length_provider_dependent":true,"roll_length_confirmation_required":true}'::jsonb)
)
insert into public.inventory_variants (organization_id,item_id,sku,label,attributes,active)
select org.id,item.id,variant_seed.variant_sku,variant_seed.label,
  variant_seed.attributes || jsonb_build_object('source_status','count_pending','stock_count_required',true),true
from org cross join variant_seed
join public.inventory_items item on item.organization_id=org.id and item.sku=variant_seed.item_sku
on conflict (organization_id,sku) do update set
  label=excluded.label,
  attributes=(public.inventory_variants.attributes - 'source_status') || (excluded.attributes - 'source_status') ||
    case when exists(select 1 from public.inventory_stock stock where stock.organization_id=excluded.organization_id and stock.variant_id=public.inventory_variants.id)
      then '{}'::jsonb else jsonb_build_object('source_status','count_pending') end,
  active=true;

  select count(*) into v_item_count from public.inventory_items where organization_id=v_org and sku in ('VC-INV-IMP-001','VC-INV-IMP-005','VC-INV-IMP-006','VC-INV-TRO-004','VC-INV-IMP-VIN-MATE','VC-INV-IMP-VIN-DORADO','VC-INV-TRO-VIN-TRANS','VC-INV-IMP-007');
  select count(*) into v_variant_count from public.inventory_variants where organization_id=v_org and (sku like 'VC-INV-IMP-001-A%' or sku like 'VC-INV-IMP-005-%' or sku like 'VC-INV-IMP-006-%' or sku like 'VC-INV-TRO-004-%' or sku like 'VC-INV-IMP-VIN-MATE-%' or sku like 'VC-INV-IMP-VIN-DORADO-%' or sku like 'VC-INV-TRO-VIN-TRANS-%' or sku like 'VC-INV-IMP-007-%');
  return jsonb_build_object('items',v_item_count,'variants',v_variant_count,'stock_created',false);
end;
$$;
revoke all on function public.seed_visualcorp_material_variant_catalog() from public,anon;
grant execute on function public.seed_visualcorp_material_variant_catalog() to authenticated;

create table public.inventory_roll_cut_conversions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  location_code text not null default 'MAIN',
  source_variant_id uuid not null,
  output_107_variant_id uuid not null,
  output_203_variant_id uuid not null,
  input_length_m numeric(14,3) not null check (input_length_m > 0),
  source_width_cm numeric(8,2) not null default 310 check (source_width_cm = 310),
  output_widths_cm numeric(8,2)[] not null default array[107,203]::numeric[],
  reference text not null default '',
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  foreign key (source_variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict,
  foreign key (output_107_variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict,
  foreign key (output_203_variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict,
  constraint inventory_roll_cut_output_widths_check check (output_widths_cm = array[107,203]::numeric[])
);
create index inventory_roll_cut_conversions_history_idx on public.inventory_roll_cut_conversions(organization_id,branch_id,created_at desc);
alter table public.inventory_roll_cut_conversions enable row level security;
grant select on public.inventory_roll_cut_conversions to authenticated;
create policy inventory_roll_cut_conversions_staff_read on public.inventory_roll_cut_conversions
  for select to authenticated using (app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','warehouse']));

create or replace function public.convert_inventory_lona_roll(
  p_source_variant_id uuid,
  p_output_107_variant_id uuid,
  p_output_203_variant_id uuid,
  p_branch_id uuid,
  p_location_code text,
  p_length_m numeric,
  p_reference text default '',
  p_note text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_item uuid;
  v_user uuid := (select auth.uid());
  v_source_width numeric;
  v_width_107 numeric;
  v_width_203 numeric;
  v_location text := coalesce(nullif(trim(p_location_code),''),'MAIN');
  v_available numeric;
  v_conversion uuid;
  v_note text;
begin
  if v_user is null then raise exception 'Inicia sesión para registrar el corte.'; end if;
  if p_length_m is null or p_length_m <= 0 then raise exception 'Indica los metros lineales reales que se cortarán.'; end if;
  select v.organization_id,v.item_id,nullif(v.attributes->>'width_cm','')::numeric
    into v_org,v_item,v_source_width
    from public.inventory_variants v join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id
    where v.id=p_source_variant_id and v.active and i.active and i.custom_fields->>'material_family'='lona'
    for update of v;
  if v_org is null or v_source_width is distinct from 310 then raise exception 'El origen debe ser una variante activa de lona de 310 cm.'; end if;
  if not app_private.has_visualcorp_access(v_org,'inventory','edit',p_branch_id) then raise exception 'No tienes permiso para transformar material en esta sucursal.'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org and active) then raise exception 'La sucursal indicada no está activa en esta organización.'; end if;
  select nullif(attributes->>'width_cm','')::numeric into v_width_107 from public.inventory_variants where id=p_output_107_variant_id and organization_id=v_org and item_id=v_item and active for update;
  select nullif(attributes->>'width_cm','')::numeric into v_width_203 from public.inventory_variants where id=p_output_203_variant_id and organization_id=v_org and item_id=v_item and active for update;
  if v_width_107 is distinct from 107 or v_width_203 is distinct from 203 then raise exception 'Las variantes de salida deben medir 107 cm y 203 cm del mismo artículo.'; end if;
  select quantity-reserved_quantity into v_available from public.inventory_stock
    where organization_id=v_org and variant_id=p_source_variant_id and branch_id=p_branch_id and location_code=v_location for update;
  if not found or v_available < p_length_m then raise exception 'No hay suficientes metros disponibles del rollo de 310 cm en esa ubicación.'; end if;
  v_note := 'Conversión de lona 310 cm a 107 + 203 cm' || case when coalesce(trim(p_reference),'')<>'' then ' · ref: '||trim(p_reference) else '' end || case when coalesce(trim(p_note),'')<>'' then ' · '||trim(p_note) else '' end;
  insert into public.inventory_roll_cut_conversions(organization_id,branch_id,location_code,source_variant_id,output_107_variant_id,output_203_variant_id,input_length_m,reference,note,created_by)
    values(v_org,p_branch_id,v_location,p_source_variant_id,p_output_107_variant_id,p_output_203_variant_id,p_length_m,coalesce(p_reference,''),coalesce(p_note,''),v_user)
    returning id into v_conversion;
  insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
    values
      (v_org,p_source_variant_id,p_branch_id,v_location,'consumption',-p_length_m,v_note,'material_cut_conversion',v_conversion,v_user),
      (v_org,p_output_107_variant_id,p_branch_id,v_location,'receipt',p_length_m,v_note,'material_cut_conversion',v_conversion,v_user),
      (v_org,p_output_203_variant_id,p_branch_id,v_location,'receipt',p_length_m,v_note,'material_cut_conversion',v_conversion,v_user);
  return jsonb_build_object('conversion_id',v_conversion,'input_width_cm',310,'output_widths_cm',array[107,203],'length_m',p_length_m,'branch_id',p_branch_id,'location_code',v_location);
end;
$$;
revoke all on function public.convert_inventory_lona_roll(uuid,uuid,uuid,uuid,text,numeric,text,text) from public,anon;
grant execute on function public.convert_inventory_lona_roll(uuid,uuid,uuid,uuid,text,numeric,text,text) to authenticated;

