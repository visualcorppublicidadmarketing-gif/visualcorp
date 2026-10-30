-- Keep job ownership, branch scoping, and sales joins index-backed as queues grow.
create index if not exists production_jobs_advisor_fk_idx
  on public.production_jobs(advisor_id);
create index if not exists production_jobs_artwork_reviewed_by_idx
  on public.production_jobs(artwork_reviewed_by);
create index if not exists production_jobs_artwork_submitted_by_idx
  on public.production_jobs(artwork_submitted_by);
create index if not exists production_jobs_branch_org_idx
  on public.production_jobs(branch_id,organization_id);
create index if not exists production_jobs_created_by_idx
  on public.production_jobs(created_by);
create index if not exists production_jobs_sale_org_idx
  on public.production_jobs(sale_id,organization_id);
create index if not exists production_jobs_sale_line_org_idx
  on public.production_jobs(sale_line_id,organization_id);
