-- Cover the new foreign keys and the hot paths added by production handoffs.
create index if not exists production_job_step_checks_completed_by_idx
  on public.production_job_step_checks(completed_by);
create index if not exists production_job_step_checks_job_org_idx
  on public.production_job_step_checks(job_id,organization_id);
create index if not exists production_job_step_checks_org_idx
  on public.production_job_step_checks(organization_id);
create index if not exists production_job_step_checks_step_job_org_idx
  on public.production_job_step_checks(step_id,job_id,organization_id);

create index if not exists production_notifications_job_org_idx
  on public.production_notifications(job_id,organization_id);
create index if not exists production_notifications_org_idx
  on public.production_notifications(organization_id);
create index if not exists production_notifications_step_org_idx
  on public.production_notifications(step_id,organization_id);
create index if not exists production_notifications_unread_inbox_idx
  on public.production_notifications(recipient_user_id,created_at desc,id desc)
  where read_at is null;

create index if not exists production_job_steps_area_org_idx
  on public.production_job_steps(area_id,organization_id);
create index if not exists production_job_steps_assigned_to_idx
  on public.production_job_steps(assigned_to);
create index if not exists production_job_steps_job_org_idx
  on public.production_job_steps(job_id,organization_id);
create index if not exists production_job_steps_received_by_idx
  on public.production_job_steps(received_by);

create index if not exists production_jobs_fulfillment_by_idx
  on public.production_jobs(fulfillment_by);
create index if not exists production_jobs_quality_checked_by_idx
  on public.production_jobs(quality_checked_by);
create index if not exists production_jobs_org_workflow_idx
  on public.production_jobs(organization_id,workflow_code);
