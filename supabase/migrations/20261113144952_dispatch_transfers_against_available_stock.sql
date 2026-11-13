-- Check the quantity that can actually be transferred, preserving reservations.
-- Locking the stock row here makes the validation consistent with the movement trigger.
create or replace function public.dispatch_stock_transfer(p_transfer uuid,p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 v_t public.stock_transfers%rowtype;
 v_line jsonb;
 v_l public.stock_transfer_lines%rowtype;
 v_q numeric;
 v_quantity numeric(14,3);
 v_reserved numeric(14,3);
 v_available numeric(14,3);
begin
 if auth.uid() is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
  raise exception 'Selecciona al menos una cantidad para despachar.';
 end if;

 select * into v_t from public.stock_transfers where id=p_transfer for update;
 if not found or v_t.status not in ('approved','dispatched','partially_received')
    or not app_private.has_org_role(v_t.organization_id,v_t.from_branch_id,array['owner','admin','manager','warehouse']) then
  raise exception 'Transferencia no aprobada o sin permiso de despacho.';
 end if;

 -- Sort line locks to keep concurrent multi-line dispatches in a stable order.
 for v_line in
  select value from jsonb_array_elements(p_lines) order by (value->>'line_id')::uuid
 loop
  select * into v_l
   from public.stock_transfer_lines
   where id=(v_line->>'line_id')::uuid and transfer_id=p_transfer
   for update;
  v_q:=(v_line->>'quantity')::numeric;
  if not found or v_q is null or v_q<=0 or v_l.dispatched_quantity+v_q>v_l.requested_quantity then
   raise exception 'Cantidad de despacho inválida.';
  end if;

  select quantity,coalesce(reserved_quantity,0)
   into v_quantity,v_reserved
   from public.inventory_stock
   where organization_id=v_t.organization_id and branch_id=v_t.from_branch_id
     and variant_id=v_l.variant_id and location_code=v_l.from_location_code
   for update;
  if not found then
   raise exception 'No hay existencia disponible en la ubicación %.',v_l.from_location_code;
  end if;
  v_available:=coalesce(v_quantity,0)-coalesce(v_reserved,0);
  if v_available<v_q then
   raise exception 'Existencia disponible insuficiente en %: disponibles %, solicitados %.',
    v_l.from_location_code,v_available,v_q;
  end if;

  update public.stock_transfer_lines set dispatched_quantity=dispatched_quantity+v_q where id=v_l.id;
  insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
   values(v_t.organization_id,v_l.variant_id,v_t.from_branch_id,v_l.from_location_code,'transfer_out',-v_q,'Despacho '||v_t.transfer_code,'stock_transfer',p_transfer,auth.uid());
 end loop;

 update public.stock_transfers set status='dispatched',dispatched_by=auth.uid(),dispatched_at=coalesce(dispatched_at,now()) where id=p_transfer;
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by)
  values(v_t.organization_id,p_transfer,'dispatched',jsonb_build_object('lines',p_lines),auth.uid());
 return jsonb_build_object('transfer_id',p_transfer,'status','dispatched');
end $$;

revoke all on function public.dispatch_stock_transfer(uuid,jsonb) from public,anon;
grant execute on function public.dispatch_stock_transfer(uuid,jsonb) to authenticated;
