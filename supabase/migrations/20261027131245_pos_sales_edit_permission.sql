-- POS write access follows the configured sales.edit permission in both RPC entry points.
create or replace function public.create_pos_sale(
  p_branch_id uuid, p_customer_id uuid, p_payment_method text, p_discount numeric,
  p_note text, p_allow_backorder boolean, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_sale uuid; v_code text; v_line jsonb; v_variant uuid; v_qty numeric(14,3); v_price numeric(14,2);
  v_available numeric(14,3); v_fulfilled numeric(14,3); v_backordered numeric(14,3); v_subtotal numeric(14,2):=0; v_discount numeric(14,2);
  v_count integer:=0; v_backorder_total numeric(14,3):=0; v_location text;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para registrar una venta.'; end if;
  if not app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp'),'sales','edit',p_branch_id) then raise exception 'No tienes permiso para vender en esta sucursal.'; end if;
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

CREATE OR REPLACE FUNCTION public.create_pos_sale_idempotent(p_idempotency_key text, p_branch_code text, p_customer_id uuid, p_customer_data jsonb, p_discount numeric, p_note text, p_allow_backorder boolean, p_lines jsonb, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_branch uuid;
  v_user uuid := (select auth.uid());
  v_role text;
  v_customer uuid := p_customer_id;
  v_sale uuid;
  v_sale_code text;
  v_existing_fingerprint text;
  v_line jsonb;
  v_payment jsonb;
  v_variant uuid;
  v_product text;
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_fulfilled numeric(14,3);
  v_backordered numeric(14,3);
  v_available numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(p_discount,0);
  v_paid numeric(14,2) := 0;
  v_backorder_total numeric(14,3) := 0;
  v_fingerprint text;
  v_location text;
  v_method text;
begin
  if v_user is null then raise exception 'Inicia sesión para registrar la orden.'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 12 and 160 then
    raise exception 'La clave de operación no es válida.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Agrega al menos un artículo o servicio.';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then raise exception 'Los pagos no tienen un formato válido.'; end if;

  select id into v_org from public.organizations where slug='visual-corp';
  select id into v_branch from public.branches where organization_id=v_org and code=upper(trim(p_branch_code)) and active;
  if v_branch is null then raise exception 'La sucursal seleccionada no está activa.'; end if;
  if not app_private.has_visualcorp_access(v_org,'sales','edit',v_branch) then
    raise exception 'No tienes permiso para registrar órdenes en esta sucursal.';
  end if;
  if v_discount < 0 then raise exception 'El descuento no puede ser negativo.'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'branch',upper(trim(p_branch_code)), 'customer',p_customer_id,
    'customer_data',coalesce(p_customer_data,'{}'::jsonb), 'discount',v_discount,
    'note',coalesce(p_note,''), 'allow_backorder',coalesce(p_allow_backorder,false),
    'lines',p_lines, 'payments',p_payments
  )::text);
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || trim(p_idempotency_key),0));
  select id,sale_code,idempotency_fingerprint into v_sale,v_sale_code,v_existing_fingerprint
    from public.sales where organization_id=v_org and idempotency_key=trim(p_idempotency_key);
  if v_sale is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'La clave ya fue usada con datos diferentes.'; end if;
    return jsonb_build_object('sale_id',v_sale,'sale_code',v_sale_code,'replayed',true);
  end if;

  if v_customer is not null and not exists(select 1 from public.customers where id=v_customer and organization_id=v_org) then
    raise exception 'El cliente seleccionado no pertenece a Visual Corp.';
  end if;
  if v_customer is null and coalesce(trim(p_customer_data->>'full_name'),'') <> '' then
    if coalesce(trim(p_customer_data->>'phone'),'') <> '' then
      select id into v_customer from public.customers where organization_id=v_org and phone=trim(p_customer_data->>'phone') limit 1;
    end if;
    if v_customer is null then
      insert into public.customers (organization_id,full_name,phone,email,document_reference,notes,created_by)
      values (v_org,trim(p_customer_data->>'full_name'),coalesce(trim(p_customer_data->>'phone'),''),
        coalesce(trim(p_customer_data->>'email'),''),coalesce(trim(p_customer_data->>'document_reference'),''),
        coalesce(trim(p_customer_data->>'notes'),''),v_user) returning id into v_customer;
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := nullif(v_line->>'quantity','')::numeric;
    v_price := nullif(v_line->>'unit_price','')::numeric;
    if v_quantity is null or v_quantity<=0 or v_price is null or v_price<0 then raise exception 'Cantidad o precio inválido.'; end if;
    v_subtotal := v_subtotal + round(v_quantity*v_price,2);
  end loop;
  if v_discount>v_subtotal then raise exception 'El descuento supera el subtotal.'; end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := coalesce(v_payment->>'method','other');
    if v_method not in ('cash','transfer','card','other') then raise exception 'Método de pago no válido.'; end if;
    if coalesce(nullif(v_payment->>'amount','')::numeric,0)<0 then raise exception 'El valor de pago no puede ser negativo.'; end if;
    v_paid := v_paid + round(coalesce(nullif(v_payment->>'amount','')::numeric,0),2);
  end loop;
  if v_paid > v_subtotal-v_discount then raise exception 'Los pagos superan el total de la orden.'; end if;

  v_sale_code := 'VC-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales (organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,created_by,sale_code,payment_method,idempotency_key,idempotency_fingerprint)
  values (v_org,v_branch,v_customer,'confirmed',false,v_subtotal,v_discount,v_subtotal-v_discount,coalesce(p_note,''),v_user,v_sale_code,'other',trim(p_idempotency_key),v_fingerprint)
  returning id into v_sale;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := nullif(v_line->>'quantity','')::numeric;
    v_price := nullif(v_line->>'unit_price','')::numeric;
    v_product := nullif(v_line->>'catalog_product_id','');
    v_variant := null;
    v_location := 'MAIN';
    if v_product is not null then
      select l.inventory_variant_id,l.location_code into v_variant,v_location
        from public.catalog_inventory_links l
        join public.catalog_products c on c.id=l.catalog_product_id and c.organization_id=l.organization_id
        join public.inventory_variants iv on iv.id=l.inventory_variant_id and iv.organization_id=l.organization_id and iv.active
        where l.organization_id=v_org and l.catalog_product_id=v_product and l.branch_id=v_branch and l.active and c.is_published;
      if not found then v_variant:=null; v_location:='MAIN'; end if;
    end if;
    v_fulfilled:=v_quantity; v_backordered:=0;
    if v_variant is not null then
      -- Lock the variant row so concurrent sales cannot both consume the last units,
      -- including when the branch has no inventory_stock row yet.
      perform 1 from public.inventory_variants where id=v_variant and organization_id=v_org for update;
      select coalesce(sum(quantity-reserved_quantity),0) into v_available from public.inventory_stock
        where organization_id=v_org and variant_id=v_variant and branch_id=v_branch and location_code=v_location;
      if v_available<v_quantity then
        if not coalesce(p_allow_backorder,false) then raise exception 'Existencia disponible insuficiente para %.',coalesce(v_line->>'description','artículo'); end if;
        v_fulfilled:=greatest(v_available,0); v_backordered:=v_quantity-v_fulfilled;
        v_backorder_total:=v_backorder_total+v_backordered;
      end if;
    end if;
    insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total)
    values (v_org,v_sale,v_variant,v_product,coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2));
    if v_variant is not null and v_fulfilled>0 then
      insert into public.inventory_movements (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values (v_org,v_variant,v_branch,v_location,'sale',-v_fulfilled,'Orden POS '||v_sale_code,'sale',v_sale,v_user);
    end if;
  end loop;
  update public.sales set urgent_backorder=(v_backorder_total>0) where id=v_sale;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if coalesce(nullif(v_payment->>'amount','')::numeric,0)>0 then
      insert into public.sale_payments (organization_id,sale_id,method,amount,reference,note,created_by)
      values (v_org,v_sale,v_payment->>'method',round((v_payment->>'amount')::numeric,2),coalesce(v_payment->>'reference',''),coalesce(v_payment->>'note',''),v_user);
    end if;
  end loop;
  update public.sales set payment_method=coalesce((select min(method) from public.sale_payments where sale_id=v_sale),'other') where id=v_sale;
  return jsonb_build_object('sale_id',v_sale,'sale_code',v_sale_code,'subtotal',v_subtotal,'discount',v_discount,
    'total',v_subtotal-v_discount,'paid',v_paid,'balance',v_subtotal-v_discount-v_paid,'backordered_quantity',v_backorder_total,'replayed',false);
end;
$function$;

revoke all on function public.create_pos_sale(uuid,uuid,text,numeric,text,boolean,jsonb) from public,anon;
grant execute on function public.create_pos_sale(uuid,uuid,text,numeric,text,boolean,jsonb) to authenticated;
revoke all on function public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb) to authenticated;
