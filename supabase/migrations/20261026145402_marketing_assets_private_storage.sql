-- Private, organization-scoped storage for the Marketing resource library.
-- Object paths start with the organization UUID so Storage RLS can reuse the
-- same Visual Corp module permissions as marketing_assets.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketing-assets', 'marketing-assets', false, 52428800, null)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy marketing_assets_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'marketing-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid, 'marketing', 'view')
    else false
  end
);

create policy marketing_assets_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketing-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid, 'marketing', 'edit')
    else false
  end
);

create policy marketing_assets_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketing-assets'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid, 'marketing', 'delete_records')
    else false
  end
);
