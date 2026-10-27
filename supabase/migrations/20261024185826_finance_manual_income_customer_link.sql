-- Allow manual advisor income to participate in the CRM customer history.
-- Keep the existing RPC name and use one unique signature (Supabase RPC does not support overloads).
drop function if exists public.record_advisor_finance_sale(text,uuid,uuid,text,numeric,numeric,text,text,text);

create function public.record_advisor_finance_sale(
  p_idempotency_key text,
  p_branch_id uuid,
  p_advisor_id uuid,
  p_description text,
  p_total numeric,
  p_amount_received numeric,
  p_method text,
  p_reference text default '',
  p_note text default '',
  p_customer_id uuid default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_org uuid;
  v_sale uuid;
  v_code text;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_total numeric(14,2):=round(coalesce(p_total,0),2);
  v_paid numeric(14,2):=round(coalesce(p_amount_received,0),2);
  v_method text:=coalesce(nullif(trim(p_method),''),'other');
begin
  if v_user is null then raise exception 'Inicia sesión para registrar el ingreso.'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) not between 12 and 160 then raise exception 'La clave de registro no es válida.'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','advisor']) then raise exception 'No tienes permiso para registrar ventas en esta sucursal.'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org and active) then raise exception 'La sucursal no está activa.'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=v_org and user_id=p_advisor_id and active and role in ('advisor','owner','admin','manager')) then raise exception 'Selecciona una asesora activa del equipo.'; end if;
  if p_advisor_id<>v_user and not app_private.has_visualcorp_access(v_org,'team','view',p_branch_id) then raise exception 'Solo administración puede registrar ingresos a nombre de otra asesora.'; end if;
  if p_customer_id is not null and not app_private.has_visualcorp_access(v_org,'crm','view',p_branch_id) then raise exception 'No tienes permiso para vincular ingresos con fichas del CRM.'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'Selecciona un cliente válido de Visual Corp.'; end if;
  if length(trim(coalesce(p_description,''))) not between 1 and 240 then raise exception 'Ingresa una descripción de hasta 240 caracteres.'; end if;
  if v_total<=0 or v_paid<0 or v_paid>v_total then raise exception 'El abono debe estar entre cero y el total de la venta.'; end if;
  if v_paid>0 and v_method not in ('cash','transfer','card','cheque','other') then raise exception 'Selecciona un medio de pago válido.'; end if;
  if v_paid>0 and v_method='cash' and not exists(select 1 from public.cash_sessions where organization_id=v_org and branch_id=p_branch_id and opened_by=v_user and status='open') then raise exception 'Abre tu turno de caja para registrar pagos en efectivo.'; end if;

  v_fingerprint:=md5(jsonb_build_object('branch',p_branch_id,'advisor',p_advisor_id,'customer',p_customer_id,'description',trim(p_description),'total',v_total,'paid',v_paid,'method',v_method,'reference',coalesce(trim(p_reference),''),'note',coalesce(trim(p_note),''))::text);
  perform pg_advisory_xact_lock(hashtextextended(v_org::text||':'||trim(p_idempotency_key),0));
  select id,sale_code,idempotency_fingerprint into v_sale,v_code,v_existing_fingerprint from public.sales where organization_id=v_org and idempotency_key=trim(p_idempotency_key);
  if v_sale is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'La clave ya se usó con datos diferentes.'; end if;
    return jsonb_build_object('sale_id',v_sale,'sale_code',v_code,'replayed',true);
  end if;

  v_code:='VC-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales(organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,created_by,advisor_id,sale_code,payment_method,idempotency_key,idempotency_fingerprint)
  values(v_org,p_branch_id,p_customer_id,'confirmed',false,v_total,0,v_total,left(coalesce(trim(p_note),''),1000),v_user,p_advisor_id,v_code,case when v_paid>0 then v_method else 'other' end,trim(p_idempotency_key),v_fingerprint)
  returning id into v_sale;
  insert into public.sale_lines(organization_id,sale_id,variant_id,catalog_product_id,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total)
  values(v_org,v_sale,null,null,'',trim(p_description),1,1,0,v_total,v_total);
  if v_paid>0 then
    insert into public.sale_payments(organization_id,sale_id,method,amount,reference,note,created_by)
    values(v_org,v_sale,v_method,v_paid,left(coalesce(trim(p_reference),''),200),left(coalesce(trim(p_note),''),500),v_user);
  end if;
  return jsonb_build_object('sale_id',v_sale,'sale_code',v_code,'total',v_total,'paid',v_paid,'balance',v_total-v_paid,'replayed',false);
end;
$$;
revoke all on function public.record_advisor_finance_sale(text,uuid,uuid,text,numeric,numeric,text,text,text,uuid) from public,anon;
grant execute on function public.record_advisor_finance_sale(text,uuid,uuid,text,numeric,numeric,text,text,text,uuid) to authenticated;
