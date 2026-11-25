-- Create-only RPC for the HMAC-authenticated Codex changelog publisher.
-- The write guard bypass is scoped to this transaction and is only reachable
-- through service_role after the Edge Function verifies the publisher HMAC.

create or replace function public.codex_publish_internal_change_log(
  p_entry_id uuid,
  p_title text,
  p_summary text,
  p_details text,
  p_category text,
  p_audience text,
  p_version_tag text,
  p_tags text[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_organization_id uuid;
  v_published_at timestamptz;
  v_existing_status text;
  v_tags text[];
begin
  if p_entry_id is null
     or p_title is null
     or char_length(btrim(p_title)) < 3
     or char_length(btrim(p_title)) > 160
     or p_summary is null
     or char_length(btrim(p_summary)) < 3
     or char_length(btrim(p_summary)) > 500
     or p_details is null
     or char_length(p_details) > 10000
     or p_version_tag is null
     or char_length(p_version_tag) > 80 then
    raise exception 'Invalid changelog entry fields.' using errcode = '22023';
  end if;

  if p_category not in ('general', 'website', 'sales', 'inventory', 'operations', 'security') then
    raise exception 'Invalid changelog category.' using errcode = '22023';
  end if;

  if p_audience not in ('both', 'admin', 'operations') then
    raise exception 'Invalid changelog audience.' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_tags), 0) > 7
     or exists (
       select 1
       from unnest(coalesce(p_tags, array[]::text[])) as requested_tag(value)
       where value is null
          or char_length(btrim(value)) < 1
          or char_length(btrim(value)) > 32
     ) then
    raise exception 'Invalid changelog tags.' using errcode = '22023';
  end if;

  select organization.id
    into v_organization_id
    from public.organizations as organization
   where organization.slug = 'visual-corp'
   limit 1;

  if v_organization_id is null then
    raise exception 'Visual Corp organization is unavailable.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(deduplicated.tag order by deduplicated.position), array[]::text[])
    into v_tags
    from (
      select distinct on (lower(btrim(requested_tag.value)))
             btrim(requested_tag.value) as tag,
             requested_tag.ordinality as position
        from unnest(coalesce(p_tags, array[]::text[])) with ordinality as requested_tag(value, ordinality)
       order by lower(btrim(requested_tag.value)), requested_tag.ordinality
    ) as deduplicated;

  if not exists (select 1 from unnest(v_tags) as current_tag(value) where lower(value) = 'codex') then
    v_tags := array_append(v_tags, 'Codex');
  end if;

  -- The existing table trigger denies service-role writes unless a trusted,
  -- transaction-local workflow explicitly scopes the bypass.
  perform set_config('app.pos_rpc_bypass', 'true', true);

  v_published_at := clock_timestamp();
  insert into public.internal_change_log (
    id, organization_id, title, summary, details, category, audience,
    version_tag, status, published_at, created_by, updated_by, tags
  )
  values (
    p_entry_id, v_organization_id, btrim(p_title), btrim(p_summary), p_details,
    p_category, p_audience, p_version_tag, 'published', v_published_at, null, null, v_tags
  )
  on conflict (id) do nothing
  returning published_at into v_published_at;

  if found then
    return jsonb_build_object(
      'ok', true, 'id', p_entry_id, 'status', 'published',
      'published_at', v_published_at, 'duplicate', false
    );
  end if;

  select entry.status, entry.published_at
    into v_existing_status, v_published_at
    from public.internal_change_log as entry
   where entry.id = p_entry_id
     and entry.organization_id = v_organization_id;

  if not found or v_existing_status <> 'published' or v_published_at is null then
    raise exception 'Changelog request ID is already in use.' using errcode = '23505';
  end if;

  return jsonb_build_object(
    'ok', true, 'id', p_entry_id, 'status', 'published',
    'published_at', v_published_at, 'duplicate', true
  );
end;
$$;

revoke all on function public.codex_publish_internal_change_log(uuid, text, text, text, text, text, text, text[]) from public, anon, authenticated, service_role;
grant execute on function public.codex_publish_internal_change_log(uuid, text, text, text, text, text, text, text[]) to service_role;
