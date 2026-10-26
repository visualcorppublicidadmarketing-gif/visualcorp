-- Keep the cross-table permission guard safe for tables with different row shapes.
-- JSON row access avoids resolving fields such as status on inventory rows that do not define them.
create or replace function app_private.visualcorp_guard_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_module text;
  v_action text := 'edit';
  v_branch uuid;
  v_new_status text;
  v_old_status text;
  v_new_refund_status text;
  v_old_refund_status text;
begin
  if tg_table_name='public_requests' then
    select id into v_org from public.organizations where slug='visual-corp' limit 1;
  else
    v_org := nullif(case when tg_op='DELETE' then to_jsonb(old)->>'organization_id' else to_jsonb(new)->>'organization_id' end,'')::uuid;
  end if;
  v_module := app_private.visualcorp_module_for_table(tg_table_name);
  if v_module is null then raise exception 'No existe un permiso asociado a esta tabla.' using errcode='42501'; end if;
  if tg_table_name='public_requests' and tg_op='INSERT' and auth.uid() is null then return new; end if;
  if tg_op='DELETE' then v_action := 'delete_records'; end if;
  if tg_table_name in ('purchase_receipts','purchase_receipt_lines') and tg_op <> 'DELETE' then v_action := 'receive_purchase'; end if;
  v_branch := nullif(case when tg_op='DELETE' then to_jsonb(old)->>'branch_id' else to_jsonb(new)->>'branch_id' end,'')::uuid;
  if not app_private.has_visualcorp_access(v_org,v_module,v_action,v_branch) then
    raise exception 'Tu perfil no permite esta operación en %.', v_module using errcode='42501';
  end if;
  if tg_table_name in ('inventory_item_costs','inventory_item_cost_history') and tg_op <> 'DELETE'
     and not app_private.has_visualcorp_access(v_org,'inventory_costs','edit_costs',v_branch) then
    raise exception 'Editar costos de inventario requiere autorización.' using errcode='42501';
  end if;
  if tg_table_name in ('inventory_item_costs','inventory_item_cost_history') and tg_op='DELETE'
     and not app_private.has_visualcorp_access(v_org,'inventory_costs','edit_costs',v_branch) then
    raise exception 'Eliminar costos de inventario requiere autorización.' using errcode='42501';
  end if;

  if tg_table_name in ('catalog_products','website_product_overrides','calculator_settings') and tg_op='UPDATE'
     and exists (select 1 from jsonb_each(to_jsonb(new)) n(key,value)
       where n.key ~* '(price|tarifa|cost|costo|margin|margen|discount|descuento|rate|iva)'
         and n.value is distinct from (to_jsonb(old)->n.key))
     and not app_private.has_visualcorp_access(v_org,'catalog_admin','edit_prices',v_branch) then
    raise exception 'Cambiar tarifas requiere el permiso de edición de precios.' using errcode='42501';
  end if;

  if tg_op='UPDATE' then
    v_old_status := to_jsonb(old)->>'status';
    v_new_status := to_jsonb(new)->>'status';
    v_old_refund_status := to_jsonb(old)->>'refund_status';
    v_new_refund_status := to_jsonb(new)->>'refund_status';
  end if;
  if tg_table_name='purchase_orders' and tg_op='UPDATE' and v_old_status is distinct from v_new_status then
    if v_new_status='ordered' and not app_private.has_visualcorp_access(v_org,'purchases','approve_purchase',v_branch) then
      raise exception 'Enviar una orden de compra requiere autorización.' using errcode='42501';
    end if;
    if v_new_status='cancelled' and not app_private.has_visualcorp_access(v_org,'purchases','cancel_purchase',v_branch) then
      raise exception 'Cancelar una orden de compra requiere autorización.' using errcode='42501';
    end if;
    if v_new_status in ('partially_received','received') and not app_private.has_visualcorp_access(v_org,'purchases','receive_purchase',v_branch) then
      raise exception 'Recibir una compra requiere autorización.' using errcode='42501';
    end if;
  end if;

  if tg_table_name in ('pages','site_articles','services','promotions','catalog_products') and tg_op in ('INSERT','UPDATE')
     and (to_jsonb(new)->>'is_published')='true'
     and (tg_op='INSERT' or (to_jsonb(old)->>'is_published') is distinct from 'true')
     and not app_private.has_visualcorp_access(v_org,'website','publish_content',v_branch) then
    raise exception 'Publicar contenido requiere un permiso específico.' using errcode='42501';
  end if;

  if tg_table_name='sale_returns' and tg_op='UPDATE' and v_old_refund_status is distinct from v_new_refund_status
     and v_new_refund_status='completed' and not app_private.has_visualcorp_access(v_org,'sales','settle_refund',v_branch) then
    raise exception 'Completar un reembolso requiere autorización.' using errcode='42501';
  end if;
  if tg_table_name='cash_session_movements' and tg_op='INSERT'
     and not app_private.has_visualcorp_access(v_org,'cash','manage_cash',v_branch) then
    raise exception 'Registrar movimientos de caja requiere autorización.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app_private.visualcorp_guard_write() from public, anon, authenticated;
