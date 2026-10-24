alter table public.suppliers add column updated_by uuid references auth.users(id) on delete set null;
alter table public.purchase_orders add column cancelled_by uuid references auth.users(id) on delete restrict;
alter table public.purchase_orders add column cancelled_at timestamptz;
alter table public.purchase_orders add column cancellation_reason text not null default '';

create or replace function app_private.cancel_purchase_order(p_order_id uuid,p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_branch uuid; v_uid uuid := (select auth.uid()); v_reason text := left(btrim(coalesce(p_reason,'')),500);
begin
  select organization_id,branch_id into v_org,v_branch from public.purchase_orders where id=p_order_id for update;
  if v_org is null or v_uid is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager']) then raise exception 'No tienes permiso para cancelar esta orden.' using errcode='42501'; end if;
  if exists(select 1 from public.purchase_order_lines where purchase_order_id=p_order_id and organization_id=v_org and quantity_received>0) then raise exception 'No se cancela una orden con recepciones registradas.' using errcode='22023'; end if;
  if v_reason='' then raise exception 'Indica el motivo de cancelación.' using errcode='22023'; end if;
  update public.purchase_orders set status='cancelled',cancelled_by=v_uid,cancelled_at=now(),cancellation_reason=v_reason,
    note=concat_ws(E'\n',nullif(note,''),'Cancelada: '||v_reason),updated_at=now()
  where id=p_order_id and organization_id=v_org and status in ('draft','ordered');
  if not found then raise exception 'La orden no puede cancelarse en su estado actual.' using errcode='22023'; end if;
end;
$$;
revoke all on function app_private.cancel_purchase_order(uuid,text) from public,anon,authenticated;
grant execute on function app_private.cancel_purchase_order(uuid,text) to authenticated;

