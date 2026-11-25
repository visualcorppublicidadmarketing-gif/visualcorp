create table public.telegram_catalog_send_rate_limit (
  singleton boolean primary key default true check (singleton),
  next_send_at timestamptz not null default '-infinity'::timestamptz,
  last_send_started_at timestamptz,
  cooldown_until timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.telegram_catalog_send_rate_limit (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.telegram_catalog_send_rate_limit enable row level security;
revoke all on public.telegram_catalog_send_rate_limit from public, anon, authenticated, service_role;

create or replace function public.reserve_telegram_catalog_send_slot(p_max_wait_ms integer default 60000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz;
  v_next_send_at timestamptz;
  v_cooldown_until timestamptz;
  v_slot_at timestamptz;
  v_wait_ms bigint;
  v_max_wait_ms integer := greatest(0, least(coalesce(p_max_wait_ms, 60000), 120000));
begin
  select next_send_at, cooldown_until
    into v_next_send_at, v_cooldown_until
    from public.telegram_catalog_send_rate_limit
    where singleton = true
    for update;

  v_now := clock_timestamp();
  v_slot_at := greatest(v_now, v_next_send_at, v_cooldown_until);
  v_wait_ms := ceil(greatest(0, extract(epoch from (v_slot_at - v_now)) * 1000))::bigint;

  if v_wait_ms > v_max_wait_ms then
    return jsonb_build_object('reserved', false, 'wait_ms', v_wait_ms);
  end if;

  update public.telegram_catalog_send_rate_limit
    set next_send_at = v_slot_at + interval '3100 milliseconds',
        updated_at = v_now
    where singleton = true;

  return jsonb_build_object('reserved', true, 'slot_at', v_slot_at, 'wait_ms', v_wait_ms);
end;
$$;

create or replace function public.claim_telegram_catalog_send_slot(p_slot_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz;
  v_cooldown_until timestamptz;
  v_last_send_started_at timestamptz;
  v_allowed_at timestamptz;
  v_wait_ms bigint;
begin
  if p_slot_at is null then
    raise exception 'A reserved Telegram send slot is required.';
  end if;

  select cooldown_until, last_send_started_at
    into v_cooldown_until, v_last_send_started_at
    from public.telegram_catalog_send_rate_limit
    where singleton = true
    for update;

  v_now := clock_timestamp();
  v_allowed_at := greatest(
    p_slot_at,
    v_cooldown_until,
    coalesce(v_last_send_started_at + interval '3100 milliseconds', '-infinity'::timestamptz)
  );
  v_wait_ms := ceil(greatest(0, extract(epoch from (v_allowed_at - v_now)) * 1000))::bigint;

  if v_wait_ms > 0 then
    return jsonb_build_object('allowed', false, 'wait_ms', v_wait_ms);
  end if;

  update public.telegram_catalog_send_rate_limit
    set last_send_started_at = v_now,
        updated_at = v_now
    where singleton = true;

  return jsonb_build_object('allowed', true, 'wait_ms', 0);
end;
$$;

create or replace function public.defer_telegram_catalog_send(p_retry_after_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cooldown_until timestamptz;
  v_retry_after_seconds integer := greatest(1, least(coalesce(p_retry_after_seconds, 1), 604800));
begin
  update public.telegram_catalog_send_rate_limit
    set cooldown_until = greatest(
          cooldown_until,
          v_now + make_interval(secs => v_retry_after_seconds)
        ),
        next_send_at = greatest(
          next_send_at,
          cooldown_until,
          v_now + make_interval(secs => v_retry_after_seconds)
        ),
        updated_at = v_now
    where singleton = true
    returning cooldown_until into v_cooldown_until;

  return jsonb_build_object(
    'cooldown_until', v_cooldown_until,
    'retry_after_seconds', v_retry_after_seconds
  );
end;
$$;

revoke all on function public.reserve_telegram_catalog_send_slot(integer) from public, anon, authenticated;
revoke all on function public.claim_telegram_catalog_send_slot(timestamptz) from public, anon, authenticated;
revoke all on function public.defer_telegram_catalog_send(integer) from public, anon, authenticated;
grant execute on function public.reserve_telegram_catalog_send_slot(integer) to service_role;
grant execute on function public.claim_telegram_catalog_send_slot(timestamptz) to service_role;
grant execute on function public.defer_telegram_catalog_send(integer) to service_role;

