-- Visual Corp core: inventory ledger, branch transfers, customers, POS and public requests.
-- Empty schema only. No browser/localStorage business data is imported by this migration.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id uuid,
  code text not null,
  name text not null,
  active boolean not null default true,
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (parent_id, organization_id) references public.areas(id, organization_id) on delete restrict
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid,
  role text not null check (role in ('owner','admin','manager','advisor','warehouse','production','marketing')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id, role, branch_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);

create or replace function app_private.has_org_role(p_org uuid, p_branch uuid default null, p_roles text[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.active
      and (p_branch is null or m.branch_id is null or m.branch_id = p_branch)
      and (p_roles is null or m.role = any(p_roles))
  );
$$;
revoke all on function app_private.has_org_role(uuid, uuid, text[]) from public, anon;
grant execute on function app_private.has_org_role(uuid, uuid, text[]) to authenticated;

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id uuid,
  code text not null,
  name text not null,
  active boolean not null default true,
  unique (organization_id, code),
  unique (id, organization_id),
  foreign key (parent_id, organization_id) references public.inventory_categories(id, organization_id) on delete restrict
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category_id uuid,
  area_id uuid,
  sku text not null,
  name text not null,
  description text not null default '',
  base_unit text not null default 'unidad',
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (id, organization_id),
  foreign key (category_id, organization_id) references public.inventory_categories(id, organization_id) on delete restrict,
  foreign key (area_id, organization_id) references public.areas(id, organization_id) on delete restrict
);

create table public.inventory_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  item_id uuid not null,
  sku text not null,
  label text not null default '',
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  active boolean not null default true,
  unique (organization_id, sku),
  unique (id, organization_id),
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict
);

create table public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_id uuid not null,
  branch_id uuid not null,
  location_code text not null default 'MAIN',
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (organization_id, variant_id, branch_id, location_code),
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict,
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);
create index inventory_stock_branch_idx on public.inventory_stock (organization_id, branch_id, variant_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_id uuid not null,
  branch_id uuid not null,
  location_code text not null default 'MAIN',
  movement_type text not null check (movement_type in ('receipt','adjustment','consumption','sale','return','waste','transfer_out','transfer_in')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  reason text not null default '',
  reference_type text,
  reference_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict,
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);
create index inventory_movements_history_idx on public.inventory_movements (organization_id, branch_id, created_at desc);
create index inventory_movements_variant_idx on public.inventory_movements (organization_id, variant_id, created_at desc);

create or replace function app_private.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_stock (organization_id, variant_id, branch_id, location_code, quantity, updated_at)
  values (new.organization_id, new.variant_id, new.branch_id, new.location_code, new.quantity_delta, now())
  on conflict (organization_id, variant_id, branch_id, location_code)
  do update set quantity = public.inventory_stock.quantity + excluded.quantity, updated_at = now();
  return new;
end;
$$;
revoke all on function app_private.apply_inventory_movement() from public, anon, authenticated;
create trigger inventory_movement_updates_stock
  after insert on public.inventory_movements
  for each row execute function app_private.apply_inventory_movement();

create table public.inventory_item_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  variant_id uuid not null,
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  supplier_name text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, variant_id),
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict
);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  transfer_code text not null,
  from_branch_id uuid not null,
  to_branch_id uuid not null,
  status text not null default 'requested' check (status in ('requested','approved','dispatched','received','rejected','cancelled')),
  note text not null default '',
  requested_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  dispatched_by uuid references auth.users(id) on delete set null,
  received_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  unique (organization_id, transfer_code),
  unique (id, organization_id),
  check (from_branch_id <> to_branch_id),
  foreign key (from_branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  foreign key (to_branch_id, organization_id) references public.branches(id, organization_id) on delete restrict
);

create table public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  transfer_id uuid not null,
  variant_id uuid not null,
  requested_quantity numeric(14,3) not null check (requested_quantity > 0),
  dispatched_quantity numeric(14,3) not null default 0 check (dispatched_quantity >= 0),
  received_quantity numeric(14,3) not null default 0 check (received_quantity >= 0),
  note text not null default '',
  check (received_quantity <= dispatched_quantity),
  foreign key (transfer_id, organization_id) references public.stock_transfers(id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null,
  phone text not null default '',
  email text not null default '',
  document_reference text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index customers_search_idx on public.customers (organization_id, full_name);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  customer_id uuid,
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  urgent_backorder boolean not null default false,
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete restrict
);

create table public.sale_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  sale_id uuid not null,
  variant_id uuid,
  sku_snapshot text not null default '',
  description_snapshot text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  fulfilled_quantity numeric(14,3) not null default 0 check (fulfilled_quantity >= 0),
  backordered_quantity numeric(14,3) not null default 0 check (backordered_quantity >= 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  check (fulfilled_quantity + backordered_quantity = quantity),
  foreign key (sale_id, organization_id) references public.sales(id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict
);

create table public.public_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('contact','quote')),
  name text not null check (char_length(name) between 1 and 160),
  phone text not null default '' check (char_length(phone) <= 50),
  email text not null default '' check (char_length(email) <= 254),
  service text not null default '' check (char_length(service) <= 160),
  message text not null default '' check (char_length(message) <= 4000),
  quote_data jsonb not null default '{}'::jsonb check (jsonb_typeof(quote_data) = 'object' and octet_length(quote_data::text) <= 20000),
  status text not null default 'new' check (status in ('new','contacted','quoted','won','lost','closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_requests_inbox_idx on public.public_requests (status, created_at desc);

-- Stock is a ledger: clients cannot edit balances directly. Triggered movements are atomic;
-- a negative balance violates inventory_stock.quantity >= 0 and rolls the movement back.
-- The verified Visual Corp account is bootstrapped as owner after email confirmation.
create or replace function app_private.handle_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''))
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  if new.email_confirmed_at is not null and lower(coalesce(new.email,'')) = 'visualcorp.publicidad.marketing@gmail.com' then
    select id into v_org from public.organizations where slug = 'visual-corp';
    if v_org is not null then
      insert into public.organization_memberships (organization_id, user_id, role)
      values (v_org, new.id, 'owner') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.handle_auth_user() from public, anon, authenticated;
create trigger visualcorp_auth_user_profile
  after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
  for each row execute function app_private.handle_auth_user();

insert into public.organizations (slug, name) values ('visual-corp', 'Visual Corp')
on conflict (slug) do update set name = excluded.name;
insert into public.branches (organization_id, code, name)
select id, v.code, v.name from public.organizations o
cross join (values ('VIS','Visual Corp'),('GIGA','Gigaprint')) as v(code,name)
where o.slug = 'visual-corp' on conflict (organization_id, code) do nothing;
insert into public.areas (organization_id, code, name)
select id, v.code, v.name from public.organizations o
cross join (values ('IMP','Impresión'),('SUB','Sublimación'),('TRO','Troquelado'),('LAS','Láser'),('TAL','Taller'),('NEO','Neones'),('BOD','Bodega general')) as v(code,name)
where o.slug = 'visual-corp' on conflict (organization_id, code) do nothing;

-- RLS is enabled on every exposed table. Costs live separately from ordinary stock reads.
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.areas enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_variants enable row level security;
alter table public.inventory_stock enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_item_costs enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_lines enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.public_requests enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.organizations, public.branches, public.areas, public.organization_memberships,
  public.inventory_categories, public.inventory_items, public.inventory_variants, public.inventory_stock,
  public.inventory_movements, public.inventory_item_costs, public.stock_transfers, public.stock_transfer_lines,
  public.customers, public.sales, public.sale_lines, public.public_requests to authenticated;
grant select, update on public.profiles to authenticated;
grant insert, update on public.branches, public.areas, public.organization_memberships,
  public.inventory_categories, public.inventory_items, public.inventory_variants,
  public.inventory_item_costs, public.stock_transfers, public.stock_transfer_lines,
  public.customers, public.sales, public.sale_lines, public.public_requests to authenticated;
grant insert on public.inventory_movements to authenticated;
grant insert (request_type,name,phone,email,service,message,quote_data) on public.public_requests to anon;

create policy organizations_read on public.organizations for select to authenticated using (app_private.has_org_role(id));
create policy profiles_self_read on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy branches_read on public.branches for select to authenticated using (app_private.has_org_role(organization_id, id));
create policy branches_manage on public.branches for all to authenticated using (app_private.has_org_role(organization_id, id, array['owner','admin','manager'])) with check (app_private.has_org_role(organization_id, id, array['owner','admin','manager']));
create policy areas_read on public.areas for select to authenticated using (app_private.has_org_role(organization_id));
create policy areas_manage on public.areas for all to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy memberships_read on public.organization_memberships for select to authenticated using (user_id = (select auth.uid()) or app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager']));
create policy memberships_manage on public.organization_memberships for insert to authenticated with check (app_private.has_org_role(organization_id, branch_id, array['owner','admin']));
create policy memberships_update on public.organization_memberships for update to authenticated using (app_private.has_org_role(organization_id, branch_id, array['owner','admin'])) with check (app_private.has_org_role(organization_id, branch_id, array['owner','admin']));
create policy categories_read on public.inventory_categories for select to authenticated using (app_private.has_org_role(organization_id));
create policy categories_manage on public.inventory_categories for all to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse']));
create policy items_read on public.inventory_items for select to authenticated using (app_private.has_org_role(organization_id));
create policy items_manage on public.inventory_items for all to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']));
create policy variants_read on public.inventory_variants for select to authenticated using (app_private.has_org_role(organization_id));
create policy variants_manage on public.inventory_variants for all to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']));
create policy stock_read on public.inventory_stock for select to authenticated using (app_private.has_org_role(organization_id, branch_id));
create policy movements_read on public.inventory_movements for select to authenticated using (app_private.has_org_role(organization_id, branch_id));
create policy movements_add on public.inventory_movements for insert to authenticated with check (created_by = (select auth.uid()) and app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse','production','advisor']));
create policy costs_read on public.inventory_item_costs for select to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy costs_add on public.inventory_item_costs for insert to authenticated with check (updated_by = (select auth.uid()) and app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy costs_update on public.inventory_item_costs for update to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager'])) with check (updated_by = (select auth.uid()) and app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy transfers_read on public.stock_transfers for select to authenticated using (app_private.has_org_role(organization_id, from_branch_id) or app_private.has_org_role(organization_id, to_branch_id));
create policy transfers_add on public.stock_transfers for insert to authenticated with check (requested_by = (select auth.uid()) and app_private.has_org_role(organization_id, from_branch_id, array['owner','admin','manager','warehouse','advisor']));
create policy transfers_update on public.stock_transfers for update to authenticated using (app_private.has_org_role(organization_id, from_branch_id, array['owner','admin','manager','warehouse']) or app_private.has_org_role(organization_id, to_branch_id, array['owner','admin','manager','warehouse'])) with check (app_private.has_org_role(organization_id, from_branch_id, array['owner','admin','manager','warehouse']) or app_private.has_org_role(organization_id, to_branch_id, array['owner','admin','manager','warehouse']));
create policy transfer_lines_read on public.stock_transfer_lines for select to authenticated using (app_private.has_org_role(organization_id));
create policy transfer_lines_manage on public.stock_transfer_lines for all to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','advisor'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','advisor']));
create policy customers_read on public.customers for select to authenticated using (app_private.has_org_role(organization_id));
create policy customers_add on public.customers for insert to authenticated with check (created_by = (select auth.uid()) and app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor']));
create policy customers_update on public.customers for update to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor']));
create policy sales_read on public.sales for select to authenticated using (app_private.has_org_role(organization_id, branch_id));
create policy sales_add on public.sales for insert to authenticated with check (created_by = (select auth.uid()) and app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','advisor']));
create policy sales_update on public.sales for update to authenticated using (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager'])) with check (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager']));
create policy sale_lines_read on public.sale_lines for select to authenticated using (app_private.has_org_role(organization_id));
create policy sale_lines_add on public.sale_lines for insert to authenticated with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor']));
create policy sale_lines_update on public.sale_lines for update to authenticated using (app_private.has_org_role(organization_id, null, array['owner','admin','manager'])) with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy public_requests_anon_add on public.public_requests for insert to anon with check (status = 'new' and assigned_to is null and created_by is null);
create policy public_requests_staff_read on public.public_requests for select to authenticated using (exists (select 1 from public.organizations o where o.slug = 'visual-corp' and app_private.has_org_role(o.id, null, array['owner','admin','manager','advisor'])));
create policy public_requests_staff_update on public.public_requests for update to authenticated using (exists (select 1 from public.organizations o where o.slug = 'visual-corp' and app_private.has_org_role(o.id, null, array['owner','admin','manager','advisor']))) with check (exists (select 1 from public.organizations o where o.slug = 'visual-corp' and app_private.has_org_role(o.id, null, array['owner','admin','manager','advisor'])));


