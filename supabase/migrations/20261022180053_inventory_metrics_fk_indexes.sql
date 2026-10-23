-- Add covering indexes for inventory audit/import foreign keys identified by advisors.
create index if not exists inventory_cost_history_variant_fk_idx on public.inventory_item_cost_history (variant_id,organization_id);
create index if not exists inventory_cost_history_changed_by_idx on public.inventory_item_cost_history (changed_by);
create index if not exists inventory_reservation_audits_branch_fk_idx on public.inventory_reservation_audits (branch_id,organization_id);
create index if not exists inventory_reservation_audits_variant_fk_idx on public.inventory_reservation_audits (variant_id,organization_id);
create index if not exists inventory_reservation_audits_changed_by_idx on public.inventory_reservation_audits (changed_by);
create index if not exists inventory_count_audits_branch_fk_idx on public.inventory_count_audits (branch_id,organization_id);
create index if not exists inventory_count_audits_variant_fk_idx on public.inventory_count_audits (variant_id,organization_id);
create index if not exists inventory_count_audits_responsible_user_idx on public.inventory_count_audits (responsible_user_id);
create index if not exists inventory_import_batches_branch_idx on public.inventory_import_batches (branch_id);
create index if not exists inventory_import_batches_created_by_idx on public.inventory_import_batches (created_by);
create index if not exists inventory_import_rows_normalized_item_idx on public.inventory_import_rows (normalized_item_id);
