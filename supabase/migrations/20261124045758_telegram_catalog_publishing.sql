-- Product masters stay in a private bucket; Telegram sends are auditable and
-- authorized against the existing Visual Corp access profiles.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-product-editables',
  'catalog-product-editables',
  false,
  47185920,
  array[
    'application/octet-stream',
    'application/pdf',
    'application/postscript',
    'application/illustrator',
    'application/vnd.adobe.photoshop',
    'image/vnd.adobe.photoshop'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy catalog_product_editables_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'catalog-product-editables'
    and array_length(storage.foldername(name), 1) >= 2
    and (lower(name) like '%.ai' or lower(name) like '%.psd')
    and exists (
      select 1
      from public.catalog_products p
      where p.id = (storage.foldername(name))[2]
        and p.organization_id = ((storage.foldername(name))[1])::uuid
        and p.product_kind = 'standard_custom'
        and app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit')
    )
  );

create policy catalog_product_editables_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catalog-product-editables'
    and array_length(storage.foldername(name), 1) >= 2
    and (lower(name) like '%.ai' or lower(name) like '%.psd')
    and exists (
      select 1
      from public.catalog_products p
      where p.id = (storage.foldername(name))[2]
        and p.organization_id = ((storage.foldername(name))[1])::uuid
        and p.product_kind = 'standard_custom'
        and app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit')
    )
  );

create policy catalog_product_editables_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'catalog-product-editables'
    and exists (
      select 1
      from public.catalog_products p
      where p.id = (storage.foldername(name))[2]
        and p.organization_id = ((storage.foldername(name))[1])::uuid
        and p.product_kind = 'standard_custom'
        and app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit')
    )
  )
  with check (
    bucket_id = 'catalog-product-editables'
    and array_length(storage.foldername(name), 1) >= 2
    and (lower(name) like '%.ai' or lower(name) like '%.psd')
    and exists (
      select 1
      from public.catalog_products p
      where p.id = (storage.foldername(name))[2]
        and p.organization_id = ((storage.foldername(name))[1])::uuid
        and p.product_kind = 'standard_custom'
        and app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit')
    )
  );

create policy catalog_product_editables_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'catalog-product-editables'
    and exists (
      select 1
      from public.catalog_products p
      where p.id = (storage.foldername(name))[2]
        and p.organization_id = ((storage.foldername(name))[1])::uuid
        and p.product_kind = 'standard_custom'
        and app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit')
    )
  );

create table public.catalog_product_telegram_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id text not null,
  target text not null check (target in ('public', 'internal')),
  status text not null check (status in ('sending', 'published', 'partial', 'failed', 'unknown')),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  message_link text,
  error_message text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_product_telegram_product_fk
    foreign key (product_id, organization_id)
    references public.catalog_products(id, organization_id) on delete cascade,
  constraint catalog_product_telegram_content_uq unique (product_id, target, content_hash)
);

create index catalog_product_telegram_latest_idx
  on public.catalog_product_telegram_publications (organization_id, product_id, target, created_at desc);

alter table public.catalog_product_telegram_publications enable row level security;
revoke all on public.catalog_product_telegram_publications from anon, authenticated;
grant select on public.catalog_product_telegram_publications to authenticated;
grant select, insert, update, delete on public.catalog_product_telegram_publications to service_role;

create policy catalog_product_telegram_publications_read on public.catalog_product_telegram_publications
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'catalog_admin', 'view')
    and exists (
      select 1 from public.catalog_products p
      where p.id = product_id
        and p.organization_id = catalog_product_telegram_publications.organization_id
        and p.product_kind = 'standard_custom'
    )
  );

create or replace function public.can_publish_catalog_product_to_telegram(
  p_product_id text,
  p_target text
)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select coalesce(bool_or(
    app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'view')
    and case p_target
      when 'public' then p.is_published
        and app_private.has_visualcorp_access(p.organization_id, 'website', 'publish_content')
      when 'internal' then
        app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit')
        and app_private.has_visualcorp_access(p.organization_id, 'catalog_admin', 'edit_prices')
      else false
    end
  ), false)
  from public.catalog_products p
  where p.id = p_product_id
    and p.product_kind = 'standard_custom';
$$;

revoke all on function public.can_publish_catalog_product_to_telegram(text, text) from public, anon;
grant execute on function public.can_publish_catalog_product_to_telegram(text, text) to authenticated;
