-- P5: LOCAL migration. No remote application or business data seeding.
alter table public.purchase_order_lines alter column unit_cost drop not null;
alter table public.purchase_receipt_lines add column cost_review_required boolean not null default false;
alter table public.inventory_active_rolls
  add column purchase_order_line_id uuid references public.purchase_order_lines(id),
  add column purchase_receipt_line_id uuid references public.purchase_receipt_lines(id);
create index inventory_rolls_purchase_line_idx on public.inventory_active_rolls(purchase_order_line_id) where purchase_order_line_id is not null;
alter table public.inventory_movements add column equipment_asset_id uuid;
alter table public.inventory_movements add constraint movement_equipment_scope_fk foreign key(equipment_asset_id,organization_id) references public.equipment_assets(id,organization_id);
alter table public.inventory_movement_cost_snapshots add column equipment_asset_id uuid;
alter table public.inventory_movement_cost_snapshots add constraint cost_equipment_scope_fk foreign key(equipment_asset_id,organization_id) references public.equipment_assets(id,organization_id);
alter table public.inventory_movement_cost_snapshots drop constraint inventory_movement_cost_snapshots_reference_type_check;
alter table public.inventory_movement_cost_snapshots add constraint inventory_movement_cost_snapshots_reference_type_check check(reference_type in ('sale','production_order','production_job','production_job_scrap'));
alter table public.purchase_orders add column closed_at timestamptz, add column closed_by uuid references auth.users(id), add column closure_reason text not null default '';
alter table public.purchase_orders drop constraint purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check check(status in ('draft','ordered','partially_received','received','cancelled','closed_partial'));
drop index public.purchase_orders_request_unique;
create unique index purchase_orders_request_unique on public.purchase_orders(purchase_request_id) where purchase_request_id is not null and status<>'cancelled';
alter table public.purchase_request_events drop constraint purchase_request_events_event_key_check;
alter table public.purchase_request_events add constraint purchase_request_events_event_key_check check(event_key in ('submitted','approved','rejected','quote_registered','quote_selected','order_created','cancelled','order_cancelled','order_closed'));

create or replace function app_private.receive_purchase_roll(
  p_variant_id uuid,
  p_branch_id uuid,
  p_location_code text,
  p_roll_tag text,
  p_nominal_length_m numeric,
  p_nominal_width_cm numeric,
  p_remaining_m numeric default null,
  p_remaining_percent numeric default null,
  p_operator text default '',
  p_reason text default '',
  p_work_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_item record;
  v_location text := coalesce(nullif(trim(p_location_code), ''), 'MAIN');
  v_nominal numeric(10,2);
  v_remaining numeric(14,3);
  v_percent numeric(5,2);
  v_family text;
  v_width numeric(10,2);
  v_roll_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión para recibir un rollo.'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Indica el motivo de recepción.'; end if;
  if p_nominal_length_m is not null and p_nominal_length_m <= 0 then raise exception 'El largo nominal, si se conoce, debe ser mayor que cero.'; end if;
  v_nominal := case when p_nominal_length_m is null then null else round(p_nominal_length_m, 2) end;
  if v_nominal is not null and v_nominal <= 0 then raise exception 'El largo nominal redondeado debe ser mayor que cero.'; end if;
  if p_nominal_width_cm is null or p_nominal_width_cm <= 0 then raise exception 'Indica el ancho físico del rollo en centímetros.'; end if;
  v_width := round(p_nominal_width_cm, 2);
  if (p_remaining_m is null) = (p_remaining_percent is null) then
    raise exception 'Indica los metros restantes o el porcentaje, pero no ambos.';
  end if;
  if p_remaining_m is not null then
    v_remaining := round(p_remaining_m, 3);
  else
    if v_nominal is null then raise exception 'El porcentaje requiere un largo nominal.'; end if;
    if p_remaining_percent < 0 or p_remaining_percent > 100 then raise exception 'El porcentaje debe estar entre 0 y 100.'; end if;
    v_remaining := round(v_nominal * p_remaining_percent / 100, 3);
  end if;
  if v_remaining <= 0 or (v_nominal is not null and v_remaining > v_nominal) then raise exception 'Los metros restantes deben ser mayores que cero y no superar el largo nominal.'; end if;
  v_percent := case when v_nominal is null then null else round(v_remaining * 100 / v_nominal, 2) end;

  select i.organization_id, i.name, i.base_unit, i.custom_fields, v.id as variant_id, v.label as variant_label, v.attributes,
         coalesce(i.custom_fields->>'material_family', v.attributes->>'material_family', '') as family
    into v_item
    from public.inventory_variants v
    join public.inventory_items i on i.id = v.item_id and i.organization_id = v.organization_id
    join public.branches b on b.id = p_branch_id and b.organization_id = i.organization_id and b.active
   where v.id = p_variant_id and v.active and i.active
   for update of v;
  if not found then raise exception 'No se encontró una variante activa en la sucursal.'; end if;
  v_org := v_item.organization_id;
  if not app_private.has_visualcorp_access(v_org, 'purchases', 'receive_purchase', p_branch_id) then
    raise exception 'No tienes permisos para recibir rollos en esta sucursal.';
  end if;
  if coalesce(v_item.custom_fields->>'inventory_model','') <> 'roll' then
    raise exception 'Este material no está configurado como inventario de rollos.';
  end if;
  if lower(trim(v_item.base_unit)) not in ('m','metro','metros','metro lineal','metros lineales') then
    raise exception 'La variante debe manejar existencias en metros lineales.';
  end if;
  if nullif(v_item.attributes->>'width_cm','') is not null then
    if abs((v_item.attributes->>'width_cm')::numeric-v_width) > 0.01 then
      raise exception 'El ancho indicado no coincide con el ancho de la variante elegida.';
    end if;
  else
    if exists (
      select 1 from public.inventory_active_rolls r
       where r.organization_id=v_org and r.variant_id=v_item.variant_id
         and r.nominal_width_cm is not null and abs(r.nominal_width_cm-v_width)>0.01
    ) then
      raise exception 'Esta variante ya tiene rollos de otro ancho. Crea o selecciona una variante por ancho para no mezclar saldos.';
    end if;
    update public.inventory_variants v
       set attributes=coalesce(v.attributes,'{}'::jsonb)||jsonb_build_object('width_cm',v_width,'width_unit','cm','width_locked_from_roll_receipt',true),
           label=case
             when coalesce(v.label,'')='' then 'Ancho '||trim(to_char(v_width,'FM999990.00'))||' cm'
             when v.label ~* 'ancho por confirmar' then regexp_replace(v.label,'ancho por confirmar','Ancho '||trim(to_char(v_width,'FM999990.00'))||' cm','i')
             else v.label
           end
     where v.id=v_item.variant_id and v.organization_id=v_org;
  end if;
  if not exists (select 1 from public.inventory_locations l where l.organization_id=v_org and l.branch_id=p_branch_id and l.code=v_location and l.active) then
    raise exception 'La ubicación no está registrada como activa en esta sucursal.';
  end if;
  v_family := case when lower(v_item.family) like '%lona%' then 'lona'
                   when lower(v_item.family) like '%vinil%' then 'vinil'
                   when lower(v_item.family) like '%papel%' then 'papel' else 'otro' end;

  insert into public.inventory_active_rolls (
    organization_id, branch_id, variant_id, location_code, machine_name, material_name,
    material_family, roll_tag, standard_length_m, remaining_percent, status,
    operator_name, notes, nominal_width_cm, remaining_m, remaining_is_estimate, roll_state
  ) values (
    v_org, p_branch_id, p_variant_id, v_location, '', v_item.name, v_family,
    coalesce(trim(p_roll_tag), ''), v_nominal, v_percent, 'en_bodega',
    coalesce(trim(p_operator), ''), trim(p_reason), v_width, v_remaining, p_remaining_percent is not null, 'bodega'
  ) returning id into v_roll_id;

  insert into public.inventory_movements (
    organization_id, variant_id, branch_id, location_code, movement_type,
    quantity_delta, reason, reference_type, reference_id, created_by
  ) values (
    v_org, p_variant_id, p_branch_id, v_location, 'receipt', v_remaining,
    trim(p_reason), 'inventory_roll', v_roll_id, v_user
  );
  insert into public.inventory_roll_logs (
    organization_id, roll_id, previous_percent, new_percent, operator_name, notes,
    created_by, previous_m, new_m, event_type, reason, work_reference, previous_state, new_state
  ) values (
    v_org, v_roll_id, null, v_percent, coalesce(trim(p_operator), ''), trim(p_reason),
    v_user, 0, v_remaining, 'receive', trim(p_reason), coalesce(trim(p_work_reference), ''), null, 'bodega'
  );
  return jsonb_build_object('success',true,'roll_id',v_roll_id,'remaining_m',v_remaining,'remaining_percent',v_percent,'nominal_width_cm',v_width,'roll_state','bodega','remaining_is_estimate',p_remaining_percent is not null);
end;
$$;
revoke all on function app_private.receive_purchase_roll(uuid,uuid,text,text,numeric,numeric,numeric,numeric,text,text,text) from public,anon,authenticated;
create or replace function app_private.receive_purchase_order(
  p_order_id uuid, p_lines jsonb, p_idempotency_key uuid, p_reference text default '', p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_org uuid; v_branch uuid; v_status text; v_receipt uuid; v_existing_order uuid; v_line jsonb;
  v_po_line uuid; v_qty numeric; v_rejected numeric; v_discrepancy text; v_location text;
  v_model text; v_roll jsonb; v_roll_result jsonb; v_roll_total numeric; v_receipt_line uuid;
  v_variant uuid; v_cost numeric; v_supplier text; v_pending numeric;
begin
  select organization_id,branch_id,status into v_org,v_branch,v_status
    from public.purchase_orders where id=p_order_id for update;
  if v_org is null or v_uid is null or not app_private.has_visualcorp_access(v_org,'purchases','receive_purchase',v_branch) then
    raise exception 'No tienes permiso para recibir esta orden.' using errcode='42501';
  end if;
  if p_idempotency_key is null then raise exception 'Falta la clave de idempotencia.' using errcode='22023'; end if;
  select id,purchase_order_id into v_receipt,v_existing_order
    from public.purchase_receipts where organization_id=v_org and idempotency_key=p_idempotency_key;
  if v_receipt is not null then
    if v_existing_order<>p_order_id then raise exception 'La clave de recepción ya pertenece a otra orden.' using errcode='22023'; end if;
    return v_receipt;
  end if;
  if v_status not in ('ordered','partially_received') then
    raise exception 'Solo se reciben órdenes enviadas o parcialmente recibidas.' using errcode='22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'La recepción debe incluir al menos un artículo.' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) line
    group by line->>'purchase_order_line_id' having count(*)>1
  ) then raise exception 'Cada línea de orden debe aparecer una sola vez en la recepción.' using errcode='22023'; end if;
  insert into public.purchase_receipts(organization_id,purchase_order_id,idempotency_key,reference,note,received_by)
  values(v_org,p_order_id,p_idempotency_key,left(coalesce(p_reference,''),180),left(coalesce(p_note,''),2000),v_uid)
  returning id into v_receipt;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_po_line := (v_line->>'purchase_order_line_id')::uuid;
    v_qty := coalesce(nullif(v_line->>'quantity_received','')::numeric,0);
    v_rejected := coalesce(nullif(v_line->>'quantity_rejected','')::numeric,0);
    v_discrepancy := left(btrim(coalesce(v_line->>'discrepancy_note','')),600);
    v_location := coalesce(nullif(left(btrim(v_line->>'location_code'),80),''),'MAIN');
    if v_qty<0 or v_rejected<0 or v_qty+v_rejected<=0 then
      raise exception 'Registra una cantidad aceptada o rechazada mayor a cero.' using errcode='22023';
    end if;
    if v_rejected>0 and char_length(v_discrepancy)<3 then
      raise exception 'Describe el motivo de cada cantidad rechazada.' using errcode='22023';
    end if;
    select l.variant_id,l.unit_cost,l.quantity_ordered-l.quantity_received,s.name
      into v_variant,v_cost,v_pending,v_supplier
      from public.purchase_order_lines l
      join public.purchase_orders o on o.id=l.purchase_order_id and o.organization_id=l.organization_id
      join public.suppliers s on s.id=o.supplier_id and s.organization_id=o.organization_id
      where l.id=v_po_line and l.purchase_order_id=p_order_id and l.organization_id=v_org for update of l;
    if v_variant is null then raise exception 'La línea no pertenece a esta orden.' using errcode='22023'; end if;
    if not exists(select 1 from public.inventory_locations where organization_id=v_org and branch_id=v_branch and code=v_location and active) then raise exception 'Selecciona una ubicación activa de esta sucursal.'; end if;
    if v_qty+v_rejected>v_pending then raise exception 'La cantidad aceptada y rechazada supera el saldo pendiente.' using errcode='22023'; end if;
    insert into public.purchase_receipt_lines(organization_id,receipt_id,purchase_order_line_id,quantity_received,quantity_rejected,discrepancy_note,location_code,cost_review_required)
    values(v_org,v_receipt,v_po_line,v_qty,v_rejected,v_discrepancy,v_location,v_cost is null or not app_private.has_visualcorp_access(v_org,'inventory_costs','edit_costs',v_branch)) returning id into v_receipt_line;
    if v_qty>0 then
      update public.purchase_order_lines set quantity_received=quantity_received+v_qty where id=v_po_line and organization_id=v_org;
      select i.custom_fields->>'inventory_model' into v_model from public.inventory_variants v join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id where v.id=v_variant;
      if v_model='roll' then
        if jsonb_typeof(v_line->'rolls') is distinct from 'array' or jsonb_array_length(v_line->'rolls') not between 1 and 100 then raise exception 'Identifica cada rollo recibido.'; end if;
        v_roll_total:=0;
        for v_roll in select value from jsonb_array_elements(v_line->'rolls') loop
          if nullif(btrim(v_roll->>'roll_tag'),'') is null then raise exception 'Identifica la etiqueta de cada rollo.'; end if;
          v_roll_result:=app_private.receive_purchase_roll(v_variant,v_branch,v_location,v_roll->>'roll_tag',nullif(v_roll->>'nominal_length_m','')::numeric,(v_roll->>'width_cm')::numeric,(v_roll->>'remaining_m')::numeric,null,'','Recepción de compra '||p_order_id::text,p_reference);
          update public.inventory_active_rolls set purchase_order_line_id=v_po_line,purchase_receipt_line_id=v_receipt_line where id=(v_roll_result->>'roll_id')::uuid;
          v_roll_total:=v_roll_total+(v_roll_result->>'remaining_m')::numeric;
        end loop;
        if v_roll_total<>v_qty then raise exception 'Los metros individuales no coinciden con la cantidad aceptada.'; end if;
      else
        if jsonb_array_length(coalesce(v_line->'rolls','[]'::jsonb))>0 then raise exception 'Solo los materiales de rollo admiten rollos individuales.'; end if;
        insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
        values(v_org,v_variant,v_branch,v_location,'receipt',v_qty,'Recepción aceptada de orden de compra '||p_order_id::text,'purchase_receipt',v_receipt,v_uid);
      end if;
      update public.inventory_variants set attributes=(coalesce(attributes,'{}'::jsonb)-'opening_balance_intentional')||jsonb_build_object('stock_count_required',false,'source_status','receipt_confirmed','receipt_confirmed_at',now()) where id=v_variant and organization_id=v_org;
      if v_cost is not null and app_private.has_visualcorp_access(v_org,'inventory_costs','edit_costs',v_branch) then
        insert into public.inventory_item_costs(organization_id,variant_id,unit_cost,currency,supplier_name,updated_by,updated_at)
        values(v_org,v_variant,v_cost,'USD',v_supplier,v_uid,now())
        on conflict(organization_id,variant_id) do update set unit_cost=excluded.unit_cost,currency='USD',supplier_name=excluded.supplier_name,updated_by=v_uid,updated_at=now();
      end if;
    end if;
  end loop;
  update public.purchase_orders o set status=case
    when not exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=o.id and l.organization_id=o.organization_id and l.quantity_received<l.quantity_ordered) then 'received'
    when exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=o.id and l.quantity_received>0) then 'partially_received' else 'ordered' end,updated_at=now()
  where o.id=p_order_id and o.organization_id=v_org;
  return v_receipt;
end;
$$;
create or replace function app_private.capture_inventory_consumption_cost()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_unit_cost numeric(14,4);
  v_cost_updated_at timestamptz;
  v_source text;
begin
  if new.movement_type not in ('consumption','waste')
     or new.quantity_delta>=0
     or new.reference_type is null
     or new.reference_type not in ('sale','production_order','production_job','production_job_scrap')
     or new.reference_id is null then
    return new;
  end if;

  if new.reference_type='sale' and not exists (
    select 1 from public.sales s
    where s.id=new.reference_id and s.organization_id=new.organization_id and s.branch_id=new.branch_id
  ) then
    raise exception 'El consumo de material debe vincularse con una venta de la misma sucursal.';
  elsif new.reference_type='production_order' and not exists (
    select 1 from public.production_orders po
    where po.id=new.reference_id and po.organization_id=new.organization_id and po.branch_id=new.branch_id
  ) then
    raise exception 'El consumo de material debe vincularse con una orden de producción de la misma sucursal.';
  end if;

  if new.reference_type in ('production_job','production_job_scrap') and not exists(select 1 from public.production_jobs j where j.id=new.reference_id and j.organization_id=new.organization_id and j.branch_id=new.branch_id) then raise exception 'El trabajo no pertenece a esta sucursal.'; end if;

  select unit_cost,updated_at into v_unit_cost,v_cost_updated_at
  from public.inventory_item_costs
  where organization_id=new.organization_id and variant_id=new.variant_id;

  if found then
    v_source:='inventory_cost';
  else
    v_source:='missing_inventory_cost';
  end if;

  insert into public.inventory_movement_cost_snapshots(
    movement_id,organization_id,branch_id,variant_id,reference_type,reference_id,
    quantity_snapshot,source_kind,unit_cost_snapshot,cost_total_snapshot,inventory_cost_updated_at,captured_at,equipment_asset_id
  ) values (
    new.id,new.organization_id,new.branch_id,new.variant_id,new.reference_type,new.reference_id,
    abs(new.quantity_delta),v_source,v_unit_cost,
    case when v_source='inventory_cost' then round(v_unit_cost*abs(new.quantity_delta),2) else null end,
    v_cost_updated_at,now(),new.equipment_asset_id
  ) on conflict (movement_id) do nothing;

  return new;
end;
$$;
create or replace function public.get_finance_material_cost_summary(
  p_month date,
  p_branch_id uuid default null,
  p_advisor_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_org uuid;
  v_summary jsonb;
begin
  if auth.uid() is null or p_month is null then
    raise exception 'Inicia sesión y selecciona un mes.' using errcode='42501';
  end if;

  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null then
    raise exception 'No se encontró la organización de este resumen.' using errcode='42501';
  end if;

  if p_branch_id is null then
    if not app_private.has_visualcorp_access_orgwide(v_org,'inventory_costs','view')
       or not app_private.has_visualcorp_access_orgwide(v_org,'inventory_costs','view_costs') then
      raise exception 'El resumen de todas las sucursales requiere permiso de costos en un perfil de organización.' using errcode='42501';
    end if;
  elsif not exists (
    select 1 from public.branches b where b.id=p_branch_id and b.organization_id=v_org
  ) or not app_private.has_visualcorp_access(v_org,'inventory_costs','view',p_branch_id)
     or not app_private.has_visualcorp_access(v_org,'inventory_costs','view_costs',p_branch_id) then
    raise exception 'Tu perfil no tiene permiso para consultar costos de materiales en esta sucursal.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'consumption_movements',count(*),
    'production_job_movements',count(*) filter(where c.reference_type in ('production_job','production_job_scrap')),
    'scrap_movements',count(*) filter(where c.reference_type='production_job_scrap'),
    'scrap_cost_total',coalesce(sum(c.cost_total_snapshot) filter(where c.reference_type='production_job_scrap'),0),
    'costed_movements',count(*) filter (where c.source_kind='inventory_cost'),
    'missing_cost_movements',count(*) filter (where c.source_kind='missing_inventory_cost'),
    'material_cost_total',coalesce(sum(c.cost_total_snapshot) filter (where c.source_kind='inventory_cost'),0)
  ) into v_summary
  from public.inventory_movement_cost_snapshots c
  left join public.sales s
    on c.reference_type='sale' and s.id=c.reference_id and s.organization_id=c.organization_id
  left join public.production_orders po
    on c.reference_type='production_order' and po.id=c.reference_id and po.organization_id=c.organization_id
  left join public.sales ps
    on ps.id=po.sale_id and ps.organization_id=po.organization_id
  left join public.production_jobs pj on c.reference_type in ('production_job','production_job_scrap') and pj.id=c.reference_id and pj.organization_id=c.organization_id
  where c.organization_id=v_org
    and (p_branch_id is null or c.branch_id=p_branch_id)
    and (p_advisor_id is null or coalesce(s.advisor_id,ps.advisor_id,pj.advisor_id)=p_advisor_id)
    and (c.captured_at at time zone 'America/Guayaquil')::date >= date_trunc('month',p_month)::date
    and (c.captured_at at time zone 'America/Guayaquil')::date < (date_trunc('month',p_month)+interval '1 month')::date;

  return v_summary;
end;
$$;


-- Purchase changes preserve all receipts and original ordered quantities.
create or replace function app_private.cancel_purchase_order(p_order_id uuid,p_reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare v_order public.purchase_orders%rowtype; v_user uuid:=auth.uid();
begin
 select * into v_order from public.purchase_orders where id=p_order_id for update;
 if v_user is null or v_order.id is null or not app_private.has_visualcorp_access(v_order.organization_id,'purchases','cancel_purchase',v_order.branch_id) then raise exception 'No tienes permiso para cancelar esta orden.' using errcode='42501'; end if;
 if length(btrim(p_reason))<3 then raise exception 'Indica el motivo de cancelación.'; end if;
 if v_order.status not in ('draft','ordered') or exists(select 1 from public.purchase_receipts where purchase_order_id=p_order_id) then raise exception 'Una orden con recepción requiere cierre parcial; no puede cancelarse.'; end if;
 update public.purchase_orders set status='cancelled',cancelled_by=v_user,cancelled_at=now(),cancellation_reason=left(p_reason,500),updated_at=now() where id=p_order_id;
 if v_order.purchase_request_id is not null then
  update public.purchase_requests set status='approved',purchase_order_id=null,updated_at=now() where id=v_order.purchase_request_id and purchase_order_id=p_order_id;
  update public.supplier_quotes set status='submitted' where request_id=v_order.purchase_request_id and status in ('selected','not_selected');
  insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id) values(v_order.organization_id,v_order.purchase_request_id,'order_cancelled',left(p_reason,1000),v_user);
 end if;
end; $$;

create or replace function app_private.cancel_purchase_request(p_request_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.purchase_requests%rowtype; u uuid:=auth.uid();
begin
 select * into r from public.purchase_requests where id=p_request_id for update;
 if u is null or r.id is null or not (app_private.has_visualcorp_access(r.organization_id,'purchases','cancel_purchase',r.branch_id) or (r.created_by=u and (app_private.has_visualcorp_access(r.organization_id,'workshop','view',r.branch_id) or app_private.has_visualcorp_access(r.organization_id,'sales','view',r.branch_id)))) then raise exception 'No tienes permiso para cancelar esta solicitud.' using errcode='42501'; end if;
 if r.status not in ('submitted','approved') or r.purchase_order_id is not null then raise exception 'Cancela primero el borrador asociado.'; end if;
 if length(btrim(p_reason))<3 then raise exception 'Indica un motivo de cancelación.'; end if;
 update public.purchase_requests set status='cancelled',resolution_note=left(p_reason,500),resolved_by=u,resolved_at=now(),updated_at=now() where id=r.id;
 insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id) values(r.organization_id,r.id,'cancelled',left(p_reason,1000),u);
end; $$;

create or replace function app_private.close_purchase_order_partial(p_order_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.purchase_orders%rowtype;
begin
 select * into o from public.purchase_orders where id=p_order_id for update;
 if auth.uid() is null or o.id is null or not app_private.has_visualcorp_access(o.organization_id,'purchases','cancel_purchase',o.branch_id) then raise exception 'No tienes permiso para cerrar esta orden.' using errcode='42501'; end if;
 if o.status not in ('ordered','partially_received') or not exists(select 1 from public.purchase_receipts where purchase_order_id=o.id) then raise exception 'El cierre parcial requiere una recepción registrada.'; end if;
 if length(btrim(p_reason))<3 then raise exception 'Explica por qué se cierra el saldo pendiente.'; end if;
 update public.purchase_orders set status='closed_partial',closed_at=now(),closed_by=auth.uid(),closure_reason=left(p_reason,1000),updated_at=now() where id=o.id;
 if o.purchase_request_id is not null then insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id) values(o.organization_id,o.purchase_request_id,'order_closed',left(p_reason,1000),auth.uid()); end if;
end; $$;

create or replace function app_private.update_purchase_order_draft(p_order_id uuid,p_lines jsonb,p_expected_date date default null,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.purchase_orders%rowtype; l jsonb; v uuid; q numeric; c numeric;
begin
 select * into o from public.purchase_orders where id=p_order_id for update;
 if auth.uid() is null or o.id is null or not app_private.has_visualcorp_access(o.organization_id,'purchases','edit',o.branch_id) then raise exception 'No tienes permiso para editar este borrador.' using errcode='42501'; end if;
 if o.status<>'draft' or exists(select 1 from public.purchase_receipts where purchase_order_id=o.id) then raise exception 'Solo se puede editar un borrador sin recepciones.'; end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Incluye entre 1 y 100 artículos.'; end if;
 if exists(select 1 from jsonb_array_elements(p_lines) e group by e->>'variant_id' having count(*)>1) then raise exception 'No repitas variantes.'; end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  v:=(l->>'variant_id')::uuid; q:=(l->>'quantity_ordered')::numeric; c:=nullif(l->>'unit_cost','')::numeric;
  if q is null or q<=0 or q::text in ('NaN','Infinity','-Infinity') or (c is not null and (c<0 or c::text in ('NaN','Infinity','-Infinity'))) then raise exception 'Cantidad o costo inválido.'; end if;
  insert into public.purchase_order_lines(organization_id,purchase_order_id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_ordered,unit_cost)
  select o.organization_id,o.id,iv.id,i.name||' · '||iv.label,iv.sku,i.base_unit,q,c from public.inventory_variants iv join public.inventory_items i on i.id=iv.item_id and i.organization_id=iv.organization_id where iv.id=v and iv.organization_id=o.organization_id and iv.active and i.active
  on conflict(purchase_order_id,variant_id) do update set quantity_ordered=excluded.quantity_ordered,unit_cost=excluded.unit_cost;
  if not found then raise exception 'Variante inválida o inactiva.'; end if;
 end loop;
 delete from public.purchase_order_lines where purchase_order_id=o.id and variant_id not in(select (value->>'variant_id')::uuid from jsonb_array_elements(p_lines));
 update public.purchase_orders set expected_date=p_expected_date,note=left(coalesce(p_note,''),2000),updated_at=now() where id=o.id;
 return o.id;
end; $$;

create table public.production_job_material_usage (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 job_id uuid not null, step_id uuid not null, equipment_asset_id uuid, movement_id uuid not null unique references public.inventory_movements(id),
 kind text not null check(kind in ('consumption','scrap')), quantity numeric(14,3) not null check(quantity>0),
 idempotency_key uuid not null, reason text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,idempotency_key),
 foreign key(job_id,organization_id) references public.production_jobs(id,organization_id),
 foreign key(step_id,job_id,organization_id) references public.production_job_steps(id,job_id,organization_id),
 foreign key(equipment_asset_id,organization_id) references public.equipment_assets(id,organization_id)
);
create index production_job_material_usage_job_idx on public.production_job_material_usage(job_id,created_at desc);
alter table public.production_job_material_usage enable row level security;
revoke all on public.production_job_material_usage from public,anon,authenticated;
grant select on public.production_job_material_usage to authenticated;
create policy job_material_usage_read on public.production_job_material_usage for select to authenticated using(exists(select 1 from public.production_jobs j where j.id=job_id and app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id)));

create or replace function app_private.record_production_job_material(p_job_id uuid,p_step_id uuid,p_variant_id uuid,p_quantity numeric,p_location_code text,p_reason text,p_idempotency_key uuid,p_equipment_asset_id uuid,p_kind text) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.production_jobs%rowtype; s public.production_job_steps%rowtype; previous public.production_job_material_usage%rowtype; a text; available numeric; movement uuid; result uuid;
begin
 select * into j from public.production_jobs where id=p_job_id for update;
 select * into s from public.production_job_steps where id=p_step_id and job_id=p_job_id and organization_id=j.organization_id for update;
 select code into a from public.areas where id=s.area_id and organization_id=j.organization_id;
 if auth.uid() is null or j.id is null or s.id is null or not app_private.has_visualcorp_access(j.organization_id,'workshop','edit',j.branch_id) or not app_private.can_work_production_area(j.organization_id,j.branch_id,a,auth.uid()) or (s.assigned_to is distinct from auth.uid() and not app_private.can_coordinate_production(j.organization_id,j.branch_id,auth.uid())) then raise exception 'Solo el responsable autorizado puede registrar material de esta etapa.' using errcode='42501'; end if;
 if p_idempotency_key is null then raise exception 'Falta clave de reintento.'; end if;
 select * into previous from public.production_job_material_usage where organization_id=j.organization_id and idempotency_key=p_idempotency_key;
 if found then
  if previous.job_id<>j.id or previous.step_id<>s.id or previous.kind<>p_kind or previous.quantity<>p_quantity or previous.equipment_asset_id is distinct from p_equipment_asset_id or not exists(select 1 from public.inventory_movements m where m.id=previous.movement_id and m.variant_id=p_variant_id and m.location_code=p_location_code) then raise exception 'La clave de reintento pertenece a otro movimiento.'; end if;
  return previous.id;
 end if;
 if j.status not in ('open','needs_review') or s.status not in ('ready','in_progress','blocked') then raise exception 'El trabajo o la etapa ya están cerrados.'; end if;
 if p_kind not in ('consumption','scrap') or p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity<>round(p_quantity,3) or length(btrim(p_reason))<3 then raise exception 'Indica cantidad válida y motivo.'; end if;
 if not exists(select 1 from public.inventory_variants v join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id where v.id=p_variant_id and v.organization_id=j.organization_id and v.active and i.active) then raise exception 'Material inválido o inactivo.'; end if;
 if not exists(select 1 from public.inventory_locations where organization_id=j.organization_id and branch_id=j.branch_id and code=p_location_code and active) then raise exception 'Ubicación inválida o inactiva.'; end if;
 if p_equipment_asset_id is not null and not exists(select 1 from public.equipment_assets e where e.id=p_equipment_asset_id and e.organization_id=j.organization_id and e.branch_id=j.branch_id and e.status<>'Retirado') then raise exception 'El equipo no pertenece a esta sucursal.'; end if;
 select quantity-reserved_quantity into available from public.inventory_stock where organization_id=j.organization_id and branch_id=j.branch_id and variant_id=p_variant_id and location_code=p_location_code for update;
 if available is null or available<p_quantity then raise exception 'Existencia disponible insuficiente después de reservas.'; end if;
 insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by,equipment_asset_id)
 values(j.organization_id,p_variant_id,j.branch_id,p_location_code,case when p_kind='scrap' then 'waste' else 'consumption' end,-p_quantity,left(p_reason,1000),case when p_kind='scrap' then 'production_job_scrap' else 'production_job' end,j.id,auth.uid(),p_equipment_asset_id) returning id into movement;
 insert into public.production_job_material_usage(organization_id,job_id,step_id,equipment_asset_id,movement_id,kind,quantity,idempotency_key,reason,created_by)
 values(j.organization_id,j.id,s.id,p_equipment_asset_id,movement,p_kind,p_quantity,p_idempotency_key,left(p_reason,1000),auth.uid()) returning id into result;
 insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by) values(j.organization_id,j.id,s.id,case when p_kind='scrap' then 'material_scrap_recorded' else 'material_consumed' end,jsonb_build_object('material_usage_id',result,'variant_id',p_variant_id,'quantity',p_quantity,'equipment_asset_id',p_equipment_asset_id,'note',left(p_reason,1000)),auth.uid());
 return result;
end; $$;
revoke all on function app_private.record_production_job_material(uuid,uuid,uuid,numeric,text,text,uuid,uuid,text) from public,anon,authenticated;

create or replace function public.consume_production_job_material(p_job_id uuid,p_step_id uuid,p_variant_id uuid,p_quantity numeric,p_location_code text,p_reason text,p_idempotency_key uuid,p_equipment_asset_id uuid default null) returns uuid language sql security definer set search_path='' as $$ select app_private.record_production_job_material($1,$2,$3,$4,$5,$6,$7,$8,'consumption') $$;
create or replace function public.record_production_job_scrap(p_job_id uuid,p_step_id uuid,p_variant_id uuid,p_quantity numeric,p_location_code text,p_reason text,p_idempotency_key uuid,p_equipment_asset_id uuid default null) returns uuid language sql security definer set search_path='' as $$ select app_private.record_production_job_material($1,$2,$3,$4,$5,$6,$7,$8,'scrap') $$;
create or replace function public.cancel_purchase_request(p_request_id uuid,p_reason text) returns void language sql security invoker set search_path='' as $$ select app_private.cancel_purchase_request($1,$2) $$;
create or replace function public.close_purchase_order_partial(p_order_id uuid,p_reason text) returns void language sql security invoker set search_path='' as $$ select app_private.close_purchase_order_partial($1,$2) $$;
create or replace function public.update_purchase_order_draft(p_order_id uuid,p_lines jsonb,p_expected_date date default null,p_note text default '') returns uuid language sql security invoker set search_path='' as $$ select app_private.update_purchase_order_draft($1,$2,$3,$4) $$;
revoke all on function public.consume_production_job_material(uuid,uuid,uuid,numeric,text,text,uuid,uuid),public.record_production_job_scrap(uuid,uuid,uuid,numeric,text,text,uuid,uuid) from public,anon;
grant execute on function public.consume_production_job_material(uuid,uuid,uuid,numeric,text,text,uuid,uuid),public.record_production_job_scrap(uuid,uuid,uuid,numeric,text,text,uuid,uuid) to authenticated;
revoke all on function app_private.cancel_purchase_request(uuid,text),public.cancel_purchase_request(uuid,text),app_private.close_purchase_order_partial(uuid,text),public.close_purchase_order_partial(uuid,text),app_private.update_purchase_order_draft(uuid,jsonb,date,text),public.update_purchase_order_draft(uuid,jsonb,date,text) from public,anon;
grant execute on function app_private.cancel_purchase_request(uuid,text),public.cancel_purchase_request(uuid,text),app_private.close_purchase_order_partial(uuid,text),public.close_purchase_order_partial(uuid,text),app_private.update_purchase_order_draft(uuid,jsonb,date,text),public.update_purchase_order_draft(uuid,jsonb,date,text) to authenticated;

-- Owners may discard uploads that were never referenced by a job or its audit history.
create policy production_artwork_discard_orphan on storage.objects for delete to authenticated using (
 bucket_id='production-artwork' and owner_id=(select auth.uid())::text
 and exists(select 1 from public.production_jobs j where j.id::text=split_part(name,'/',2) and j.organization_id::text=split_part(name,'/',1) and app_private.has_visualcorp_access(j.organization_id,'workshop','edit',j.branch_id))
 and not exists(select 1 from public.production_jobs j where j.artwork_reference='storage://production-artwork/'||name)
 and not exists(select 1 from public.production_job_events e where e.details->>'reference'='storage://production-artwork/'||name)
);
