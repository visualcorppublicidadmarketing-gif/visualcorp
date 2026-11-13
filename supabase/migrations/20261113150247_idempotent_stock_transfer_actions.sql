-- Persist the idempotency token in the immutable transfer event that records
-- each successful partial dispatch or receipt. Transfer-row locking serializes
-- simultaneous retries for the same transfer.
create or replace function public.dispatch_stock_transfer(
 p_transfer uuid,p_lines jsonb,p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_t public.stock_transfers%rowtype;
 v_line jsonb;
 v_l public.stock_transfer_lines%rowtype;
 v_q numeric;
 v_quantity numeric(14,3);
 v_reserved numeric(14,3);
 v_available numeric(14,3);
 v_canonical_lines jsonb;
 v_request_hash text;
 v_prior jsonb;
 v_result jsonb;
begin
 if auth.uid() is null or p_idempotency_key is null or p_lines is null
    or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
  raise exception 'Selecciona cantidades válidas para despachar.';
 end if;
 select coalesce(jsonb_agg(value order by (value->>'line_id')::uuid),'[]'::jsonb)
  into v_canonical_lines from jsonb_array_elements(p_lines);
 v_request_hash:=md5(v_canonical_lines::text);

 select * into v_t from public.stock_transfers where id=p_transfer for update;
 if not found or not app_private.has_visualcorp_access(v_t.organization_id,'inventory','edit',v_t.from_branch_id) then
  raise exception 'Transferencia no encontrada o sin permiso de despacho.';
 end if;

 select details into v_prior from public.stock_transfer_events
  where organization_id=v_t.organization_id and transfer_id=p_transfer and event_type='dispatched'
    and details->>'idempotency_key'=p_idempotency_key::text
  order by created_at desc limit 1;
 if found then
  if v_prior->>'request_hash' is distinct from v_request_hash then
   raise exception 'La clave de reintento ya se usó con otras cantidades.';
  end if;
  return v_prior->'result';
 end if;

 if v_t.status not in ('approved','dispatched','partially_received') then
  raise exception 'La transferencia no está aprobada para despacho.';
 end if;

 -- Sort line locks to keep concurrent multi-line dispatches in a stable order.
 for v_line in select value from jsonb_array_elements(p_lines) order by (value->>'line_id')::uuid loop
  select * into v_l from public.stock_transfer_lines
   where id=(v_line->>'line_id')::uuid and transfer_id=p_transfer for update;
  v_q:=(v_line->>'quantity')::numeric;
  if not found or v_q is null or v_q<=0 or v_l.dispatched_quantity+v_q>v_l.requested_quantity then
   raise exception 'Cantidad de despacho inválida.';
  end if;

  select quantity,coalesce(reserved_quantity,0) into v_quantity,v_reserved
   from public.inventory_stock
   where organization_id=v_t.organization_id and branch_id=v_t.from_branch_id
     and variant_id=v_l.variant_id and location_code=v_l.from_location_code for update;
  if not found then raise exception 'No hay existencia disponible en la ubicación %.',v_l.from_location_code; end if;
  v_available:=coalesce(v_quantity,0)-coalesce(v_reserved,0);
  if v_available<v_q then
   raise exception 'Existencia disponible insuficiente en %: disponibles %, solicitados %.',v_l.from_location_code,v_available,v_q;
  end if;

  update public.stock_transfer_lines set dispatched_quantity=dispatched_quantity+v_q where id=v_l.id;
  insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
   values(v_t.organization_id,v_l.variant_id,v_t.from_branch_id,v_l.from_location_code,'transfer_out',-v_q,'Despacho '||v_t.transfer_code,'stock_transfer',p_transfer,auth.uid());
 end loop;

 update public.stock_transfers set status='dispatched',dispatched_by=auth.uid(),dispatched_at=coalesce(dispatched_at,now()) where id=p_transfer;
 v_result:=jsonb_build_object('transfer_id',p_transfer,'status','dispatched');
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by)
  values(v_t.organization_id,p_transfer,'dispatched',jsonb_build_object(
   'lines',v_canonical_lines,'idempotency_key',p_idempotency_key,'request_hash',v_request_hash,'result',v_result
  ),auth.uid());
 return v_result;
end $$;

create or replace function public.receive_stock_transfer(
 p_transfer uuid,p_lines jsonb,p_idempotency_key uuid,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_t public.stock_transfers%rowtype;
 v_line jsonb;
 v_l public.stock_transfer_lines%rowtype;
 v_q numeric;
 v_done boolean;
 v_note text:=left(coalesce(p_note,''),500);
 v_canonical_lines jsonb;
 v_request_hash text;
 v_prior jsonb;
 v_result jsonb;
begin
 if auth.uid() is null or p_idempotency_key is null or p_lines is null
    or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
  raise exception 'Selecciona cantidades válidas para recibir.';
 end if;
 select coalesce(jsonb_agg(value order by (value->>'line_id')::uuid),'[]'::jsonb)
  into v_canonical_lines from jsonb_array_elements(p_lines);
 v_request_hash:=md5(v_canonical_lines::text||E'\n'||v_note);

 select * into v_t from public.stock_transfers where id=p_transfer for update;
 if not found or not app_private.has_visualcorp_access(v_t.organization_id,'inventory','edit',v_t.to_branch_id) then
  raise exception 'Transferencia no encontrada o sin permiso de recepción.';
 end if;

 select details into v_prior from public.stock_transfer_events
  where organization_id=v_t.organization_id and transfer_id=p_transfer and event_type='received'
    and details->>'idempotency_key'=p_idempotency_key::text
  order by created_at desc limit 1;
 if found then
  if v_prior->>'request_hash' is distinct from v_request_hash then
   raise exception 'La clave de reintento ya se usó con otras cantidades o nota.';
  end if;
  return v_prior->'result';
 end if;

 if v_t.status not in ('dispatched','partially_received') then
  raise exception 'La transferencia no está pendiente de recepción.';
 end if;

 for v_line in select value from jsonb_array_elements(p_lines) order by (value->>'line_id')::uuid loop
  select * into v_l from public.stock_transfer_lines
   where id=(v_line->>'line_id')::uuid and transfer_id=p_transfer for update;
  v_q:=(v_line->>'quantity')::numeric;
  if not found or v_q is null or v_q<=0 or v_l.received_quantity+v_q>v_l.dispatched_quantity then
   raise exception 'Cantidad recibida inválida o superior a lo despachado.';
  end if;
  update public.stock_transfer_lines set received_quantity=received_quantity+v_q where id=v_l.id;
  insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
   values(v_t.organization_id,v_l.variant_id,v_t.to_branch_id,v_l.to_location_code,'transfer_in',v_q,'Recepción '||v_t.transfer_code||' '||left(v_note,200),'stock_transfer',p_transfer,auth.uid());
 end loop;

 select bool_and(received_quantity=dispatched_quantity) and bool_or(dispatched_quantity>0)
  into v_done from public.stock_transfer_lines where transfer_id=p_transfer;
 update public.stock_transfers set status=case when v_done then 'received' else 'partially_received' end,
  received_by=auth.uid(),received_at=case when v_done then now() else null end where id=p_transfer;
 v_result:=jsonb_build_object('transfer_id',p_transfer,'status',case when v_done then 'received' else 'partially_received' end);
 insert into public.stock_transfer_events(organization_id,transfer_id,event_type,details,created_by)
  values(v_t.organization_id,p_transfer,'received',jsonb_build_object(
   'lines',v_canonical_lines,'note',v_note,'idempotency_key',p_idempotency_key,'request_hash',v_request_hash,'result',v_result,'complete',v_done
  ),auth.uid());
 return v_result;
end $$;

-- Old callers do not send idempotency keys, so fail closed after the app is updated.
revoke all on function public.dispatch_stock_transfer(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.receive_stock_transfer(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.dispatch_stock_transfer(uuid,jsonb,uuid) from public,anon;
revoke all on function public.receive_stock_transfer(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.dispatch_stock_transfer(uuid,jsonb,uuid) to authenticated;
grant execute on function public.receive_stock_transfer(uuid,jsonb,uuid,text) to authenticated;
