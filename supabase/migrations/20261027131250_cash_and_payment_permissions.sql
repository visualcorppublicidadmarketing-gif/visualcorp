-- Align POS payments and cash operations with configured permissions, including RLS policies.
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
  if not app_private.has_visualcorp_access(v_org,'sales','edit',v_branch) then
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

create or replace function public.close_cash_session(p_session uuid,p_counted_cash numeric,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_s public.cash_sessions%rowtype; v_expected numeric(14,2); v_user uuid:=auth.uid(); v_org uuid;
begin
 if v_user is null or p_counted_cash is null or p_counted_cash<0 then raise exception 'Revisa sesión y efectivo contado.'; end if;
 select * into v_s from public.cash_sessions where id=p_session for update;
 if not found or v_s.status<>'open' then raise exception 'La caja ya está cerrada o no existe.'; end if;
 if v_s.opened_by<>v_user and not app_private.has_visualcorp_access(v_s.organization_id,'cash','manage_cash',v_s.branch_id) then raise exception 'No tienes permiso para cerrar esta caja.'; end if;
 select v_s.opening_cash + coalesce((select sum(case when direction='in' then amount else -amount end) from public.cash_session_movements where session_id=v_s.id),0)
   + coalesce((select sum(amount) from public.sale_payments where cash_session_id=v_s.id and method='cash'),0) into v_expected;
 update public.cash_sessions set status='closed',closed_by=v_user,closed_at=now(),counted_cash=round(p_counted_cash,2),expected_cash=round(v_expected,2),difference=round(p_counted_cash-v_expected,2),closing_note=left(coalesce(p_note,''),1000) where id=v_s.id;
 return jsonb_build_object('session_id',v_s.id,'expected_cash',round(v_expected,2),'counted_cash',round(p_counted_cash,2),'difference',round(p_counted_cash-v_expected,2));
end $$;

create or replace function public.record_cash_session_movement(p_session uuid,p_direction text,p_amount numeric,p_reason text,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_s public.cash_sessions%rowtype; v_id uuid; v_user uuid:=auth.uid();
begin
 if v_user is null or p_direction not in ('in','out') or p_amount is null or p_amount<=0 or length(trim(coalesce(p_reason,'')))<3 or length(trim(coalesce(p_key,'')))<12 then raise exception 'Revisa tipo, monto, motivo y clave.'; end if;
 select * into v_s from public.cash_sessions where id=p_session for update;
 if not found or v_s.status<>'open' or v_s.opened_by<>v_user then raise exception 'Solo quien abrió una caja activa puede registrar el movimiento.'; end if;
 if not app_private.has_visualcorp_access(v_s.organization_id,'cash','manage_cash',v_s.branch_id) then raise exception 'Los movimientos manuales de caja requieren autorización administrativa.'; end if;
 insert into public.cash_session_movements(organization_id,session_id,direction,amount,reason,idempotency_key,created_by)
 values(v_s.organization_id,v_s.id,p_direction,round(p_amount,2),left(trim(p_reason),500),trim(p_key),v_user)
 on conflict(organization_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
 return v_id;
end $$;
revoke all on function public.record_sale_payment(text,uuid,text,numeric,text,text) from public,anon;
grant execute on function public.record_sale_payment(text,uuid,text,numeric,text,text) to authenticated;
revoke all on function public.close_cash_session(uuid,numeric,text) from public,anon;
grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;
revoke all on function public.record_cash_session_movement(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.record_cash_session_movement(uuid,text,numeric,text,text) to authenticated;

alter table public.cash_sessions enable row level security;
alter table public.cash_session_movements enable row level security;
drop policy if exists cash_sessions_staff_read on public.cash_sessions;
drop policy if exists cash_sessions_staff_add on public.cash_sessions;
drop policy if exists vc_access_select on public.cash_sessions;
drop policy if exists vc_access_insert on public.cash_sessions;
drop policy if exists vc_access_update on public.cash_sessions;
drop policy if exists vc_access_delete on public.cash_sessions;
drop policy if exists vc_access_member on public.cash_sessions;
drop policy if exists cash_movement_staff_read on public.cash_session_movements;
drop policy if exists vc_access_select on public.cash_session_movements;
drop policy if exists vc_access_insert on public.cash_session_movements;
drop policy if exists vc_access_update on public.cash_session_movements;
drop policy if exists vc_access_delete on public.cash_session_movements;
drop policy if exists vc_access_member on public.cash_session_movements;

create policy cash_sessions_access_select on public.cash_sessions
for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'cash','view',branch_id));
create policy cash_sessions_access_insert on public.cash_sessions
for insert to authenticated
with check (opened_by=(select auth.uid()) and status='open'
  and app_private.has_visualcorp_access(organization_id,'cash','manage_cash',branch_id));
create policy cash_movements_access_select on public.cash_session_movements
for select to authenticated
using (exists (
  select 1 from public.cash_sessions s
  where s.id=cash_session_movements.session_id
    and s.organization_id=cash_session_movements.organization_id
    and app_private.has_visualcorp_access(s.organization_id,'cash','view',s.branch_id)
));

revoke update,delete on public.cash_sessions from authenticated;
grant select,insert on public.cash_sessions to authenticated;
revoke insert,update,delete on public.cash_session_movements from authenticated;
grant select on public.cash_session_movements to authenticated;