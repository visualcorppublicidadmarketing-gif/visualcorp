-- One financial rule for POS balance validation and the POS sales inbox.
-- Refunds reduce collected cash only after Finance settles them. Returned goods
-- reduce the sale value using the same proportional sale discount as Finance.
create or replace function app_private.visualcorp_sale_balance(p_organization_id uuid, p_sale_id uuid)
returns table (
  sale_total numeric(14,2),
  adjusted_total numeric(14,2),
  returned_value numeric(14,2),
  paid numeric(14,2),
  settled_refund numeric(14,2),
  collected numeric(14,2),
  balance numeric(14,2),
  customer_credit numeric(14,2)
)
language sql stable security definer set search_path = '' as $$
  with sale as (
    select s.id, s.organization_id, s.total, s.subtotal, s.discount_total,
      case when coalesce(s.subtotal, 0) > 0
        then least(1::numeric, greatest(0::numeric, coalesce(s.discount_total, 0) / s.subtotal))
        else 0::numeric end as discount_rate
    from public.sales s
    where s.id = p_sale_id and s.organization_id = p_organization_id
  ), totals as (
    select sale.*,
      coalesce((
        select sum(srl.quantity * sl.unit_price * (1 - sale.discount_rate))
        from public.sale_return_lines srl
        join public.sale_returns sr on sr.id = srl.return_id and sr.organization_id = srl.organization_id
        join public.sale_lines sl on sl.id = srl.sale_line_id and sl.organization_id = srl.organization_id
        where sr.sale_id = sale.id and sr.organization_id = sale.organization_id
          and sr.kind = 'return'
      ), 0)::numeric(14,2) as returned_value,
      coalesce((select sum(sp.amount) from public.sale_payments sp
        where sp.sale_id = sale.id and sp.organization_id = sale.organization_id), 0)::numeric(14,2) as paid,
      coalesce((select sum(rs.amount) from public.sale_refund_settlements rs
        where rs.sale_id = sale.id and rs.organization_id = sale.organization_id), 0)::numeric(14,2) as settled_refund
    from sale
  ), adjusted as (
    select totals.*,
      greatest(0::numeric, totals.total - round(totals.returned_value, 2))::numeric(14,2) as adjusted_total,
      greatest(0::numeric, totals.paid - totals.settled_refund)::numeric(14,2) as collected
    from totals
  )
  select adjusted.total::numeric(14,2),
    adjusted.adjusted_total,
    round(adjusted.returned_value, 2)::numeric(14,2),
    adjusted.paid,
    adjusted.settled_refund,
    adjusted.collected,
    greatest(0::numeric, adjusted.adjusted_total - adjusted.collected)::numeric(14,2),
    greatest(0::numeric, adjusted.collected - adjusted.adjusted_total)::numeric(14,2)
  from adjusted;
$$;
revoke all on function app_private.visualcorp_sale_balance(uuid, uuid) from public, anon, authenticated;

-- Match the sale -> return lock order used by returns and payment collection so
-- a refund settlement cannot race a balance calculation or deadlock a return.
create or replace function app_private.settle_sale_refund(
  p_return uuid, p_reference text default '', p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_return public.sale_returns%rowtype;
  v_sale_id uuid;
  v_org uuid;
  v_branch uuid;
  v_sale_code text;
  v_session uuid;
  v_settlement uuid;
  v_available_refund numeric(14,2);
begin
  if v_uid is null then raise exception 'Inicia sesión para liquidar el reembolso.' using errcode = '42501'; end if;
  select s.id into v_sale_id
    from public.sales s join public.sale_returns r on r.sale_id=s.id and r.organization_id=s.organization_id
   where r.id=p_return for update of s;
  if v_sale_id is null then raise exception 'No encontramos la venta del reembolso.' using errcode = '22023'; end if;
  select r.* into v_return from public.sale_returns r where r.id=p_return for update;
  if not found then raise exception 'No encontramos el reembolso pendiente.' using errcode = '22023'; end if;

  v_org := v_return.organization_id;
  select s.branch_id,s.sale_code into v_branch,v_sale_code
    from public.sales s where s.id=v_sale_id and s.organization_id=v_org;
  if v_branch is null or not app_private.has_visualcorp_access(v_org,'sales','settle_refund',v_branch) then
    raise exception 'No tienes permiso para liquidar este reembolso.' using errcode = '42501';
  end if;

  select rs.id into v_settlement from public.sale_refund_settlements rs
   where rs.organization_id=v_org and rs.return_id=p_return;
  if v_settlement is not null then
    return jsonb_build_object('settlement_id',v_settlement,'already_settled',true);
  end if;
  if v_return.refund_status<>'pending' or v_return.refund_amount<=0 then
    raise exception 'El reembolso debe tener un monto positivo y seguir pendiente.' using errcode = '22023';
  end if;
  select greatest(0::numeric,
    coalesce((select sum(sp.amount) from public.sale_payments sp where sp.organization_id=v_org and sp.sale_id=v_sale_id),0)
    - coalesce((select sum(rs.amount) from public.sale_refund_settlements rs where rs.organization_id=v_org and rs.sale_id=v_sale_id),0)
  )::numeric(14,2) into v_available_refund;
  if round(v_return.refund_amount,2)>v_available_refund then
    raise exception 'El reembolso supera los pagos netos recibidos. Registra primero los pagos pendientes de la venta.' using errcode = '22023';
  end if;

  if v_return.refund_method='cash' then
    if not app_private.has_visualcorp_access(v_org,'cash','manage_cash',v_branch) then
      raise exception 'Tu perfil no tiene permiso para registrar salidas en caja.' using errcode = '42501';
    end if;
    select cs.id into v_session from public.cash_sessions cs
     where cs.organization_id=v_org and cs.branch_id=v_branch and cs.opened_by=v_uid and cs.status='open'
     order by cs.opened_at desc limit 1 for update;
    if v_session is null then raise exception 'Abre la caja de esta sucursal antes de liquidar un reembolso en efectivo.' using errcode = '22023'; end if;
  end if;

  insert into public.sale_refund_settlements(
    organization_id,return_id,sale_id,branch_id,return_code,amount,method,reference,cash_session_id,settled_by
  ) values (
    v_org,v_return.id,v_sale_id,v_branch,v_return.return_code,round(v_return.refund_amount,2),v_return.refund_method,
    left(trim(coalesce(p_reference,'')),200),v_session,v_uid
  ) returning id into v_settlement;

  if v_return.refund_method='cash' then
    insert into public.cash_session_movements(
      organization_id,session_id,direction,amount,reason,idempotency_key,created_by
    ) values (
      v_org,v_session,'out',round(v_return.refund_amount,2),
      'Reembolso '||v_return.return_code||' · venta '||coalesce(v_sale_code,v_sale_id::text),
      'sale-refund:'||v_return.id::text,v_uid
    );
  end if;

  update public.sale_returns set refund_status='refunded',
    note=concat_ws(E'\n',nullif(note,''),nullif(left(trim(coalesce(p_note,'')),500),''))
   where id=v_return.id and organization_id=v_org;
  return jsonb_build_object('settlement_id',v_settlement,'already_settled',false,'cash_session_id',v_session);
end;
$$;
revoke all on function app_private.settle_sale_refund(uuid,text,text) from public,anon;
grant execute on function app_private.settle_sale_refund(uuid,text,text) to authenticated;

-- Keep the lock on the sale and check idempotent replay before current status
-- or balance. This lets an ambiguous network retry confirm the original payment.
create or replace function public.record_sale_payment(
  p_idempotency_key text,
  p_sale_id uuid,
  p_method text,
  p_amount numeric,
  p_reference text default '',
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_branch uuid;
  v_status text;
  v_balance record;
  v_payment_id uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_method text := coalesce(p_method, 'other');
begin
  if v_user is null then raise exception 'Inicia sesión para registrar un abono.' using errcode = '42501'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 12 and 160 then
    raise exception 'La clave del abono no es válida.' using errcode = '22023';
  end if;
  if p_amount is null or round(p_amount,2) <= 0 then raise exception 'El valor del abono debe ser mayor que cero.' using errcode = '22023'; end if;
  if v_method not in ('cash','transfer','card','other') then raise exception 'Método de pago no válido.' using errcode = '22023'; end if;

  select s.organization_id,s.branch_id,s.status into v_org,v_branch,v_status
    from public.sales s where s.id=p_sale_id for update;
  if v_org is null then raise exception 'No encontramos la orden.' using errcode = '22023'; end if;
  if not app_private.has_visualcorp_access(v_org,'sales','edit',v_branch) then
    raise exception 'No tienes permiso para registrar abonos en esta sucursal.' using errcode = '42501';
  end if;
  v_fingerprint := md5(jsonb_build_object('sale',p_sale_id,'method',v_method,'amount',round(p_amount,2),
    'reference',coalesce(p_reference,''),'note',coalesce(p_note,''))::text);
  select id,idempotency_fingerprint into v_payment_id,v_existing_fingerprint
    from public.sale_payments where organization_id=v_org and idempotency_key=trim(p_idempotency_key);
  if v_payment_id is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'La clave del abono ya se usó con datos diferentes.' using errcode = '22023'; end if;
    select * into v_balance from app_private.visualcorp_sale_balance(v_org,p_sale_id);
    return jsonb_build_object('payment_id',v_payment_id,'paid',v_balance.paid,'balance',v_balance.balance,
      'adjusted_total',v_balance.adjusted_total,'returned_value',v_balance.returned_value,'replayed',true);
  end if;
  if v_status <> 'confirmed' then raise exception 'Solo se pueden abonar ventas confirmadas.' using errcode = '22023'; end if;
  select * into v_balance from app_private.visualcorp_sale_balance(v_org,p_sale_id);
  if round(p_amount,2)>v_balance.balance then raise exception 'El abono supera el saldo pendiente.' using errcode = '22023'; end if;

  insert into public.sale_payments(organization_id,sale_id,method,amount,reference,note,created_by,idempotency_key,idempotency_fingerprint)
    values(v_org,p_sale_id,v_method,round(p_amount,2),coalesce(p_reference,''),coalesce(p_note,''),v_user,trim(p_idempotency_key),v_fingerprint)
    returning id into v_payment_id;
  select * into v_balance from app_private.visualcorp_sale_balance(v_org,p_sale_id);
  update public.sales s set payment_method=case
    when (select count(distinct sp.method) from public.sale_payments sp where sp.organization_id=v_org and sp.sale_id=p_sale_id)=1
      then (select min(sp.method) from public.sale_payments sp where sp.organization_id=v_org and sp.sale_id=p_sale_id)
    else 'other' end
    where s.id=p_sale_id;
  return jsonb_build_object('payment_id',v_payment_id,'paid',v_balance.paid,'balance',v_balance.balance,
    'adjusted_total',v_balance.adjusted_total,'returned_value',v_balance.returned_value,'replayed',false);
end;
$$;
revoke all on function public.record_sale_payment(text,uuid,text,numeric,text,text) from public,anon;
grant execute on function public.record_sale_payment(text,uuid,text,numeric,text,text) to authenticated;

-- Server-side search returns only authorized records from the selected branch.
-- Recovery IDs bypass the date and search filters, never organization/branch scope.
create or replace function public.search_visualcorp_pos_sales(
  p_organization_id uuid,
  p_branch_id uuid,
  p_query text default '',
  p_balance_filter text default 'all',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 40,
  p_offset integer default 0,
  p_include_sale_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_query text := left(trim(coalesce(p_query,'')),120);
  v_limit integer := least(100,greatest(1,coalesce(p_limit,40)));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_result jsonb;
begin
  if v_user is null then raise exception 'Inicia sesión para consultar las ventas.' using errcode = '42501'; end if;
  if coalesce(p_balance_filter,'all') not in ('all','balance','paid') then raise exception 'Filtro de saldo no válido.' using errcode = '22023'; end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.organization_id=p_organization_id and b.active)
    or not app_private.has_visualcorp_access(p_organization_id,'sales','view',p_branch_id) then
    raise exception 'No tienes permiso para consultar ventas en esta sucursal.' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_include_sale_ids),0)>100 then raise exception 'Hay demasiadas ventas pendientes de recuperación.' using errcode = '22023'; end if;

  with matched as (
    select s.id,s.sale_code,s.customer_id,s.status,s.urgent_backorder,s.total,s.note,s.payment_method,s.created_at,
      c.full_name as customer_name,
      b.adjusted_total,b.returned_value,b.paid,b.settled_refund,b.balance,b.customer_credit,
      (select coalesce(jsonb_agg(jsonb_build_object('description',left(sl.description_snapshot,240),'quantity',sl.quantity)
        order by sl.id),'[]'::jsonb) from public.sale_lines sl where sl.sale_id=s.id and sl.organization_id=s.organization_id) as sale_lines,
      (select coalesce(jsonb_agg(jsonb_build_object('method',sp.method,'amount',sp.amount)
        order by sp.created_at,sp.id),'[]'::jsonb) from public.sale_payments sp where sp.sale_id=s.id and sp.organization_id=s.organization_id) as sale_payments
    from public.sales s
    left join public.customers c on c.id=s.customer_id and c.organization_id=s.organization_id
    cross join lateral app_private.visualcorp_sale_balance(s.organization_id,s.id) b
    where s.organization_id=p_organization_id and s.branch_id=p_branch_id and s.status='confirmed'
      and ((p_from is null or s.created_at>=p_from) and (p_to is null or s.created_at<p_to)
        or s.id=any(coalesce(p_include_sale_ids,'{}'::uuid[])))
      and (v_query='' or s.sale_code ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
        or coalesce(c.name,'') ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
        or coalesce(s.note,'') ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
        or exists(select 1 from public.sale_lines sl where sl.sale_id=s.id and sl.organization_id=s.organization_id
          and sl.description_snapshot ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%' escape '\')
        or s.id=any(coalesce(p_include_sale_ids,'{}'::uuid[])))
  ), filtered as (
    select * from matched
    where coalesce(p_balance_filter,'all')='all' or (p_balance_filter='balance' and balance>0) or (p_balance_filter='paid' and balance<=0)
      or id=any(coalesce(p_include_sale_ids,'{}'::uuid[]))
  ), paged as (
    select filtered.*,row_number() over(order by created_at desc,id desc) as row_number
    from filtered order by created_at desc,id desc limit v_limit+1 offset v_offset
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'code',coalesce(sale_code,left(id::text,8)),'customer_id',customer_id,'customer',coalesce(customer_name,''),
      'total',total,'adjusted_total',adjusted_total,'returned_value',returned_value,'paid',collected,
      'settled_refund',settled_refund,'balance',balance,'customer_credit',customer_credit,
      'date',created_at,'method',case when (select count(distinct payment.value->>'method') from jsonb_array_elements(sale_payments) as payment(value))>1 then 'Pago dividido'
        else coalesce((select case payment.value->>'method' when 'cash' then 'Efectivo' when 'transfer' then 'Transferencia' when 'card' then 'Tarjeta' else 'Otro' end from jsonb_array_elements(sale_payments) as payment(value) limit 1),
          case payment_method when 'cash' then 'Efectivo' when 'transfer' then 'Transferencia' when 'card' then 'Tarjeta' else 'Otro' end) end,
      'description',coalesce((select string_agg(line.value->>'description',', ') from jsonb_array_elements(sale_lines) as line(value)),''),
      'quantity',coalesce((select sum((line.value->>'quantity')::numeric) from jsonb_array_elements(sale_lines) as line(value)),0),
      'urgent',urgent_backorder,'status',status,'note',note
    ) order by created_at desc,id desc) from paged where row_number<=v_limit),'[]'::jsonb),
    'has_more',(select count(*)>v_limit from paged),
    'total_count',(select count(*) from filtered),
    'total_amount',(select coalesce(sum(adjusted_total),0) from filtered),
    'total_balance',(select coalesce(sum(balance),0) from filtered),
    'common_method',(select method from (
      select f.id,case when count(distinct sp.method)>1 then 'Pago dividido'
        else coalesce(min(case sp.method when 'cash' then 'Efectivo' when 'transfer' then 'Transferencia' when 'card' then 'Tarjeta' else 'Otro' end),
          case f.payment_method when 'cash' then 'Efectivo' when 'transfer' then 'Transferencia' when 'card' then 'Tarjeta' else 'Otro' end) end as method
      from filtered f left join public.sale_payments sp on sp.sale_id=f.id and sp.organization_id=p_organization_id
      group by f.id,f.payment_method
    ) methods group by method order by count(*) desc,method limit 1)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.search_visualcorp_pos_sales(uuid,uuid,text,text,timestamptz,timestamptz,integer,integer,uuid[]) from public,anon;
grant execute on function public.search_visualcorp_pos_sales(uuid,uuid,text,text,timestamptz,timestamptz,integer,integer,uuid[]) to authenticated;

create or replace function public.update_parked_pos_order(
  p_parked_order uuid, p_payload jsonb, p_total numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.parked_pos_orders%rowtype;
begin
  if v_user is null then raise exception 'Inicia sesión para actualizar la orden en espera.' using errcode = '42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>50000 then
    raise exception 'Los datos de la orden en espera no son válidos.' using errcode = '22023';
  end if;
  if p_total is null or p_total<=0 or p_total>10000000 then raise exception 'El total de la orden debe ser mayor que cero.' using errcode = '22023'; end if;
  select * into v_order from public.parked_pos_orders where id=p_parked_order for update;
  if not found or v_order.status<>'parked' then raise exception 'La orden en espera ya no existe o fue convertida.' using errcode = '22023'; end if;
  if not exists(select 1 from public.branches b where b.id=v_order.branch_id and b.organization_id=v_order.organization_id and b.active)
    or not app_private.has_org_role(v_order.organization_id,v_order.branch_id,array['owner','admin','manager','advisor']) then
    raise exception 'No tienes acceso a la sucursal de esta orden.' using errcode = '42501';
  end if;
  if v_order.created_by<>v_user and not app_private.has_visualcorp_access(v_order.organization_id,'sales','edit',v_order.branch_id) then
    raise exception 'Solo quien guardó la orden o un responsable autorizado de la sucursal puede actualizarla.' using errcode = '42501';
  end if;
  update public.parked_pos_orders set payload=p_payload,total=round(p_total,2),updated_at=now()
   where id=v_order.id returning * into v_order;
  return jsonb_build_object('id',v_order.id,'updated_at',v_order.updated_at,'total',v_order.total);
end;
$$;
revoke all on function public.update_parked_pos_order(uuid,jsonb,numeric) from public,anon;
grant execute on function public.update_parked_pos_order(uuid,jsonb,numeric) to authenticated;

-- The customer lifetime summary uses the same return valuation as Finance and POS.
create or replace function public.get_visualcorp_pos_customer_summary(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_purchase_count bigint;
  v_net_spent numeric(14,2);
  v_net_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_balance numeric(14,2);
  v_last_purchase timestamptz;
  v_recent jsonb;
  v_favorites jsonb;
begin
  if v_user is null or p_customer_id is null then raise exception 'Inicia sesión y selecciona un cliente.' using errcode = '42501'; end if;
  select om.organization_id into v_org from public.organization_memberships om
  where om.user_id=v_user and om.active order by om.created_at limit 1;
  if v_org is null or not exists(select 1 from public.customers c where c.id=p_customer_id and c.organization_id=v_org)
    or not app_private.has_visualcorp_access(v_org,'sales','view',null) then
    raise exception 'No tienes permiso para consultar el historial de este cliente.' using errcode = '42501';
  end if;

  with visible_sales as (
    select s.id,s.branch_id,s.sale_code,s.total,s.created_at,s.note,
      b.adjusted_total,b.paid,b.settled_refund,b.balance,b.customer_credit,
      b.settled_refund as refunded
    from public.sales s
    cross join lateral app_private.visualcorp_sale_balance(s.organization_id,s.id) b
    where s.organization_id=v_org and s.customer_id=p_customer_id and s.status='confirmed'
      and app_private.has_visualcorp_access(v_org,'sales','view',s.branch_id)
  )
  select count(*),coalesce(sum(adjusted_total),0),coalesce(sum(greatest(paid-settled_refund,0)),0),
    coalesce(sum(refunded),0),coalesce(sum(balance),0),max(created_at)
  into v_purchase_count,v_net_spent,v_net_paid,v_refunded,v_balance,v_last_purchase
  from visible_sales;

  select coalesce(jsonb_agg(jsonb_build_object('id',recent.id,'code',recent.sale_code,
    'total',recent.adjusted_total,'date',recent.created_at,'description',recent.description)
    order by recent.created_at desc),'[]'::jsonb)
  into v_recent
  from (
    select s.id,s.sale_code,s.created_at,b.adjusted_total,
      coalesce((select string_agg(left(l.description_snapshot,120)||' × '||l.quantity::text,' · ' order by l.id)
        from public.sale_lines l where l.organization_id=v_org and l.sale_id=s.id),nullif(s.note,''),'Compra registrada') as description
    from public.sales s
    cross join lateral app_private.visualcorp_sale_balance(s.organization_id,s.id) b
    where s.organization_id=v_org and s.customer_id=p_customer_id and s.status='confirmed'
      and app_private.has_visualcorp_access(v_org,'sales','view',s.branch_id)
    order by s.created_at desc limit 4
  ) recent;

  select coalesce(jsonb_agg(jsonb_build_object('name',products.name,'quantity',products.quantity)
    order by products.quantity desc,products.name),'[]'::jsonb)
  into v_favorites
  from (
    select coalesce(nullif(l.catalog_product_id,''),l.description_snapshot) as product_key,
      max(l.description_snapshot) as name,sum(greatest(l.quantity-l.returned_quantity,0)) as quantity
    from public.sale_lines l join public.sales s on s.id=l.sale_id and s.organization_id=l.organization_id
    where l.organization_id=v_org and s.customer_id=p_customer_id and s.status='confirmed'
      and app_private.has_visualcorp_access(v_org,'sales','view',s.branch_id)
    group by coalesce(nullif(l.catalog_product_id,''),l.description_snapshot)
    having sum(greatest(l.quantity-l.returned_quantity,0))>0
    order by quantity desc,name limit 3
  ) products;

  return jsonb_build_object('purchase_count',v_purchase_count,'net_spent',round(v_net_spent,2),
    'net_paid',round(v_net_paid,2),'refunded',round(v_refunded,2),'balance_due',round(v_balance,2),
    'last_purchase_at',v_last_purchase,'top_products',v_favorites,'recent_purchases',v_recent);
end;
$$;
revoke all on function public.get_visualcorp_pos_customer_summary(uuid) from public,anon;
grant execute on function public.get_visualcorp_pos_customer_summary(uuid) to authenticated;
