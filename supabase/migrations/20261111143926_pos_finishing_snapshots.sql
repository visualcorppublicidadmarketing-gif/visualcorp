-- Keep structured finishing details with the sale line so POS history can
-- reconstruct eyelets and design charges without relying on description text.
alter table public.sale_lines
  add column if not exists finishing_options jsonb not null default '{}'::jsonb;
alter table public.sale_lines
  drop constraint if exists sale_lines_finishing_options_check;
alter table public.sale_lines
  add constraint sale_lines_finishing_options_check
  check (jsonb_typeof(finishing_options)='object');

-- Preserve the vetted idempotent sale implementation and persist the snapshot
-- from each line payload before its recipe-consumption trigger runs.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb)'::regprocedure);
  v_old text := $old$insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,client_line_key,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total,material_requests)
    values (v_org,v_sale,v_variant,v_product,nullif(trim(v_line->>'line_key'),''),coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2),coalesce(v_line->'material_requests','[]'::jsonb));$old$;
  v_new text := $new$    insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,client_line_key,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total,material_requests,finishing_options)
    values (v_org,v_sale,v_variant,v_product,nullif(trim(v_line->>'line_key'),''),coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2),coalesce(v_line->'material_requests','[]'::jsonb),coalesce(v_line->'finishing_options','{}'::jsonb));$new$;
begin
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_old := replace(v_old,E'\r\n',E'\n');
  v_new := replace(v_new,E'\r\n',E'\n');
  if strpos(v_definition,v_old)=0 then
    raise exception 'No se pudo adaptar la función POS para guardar acabados; cambió el bloque de inserción de líneas.';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$migration$;

-- Preserve finishing and explicit material inputs when an authorized POS edit
-- replaces a confirmed sale's lines.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.amend_confirmed_pos_sale(uuid,uuid,jsonb,numeric,text,text,jsonb,jsonb,text)'::regprocedure);
  v_old_columns text := $old$unit_price, line_total
      ) values (
        v_sale.organization_id,$old$;
  v_new_columns text := $new$unit_price, line_total, material_requests, finishing_options
      ) values (
        v_sale.organization_id,$new$;
  v_old_values text := $old$        round(v_quantity * v_price, 2)
      );$old$;
  v_new_values text := $new$        round(v_quantity * v_price, 2),
        case when jsonb_typeof(v_line->'material_requests')='array' then v_line->'material_requests' else '[]'::jsonb end,
        case when jsonb_typeof(v_line->'finishing_options')='object' then v_line->'finishing_options' else '{}'::jsonb end
      );$new$;
  v_old_guard text := $old$  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    -- Revertir stock de líneas anteriores$old$;
  v_new_guard text := $new$  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    if exists (
      select 1 from public.sale_material_consumptions c
      where c.organization_id=v_sale.organization_id and c.sale_id=v_sale.id
    ) or exists (
      select 1
      from jsonb_array_elements(p_lines) entry(value)
      join public.catalog_material_recipes r
        on r.organization_id=v_sale.organization_id
       and r.catalog_product_id=entry.value->>'catalog_product_id'
       and r.branch_id=v_sale.branch_id and r.active
    ) then
      raise exception 'Esta venta usa materiales controlados por receta. No reemplaces sus líneas desde el editor; conserva la trazabilidad del consumo y gestiona cualquier corrección desde operaciones.' using errcode='22023';
    end if;
    -- Revertir stock de líneas anteriores$new$;
begin
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_old_columns := replace(v_old_columns,E'\r\n',E'\n');
  v_new_columns := replace(v_new_columns,E'\r\n',E'\n');
  v_old_values := replace(v_old_values,E'\r\n',E'\n');
  v_new_values := replace(v_new_values,E'\r\n',E'\n');
  v_old_guard := replace(v_old_guard,E'\r\n',E'\n');
  v_new_guard := replace(v_new_guard,E'\r\n',E'\n');
  if strpos(v_definition,v_old_columns)=0 or strpos(v_definition,v_old_values)=0 or strpos(v_definition,v_old_guard)=0 then
    raise exception 'No se pudo adaptar la función de edición POS para conservar acabados y consumos; cambió el bloque de inserción de líneas.';
  end if;
  v_definition := replace(v_definition,v_old_columns,v_new_columns);
  v_definition := replace(v_definition,v_old_values,v_new_values);
  v_definition := replace(v_definition,v_old_guard,v_new_guard);
  execute v_definition;
end;
$migration$;
