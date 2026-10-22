create index if not exists catalog_inventory_links_branch_org_idx
  on public.catalog_inventory_links(branch_id, organization_id);
create index if not exists catalog_inventory_links_catalog_product_idx
  on public.catalog_inventory_links(catalog_product_id);
create index if not exists catalog_inventory_links_variant_org_idx
  on public.catalog_inventory_links(inventory_variant_id, organization_id);
create index if not exists catalog_inventory_links_created_by_idx
  on public.catalog_inventory_links(created_by);
create index if not exists sale_payments_sale_org_idx
  on public.sale_payments(sale_id, organization_id);
create index if not exists sale_payments_created_by_idx
  on public.sale_payments(created_by);
