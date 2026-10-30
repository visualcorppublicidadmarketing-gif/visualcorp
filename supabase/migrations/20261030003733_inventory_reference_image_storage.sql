-- Reference photos belong to the operational inventory catalog and stay private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inventory-reference-images', 'inventory-reference-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy inventory_reference_images_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'inventory-reference-images'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid, 'inventory', 'view', null)
  );

create policy inventory_reference_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inventory-reference-images'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid, 'inventory', 'edit', null)
  );

create policy inventory_reference_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inventory-reference-images'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and app_private.has_visualcorp_access((storage.foldername(name))[1]::uuid, 'inventory', 'edit', null)
  );
