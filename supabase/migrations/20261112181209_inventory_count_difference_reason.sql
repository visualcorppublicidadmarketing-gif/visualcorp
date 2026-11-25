-- A stock count that changes a previously recorded balance needs an explanation.
-- Keep the check in the transaction so callers cannot bypass the UI requirement.
create or replace function public.record_inventory_count_session_line(
  p_session_id uuid,
  p_line_id uuid,
  p_counted_quantity numeric,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.inventory_count_sessions%rowtype;
  v_line public.inventory_count_session_lines%rowtype;
  v_result jsonb;
  v_note text;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para guardar el conteo.'; end if;
  if p_counted_quantity is null or p_counted_quantity<0 then raise exception 'El conteo debe ser cero o mayor.'; end if;
  select * into v_session from public.inventory_count_sessions where id=p_session_id for update;
  if not found then raise exception 'No se encontró la sesión de conteo.'; end if;
  if not app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production']) then
    raise exception 'No tienes permiso para modificar esta sesión.';
  end if;
  select * into v_line from public.inventory_count_session_lines where id=p_line_id and session_id=p_session_id for update;
  if not found then raise exception 'El artículo no pertenece a esta sesión.'; end if;

  if v_line.status='counted' and v_line.counted_quantity=round(p_counted_quantity,3) then
    return jsonb_build_object(
      'session_id',p_session_id,'line_id',p_line_id,'status','counted',
      'counted_quantity',v_line.counted_quantity,'replayed',true
    );
  end if;
  if v_session.status<>'open' then raise exception 'La sesión de conteo ya no está abierta.'; end if;
  if v_line.status<>'pending' then
    raise exception 'Este artículo ya fue contado u omitido. Actualiza la sesión antes de continuar.' using errcode='55000';
  end if;
  if v_line.expected_quantity is not null
    and round(v_line.expected_quantity,3)<>round(p_counted_quantity,3)
    and length(trim(coalesce(p_note,'')))<8 then
    raise exception 'Explica la diferencia con al menos 8 caracteres.' using errcode='22023';
  end if;

  v_note := left(format('Sesión %s · saldo previo %s · observado %s · %s',p_session_id,coalesce(v_line.expected_quantity::text,'sin saldo registrado'),p_counted_quantity,coalesce(nullif(trim(p_note),''),'Conteo físico')),1000);
  v_result := public.set_inventory_count(v_line.variant_id,v_line.branch_id,p_counted_quantity,v_line.location_code,v_note);
  update public.inventory_count_session_lines set counted_quantity=p_counted_quantity,status='counted',note=left(coalesce(p_note,''),1000),counted_by=(select auth.uid()),counted_at=now() where id=p_line_id;
  insert into public.inventory_count_session_events(organization_id,session_id,line_id,event_type,counted_quantity,note,actor_id)
  values(v_session.organization_id,p_session_id,p_line_id,'counted',p_counted_quantity,left(coalesce(p_note,''),1000),(select auth.uid()));
  if not exists(select 1 from public.inventory_count_session_lines where session_id=p_session_id and status='pending') then
    update public.inventory_count_sessions set status='completed',completed_by=(select auth.uid()),completed_at=now() where id=p_session_id;
    insert into public.inventory_count_session_events(organization_id,session_id,event_type,note,actor_id)
    values(v_session.organization_id,p_session_id,'completed','Todos los artículos contados',(select auth.uid()));
  end if;
  return v_result;
end;
$$;

revoke all on function public.record_inventory_count_session_line(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.record_inventory_count_session_line(uuid,uuid,numeric,text) to authenticated;
