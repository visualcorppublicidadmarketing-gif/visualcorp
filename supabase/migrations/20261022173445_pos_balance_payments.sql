-- Allow later partial payments to be recorded once and against the remaining balance.
alter table public.sale_payments add column if not exists idempotency_key text;
alter table public.sale_payments add column if not exists idempotency_fingerprint text;
create unique index if not exists sale_payments_org_idempotency_key_uq
  on public.sale_payments(organization_id, idempotency_key) where idempotency_key is not null;

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
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_payment_id uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_method text := coalesce(p_method, 'other');
begin
  if v_user is null then raise exception 'Inicia sesión para registrar un abono.'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 12 and 160 then
    raise exception 'La clave del abono no es válida.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El valor del abono debe ser mayor que cero.'; end if;
  if v_method not in ('cash','transfer','card','other') then raise exception 'Método de pago no válido.'; end if;

  select s.organization_id,s.branch_id,s.total into v_org,v_branch,v_total
    from public.sales s where s.id=p_sale_id for update;
  if v_org is null then raise exception 'No encontramos la orden.'; end if;
  if not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager','advisor']) then
    raise exception 'No tienes permiso para registrar abonos en esta sucursal.';
  end if;
  v_fingerprint := md5(jsonb_build_object('sale',p_sale_id,'method',v_method,'amount',round(p_amount,2),
    'reference',coalesce(p_reference,''),'note',coalesce(p_note,''))::text);
  select id,idempotency_fingerprint into v_payment_id,v_existing_fingerprint
    from public.sale_payments where organization_id=v_org and idempotency_key=trim(p_idempotency_key);
  if v_payment_id is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'La clave del abono ya se usó con datos diferentes.'; end if;
    select coalesce(sum(amount),0) into v_paid from public.sale_payments where organization_id=v_org and sale_id=p_sale_id;
    return jsonb_build_object('payment_id',v_payment_id,'paid',v_paid,'balance',greatest(v_total-v_paid,0),'replayed',true);
  end if;
  select coalesce(sum(amount),0) into v_paid from public.sale_payments where organization_id=v_org and sale_id=p_sale_id;
  if round(p_amount,2)>greatest(v_total-v_paid,0) then raise exception 'El abono supera el saldo pendiente.'; end if;
  insert into public.sale_payments(organization_id,sale_id,method,amount,reference,note,created_by,idempotency_key,idempotency_fingerprint)
    values(v_org,p_sale_id,v_method,round(p_amount,2),coalesce(p_reference,''),coalesce(p_note,''),v_user,trim(p_idempotency_key),v_fingerprint)
    returning id into v_payment_id;
  v_paid := v_paid + round(p_amount,2);
  update public.sales s set payment_method=case
    when (select count(distinct sp.method) from public.sale_payments sp where sp.organization_id=v_org and sp.sale_id=p_sale_id)=1
      then (select min(sp.method) from public.sale_payments sp where sp.organization_id=v_org and sp.sale_id=p_sale_id)
    else 'other' end
    where s.id=p_sale_id;
  return jsonb_build_object('payment_id',v_payment_id,'paid',v_paid,'balance',greatest(v_total-v_paid,0),'replayed',false);
end;
$$;
revoke all on function public.record_sale_payment(text,uuid,text,numeric,text,text) from public,anon;
grant execute on function public.record_sale_payment(text,uuid,text,numeric,text,text) to authenticated;
