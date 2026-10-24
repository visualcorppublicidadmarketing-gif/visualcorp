-- Keep quote conversion attached to a confirmed POS sale and prevent a
-- caller from marking a refund paid without the finance settlement RPC.
create or replace function public.update_central_quote_status(
  p_quote uuid, p_status text, p_note text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_q public.central_quotes%rowtype;
begin
  if p_status is null or p_status not in ('sent','accepted','rejected','expired') then
    raise exception 'Estado de cotización inválido. La conversión se registra desde una venta confirmada.' using errcode = '22023';
  end if;
  select * into v_q from public.central_quotes where id = p_quote for update;
  if not found or not app_private.has_org_role(v_q.organization_id, null, array['owner','admin','manager','advisor','marketing']) then
    raise exception 'Cotización no encontrada o sin permiso.' using errcode = '42501';
  end if;
  if v_q.status in ('rejected','expired','converted') then
    raise exception 'La cotización ya está cerrada.' using errcode = '22023';
  end if;
  insert into public.central_quote_events(organization_id,quote_id,from_status,to_status,note,created_by)
  values(v_q.organization_id,v_q.id,v_q.status,p_status,left(coalesce(p_note,''),1000),auth.uid());
  update public.central_quotes set status = p_status, updated_at = now() where id = p_quote;
end;
$$;
revoke all on function public.update_central_quote_status(uuid,text,text) from public, anon;
grant execute on function public.update_central_quote_status(uuid,text,text) to authenticated;

create or replace function public.process_sale_return(
  p_sale uuid, p_lines jsonb, p_kind text, p_refund numeric,
  p_refund_method text, p_refund_status text, p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_branch uuid;
  v_return uuid;
  v_code text;
  v_line jsonb;
  v_sl public.sale_lines%rowtype;
  v_qty numeric(14,3);
  v_disp text;
  v_returned numeric;
  v_total numeric := 0;
  v_refund_amount numeric(14,2) := round(coalesce(p_refund,0),2);
  v_refund_status text;
begin
  if v_user is null or p_kind is null or p_kind not in ('return','cancellation')
    or p_refund is null or p_refund < 0
    or p_refund_method is null or p_refund_method not in ('cash','transfer','card','other')
    or p_lines is null or jsonb_typeof(p_lines) is distinct from 'array'
    or (p_kind = 'return' and jsonb_array_length(p_lines) = 0)
    or (p_kind = 'cancellation' and jsonb_array_length(p_lines) <> 0) then
    raise exception 'Datos de devolución inválidos.' using errcode = '22023';
  end if;
  if p_refund > 0 and v_refund_amount <= 0 then
    raise exception 'El reembolso debe ser de al menos un centavo.' using errcode = '22023';
  end if;
  -- p_refund_status remains in the signature for existing clients, but is no
  -- longer trusted. Positive rounded amounts always require settlement.
  v_refund_status := case when v_refund_amount > 0 then 'pending' else 'not_refunded' end;

  select organization_id,branch_id into v_org,v_branch
    from public.sales where id = p_sale and status = 'confirmed' for update;
  if v_org is null or not app_private.has_visualcorp_access(v_org,'sales','edit',v_branch) then
    raise exception 'Venta no encontrada o acción no autorizada.' using errcode = '42501';
  end if;

  v_code := 'DEV-' || to_char(now() at time zone 'UTC','YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sale_returns(organization_id,sale_id,return_code,kind,refund_amount,refund_method,refund_status,note,created_by)
  values(v_org,p_sale,v_code,p_kind,v_refund_amount,p_refund_method,v_refund_status,left(coalesce(p_note,''),1000),v_user)
  returning id into v_return;

  if p_kind = 'cancellation' then
    for v_sl in select * from public.sale_lines where sale_id = p_sale and organization_id = v_org order by id for update loop
      v_qty := v_sl.fulfilled_quantity - v_sl.returned_quantity;
      if v_qty > 0 then
        insert into public.sale_return_lines(organization_id,return_id,sale_line_id,quantity,disposition)
        values(v_org,v_return,v_sl.id,v_qty,'restock');
        update public.sale_lines set returned_quantity = fulfilled_quantity where id = v_sl.id;
        if v_sl.variant_id is not null then
          insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
          values(v_org,v_sl.variant_id,v_branch,'MAIN','return',v_qty,'Cancelación ' || v_code,'sale_return',v_return,v_user);
        end if;
        v_total := v_total + v_qty * v_sl.unit_price;
      end if;
    end loop;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if p_kind = 'cancellation' then
      raise exception 'La cancelación ya calcula y devuelve automáticamente las unidades atendidas.' using errcode = '22023';
    end if;
    select * into v_sl from public.sale_lines
    where id = (v_line->>'sale_line_id')::uuid and sale_id = p_sale and organization_id = v_org for update;
    if not found then raise exception 'Una línea no corresponde a esta venta.' using errcode = '22023'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    v_disp := v_line->>'disposition';
    select coalesce(sum(quantity),0) into v_returned from public.sale_return_lines where sale_line_id = v_sl.id;
    if v_qty <= 0 or v_qty > v_sl.fulfilled_quantity - v_returned or v_disp not in ('restock','inspection','scrap') then
      raise exception 'Cantidad o destino inválido para %.',v_sl.description_snapshot using errcode = '22023';
    end if;
    insert into public.sale_return_lines(organization_id,return_id,sale_line_id,quantity,disposition)
    values(v_org,v_return,v_sl.id,v_qty,v_disp);
    update public.sale_lines set returned_quantity = returned_quantity + v_qty where id = v_sl.id;
    if v_disp = 'restock' and v_sl.variant_id is not null then
      insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values(v_org,v_sl.variant_id,v_branch,'MAIN','return',v_qty,'Devolución vendible ' || v_code,'sale_return',v_return,v_user);
    end if;
    v_total := v_total + v_qty * v_sl.unit_price;
  end loop;

  if v_refund_amount > v_total then raise exception 'El reembolso supera el valor de los artículos registrados.' using errcode = '22023'; end if;
  if p_kind = 'cancellation' then update public.sales set status = 'cancelled', updated_at = now() where id = p_sale; end if;
  return jsonb_build_object('return_id',v_return,'return_code',v_code,'items_value',round(v_total,2));
end;
$$;
revoke all on function public.process_sale_return(uuid,jsonb,text,numeric,text,text,text) from public, anon;
grant execute on function public.process_sale_return(uuid,jsonb,text,numeric,text,text,text) to authenticated;
