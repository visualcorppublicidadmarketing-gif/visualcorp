-- Per-advisor product favorites. This is intentionally separate from
-- catalog_products.is_featured, which controls the public storefront.
create unique index if not exists catalog_products_id_organization_uq
  on public.catalog_products (id, organization_id);

create table public.advisor_product_favorites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  advisor_id uuid not null references auth.users(id) on delete cascade,
  catalog_product_id text not null,
  created_at timestamptz not null default now(),
  constraint advisor_product_favorites_product_org_fk
    foreign key (catalog_product_id, organization_id)
    references public.catalog_products(id, organization_id) on delete cascade,
  constraint advisor_product_favorites_unique
    unique (organization_id, advisor_id, catalog_product_id)
);

create index advisor_product_favorites_advisor_idx
  on public.advisor_product_favorites (organization_id, advisor_id);

alter table public.advisor_product_favorites enable row level security;
revoke all on public.advisor_product_favorites from public, anon, authenticated;
grant select, insert, delete on public.advisor_product_favorites to authenticated;

create policy advisor_product_favorites_read_own
  on public.advisor_product_favorites for select to authenticated
  using (
    advisor_id = (select auth.uid())
    and app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor'])
  );

create policy advisor_product_favorites_add_own
  on public.advisor_product_favorites for insert to authenticated
  with check (
    advisor_id = (select auth.uid())
    and app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor'])
  );

create policy advisor_product_favorites_remove_own
  on public.advisor_product_favorites for delete to authenticated
  using (
    advisor_id = (select auth.uid())
    and app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor'])
  );
