-- Priority 6: Post-publication results tracking for Marketing without
-- bypassing marketing_controlled_write or invalidating content approval.

alter table public.marketing_posts
  add column if not exists published_url text not null default '',
  add column if not exists results_updated_at timestamptz;

create or replace function app_private.marketing_post_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.row_version := old.row_version + 1;
  new.updated_at := timezone('UTC', clock_timestamp());
  if (to_jsonb(new) - array[
      'id','organization_id','source_system','source_id','source_row','created_at','imported_at',
      'updated_at','row_version','content_revision','owner','owner_user_id','status','scheduled_date','scheduled_time',
      'due_date','next_action','blocked_reason','record_kind','tags','calendar_color','reach','interactions','clicks','leads',
      'published_url','results_updated_at','notes','design_ready','video_ready','cover_status','art_status','caption_status',
      'video_status','voiceover_status','tiktok_status','campaign_id'
    ])
    is distinct from
    (to_jsonb(old) - array[
      'id','organization_id','source_system','source_id','source_row','created_at','imported_at',
      'updated_at','row_version','content_revision','owner','owner_user_id','status','scheduled_date','scheduled_time',
      'due_date','next_action','blocked_reason','record_kind','tags','calendar_color','reach','interactions','clicks','leads',
      'published_url','results_updated_at','notes','design_ready','video_ready','cover_status','art_status','caption_status',
      'video_status','voiceover_status','tiktok_status','campaign_id'
    ]) then
    new.content_revision := old.content_revision + 1;
  end if;
  return new;
end;
$$;

create or replace function public.save_marketing_post_results(
  p_organization_id uuid,
  p_post_id uuid,
  p_reach integer,
  p_interactions integer,
  p_clicks integer,
  p_leads integer,
  p_published_url text default null,
  p_measured_at timestamptz default now()
)
returns public.marketing_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.marketing_posts;
  v_new public.marketing_posts;
  v_reach integer;
  v_interactions integer;
  v_clicks integer;
  v_leads integer;
  v_url text;
  v_next_url text;
  v_measured_at timestamptz;
begin
  if auth.uid() is null or (
    not app_private.has_visualcorp_access(p_organization_id, 'marketing', 'edit')
    and not app_private.has_visualcorp_access(p_organization_id, 'marketing', 'approve_content')
  ) then
    raise exception 'Sin permiso para registrar resultados de Marketing.' using errcode = '42501';
  end if;

  v_reach := coalesce(p_reach, 0);
  v_interactions := coalesce(p_interactions, 0);
  v_clicks := coalesce(p_clicks, 0);
  v_leads := coalesce(p_leads, 0);

  if v_reach < 0 or v_interactions < 0 or v_clicks < 0 or v_leads < 0 then
    raise exception 'Las métricas deben ser números enteros iguales o mayores a cero.';
  end if;

  if p_published_url is not null then
    v_url := trim(p_published_url);
    if v_url <> '' and v_url !~* '^https?://' then
      raise exception 'El enlace publicado debe comenzar con http:// o https://.';
    end if;
  end if;

  select *
  into v_old
  from public.marketing_posts
  where id = p_post_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Publicación no disponible.' using errcode = '42501';
  end if;

  v_next_url := case
    when p_published_url is null then coalesce(v_old.published_url, '')
    else v_url
  end;
  v_measured_at := coalesce(p_measured_at, clock_timestamp());

  update public.marketing_posts
  set
    reach = v_reach,
    interactions = v_interactions,
    clicks = v_clicks,
    leads = v_leads,
    published_url = v_next_url,
    results_updated_at = v_measured_at
  where id = v_old.id
  returning * into v_new;

  insert into public.marketing_post_events(
    organization_id,
    post_id,
    actor_id,
    field_name,
    previous_value,
    new_value
  ) values (
    v_old.organization_id,
    v_old.id,
    auth.uid(),
    'results',
    concat(
      'alcance ', coalesce(v_old.reach, 0),
      ' · interacciones ', coalesce(v_old.interactions, 0),
      ' · clics ', coalesce(v_old.clicks, 0),
      ' · leads ', coalesce(v_old.leads, 0),
      case when coalesce(v_old.published_url, '') <> '' then ' · ' || v_old.published_url else '' end
    ),
    concat(
      'alcance ', v_new.reach,
      ' · interacciones ', v_new.interactions,
      ' · clics ', v_new.clicks,
      ' · leads ', v_new.leads,
      case when coalesce(v_new.published_url, '') <> '' then ' · ' || v_new.published_url else '' end
    )
  );

  return v_new;
end;
$$;

revoke all on function app_private.marketing_post_revision() from public, anon, authenticated;
revoke all on function public.save_marketing_post_results(uuid, uuid, integer, integer, integer, integer, text, timestamptz) from public, anon;
grant execute on function public.save_marketing_post_results(uuid, uuid, integer, integer, integer, integer, text, timestamptz) to authenticated;
