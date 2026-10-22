-- Keep staff read access while separating write policies to avoid overlapping SELECT rules.
drop policy if exists catalog_inventory_links_admin_write on public.catalog_inventory_links;
drop policy if exists catalog_inventory_links_staff_read on public.catalog_inventory_links;

create policy catalog_inventory_links_staff_read on public.catalog_inventory_links
  for select to authenticated using (app_private.has_org_role(organization_id, branch_id));
create policy catalog_inventory_links_admin_insert on public.catalog_inventory_links
  for insert to authenticated with check (
    app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse'])
  );
create policy catalog_inventory_links_admin_update on public.catalog_inventory_links
  for update to authenticated using (
    app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse'])
  ) with check (
    app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','warehouse'])
  );
