-- Permite varias variantes físicas por producto de catálogo y valida la selección
-- en las RPC de alta y edición de POS. Mantiene explícitos los vínculos aprobados.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname = 'catalog_inventory_links'
      and con.contype = 'u'
      and (
        select array_agg(att.attname order by att.attname)
        from unnest(con.conkey) as key(attnum)
        join pg_attribute att on att.attrelid = rel.oid and att.attnum = key.attnum
      ) = array['branch_id', 'catalog_product_id', 'organization_id']::name[]
  loop
    execute format('alter table public.catalog_inventory_links drop constraint %I', v_constraint.conname);
  end loop;
end;
$$;

create unique index if not exists catalog_inventory_links_variant_uq
  on public.catalog_inventory_links (organization_id, catalog_product_id, branch_id, inventory_variant_id);

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
  v_requested_variant uuid;
  v_active_link_count integer;
  v_link_count integer;
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_fulfilled numeric(14,3);
  v_backordered numeric(14,3);
  v_available numeric(14,3);
  v_subtotal numeric(14,2) := 0;
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
  v_quote_financial jsonb;
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
  if exists (select 1 from jsonb_array_elements(p_lines) l where l ? 'line_key'
    and (nullif(trim(l->>'line_key'),'') is null or length(trim(l->>'line_key'))>160)) then
    raise exception 'La clave de línea no es válida.';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines) l where nullif(trim(l->>'line_key'),'') is not null)
     <> (select count(distinct trim(l->>'line_key')) from jsonb_array_elements(p_lines) l where nullif(trim(l->>'line_key'),'') is not null) then
    raise exception 'La clave de línea está duplicada.';
  end if;

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

  v_quote_id := nullif(trim(p_customer_data->>'central_quote_id'),'')::uuid;
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
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := coalesce(v_payment->>'method','other');
    if v_method not in ('cash','transfer','card','other') then raise exception 'Método de pago no válido.'; end if;
    if coalesce(nullif(v_payment->>'amount','')::numeric,0)<0 then raise exception 'El valor de pago no puede ser negativo.'; end if;
    v_paid := v_paid + round(coalesce(nullif(v_payment->>'amount','')::numeric,0),2);
  end loop;
  if v_paid > v_total then raise exception 'Los pagos superan el total de la orden.'; end if;

  v_sale_code := 'VC-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales (organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,tax_rate,tax_amount,shipping_cost,total,note,created_by,sale_code,payment_method,idempotency_key,idempotency_fingerprint)
  values (v_org,v_branch,v_customer,'confirmed',false,v_subtotal,v_discount,v_tax_rate,v_tax_amount,v_shipping_cost,v_total,coalesce(p_note,''),v_user,v_sale_code,'other',trim(p_idempotency_key),v_fingerprint)
  returning id into v_sale;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := nullif(v_line->>'quantity','')::numeric;
    v_price := nullif(v_line->>'unit_price','')::numeric;
    v_product := nullif(v_line->>'catalog_product_id','');
    v_variant := null;
    v_requested_variant := nullif(trim(v_line->>'variant_id'), '')::uuid;
    v_location := 'MAIN';
    if v_product is not null then
      select count(*) into v_active_link_count
      from public.catalog_inventory_links l
      where l.organization_id=v_org and l.catalog_product_id=v_product and l.branch_id=v_branch and l.active;

      select count(*) into v_link_count
      from public.catalog_inventory_links l
      join public.catalog_products c on c.id=l.catalog_product_id and c.organization_id=l.organization_id
      join public.inventory_variants iv on iv.id=l.inventory_variant_id and iv.organization_id=l.organization_id and iv.active
      join public.inventory_items i on i.id=iv.item_id and i.organization_id=iv.organization_id and i.active
      where l.organization_id=v_org and l.catalog_product_id=v_product and l.branch_id=v_branch and l.active and c.is_published;

      if v_link_count <> v_active_link_count then
        raise exception 'El producto tiene vínculos activos con fichas o variantes inactivas. Corrige el vínculo en Inventario antes de vender.' using errcode = '22023';
      end if;

      if v_requested_variant is not null then
        select l.inventory_variant_id, l.location_code into v_variant, v_location
        from public.catalog_inventory_links l
        join public.catalog_products c on c.id=l.catalog_product_id and c.organization_id=l.organization_id
        join public.inventory_variants iv on iv.id=l.inventory_variant_id and iv.organization_id=l.organization_id and iv.active
        join public.inventory_items i on i.id=iv.item_id and i.organization_id=iv.organization_id and i.active
        where l.organization_id=v_org
          and l.catalog_product_id=v_product
          and l.branch_id=v_branch
          and l.inventory_variant_id=v_requested_variant
          and l.active
          and c.is_published;
        if not found then
          raise exception 'La variante seleccionada no está vinculada a este producto y sucursal.' using errcode = '22023';
        end if;
      elsif v_link_count = 1 then
        select l.inventory_variant_id, l.location_code into v_variant, v_location
        from public.catalog_inventory_links l
        join public.catalog_products c on c.id=l.catalog_product_id and c.organization_id=l.organization_id
        join public.inventory_variants iv on iv.id=l.inventory_variant_id and iv.organization_id=l.organization_id and iv.active
        join public.inventory_items i on i.id=iv.item_id and i.organization_id=iv.organization_id and i.active
        where l.organization_id=v_org and l.catalog_product_id=v_product and l.branch_id=v_branch and l.active and c.is_published
        limit 1;
      elsif v_link_count > 1 then
        raise exception 'Selecciona una variante de inventario para %.', coalesce(v_line->>'description','artículo') using errcode = '22023';
      end if;
    elsif v_requested_variant is not null then
      raise exception 'La variante de inventario requiere un producto del catálogo.' using errcode = '22023';
    end if;
    if v_product is not null and v_variant is not null then
      if pg_catalog.upper(pg_catalog.btrim(coalesce(v_location, 'MAIN'))) <> 'MAIN' then
        raise exception 'Los productos del catálogo deben descontar desde MAIN hasta que la reversión de ventas conserve la ubicación.' using errcode = '22023';
      end if;
      v_location := 'MAIN';
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
    insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,client_line_key,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total,material_requests,finishing_options)
    values (v_org,v_sale,v_variant,v_product,nullif(trim(v_line->>'line_key'),''),coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2),coalesce(v_line->'material_requests','[]'::jsonb),coalesce(v_line->'finishing_options','{}'::jsonb));
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
    'tax_rate',v_tax_rate,'tax_amount',v_tax_amount,'shipping_cost',v_shipping_cost,
    'total',v_total,'paid',v_paid,'balance',v_total-v_paid,'backordered_quantity',v_backorder_total,'replayed',false);
end;
$function$;

revoke all on function public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb) from public, anon;
grant execute on function public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb) to authenticated;

create or replace function public.amend_confirmed_pos_sale(
  p_sale_id uuid,
  p_customer_id uuid default null,
  p_customer_data jsonb default null,
  p_discount numeric default 0,
  p_discount_reason text default '',
  p_note text default '',
  p_lines jsonb default '[]'::jsonb,
  p_payments jsonb default null,
  p_amendment_reason text default 'Edición de orden POS'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_customer uuid;
  v_cust_name text;
  v_cust_phone text;
  v_cust_email text;
  v_cust_doc text;
  v_cust_notes text;
  v_new_status text;
  v_prev_snapshot jsonb;
  v_new_snapshot jsonb;
  v_financial_delta numeric(14,2);
  v_old_line record;
  v_line jsonb;
  v_line_id uuid;
  v_kept_line_ids uuid[] := '{}';
  v_deleted_job_ids uuid[] := '{}';
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_disc_reason text;
  v_tax_rate numeric(7,4);
  v_tax_amount numeric(14,2) := 0;
  v_shipping numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_backorder_total numeric(14,3) := 0;
  v_variant uuid;
  v_product text;
  v_requested_variant uuid;
  v_active_link_count integer;
  v_link_count integer;
  v_location text;
  v_fulfilled numeric(14,3);
  v_backordered numeric(14,3);
  v_available numeric(14,3);
  v_payment jsonb;
  v_p_amount numeric(14,2);
  v_p_method text;
  v_p_session uuid;
  v_prev_cash_session uuid;
  v_current_open_session uuid;
  v_touched_sessions uuid[];
  v_sid uuid;
  v_old_model text;
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La orden POS no existe.' using errcode = '22023';
  end if;

  if not (
    app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'edit', v_sale.branch_id)
    or app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'edit')
  ) then
    raise exception 'No tienes permiso para editar ventas en esta sucursal.' using errcode = '42501';
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);

  select coalesce(array_agg(distinct sp.cash_session_id), '{}')
  into v_touched_sessions
  from public.sale_payments sp
  where sp.sale_id = v_sale.id and sp.cash_session_id is not null;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id), '[]'::jsonb)
  ) into v_prev_snapshot;

  v_customer := coalesce(p_customer_id, v_sale.customer_id);

  if p_customer_data is not null and jsonb_typeof(p_customer_data) = 'object' then
    v_cust_name := nullif(trim(p_customer_data->>'full_name'), '');
    if v_cust_name is not null then
      v_cust_phone := coalesce(trim(p_customer_data->>'phone'), '');
      v_cust_email := coalesce(trim(p_customer_data->>'email'), '');
      v_cust_doc := coalesce(trim(p_customer_data->>'document_reference'), '');
      v_cust_notes := coalesce(trim(p_customer_data->>'notes'), '');

      if v_customer is not null and exists (
        select 1 from public.customers where id = v_customer and organization_id = v_sale.organization_id
      ) then
        update public.customers
        set full_name = v_cust_name,
            phone = case when v_cust_phone <> '' then v_cust_phone else phone end,
            email = case when v_cust_email <> '' then v_cust_email else email end,
            document_reference = case when v_cust_doc <> '' then v_cust_doc else document_reference end,
            notes = case when v_cust_notes <> '' then v_cust_notes else notes end,
            updated_at = now()
        where id = v_customer and organization_id = v_sale.organization_id;
      else
        if v_cust_phone <> '' then
          select id into v_customer
          from public.customers
          where organization_id = v_sale.organization_id and phone = v_cust_phone
          limit 1;
        end if;
        if v_customer is null then
          insert into public.customers (
            organization_id, full_name, phone, email, document_reference, notes, created_by
          ) values (
            v_sale.organization_id, v_cust_name, v_cust_phone, v_cust_email, v_cust_doc, v_cust_notes, v_user
          ) returning id into v_customer;
        else
          update public.customers
          set full_name = v_cust_name,
              email = case when v_cust_email <> '' then v_cust_email else email end,
              document_reference = case when v_cust_doc <> '' then v_cust_doc else document_reference end,
              notes = case when v_cust_notes <> '' then v_cust_notes else notes end,
              updated_at = now()
          where id = v_customer and organization_id = v_sale.organization_id;
        end if;
      end if;
    end if;
  end if;

  if v_customer is not null and not exists (
    select 1 from public.customers where id = v_customer and organization_id = v_sale.organization_id
  ) then
    raise exception 'El cliente seleccionado no pertenece a Visual Corp.' using errcode = '22023';
  end if;

  if v_cust_name is null and v_customer is not null then
    select full_name, phone into v_cust_name, v_cust_phone
    from public.customers
    where id = v_customer and organization_id = v_sale.organization_id;
  end if;

  v_new_status := case when v_sale.status = 'cancelled' then 'confirmed' else v_sale.status end;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    if exists (
      select 1 from public.sale_material_consumptions c
      where c.organization_id = v_sale.organization_id and c.sale_id = v_sale.id
    ) or exists (
      select 1
      from jsonb_array_elements(p_lines) entry(value)
      join public.catalog_material_recipes r
        on r.organization_id = v_sale.organization_id
       and r.catalog_product_id = entry.value->>'catalog_product_id'
       and r.branch_id = v_sale.branch_id and r.active
    ) then
      raise exception 'Esta venta usa materiales controlados por receta. No reemplaces sus líneas desde el editor; conserva la trazabilidad del consumo y gestiona cualquier corrección desde operaciones.' using errcode = '22023';
    end if;

    -- Revert inventory movements for all old lines of this sale
    for v_old_line in
      select * from public.sale_lines where sale_id = v_sale.id
    loop
      if v_old_line.variant_id is not null and v_old_line.fulfilled_quantity > 0 then
        select coalesce(i.custom_fields->>'inventory_model', '') into v_old_model
        from public.inventory_variants iv
        join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id
        where iv.id = v_old_line.variant_id and iv.organization_id = v_sale.organization_id;

        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code, movement_type,
          quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id,
          v_old_line.variant_id,
          v_sale.branch_id,
          'MAIN',
          'adjustment',
          v_old_line.fulfilled_quantity,
          'Reversión por edición POS ' || coalesce(v_sale.sale_code, v_sale.id::text),
          case when v_old_model = 'roll' then 'inventory_roll' else 'sale' end,
          v_sale.id,
          v_user
        );
      end if;
    end loop;

    -- Identify kept line ids
    select coalesce(array_agg(distinct (nullif(trim(entry.value->>'id'), ''))::uuid), '{}')
    into v_kept_line_ids
    from jsonb_array_elements(p_lines) entry(value)
    where nullif(trim(entry.value->>'id'), '') is not null
      and exists (
        select 1 from public.sale_lines sl
        where sl.id = (nullif(trim(entry.value->>'id'), ''))::uuid
          and sl.sale_id = v_sale.id
      );

    -- Guard: If a removed line has an active/completed production job or started steps, prevent loss of workshop progress
    if exists (
      select 1
      from public.production_jobs j
      where j.sale_id = v_sale.id
        and j.sale_line_id in (
          select id from public.sale_lines
          where sale_id = v_sale.id and not (id = any(v_kept_line_ids))
        )
        and (
          j.status = 'completed'
          or exists (
            select 1 from public.production_job_steps s
            where s.job_id = j.id and s.status in ('in_progress', 'completed')
          )
        )
    ) then
      raise exception 'No se puede quitar un artículo cuyo trabajo de taller ya inició o terminó.' using errcode = '22023';
    end if;

    -- Unlink purchase requests for deleted jobs and delete jobs of removed lines only
    select coalesce(array_agg(j.id), '{}')
    into v_deleted_job_ids
    from public.production_jobs j
    where j.sale_id = v_sale.id
      and j.sale_line_id in (
        select id from public.sale_lines
        where sale_id = v_sale.id and not (id = any(v_kept_line_ids))
      );

    if array_length(v_deleted_job_ids, 1) > 0 then
      update public.purchase_requests
      set production_job_id = null, updated_at = now()
      where organization_id = v_sale.organization_id
        and production_job_id = any(v_deleted_job_ids);

      delete from public.production_jobs
      where id = any(v_deleted_job_ids);
    end if;

    -- Delete removed sale lines only
    delete from public.sale_lines
    where sale_id = v_sale.id and not (id = any(v_kept_line_ids));

    -- Calculate subtotal
    v_subtotal := 0;
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      if v_quantity is null or v_quantity <= 0 or v_price is null or v_price < 0 then
        raise exception 'Cantidad o precio inválido en artículo o servicio.' using errcode = '22023';
      end if;
      v_subtotal := v_subtotal + round(v_quantity * v_price, 2);
    end loop;

    v_discount := round(coalesce(p_discount, 0), 2);
    if v_discount < 0 then
      raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
    end if;
    if v_discount > v_subtotal then
      raise exception 'El descuento supera el subtotal.' using errcode = '22023';
    end if;

    v_tax_rate := coalesce(v_sale.tax_rate, 15);
    v_tax_amount := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_shipping := coalesce(v_sale.shipping_cost, 0);
    v_total := round(v_subtotal - v_discount + v_tax_amount + v_shipping, 2);

    v_backorder_total := 0;
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_line_id := nullif(trim(v_line->>'id'), '')::uuid;
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      v_product := nullif(trim(v_line->>'catalog_product_id'), '');
      v_requested_variant := nullif(trim(v_line->>'variant_id'), '')::uuid;
      v_variant := null;
      v_location := coalesce(nullif(trim(v_line->>'location_code'), ''), 'MAIN');

      if v_product is not null then
        select count(*) into v_active_link_count
        from public.catalog_inventory_links l
        where l.organization_id = v_sale.organization_id
          and l.catalog_product_id = v_product
          and l.branch_id = v_sale.branch_id
          and l.active;

        select count(*) into v_link_count
        from public.catalog_inventory_links l
        join public.catalog_products c on c.id = l.catalog_product_id and c.organization_id = l.organization_id
        join public.inventory_variants iv on iv.id = l.inventory_variant_id and iv.organization_id = l.organization_id and iv.active
        join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id and i.active
        where l.organization_id = v_sale.organization_id
          and l.catalog_product_id = v_product
          and l.branch_id = v_sale.branch_id
          and l.active
          and c.is_published;

        if v_link_count <> v_active_link_count then
          raise exception 'El producto tiene vínculos activos con fichas o variantes inactivas. Corrige el vínculo en Inventario antes de editar la venta.' using errcode = '22023';
        end if;

        if v_requested_variant is not null then
          select l.inventory_variant_id, l.location_code into v_variant, v_location
          from public.catalog_inventory_links l
          join public.catalog_products c on c.id = l.catalog_product_id and c.organization_id = l.organization_id
          join public.inventory_variants iv on iv.id = l.inventory_variant_id and iv.organization_id = l.organization_id and iv.active
          join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id and i.active
          where l.organization_id = v_sale.organization_id
            and l.catalog_product_id = v_product
            and l.branch_id = v_sale.branch_id
            and l.inventory_variant_id = v_requested_variant
            and l.active
            and c.is_published;
          if not found then
            raise exception 'La variante seleccionada no está vinculada a este producto y sucursal.' using errcode = '22023';
          end if;
        elsif v_link_count = 1 then
          select l.inventory_variant_id, l.location_code into v_variant, v_location
          from public.catalog_inventory_links l
          join public.catalog_products c on c.id = l.catalog_product_id and c.organization_id = l.organization_id
          join public.inventory_variants iv on iv.id = l.inventory_variant_id and iv.organization_id = l.organization_id and iv.active
          join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id and i.active
          where l.organization_id = v_sale.organization_id
            and l.catalog_product_id = v_product
            and l.branch_id = v_sale.branch_id
            and l.active
            and c.is_published
          limit 1;
        elsif v_link_count > 1 then
          raise exception 'Selecciona una variante de inventario para %.', coalesce(v_line->>'description','artículo') using errcode = '22023';
        end if;
      elsif v_requested_variant is not null then
        -- Preserve legacy non-catalog inventory lines; catalog variants are always validated above.
        v_variant := v_requested_variant;
      end if;

      if v_product is not null and v_variant is not null then
        if pg_catalog.upper(pg_catalog.btrim(coalesce(v_location, 'MAIN'))) <> 'MAIN' then
          raise exception 'Los productos del catálogo deben descontar desde MAIN hasta que la reversión de ventas conserve la ubicación.' using errcode = '22023';
        end if;
        v_location := 'MAIN';
      end if;

      v_fulfilled := v_quantity;
      v_backordered := 0;

      if v_variant is not null then
        perform 1 from public.inventory_variants where id = v_variant and organization_id = v_sale.organization_id for update;
        select coalesce(sum(quantity), 0) into v_available
        from public.inventory_stock
        where organization_id = v_sale.organization_id
          and variant_id = v_variant
          and branch_id = v_sale.branch_id
          and location_code = v_location;

        if v_available < v_quantity then
          v_fulfilled := greatest(v_available, 0);
          v_backordered := v_quantity - v_fulfilled;
          v_backorder_total := v_backorder_total + v_backordered;
        end if;
      end if;

      if v_line_id is not null and (v_line_id = any(v_kept_line_ids)) then
        -- Update kept line in place, preserving line ID and associated production_job
        update public.sale_lines
        set variant_id = v_variant,
            catalog_product_id = v_product,
            client_line_key = coalesce(nullif(trim(v_line->>'line_key'), ''), client_line_key),
            sku_snapshot = coalesce(nullif(trim(v_line->>'sku'), ''), nullif(trim(v_line->>'sku_snapshot'), ''), sku_snapshot),
            description_snapshot = coalesce(nullif(trim(v_line->>'description'), ''), nullif(trim(v_line->>'description_snapshot'), ''), description_snapshot),
            quantity = v_quantity,
            fulfilled_quantity = v_fulfilled,
            backordered_quantity = v_backordered,
            unit_price = v_price,
            line_total = round(v_quantity * v_price, 2),
            material_requests = case when jsonb_typeof(v_line->'material_requests') = 'array' then v_line->'material_requests' else material_requests end,
            finishing_options = case when jsonb_typeof(v_line->'finishing_options') = 'object' then v_line->'finishing_options' else finishing_options end
        where id = v_line_id and sale_id = v_sale.id;

        update public.production_jobs
        set title = coalesce(nullif(trim(v_line->>'description'), ''), nullif(trim(v_line->>'description_snapshot'), ''), title),
            customer_name = coalesce(v_cust_name, customer_name),
            customer_phone = coalesce(nullif(v_cust_phone, ''), customer_phone),
            updated_at = now()
        where sale_line_id = v_line_id
          and sale_id = v_sale.id
          and status not in ('cancelled', 'completed');
      else
        insert into public.sale_lines (
          organization_id, sale_id, variant_id, catalog_product_id, client_line_key,
          sku_snapshot, description_snapshot, quantity, fulfilled_quantity, backordered_quantity,
          unit_price, line_total, material_requests, finishing_options
        ) values (
          v_sale.organization_id,
          v_sale.id,
          v_variant,
          v_product,
          nullif(trim(v_line->>'line_key'), ''),
          coalesce(nullif(trim(v_line->>'sku'), ''), nullif(trim(v_line->>'sku_snapshot'), ''), ''),
          coalesce(nullif(trim(v_line->>'description'), ''), nullif(trim(v_line->>'description_snapshot'), ''), 'Orden POS'),
          v_quantity,
          v_fulfilled,
          v_backordered,
          v_price,
          round(v_quantity * v_price, 2),
          case when jsonb_typeof(v_line->'material_requests') = 'array' then v_line->'material_requests' else '[]'::jsonb end,
          case when jsonb_typeof(v_line->'finishing_options') = 'object' then v_line->'finishing_options' else '{}'::jsonb end
        );
      end if;

      if v_variant is not null and v_fulfilled > 0 then
        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code, movement_type,
          quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id,
          v_variant,
          v_sale.branch_id,
          v_location,
          'sale',
          -v_fulfilled,
          'Orden POS ' || coalesce(v_sale.sale_code, v_sale.id::text),
          'sale',
          v_sale.id,
          v_user
        );
      end if;
    end loop;
  else
    v_subtotal := v_sale.subtotal;
    v_discount := round(coalesce(p_discount, v_sale.discount_total), 2);
    v_tax_rate := coalesce(v_sale.tax_rate, 15);
    v_tax_amount := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_shipping := coalesce(v_sale.shipping_cost, 0);
    v_total := round(v_subtotal - v_discount + v_tax_amount + v_shipping, 2);
    v_backorder_total := case when v_sale.urgent_backorder then 1 else 0 end;
  end if;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    select cash_session_id into v_prev_cash_session
    from public.sale_payments
    where sale_id = v_sale.id and method = 'cash' and cash_session_id is not null
    order by created_at asc
    limit 1;

    select id into v_current_open_session
    from public.cash_sessions
    where organization_id = v_sale.organization_id
      and branch_id = v_sale.branch_id
      and opened_by = v_user
      and status = 'open'
    order by opened_at desc
    limit 1;

    delete from public.sale_payments where sale_id = v_sale.id;

    for v_payment in select value from jsonb_array_elements(p_payments) loop
      v_p_amount := round(coalesce(nullif(v_payment->>'amount', '')::numeric, 0), 2);
      if v_p_amount > 0 then
        v_p_method := coalesce(v_payment->>'method', 'other');
        if v_p_method not in ('cash', 'transfer', 'card', 'other') then
          v_p_method := 'other';
        end if;
        v_p_session := null;
        if v_p_method = 'cash' then
          v_p_session := nullif(trim(v_payment->>'cash_session_id'), '')::uuid;
          if v_p_session is null then
            v_p_session := v_prev_cash_session;
          end if;
          if v_p_session is null then
            v_p_session := v_current_open_session;
          end if;
          if v_p_session is not null and not (v_p_session = any(v_touched_sessions)) then
            v_touched_sessions := array_append(v_touched_sessions, v_p_session);
          end if;
        end if;

        insert into public.sale_payments (
          organization_id, sale_id, method, amount, reference, note, created_by, cash_session_id
        ) values (
          v_sale.organization_id,
          v_sale.id,
          v_p_method,
          v_p_amount,
          coalesce(v_payment->>'reference', ''),
          coalesce(v_payment->>'note', ''),
          v_user,
          v_p_session
        );
      end if;
    end loop;
  end if;

  v_financial_delta := v_total - v_sale.total;

  v_disc_reason := trim(coalesce(p_discount_reason, ''));
  if v_disc_reason = '' then
    v_disc_reason := v_sale.discount_reason;
  end if;
  if v_discount > 0 and v_disc_reason = '' then
    v_disc_reason := 'Descuento autorizado en POS';
  end if;

  update public.sales
  set customer_id = v_customer,
      status = v_new_status,
      subtotal = v_subtotal,
      discount_total = v_discount,
      discount_reason = left(v_disc_reason, 300),
      tax_amount = v_tax_amount,
      total = v_total,
      note = coalesce(nullif(trim(p_note), ''), note),
      payment_method = coalesce((select min(method) from public.sale_payments where sale_id = v_sale.id), payment_method),
      urgent_backorder = (v_backorder_total > 0),
      updated_at = now()
  where id = v_sale.id
  returning * into v_sale;

  if array_length(v_touched_sessions, 1) > 0 then
    foreach v_sid in array v_touched_sessions loop
      perform app_private.recalculate_closed_cash_session(v_sid);
    end loop;
  end if;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id), '[]'::jsonb)
  ) into v_new_snapshot;

  insert into public.sale_amendments (
    organization_id, sale_id, reason, previous_snapshot, new_snapshot,
    financial_delta, created_by
  ) values (
    v_sale.organization_id,
    v_sale.id,
    coalesce(nullif(trim(p_amendment_reason), ''), 'Edición de orden POS'),
    v_prev_snapshot,
    v_new_snapshot,
    v_financial_delta,
    v_user
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_code', v_sale.sale_code,
    'status', v_sale.status,
    'customer_id', v_sale.customer_id,
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount_total,
    'discount_reason', v_sale.discount_reason,
    'tax_rate', v_sale.tax_rate,
    'tax_amount', v_sale.tax_amount,
    'total', v_sale.total,
    'financial_delta', v_financial_delta,
    'updated_at', v_sale.updated_at
  );
end;
$$;

revoke all on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) to authenticated;
