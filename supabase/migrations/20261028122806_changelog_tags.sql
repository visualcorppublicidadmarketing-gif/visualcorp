alter table public.internal_change_log
  add column tags text[] not null default '{}'::text[];

alter table public.internal_change_log
  add constraint internal_change_log_tags_limit
  check (cardinality(tags) <= 8 and array_position(tags, null) is null);
