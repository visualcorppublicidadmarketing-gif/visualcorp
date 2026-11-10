-- Remove recoverable POS drafts through an authorized server-side operation.
-- Direct DELETE remains revoked on parked_pos_orders.
create or replace function public.delete_parked_pos_order(p_parked_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.parked_pos_orders%rowtype;
begin
  if v_user is null then
    raise exception 'Inicia sesión para eliminar una orden en espera.';
  end if;

  select * into v_order
    from public.parked_pos_orders
    where id = p_parked_order
    for update;

  if not found or not app_private.has_org_role(v_order.organization_id, v_order.branch_id, array['owner','admin','manager','advisor']) then
    raise exception 'La orden en espera no existe o no tienes acceso.';
  end if;

  if v_order.status <> 'parked' then
    raise exception 'Solo se pueden eliminar órdenes que siguen en espera.';
  end if;

  if v_order.created_by <> v_user
    and not app_private.has_org_role(v_order.organization_id, v_order.branch_id, array['owner','admin','manager']) then
    raise exception 'Solo quien guardó esta orden o un responsable de la sucursal puede eliminarla.';
  end if;

  delete from public.parked_pos_orders where id = v_order.id;
end;
$$;

revoke all on function public.delete_parked_pos_order(uuid) from public, anon;
grant execute on function public.delete_parked_pos_order(uuid) to authenticated;
