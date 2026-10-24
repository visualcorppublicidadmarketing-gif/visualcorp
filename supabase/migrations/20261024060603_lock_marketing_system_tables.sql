-- Audit events are written only by the database trigger, and import batches
-- are managed by the migration/import process rather than through the client.
revoke insert, update, delete, truncate, references, trigger
  on public.marketing_post_events, public.marketing_import_batches
  from public, anon, authenticated;
grant select on public.marketing_post_events, public.marketing_import_batches
  to authenticated;

