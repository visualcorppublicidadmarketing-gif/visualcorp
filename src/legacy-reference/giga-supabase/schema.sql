-- Gigaprint: esquema inicial para reemplazar localStorage cuando compartas credenciales.
create extension if not exists "pgcrypto";

create table if not exists public.site_settings (
  id text primary key default 'main',
  brand text not null default 'Gigaprint', slogan text not null default 'Tus ideas en grande',
  phone text, email text, address text, whatsapp text, hero_kicker text, hero_title text, hero_text text,
  theme_preset text not null default 'default', theme_presets jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings add column if not exists theme_preset text not null default 'default';
alter table public.site_settings add column if not exists theme_presets jsonb not null default '[]'::jsonb;
create table if not exists public.services (
  id text primary key, name text not null, short text, detail text, icon text, image text, tag text, sort_order int not null default 0, is_published boolean not null default true
);
create table if not exists public.products (
  id text primary key, name text not null, category text not null, type text not null default 'unit', calc_type text not null default 'unit', pricing_mode text not null default 'unit', price numeric(12,4) not null default 0, unit text, image text, description text, specs jsonb not null default '[]'::jsonb, price_scales jsonb not null default '[]'::jsonb, variant_options jsonb not null default '[]'::jsonb, price_matrix jsonb not null default '{}'::jsonb, colors jsonb not null default '[]'::jsonb, sizes jsonb not null default '[]'::jsonb, min_quantity numeric(12,2) not null default 1, quantity_step numeric(12,2) not null default 1, source text not null default 'manual', featured boolean not null default false, is_published boolean not null default true, sort_order int not null default 0
);

-- Campos de catálogo inteligente. Son seguros para ejecutar sobre instalaciones existentes.
alter table public.products add column if not exists calc_type text not null default 'unit';
alter table public.products add column if not exists pricing_mode text not null default 'unit';
alter table public.products add column if not exists price_scales jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists variant_options jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists price_matrix jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists colors jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists sizes jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists min_quantity numeric(12,2) not null default 1;
alter table public.products add column if not exists quantity_step numeric(12,2) not null default 1;
alter table public.products add column if not exists source text not null default 'manual';
alter table public.products add column if not exists subcategory text;
alter table public.products add column if not exists price_inst numeric(12,4);
alter table public.products add column if not exists price_corp numeric(12,4);
alter table public.products add column if not exists custom_options jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists color_variations jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists attributes jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists features jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists has_variants boolean not null default false;
create table if not exists public.promotions (
  id text primary key, title text not null, eyebrow text, description text, price numeric(12,2), old_price numeric(12,2), badge text, active boolean not null default true, sort_order int not null default 0
);
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(), name text not null, company text, email text not null, phone text, message text, status text not null default 'nuevo', created_at timestamptz not null default now()
);
create table if not exists public.pages (
  id text primary key, slug text unique not null, title text not null, intro text, is_published boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.page_blocks (
  id text primary key, page_id text not null references public.pages(id) on delete cascade, block_type text not null, content jsonb not null default '{}'::jsonb, sort_order int not null default 0, is_visible boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(), path text not null, public_url text, mime_type text, bytes bigint, width int, height int, optimized_format text, alt_text text, created_at timestamptz not null default now()
);
create table if not exists public.service_questions (
  id text primary key, service_id text references public.services(id) on delete cascade, label text not null, question_key text not null, field_type text not null, options jsonb not null default '[]'::jsonb, required boolean not null default false, help text, sort_order int not null default 0
);
create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(), form_key text not null, answers jsonb not null default '{}'::jsonb, files jsonb not null default '[]'::jsonb, status text not null default 'nuevo', created_at timestamptz not null default now()
);
create table if not exists public.design_tokens (
  token_key text primary key, token_value text not null, format text, sort_order int not null default 0
);

alter table public.site_settings enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.promotions enable row level security;
alter table public.inquiries enable row level security;
alter table public.pages enable row level security;
alter table public.page_blocks enable row level security;
alter table public.media_assets enable row level security;
alter table public.service_questions enable row level security;
alter table public.form_submissions enable row level security;
alter table public.design_tokens enable row level security;
create policy "public can read settings" on public.site_settings for select using (true);
create policy "public can read services" on public.services for select using (is_published = true);
create policy "public can read products" on public.products for select using (is_published = true);
create policy "public can read promotions" on public.promotions for select using (active = true);
create policy "public can create inquiries" on public.inquiries for insert with check (true);
create policy "public can read pages" on public.pages for select using (is_published = true);
create policy "public can read published blocks" on public.page_blocks for select using (is_visible = true);
create policy "public can read media metadata" on public.media_assets for select using (true);
create policy "public can read questions" on public.service_questions for select using (true);
create policy "public can create form submissions" on public.form_submissions for insert with check (true);
create policy "public can read design tokens" on public.design_tokens for select using (true);
-- Las políticas de escritura de admin deben agregarse después de configurar Supabase Auth.
