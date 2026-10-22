-- Transactional server-side operations for inventory, branch transfers and POS.
alter table public.sales add column if not exists sale_code text;
alter table public.sales add column if not exists payment_method text not null default 'other'
  check (payment_method in ('cash','transfer','card','other'));
create unique index if not exists sales_sale_code_uq on public.sales (organization_id,sale_code)
  where sale_code is not null;

create table public.inventory_count_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_id uuid not null,
  branch_id uuid not null,
  location_code text not null default 'MAIN',
  previous_quantity numeric(14,3) not null default 0,
  counted_quantity numeric(14,3) not null check (counted_quantity >= 0),
  delta numeric(14,3) not null,
  responsible_user_id uuid not null references auth.users(id) on delete restrict,
  note text not null default '',
  created_at timestamptz not null default now(),
  foreign key (variant_id,organization_id) references public.inventory_variants(id,organization_id) on delete restrict,
  foreign key (branch_id,organization_id) references public.branches(id,organization_id) on delete restrict
);
create index inventory_count_audits_history_idx on public.inventory_count_audits (organization_id,branch_id,created_at desc);
alter table public.inventory_count_audits enable row level security;
grant select on public.inventory_count_audits to authenticated;
create policy inventory_count_audits_staff_read on public.inventory_count_audits
  for select to authenticated using (app_private.has_org_role(organization_id,branch_id));

create or replace function public.set_inventory_count(
  p_variant_id uuid, p_branch_id uuid, p_counted_quantity numeric,
  p_location_code text default 'MAIN', p_note text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_previous numeric(14,3); v_delta numeric(14,3); v_location text;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para registrar un conteo.'; end if;
  if p_counted_quantity is null or p_counted_quantity < 0 then raise exception 'El conteo debe ser cero o mayor.'; end if;
  select organization_id into v_org from public.inventory_variants where id=p_variant_id and active;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para contar este artículo en esa sucursal.';
  end if;
  v_location := coalesce(nullif(trim(p_location_code),''),'MAIN');
  insert into public.inventory_stock (organization_id,variant_id,branch_id,location_code,quantity)
  values (v_org,p_variant_id,p_branch_id,v_location,0)
  on conflict (organization_id,variant_id,branch_id,location_code) do nothing;
  select quantity into v_previous from public.inventory_stock
    where organization_id=v_org and variant_id=p_variant_id and branch_id=p_branch_id and location_code=v_location for update;
  v_delta := p_counted_quantity-v_previous;
  insert into public.inventory_count_audits (organization_id,variant_id,branch_id,location_code,previous_quantity,counted_quantity,delta,responsible_user_id,note)
  values (v_org,p_variant_id,p_branch_id,v_location,v_previous,p_counted_quantity,v_delta,(select auth.uid()),coalesce(p_note,''));
  if v_delta <> 0 then
    insert into public.inventory_movements (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,created_by)
    values (v_org,p_variant_id,p_branch_id,v_location,'adjustment',v_delta,coalesce(nullif(p_note,''),'Conteo físico'),'inventory_count',(select auth.uid()));
  end if;
  return jsonb_build_object('previous_quantity',v_previous,'counted_quantity',p_counted_quantity,'delta',v_delta);
end;
$$;

create or replace function public.record_inventory_movement(
  p_variant_id uuid, p_branch_id uuid, p_movement_type text, p_quantity numeric,
  p_reason text, p_location_code text default 'MAIN', p_reference_type text default null, p_reference_id uuid default null
) returns numeric language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_delta numeric(14,3); v_location text; v_after numeric(14,3);
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para registrar el movimiento.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor a cero.'; end if;
  if p_movement_type not in ('receipt','consumption','return','waste') then raise exception 'Tipo de movimiento no permitido.'; end if;
  select organization_id into v_org from public.inventory_variants where id=p_variant_id and active;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para mover este artículo en esa sucursal.';
  end if;
  v_location := coalesce(nullif(trim(p_location_code),''),'MAIN');
  v_delta := case when p_movement_type in ('receipt','return') then p_quantity else -p_quantity end;
  insert into public.inventory_movements (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
  values (v_org,p_variant_id,p_branch_id,v_location,p_movement_type,v_delta,coalesce(p_reason,''),p_reference_type,p_reference_id,(select auth.uid()));
  select quantity into v_after from public.inventory_stock where organization_id=v_org and variant_id=p_variant_id and branch_id=p_branch_id and location_code=v_location;
  return coalesce(v_after,0);
end;
$$;

create or replace function public.transfer_inventory(
  p_variant_id uuid, p_from_branch_id uuid, p_to_branch_id uuid, p_quantity numeric, p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_transfer uuid; v_code text; v_available numeric(14,3);
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para transferir inventario.'; end if;
  if p_from_branch_id=p_to_branch_id or p_quantity is null or p_quantity<=0 then raise exception 'Revisa sucursales y cantidad del traspaso.'; end if;
  select organization_id into v_org from public.inventory_variants where id=p_variant_id and active;
  if v_org is null or not app_private.has_org_role(v_org,p_from_branch_id,array['owner','admin','manager','warehouse']) or not app_private.has_org_role(v_org,p_to_branch_id,array['owner','admin','manager','warehouse']) then
    raise exception 'No tienes permiso para transferir entre esas sucursales.';
  end if;
  select quantity into v_available from public.inventory_stock
    where organization_id=v_org and variant_id=p_variant_id and branch_id=p_from_branch_id and location_code='MAIN' for update;
  if not found then v_available:=0; end if;
  if v_available<p_quantity then raise exception 'Stock insuficiente para completar el traspaso.'; end if;
  v_code := 'TR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.stock_transfers (organization_id,transfer_code,from_branch_id,to_branch_id,status,note,requested_by,approved_by,dispatched_by,received_by,dispatched_at,received_at)
  values (v_org,v_code,p_from_branch_id,p_to_branch_id,'received',coalesce(p_note,''),(select auth.uid()),(select auth.uid()),(select auth.uid()),(select auth.uid()),now(),now()) returning id into v_transfer;
  insert into public.stock_transfer_lines (organization_id,transfer_id,variant_id,requested_quantity,dispatched_quantity,received_quantity,note)
  values (v_org,v_transfer,p_variant_id,p_quantity,p_quantity,p_quantity,coalesce(p_note,''));
  insert into public.inventory_movements (organization_id,variant_id,branch_id,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
  values (v_org,p_variant_id,p_from_branch_id,'transfer_out',-p_quantity,coalesce(p_note,''),'stock_transfer',v_transfer,(select auth.uid())),
         (v_org,p_variant_id,p_to_branch_id,'transfer_in',p_quantity,coalesce(p_note,''),'stock_transfer',v_transfer,(select auth.uid()));
  return v_transfer;
end;
$$;

create or replace function public.create_pos_sale(
  p_branch_id uuid, p_customer_id uuid, p_payment_method text, p_discount numeric,
  p_note text, p_allow_backorder boolean, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_sale uuid; v_code text; v_line jsonb; v_variant uuid; v_qty numeric(14,3); v_price numeric(14,2);
  v_available numeric(14,3); v_fulfilled numeric(14,3); v_backordered numeric(14,3); v_subtotal numeric(14,2):=0; v_discount numeric(14,2);
  v_count integer:=0; v_backorder_total numeric(14,3):=0; v_location text;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para registrar una venta.'; end if;
  if not app_private.has_org_role((select id from public.organizations where slug='visual-corp'),p_branch_id,array['owner','admin','manager','advisor']) then raise exception 'No tienes permiso para vender en esta sucursal.'; end if;
  select id into v_org from public.organizations where slug='visual-corp';
  if p_payment_method not in ('cash','transfer','card','other') then raise exception 'Método de pago no válido.'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Agrega al menos un concepto.'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'El cliente seleccionado no existe en Visual Corp.'; end if;
  v_discount:=coalesce(p_discount,0);
  if v_discount<0 then raise exception 'El descuento no puede ser negativo.'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty:=nullif(v_line->>'quantity','')::numeric;
    v_price:=nullif(v_line->>'unit_price','')::numeric;
    if v_qty is null or v_qty<=0 or v_price is null or v_price<0 then raise exception 'Cantidad o tarifa inválida.'; end if;
    v_subtotal:=v_subtotal+round(v_qty*v_price,2); v_count:=v_count+1;
  end loop;
  if v_discount>v_subtotal then raise exception 'El descuento supera el subtotal.'; end if;
  v_code:='VC-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales (organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,created_by,sale_code,payment_method)
  values (v_org,p_branch_id,p_customer_id,'confirmed',false,v_subtotal,v_discount,v_subtotal-v_discount,coalesce(p_note,''),(select auth.uid()),v_code,p_payment_method)
  returning id into v_sale;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_qty:=nullif(v_line->>'quantity','')::numeric;
    v_price:=nullif(v_line->>'unit_price','')::numeric;
    v_variant:=nullif(v_line->>'variant_id','')::uuid;
    v_location:=coalesce(nullif(v_line->>'location_code',''),'MAIN');
    v_fulfilled:=v_qty; v_backordered:=0;
    if v_variant is not null then
      if not exists(select 1 from public.inventory_variants where id=v_variant and organization_id=v_org and active) then raise exception 'El artículo ya no está activo.'; end if;
      select coalesce(quantity,0) into v_available from public.inventory_stock where organization_id=v_org and variant_id=v_variant and branch_id=p_branch_id and location_code=v_location for update;
      if not found then v_available:=0; end if;
      if v_available<v_qty then
        if not p_allow_backorder then raise exception 'Stock insuficiente para %.',coalesce(v_line->>'description_snapshot','artículo'); end if;
        v_fulfilled:=greatest(v_available,0); v_backordered:=v_qty-v_fulfilled; v_backorder_total:=v_backorder_total+v_backordered;
      end if;
    end if;
    update public.sales set urgent_backorder=(v_backorder_total>0) where id=v_sale;
    insert into public.sale_lines (organization_id,sale_id,variant_id,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total)
    values (v_org,v_sale,v_variant,coalesce(v_line->>'sku_snapshot',''),coalesce(v_line->>'description_snapshot','Venta POS'),v_qty,v_fulfilled,v_backordered,v_price,round(v_qty*v_price,2));
    if v_variant is not null and v_fulfilled>0 then
      insert into public.inventory_movements (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values (v_org,v_variant,p_branch_id,v_location,'sale',-v_fulfilled,'Venta POS '||v_code,'sale',v_sale,(select auth.uid()));
    end if;
  end loop;
  return jsonb_build_object('sale_id',v_sale,'sale_code',v_code,'subtotal',v_subtotal,'discount',v_discount,'total',v_subtotal-v_discount,'backordered_quantity',v_backorder_total,'line_count',v_count);
end;
$$;

revoke all on function public.set_inventory_count(uuid,uuid,numeric,text,text) from public,anon;
revoke all on function public.record_inventory_movement(uuid,uuid,text,numeric,text,text,text,uuid) from public,anon;
revoke all on function public.transfer_inventory(uuid,uuid,uuid,numeric,text) from public,anon;
revoke all on function public.create_pos_sale(uuid,uuid,text,numeric,text,boolean,jsonb) from public,anon;
grant execute on function public.set_inventory_count(uuid,uuid,numeric,text,text) to authenticated;
grant execute on function public.record_inventory_movement(uuid,uuid,text,numeric,text,text,text,uuid) to authenticated;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.create_pos_sale(uuid,uuid,text,numeric,text,boolean,jsonb) to authenticated;
