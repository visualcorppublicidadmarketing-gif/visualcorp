-- Separate public website administration from operational pricing and inventory.
alter table public.organization_memberships
  drop constraint if exists organization_memberships_role_check;
alter table public.organization_memberships
  add constraint organization_memberships_role_check
  check (role in ('owner','admin','manager','advisor','warehouse','production','marketing','website_admin'));

create unique index if not exists organization_memberships_global_role_uq
  on public.organization_memberships (organization_id, user_id, role)
  where branch_id is null;

create table public.catalog_products (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  slug text not null,
  description text not null default '',
  product_type text not null default 'unit',
  category_id text,
  subcategory_id text,
  subcategory text,
  calc_type text not null default 'unit',
  price numeric(14,4) not null default 0 check (price >= 0),
  price_inst numeric(14,4),
  price_corp numeric(14,4),
  price_scales jsonb not null default '[]'::jsonb check (jsonb_typeof(price_scales) = 'array'),
  custom_options jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_options) = 'object'),
  currency text not null default 'USD',
  is_featured boolean not null default false,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  margin_type text,
  margin_value numeric(14,4),
  image_url text,
  images jsonb not null default '[]'::jsonb check (jsonb_typeof(images) = 'array'),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
create index catalog_products_published_sort_idx
  on public.catalog_products (is_published, sort_order);
create index catalog_products_search_idx
  on public.catalog_products using gin (to_tsvector('simple', name || ' ' || description));
alter table public.catalog_products enable row level security;
grant select, insert, update on public.catalog_products to authenticated;
create policy catalog_products_staff_read on public.catalog_products
  for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor']));
create policy catalog_products_admin_write on public.catalog_products
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));

create table public.website_product_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_id text not null references public.catalog_products(id) on delete cascade,
  display_name text,
  display_description text,
  display_category text,
  display_image_url text,
  display_images jsonb check (display_images is null or jsonb_typeof(display_images) = 'array'),
  display_features jsonb check (display_features is null or jsonb_typeof(display_features) = 'array'),
  is_published boolean not null default true,
  sort_order integer,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id)
);
alter table public.website_product_overrides enable row level security;
grant select, insert, update on public.website_product_overrides to authenticated;
create policy website_product_overrides_admin_read on public.website_product_overrides
  for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']));
create policy website_product_overrides_admin_write on public.website_product_overrides
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']) and (updated_by is null or updated_by = (select auth.uid())));

create view public.public_catalog_products with (security_barrier = true) as
  select p.id,
    coalesce(o.display_name, p.name) as name,
    p.slug,
    coalesce(o.display_description, p.description) as description,
    p.product_type as type,
    p.category_id,
    p.subcategory_id,
    coalesce(o.display_category, p.subcategory, p.category_id) as category,
    p.calc_type,
    p.currency,
    p.is_featured as featured,
    p.is_published,
    coalesce(o.sort_order, p.sort_order) as sort_order,
    coalesce(o.display_image_url, p.image_url) as image,
    coalesce(o.display_images, p.images) as images,
    coalesce(o.display_features, p.features) as features
  from public.catalog_products p
  left join public.website_product_overrides o
    on o.organization_id = p.organization_id and o.product_id = p.id
  where p.is_published and coalesce(o.is_published, true);
grant select on public.public_catalog_products to anon, authenticated;

create table public.site_settings (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  brand text not null default 'Visual Corp',
  slogan text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  whatsapp text not null default '',
  quote_whatsapp_routes jsonb not null default '[]'::jsonb,
  quote_message_intro text not null default '',
  quote_message_closing text not null default '',
  hero_kicker text not null default '',
  hero_title text not null default '',
  hero_text text not null default '',
  theme_preset text not null default 'default',
  theme_presets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
grant select, insert, update on public.site_settings to anon, authenticated;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);
create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']));

create table public.services (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  short text not null default '',
  detail text not null default '',
  icon text not null default '',
  image text,
  tag text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.services enable row level security;
grant select, insert, update on public.services to anon, authenticated;
create policy services_public_read on public.services
  for select to anon, authenticated using (is_published);
create policy services_admin_write on public.services
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']));

create table public.promotions (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  eyebrow text not null default '',
  description text not null default '',
  price numeric(14,2),
  old_price numeric(14,2),
  badge text not null default '',
  active boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.promotions enable row level security;
grant select, insert, update on public.promotions to anon, authenticated;
create policy promotions_public_read on public.promotions
  for select to anon, authenticated using (active);
create policy promotions_admin_write on public.promotions
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']));

create table public.pages (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  parent_id text references public.pages(id) on delete set null,
  slug text not null,
  title text not null,
  intro text not null default '',
  page_type text not null default 'page',
  seo jsonb not null default '{}'::jsonb check (jsonb_typeof(seo) = 'object'),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
alter table public.pages enable row level security;
grant select, insert, update on public.pages to anon, authenticated;
create policy pages_public_read on public.pages
  for select to anon, authenticated using (is_published);
create policy pages_admin_write on public.pages
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']));

create table public.page_blocks (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  page_id text not null references public.pages(id) on delete cascade,
  block_type text not null,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.page_blocks enable row level security;
grant select, insert, update on public.page_blocks to anon, authenticated;
create policy page_blocks_public_read on public.page_blocks
  for select to anon, authenticated
  using (is_visible and exists (select 1 from public.pages p where p.id = page_id and p.organization_id = organization_id and p.is_published));
create policy page_blocks_admin_write on public.page_blocks
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']));

create table public.site_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  title text not null,
  slug text not null,
  excerpt text not null default '',
  body_markdown text not null default '',
  cover_image text,
  tags text[] not null default '{}',
  is_published boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
alter table public.site_articles enable row level security;
grant select, insert, update on public.site_articles to anon, authenticated;
create policy site_articles_public_read on public.site_articles
  for select to anon, authenticated using (is_published);
create policy site_articles_admin_write on public.site_articles
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','website_admin']))
  with check (app_private.has_org_role(organization_id, null, array['owner','website_admin']) and (created_by is null or created_by = (select auth.uid())));

create table public.calculator_settings (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  tax_rate numeric(7,4) not null default 15,
  min_dimension_cm numeric(14,4) not null default 1,
  max_dimension_cm numeric(14,4) not null default 5000,
  design_adaptation_price numeric(14,2) not null default 5,
  design_from_scratch_price numeric(14,2) not null default 15,
  eyelet_small_price numeric(14,4) not null default 0.3,
  eyelet_large_price numeric(14,4) not null default 0.5,
  disclaimer text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.calculator_settings enable row level security;
grant select, insert, update on public.calculator_settings to authenticated;
create policy calculator_settings_staff_read on public.calculator_settings
  for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor']));
create policy calculator_settings_admin_write on public.calculator_settings
  for all to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));

create table public.inventory_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  source_file text not null,
  source_sha256 text not null,
  source_uri text not null default '',
  row_count integer not null default 0 check (row_count >= 0),
  import_status text not null default 'pending_review' check (import_status in ('pending_review','reviewed','applied','rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, branch_id, source_sha256)
);
create table public.inventory_import_rows (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  batch_id uuid not null references public.inventory_import_batches(id) on delete cascade,
  source_sheet text not null,
  source_row integer not null check (source_row > 0),
  source_reference text not null default '',
  raw_row jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_row) = 'object'),
  candidate jsonb not null default '{}'::jsonb check (jsonb_typeof(candidate) = 'object'),
  mapping_status text not null default 'pending_review' check (mapping_status in ('pending_review','mapped','imported','ignored')),
  normalized_item_id uuid references public.inventory_items(id) on delete set null,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  unique (batch_id, source_sheet, source_row)
);
create index inventory_import_rows_review_idx
  on public.inventory_import_rows (organization_id, mapping_status, source_sheet, source_row);
alter table public.inventory_import_batches enable row level security;
alter table public.inventory_import_rows enable row level security;
grant select, update on public.inventory_import_batches to authenticated;
grant select, insert, update on public.inventory_import_rows to authenticated;
create policy inventory_import_batches_staff_read on public.inventory_import_batches
  for select to authenticated
  using (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse']));
create policy inventory_import_batches_admin_update on public.inventory_import_batches
  for update to authenticated
  using (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse']))
  with check (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse']));
create policy inventory_import_rows_staff_read on public.inventory_import_rows
  for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse']));
create policy inventory_import_rows_admin_update on public.inventory_import_rows
  for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse']));

drop policy if exists costs_read on public.inventory_item_costs;
drop policy if exists costs_add on public.inventory_item_costs;
drop policy if exists costs_update on public.inventory_item_costs;
create policy costs_read on public.inventory_item_costs for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy costs_add on public.inventory_item_costs for insert to authenticated
  with check (updated_by = (select auth.uid()) and app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy costs_update on public.inventory_item_costs for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']))
  with check (updated_by = (select auth.uid()) and app_private.has_org_role(organization_id, null, array['owner','admin','manager']));

drop policy if exists public_requests_staff_read on public.public_requests;
drop policy if exists public_requests_staff_update on public.public_requests;
create policy public_requests_staff_read on public.public_requests for select to authenticated
  using (exists (select 1 from public.organizations o where o.slug = 'visual-corp'
    and app_private.has_org_role(o.id, null, array['owner','admin','manager','advisor','website_admin'])));
create policy public_requests_staff_update on public.public_requests for update to authenticated
  using (exists (select 1 from public.organizations o where o.slug = 'visual-corp'
    and app_private.has_org_role(o.id, null, array['owner','admin','manager','advisor','website_admin'])))
  with check (exists (select 1 from public.organizations o where o.slug = 'visual-corp'
    and app_private.has_org_role(o.id, null, array['owner','admin','manager','advisor','website_admin'])));

create or replace function app_private.bootstrap_visualcorp_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  if lower(coalesce(new.email, '')) = 'visualcorp.publicidad.marketing@gmail.com'
     and new.email_confirmed_at is not null then
    select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
    if v_org is not null then
      insert into public.profiles (user_id, full_name, email)
      values (new.id, 'Visual Corp Admin', new.email)
      on conflict (user_id) do update set email = excluded.email, updated_at = now();
      insert into public.organization_memberships (organization_id, user_id, role, active)
      values (v_org, new.id, 'owner', true)
      on conflict (organization_id, user_id, role) where branch_id is null do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.bootstrap_visualcorp_owner() from public, anon, authenticated;
drop trigger if exists visualcorp_owner_bootstrap on auth.users;
create trigger visualcorp_owner_bootstrap
  after insert or update on auth.users
  for each row execute function app_private.bootstrap_visualcorp_owner();
