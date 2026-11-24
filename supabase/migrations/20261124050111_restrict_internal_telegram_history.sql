-- Internal channel links and publication states are visible only to catalog
-- editors who can also manage the prices shared there.
drop policy if exists catalog_product_telegram_publications_read
  on public.catalog_product_telegram_publications;

create policy catalog_product_telegram_publications_read
  on public.catalog_product_telegram_publications
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'catalog_admin', 'view')
    and (
      target = 'public'
      or (
        target = 'internal'
        and app_private.has_visualcorp_access(organization_id, 'catalog_admin', 'edit')
        and app_private.has_visualcorp_access(organization_id, 'catalog_admin', 'edit_prices')
      )
    )
    and exists (
      select 1 from public.catalog_products p
      where p.id = product_id
        and p.organization_id = catalog_product_telegram_publications.organization_id
        and p.product_kind = 'standard_custom'
    )
  );
