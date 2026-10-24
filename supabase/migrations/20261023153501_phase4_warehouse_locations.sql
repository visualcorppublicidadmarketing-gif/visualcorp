-- Phase 4: register warehouse locations without asserting physical stock.
create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  parent_id uuid,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,39}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  location_type text not null default 'storage'
    check (location_type in ('storage','receiving','production','dispatch','quarantine','other')),
  active boolean not null default true,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, branch_id, code),
  unique (id, organization_id, branch_id),
  foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete restrict,
  foreign key (parent_id, organization_id, branch_id)
    references public.inventory_locations(id, organization_id, branch_id) on delete restrict,
  check (parent_id is null or parent_id <> id)
);

create index inventory_locations_branch_active_idx
  on public.inventory_locations (organization_id, branch_id, active, name);
create unique index inventory_locations_one_system_main_idx
  on public.inventory_locations (organization_id, branch_id) where is_system;

alter table public.inventory_locations enable row level security;
revoke all on public.inventory_locations from public, anon;
grant select, insert, update on public.inventory_locations to authenticated;

create policy inventory_locations_read on public.inventory_locations
  for select to authenticated
  using (app_private.has_org_role(organization_id, branch_id,
    array['owner','admin','manager','advisor','warehouse','production']));

create policy inventory_locations_add on public.inventory_locations
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and not is_system
    and app_private.has_org_role(organization_id, branch_id,
      array['owner','admin','manager','warehouse'])
  );

create policy inventory_locations_update on public.inventory_locations
  for update to authenticated
  using (
    not is_system
    and app_private.has_org_role(organization_id, branch_id,
      array['owner','admin','manager','warehouse'])
  )
  with check (
    not is_system
    and app_private.has_org_role(organization_id, branch_id,
      array['owner','admin','manager','warehouse'])
  );

-- MAIN is a logical default location required by existing inventory workflows.
-- It creates no inventory_stock rows and must not be interpreted as a count.
insert into public.inventory_locations
  (organization_id, branch_id, code, name, location_type, is_system)
select b.organization_id, b.id, 'MAIN', 'Ubicación principal', 'storage', true
from public.branches b
where b.active
on conflict (organization_id, branch_id, code) do nothing;

create or replace function app_private.validate_inventory_location()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_branch uuid;
  v_code text;
begin
  if tg_table_name = 'purchase_receipt_lines' then
    select po.organization_id, po.branch_id, new.location_code
      into v_org, v_branch, v_code
    from public.purchase_receipts pr
    join public.purchase_orders po
      on po.id = pr.purchase_order_id and po.organization_id = pr.organization_id
    where pr.id = new.receipt_id and pr.organization_id = new.organization_id;
  else
    v_org := new.organization_id;
    v_branch := new.branch_id;
    v_code := new.location_code;
  end if;

  if v_org is null or v_branch is null or not exists (
    select 1 from public.inventory_locations l
    where l.organization_id = v_org
      and l.branch_id = v_branch
      and l.code = v_code
      and l.active
  ) then
    raise exception 'La ubicación % no está registrada como activa en esta sucursal.', coalesce(v_code, '(vacía)');
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_inventory_location() from public, anon, authenticated;

create trigger inventory_stock_location_check
  before insert or update of organization_id, branch_id, location_code
  on public.inventory_stock
  for each row execute function app_private.validate_inventory_location();

create trigger inventory_movements_location_check
  before insert or update of organization_id, branch_id, location_code
  on public.inventory_movements
  for each row execute function app_private.validate_inventory_location();

create trigger catalog_inventory_links_location_check
  before insert or update of organization_id, branch_id, location_code
  on public.catalog_inventory_links
  for each row execute function app_private.validate_inventory_location();

create trigger purchase_receipt_lines_location_check
  before insert or update of organization_id, receipt_id, location_code
  on public.purchase_receipt_lines
  for each row execute function app_private.validate_inventory_location();

