-- Connected operating lifecycle: cash sessions, returns, transfers, production, and central quotes.
-- All quantities and dispositions are recorded explicitly; this migration does not create stock.

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  branch_id uuid not null, status text not null default 'open' check(status in ('open','closed')),
  opening_cash numeric(14,2) not null default 0 check(opening_cash>=0), opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now(), closed_by uuid references auth.users(id), closed_at timestamptz,
  counted_cash numeric(14,2), expected_cash numeric(14,2), difference numeric(14,2), closing_note text not null default '',
  foreign key(branch_id,organization_id) references public.branches(id,organization_id),
  check((status='open' and closed_at is null and closed_by is null and counted_cash is null) or
        (status='closed' and closed_at is not null and closed_by is not null and counted_cash is not null and expected_cash is not null and difference is not null)),
  unique(id,organization_id)
);
create unique index cash_sessions_one_open_user_branch on public.cash_sessions(organization_id,branch_id,opened_by) where status='open';
create table public.cash_session_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  session_id uuid not null, direction text not null check(direction in ('in','out')),
  amount numeric(14,2) not null check(amount>0), reason text not null check(length(trim(reason))>0),
  idempotency_key text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(session_id,organization_id) references public.cash_sessions(id,organization_id),
  unique(organization_id,idempotency_key)
);
alter table public.sale_payments add column cash_session_id uuid references public.cash_sessions(id) on delete set null;
create or replace function app_private.attach_open_cash_session() returns trigger language plpgsql security definer set search_path='' as $$
declare v_branch uuid;
begin
  if new.method<>'cash' then return new; end if;
  select branch_id into v_branch from public.sales where id=new.sale_id and organization_id=new.organization_id;
  select id into new.cash_session_id from public.cash_sessions where organization_id=new.organization_id and branch_id=v_branch and opened_by=new.created_by and status='open' order by opened_at desc limit 1;
  return new;
end $$;
create trigger attach_open_cash_session before insert on public.sale_payments for each row execute function app_private.attach_open_cash_session();
alter table public.cash_sessions enable row level security;
alter table public.cash_session_movements enable row level security;
create policy cash_sessions_staff_read on public.cash_sessions for select to authenticated using(app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','advisor']));
create policy cash_sessions_staff_add on public.cash_sessions for insert to authenticated with check(opened_by=(select auth.uid()) and status='open' and app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','advisor']));
create policy cash_movement_staff_read on public.cash_session_movements for select to authenticated using(app_private.has_org_role(organization_id));
grant select,insert on public.cash_sessions to authenticated;
grant select on public.cash_session_movements to authenticated;

create or replace function public.close_cash_session(p_session uuid,p_counted_cash numeric,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_s public.cash_sessions%rowtype; v_expected numeric(14,2); v_user uuid:=auth.uid(); v_org uuid;
begin
 if v_user is null or p_counted_cash is null or p_counted_cash<0 then raise exception 'Revisa sesión y efectivo contado.'; end if;
 select * into v_s from public.cash_sessions where id=p_session for update;
 if not found or v_s.status<>'open' then raise exception 'La caja ya está cerrada o no existe.'; end if;
 if not app_private.has_org_role(v_s.organization_id,v_s.branch_id,array['owner','admin','manager']) and v_s.opened_by<>v_user then raise exception 'No tienes permiso para cerrar esta caja.'; end if;
 select v_s.opening_cash + coalesce((select sum(case when direction='in' then amount else -amount end) from public.cash_session_movements where session_id=v_s.id),0)
   + coalesce((select sum(amount) from public.sale_payments where cash_session_id=v_s.id and method='cash'),0) into v_expected;
 update public.cash_sessions set status='closed',closed_by=v_user,closed_at=now(),counted_cash=round(p_counted_cash,2),expected_cash=round(v_expected,2),difference=round(p_counted_cash-v_expected,2),closing_note=left(coalesce(p_note,''),1000) where id=v_s.id;
 return jsonb_build_object('session_id',v_s.id,'expected_cash',round(v_expected,2),'counted_cash',round(p_counted_cash,2),'difference',round(p_counted_cash-v_expected,2));
end $$;
revoke all on function public.close_cash_session(uuid,numeric,text) from public,anon; grant execute on function public.close_cash_session(uuid,numeric,text) to authenticated;

create or replace function public.record_cash_session_movement(p_session uuid,p_direction text,p_amount numeric,p_reason text,p_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_s public.cash_sessions%rowtype; v_id uuid; v_user uuid:=auth.uid();
begin
 if v_user is null or p_direction not in ('in','out') or p_amount is null or p_amount<=0 or length(trim(coalesce(p_reason,'')))<3 or length(trim(coalesce(p_key,'')))<12 then raise exception 'Revisa tipo, monto, motivo y clave.'; end if;
 select * into v_s from public.cash_sessions where id=p_session for update;
 if not found or v_s.status<>'open' or v_s.opened_by<>v_user then raise exception 'Solo quien abrió una caja activa puede registrar el movimiento.'; end if;
 if not app_private.has_org_role(v_s.organization_id,v_s.branch_id,array['owner','admin','manager']) then raise exception 'Los movimientos manuales de caja requieren autorización administrativa.'; end if;
 insert into public.cash_session_movements(organization_id,session_id,direction,amount,reason,idempotency_key,created_by)
 values(v_s.organization_id,v_s.id,p_direction,round(p_amount,2),left(trim(p_reason),500),trim(p_key),v_user)
 on conflict(organization_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
 return v_id;
end $$;
revoke all on function public.record_cash_session_movement(uuid,text,numeric,text,text) from public,anon; grant execute on function public.record_cash_session_movement(uuid,text,numeric,text,text) to authenticated;

alter table public.sale_lines add constraint sale_lines_id_org_uq unique(id,organization_id);
alter table public.sale_lines add column returned_quantity numeric(14,3) not null default 0 check(returned_quantity>=0 and returned_quantity<=fulfilled_quantity);
create table public.sale_returns (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),sale_id uuid not null,
 return_code text not null,kind text not null check(kind in ('return','cancellation')),refund_amount numeric(14,2) not null default 0 check(refund_amount>=0),
 refund_method text not null default 'other' check(refund_method in ('cash','transfer','card','other')),
 refund_status text not null default 'pending' check(refund_status in ('pending','refunded','not_refunded')),
 note text not null default '',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,return_code),unique(id,organization_id),foreign key(sale_id,organization_id) references public.sales(id,organization_id)
);
create table public.sale_return_lines (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),return_id uuid not null,
 sale_line_id uuid not null,quantity numeric(14,3) not null check(quantity>0),disposition text not null check(disposition in ('restock','inspection','scrap')),
 created_at timestamptz not null default now(),foreign key(return_id,organization_id) references public.sale_returns(id,organization_id),
 foreign key(sale_line_id,organization_id) references public.sale_lines(id,organization_id)
);
alter table public.sale_returns enable row level security; alter table public.sale_return_lines enable row level security;
create policy sale_returns_read on public.sale_returns for select to authenticated using(app_private.has_org_role(organization_id));
create policy sale_return_lines_read on public.sale_return_lines for select to authenticated using(app_private.has_org_role(organization_id));
grant select on public.sale_returns,public.sale_return_lines to authenticated;
create or replace function public.process_sale_return(p_sale uuid,p_lines jsonb,p_kind text,p_refund numeric,p_refund_method text,p_refund_status text,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_org uuid; v_branch uuid; v_return uuid; v_code text; v_line jsonb; v_sl public.sale_lines%rowtype; v_qty numeric(14,3); v_disp text; v_returned numeric; v_total numeric:=0;
begin
 if v_user is null or p_kind not in ('return','cancellation') or p_refund is null or p_refund<0 or jsonb_typeof(p_lines)<>'array' or (p_kind='return' and jsonb_array_length(p_lines)=0) then raise exception 'Datos de devolución inválidos.'; end if;
 select organization_id,branch_id into v_org,v_branch from public.sales where id=p_sale and status='confirmed' for update;
 if v_org is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager']) then raise exception 'Venta no encontrada o acción no autorizada.'; end if;
 v_code:='DEV-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.sale_returns(organization_id,sale_id,return_code,kind,refund_amount,refund_method,refund_status,note,created_by)
 values(v_org,p_sale,v_code,p_kind,round(p_refund,2),p_refund_method,p_refund_status,left(coalesce(p_note,''),1000),v_user) returning id into v_return;
 if p_kind='cancellation' then
  for v_sl in select * from public.sale_lines where sale_id=p_sale and organization_id=v_org order by id for update loop
   v_qty:=v_sl.fulfilled_quantity-v_sl.returned_quantity;
   if v_qty>0 then
    insert into public.sale_return_lines(organization_id,return_id,sale_line_id,quantity,disposition) values(v_org,v_return,v_sl.id,v_qty,'restock');
    update public.sale_lines set returned_quantity=fulfilled_quantity where id=v_sl.id;
    if v_sl.variant_id is not null then
     insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values(v_org,v_sl.variant_id,v_branch,'MAIN','return',v_qty,'Cancelación '||v_code,'sale_return',v_return,v_user);
    end if;
    v_total:=v_total+v_qty*v_sl.unit_price;
   end if;
  end loop;
 end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  if p_kind='cancellation' then raise exception 'La cancelación ya calcula y devuelve automáticamente las unidades atendidas.'; end if;
  select * into v_sl from public.sale_lines where id=(v_line->>'sale_line_id')::uuid and sale_id=p_sale and organization_id=v_org for update;
  if not found then raise exception 'Una línea no corresponde a esta venta.'; end if;
  v_qty:=(v_line->>'quantity')::numeric; v_disp:=v_line->>'disposition';
  select coalesce(sum(quantity),0) into v_returned from public.sale_return_lines where sale_line_id=v_sl.id;
  if v_qty<=0 or v_qty>v_sl.fulfilled_quantity-v_returned or v_disp not in ('restock','inspection','scrap') then raise exception 'Cantidad o destino inválido para %.',v_sl.description_snapshot; end if;
  insert into public.sale_return_lines(organization_id,return_id,sale_line_id,quantity,disposition) values(v_org,v_return,v_sl.id,v_qty,v_disp);
  update public.sale_lines set returned_quantity=returned_quantity+v_qty where id=v_sl.id;
  if v_disp='restock' and v_sl.variant_id is not null then
   insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
   select v_org,v_sl.variant_id,v_branch,'MAIN','return',v_qty,'Devolución vendible '||v_code,'sale_return',v_return,v_user;
  end if;
  v_total:=v_total+v_qty*v_sl.unit_price;
 end loop;
 if p_refund>v_total then raise exception 'El reembolso supera el valor de los artículos registrados.'; end if;
 if p_kind='cancellation' then update public.sales set status='cancelled',updated_at=now() where id=p_sale; end if;
 return jsonb_build_object('return_id',v_return,'return_code',v_code,'items_value',round(v_total,2));
end $$;
revoke all on function public.process_sale_return(uuid,jsonb,text,numeric,text,text,text) from public,anon; grant execute on function public.process_sale_return(uuid,jsonb,text,numeric,text,text,text) to authenticated;

alter table public.stock_transfers drop constraint stock_transfers_status_check;
alter table public.stock_transfers add constraint stock_transfers_status_check check(status in ('requested','approved','dispatched','partially_received','received','rejected','cancelled'));
alter table public.stock_transfer_lines add column from_location_code text not null default 'MAIN';
alter table public.stock_transfer_lines add column to_location_code text not null default 'MAIN';
create table public.stock_transfer_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),transfer_id uuid not null,
 event_type text not null check(event_type in ('approved','dispatched','received','rejected','cancelled')),
 details jsonb not null default '{}'::jsonb,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(transfer_id,organization_id) references public.stock_transfers(id,organization_id)
);
alter table public.stock_transfer_events enable row level security;
create policy transfer_events_read on public.stock_transfer_events for select to authenticated using(app_private.has_org_role(organization_id)); grant select on public.stock_transfer_events to authenticated;
create or replace function public.dispatch_stock_transfer(p_transfer uuid,p_lines jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_t public.stock_transfers%rowtype; v_line jsonb; v_l public.stock_transfer_lines%rowtype; v_q numeric; v_avail numeric;
begin
 select * into v_t from public.stock_transfers where id=p_transfer for update;
 if not found or v_t.status not in ('approved','dispatched','partially_received') or not app_private.has_org_role(v_t.organization_id,v_t.from_branch_id,array['owner','admin','manager','warehouse']) then raise exception 'Transferencia no aprobada o sin permiso de despacho.'; end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  select * into v_l from public.stock_transfer_lines where id=(v_line->>'line_id')::uuid and transfer_id=p_transfer for update;
  v_q:=(v_line->>'quantity')::numeric;
  if not found or v_q<=0 or v_l.dispatched_quantity+v_q>v_l.requested_quantity then raise exception 'Cantidad de despacho inválida.'; end if;
  perform 1 from public.inventory_variants where id=v_l.variant_id for update;
  select coalesce(sum(quantity),0) into v_avail from public.inventory_stock where organization_id=v_t.organization_id and branch_id=v_t.from_branch_id and variant_id=v_l.variant_id and location_code=v_l.from_location_code;
  if v_avail<v_q then raise exception 'Stock insuficiente para despachar.'; end if;
  update public.stock_transfer_lines set dispatched_quantity=dispatched_quantity+v_q where id=v_l.id;
  insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
   values(v_t.organization_id,v_l.variant_id,v_t.from_branch_id,v_l.from_location_code,'transfer_out',-v_q,'Despacho '||v_t.transfer_code,'stock_transfer',p_transfer,auth.uid());
 end loop;
 update public.stock_transfers set status='dispatched',dispatched_by=auth.uid(),dispatched_at=coalesce(dispatched_at,now()) where id=p_transfer;
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by) values(v_t.organization_id,p_transfer,'dispatched',jsonb_build_object('lines',p_lines),auth.uid());
 return jsonb_build_object('transfer_id',p_transfer,'status','dispatched');
end $$;
create or replace function public.receive_stock_transfer(p_transfer uuid,p_lines jsonb,p_note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare v_t public.stock_transfers%rowtype; v_line jsonb; v_l public.stock_transfer_lines%rowtype; v_q numeric; v_done boolean;
begin
 select * into v_t from public.stock_transfers where id=p_transfer for update;
 if not found or v_t.status not in ('dispatched','partially_received') or not app_private.has_org_role(v_t.organization_id,v_t.to_branch_id,array['owner','admin','manager','warehouse']) then raise exception 'Transferencia no enviada o sin permiso de recepción.'; end if;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  select * into v_l from public.stock_transfer_lines where id=(v_line->>'line_id')::uuid and transfer_id=p_transfer for update;
  v_q:=(v_line->>'quantity')::numeric;
  if not found or v_q<=0 or v_l.received_quantity+v_q>v_l.dispatched_quantity then raise exception 'Cantidad recibida supera lo enviado.'; end if;
  update public.stock_transfer_lines set received_quantity=received_quantity+v_q where id=v_l.id;
  insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
   values(v_t.organization_id,v_l.variant_id,v_t.to_branch_id,v_l.to_location_code,'transfer_in',v_q,'Recepción '||v_t.transfer_code||' '||left(coalesce(p_note,''),200),'stock_transfer',p_transfer,auth.uid());
 end loop;
 select bool_and(received_quantity=dispatched_quantity) and bool_or(dispatched_quantity>0) into v_done from public.stock_transfer_lines where transfer_id=p_transfer;
 update public.stock_transfers set status=case when v_done then 'received' else 'partially_received' end,received_by=auth.uid(),received_at=case when v_done then now() else null end where id=p_transfer;
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by) values(v_t.organization_id,p_transfer,'received',jsonb_build_object('lines',p_lines,'note',left(coalesce(p_note,''),500),'complete',v_done),auth.uid());
 return jsonb_build_object('transfer_id',p_transfer,'status',case when v_done then 'received' else 'partially_received' end);
end $$;
revoke all on function public.dispatch_stock_transfer(uuid,jsonb) from public,anon; revoke all on function public.receive_stock_transfer(uuid,jsonb,text) from public,anon;
grant execute on function public.dispatch_stock_transfer(uuid,jsonb) to authenticated; grant execute on function public.receive_stock_transfer(uuid,jsonb,text) to authenticated;
create or replace function public.update_stock_transfer_status(p_transfer uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare v_t public.stock_transfers%rowtype;
begin
 select * into v_t from public.stock_transfers where id=p_transfer for update;
 if not found or p_status not in ('approved','rejected','cancelled') or not app_private.has_org_role(v_t.organization_id,v_t.from_branch_id,array['owner','admin','manager','warehouse']) then raise exception 'Transferencia o permiso inválido.'; end if;
 if v_t.status<>'requested' then raise exception 'Solo se pueden aprobar, rechazar o cancelar solicitudes pendientes.'; end if;
 update public.stock_transfers set status=p_status,approved_by=case when p_status='approved' then auth.uid() else approved_by end where id=p_transfer;
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by) values(v_t.organization_id,p_transfer,p_status,jsonb_build_object('note',left(coalesce(p_note,''),500)),auth.uid());
end $$;
revoke all on function public.update_stock_transfer_status(uuid,text,text) from public,anon; grant execute on function public.update_stock_transfer_status(uuid,text,text) to authenticated;

create table public.production_orders(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),branch_id uuid not null,
 order_code text not null,sale_id uuid,area_id uuid,title text not null,description text not null default '',
 status text not null default 'queued' check(status in ('queued','in_progress','blocked','quality_review','ready','completed','cancelled')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),due_at timestamptz,
 assigned_to uuid references auth.users(id),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,order_code),unique(id,organization_id),foreign key(branch_id,organization_id) references public.branches(id,organization_id),
 foreign key(sale_id,organization_id) references public.sales(id,organization_id),foreign key(area_id,organization_id) references public.areas(id,organization_id)
);
create table public.production_order_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),order_id uuid not null,
 from_status text,to_status text not null,note text not null default '',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(order_id,organization_id) references public.production_orders(id,organization_id)
);
create table public.production_material_targets(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),order_id uuid not null,
 variant_id uuid not null,estimated_quantity numeric(14,3) check(estimated_quantity is null or estimated_quantity>0),unit_snapshot text not null default '',note text not null default '',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(order_id,organization_id) references public.production_orders(id,organization_id),foreign key(variant_id,organization_id) references public.inventory_variants(id,organization_id)
);
alter table public.production_orders enable row level security; alter table public.production_order_events enable row level security; alter table public.production_material_targets enable row level security;
create policy production_orders_read on public.production_orders for select to authenticated using(app_private.has_org_role(organization_id,branch_id));
create policy production_orders_manage on public.production_orders for all to authenticated using(app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','production'])) with check(app_private.has_org_role(organization_id,branch_id,array['owner','admin','manager','production']));
create policy production_events_read on public.production_order_events for select to authenticated using(app_private.has_org_role(organization_id));
create policy production_targets_read on public.production_material_targets for select to authenticated using(app_private.has_org_role(organization_id));
create policy production_targets_manage on public.production_material_targets for insert to authenticated with check(created_by=(select auth.uid()) and app_private.has_org_role(organization_id,null,array['owner','admin','manager','production']));
grant select,insert,update on public.production_orders to authenticated; grant select on public.production_order_events,public.production_material_targets to authenticated; grant insert on public.production_material_targets to authenticated;
create or replace function public.update_production_status(p_order uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare v_o public.production_orders%rowtype;
begin
 if p_status not in ('queued','in_progress','blocked','quality_review','ready','completed','cancelled') then raise exception 'Estado no válido.'; end if;
 select * into v_o from public.production_orders where id=p_order for update;
 if not found or not app_private.has_org_role(v_o.organization_id,v_o.branch_id,array['owner','admin','manager','production']) then raise exception 'Orden no encontrada o acceso denegado.'; end if;
 if v_o.status in ('completed','cancelled') then raise exception 'Una orden finalizada no puede reabrirse desde esta acción.'; end if;
 insert into public.production_order_events(organization_id,order_id,from_status,to_status,note,created_by) values(v_o.organization_id,v_o.id,v_o.status,p_status,left(coalesce(p_note,''),1000),auth.uid());
 update public.production_orders set status=p_status,updated_at=now() where id=p_order;
end $$;
create or replace function public.consume_production_material(p_order uuid,p_variant uuid,p_quantity numeric,p_location text,p_note text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_o public.production_orders%rowtype; v_stock numeric; v_id uuid;
begin
 if auth.uid() is null or p_quantity is null or p_quantity<=0 then raise exception 'Cantidad de consumo inválida.'; end if;
 select * into v_o from public.production_orders where id=p_order for update;
 if not found or v_o.status in ('completed','cancelled') or not app_private.has_org_role(v_o.organization_id,v_o.branch_id,array['owner','admin','manager','production','warehouse']) then raise exception 'Orden cerrada o sin permiso de consumo.'; end if;
 perform 1 from public.inventory_variants where id=p_variant and organization_id=v_o.organization_id for update;
 select coalesce(sum(quantity),0) into v_stock from public.inventory_stock where organization_id=v_o.organization_id and branch_id=v_o.branch_id and variant_id=p_variant and location_code=coalesce(nullif(p_location,''),'MAIN');
 if v_stock<p_quantity then raise exception 'Stock insuficiente para registrar el consumo real.'; end if;
 insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
 values(v_o.organization_id,p_variant,v_o.branch_id,coalesce(nullif(p_location,''),'MAIN'),'consumption',-p_quantity,'Orden '||v_o.order_code||': '||left(coalesce(p_note,''),300),'production_order',v_o.id,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.update_production_status(uuid,text,text) from public,anon; grant execute on function public.update_production_status(uuid,text,text) to authenticated;
revoke all on function public.consume_production_material(uuid,uuid,numeric,text,text) from public,anon; grant execute on function public.consume_production_material(uuid,uuid,numeric,text,text) to authenticated;

create table public.central_quotes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),quote_code text not null,
 customer_id uuid,customer_name text not null default '',customer_phone text not null default '',items jsonb not null check(jsonb_typeof(items)='array' and octet_length(items::text)<=50000),
 total_normal numeric(14,2),total_installation numeric(14,2),total_corporate numeric(14,2),chosen_tier text not null default 'normal' check(chosen_tier in ('normal','installation','corporate')),
 selected_total numeric(14,2),price_confirmed boolean not null default false,status text not null default 'draft' check(status in ('draft','sent','accepted','rejected','expired','converted')),
 notes text not null default '',source text not null default 'internal',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,quote_code),unique(id,organization_id),foreign key(customer_id,organization_id) references public.customers(id,organization_id)
);
create table public.central_quote_events(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),quote_id uuid not null,from_status text,to_status text not null,note text not null default '',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),foreign key(quote_id,organization_id) references public.central_quotes(id,organization_id));
alter table public.central_quotes enable row level security; alter table public.central_quote_events enable row level security;
create policy central_quotes_staff_read on public.central_quotes for select to authenticated using(app_private.has_org_role(organization_id,null,array['owner','admin','manager','advisor','marketing']));
create policy central_quotes_staff_write on public.central_quotes for insert to authenticated with check(created_by=(select auth.uid()) and app_private.has_org_role(organization_id,null,array['owner','admin','manager','advisor','marketing']));
create policy central_quotes_admin_update on public.central_quotes for update to authenticated using(app_private.has_org_role(organization_id,null,array['owner','admin','manager'])) with check(app_private.has_org_role(organization_id,null,array['owner','admin','manager']));
create policy central_quote_events_read on public.central_quote_events for select to authenticated using(app_private.has_org_role(organization_id)); grant select,insert,update on public.central_quotes to authenticated; grant select on public.central_quote_events to authenticated;
create or replace function public.create_central_quote(p_customer_id uuid,p_customer_name text,p_customer_phone text,p_items jsonb,p_normal numeric,p_installation numeric,p_corporate numeric,p_chosen text,p_selected numeric,p_confirmed boolean,p_notes text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_code text; v_id uuid; v_user uuid:=auth.uid();
begin
 if v_user is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or octet_length(p_items::text)>50000 or p_chosen not in ('normal','installation','corporate') then raise exception 'Datos de cotización inválidos.'; end if;
 select id into v_org from public.organizations where slug='visual-corp';
 if not app_private.has_org_role(v_org,null,array['owner','admin','manager','advisor','marketing']) then raise exception 'No tienes permiso para cotizar.'; end if;
 if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=v_org) then raise exception 'Cliente no pertenece a Visual Corp.'; end if;
 if p_selected is not null and p_selected<0 then raise exception 'Total inválido.'; end if;
 v_code:='COT-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into public.central_quotes(organization_id,quote_code,customer_id,customer_name,customer_phone,items,total_normal,total_installation,total_corporate,chosen_tier,selected_total,price_confirmed,notes,created_by)
 values(v_org,v_code,p_customer_id,left(trim(coalesce(p_customer_name,'')),200),left(trim(coalesce(p_customer_phone,'')),60),p_items,p_normal,p_installation,p_corporate,p_chosen,p_selected,coalesce(p_confirmed,false),left(coalesce(p_notes,''),2000),v_user) returning id into v_id;
 insert into public.central_quote_events(organization_id,quote_id,to_status,created_by) values(v_org,v_id,'draft',v_user);
 return jsonb_build_object('id',v_id,'quote_code',v_code,'status','draft');
end $$;
revoke all on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text) from public,anon; grant execute on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text) to authenticated;
create or replace function public.update_central_quote_status(p_quote uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare v_q public.central_quotes%rowtype;
begin
 if p_status not in ('sent','accepted','rejected','expired','converted') then raise exception 'Estado de cotización inválido.'; end if;
 select * into v_q from public.central_quotes where id=p_quote for update;
 if not found or not app_private.has_org_role(v_q.organization_id,null,array['owner','admin','manager','advisor','marketing']) then raise exception 'Cotización no encontrada o sin permiso.'; end if;
 if v_q.status in ('rejected','expired','converted') then raise exception 'La cotización ya está cerrada.'; end if;
 insert into public.central_quote_events(organization_id,quote_id,from_status,to_status,note,created_by) values(v_q.organization_id,v_q.id,v_q.status,p_status,left(coalesce(p_note,''),1000),auth.uid());
 update public.central_quotes set status=p_status,updated_at=now() where id=p_quote;
end $$;
revoke all on function public.update_central_quote_status(uuid,text,text) from public,anon; grant execute on function public.update_central_quote_status(uuid,text,text) to authenticated;
