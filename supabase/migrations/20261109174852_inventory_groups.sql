-- Collections classify inventory fichas only. They do not own stock or movements.
create table if not exists public.inventory_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  icon_key text not null default 'package' check (icon_key in ('package','sparkles','tree','pumpkin','paintbrush','shield','box')),
  color_key text not null default 'violet' check (color_key in ('violet','emerald','amber','rose','sky','slate')),
  show_in_main boolean not null default false,
  display_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index if not exists inventory_groups_org_name_active_idx
  on public.inventory_groups (organization_id, lower(name))
  where archived_at is null;
create index if not exists inventory_groups_org_order_idx
  on public.inventory_groups (organization_id, display_order, name)
  where archived_at is null;

alter table public.inventory_items
  add column if not exists inventory_group_id uuid;

alter table public.inventory_items
  add constraint inventory_items_group_org_fk
  foreign key (inventory_group_id, organization_id)
  references public.inventory_groups (id, organization_id)
  on delete restrict;

create index if not exists inventory_items_org_group_idx
  on public.inventory_items (organization_id, inventory_group_id, id)
  where active;

alter table public.inventory_groups enable row level security;
grant select, insert, update on public.inventory_groups to authenticated;
grant all on public.inventory_groups to service_role;

create policy inventory_groups_read on public.inventory_groups
  for select to authenticated
  using (app_private.has_org_role(organization_id));
create policy inventory_groups_add on public.inventory_groups
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production'])
  );
create policy inventory_groups_update on public.inventory_groups
  for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager','warehouse','production']));
