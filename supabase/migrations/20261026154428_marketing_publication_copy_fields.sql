-- Add structured creative brief fields to each marketing publication.
-- Existing records receive empty defaults and retain their current content.
alter table public.marketing_posts
  add column if not exists objective text not null default '' check (char_length(objective) <= 500),
  add column if not exists audience text not null default '' check (char_length(audience) <= 500),
  add column if not exists offer text not null default '' check (char_length(offer) <= 1200),
  add column if not exists call_in text not null default '' check (char_length(call_in) <= 1200),
  add column if not exists callout text not null default '' check (char_length(callout) <= 1200),
  add column if not exists cta text not null default '' check (char_length(cta) <= 500),
  add column if not exists cta_destination text not null default '' check (char_length(cta_destination) <= 300),
  add column if not exists hashtags text not null default '' check (char_length(hashtags) <= 1200),
  add column if not exists visual_direction text not null default '' check (char_length(visual_direction) <= 1500);

comment on column public.marketing_posts.call_in is 'Opening hook / call-in for the publication copy.';
comment on column public.marketing_posts.callout is 'Supporting call-out: confirmed benefit, proof point, or detail.';
comment on column public.marketing_posts.cta is 'Text of the call to action.';
comment on column public.marketing_posts.cta_destination is 'Destination channel for the call to action; no contact data is inferred.';
