-- Configurable retention for images uploaded into the private Marketing bucket.
-- Local Visual Corp references and imported inventory rows stay outside this policy.

alter table public.marketing_assets
  add column if not exists retention_enabled boolean not null default false,
  add column if not exists retention_months smallint not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketing_assets'::regclass
      and conname = 'marketing_assets_retention_months_check'
  ) then
    alter table public.marketing_assets
      add constraint marketing_assets_retention_months_check
      check (retention_months between 1 and 120);
  end if;
end $$;

create index if not exists marketing_assets_retention_due_idx
  on public.marketing_assets (updated_at, organization_id)
  where retention_enabled
    and storage_status = 'supabase_storage'
    and source_system = 'visualcorp-suite';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- When the project has the two non-secret Vault values provisioned, run the
-- daily sweep at 05:00 Ecuador time (10:00 UTC). Local resets without Vault
-- setup retain the schema change and skip scheduling safely.
do $$
begin
  if to_regclass('vault.decrypted_secrets') is not null
    and exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'publishable_key') then
    if exists (select 1 from cron.job where jobname = 'marketing-assets-retention-daily') then
      perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'marketing-assets-retention-daily';
    end if;

    perform cron.schedule(
      'marketing-assets-retention-daily',
      '0 10 * * *',
      $job$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
            || '/functions/v1/marketing-asset-retention',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
          ),
          body := '{}'::jsonb
        ) as request_id;
      $job$
    );
  end if;
end $$;
