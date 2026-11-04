-- Allow an operator to enter the actual quantity of a configurable finishing
-- material for each POS line. This is opt-in per recipe and never infers stock.
alter table public.catalog_material_recipes
  drop constraint if exists catalog_material_recipes_calculation_mode_check;
alter table public.catalog_material_recipes
  add constraint catalog_material_recipes_calculation_mode_check
  check (calculation_mode in ('per_billed_unit','area_to_linear','explicit_quantity'));

alter table public.sale_material_consumptions
  drop constraint if exists sale_material_consumptions_calculation_mode_check;
alter table public.sale_material_consumptions
  add constraint sale_material_consumptions_calculation_mode_check
  check (calculation_mode in ('per_billed_unit','area_to_linear','explicit_quantity'));

alter table public.sale_lines
  add column if not exists material_requests jsonb not null default '[]'::jsonb;
alter table public.sale_lines
  drop constraint if exists sale_lines_material_requests_check;
alter table public.sale_lines
  add constraint sale_lines_material_requests_check
  check (jsonb_typeof(material_requests)='array' and jsonb_array_length(material_requests)<=25);

-- Preserve the vetted idempotent sale implementation and make its line insert
-- persist the validated request payload before the AFTER INSERT stock trigger.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb)'::regprocedure);
v_old text := $old$    insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,client_line_key,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total)
    values (v_org,v_sale,v_variant,v_product,nullif(trim(v_line->>'line_key'),''),coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2));$old$;
  v_new text := $new$insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,client_line_key,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total,material_requests)
    values (v_org,v_sale,v_variant,v_product,nullif(trim(v_line->>'line_key'),''),coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2),coalesce(v_line->'material_requests','[]'::jsonb));$new$;
begin
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_old := replace(v_old,E'\r\n',E'\n');
  v_new := replace(v_new,E'\r\n',E'\n');
  if strpos(v_definition,v_old)=0 then
    raise exception 'No se pudo adaptar la función POS: cambió el bloque de inserción de líneas.';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$migration$;

-- Keep the established movement, reservation, and backorder rules while using
-- the operator's per-order amount for explicitly configured finishing recipes.
do $migration$
declare
  v_definition text := pg_get_functiondef('app_private.consume_catalog_recipe_materials()'::regprocedure);
v_old text := $old$    if v_recipe.calculation_mode='per_billed_unit' then
      v_required := ceil((new.quantity*v_recipe.quantity_per_basis)*1000)/1000;
    else
      v_width_cm := nullif(v_recipe.attributes->>'width_cm','')::numeric;
      if v_width_cm is null or v_width_cm<=0 then
        raise exception 'La receta por área necesita una variante de rollo con ancho confirmado.';
      end if;
      if lower(v_recipe.base_unit) not in ('metro','metros','m','m lineal','metro lineal') then
        raise exception 'La salida de una receta por área requiere un material contado en metros lineales.';
      end if;
      v_required := ceil((new.quantity/(v_width_cm/100)*v_recipe.quantity_per_basis*(1+v_recipe.waste_percent/100))*1000)/1000;
    end if;$old$;
  v_new text := $new$if v_recipe.calculation_mode='explicit_quantity' then
      if (select count(*) from jsonb_array_elements(new.material_requests) entry(value)
          where entry.value->>'recipe_id'=v_recipe.id::text)<>1 then
        raise exception 'Ingresa una sola cantidad explícita para cada acabado variable.' using errcode='22023';
      end if;
      select nullif(entry.value->>'quantity','')::numeric into v_required
      from jsonb_array_elements(new.material_requests) entry(value)
      where entry.value->>'recipe_id'=v_recipe.id::text;
      if v_required is null or v_required<=0 or v_required>1000000 then
        raise exception 'Ingresa una cantidad total válida para cada acabado variable.' using errcode='22023';
      end if;
    elsif v_recipe.calculation_mode='per_billed_unit' then
      v_required := ceil((new.quantity*v_recipe.quantity_per_basis)*1000)/1000;
    else
      v_width_cm := nullif(v_recipe.attributes->>'width_cm','')::numeric;
      if v_width_cm is null or v_width_cm<=0 then
        raise exception 'La receta por área necesita una variante de rollo con ancho confirmado.';
      end if;
      if lower(v_recipe.base_unit) not in ('metro','metros','m','m lineal','metro lineal') then
        raise exception 'La salida de una receta por área requiere que el material esté contado en metros lineales.';
      end if;
      v_required := ceil((new.quantity/(v_width_cm/100)*v_recipe.quantity_per_basis*(1+v_recipe.waste_percent/100))*1000)/1000;
    end if;$new$;
begin
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_old := replace(v_old,E'\r\n',E'\n');
  v_new := replace(v_new,E'\r\n',E'\n');
  if strpos(v_definition,v_old)=0 then
    raise exception 'No se pudo adaptar el consumo POS: cambió el bloque de cálculo de recetas.';
  end if;
  execute replace(v_definition,v_old,v_new);
end;
$migration$;
