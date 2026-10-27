-- Align operational RPCs with explicit module permissions.

do $finance_function_permission_migration$
declare
  v_definition text;
  v_old_cost_write text;
  v_new_cost_write text;
  v_guard record;
begin
  for v_guard in
    select * from (values
      ('public.record_finance_expense(text,text,numeric,date,uuid,uuid,uuid,numeric,text,text,text,text)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager']) then raise exception 'No tienes permiso para registrar egresos.' using errcode='42501'; end if;$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org,'finance','manage_finance',p_branch_id) then raise exception 'No tienes permiso para registrar egresos.' using errcode='42501'; end if;$new$),
      ('public.record_finance_expense_payment(uuid,numeric,text,text)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org,null,array['owner','admin','manager']) then raise exception 'No tienes permiso para registrar pagos de gastos.' using errcode='42501'; end if;$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org,'finance','manage_finance') then raise exception 'No tienes permiso para registrar pagos de gastos.' using errcode='42501'; end if;$new$),
      ('public.record_finance_recurring_expense(uuid,date)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org, null, array['owner','admin','manager']) then$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org, 'finance', 'manage_finance') then$new$),
      ('app_private.record_finance_receipt_payable(uuid,numeric,text,date)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org, null, array['owner','admin','manager']) then$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org, 'finance', 'manage_finance') then$new$),
      ('app_private.create_purchase_order(uuid,uuid,uuid,jsonb,date,text)'::regprocedure,
       $old$if v_uid is null or not app_private.has_org_role(p_organization_id, p_branch_id, array['owner','admin','manager']) then$old$,
       $new$if v_uid is null or not app_private.has_visualcorp_access(p_organization_id, 'purchases', 'edit', p_branch_id) then$new$),
      ('app_private.submit_purchase_order(uuid)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager']) then raise exception 'No tienes permiso para enviar esta orden.' using errcode='42501'; end if;$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org,'purchases','approve_purchase',v_branch) then raise exception 'No tienes permiso para enviar esta orden.' using errcode='42501'; end if;$new$),
      ('app_private.cancel_purchase_order(uuid,text)'::regprocedure,
       $old$if v_org is null or v_uid is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager']) then raise exception 'No tienes permiso para cancelar esta orden.' using errcode='42501'; end if;$old$,
       $new$if v_org is null or v_uid is null or not app_private.has_visualcorp_access(v_org,'purchases','cancel_purchase',v_branch) then raise exception 'No tienes permiso para cancelar esta orden.' using errcode='42501'; end if;$new$),
      ('app_private.receive_purchase_order(uuid,jsonb,uuid,text,text)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager','warehouse']) then raise exception 'No tienes permiso para recibir esta orden.' using errcode='42501'; end if;$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org,'purchases','receive_purchase',v_branch) then raise exception 'No tienes permiso para recibir esta orden.' using errcode='42501'; end if;$new$),
      ('public.record_advisor_finance_sale(text,uuid,uuid,text,numeric,numeric,text,text,text,uuid)'::regprocedure,
       $old$if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','advisor']) then raise exception 'No tienes permiso para registrar ventas en esta sucursal.'; end if;$old$,
       $new$if v_org is null or not app_private.has_visualcorp_access(v_org,'sales','edit',p_branch_id) then raise exception 'No tienes permiso para registrar ventas en esta sucursal.'; end if;$new$),
      ('public.update_production_status(uuid,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_order.organization_id, v_order.branch_id, array['owner','admin','manager','production'])$old$,
       $new$app_private.has_visualcorp_access(v_order.organization_id, 'workshop', 'edit', v_order.branch_id)$new$),
      ('public.update_production_order_handoff(uuid,uuid,uuid,timestamptz,text,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_order.organization_id, v_order.branch_id, array['owner','admin','manager','production'])$old$,
       $new$app_private.has_visualcorp_access(v_order.organization_id, 'workshop', 'edit', v_order.branch_id)$new$),
      ('public.consume_production_material(uuid,uuid,numeric,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_o.organization_id,v_o.branch_id,array['owner','admin','manager','production','warehouse'])$old$,
       $new$app_private.has_visualcorp_access(v_o.organization_id,'workshop','edit',v_o.branch_id)$new$),
      ('public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text)'::regprocedure,
       $old$app_private.has_org_role(v_org,null,array['owner','admin','manager','advisor','marketing'])$old$,
       $new$app_private.has_visualcorp_access(v_org,'quotes','edit')$new$),
      ('public.update_central_quote_status(uuid,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_q.organization_id, null, array['owner','admin','manager','advisor','marketing'])$old$,
       $new$app_private.has_visualcorp_access(v_q.organization_id, 'quotes', 'edit')$new$),
      ('public.link_pos_sale_to_central_quote(uuid,uuid)'::regprocedure,
       $old$app_private.has_org_role(v_s.organization_id,v_s.branch_id,array['owner','admin','manager','advisor'])$old$,
       $new$app_private.has_visualcorp_access(v_s.organization_id,'sales','edit',v_s.branch_id)$new$),
      ('app_private.list_finance_personnel_options()'::regprocedure,
       $old$or not app_private.has_org_role(v_org, null, array['owner','admin']) then$old$,
       $new$or not app_private.has_visualcorp_access(v_org, 'personnel', 'view_compensation') then$new$)
    ) as guards(fn,old_guard,new_guard)
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_guard.fn);
    if pg_catalog.strpos(v_definition,v_guard.old_guard)=0 then
      raise exception 'La función % cambió; revisa su autorización antes de aplicar esta migración.',v_guard.fn;
    end if;
    v_definition := pg_catalog.replace(v_definition,v_guard.old_guard,v_guard.new_guard);
    if v_guard.fn='app_private.receive_purchase_order(uuid,jsonb,uuid,text,text)'::regprocedure then
      v_old_cost_write := $old_cost_write$    insert into public.inventory_item_costs(organization_id,variant_id,unit_cost,currency,supplier_name,updated_by,updated_at)
      values(v_org,v_variant,v_cost,'USD',v_supplier,v_uid,now())
      on conflict(organization_id,variant_id) do update set unit_cost=excluded.unit_cost,currency='USD',supplier_name=excluded.supplier_name,updated_by=v_uid,updated_at=now();$old_cost_write$;
      v_new_cost_write := $new_cost_write$    if app_private.has_visualcorp_access(v_org,'inventory_costs','edit_costs',v_branch) then
      insert into public.inventory_item_costs(organization_id,variant_id,unit_cost,currency,supplier_name,updated_by,updated_at)
        values(v_org,v_variant,v_cost,'USD',v_supplier,v_uid,now())
        on conflict(organization_id,variant_id) do update set unit_cost=excluded.unit_cost,currency='USD',supplier_name=excluded.supplier_name,updated_by=v_uid,updated_at=now();
    end if;$new_cost_write$;
      v_old_cost_write := pg_catalog.replace(v_old_cost_write,pg_catalog.chr(13),'');
      v_new_cost_write := pg_catalog.replace(v_new_cost_write,pg_catalog.chr(13),'');
      if pg_catalog.strpos(v_definition,v_old_cost_write)=0 then
        raise exception 'La actualización de costos de la recepción cambió; revisa su permiso antes de aplicar esta migración.';
      end if;
      v_definition := pg_catalog.replace(v_definition,v_old_cost_write,v_new_cost_write);
    end if;
    execute v_definition;
  end loop;
end;
$finance_function_permission_migration$;

do $finance_profile_permission_migration$
declare
  v_definition text := pg_catalog.pg_get_functiondef('public.save_visualcorp_access_profile(uuid,text,text,text,jsonb)'::regprocedure);
  v_old_modules text := $old_modules$not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel')$old_modules$;
  v_new_modules text := $new_modules$not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel','finance')$new_modules$;
  v_old_actions text := $old_actions$not in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash','view_compensation','edit_compensation')$old_actions$;
  v_new_actions text := $new_actions$not in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash','view_compensation','edit_compensation','manage_finance')$new_actions$;
begin
  if pg_catalog.strpos(v_definition,v_old_modules)=0 or pg_catalog.strpos(v_definition,v_old_actions)=0 then
    raise exception 'La función de perfiles cambió; revisa su validador antes de ampliar el catálogo financiero.';
  end if;
  v_definition := pg_catalog.replace(v_definition,v_old_modules,v_new_modules);
  v_definition := pg_catalog.replace(v_definition,v_old_actions,v_new_actions);
  execute v_definition;
end;
$finance_profile_permission_migration$;

do $finance_permission_catalog_migration$
declare
  v_module_definition text;
  v_action_definition text;
  v_expected_module_definition text := $expected$CHECK ((module_key = ANY (ARRAY['dashboard'::text, 'website'::text, 'crm'::text, 'sales'::text, 'quotes'::text, 'inventory'::text, 'inventory_costs'::text, 'purchases'::text, 'workshop'::text, 'marketing'::text, 'team'::text, 'catalog_admin'::text, 'backup'::text, 'cash'::text, 'personnel'::text])))$expected$;
  v_expected_action_definition text := $expected$CHECK ((action_key = ANY (ARRAY['view'::text, 'edit'::text, 'manage_members'::text, 'manage_profiles'::text, 'manage_owner'::text, 'view_costs'::text, 'edit_costs'::text, 'edit_prices'::text, 'approve_purchase'::text, 'cancel_purchase'::text, 'receive_purchase'::text, 'settle_refund'::text, 'publish_content'::text, 'delete_records'::text, 'manage_cash'::text, 'view_compensation'::text, 'edit_compensation'::text])))$expected$;
begin
  select pg_catalog.pg_get_constraintdef(oid) into v_module_definition
  from pg_catalog.pg_constraint
  where conrelid='public.access_profile_permissions'::regclass
    and conname='access_profile_permissions_module_key_check'
    and contype='c';
  select pg_catalog.pg_get_constraintdef(oid) into v_action_definition
  from pg_catalog.pg_constraint
  where conrelid='public.access_profile_permissions'::regclass
    and conname='access_profile_permissions_action_key_check'
    and contype='c';
  if v_module_definition is distinct from v_expected_module_definition
     or v_action_definition is distinct from v_expected_action_definition then
    raise exception 'El catálogo de permisos cambió; revisa las restricciones antes de habilitar Finanzas.';
  end if;

  alter table public.access_profile_permissions
    drop constraint access_profile_permissions_module_key_check,
    drop constraint access_profile_permissions_action_key_check;
  alter table public.access_profile_permissions
    add constraint access_profile_permissions_module_key_check
      check (module_key = any (array['dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel','finance']::text[])),
    add constraint access_profile_permissions_action_key_check
      check (action_key = any (array['view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash','view_compensation','edit_compensation','manage_finance']::text[]));
end;
$finance_permission_catalog_migration$;

-- Quote writes already flow through permission-checked RPCs; keep API roles read-only.
revoke all privileges on table public.central_quotes, public.central_quote_events from anon, authenticated;
grant select on table public.central_quotes, public.central_quote_events to authenticated;

-- Remove legacy policies that granted finance and purchasing access by role.
drop policy if exists finance_expenses_admin_read on public.finance_expenses;
drop policy if exists finance_expenses_admin_insert on public.finance_expenses;
drop policy if exists finance_expenses_admin_update on public.finance_expenses;
drop policy if exists finance_expense_payments_admin_read on public.finance_expense_payments;
drop policy if exists finance_expense_payments_admin_insert on public.finance_expense_payments;
drop policy if exists finance_budgets_admin_read on public.finance_budgets;
drop policy if exists finance_budgets_admin_insert on public.finance_budgets;
drop policy if exists finance_budgets_admin_update on public.finance_budgets;
drop policy if exists finance_recurring_admin_all on public.finance_recurring_templates;
drop policy if exists finance_recurring_occurrences_admin_read on public.finance_recurring_occurrences;
drop policy if exists finance_deductions_owner_read on public.finance_payroll_deductions;
drop policy if exists finance_deductions_owner_insert on public.finance_payroll_deductions;
drop policy if exists finance_deductions_owner_update on public.finance_payroll_deductions;
drop policy if exists finance_deductions_compensation_read on public.finance_payroll_deductions;
drop policy if exists suppliers_read on public.suppliers;
drop policy if exists suppliers_add on public.suppliers;
drop policy if exists suppliers_update on public.suppliers;
drop policy if exists purchase_orders_read on public.purchase_orders;
drop policy if exists purchase_order_lines_read on public.purchase_order_lines;
drop policy if exists purchase_receipts_read on public.purchase_receipts;
drop policy if exists purchase_receipt_lines_read on public.purchase_receipt_lines;

create policy finance_expenses_access_select on public.finance_expenses for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','view'));
create policy finance_expense_payments_access_select on public.finance_expense_payments for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','view'));
create policy finance_budgets_access_select on public.finance_budgets for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','view'));
create policy finance_budgets_access_insert on public.finance_budgets for insert to authenticated
with check (created_by=(select auth.uid()) and app_private.has_visualcorp_access(organization_id,'finance','manage_finance'));
create policy finance_budgets_access_update on public.finance_budgets for update to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','manage_finance'))
with check (app_private.has_visualcorp_access(organization_id,'finance','manage_finance'));
create policy finance_recurring_templates_access_select on public.finance_recurring_templates for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','view'));
create policy finance_recurring_templates_access_insert on public.finance_recurring_templates for insert to authenticated
with check (app_private.has_visualcorp_access(organization_id,'finance','manage_finance'));
create policy finance_recurring_templates_access_update on public.finance_recurring_templates for update to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','manage_finance'))
with check (app_private.has_visualcorp_access(organization_id,'finance','manage_finance'));
create policy finance_recurring_occurrences_access_select on public.finance_recurring_occurrences for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'finance','view'));
create policy finance_payroll_deductions_access_select on public.finance_payroll_deductions for select to authenticated
using (personnel_id is not null and app_private.has_visualcorp_access(organization_id,'personnel','view_compensation'));
create policy finance_payroll_deductions_access_insert on public.finance_payroll_deductions for insert to authenticated with check (
  created_by=(select auth.uid()) and status='pending_authorization' and personnel_id is not null
  and app_private.has_visualcorp_access(organization_id,'personnel','edit_compensation')
  and (employee_user_id is null or exists (
    select 1 from public.organization_memberships m where m.organization_id=finance_payroll_deductions.organization_id
      and m.user_id=finance_payroll_deductions.employee_user_id and m.active
  ))
);
create policy finance_payroll_deductions_access_update on public.finance_payroll_deductions for update to authenticated
using (app_private.has_visualcorp_access(organization_id,'personnel','edit_compensation'))
with check (app_private.has_visualcorp_access(organization_id,'personnel','edit_compensation'));

-- Finance writes go through validated RPCs; budgets and recurring templates keep their scoped UI writes.
revoke all on public.finance_expenses,public.finance_expense_payments,public.finance_budgets,
  public.finance_recurring_templates,public.finance_recurring_occurrences,public.finance_payroll_deductions
  from public,anon,authenticated;
grant select on public.finance_expenses,public.finance_expense_payments,public.finance_recurring_occurrences to authenticated;
grant select,insert,update on public.finance_budgets,public.finance_recurring_templates to authenticated;
grant select,insert,update on public.finance_payroll_deductions to authenticated;

-- Inventory count and transfer RPCs must match the inventory.edit controls in the UI.
do $inventory_function_permission_migration$
declare
  v_definition text;
  v_guard record;
begin
  for v_guard in
    select * from (values
      ('public.begin_inventory_count_session(uuid,jsonb,uuid,text)'::regprocedure,
       $old$app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse','production'])$old$,
       $new$app_private.has_visualcorp_access(v_org,'inventory','edit',p_branch_id)$new$),
      ('public.set_inventory_count(uuid,uuid,numeric,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse','production'])$old$,
       $new$app_private.has_visualcorp_access(v_org,'inventory','edit',p_branch_id)$new$),
      ('public.record_inventory_count_session_line(uuid,uuid,numeric,text)'::regprocedure,
       $old$app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production'])$old$,
       $new$app_private.has_visualcorp_access(v_session.organization_id,'inventory','edit',v_session.branch_id)$new$),
      ('public.skip_inventory_count_session_line(uuid,uuid,text)'::regprocedure,
       $old$app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production'])$old$,
       $new$app_private.has_visualcorp_access(v_session.organization_id,'inventory','edit',v_session.branch_id)$new$),
      ('public.complete_inventory_count_session(uuid)'::regprocedure,
       $old$app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production'])$old$,
       $new$app_private.has_visualcorp_access(v_session.organization_id,'inventory','edit',v_session.branch_id)$new$),
      ('public.cancel_inventory_count_session(uuid,text)'::regprocedure,
       $old$app_private.has_org_role(v_session.organization_id,v_session.branch_id,array['owner','admin','manager','warehouse','production'])$old$,
       $new$app_private.has_visualcorp_access(v_session.organization_id,'inventory','edit',v_session.branch_id)$new$),
      ('public.record_inventory_movement(uuid,uuid,text,numeric,text,text,text,uuid)'::regprocedure,
       $old$app_private.has_org_role(
    v_org, p_branch_id, array['owner','admin','manager','warehouse','production']
  )$old$,
       $new$app_private.has_visualcorp_access(v_org,'inventory','edit',p_branch_id)$new$),
      ('public.set_inventory_reservation(uuid,uuid,numeric,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager','warehouse'])$old$,
       $new$app_private.has_visualcorp_access(v_org,'inventory','edit',p_branch_id)$new$),
      ('public.transfer_inventory(uuid,uuid,uuid,numeric,text)'::regprocedure,
       $old$not app_private.has_org_role(v_org,p_from_branch_id,array['owner','admin','manager','warehouse']) or not app_private.has_org_role(v_org,p_to_branch_id,array['owner','admin','manager','warehouse'])$old$,
       $new$not app_private.has_visualcorp_access(v_org,'inventory','edit',p_from_branch_id) or not app_private.has_visualcorp_access(v_org,'inventory','edit',p_to_branch_id)$new$),
      ('public.review_inventory_import_row(uuid,text,uuid,text)'::regprocedure,
       $old$app_private.has_org_role(v_row.organization_id, null, array['owner','admin','manager','warehouse'])$old$,
       $new$exists(select 1 from public.inventory_import_batches batch where batch.id=v_row.batch_id and batch.organization_id=v_row.organization_id and app_private.has_visualcorp_access(v_row.organization_id,'inventory','edit',batch.branch_id))$new$),
      ('public.create_stock_transfer_request(uuid,uuid,uuid,numeric,text,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_org,p_from_branch,array['owner','admin','manager','warehouse','advisor'])$old$,
       $new$app_private.has_visualcorp_access(v_org,'inventory','edit',p_from_branch)$new$),
      ('public.update_stock_transfer_status(uuid,text,text)'::regprocedure,
       $old$app_private.has_org_role(v_t.organization_id,v_t.from_branch_id,array['owner','admin','manager','warehouse'])$old$,
       $new$app_private.has_visualcorp_access(v_t.organization_id,'inventory','edit',v_t.from_branch_id)$new$),
      ('public.dispatch_stock_transfer(uuid,jsonb)'::regprocedure,
       $old$app_private.has_org_role(v_t.organization_id,v_t.from_branch_id,array['owner','admin','manager','warehouse'])$old$,
       $new$app_private.has_visualcorp_access(v_t.organization_id,'inventory','edit',v_t.from_branch_id)$new$),
      ('public.receive_stock_transfer(uuid,jsonb,text)'::regprocedure,
       $old$app_private.has_org_role(v_t.organization_id,v_t.to_branch_id,array['owner','admin','manager','warehouse'])$old$,
       $new$app_private.has_visualcorp_access(v_t.organization_id,'inventory','edit',v_t.to_branch_id)$new$)
    ) as guards(fn,old_guard,new_guard)
  loop
    v_definition := pg_catalog.replace(pg_catalog.pg_get_functiondef(v_guard.fn),pg_catalog.chr(13),'');
    if pg_catalog.strpos(v_definition,pg_catalog.replace(v_guard.old_guard,pg_catalog.chr(13),''))=0 then
      raise exception 'La función % cambió; revisa su autorización de inventario antes de aplicar esta migración.',v_guard.fn;
    end if;
    v_definition := pg_catalog.replace(v_definition,pg_catalog.replace(v_guard.old_guard,pg_catalog.chr(13),''),v_guard.new_guard);
    execute v_definition;
  end loop;
end;
$inventory_function_permission_migration$;

-- Count read policies use the same branch-scoped inventory permission as the workspace.
drop policy if exists inventory_count_sessions_read on public.inventory_count_sessions;
create policy inventory_count_sessions_read on public.inventory_count_sessions for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'inventory','view',branch_id));

drop policy if exists inventory_count_session_lines_read on public.inventory_count_session_lines;
create policy inventory_count_session_lines_read on public.inventory_count_session_lines for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'inventory','view',branch_id));

drop policy if exists inventory_count_session_events_read on public.inventory_count_session_events;
create policy inventory_count_session_events_read on public.inventory_count_session_events for select to authenticated
using (exists (
  select 1 from public.inventory_count_sessions session
  where session.id=inventory_count_session_events.session_id
    and session.organization_id=inventory_count_session_events.organization_id
    and app_private.has_visualcorp_access(session.organization_id,'inventory','view',session.branch_id)
));

-- The generated restrictive policy already requires inventory.view for count audits;
-- remove the legacy role predicate so custom profiles are evaluated consistently.
drop policy if exists inventory_count_audits_staff_read on public.inventory_count_audits;

-- Remove legacy role-based access policies where the generated permission policies already apply.
drop policy if exists categories_add on public.inventory_categories;
drop policy if exists categories_read on public.inventory_categories;
drop policy if exists categories_update on public.inventory_categories;
drop policy if exists items_add on public.inventory_items;
drop policy if exists items_read on public.inventory_items;
drop policy if exists items_update on public.inventory_items;
drop policy if exists variants_add on public.inventory_variants;
drop policy if exists variants_read on public.inventory_variants;
drop policy if exists variants_update on public.inventory_variants;
drop policy if exists inventory_locations_read on public.inventory_locations;
drop policy if exists inventory_locations_add on public.inventory_locations;
drop policy if exists inventory_locations_update on public.inventory_locations;
drop policy if exists costs_add on public.inventory_item_costs;
drop policy if exists costs_read on public.inventory_item_costs;
drop policy if exists costs_update on public.inventory_item_costs;
drop policy if exists inventory_item_cost_history_read on public.inventory_item_cost_history;
drop policy if exists inventory_import_batches_admin_update on public.inventory_import_batches;
drop policy if exists inventory_import_batches_staff_read on public.inventory_import_batches;
drop policy if exists inventory_import_rows_admin_update on public.inventory_import_rows;
drop policy if exists inventory_import_rows_staff_read on public.inventory_import_rows;
drop policy if exists inventory_import_review_events_staff_read on public.inventory_import_review_events;
drop policy if exists inventory_reservation_audits_staff_read on public.inventory_reservation_audits;
drop policy if exists movements_add on public.inventory_movements;
drop policy if exists movements_read on public.inventory_movements;
drop policy if exists stock_read on public.inventory_stock;
drop policy if exists inventory_roll_cut_conversions_staff_read on public.inventory_roll_cut_conversions;
drop policy if exists transfer_events_read on public.stock_transfer_events;
drop policy if exists transfer_lines_add on public.stock_transfer_lines;
drop policy if exists transfer_lines_read on public.stock_transfer_lines;
drop policy if exists transfer_lines_update on public.stock_transfer_lines;
drop policy if exists transfer_lines_manage on public.stock_transfer_lines;
drop policy if exists transfers_add on public.stock_transfers;
drop policy if exists transfers_read on public.stock_transfers;
drop policy if exists transfers_update on public.stock_transfers;

-- Ledger and workflow rows are written through SECURITY DEFINER RPCs, not direct REST mutations.
revoke insert, update, delete, truncate, references, trigger on table
  public.inventory_movements,
  public.inventory_count_audits,
  public.inventory_reservation_audits,
  public.inventory_import_review_events,
  public.inventory_roll_cut_conversions,
  public.stock_transfers,
  public.stock_transfer_lines,
  public.stock_transfer_events
from authenticated;

-- Imported rows may enter review through INSERT, but review decisions must use the audited RPC.
revoke insert, update, delete, truncate, references, trigger on table public.inventory_import_batches from authenticated;
revoke update, delete, truncate, references, trigger on table public.inventory_import_rows from authenticated;

drop policy if exists vc_access_select on public.inventory_import_rows;
create policy vc_access_select on public.inventory_import_rows as restrictive for select to authenticated
using (exists (
  select 1 from public.inventory_import_batches batch
  where batch.id=inventory_import_rows.batch_id
    and batch.organization_id=inventory_import_rows.organization_id
    and app_private.has_visualcorp_access(batch.organization_id,'inventory','view',batch.branch_id)
));
drop policy if exists vc_access_insert on public.inventory_import_rows;
create policy vc_access_insert on public.inventory_import_rows as restrictive for insert to authenticated
with check (
  mapping_status='pending_review'
  and normalized_item_id is null
  and normalized_variant_id is null
  and review_note=''
  and exists (
    select 1 from public.inventory_import_batches batch
    where batch.id=inventory_import_rows.batch_id
      and batch.organization_id=inventory_import_rows.organization_id
      and app_private.has_visualcorp_access(batch.organization_id,'inventory','edit',batch.branch_id)
  )
);
drop policy if exists vc_access_select on public.inventory_import_review_events;
create policy vc_access_select on public.inventory_import_review_events as restrictive for select to authenticated
using (exists (
  select 1
  from public.inventory_import_rows import_row
  join public.inventory_import_batches batch
    on batch.id=import_row.batch_id and batch.organization_id=import_row.organization_id
  where import_row.id=inventory_import_review_events.import_row_id
    and import_row.organization_id=inventory_import_review_events.organization_id
    and app_private.has_visualcorp_access(batch.organization_id,'inventory','view',batch.branch_id)
));

-- Preserve row ownership and system-location invariants in restrictive policies.
drop policy if exists vc_access_insert on public.inventory_locations;
create policy vc_access_insert on public.inventory_locations as restrictive for insert to authenticated
with check (
  created_by=(select auth.uid())
  and not is_system
  and app_private.has_visualcorp_access(organization_id,'inventory','edit',branch_id)
);
drop policy if exists vc_access_update on public.inventory_locations;
create policy vc_access_update on public.inventory_locations as restrictive for update to authenticated
using (not is_system and app_private.has_visualcorp_access(organization_id,'inventory','edit',branch_id))
with check (not is_system and app_private.has_visualcorp_access(organization_id,'inventory','edit',branch_id));

drop policy if exists vc_access_insert on public.inventory_items;
create policy vc_access_insert on public.inventory_items as restrictive for insert to authenticated
with check (
  created_by=(select auth.uid())
  and app_private.has_visualcorp_access(organization_id,'inventory','edit',null)
);

drop policy if exists vc_access_insert on public.inventory_item_costs;
create policy vc_access_insert on public.inventory_item_costs as restrictive for insert to authenticated
with check (
  updated_by=(select auth.uid())
  and app_private.has_visualcorp_access(organization_id,'inventory_costs','edit',null)
  and app_private.has_visualcorp_access(organization_id,'inventory_costs','edit_costs',null)
);
drop policy if exists vc_access_update on public.inventory_item_costs;
create policy vc_access_update on public.inventory_item_costs as restrictive for update to authenticated
using (
  app_private.has_visualcorp_access(organization_id,'inventory_costs','edit',null)
  and app_private.has_visualcorp_access(organization_id,'inventory_costs','edit_costs',null)
)
with check (
  updated_by=(select auth.uid())
  and app_private.has_visualcorp_access(organization_id,'inventory_costs','edit',null)
  and app_private.has_visualcorp_access(organization_id,'inventory_costs','edit_costs',null)
);

-- A transfer belongs to the source/destination branches; generic organization-wide policies were too broad.
drop policy if exists vc_access_select on public.stock_transfers;
create policy vc_access_select on public.stock_transfers as restrictive for select to authenticated
using (
  app_private.has_visualcorp_access(organization_id,'inventory','view',from_branch_id)
  or app_private.has_visualcorp_access(organization_id,'inventory','view',to_branch_id)
);
drop policy if exists vc_access_select on public.stock_transfer_lines;
create policy vc_access_select on public.stock_transfer_lines as restrictive for select to authenticated
using (exists (
  select 1 from public.stock_transfers transfer
  where transfer.id=stock_transfer_lines.transfer_id
    and transfer.organization_id=stock_transfer_lines.organization_id
    and (
      app_private.has_visualcorp_access(transfer.organization_id,'inventory','view',transfer.from_branch_id)
      or app_private.has_visualcorp_access(transfer.organization_id,'inventory','view',transfer.to_branch_id)
    )
));
drop policy if exists vc_access_select on public.stock_transfer_events;
create policy vc_access_select on public.stock_transfer_events as restrictive for select to authenticated
using (exists (
  select 1 from public.stock_transfers transfer
  where transfer.id=stock_transfer_events.transfer_id
    and transfer.organization_id=stock_transfer_events.organization_id
    and (
      app_private.has_visualcorp_access(transfer.organization_id,'inventory','view',transfer.from_branch_id)
      or app_private.has_visualcorp_access(transfer.organization_id,'inventory','view',transfer.to_branch_id)
    )
));
-- Preserve the legacy admin/manager capabilities through explicit profile permissions.
insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select p.id,'finance','manage_finance',true from public.access_profiles p
where p.organization_id=(select id from public.organizations where slug='visual-corp')
  and p.is_system and p.base_role in ('admin','manager')
on conflict(profile_id,module_key,action_key) do update set enabled=true;
insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select p.id,'finance','view',true from public.access_profiles p
where p.organization_id=(select id from public.organizations where slug='visual-corp')
  and p.is_system and p.base_role in ('admin','manager')
on conflict(profile_id,module_key,action_key) do update set enabled=true;
insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select p.id,'purchases','view',true from public.access_profiles p
where p.organization_id=(select id from public.organizations where slug='visual-corp')
  and p.is_system and p.base_role in ('admin','manager')
on conflict(profile_id,module_key,action_key) do update set enabled=true;
insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select p.id,'personnel','view_compensation',true from public.access_profiles p
where p.organization_id=(select id from public.organizations where slug='visual-corp') and p.is_system and p.profile_key='admin'
on conflict(profile_id,module_key,action_key) do update set enabled=true;
insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select p.id,'personnel','edit_compensation',true from public.access_profiles p
where p.organization_id=(select id from public.organizations where slug='visual-corp') and p.is_system and p.profile_key='admin'
on conflict(profile_id,module_key,action_key) do update set enabled=true;
