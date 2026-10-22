-- Cotizador Gigaprint: catálogo enriquecido, configuración y solicitudes persistentes.
-- Compatible con el catálogo importado desde G:\CODE\Esteban Nicola.

alter table public.products
  add column if not exists subcategory text,
  add column if not exists price_inst numeric(12,4),
  add column if not exists price_corp numeric(12,4),
  add column if not exists custom_options jsonb not null default '{}'::jsonb,
  add column if not exists color_variations jsonb not null default '[]'::jsonb,
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists has_variants boolean not null default false;

alter table public.products
  alter column price type numeric(12,4) using price::numeric(12,4);

create table if not exists public.calculator_settings (
  id text primary key default 'default',
  tax_rate numeric(5,2) not null default 15 check (tax_rate >= 0 and tax_rate <= 100),
  min_dimension_cm numeric(10,2) not null default 1 check (min_dimension_cm > 0),
  max_dimension_cm numeric(10,2) not null default 5000 check (max_dimension_cm > min_dimension_cm),
  design_adaptation_price numeric(12,4) not null default 5 check (design_adaptation_price >= 0),
  design_from_scratch_price numeric(12,4) not null default 15 check (design_from_scratch_price >= 0),
  eyelet_small_price numeric(12,4) not null default 0.30 check (eyelet_small_price >= 0),
  eyelet_large_price numeric(12,4) not null default 0.50 check (eyelet_large_price >= 0),
  disclaimer text not null default 'Los valores son referenciales y pueden variar según acabados, instalación y condiciones del proyecto.',
  updated_at timestamptz not null default now()
);

insert into public.calculator_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique default ('GIGA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_company text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,4) not null default 0,
  tax_rate numeric(5,2) not null default 15,
  tax_amount numeric(12,4) not null default 0,
  total numeric(12,4) not null default 0,
  notes text,
  status text not null default 'nuevo' check (status in ('nuevo', 'contactado', 'en_produccion', 'completado', 'cancelado')),
  source text not null default 'cotizador',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_requests_created_at_idx on public.quote_requests (created_at desc);
create index if not exists quote_requests_status_idx on public.quote_requests (status);

alter table public.calculator_settings enable row level security;
alter table public.quote_requests enable row level security;

drop policy if exists "public can read calculator settings" on public.calculator_settings;
create policy "public can read calculator settings" on public.calculator_settings
  for select using (true);

drop policy if exists "admins manage calculator settings" on public.calculator_settings;
create policy "admins manage calculator settings" on public.calculator_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public can create quote requests" on public.quote_requests;
create policy "public can create quote requests" on public.quote_requests
  for insert to anon, authenticated with check (true);

drop policy if exists "admins read quote requests" on public.quote_requests;
create policy "admins read quote requests" on public.quote_requests
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update quote requests" on public.quote_requests;
create policy "admins update quote requests" on public.quote_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete quote requests" on public.quote_requests;
create policy "admins delete quote requests" on public.quote_requests
  for delete to authenticated using (public.is_admin());

create or replace function public.touch_calculator_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists calculator_settings_updated_at on public.calculator_settings;
create trigger calculator_settings_updated_at before update on public.calculator_settings
for each row execute function public.touch_calculator_updated_at();

drop trigger if exists quote_requests_updated_at on public.quote_requests;
create trigger quote_requests_updated_at before update on public.quote_requests
for each row execute function public.touch_calculator_updated_at();
