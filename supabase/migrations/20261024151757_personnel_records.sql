-- Personnel records are separate from login memberships and app access profiles.
-- Salary entries are append-only and require explicit compensation permissions.
create table public.personnel_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (length(phone) <= 40),
  department text not null default '' check (length(department) <= 100),
  job_title text not null default '' check (length(job_title) <= 120),
  status text not null default 'active' check (status in ('active','inactive')),
  start_date date,
  end_date date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index personnel_records_org_status_name_idx on public.personnel_records (organization_id,status,full_name);
create index personnel_records_org_email_idx on public.personnel_records (organization_id,lower(email)) where email <> '';

create table public.personnel_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  personnel_id uuid not null,
  event_key text not null check (event_key in ('record_created','record_updated','compensation_changed')),
  summary text not null check (length(trim(summary)) between 3 and 220),
  changed_fields text[] not null default '{}',
  salary_sensitive boolean not null default false,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label text not null default 'Usuario del sistema' check (length(actor_label) <= 160),
  created_at timestamptz not null default now(),
  foreign key (personnel_id,organization_id) references public.personnel_records(id,organization_id) on delete restrict,
  check ((event_key='compensation_changed') = salary_sensitive)
);
create index personnel_events_personnel_created_idx on public.personnel_events (organization_id,personnel_id,created_at desc);

create table public.personnel_compensation_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  personnel_id uuid not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  pay_period text not null check (length(trim(pay_period)) between 2 and 40),
  effective_date date not null,
  note text not null default '' check (length(note) <= 500),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (personnel_id,organization_id) references public.personnel_records(id,organization_id) on delete restrict,
  unique (personnel_id,effective_date)
);
create index personnel_compensation_history_personnel_effective_idx on public.personnel_compensation_history (organization_id,personnel_id,effective_date desc);

alter table public.personnel_records enable row level security;
alter table public.personnel_events enable row level security;
alter table public.personnel_compensation_history enable row level security;
grant select,insert,update on public.personnel_records to authenticated;
grant select on public.personnel_events to authenticated;
grant select,insert on public.personnel_compensation_history to authenticated;
revoke delete on public.personnel_records,public.personnel_events,public.personnel_compensation_history from anon,authenticated;
revoke all on public.personnel_records,public.personnel_events,public.personnel_compensation_history from anon;

create or replace function app_private.set_personnel_record_actor()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión para guardar una ficha de personal.' using errcode='42501'; end if;
  if tg_op='INSERT' then
    new.created_by:=(select auth.uid());
    new.updated_by:=(select auth.uid());
  else
    new.created_by:=old.created_by;
    new.updated_by:=(select auth.uid());
    new.updated_at:=now();
  end if;
  return new;
end;
$$;
revoke all on function app_private.set_personnel_record_actor() from public,anon,authenticated;
create trigger personnel_records_set_actor before insert or update on public.personnel_records
  for each row execute function app_private.set_personnel_record_actor();

-- Keep a non-sensitive, append-only change timeline without copying old contact
-- values or salary into the general personnel history.
create or replace function app_private.log_personnel_record_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[] := '{}';
  v_actor_label text;
begin
  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Usuario del sistema')
    into v_actor_label from public.profiles p where p.user_id=(select auth.uid());
  if tg_op='UPDATE' then
    if new.full_name is distinct from old.full_name then v_fields:=array_append(v_fields,'full_name'); end if;
    if new.email is distinct from old.email then v_fields:=array_append(v_fields,'email'); end if;
    if new.phone is distinct from old.phone then v_fields:=array_append(v_fields,'phone'); end if;
    if new.department is distinct from old.department then v_fields:=array_append(v_fields,'department'); end if;
    if new.job_title is distinct from old.job_title then v_fields:=array_append(v_fields,'job_title'); end if;
    if new.status is distinct from old.status then v_fields:=array_append(v_fields,'status'); end if;
    if new.start_date is distinct from old.start_date then v_fields:=array_append(v_fields,'start_date'); end if;
    if new.end_date is distinct from old.end_date then v_fields:=array_append(v_fields,'end_date'); end if;
    if cardinality(v_fields)=0 then return new; end if;
  else
    v_fields:=array['full_name','department','job_title','status'];
  end if;
  insert into public.personnel_events(organization_id,personnel_id,event_key,summary,changed_fields,actor_user_id,actor_label)
  values(new.organization_id,new.id,case when tg_op='INSERT' then 'record_created' else 'record_updated' end,
    case when tg_op='INSERT' then 'Ficha de personal creada' else 'Ficha de personal actualizada' end,
    v_fields,(select auth.uid()),coalesce(v_actor_label,'Usuario del sistema'));
  return new;
end;
$$;
revoke all on function app_private.log_personnel_record_change() from public,anon,authenticated;
create trigger personnel_records_change_log after insert or update on public.personnel_records
  for each row execute function app_private.log_personnel_record_change();

create or replace function app_private.log_personnel_compensation_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor_label text;
begin
  if tg_op<>'INSERT' then raise exception 'El historial de remuneración no se modifica ni elimina; registra un nuevo cambio con su fecha efectiva.'; end if;
  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Usuario del sistema')
    into v_actor_label from public.profiles p where p.user_id=(select auth.uid());
  insert into public.personnel_events(organization_id,personnel_id,event_key,summary,changed_fields,salary_sensitive,actor_user_id,actor_label)
  values(new.organization_id,new.personnel_id,'compensation_changed','Cambio de remuneración registrado',array['compensation'],true,(select auth.uid()),coalesce(v_actor_label,'Usuario del sistema'));
  return new;
end;
$$;
revoke all on function app_private.log_personnel_compensation_change() from public,anon,authenticated;
create trigger personnel_compensation_change_log before insert or update or delete on public.personnel_compensation_history
  for each row execute function app_private.log_personnel_compensation_change();

-- Register personnel as a permission module. Compensation gets separate read
-- and write actions, so a personnel manager does not automatically see pay.
alter table public.access_profile_permissions drop constraint if exists access_profile_permissions_module_key_check;
alter table public.access_profile_permissions add constraint access_profile_permissions_module_key_check
  check (module_key in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel'));
alter table public.access_profile_permissions drop constraint if exists access_profile_permissions_action_key_check;
alter table public.access_profile_permissions add constraint access_profile_permissions_action_key_check
  check (action_key in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash','view_compensation','edit_compensation'));

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
    when 'personnel_records' then 'personnel' when 'personnel_events' then 'personnel' when 'personnel_compensation_history' then 'personnel'
    when 'internal_change_log' then 'dashboard'
    else null end;
$$;

-- Reapply the shared permission enforcement to the three newly created tables.
do $$
declare r record; v_module text; v_select_expr text; v_edit_expr text;
begin
  for r in select table_name from information_schema.tables where table_schema='public'
    and table_name in ('personnel_records','personnel_events','personnel_compensation_history')
  loop
    v_module:=app_private.visualcorp_module_for_table(r.table_name);
    v_select_expr:=format('app_private.has_visualcorp_access(organization_id,%L,''view'')',v_module);
    v_edit_expr:=format('app_private.has_visualcorp_access(organization_id,%L,''edit'')',v_module);
    execute format('drop policy if exists vc_access_select on public.%I',r.table_name);
    execute format('create policy vc_access_select on public.%I as restrictive for select to authenticated using (%s)',r.table_name,v_select_expr);
    execute format('drop policy if exists vc_access_insert on public.%I',r.table_name);
    execute format('create policy vc_access_insert on public.%I as restrictive for insert to authenticated with check (%s)',r.table_name,v_edit_expr);
    execute format('drop policy if exists vc_access_update on public.%I',r.table_name);
    execute format('create policy vc_access_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',r.table_name,v_edit_expr,v_edit_expr);
    execute format('drop policy if exists vc_access_delete on public.%I',r.table_name);
    execute format('create policy vc_access_delete on public.%I as restrictive for delete to authenticated using (app_private.has_visualcorp_access(organization_id,%L,''delete_records''))',r.table_name,v_module);
    execute format('drop policy if exists vc_access_member on public.%I',r.table_name);
    execute format('create policy vc_access_member on public.%I for all to authenticated using ((%s) or (%s) or app_private.has_visualcorp_access(organization_id,%L,''delete_records'')) with check (%s)',r.table_name,v_select_expr,v_edit_expr,v_module,v_edit_expr);
    execute format('drop trigger if exists vc_access_write_guard on public.%I',r.table_name);
    execute format('create trigger vc_access_write_guard before insert or update or delete on public.%I for each row execute function app_private.visualcorp_guard_write()',r.table_name);
  end loop;
end;
$$;

drop policy if exists personnel_compensation_sensitive_read on public.personnel_compensation_history;
create policy personnel_compensation_sensitive_read on public.personnel_compensation_history as restrictive
  for select to authenticated using (app_private.has_visualcorp_access(organization_id,'personnel','view_compensation'));
drop policy if exists personnel_compensation_sensitive_add on public.personnel_compensation_history;
create policy personnel_compensation_sensitive_add on public.personnel_compensation_history as restrictive
  for insert to authenticated with check (
    app_private.has_visualcorp_access(organization_id,'personnel','edit_compensation')
    and created_by=(select auth.uid())
  );

drop policy if exists personnel_events_compensation_read on public.personnel_events;
create policy personnel_events_compensation_read on public.personnel_events as restrictive
  for select to authenticated using (
    not salary_sensitive or app_private.has_visualcorp_access(organization_id,'personnel','view_compensation')
  );

create or replace function public.get_my_visualcorp_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_roles jsonb; v_permissions jsonb;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para consultar el acceso.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null then return jsonb_build_object('organization_id',null,'roles','[]'::jsonb,'permissions','{}'::jsonb); end if;
  select coalesce(jsonb_agg(distinct jsonb_build_object('key',p.profile_key,'name',p.name,'role',m.role)),'[]'::jsonb)
    into v_roles from public.organization_memberships m
    join public.access_profiles p on p.id=coalesce(m.profile_id,(select legacy.id from public.access_profiles legacy where legacy.organization_id=m.organization_id and legacy.profile_key=case m.role when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else m.role end limit 1))
    where m.organization_id=v_org and m.user_id=auth.uid() and m.active and p.active;
  select coalesce(jsonb_object_agg(module_key,permissions),'{}'::jsonb) into v_permissions from (
    select permission.module_key,jsonb_object_agg(permission.action_key,permission.enabled) permissions
    from public.organization_memberships m join public.access_profiles p on p.id=coalesce(m.profile_id,(select legacy.id from public.access_profiles legacy where legacy.organization_id=m.organization_id and legacy.profile_key=case m.role when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else m.role end limit 1))
    join public.access_profile_permissions permission on permission.profile_id=p.id and permission.enabled
    where m.organization_id=v_org and m.user_id=auth.uid() and m.active and p.active group by permission.module_key
  ) granted;
  if exists(select 1 from public.organization_memberships m where m.organization_id=v_org and m.user_id=auth.uid() and m.active and m.role='owner') then
    select v_permissions || jsonb_build_object('personnel',jsonb_build_object('view',true,'edit',true,'view_compensation',true,'edit_compensation',true)) into v_permissions;
    select v_permissions || coalesce(jsonb_object_agg(module_key,jsonb_build_object('view',true,'edit',true)),'{}'::jsonb)
      into v_permissions from (values ('dashboard'),('website'),('crm'),('sales'),('quotes'),('inventory'),('inventory_costs'),('purchases'),('workshop'),('marketing'),('team'),('catalog_admin'),('backup'),('cash')) modules(module_key);
  end if;
  return jsonb_build_object('organization_id',v_org,'roles',v_roles,'permissions',v_permissions);
end;
$$;
revoke all on function public.get_my_visualcorp_access() from public,anon;
grant execute on function public.get_my_visualcorp_access() to authenticated;

-- Extend the existing profile editor's allow-list and require compensation
-- permissions to be nested under personnel view/edit.
create or replace function public.save_visualcorp_access_profile(
  p_profile_id uuid,p_key text,p_name text,p_description text,p_permissions jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_profile public.access_profiles%rowtype; v_key text; v_item jsonb; v_module text; v_action text; v_enabled boolean; v_owner boolean;
begin
  if v_actor is null then raise exception 'Inicia sesión para configurar perfiles.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  v_owner:=app_private.has_org_role(v_org,null,array['owner']);
  if not v_owner and not app_private.has_visualcorp_access(v_org,'team','manage_profiles') then raise exception 'No tienes permiso para configurar perfiles.' using errcode='42501'; end if;
  if jsonb_typeof(p_permissions)<>'array' then raise exception 'La matriz de permisos no tiene un formato válido.'; end if;
  v_key:=coalesce(nullif(trim(p_key),''),trim(both '_' from regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+','_','g')));
  if v_key !~ '^[a-z0-9_]{2,48}$' or length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'El nombre o identificador del perfil no es válido.'; end if;
  if p_profile_id is not null then
    select * into v_profile from public.access_profiles where id=p_profile_id and organization_id=v_org for update;
    if not found or v_profile.profile_key='owner' then raise exception 'El perfil de propietario está reservado.' using errcode='42501'; end if;
    if v_profile.profile_key<>v_key then raise exception 'El identificador de un perfil existente no se puede cambiar.'; end if;
    update public.access_profiles set name=trim(p_name),description=coalesce(p_description,''),updated_at=now() where id=p_profile_id;
  else
    if v_key in ('owner','admin','website_admin') then raise exception 'Ese identificador está reservado.' using errcode='42501'; end if;
    if not v_owner and v_key in ('gerencia','coordinador_ventas') then raise exception 'Solo el propietario puede crear perfiles con base de coordinación administrativa.' using errcode='42501'; end if;
    insert into public.access_profiles(organization_id,profile_key,name,description,base_role,is_system,created_by) values(v_org,v_key,trim(p_name),coalesce(p_description,''),'manager',false,v_actor) returning * into v_profile;
  end if;
  if exists(select 1 from jsonb_array_elements(p_permissions) item where jsonb_typeof(item)<>'object'
    or coalesce(item->>'module_key','') not in ('dashboard','website','crm','sales','quotes','inventory','inventory_costs','purchases','workshop','marketing','team','catalog_admin','backup','cash','personnel')
    or coalesce(item->>'action_key','') not in ('view','edit','manage_members','manage_profiles','manage_owner','view_costs','edit_costs','edit_prices','approve_purchase','cancel_purchase','receive_purchase','settle_refund','publish_content','delete_records','manage_cash','view_compensation','edit_compensation')
    or jsonb_typeof(item->'enabled')<>'boolean') then raise exception 'La matriz contiene un permiso no reconocido.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean)
    where action_key in ('view_compensation','edit_compensation') and module_key<>'personnel')
    then raise exception 'Los permisos de remuneración pertenecen al módulo Personal.'; end if;
  if exists(select module_key,action_key from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) group by module_key,action_key having count(*)>1) then raise exception 'No repitas permisos en la matriz.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where action_key='manage_owner' and enabled) then raise exception 'La propiedad no se puede asignar desde la matriz.' using errcode='42501'; end if;
  if exists(select 1 from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where enabled and module_key='personnel' and action_key in ('view_compensation','edit_compensation')
    and not exists(select 1 from jsonb_to_recordset(p_permissions) as base(module_key text,action_key text,enabled boolean) where base.module_key='personnel' and base.action_key='view' and base.enabled))
    then raise exception 'Ver remuneraciones requiere acceso de lectura al módulo Personal.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where enabled and module_key='personnel' and action_key='edit_compensation'
    and not exists(select 1 from jsonb_to_recordset(p_permissions) as base(module_key text,action_key text,enabled boolean) where base.module_key='personnel' and base.action_key='edit' and base.enabled))
    then raise exception 'Editar remuneraciones requiere permiso para editar fichas de Personal.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where enabled and module_key='personnel' and action_key='edit_compensation'
    and not exists(select 1 from jsonb_to_recordset(p_permissions) as base(module_key text,action_key text,enabled boolean) where base.module_key='personnel' and base.action_key='view_compensation' and base.enabled))
    then raise exception 'Editar remuneraciones requiere también permiso para consultarlas.'; end if;
  for v_item in select value from jsonb_array_elements(p_permissions) loop
    v_module:=v_item->>'module_key'; v_action:=v_item->>'action_key'; v_enabled:=(v_item->>'enabled')::boolean;
    if v_enabled and not v_owner and not app_private.has_visualcorp_access(v_org,v_module,v_action) then raise exception 'No puedes conceder el permiso %.%.',v_module,v_action using errcode='42501'; end if;
    if v_action='edit' and v_enabled and not coalesce((select x.enabled from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean) where x.module_key=v_module and x.action_key='view'),false) then raise exception 'Editar requiere también permiso para ver el módulo %.',v_module; end if;
  end loop;
  delete from public.access_profile_permissions where profile_id=v_profile.id;
  insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
    select v_profile.id,x.module_key,x.action_key,x.enabled from jsonb_to_recordset(p_permissions) as x(module_key text,action_key text,enabled boolean);
  insert into public.access_audit_log(organization_id,actor_user_id,profile_id,event_key,details)
    values(v_org,v_actor,v_profile.id,case when p_profile_id is null then 'profile_created' else 'profile_updated' end,jsonb_build_object('profile_key',v_profile.profile_key,'name',trim(p_name)));
  return v_profile.id;
end;
$$;
revoke all on function public.save_visualcorp_access_profile(uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.save_visualcorp_access_profile(uuid,text,text,text,jsonb) to authenticated;
