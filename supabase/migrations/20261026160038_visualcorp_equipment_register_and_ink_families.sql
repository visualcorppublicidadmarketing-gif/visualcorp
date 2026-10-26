-- Dedicated register for durable equipment, separate from consumable stock.
create table if not exists public.equipment_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);
alter table public.equipment_areas enable row level security;
grant select, insert, update on public.equipment_areas to authenticated;
create policy equipment_areas_read on public.equipment_areas for select to authenticated
  using (app_private.has_org_role(organization_id));
create policy equipment_areas_add on public.equipment_areas for insert to authenticated
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']));
create policy equipment_areas_update on public.equipment_areas for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']));

create table if not exists public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  area_id uuid,
  branch_id uuid,
  asset_code text not null,
  name text not null,
  equipment_type text not null default 'Por clasificar',
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  status text not null default 'Por verificar' check (status in ('Operativo','En mantenimiento','Fuera de servicio','Por verificar','Retirado')),
  condition text not null default 'Sin revisar',
  location text not null default '',
  notes text not null default '',
  reference_image_url text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, asset_code),
  unique (id, organization_id),
  foreign key (area_id, organization_id) references public.equipment_areas(id, organization_id) on delete restrict,
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);

create index if not exists equipment_assets_org_area_idx on public.equipment_assets (organization_id, area_id, status);
create index if not exists equipment_assets_branch_idx on public.equipment_assets (organization_id, branch_id);
alter table public.equipment_assets enable row level security;
grant select, insert, update on public.equipment_assets to authenticated;
create policy equipment_assets_read on public.equipment_assets for select to authenticated
  using (app_private.has_org_role(organization_id, branch_id));
create policy equipment_assets_add on public.equipment_assets for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse','production']));
create policy equipment_assets_update on public.equipment_assets for update to authenticated
  using (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse','production']))
  with check (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse','production']));

-- Equipment areas are separate from production work areas.
insert into public.equipment_areas (organization_id, code, name)
select o.id, v.code, v.name
from public.organizations o
cross join (values
  ('COMPUTO','Cómputo'),
  ('IMP_GRAN_FORMATO','Impresión gran formato'),
  ('IMP_DIGITAL','Impresión digital'),
  ('EQUIPOS_TALLER','Equipos de taller'),
  ('ACABADOS','Acabados')) as v(code,name)
where o.slug = 'visual-corp'
on conflict (organization_id, code) do update set name = excluded.name;

-- Inventory entries describe ink families and variants; photographed counts are
-- stored as evidence only and intentionally do not create available stock.
create or replace function public.seed_visualcorp_ink_inventory()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_item_count integer; v_variant_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para preparar el catálogo de tintas.'; end if;
  select id into v_org from public.organizations where slug='visual-corp';
  if v_org is null or not app_private.has_visualcorp_access(v_org,'inventory','edit',null) then
    raise exception 'Tu perfil no permite preparar el catálogo de tintas.';
  end if;

insert into public.inventory_categories (organization_id, code, name)
select id, 'CAT-IMP-TINTAS', 'Tintas de impresión'
from public.organizations where slug = 'visual-corp'
on conflict (organization_id, code) do update set name = excluded.name;
insert into public.inventory_categories (organization_id, code, name)
select id, 'CAT-SUB-TINTAS', 'Tintas de sublimación'
from public.organizations where slug = 'visual-corp'
on conflict (organization_id, code) do update set name = excluded.name;

with org as (select id from public.organizations where slug='visual-corp'), seed(sku,name,description,item_type,category_code,area_code,base_unit,reference_image_url,custom_fields,tags) as (values
  ('VC-INK-GALAXY-TEE','Tinta Galaxy TEE Eco-Solvent','Tinta eco-solvente de la línea Galaxy TEE; mantener separada de sublimación y tinta acuosa. Compatibilidad exacta depende de tinta y cabezal confirmados.','Tinta eco-solvente','CAT-IMP-TINTAS','IMP_GRAN_FORMATO','botella','https://image.made-in-china.com/2f0j00oRkMGvcdMSqC/2-Years-Durability-Galaxy-Tee-Eco-Solvent-Ink-for-Dx4-Dx5-Dx7-I3200-XP600-Printheads.webp','{"technology":"eco-solvent","brand":"Galaxy","line":"TEE","source_status":"photo_identified_count_pending","count_scope":"photographed_supply_only","count_note":"2 Cyan, 3 Yellow, 1 Magenta explicitly reported by user; branch and shelf pending","compatibility_label_text":"Photo label lists DX4, DX5, DX7, I3200 and XP600; confirm exact formulation/head before use"}'::jsonb,ARRAY['tinta','eco-solvente','galaxy','tee']),
  ('VC-INK-GALAXY-DX-ECO','Tinta Galaxy DX-Eco','Botella observada con etiqueta Galaxy DX-Eco Eco Solvent Ink; color, presentación y existencia total por contar.','Tinta eco-solvente','CAT-IMP-TINTAS','IMP_GRAN_FORMATO','botella','https://tienda.suministrosag.mx/data/images/products/1694188979-TintaGalaxyDX4-DX5cian-min.jpg','{"technology":"eco-solvent","brand":"Galaxy","line":"DX-Eco","source_status":"photo_identified_count_pending","count_note":"Visible container is evidence of product only; total quantity and exact compatibility pending"}'::jsonb,ARRAY['tinta','eco-solvente','galaxy','dx-eco']),
  ('VC-INK-FUSION-SUB','Tinta FUSION para sublimación','Botellas FUSION con etiqueta de tinta para sublimación; las cuatro variantes de color se registran sin saldo hasta conteo.','Tinta de sublimación','CAT-SUB-TINTAS','Sublimación','botella',null,'{"technology":"sublimation","brand":"FUSION","source_status":"photo_identified_count_pending","compatibility_label_text":"Etiqueta indica Epson DX5, DX7, 5113, 4720 e i3200; confirmar modelo de impresora y tinta antes de cargar"}'::jsonb,ARRAY['tinta','sublimación','fusion','epson']),
  ('VC-INK-EPSON-T544','Tinta Epson T544','Botella Epson 544 Cyan visible en foto. Epson Ecuador lista T544 en cuatro colores y compatibilidad con EcoTank L3210.','Tinta acuosa para EcoTank','CAT-IMP-TINTAS','Impresión digital','botella','https://epson.com.ec/Para-el-hogar/Tintas/Botellas-de-Tinta-Epson-T544-AL/i/T544120-AL','{"technology":"aqueous-ink","brand":"Epson","ink_family":"T544","observed_color":"Cyan","photo_observed_count":1,"source_status":"photo_identified_count_pending","photo_count_is_total_stock":false,"compatible_models_verified":["EcoTank L3210"],"source_url":"https://epson.com.ec/i/C11CJ68301"}'::jsonb,ARRAY['tinta','epson','T544','ecotank'])
), items as (
  insert into public.inventory_items (organization_id,category_id,area_id,sku,name,description,base_unit,item_type,tags,reference_image_url,custom_fields,created_by)
  select org.id,cat.id,area.id,seed.sku,seed.name,seed.description,seed.base_unit,seed.item_type,seed.tags,seed.reference_image_url,seed.custom_fields,null
  from org cross join seed
  join public.inventory_categories cat on cat.organization_id=org.id and cat.code=seed.category_code
  left join public.areas area on area.organization_id=org.id and area.code=seed.area_code
  on conflict (organization_id,sku) do update set
    description=excluded.description,item_type=excluded.item_type,tags=excluded.tags,
    reference_image_url=coalesce(excluded.reference_image_url,public.inventory_items.reference_image_url),
    custom_fields=public.inventory_items.custom_fields || excluded.custom_fields,updated_at=now()
  returning id,organization_id,sku
), variant_seed(item_sku,color,observed_count) as (values
  ('VC-INK-GALAXY-TEE','Cyan',2),('VC-INK-GALAXY-TEE','Yellow',3),('VC-INK-GALAXY-TEE','Magenta',1),('VC-INK-GALAXY-TEE','Black',null),
  ('VC-INK-GALAXY-DX-ECO','Color por identificar',null),
  ('VC-INK-FUSION-SUB','Cyan',null),('VC-INK-FUSION-SUB','Magenta',null),('VC-INK-FUSION-SUB','Yellow',null),('VC-INK-FUSION-SUB','Black',null),
  ('VC-INK-EPSON-T544','Cyan',1),('VC-INK-EPSON-T544','Magenta',null),('VC-INK-EPSON-T544','Yellow',null),('VC-INK-EPSON-T544','Black',null)
)
insert into public.inventory_variants (organization_id,item_id,sku,label,attributes,active)
select org.id,item.id,item.sku||'-'||upper(regexp_replace(variant_seed.color,'[^A-Za-z0-9]+','-','g')),variant_seed.color,
  jsonb_build_object('color',variant_seed.color,'photo_observed_count',variant_seed.observed_count,'source_status','count_pending','stock_count_required',true,'count_is_stock',false),true
from org cross join variant_seed join items item on item.organization_id=org.id and item.sku=variant_seed.item_sku
on conflict (organization_id,sku) do update set
  label=excluded.label,
  attributes=public.inventory_variants.attributes || jsonb_build_object('source_status','count_pending','stock_count_required',true,'count_is_stock',false) ||
    case when excluded.attributes->>'photo_observed_count' is not null then jsonb_build_object('photo_observed_count',excluded.attributes->'photo_observed_count') else '{}'::jsonb end,
  active=true;

  select count(*) into v_item_count from public.inventory_items where organization_id=v_org and sku in ('VC-INK-GALAXY-TEE','VC-INK-GALAXY-DX-ECO','VC-INK-FUSION-SUB','VC-INK-EPSON-T544');
  select count(*) into v_variant_count from public.inventory_variants where organization_id=v_org and sku like 'VC-INK-%';
  return jsonb_build_object('items',v_item_count,'variants',v_variant_count,'stock_created',false);
end;
$$;
revoke all on function public.seed_visualcorp_ink_inventory() from public, anon;
grant execute on function public.seed_visualcorp_ink_inventory() to authenticated;

-- Only the two models whose plates are legible in the supplied photos are prefilled.
insert into public.equipment_assets (organization_id,area_id,asset_code,name,equipment_type,manufacturer,model,status,condition,notes,created_by)
select o.id,a.id,v.asset_code,v.name,v.equipment_type,v.manufacturer,v.model,'Por verificar','Sin revisar',v.notes,null
from public.organizations o
cross join (values
  ('EQ-RICOH-MPC3503','Ricoh MP C3503','Impresora láser / multifunción','Ricoh','MP C3503','Modelo legible en la foto. Sucursal, número de serie, accesorios y condición operativa pendientes.'),
  ('EQ-EPSON-L3210','Epson EcoTank L3210','Impresora de tinta','Epson','EcoTank L3210','Modelo legible en la foto. Sucursal, número de serie, condición y área de uso pendientes.')
) as v(asset_code,name,equipment_type,manufacturer,model,notes)
left join public.equipment_areas a on a.organization_id=o.id and a.code=case when v.manufacturer='Ricoh' then 'IMP_DIGITAL' else 'COMPUTO' end
where o.slug='visual-corp'
on conflict (organization_id,asset_code) do update set
  name=excluded.name,manufacturer=excluded.manufacturer,model=excluded.model,
  notes=public.equipment_assets.notes || ' ' || excluded.notes,updated_at=now();

