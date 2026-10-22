create index if not exists inventory_import_review_events_import_row_fk_idx
  on public.inventory_import_review_events (import_row_id);
create index if not exists inventory_import_review_events_previous_item_fk_idx
  on public.inventory_import_review_events (previous_item_id);
create index if not exists inventory_import_review_events_new_item_fk_idx
  on public.inventory_import_review_events (new_item_id);
create index if not exists inventory_import_review_events_previous_variant_fk_idx
  on public.inventory_import_review_events (previous_variant_id);
create index if not exists inventory_import_review_events_new_variant_fk_idx
  on public.inventory_import_review_events (new_variant_id);
create index if not exists inventory_import_review_events_reviewer_fk_idx
  on public.inventory_import_review_events (reviewed_by);
