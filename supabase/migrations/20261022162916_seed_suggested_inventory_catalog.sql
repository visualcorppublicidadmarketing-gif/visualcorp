-- Seed the 70 suggested Visual Corp inventory articles as catalog records only.
-- No stock rows are created: physical quantities remain unknown until a count is confirmed.
with org as (select id from public.organizations where slug = 'visual-corp'),
area_seed(code,name) as (values
  ('IMP','Impresión'),
  ('SUB','Sublimación'),
  ('TRO','Troquelado'),
  ('LAS','Láser'),
  ('TAL','Taller'),
  ('NEO','Neones'),
  ('BOD','Bodega general')
) insert into public.areas (organization_id,code,name,active)
select org.id,area_seed.code,area_seed.name,true from org cross join area_seed
on conflict (organization_id,code) do update set name=excluded.name,active=true;

with org as (select id from public.organizations where slug='visual-corp'), area_seed(code,name) as (values
  ('IMP','Impresión'),
  ('SUB','Sublimación'),
  ('TRO','Troquelado'),
  ('LAS','Láser'),
  ('TAL','Taller'),
  ('NEO','Neones'),
  ('BOD','Bodega general')
) insert into public.inventory_categories (organization_id,parent_id,code,name,active)
select org.id,null,'AREA-'||area_seed.code,area_seed.name,true from org cross join area_seed
on conflict (organization_id,code) do update set name=excluded.name,active=true;

with org as (select id from public.organizations where slug='visual-corp'), category_seed(area_code,code,name) as (values
  ('IMP','CAT-IMP-PAPELER-A','Papelería'),
  ('IMP','CAT-IMP-VINILES','Viniles'),
  ('IMP','CAT-IMP-LONAS','Lonas'),
  ('IMP','CAT-IMP-TINTAS','Tintas'),
  ('IMP','CAT-IMP-ACABADOS','Acabados'),
  ('SUB','CAT-SUB-TAZAS','Tazas'),
  ('SUB','CAT-SUB-PAPELES','Papeles'),
  ('SUB','CAT-SUB-TINTAS','Tintas'),
  ('SUB','CAT-SUB-TEXTIL','Textil'),
  ('SUB','CAT-SUB-PROMOCIONALES','Promocionales'),
  ('SUB','CAT-SUB-PLACAS','Placas'),
  ('TRO','CAT-TRO-VINILES','Viniles'),
  ('TRO','CAT-TRO-TRANSFERENCIA','Transferencia'),
  ('TRO','CAT-TRO-ACABADOS','Acabados'),
  ('LAS','CAT-LAS-TABLEROS','Tableros'),
  ('LAS','CAT-LAS-PL-STICOS','Plásticos'),
  ('LAS','CAT-LAS-MADERAS','Maderas'),
  ('LAS','CAT-LAS-PAPELES','Papeles'),
  ('LAS','CAT-LAS-TEXTILES','Textiles'),
  ('LAS','CAT-LAS-REPUESTOS','Repuestos'),
  ('LAS','CAT-LAS-MUESTRAS','Muestras'),
  ('LAS','CAT-LAS-CONSUMIBLES','Consumibles'),
  ('TAL','CAT-TAL-ADHESIVOS','Adhesivos'),
  ('TAL','CAT-TAL-FIJACIONES','Fijaciones'),
  ('TAL','CAT-TAL-ELECTRICIDAD','Electricidad'),
  ('TAL','CAT-TAL-ACABADOS','Acabados'),
  ('TAL','CAT-TAL-CONSUMIBLES','Consumibles'),
  ('NEO','CAT-NEO-ILUMINACI-N','Iluminación'),
  ('NEO','CAT-NEO-ELECTRICIDAD','Electricidad'),
  ('NEO','CAT-NEO-CONECTORES','Conectores'),
  ('NEO','CAT-NEO-PL-STICOS','Plásticos'),
  ('NEO','CAT-NEO-ESTRUCTURAS','Estructuras'),
  ('BOD','CAT-BOD-EMPAQUE','Empaque'),
  ('BOD','CAT-BOD-ORGANIZACI-N','Organización'),
  ('BOD','CAT-BOD-SEGURIDAD','Seguridad'),
  ('BOD','CAT-BOD-LIMPIEZA','Limpieza')
) insert into public.inventory_categories (organization_id,parent_id,code,name,active)
select org.id,parent.id,category_seed.code,category_seed.name,true from org cross join category_seed
join public.inventory_categories parent on parent.organization_id=org.id and parent.code='AREA-'||category_seed.area_code
on conflict (organization_id,code) do update set name=excluded.name,active=true;

with org as (select id from public.organizations where slug='visual-corp'), row_seed(sku,name,area_code,category_code,category_name,detail,unit) as (values
  ('VC-INV-IMP-001','Papel bond','IMP','CAT-IMP-PAPELER-A','Papelería','','hoja'),
  ('VC-INV-IMP-002','Papel couché','IMP','CAT-IMP-PAPELER-A','Papelería','Gramaje por confirmar','hoja'),
  ('VC-INV-IMP-003','Papel adhesivo','IMP','CAT-IMP-PAPELER-A','Papelería','Acabado por confirmar','hoja'),
  ('VC-INV-IMP-004','Cartulina','IMP','CAT-IMP-PAPELER-A','Papelería','Color y gramaje por confirmar','hoja'),
  ('VC-INV-IMP-005','Vinil adhesivo','IMP','CAT-IMP-VINILES','Viniles','Ancho y acabado por confirmar','metro'),
  ('VC-INV-IMP-006','Vinil transparente','IMP','CAT-IMP-VINILES','Viniles','Ancho por confirmar','metro'),
  ('VC-INV-IMP-007','Lona estándar','IMP','CAT-IMP-LONAS','Lonas','Ancho por confirmar','metro'),
  ('VC-INV-IMP-008','Lona translúcida','IMP','CAT-IMP-LONAS','Lonas','Ancho por confirmar','metro'),
  ('VC-INV-IMP-009','Tinta de impresión','IMP','CAT-IMP-TINTAS','Tintas','Color y equipo compatibles por confirmar','ml'),
  ('VC-INV-IMP-010','Laminado protector','IMP','CAT-IMP-ACABADOS','Acabados','Tipo y ancho por confirmar','metro'),
  ('VC-INV-SUB-001','Taza blanca para sublimación','SUB','CAT-SUB-TAZAS','Tazas','Capacidad y acabado por confirmar','unidad'),
  ('VC-INV-SUB-002','Taza metalizada','SUB','CAT-SUB-TAZAS','Tazas','Color y capacidad por confirmar','unidad'),
  ('VC-INV-SUB-003','Taza mágica','SUB','CAT-SUB-TAZAS','Tazas','Color y capacidad por confirmar','unidad'),
  ('VC-INV-SUB-004','Papel para sublimación','SUB','CAT-SUB-PAPELES','Papeles','Formato por confirmar','hoja'),
  ('VC-INV-SUB-005','Tinta para sublimación','SUB','CAT-SUB-TINTAS','Tintas','Color y equipo compatibles por confirmar','ml'),
  ('VC-INV-SUB-006','Camiseta para sublimación','SUB','CAT-SUB-TEXTIL','Textil','Talla y color por confirmar','unidad'),
  ('VC-INV-SUB-007','Mouse pad sublimable','SUB','CAT-SUB-PROMOCIONALES','Promocionales','Medida por confirmar','unidad'),
  ('VC-INV-SUB-008','Llavero sublimable','SUB','CAT-SUB-PROMOCIONALES','Promocionales','Modelo por confirmar','unidad'),
  ('VC-INV-SUB-009','Botella sublimable','SUB','CAT-SUB-PROMOCIONALES','Promocionales','Material y capacidad por confirmar','unidad'),
  ('VC-INV-SUB-010','Placa sublimable','SUB','CAT-SUB-PLACAS','Placas','Material y medida por confirmar','unidad'),
  ('VC-INV-TRO-001','Vinil adhesivo','TRO','CAT-TRO-VINILES','Viniles','Color, acabado y ancho por confirmar','metro'),
  ('VC-INV-TRO-002','Vinil textil','TRO','CAT-TRO-VINILES','Viniles','Color y ancho por confirmar','metro'),
  ('VC-INV-TRO-003','Vinil reflectivo','TRO','CAT-TRO-VINILES','Viniles','Color y ancho por confirmar','metro'),
  ('VC-INV-TRO-004','Vinil esmerilado','TRO','CAT-TRO-VINILES','Viniles','Ancho por confirmar','metro'),
  ('VC-INV-TRO-005','Vinil microperforado','TRO','CAT-TRO-VINILES','Viniles','Ancho por confirmar','metro'),
  ('VC-INV-TRO-006','Vinil transparente','TRO','CAT-TRO-VINILES','Viniles','Ancho por confirmar','metro'),
  ('VC-INV-TRO-007','Cinta de transferencia','TRO','CAT-TRO-TRANSFERENCIA','Transferencia','Ancho por confirmar','metro'),
  ('VC-INV-TRO-008','Laminado para vinil','TRO','CAT-TRO-ACABADOS','Acabados','Tipo y ancho por confirmar','metro'),
  ('VC-INV-TRO-009','Máscara de transferencia','TRO','CAT-TRO-TRANSFERENCIA','Transferencia','Ancho por confirmar','metro'),
  ('VC-INV-TRO-010','Papel transportador','TRO','CAT-TRO-TRANSFERENCIA','Transferencia','Ancho por confirmar','metro'),
  ('VC-INV-LAS-001','MDF para corte láser','LAS','CAT-LAS-TABLEROS','Tableros','Espesor y formato por confirmar','hoja'),
  ('VC-INV-LAS-002','Acrílico para corte láser','LAS','CAT-LAS-PL-STICOS','Plásticos','Color, espesor y formato por confirmar','hoja'),
  ('VC-INV-LAS-003','Triplay para corte láser','LAS','CAT-LAS-MADERAS','Maderas','Espesor y formato por confirmar','hoja'),
  ('VC-INV-LAS-004','Cartón para corte láser','LAS','CAT-LAS-PAPELES','Papeles','Tipo y formato por confirmar','hoja'),
  ('VC-INV-LAS-005','Cuero sintético para grabado','LAS','CAT-LAS-TEXTILES','Textiles','Color y formato por confirmar','hoja'),
  ('VC-INV-LAS-006','Papel para corte láser','LAS','CAT-LAS-PAPELES','Papeles','Tipo y formato por confirmar','hoja'),
  ('VC-INV-LAS-007','Repuesto de lente láser','LAS','CAT-LAS-REPUESTOS','Repuestos','Diámetro y equipo compatibles por confirmar','unidad'),
  ('VC-INV-LAS-008','Repuesto de espejo láser','LAS','CAT-LAS-REPUESTOS','Repuestos','Medida y equipo compatibles por confirmar','unidad'),
  ('VC-INV-LAS-009','Material de prueba para grabado','LAS','CAT-LAS-MUESTRAS','Muestras','Material por confirmar','unidad'),
  ('VC-INV-LAS-010','Material de enmascarado','LAS','CAT-LAS-CONSUMIBLES','Consumibles','Tipo y ancho por confirmar','metro'),
  ('VC-INV-TAL-001','Silicona transparente','TAL','CAT-TAL-ADHESIVOS','Adhesivos','Presentación por confirmar','unidad'),
  ('VC-INV-TAL-002','Silicona blanca','TAL','CAT-TAL-ADHESIVOS','Adhesivos','Presentación por confirmar','unidad'),
  ('VC-INV-TAL-003','Silicona negra','TAL','CAT-TAL-ADHESIVOS','Adhesivos','Presentación por confirmar','unidad'),
  ('VC-INV-TAL-004','Pegamento de contacto','TAL','CAT-TAL-ADHESIVOS','Adhesivos','Presentación por confirmar','unidad'),
  ('VC-INV-TAL-005','Tornillos','TAL','CAT-TAL-FIJACIONES','Fijaciones','Tipo y medida por confirmar','unidad'),
  ('VC-INV-TAL-006','Pernos','TAL','CAT-TAL-FIJACIONES','Fijaciones','Tipo y medida por confirmar','unidad'),
  ('VC-INV-TAL-007','Cable eléctrico','TAL','CAT-TAL-ELECTRICIDAD','Electricidad','Calibre y color por confirmar','metro'),
  ('VC-INV-TAL-008','Pintura','TAL','CAT-TAL-ACABADOS','Acabados','Tipo y color por confirmar','litro'),
  ('VC-INV-TAL-009','Discos de corte','TAL','CAT-TAL-CONSUMIBLES','Consumibles','Diámetro y material por confirmar','unidad'),
  ('VC-INV-TAL-010','Brocas','TAL','CAT-TAL-CONSUMIBLES','Consumibles','Diámetro y material por confirmar','unidad'),
  ('VC-INV-NEO-001','Manguera neón LED','NEO','CAT-NEO-ILUMINACI-N','Iluminación','Color y voltaje por confirmar','metro'),
  ('VC-INV-NEO-002','Tira LED','NEO','CAT-NEO-ILUMINACI-N','Iluminación','Color, densidad y voltaje por confirmar','metro'),
  ('VC-INV-NEO-003','Fuente de alimentación LED','NEO','CAT-NEO-ELECTRICIDAD','Electricidad','Voltaje y potencia por confirmar','unidad'),
  ('VC-INV-NEO-004','Cable para neón','NEO','CAT-NEO-ELECTRICIDAD','Electricidad','Calibre por confirmar','metro'),
  ('VC-INV-NEO-005','Conector para iluminación LED','NEO','CAT-NEO-CONECTORES','Conectores','Modelo por confirmar','unidad'),
  ('VC-INV-NEO-006','Controlador LED','NEO','CAT-NEO-ELECTRICIDAD','Electricidad','Compatibilidad por confirmar','unidad'),
  ('VC-INV-NEO-007','Acrílico para letrero luminoso','NEO','CAT-NEO-PL-STICOS','Plásticos','Color, espesor y formato por confirmar','hoja'),
  ('VC-INV-NEO-008','Perfil para letrero luminoso','NEO','CAT-NEO-ESTRUCTURAS','Estructuras','Tipo y medida por confirmar','metro'),
  ('VC-INV-NEO-009','Cinta aislante','NEO','CAT-NEO-ELECTRICIDAD','Electricidad','Color y ancho por confirmar','unidad'),
  ('VC-INV-NEO-010','Terminal eléctrico','NEO','CAT-NEO-CONECTORES','Conectores','Tipo y calibre por confirmar','unidad'),
  ('VC-INV-BOD-001','Cinta de embalaje','BOD','CAT-BOD-EMPAQUE','Empaque','Ancho por confirmar','unidad'),
  ('VC-INV-BOD-002','Cartón para empaque','BOD','CAT-BOD-EMPAQUE','Empaque','Formato por confirmar','hoja'),
  ('VC-INV-BOD-003','Fundas para despacho','BOD','CAT-BOD-EMPAQUE','Empaque','Tamaño y material por confirmar','unidad'),
  ('VC-INV-BOD-004','Etiquetas de identificación','BOD','CAT-BOD-ORGANIZACI-N','Organización','Formato por confirmar','unidad'),
  ('VC-INV-BOD-005','Guantes de protección','BOD','CAT-BOD-SEGURIDAD','Seguridad','Material y talla por confirmar','par'),
  ('VC-INV-BOD-006','Mascarillas de protección','BOD','CAT-BOD-SEGURIDAD','Seguridad','Tipo por confirmar','unidad'),
  ('VC-INV-BOD-007','Alcohol de limpieza','BOD','CAT-BOD-LIMPIEZA','Limpieza','Concentración y presentación por confirmar','litro'),
  ('VC-INV-BOD-008','Paños de limpieza','BOD','CAT-BOD-LIMPIEZA','Limpieza','Material por confirmar','unidad'),
  ('VC-INV-BOD-009','Marcadores permanentes','BOD','CAT-BOD-ORGANIZACI-N','Organización','Colores y puntas por confirmar','unidad'),
  ('VC-INV-BOD-010','Bolsas resellables','BOD','CAT-BOD-EMPAQUE','Empaque','Tamaño por confirmar','unidad')
) insert into public.inventory_items (organization_id,category_id,area_id,sku,name,description,base_unit,minimum_quantity,active)
select org.id,category.id,area.id,row_seed.sku,row_seed.name,
  concat_ws(' · ', nullif(row_seed.category_name,''), case when row_seed.detail<>'' then 'Especificación por confirmar: '||row_seed.detail end, 'Artículo sugerido; existencia física por confirmar'),
  row_seed.unit,0,true
from org cross join row_seed
join public.areas area on area.organization_id=org.id and area.code=row_seed.area_code
join public.inventory_categories category on category.organization_id=org.id and category.code=row_seed.category_code
on conflict (organization_id,sku) do update set name=excluded.name,description=excluded.description,base_unit=excluded.base_unit,updated_at=now();

with org as (select id from public.organizations where slug='visual-corp')
insert into public.inventory_variants (organization_id,item_id,sku,label,attributes,active)
select org.id,item.id,item.sku||'-01',
  coalesce(nullif(split_part(item.description,'Especificación por confirmar: ',2),'Artículo sugerido; existencia física por confirmar'),''),
  jsonb_build_object('source_status','catalog_suggestion','stock_count_required',true),true
from org join public.inventory_items item on item.organization_id=org.id and item.sku like 'VC-INV-%'
on conflict (organization_id,sku) do update set label=excluded.label,attributes=excluded.attributes,active=true;
