-- Editable, organization-scoped profiles. Existing role columns remain as a
-- compatibility ceiling for older policies; restrictive policies and write
-- guards apply the editable module/action matrix to database operations.
create table public.access_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_key text not null check (profile_key ~ '^[a-z0-9_]{2,48}$'),
  name text not null check (length(trim(name)) between 2 and 80),
  description text not null default '',
  base_role text not null check (base_role in ('owner','admin','manager','advisor','warehouse','production','marketing','website_admin')),
  is_system boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_key),
  unique (id, organization_id)
);

create table public.access_profile_permissions (
  profile_id uuid not null references public.access_profiles(id) on delete cascade,
  module_key text not null check (module_key in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash')),
  action_key text not null check (action_key in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, module_key, action_key)
);

create table public.access_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  profile_id uuid references public.access_profiles(id) on delete set null,
  event_key text not null check (event_key in ('profile_created','profile_updated','profile_activated','profile_deactivated','profile_assigned','membership_activated','membership_deactivated')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.organization_memberships
  add column profile_id uuid references public.access_profiles(id) on delete restrict;
alter table public.organization_memberships drop constraint if exists organization_memberships_role_check;
alter table public.organization_memberships add constraint organization_memberships_role_check
  check (role in ('owner','admin','manager','advisor','warehouse','production','marketing','website_admin'));

-- Allow more than one assigned profile to use the same legacy authorization
-- ceiling while preserving branch-scoped uniqueness.
alter table public.organization_memberships
  drop constraint if exists organization_memberships_organization_id_user_id_role_branch_id_key;
drop index if exists public.organization_memberships_global_role_uq;
create unique index organization_memberships_profile_global_uq
  on public.organization_memberships (organization_id, user_id, profile_id)
  where branch_id is null and profile_id is not null;
create unique index organization_memberships_profile_branch_uq
  on public.organization_memberships (organization_id, user_id, profile_id, branch_id)
  where branch_id is not null and profile_id is not null;
create index access_profiles_org_active_idx on public.access_profiles (organization_id, active);
create index access_profile_permissions_enabled_idx on public.access_profile_permissions (profile_id, module_key, action_key) where enabled;
create index access_audit_log_org_created_idx on public.access_audit_log (organization_id, created_at desc);

insert into public.access_profiles (organization_id, profile_key, name, description, base_role, is_system)
select org.id, profile.profile_key, profile.name, profile.description, profile.base_role, true
from public.organizations org
cross join (values
  ('owner','Propietario','Control técnico de propiedad, reservado al sistema.','owner'),
  ('admin','Admin','Administración general del equipo y los módulos internos.','admin'),
  ('gerencia','Gerencia','Supervisión de la operación y consulta de resultados.','manager'),
  ('coordinador_ventas','Coordinador de Ventas','Coordinación de asesoría, ventas y seguimiento comercial.','manager'),
  ('asesoras','Asesoras','Atención comercial y registro de ventas y cotizaciones.','advisor'),
  ('coordinador_taller','Coordinador de Taller','Coordinación de órdenes, materiales y áreas de producción.','production'),
  ('personal_taller','Personal de Taller','Consulta de materiales y actualización de tareas de producción.','production'),
  ('disenador_grafico','Diseñador Gráfico','Preparación de diseños para revisión y producción.','production'),
  ('impresor','Impresor','Trabajo y actualización de tareas de impresión.','production'),
  ('sublimacion','Sublimación','Trabajo y actualización de tareas de sublimación.','production'),
  ('encargado_local','Encargado del Local','Atención, ventas y coordinación operativa del local.','manager'),
  ('inventario','Inventario','Control de existencias y consulta de compras y producción.','warehouse'),
  ('website_admin','Admin página web','Administración del sitio público.','website_admin'),
  ('marketing','Marketing','Gestión de marketing y consulta de cotizaciones.','marketing')
) as profile(profile_key,name,description,base_role)
where org.slug = 'visual-corp'
on conflict (organization_id, profile_key) do nothing;

-- Assign conservative, editable defaults. These are configuration templates;
-- existing accounts retain the role they had and are linked below.
with profile_defaults(profile_key, permissions) as (values
  ('admin', jsonb_build_array('dashboard.view','dashboard.edit','dashboard.delete_records','website.view','website.edit','website.publish_content','website.delete_records','crm.view','crm.edit','crm.delete_records','sales.view','sales.edit','sales.settle_refund','sales.delete_records','quotes.view','quotes.edit','quotes.delete_records','inventory.view','inventory.edit','inventory.delete_records','inventory_costs.view','inventory_costs.edit','inventory_costs.view_costs','inventory_costs.edit_costs','inventory_costs.delete_records','purchases.view','purchases.edit','purchases.approve_purchase','purchases.cancel_purchase','purchases.receive_purchase','purchases.delete_records','workshop.view','workshop.edit','workshop.delete_records','marketing.view','marketing.edit','marketing.delete_records','team.view','team.manage_members','team.manage_profiles','catalog_admin.view','catalog_admin.edit','catalog_admin.edit_prices','catalog_admin.delete_records','backup.view','backup.edit','cash.view','cash.edit','cash.manage_cash','cash.delete_records')),
  ('gerencia', jsonb_build_array('dashboard.view','dashboard.edit','website.view','crm.view','crm.edit','sales.view','sales.edit','sales.settle_refund','quotes.view','quotes.edit','inventory.view','inventory.edit','inventory_costs.view','inventory_costs.edit','inventory_costs.view_costs','inventory_costs.edit_costs','purchases.view','purchases.edit','purchases.approve_purchase','purchases.cancel_purchase','purchases.receive_purchase','workshop.view','workshop.edit','marketing.view','marketing.edit','team.view','catalog_admin.view','catalog_admin.edit','catalog_admin.edit_prices','cash.view','cash.edit','cash.manage_cash','website.publish_content')),
  ('coordinador_ventas', jsonb_build_array('dashboard.view','crm.view','crm.edit','sales.view','sales.edit','quotes.view','quotes.edit','inventory.view','purchases.view','workshop.view','marketing.view')),
  ('asesoras', jsonb_build_array('dashboard.view','crm.view','crm.edit','sales.view','sales.edit','quotes.view','quotes.edit','inventory.view')),
  ('coordinador_taller', jsonb_build_array('dashboard.view','crm.view','sales.view','quotes.view','inventory.view','inventory.edit','purchases.view','workshop.view','workshop.edit')),
  ('personal_taller', jsonb_build_array('dashboard.view','inventory.view','workshop.view','workshop.edit')),
  ('disenador_grafico', jsonb_build_array('dashboard.view','website.view','quotes.view','workshop.view','workshop.edit','marketing.view','marketing.edit')),
  ('impresor', jsonb_build_array('dashboard.view','inventory.view','workshop.view','workshop.edit')),
  ('sublimacion', jsonb_build_array('dashboard.view','inventory.view','workshop.view','workshop.edit')),
  ('encargado_local', jsonb_build_array('dashboard.view','dashboard.edit','crm.view','crm.edit','sales.view','sales.edit','quotes.view','quotes.edit','inventory.view','inventory.edit','purchases.view','purchases.edit','workshop.view','catalog_admin.view','cash.view','cash.edit')),
  ('inventario', jsonb_build_array('dashboard.view','inventory.view','inventory.edit','purchases.view','purchases.receive_purchase','workshop.view')),
  ('website_admin', jsonb_build_array('website.view','website.edit','catalog_admin.view','marketing.view')),
  ('marketing', jsonb_build_array('dashboard.view','marketing.view','marketing.edit','quotes.view','quotes.edit','crm.view'))
), expanded as (
  select p.id as profile_id, split_part(permission.value, '.', 1) as module_key, split_part(permission.value, '.', 2) as action_key
  from profile_defaults d
  join public.access_profiles p on p.profile_key=d.profile_key
  cross join lateral jsonb_array_elements_text(d.permissions) permission(value)
)
insert into public.access_profile_permissions (profile_id,module_key,action_key,enabled)
select profile_id,module_key,action_key,true from expanded
on conflict (profile_id,module_key,action_key) do nothing;

-- Tie existing role assignments to the corresponding editable template without
-- changing anyone's assigned legacy role or active status.
update public.organization_memberships m
set profile_id = p.id
from public.organizations o, public.access_profiles p
where m.organization_id=o.id and o.slug='visual-corp'
  and p.organization_id=o.id and p.profile_key=case m.role
    when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario'
    when 'production' then 'personal_taller' else m.role end
  and m.profile_id is null;

alter table public.access_profiles enable row level security;
alter table public.access_profile_permissions enable row level security;
alter table public.access_audit_log enable row level security;
grant select on public.access_profiles, public.access_profile_permissions, public.access_audit_log to authenticated;
revoke insert, update, delete on public.access_profiles, public.access_profile_permissions, public.access_audit_log from anon, authenticated;
revoke insert, update, delete on public.organization_memberships from anon, authenticated;

create or replace function app_private.has_visualcorp_access(
  p_org uuid, p_module text, p_action text, p_branch uuid default null
) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organization_memberships m
    join public.access_profiles p on p.id = coalesce(m.profile_id, (
      select legacy.id from public.access_profiles legacy
      where legacy.organization_id=m.organization_id and legacy.profile_key=m.role
      limit 1
    )) and p.organization_id=m.organization_id
    left join public.access_profile_permissions permission
      on permission.profile_id=p.id and permission.module_key=p_module
      and permission.action_key=p_action and permission.enabled
    where m.organization_id=p_org and m.user_id=(select auth.uid()) and m.active
      and p.active and (p_branch is null or m.branch_id is null or m.branch_id=p_branch)
      and (m.role='owner' or permission.profile_id is not null
        or (p_action='view' and exists (
          select 1 from public.access_profile_permissions edit_permission
          where edit_permission.profile_id=p.id and edit_permission.module_key=p_module
            and edit_permission.action_key='edit' and edit_permission.enabled
        )))
  );
$$;
revoke all on function app_private.has_visualcorp_access(uuid,text,text,uuid) from public, anon;
grant execute on function app_private.has_visualcorp_access(uuid,text,text,uuid) to authenticated;

create or replace function app_private.visualcorp_module_for_table(p_table text)
returns text language sql immutable set search_path = '' as $$
  select case p_table
    when 'organizations' then 'dashboard' when 'branches' then 'dashboard' when 'areas' then 'workshop'
    when 'organization_memberships' then 'team' when 'access_profiles' then 'team' when 'access_profile_permissions' then 'team' when 'access_audit_log' then 'team'
    when 'inventory_categories' then 'inventory' when 'inventory_items' then 'inventory' when 'inventory_variants' then 'inventory'
    when 'inventory_stock' then 'inventory' when 'inventory_movements' then 'inventory' when 'inventory_count_audits' then 'inventory'
    when 'inventory_reservation_audits' then 'inventory' when 'inventory_locations' then 'inventory' when 'inventory_import_batches' then 'inventory'
    when 'inventory_import_rows' then 'inventory' when 'inventory_import_review_events' then 'inventory' when 'catalog_inventory_links' then 'catalog_admin'
    when 'inventory_item_costs' then 'inventory_costs' when 'inventory_item_cost_history' then 'inventory_costs'
    when 'stock_transfers' then 'inventory' when 'stock_transfer_lines' then 'inventory' when 'stock_transfer_events' then 'inventory'
    when 'customers' then 'crm' when 'public_requests' then 'crm'
    when 'sales' then 'sales' when 'sale_lines' then 'sales' when 'sale_payments' then 'sales' when 'sale_returns' then 'sales' when 'sale_return_lines' then 'sales' when 'parked_pos_orders' then 'sales'
    when 'catalog_products' then 'catalog_admin' when 'website_product_overrides' then 'catalog_admin'
    when 'site_settings' then 'website' when 'services' then 'website' when 'promotions' then 'website' when 'pages' then 'website' when 'page_blocks' then 'website' when 'site_articles' then 'website' when 'calculator_settings' then 'website'
    when 'cash_sessions' then 'cash' when 'cash_session_movements' then 'cash'
    when 'production_orders' then 'workshop' when 'production_order_events' then 'workshop' when 'production_material_targets' then 'workshop'
    when 'central_quotes' then 'quotes' when 'central_quote_events' then 'quotes'
    when 'suppliers' then 'purchases' when 'purchase_orders' then 'purchases' when 'purchase_order_lines' then 'purchases' when 'purchase_receipts' then 'purchases' when 'purchase_receipt_lines' then 'purchases'
    when 'internal_change_log' then 'dashboard'
    else null end;
$$;

create or replace function app_private.visualcorp_guard_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_module text;
  v_action text := 'edit';
  v_branch uuid;
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

  if tg_table_name='purchase_orders' and tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status='ordered' and not app_private.has_visualcorp_access(v_org,'purchases','approve_purchase',v_branch) then
      raise exception 'Enviar una orden de compra requiere autorización.' using errcode='42501';
    end if;
    if new.status='cancelled' and not app_private.has_visualcorp_access(v_org,'purchases','cancel_purchase',v_branch) then
      raise exception 'Cancelar una orden de compra requiere autorización.' using errcode='42501';
    end if;
    if new.status in ('partially_received','received') and not app_private.has_visualcorp_access(v_org,'purchases','receive_purchase',v_branch) then
      raise exception 'Recibir una compra requiere autorización.' using errcode='42501';
    end if;
  end if;

  if tg_table_name in ('pages','site_articles','services','promotions','catalog_products') and tg_op in ('INSERT','UPDATE')
     and (to_jsonb(new)->>'is_published')='true'
     and (tg_op='INSERT' or (to_jsonb(old)->>'is_published') is distinct from 'true')
     and not app_private.has_visualcorp_access(v_org,'website','publish_content',v_branch) then
    raise exception 'Publicar contenido requiere un permiso específico.' using errcode='42501';
  end if;

  if tg_table_name='sale_returns' and tg_op='UPDATE' and old.refund_status is distinct from new.refund_status
     and new.refund_status='completed' and not app_private.has_visualcorp_access(v_org,'sales','settle_refund',v_branch) then
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

-- Apply restrictive policies and write guards to every tenant table in this
-- migration set. Existing permissive RLS rules continue to define row/sucursal
-- visibility; this extra layer enforces the editable profile matrix.
do $$
declare
  r record;
  v_module text;
  v_branch_col text;
  v_org_expr text;
  v_branch_expr text;
  v_write_action text;
  v_select_expr text;
  v_edit_expr text;
begin
  for r in
    select c.table_name,
      bool_or(c.column_name='organization_id') as has_org_id,
      bool_or(c.column_name='branch_id') as has_branch_id
    from information_schema.columns c
    where c.table_schema='public' and c.table_name in (
      'organizations','branches','areas','organization_memberships','access_profiles','access_profile_permissions','access_audit_log',
      'inventory_categories','inventory_items','inventory_variants','inventory_stock','inventory_movements','inventory_item_costs','inventory_item_cost_history','stock_transfers','stock_transfer_lines','stock_transfer_events','customers','sales','sale_lines','public_requests',
      'catalog_products','website_product_overrides','site_settings','services','promotions','pages','page_blocks','site_articles','calculator_settings','inventory_import_batches','inventory_import_rows','inventory_count_audits','catalog_inventory_links','sale_payments','inventory_reservation_audits','cash_sessions','cash_session_movements','sale_returns','sale_return_lines','production_orders','production_order_events','production_material_targets','central_quotes','central_quote_events','internal_change_log','inventory_import_review_events','suppliers','purchase_orders','purchase_order_lines','purchase_receipts','purchase_receipt_lines','parked_pos_orders','inventory_locations'
    )
    group by c.table_name
  loop
    v_module := app_private.visualcorp_module_for_table(r.table_name);
    if v_module is null then continue; end if;
    if r.table_name='access_profile_permissions' then
      execute 'drop policy if exists access_profile_permissions_read on public.access_profile_permissions';
      execute 'create policy access_profile_permissions_read on public.access_profile_permissions for select to authenticated using (exists (select 1 from public.access_profiles p where p.id=profile_id and app_private.has_visualcorp_access(p.organization_id,''team'',''view'')))';
      continue;
    end if;
    if r.table_name='organizations' then
      v_org_expr := 'id';
    elsif r.table_name='public_requests' then
      v_org_expr := '(select id from public.organizations where slug=''visual-corp'' limit 1)';
    else
      v_org_expr := 'organization_id';
    end if;
    if r.has_branch_id then v_branch_expr := 'branch_id'; else v_branch_expr := 'null::uuid'; end if;
    v_write_action := case when r.table_name in ('purchase_receipts','purchase_receipt_lines') then 'receive_purchase' else 'edit' end;
    v_select_expr := format('app_private.has_visualcorp_access(%s,%L,''view'',%s)',v_org_expr,v_module,v_branch_expr);
    v_edit_expr := format('app_private.has_visualcorp_access(%s,%L,%L,%s)',v_org_expr,v_module,v_write_action,v_branch_expr);
    if r.table_name='organizations' then v_select_expr := 'app_private.has_org_role(id)'; end if;
    if r.table_name='branches' then v_select_expr := 'app_private.has_org_role(organization_id,id)'; end if;
    if r.table_name='site_settings' then v_select_expr := 'true'; end if;
    if r.table_name in ('catalog_products','website_product_overrides') then
      v_select_expr := format('(%s or (is_published and exists (select 1 from public.organizations org where org.id=%s and org.slug=''visual-corp'')))',v_select_expr,v_org_expr);
    elsif r.table_name in ('pages','services','site_articles') then
      v_select_expr := format('(%s or is_published)',v_select_expr);
    elsif r.table_name='promotions' then
      v_select_expr := format('(%s or active)',v_select_expr);
    elsif r.table_name='page_blocks' then
      v_select_expr := format('(%s or (is_visible and exists (select 1 from public.pages parent where parent.id=page_id and parent.organization_id=%s and parent.is_published)))',v_select_expr,v_org_expr);
    end if;
    if r.table_name in ('inventory_item_costs','inventory_item_cost_history') then
      v_select_expr := v_select_expr || format(' and app_private.has_visualcorp_access(%s,''inventory_costs'',''view_costs'',%s)',v_org_expr,v_branch_expr);
      v_edit_expr := v_edit_expr || format(' and app_private.has_visualcorp_access(%s,''inventory_costs'',''edit_costs'',%s)',v_org_expr,v_branch_expr);
    end if;
    execute format('alter table public.%I enable row level security',r.table_name);
    execute format('drop policy if exists vc_access_select on public.%I',r.table_name);
    execute format('drop policy if exists vc_access_insert on public.%I',r.table_name);
    execute format('drop policy if exists vc_access_update on public.%I',r.table_name);
    execute format('drop policy if exists vc_access_delete on public.%I',r.table_name);
    if r.table_name='organization_memberships' then
      execute format('create policy vc_access_select on public.%I as restrictive for select to authenticated using (user_id=(select auth.uid()) or app_private.has_visualcorp_access(organization_id,''team'',''view'',branch_id))',r.table_name);
    else
      execute format('create policy vc_access_select on public.%I as restrictive for select to authenticated using (%s)',r.table_name,v_select_expr);
    end if;
    execute format('create policy vc_access_insert on public.%I as restrictive for insert to authenticated with check (%s)',r.table_name,v_edit_expr);
    execute format('create policy vc_access_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',r.table_name,v_edit_expr,v_edit_expr);
    execute format('create policy vc_access_delete on public.%I as restrictive for delete to authenticated using (app_private.has_visualcorp_access(%s,%L,''delete_records'',%s))',r.table_name,v_org_expr,v_module,v_branch_expr);
    if r.table_name not in ('organizations','branches','organization_memberships','access_profiles','access_profile_permissions','access_audit_log') then
      execute format('drop policy if exists vc_access_member on public.%I',r.table_name);
      execute format('create policy vc_access_member on public.%I for all to authenticated using ((%s) or (%s) or app_private.has_visualcorp_access(%s,%L,''delete_records'',%s)) with check (%s)',
        r.table_name,v_select_expr,v_edit_expr,v_org_expr,v_module,v_branch_expr,v_edit_expr);
    end if;
    if (r.has_org_id or r.table_name='public_requests') and r.table_name not in ('access_profiles','access_profile_permissions','access_audit_log','organization_memberships') then
      execute format('drop trigger if exists vc_access_write_guard on public.%I',r.table_name);
      execute format('create trigger vc_access_write_guard before insert or update or delete on public.%I for each row execute function app_private.visualcorp_guard_write()',r.table_name);
    end if;
  end loop;
end;
$$;

-- public_requests is a global lead inbox without organization_id. Replace its
-- legacy-role policies while keeping anonymous public-form inserts intact.
drop policy if exists public_requests_staff_read on public.public_requests;
drop policy if exists public_requests_staff_update on public.public_requests;
create policy public_requests_staff_read on public.public_requests for select to authenticated
  using (app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp' limit 1),'crm','view'));
create policy public_requests_staff_update on public.public_requests for update to authenticated
  using (app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp' limit 1),'crm','edit'))
  with check (app_private.has_visualcorp_access((select id from public.organizations where slug='visual-corp' limit 1),'crm','edit'));

create or replace function public.get_my_visualcorp_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_user uuid := auth.uid();
  v_roles jsonb;
  v_permissions jsonb;
begin
  if v_user is null then raise exception 'Inicia sesión para consultar el acceso.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null then return jsonb_build_object('organization_id',null,'roles','[]'::jsonb,'permissions','{}'::jsonb); end if;

  select coalesce(jsonb_agg(distinct jsonb_build_object('key',p.profile_key,'name',p.name,'role',m.role)), '[]'::jsonb)
  into v_roles
  from public.organization_memberships m
  join public.access_profiles p on p.id=coalesce(m.profile_id,(select legacy.id from public.access_profiles legacy where legacy.organization_id=m.organization_id and legacy.profile_key=case m.role when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else m.role end limit 1))
  where m.organization_id=v_org and m.user_id=v_user and m.active and p.active;

  select coalesce(jsonb_object_agg(module_key, permissions), '{}'::jsonb)
  into v_permissions
  from (
    select permission.module_key,
      jsonb_object_agg(permission.action_key,permission.enabled) as permissions
    from public.organization_memberships m
  join public.access_profiles p on p.id=coalesce(m.profile_id,(select legacy.id from public.access_profiles legacy where legacy.organization_id=m.organization_id and legacy.profile_key=case m.role when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else m.role end limit 1))
    join public.access_profile_permissions permission on permission.profile_id=p.id and permission.enabled
    where m.organization_id=v_org and m.user_id=v_user and m.active and p.active
    group by permission.module_key
  ) granted;

  if exists (select 1 from public.organization_memberships m where m.organization_id=v_org and m.user_id=v_user and m.active and m.role='owner') then
    select coalesce(jsonb_object_agg(module_key,jsonb_build_object('view',true,'edit',true)), '{}'::jsonb)
      into v_permissions from (values ('dashboard'),('website'),('crm'),('sales'),('quotes'),('inventory'),('inventory_costs'),('purchases'),('workshop'),('marketing'),('team'),('catalog_admin'),('backup'),('cash')) modules(module_key);
  end if;
  return jsonb_build_object('organization_id',v_org,'roles',v_roles,'permissions',v_permissions);
end;
$$;
revoke all on function public.get_my_visualcorp_access() from public, anon;
grant execute on function public.get_my_visualcorp_access() to authenticated;

create or replace function public.save_visualcorp_access_profile(
  p_profile_id uuid, p_key text, p_name text, p_description text, p_permissions jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_profile public.access_profiles%rowtype;
  v_key text;
  v_item jsonb;
  v_module text;
  v_action text;
  v_enabled boolean;
  v_owner boolean;
begin
  if v_actor is null then raise exception 'Inicia sesión para configurar perfiles.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  v_owner := app_private.has_org_role(v_org,null,array['owner']);
  if not v_owner and not app_private.has_visualcorp_access(v_org,'team','manage_profiles') then raise exception 'No tienes permiso para configurar perfiles.' using errcode='42501'; end if;
  if jsonb_typeof(p_permissions) <> 'array' then raise exception 'La matriz de permisos no tiene un formato válido.'; end if;
  v_key := coalesce(nullif(trim(p_key),''),trim(both '_' from regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+','_','g')));
  if v_key !~ '^[a-z0-9_]{2,48}$' or length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'El nombre o identificador del perfil no es válido.'; end if;
  if p_profile_id is not null then
    select * into v_profile from public.access_profiles where id=p_profile_id and organization_id=v_org for update;
    if not found or v_profile.profile_key='owner' then raise exception 'El perfil de propietario está reservado.' using errcode='42501'; end if;
    if v_profile.profile_key <> v_key then raise exception 'El identificador de un perfil existente no se puede cambiar.'; end if;
    update public.access_profiles set name=trim(p_name), description=coalesce(p_description,''), updated_at=now()
      where id=p_profile_id;
  else
    if v_key in ('owner','admin','website_admin') then raise exception 'Ese identificador está reservado.' using errcode='42501'; end if;
    if not v_owner and v_key in ('gerencia','coordinador_ventas') then raise exception 'Solo el propietario puede crear perfiles con base de coordinación administrativa.' using errcode='42501'; end if;
    insert into public.access_profiles (organization_id,profile_key,name,description,base_role,is_system,created_by)
    values (v_org,v_key,trim(p_name),coalesce(p_description,''),'manager',false,v_actor)
    returning * into v_profile;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_permissions) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'module_key','') not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash')
      or coalesce(item->>'action_key','') not in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash')
      or jsonb_typeof(item->'enabled') <> 'boolean'
  ) then raise exception 'La matriz contiene un permiso no reconocido.'; end if;
  if exists (select module_key,action_key from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) group by module_key,action_key having count(*)>1) then raise exception 'No repitas permisos en la matriz.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where action_key='manage_owner' and enabled) then raise exception 'La propiedad no se puede asignar desde la matriz.' using errcode='42501'; end if;

  for v_item in select value from jsonb_array_elements(p_permissions)
  loop
    v_module := v_item->>'module_key'; v_action := v_item->>'action_key'; v_enabled := (v_item->>'enabled')::boolean;
    if v_enabled and not v_owner and not app_private.has_visualcorp_access(v_org,v_module,v_action) then
      raise exception 'No puedes conceder el permiso %.%.',v_module,v_action using errcode='42501';
    end if;
    if v_action='edit' and v_enabled and not coalesce((select x.enabled from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where x.module_key=v_module and x.action_key='view'),false) then
      raise exception 'Editar requiere también permiso para ver el módulo %.',v_module;
    end if;
  end loop;
  delete from public.access_profile_permissions where profile_id=v_profile.id;
  insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
  select v_profile.id,x.module_key,x.action_key,x.enabled from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean);
  insert into public.access_audit_log(organization_id,actor_user_id,profile_id,event_key,details)
  values(v_org,v_actor,v_profile.id,case when p_profile_id is null then 'profile_created' else 'profile_updated' end,jsonb_build_object('profile_key',v_profile.profile_key,'name',trim(p_name)));
  return v_profile.id;
end;
$$;
revoke all on function public.save_visualcorp_access_profile(uuid,text,text,text,jsonb) from public, anon;
grant execute on function public.save_visualcorp_access_profile(uuid,text,text,text,jsonb) to authenticated;

create or replace function public.assign_visualcorp_profile(p_email text,p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_user uuid;
  v_profile public.access_profiles%rowtype;
  v_owner boolean;
begin
  if v_actor is null then raise exception 'Inicia sesión para asignar un perfil.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  v_owner := app_private.has_org_role(v_org,null,array['owner']);
  if not v_owner and not app_private.has_visualcorp_access(v_org,'team','manage_members') then raise exception 'No tienes permiso para asignar perfiles.' using errcode='42501'; end if;
  select * into v_profile from public.access_profiles where id=p_profile_id and organization_id=v_org and active;
  if not found or v_profile.profile_key='owner' then raise exception 'El perfil no existe o no se puede asignar.'; end if;
  if v_profile.base_role in ('admin','website_admin') and not v_owner then raise exception 'Solo el propietario puede asignar perfiles administrativos.' using errcode='42501'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'Ese correo todavía no ha iniciado sesión en Visual Corp.'; end if;
  insert into public.organization_memberships(organization_id,user_id,role,active,profile_id)
  values(v_org,v_user,v_profile.base_role,true,v_profile.id)
  on conflict (organization_id,user_id,profile_id) where branch_id is null and profile_id is not null
  do update set role=excluded.role,active=true;
  insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,profile_id,event_key,details)
  values(v_org,v_actor,v_user,v_profile.id,'profile_assigned',jsonb_build_object('profile_key',v_profile.profile_key));
end;
$$;
revoke all on function public.assign_visualcorp_profile(text,uuid) from public, anon;
grant execute on function public.assign_visualcorp_profile(text,uuid) to authenticated;

create or replace function public.set_visualcorp_profile_active(p_profile_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_profile public.access_profiles%rowtype;
  v_owner boolean;
begin
  if v_actor is null then raise exception 'Inicia sesión para cambiar perfiles.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  v_owner := app_private.has_org_role(v_org,null,array['owner']);
  if not v_owner and not app_private.has_visualcorp_access(v_org,'team','manage_profiles') then raise exception 'No tienes permiso para cambiar perfiles.' using errcode='42501'; end if;
  select * into v_profile from public.access_profiles where id=p_profile_id and organization_id=v_org for update;
  if not found or v_profile.profile_key='owner' then raise exception 'El perfil de propietario está protegido.' using errcode='42501'; end if;
  if not v_owner and v_profile.profile_key in ('admin','website_admin') then raise exception 'Solo el propietario puede cambiar ese perfil.' using errcode='42501'; end if;
  if not p_active and exists (select 1 from public.organization_memberships m where m.profile_id=p_profile_id and m.active) then
    raise exception 'Reasigna las cuentas antes de desactivar este perfil.' using errcode='42501';
  end if;
  if not p_active and v_profile.profile_key='admin' and not exists (
    select 1 from public.organization_memberships m join public.access_profiles p on p.id=m.profile_id
    where m.organization_id=v_org and m.active and p.active and p.profile_key='admin' and p.id<>p_profile_id
  ) then raise exception 'Debe quedar al menos un perfil Admin activo.' using errcode='42501'; end if;
  update public.access_profiles set active=p_active,updated_at=now() where id=p_profile_id;
  insert into public.access_audit_log(organization_id,actor_user_id,profile_id,event_key,details)
  values(v_org,v_actor,p_profile_id,case when p_active then 'profile_activated' else 'profile_deactivated' end,jsonb_build_object('profile_key',v_profile.profile_key));
end;
$$;
revoke all on function public.set_visualcorp_profile_active(uuid,boolean) from public, anon;
grant execute on function public.set_visualcorp_profile_active(uuid,boolean) to authenticated;

create or replace function public.set_visualcorp_membership_active(p_membership_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_membership public.organization_memberships%rowtype;
  v_org uuid;
  v_actor uuid := auth.uid();
  v_owner boolean;
begin
  if v_actor is null then raise exception 'Inicia sesión para cambiar accesos.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  v_owner := app_private.has_org_role(v_org,null,array['owner']);
  if not v_owner and not app_private.has_visualcorp_access(v_org,'team','manage_members') then raise exception 'No tienes permiso para cambiar accesos.' using errcode='42501'; end if;
  select * into v_membership from public.organization_memberships where id=p_membership_id and organization_id=v_org for update;
  if not found or v_membership.role='owner' then raise exception 'El acceso de propietario está protegido.' using errcode='42501'; end if;
  if not p_active and v_membership.role='admin' and (select count(*) from public.organization_memberships where organization_id=v_org and role='admin' and active)>1 is false then
    raise exception 'No se puede desactivar al último perfil Admin activo.' using errcode='42501';
  end if;
  update public.organization_memberships set active=p_active where id=p_membership_id;
  insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,profile_id,event_key,details)
  values(v_org,v_actor,v_membership.user_id,v_membership.profile_id,case when p_active then 'membership_activated' else 'membership_deactivated' end,jsonb_build_object('membership_id',p_membership_id,'role',v_membership.role));
end;
$$;
revoke all on function public.set_visualcorp_membership_active(uuid,boolean) from public, anon;
grant execute on function public.set_visualcorp_membership_active(uuid,boolean) to authenticated;

-- Preserve the old assignment API, but ensure every assignment points to an
-- editable template and keep the privileged website profile owner-only.
create or replace function public.assign_visualcorp_role(p_email text,p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_profile uuid;
  v_key text;
begin
  if p_role='owner' or p_role not in ('admin','manager','advisor','warehouse','production','marketing','website_admin') then
    raise exception 'El perfil solicitado no está permitido.' using errcode='42501';
  end if;
  if p_role='admin' and not app_private.has_org_role((select id from public.organizations where slug='visual-corp'),null,array['owner']) then
    raise exception 'Solo el propietario puede asignar el perfil Admin.' using errcode='42501';
  end if;
  if p_role='website_admin' and not app_private.has_org_role((select id from public.organizations where slug='visual-corp'),null,array['owner']) then
    raise exception 'Solo el propietario puede asignar administración de la página web.' using errcode='42501';
  end if;
  v_key := case p_role when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else p_role end;
  select id into v_profile from public.access_profiles where organization_id=(select id from public.organizations where slug='visual-corp') and profile_key=v_key and active;
  if v_profile is null then raise exception 'No se encontró la plantilla del perfil.'; end if;
  perform public.assign_visualcorp_profile(p_email,v_profile);
end;
$$;
revoke all on function public.assign_visualcorp_role(text,text) from public, anon;
grant execute on function public.assign_visualcorp_role(text,text) to authenticated;

create policy access_profiles_read on public.access_profiles for select to authenticated
  using (app_private.has_visualcorp_access(organization_id,'team','view'));
create policy access_audit_log_read on public.access_audit_log for select to authenticated
  using (app_private.has_visualcorp_access(organization_id,'team','manage_members') or app_private.has_visualcorp_access(organization_id,'team','manage_profiles'));
