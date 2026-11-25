-- Persist the approved financial breakdown for POS sales. New manual sales use
-- the organization's configured calculator tax rate; approved quotes keep the
-- tax, discount, and shipping values already accepted by the customer.
alter table public.sales
  add column if not exists tax_rate numeric(7,4),
  add column if not exists tax_amount numeric(14,2),
  add column if not exists shipping_cost numeric(14,2) not null default 0;

alter table public.sales
  drop constraint if exists sales_tax_rate_check;
alter table public.sales
  add constraint sales_tax_rate_check
  check (tax_rate is null or tax_rate between 0 and 100);

alter table public.sales
  drop constraint if exists sales_tax_amount_check;
alter table public.sales
  add constraint sales_tax_amount_check
  check (tax_amount is null or tax_amount >= 0);

alter table public.sales
  drop constraint if exists sales_shipping_cost_check;
alter table public.sales
  add constraint sales_shipping_cost_check
  check (shipping_cost >= 0);

-- Adapt the vetted, idempotent sale function in place so current inventory,
-- material-consumption, authorization, and retry safeguards remain intact.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb)'::regprocedure);
  v_old text;
  v_new text;
begin
  v_definition := replace(v_definition,E'\r\n',E'\n');
  v_old := $old$  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(p_discount,0);$old$;
  v_new := $new$  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(p_discount,0);
  v_tax_rate numeric(7,4) := null;
  v_tax_amount numeric(14,2) := 0;
  v_shipping_cost numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_quote_id uuid;
  v_quote_status text;
  v_quote_confirmed boolean;
  v_quote_selected_total numeric(14,2);
  v_quote_items jsonb;
  v_quote_financial jsonb;$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'No se pudo extender el POS: cambió la declaración de sus valores financieros.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if v_customer is not null and not exists(select 1 from public.customers where id=v_customer and organization_id=v_org) then$old$;
  v_new := $new$  v_quote_id := nullif(trim(p_customer_data->>'central_quote_id'),'')::uuid;
  if v_quote_id is not null then
    select q.status,q.price_confirmed,q.selected_total,q.items
      into v_quote_status,v_quote_confirmed,v_quote_selected_total,v_quote_items
      from public.central_quotes q
      where q.id=v_quote_id and q.organization_id=v_org
      for update;
    if not found or v_quote_status<>'accepted' or not coalesce(v_quote_confirmed,false) or v_quote_selected_total is null then
      raise exception 'La cotización debe seguir aceptada y tener su precio confirmado.' using errcode='22023';
    end if;
    select entry.value #> '{document_details,financial}' into v_quote_financial
      from jsonb_array_elements(coalesce(v_quote_items,'[]'::jsonb)) with ordinality entry(value,ordinality)
      where jsonb_typeof(entry.value #> '{document_details,financial}')='object'
      order by entry.ordinality limit 1;
    if v_quote_financial is null then
      v_tax_rate := 0;
      v_tax_amount := 0;
      v_shipping_cost := 0;
      if v_discount<>0 then raise exception 'La cotización no contiene un desglose validado para su descuento.' using errcode='22023'; end if;
    else
      v_tax_rate := coalesce(nullif(v_quote_financial->>'iva_rate','')::numeric,0);
      v_tax_amount := case when coalesce((v_quote_financial->>'iva_applied')::boolean,false)
        then round(coalesce(nullif(v_quote_financial->>'iva_amount','')::numeric,0),2) else 0 end;
      v_shipping_cost := round(coalesce(nullif(v_quote_financial->>'shipping_cost','')::numeric,0),2);
      if v_discount is distinct from round(coalesce(nullif(v_quote_financial->>'discount_amount','')::numeric,0),2) then
        raise exception 'El descuento de la venta debe coincidir con la cotización aprobada.' using errcode='22023';
      end if;
      if v_tax_rate<0 or v_tax_rate>100 or v_tax_amount<0 or v_shipping_cost<0 then
        raise exception 'El desglose tributario de la cotización no es válido.' using errcode='22023';
      end if;
      if coalesce((v_quote_financial->>'iva_applied')::boolean,false)
        and v_tax_amount<>round((coalesce(nullif(v_quote_financial->>'subtotal','')::numeric,0)-v_discount)*v_tax_rate/100,2) then
        raise exception 'El IVA de la cotización no coincide con su tasa y subtotal.' using errcode='22023';
      end if;
      if nullif(v_quote_financial->>'total','') is not null
        and round((v_quote_financial->>'total')::numeric,2)<>round(v_quote_selected_total,2) then
        raise exception 'El total guardado en la cotización no coincide con su precio confirmado.' using errcode='22023';
      end if;
    end if;
  else
    select coalesce(cs.tax_rate,15) into v_tax_rate
      from public.calculator_settings cs
      where cs.organization_id=v_org and cs.id='default';
    v_tax_rate := coalesce(v_tax_rate,15);
    if v_tax_rate<0 or v_tax_rate>100 then raise exception 'La tasa de IVA configurada no es válida.' using errcode='22023'; end if;
  end if;

  if v_customer is not null and not exists(select 1 from public.customers where id=v_customer and organization_id=v_org) then$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'No se pudo extender el POS: falta el punto para verificar la cotización aprobada.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if v_discount>v_subtotal then raise exception 'El descuento supera el subtotal.'; end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop$old$;
  v_new := $new$  if v_discount>v_subtotal then raise exception 'El descuento supera el subtotal.'; end if;
  if v_quote_id is not null and v_quote_financial is not null then
    if round(v_subtotal,2)<>round(coalesce(nullif(v_quote_financial->>'subtotal','')::numeric,v_subtotal),2) then
      raise exception 'El subtotal de las líneas no coincide con el de la cotización aprobada.' using errcode='22023';
    end if;
  else
    v_tax_amount := round((v_subtotal-v_discount)*v_tax_rate/100,2);
  end if;
  v_total := round(v_subtotal-v_discount+v_tax_amount+v_shipping_cost,2);
  if v_quote_id is not null and round(v_total,2)<>round(v_quote_selected_total,2) then
    raise exception 'El desglose no coincide con el total de la cotización aprobada.' using errcode='22023';
  end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'No se pudo extender el POS: cambió la validación de pagos.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if v_paid > v_subtotal-v_discount then raise exception 'Los pagos superan el total de la orden.'; end if;

  v_sale_code := 'VC-'$old$;
  v_new := $new$  if v_paid > v_total then raise exception 'Los pagos superan el total de la orden.'; end if;

  v_sale_code := 'VC-'$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'No se pudo extender el POS: falta la validación final del cobro.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  insert into public.sales (organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,created_by,sale_code,payment_method,idempotency_key,idempotency_fingerprint)
  values (v_org,v_branch,v_customer,'confirmed',false,v_subtotal,v_discount,v_subtotal-v_discount,coalesce(p_note,''),v_user,v_sale_code,'other',trim(p_idempotency_key),v_fingerprint)$old$;
  v_new := $new$  insert into public.sales (organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,tax_rate,tax_amount,shipping_cost,total,note,created_by,sale_code,payment_method,idempotency_key,idempotency_fingerprint)
  values (v_org,v_branch,v_customer,'confirmed',false,v_subtotal,v_discount,v_tax_rate,v_tax_amount,v_shipping_cost,v_total,coalesce(p_note,''),v_user,v_sale_code,'other',trim(p_idempotency_key),v_fingerprint)$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'No se pudo extender el POS: cambió la escritura de la venta.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  return jsonb_build_object('sale_id',v_sale,'sale_code',v_sale_code,'subtotal',v_subtotal,'discount',v_discount,
    'total',v_subtotal-v_discount,'paid',v_paid,'balance',v_subtotal-v_discount-v_paid,'backordered_quantity',v_backorder_total,'replayed',false)$old$;
  v_new := $new$  return jsonb_build_object('sale_id',v_sale,'sale_code',v_sale_code,'subtotal',v_subtotal,'discount',v_discount,
    'tax_rate',v_tax_rate,'tax_amount',v_tax_amount,'shipping_cost',v_shipping_cost,
    'total',v_total,'paid',v_paid,'balance',v_total-v_paid,'backordered_quantity',v_backorder_total,'replayed',false)$new$;
  if strpos(v_definition,v_old)=0 then raise exception 'No se pudo extender el POS: cambió la respuesta financiera de la venta.'; end if;
  v_definition := replace(v_definition,v_old,v_new);

  execute v_definition;
end;
$migration$;
