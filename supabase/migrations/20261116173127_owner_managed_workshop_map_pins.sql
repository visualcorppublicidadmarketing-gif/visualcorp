-- Persistent reference locations for the Workshop map.
-- GigaPrint starts at a public-directory plus code; both pins remain unverified
-- until the Visual Corp owner adjusts them in the map.
create table if not exists public.organization_map_pins (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pin_key text not null check (pin_key in ('visual-corp', 'gigaprint')),
  name text not null,
  address text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  is_verified boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, pin_key)
);

alter table public.organization_map_pins enable row level security;

revoke all on public.organization_map_pins from public, anon, authenticated;
grant select, insert, update on public.organization_map_pins to authenticated;

drop policy if exists organization_map_pins_read on public.organization_map_pins;
create policy organization_map_pins_read
  on public.organization_map_pins for select to authenticated
  using (app_private.has_org_role(organization_id));

drop policy if exists organization_map_pins_insert_owner on public.organization_map_pins;
create policy organization_map_pins_insert_owner
  on public.organization_map_pins for insert to authenticated
  with check (app_private.has_org_role(organization_id, null, array['owner']));

drop policy if exists organization_map_pins_update_owner on public.organization_map_pins;
create policy organization_map_pins_update_owner
  on public.organization_map_pins for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner']))
  with check (app_private.has_org_role(organization_id, null, array['owner']));

-- Default coordinates are references; only an owner drag marks a point verified.
insert into public.organization_map_pins (
  organization_id, pin_key, name, address, latitude, longitude, is_verified
)
select org.id, seed.pin_key, seed.name, seed.address, seed.latitude, seed.longitude, false
from public.organizations org
cross join (values
  (
    'visual-corp',
    'Visual Corp',
    'Av. Jaime Roldós y General Andrade, Milagro, Guayas',
    -2.135::double precision,
    -79.5925::double precision
  ),
  (
    'gigaprint',
    'GigaPrint',
    'Av. Las Américas y Loja 48, Av. Los Chirijos, Milagro, Guayas',
    -2.1337375::double precision,
    -79.596671875::double precision
  )
) as seed(pin_key, name, address, latitude, longitude)
where org.slug = 'visual-corp'
on conflict (organization_id, pin_key) do nothing;
