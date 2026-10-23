-- Keep branch, parent and creator lookups efficient for the location registry.
create index if not exists inventory_locations_branch_fk_idx
  on public.inventory_locations (branch_id, organization_id);

create index if not exists inventory_locations_parent_fk_idx
  on public.inventory_locations (parent_id, organization_id, branch_id);

create index if not exists inventory_locations_created_by_fk_idx
  on public.inventory_locations (created_by);
