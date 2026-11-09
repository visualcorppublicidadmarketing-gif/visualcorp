-- Cover the child-side columns introduced by the purchasing workflow's
-- foreign keys. Existing queue indexes use organization-first ordering for
-- reads, so these indexes preserve their query shape while supporting FK checks.

create index if not exists purchase_orders_request_fk_idx
  on public.purchase_orders (purchase_request_id, organization_id)
  where purchase_request_id is not null;

create index if not exists purchase_requests_branch_fk_idx
  on public.purchase_requests (branch_id, organization_id);
create index if not exists purchase_requests_area_fk_idx
  on public.purchase_requests (area_id, organization_id);
create index if not exists purchase_requests_job_fk_idx
  on public.purchase_requests (production_job_id, organization_id)
  where production_job_id is not null;
create index if not exists purchase_requests_created_by_fk_idx
  on public.purchase_requests (created_by);
create index if not exists purchase_requests_resolved_by_fk_idx
  on public.purchase_requests (resolved_by)
  where resolved_by is not null;
create index if not exists purchase_requests_order_fk_idx
  on public.purchase_requests (purchase_order_id, organization_id)
  where purchase_order_id is not null;

create index if not exists purchase_request_lines_request_fk_idx
  on public.purchase_request_lines (request_id, organization_id);
create index if not exists purchase_request_lines_variant_fk_idx
  on public.purchase_request_lines (variant_id, organization_id);

create index if not exists purchase_request_events_request_fk_idx
  on public.purchase_request_events (request_id, organization_id);
create index if not exists purchase_request_events_actor_fk_idx
  on public.purchase_request_events (actor_id);

create index if not exists supplier_quotes_request_fk_idx
  on public.supplier_quotes (request_id, organization_id);
create index if not exists supplier_quotes_supplier_fk_idx
  on public.supplier_quotes (supplier_id, organization_id);
create index if not exists supplier_quotes_captured_by_fk_idx
  on public.supplier_quotes (captured_by);

create index if not exists supplier_quote_lines_quote_fk_idx
  on public.supplier_quote_lines (quote_id, organization_id);
create index if not exists supplier_quote_lines_request_line_fk_idx
  on public.supplier_quote_lines (request_line_id, organization_id);
