-- Track each physical roll in meters while retaining the legacy percent/status fields.
alter table public.inventory_active_rolls
  add column if not exists nominal_width_cm numeric(10,2),
  add column if not exists remaining_m numeric(14,3),
  add column if not exists remaining_is_estimate boolean not null default false,
  add column if not exists roll_state text not null default 'machine';

alter table public.inventory_active_rolls
  alter column standard_length_m drop not null,
  alter column remaining_percent drop not null,
  drop constraint if exists inventory_active_rolls_standard_length_m_check,
  add constraint inventory_active_rolls_standard_length_m_check
    check (standard_length_m is null or standard_length_m > 0),
  add constraint inventory_active_rolls_nominal_width_cm_check
    check (nominal_width_cm is null or nominal_width_cm > 0);

alter table public.inventory_active_rolls
  add constraint inventory_active_rolls_roll_state_check
    check (roll_state in ('bodega', 'machine')),
  add constraint inventory_active_rolls_remaining_m_check
    check (remaining_m is null or (remaining_m >= 0 and remaining_m <= standard_length_m));

alter table public.inventory_active_rolls drop constraint inventory_active_rolls_status_check;
alter table public.inventory_active_rolls
  add constraint inventory_active_rolls_status_check
    check (status in ('en_uso', 'en_espera', 'agotado', 'en_bodega'));

update public.inventory_active_rolls
set remaining_m = round(standard_length_m * remaining_percent / 100, 3),
    remaining_is_estimate = true
where remaining_m is null;

alter table public.inventory_active_rolls
  alter column remaining_m set not null;

comment on column public.inventory_active_rolls.standard_length_m is
  'Nominal roll length in meters; legacy column name retained for compatibility.';
comment on column public.inventory_active_rolls.nominal_width_cm is
  'Nominal physical width in centimeters, when known.';
comment on column public.inventory_active_rolls.remaining_m is
  'Remaining quantity in meters; inventory_stock tracks the aggregate meter balance.';
comment on column public.inventory_active_rolls.roll_state is
  'Physical location state; moving between bodega and machine does not alter inventory_stock.';

alter table public.inventory_roll_logs
  add column if not exists previous_m numeric(14,3),
  add column if not exists new_m numeric(14,3),
  add column if not exists event_type text not null default 'legacy',
  add column if not exists reason text not null default '',
  add column if not exists work_reference text not null default '',
  add column if not exists previous_state text,
  add column if not exists new_state text;

alter table public.inventory_roll_logs
  alter column previous_percent drop not null,
  alter column new_percent drop not null;

comment on column public.inventory_roll_logs.event_type is
  'Audit event: receive, measurement, or location transfer; legacy rows are preserved.';

create or replace function public.receive_inventory_roll(
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
  if not app_private.has_visualcorp_access(v_org, 'inventory', 'edit', p_branch_id) then
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

create or replace function public.update_inventory_roll_remaining(
  p_roll_id uuid,
  p_remaining_m numeric default null,
  p_remaining_percent numeric default null,
  p_reason text default '',
  p_operator text default '',
  p_work_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_roll public.inventory_active_rolls%rowtype;
  v_old_m numeric(14,3);
  v_new_m numeric(14,3);
  v_old_percent numeric(5,2);
  v_new_percent numeric(5,2);
  v_status text;
  v_delta numeric(14,3);
begin
  if v_user is null then raise exception 'Inicia sesión para actualizar un rollo.'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Indica el motivo del ajuste.'; end if;
  if (p_remaining_m is null) = (p_remaining_percent is null) then raise exception 'Indica metros o porcentaje, pero no ambos.'; end if;
  select * into v_roll from public.inventory_active_rolls where id=p_roll_id for update;
  if not found then raise exception 'No se encontró el rollo especificado.'; end if;
  if not app_private.has_visualcorp_access(v_roll.organization_id,'inventory','edit',v_roll.branch_id) then raise exception 'No tienes permisos para actualizar rollos en esta sucursal.'; end if;
  if p_remaining_m is not null and p_remaining_m < 0 then raise exception 'Los metros restantes no pueden ser negativos.'; end if;
  if p_remaining_percent is not null and (p_remaining_percent < 0 or p_remaining_percent > 100) then raise exception 'El porcentaje debe estar entre 0 y 100.'; end if;
  if p_remaining_percent is not null and v_roll.standard_length_m is null then raise exception 'Este rollo no tiene largo nominal; registra los metros restantes.'; end if;
  v_new_m := case when p_remaining_m is not null then round(p_remaining_m,3) else round(v_roll.standard_length_m*p_remaining_percent/100,3) end;
  if v_roll.standard_length_m is not null and v_new_m > v_roll.standard_length_m then raise exception 'Los metros restantes no pueden superar el largo nominal.'; end if;
  v_old_m := coalesce(v_roll.remaining_m, round(v_roll.standard_length_m*v_roll.remaining_percent/100,3));
  v_old_percent := v_roll.remaining_percent;
  v_new_percent := case when v_roll.standard_length_m is null then null else round(v_new_m*100/v_roll.standard_length_m,2) end;
  v_status := case when v_new_m=0 then 'agotado' when v_roll.roll_state='machine' then 'en_uso' else 'en_bodega' end;
  v_delta := round(v_new_m-v_old_m,3);
  if v_delta <> 0 then
    insert into public.inventory_movements (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
    values (v_roll.organization_id,v_roll.variant_id,v_roll.branch_id,v_roll.location_code,'adjustment',v_delta,trim(p_reason),'inventory_roll',p_roll_id,v_user);
  end if;
  update public.inventory_active_rolls set remaining_m=v_new_m,remaining_percent=v_new_percent,remaining_is_estimate=(p_remaining_percent is not null),status=v_status,
    operator_name=coalesce(nullif(trim(p_operator),''),operator_name),notes=trim(p_reason),last_measured_at=now(),updated_at=now()
    where id=p_roll_id;
  insert into public.inventory_roll_logs (organization_id,roll_id,previous_percent,new_percent,operator_name,notes,created_by,previous_m,new_m,event_type,reason,work_reference,previous_state,new_state)
    values (v_roll.organization_id,p_roll_id,v_old_percent,v_new_percent,coalesce(trim(p_operator),''),trim(p_reason),v_user,v_old_m,v_new_m,'measurement',trim(p_reason),coalesce(trim(p_work_reference),''),v_roll.roll_state,v_roll.roll_state);
  return jsonb_build_object('success',true,'roll_id',p_roll_id,'previous_m',v_old_m,'remaining_m',v_new_m,'remaining_percent',v_new_percent,'remaining_is_estimate',(p_remaining_percent is not null),'status',v_status,'stock_delta_m',v_delta);
end;
$$;

create or replace function public.move_inventory_roll(
  p_roll_id uuid,
  p_destination text,
  p_machine_name text default '',
  p_reason text default '',
  p_operator text default '',
  p_work_reference text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_roll public.inventory_active_rolls%rowtype;
  v_state text := lower(trim(p_destination));
  v_status text;
begin
  if v_user is null then raise exception 'Inicia sesión para mover un rollo.'; end if;
  if v_state not in ('bodega','machine') then raise exception 'El destino debe ser bodega o machine.'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'Indica el motivo del movimiento.'; end if;
  select * into v_roll from public.inventory_active_rolls where id=p_roll_id for update;
  if not found then raise exception 'No se encontró el rollo especificado.'; end if;
  if not app_private.has_visualcorp_access(v_roll.organization_id,'inventory','edit',v_roll.branch_id) then raise exception 'No tienes permisos para mover rollos en esta sucursal.'; end if;
  if v_state='machine' and length(trim(coalesce(p_machine_name,'')))=0 then raise exception 'Indica la máquina de destino.'; end if;
  v_status := case when coalesce(v_roll.remaining_m,round(v_roll.standard_length_m*v_roll.remaining_percent/100,3))=0 then 'agotado' when v_state='machine' then 'en_uso' else 'en_bodega' end;
  update public.inventory_active_rolls set roll_state=v_state,machine_name=case when v_state='machine' then trim(p_machine_name) else '' end,status=v_status,
    operator_name=coalesce(nullif(trim(p_operator),''),operator_name),notes=trim(p_reason),updated_at=now()
    where id=p_roll_id;
  insert into public.inventory_roll_logs (organization_id,roll_id,previous_percent,new_percent,operator_name,notes,created_by,previous_m,new_m,event_type,reason,work_reference,previous_state,new_state)
    values (v_roll.organization_id,p_roll_id,v_roll.remaining_percent,v_roll.remaining_percent,coalesce(trim(p_operator),''),trim(p_reason),v_user,coalesce(v_roll.remaining_m,round(v_roll.standard_length_m*v_roll.remaining_percent/100,3)),coalesce(v_roll.remaining_m,round(v_roll.standard_length_m*v_roll.remaining_percent/100,3)),'transfer',trim(p_reason),coalesce(trim(p_work_reference),''),v_roll.roll_state,v_state);
  return jsonb_build_object('success',true,'roll_id',p_roll_id,'roll_state',v_state,'status',v_status,'remaining_m',coalesce(v_roll.remaining_m,round(v_roll.standard_length_m*v_roll.remaining_percent/100,3)),'stock_changed',false);
end;
$$;

-- Replacing a roll now transfers two physical rolls between locations; it never consumes a whole roll unit.
create or replace function public.replace_active_roll(
  p_roll_id uuid,
  p_consume_warehouse_roll boolean default true,
  p_new_tag text default '',
  p_operator text default '',
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_machine_roll public.inventory_active_rolls%rowtype;
  v_warehouse_roll public.inventory_active_rolls%rowtype;
  v_reason text := coalesce(nullif(trim(p_notes),''),'Reemplazo de rollo en máquina');
begin
  if v_user is null then raise exception 'Inicia sesión para reemplazar un rollo.'; end if;
  select * into v_machine_roll from public.inventory_active_rolls where id=p_roll_id for update;
  if not found then raise exception 'No se encontró el rollo en máquina.'; end if;
  if not app_private.has_visualcorp_access(v_machine_roll.organization_id,'inventory','edit',v_machine_roll.branch_id) then
    raise exception 'No tienes permisos para reemplazar rollos en esta sucursal.';
  end if;
  if v_machine_roll.roll_state <> 'machine' then raise exception 'El rollo seleccionado no está asignado a una máquina.'; end if;
  if length(trim(coalesce(v_machine_roll.machine_name,'')))=0 then raise exception 'La máquina actual del rollo no está definida.'; end if;

  select * into v_warehouse_roll
    from public.inventory_active_rolls
   where organization_id=v_machine_roll.organization_id
     and branch_id=v_machine_roll.branch_id
     and variant_id=v_machine_roll.variant_id
     and roll_state='bodega'
     and status='en_bodega'
     and remaining_m>0
   order by created_at,id
   limit 1
   for update skip locked;
  if not found then raise exception 'No hay un rollo de este mismo material y variante en bodega.'; end if;

  update public.inventory_active_rolls
     set roll_state='bodega',machine_name='',status=case when remaining_m=0 then 'agotado' else 'en_bodega' end,
         operator_name=coalesce(nullif(trim(p_operator),''),operator_name),notes=v_reason,updated_at=now()
   where id=v_machine_roll.id;
  update public.inventory_active_rolls
     set roll_state='machine',machine_name=v_machine_roll.machine_name,status='en_uso',
         roll_tag=coalesce(nullif(trim(p_new_tag),''),nullif(trim(v_warehouse_roll.roll_tag),''),'Rollo'),
         operator_name=coalesce(nullif(trim(p_operator),''),operator_name),notes=v_reason,last_measured_at=now(),updated_at=now()
   where id=v_warehouse_roll.id;

  insert into public.inventory_roll_logs (
    organization_id,roll_id,previous_percent,new_percent,operator_name,notes,created_by,
    previous_m,new_m,event_type,reason,work_reference,previous_state,new_state
  ) values
    (v_machine_roll.organization_id,v_machine_roll.id,v_machine_roll.remaining_percent,v_machine_roll.remaining_percent,
     coalesce(trim(p_operator),''),v_reason,v_user,v_machine_roll.remaining_m,v_machine_roll.remaining_m,
     'transfer',v_reason,'',v_machine_roll.roll_state,'bodega'),
    (v_warehouse_roll.organization_id,v_warehouse_roll.id,v_warehouse_roll.remaining_percent,v_warehouse_roll.remaining_percent,
     coalesce(trim(p_operator),''),v_reason,v_user,v_warehouse_roll.remaining_m,v_warehouse_roll.remaining_m,
     'transfer',v_reason,'',v_warehouse_roll.roll_state,'machine');

  return jsonb_build_object('success',true,'previous_roll_id',v_machine_roll.id,'active_roll_id',v_warehouse_roll.id,
    'remaining_m',v_warehouse_roll.remaining_m,'stock_changed',false,'warehouse_roll_consumed',false,
    'requested_consume_flag',coalesce(p_consume_warehouse_roll,false));
end;
$$;

-- Preserve the old percent RPC as a compatibility wrapper while reconciling meter stock.
create or replace function public.record_roll_daily_percent(p_roll_id uuid,p_percent numeric,p_operator text default '',p_notes text default '')
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  return public.update_inventory_roll_remaining(p_roll_id,null,p_percent,coalesce(nullif(trim(p_notes),''),'Medición diaria'),p_operator,'');
end;
$$;

revoke all on function public.receive_inventory_roll(uuid,uuid,text,text,numeric,numeric,numeric,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.update_inventory_roll_remaining(uuid,numeric,numeric,text,text,text) from public,anon,authenticated;
revoke all on function public.move_inventory_roll(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_roll_daily_percent(uuid,numeric,text,text) from public,anon,authenticated;
revoke all on function public.replace_active_roll(uuid,boolean,text,text,text) from public,anon,authenticated;
revoke insert, update, delete on public.inventory_active_rolls from authenticated;
revoke insert on public.inventory_roll_logs from authenticated;
grant select on public.inventory_active_rolls to authenticated;
grant select on public.inventory_roll_logs to authenticated;
grant execute on function public.receive_inventory_roll(uuid,uuid,text,text,numeric,numeric,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.update_inventory_roll_remaining(uuid,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.move_inventory_roll(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.record_roll_daily_percent(uuid,numeric,text,text) to authenticated;
grant execute on function public.replace_active_roll(uuid,boolean,text,text,text) to authenticated;

-- Keep the aggregate meter balance and the physical roll ledger aligned. POS
-- consumes an estimate first; the operator's later meter reading posts only
-- the difference between that estimate and the observed remainder.
create or replace function app_private.apply_roll_material_movement()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_inventory_model text;
  v_needed numeric(14,3);
  v_take numeric(14,3);
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_percent numeric(5,2);
  v_roll public.inventory_active_rolls%rowtype;
  v_work_reference text;
begin
  select i.custom_fields->>'inventory_model'
    into v_inventory_model
    from public.inventory_variants iv
    join public.inventory_items i on i.id=iv.item_id and i.organization_id=iv.organization_id
   where iv.id=new.variant_id and iv.organization_id=new.organization_id;
  if v_inventory_model is distinct from 'roll' then return new; end if;

  -- The roll RPC has already created or adjusted its physical row before it
  -- writes the matching aggregate movement.
  if new.reference_type='inventory_roll' then return new; end if;
  if new.quantity_delta>0 then
    raise exception 'Registra las entradas de este material desde Libro de rollos para identificar cada rollo.';
  end if;
  if new.movement_type not in ('consumption','sale','waste') then
    raise exception 'Los movimientos de rollos deben registrarse desde Libro de rollos o mediante una receta POS.';
  end if;

  v_needed := round(abs(new.quantity_delta),3);
  v_work_reference := coalesce(new.reference_id::text,new.id::text);
  for v_roll in
    select * from public.inventory_active_rolls r
     where r.organization_id=new.organization_id
       and r.variant_id=new.variant_id
       and r.branch_id=new.branch_id
       and r.location_code=new.location_code
       and r.remaining_m>0
     order by case when r.roll_state='machine' then 0 else 1 end,r.created_at,r.id
     for update
  loop
    exit when v_needed<=0;
    v_before := v_roll.remaining_m;
    v_take := least(v_before,v_needed);
    v_after := round(v_before-v_take,3);
    v_percent := case when v_roll.standard_length_m is null then null else round(v_after*100/v_roll.standard_length_m,2) end;
    update public.inventory_active_rolls
       set remaining_m=v_after,remaining_percent=v_percent,remaining_is_estimate=true,
           status=case when v_after=0 then 'agotado' when roll_state='machine' then 'en_uso' else 'en_bodega' end,
           notes=left(coalesce(new.reason,'Consumo estimado de producción'),1000),updated_at=now()
     where id=v_roll.id;
    insert into public.inventory_roll_logs(
      organization_id,roll_id,previous_percent,new_percent,operator_name,notes,created_by,
      previous_m,new_m,event_type,reason,work_reference,previous_state,new_state
    ) values (
      v_roll.organization_id,v_roll.id,v_roll.remaining_percent,v_percent,v_roll.operator_name,
      left(coalesce(new.reason,'Consumo estimado de producción'),1000),new.created_by,
      v_before,v_after,'estimated_consumption',left(coalesce(new.reason,'Consumo estimado de producción'),1000),
      v_work_reference,v_roll.roll_state,v_roll.roll_state
    );
    v_needed := round(v_needed-v_take,3);
  end loop;
  if v_needed>0 then
    raise exception 'El saldo agregado de rollos no alcanza para cubrir el movimiento estimado; revisa el conteo físico antes de continuar.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.apply_roll_material_movement() from public,anon,authenticated;
create trigger inventory_movement_updates_physical_rolls
  after insert on public.inventory_movements
  for each row execute function app_private.apply_roll_material_movement();

create or replace function app_private.guard_inventory_roll_width_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.attributes->>'width_cm' is not distinct from old.attributes->>'width_cm' then return new; end if;
  if exists(
    select 1 from public.inventory_items i
     where i.id=new.item_id and i.organization_id=new.organization_id
       and i.custom_fields->>'inventory_model'='roll'
  ) and (
    exists(select 1 from public.inventory_active_rolls r where r.variant_id=old.id and r.organization_id=old.organization_id)
    or exists(select 1 from public.inventory_stock s where s.variant_id=old.id and s.organization_id=old.organization_id and (s.quantity<>0 or s.reserved_quantity<>0))
  ) then
    raise exception 'No se puede cambiar el ancho de una variante que ya tiene rollos o saldo. Crea una variante nueva por ancho.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_inventory_roll_width_change() from public,anon,authenticated;
create trigger inventory_variant_roll_width_guard
  before update of attributes on public.inventory_variants
  for each row execute function app_private.guard_inventory_roll_width_change();
