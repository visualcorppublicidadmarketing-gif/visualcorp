-- Index user references so user deletion can set the nullable foreign keys to
-- NULL without scanning every campaign or activity row.
create index if not exists marketing_campaigns_created_by_idx
  on public.marketing_campaigns(created_by);
create index if not exists marketing_campaigns_updated_by_idx
  on public.marketing_campaigns(updated_by);
create index if not exists marketing_campaign_items_created_by_idx
  on public.marketing_campaign_items(created_by);
create index if not exists marketing_campaign_items_updated_by_idx
  on public.marketing_campaign_items(updated_by);
create index if not exists marketing_campaign_events_actor_idx
  on public.marketing_campaign_events(actor_id);
