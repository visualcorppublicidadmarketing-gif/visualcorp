-- Campaigns group related marketing work. Social posts retain their existing
-- fields and metrics; non-social activities use a separate task model.

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'visualcorp-suite',
  source_id text not null,
  title text not null,
  brief text not null default '',
  start_date date,
  end_date date,
  owner text not null default '',
  status text not null default 'Planificada'
    check (status in ('Planificada','En curso','Finalizada','Cancelada')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_id),
  unique (organization_id, id),
  check (length(trim(title)) > 0),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.marketing_campaign_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'visualcorp-suite',
  source_id text not null,
  campaign_id uuid,
  activity_type text not null check (activity_type in (
    'Decoración o ambientación','Diseño interno de campaña','Material promocional o recuerdos','Otro'
  )),
  custom_activity_type text not null default '',
  title text not null,
  brief text not null default '',
  start_date date,
  due_date date not null,
  start_time time,
  end_time time,
  owner text not null default '',
  priority text not null default 'Normal' check (priority in ('Baja','Normal','Alta')),
  status text not null default 'Pendiente'
    check (status in ('Pendiente','En proceso','En revisión','Listo','Bloqueado','Cancelado')),
  next_action text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_id),
  unique (organization_id, id),
  check (length(trim(title)) > 0),
  check (activity_type <> 'Otro' or length(trim(custom_activity_type)) > 0),
  check (start_date is null or due_date >= start_date),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or coalesce(start_date, due_date) < due_date or end_time > start_time),
  foreign key (organization_id, campaign_id)
    references public.marketing_campaigns(organization_id, id) on delete set null (campaign_id)
);

alter table public.marketing_posts add column campaign_id uuid;
alter table public.marketing_posts
  add constraint marketing_posts_campaign_org_fk
  foreign key (organization_id, campaign_id)
  references public.marketing_campaigns(organization_id, id) on delete set null (campaign_id);

create table public.marketing_campaign_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'visualcorp-suite',
  source_id text not null,
  source_campaign_id text not null,
  source_asset_id text not null,
  campaign_id uuid not null,
  asset_id uuid not null,
  role text not null default 'Imagen de referencia',
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id),
  unique (organization_id, campaign_id, asset_id, role),
  foreign key (organization_id, campaign_id)
    references public.marketing_campaigns(organization_id, id) on delete cascade,
  foreign key (organization_id, asset_id)
    references public.marketing_assets(organization_id, id) on delete restrict
);

create table public.marketing_campaign_item_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'visualcorp-suite',
  source_id text not null,
  source_item_id text not null,
  source_asset_id text not null,
  item_id uuid not null,
  asset_id uuid not null,
  role text not null default 'Imagen de referencia',
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id),
  unique (organization_id, item_id, asset_id, role),
  foreign key (organization_id, item_id)
    references public.marketing_campaign_items(organization_id, id) on delete cascade,
  foreign key (organization_id, asset_id)
    references public.marketing_assets(organization_id, id) on delete restrict
);

create table public.marketing_campaign_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid,
  item_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  field_name text not null,
  previous_value text not null default '',
  new_value text not null default '',
  created_at timestamptz not null default now(),
  check ((campaign_id is null) <> (item_id is null))
);

create index marketing_campaigns_period_idx
  on public.marketing_campaigns(organization_id, start_date, end_date, status);
create index marketing_campaign_items_due_idx
  on public.marketing_campaign_items(organization_id, due_date, status);
create index marketing_campaign_items_parent_idx
  on public.marketing_campaign_items(organization_id, campaign_id, due_date);
create index marketing_posts_campaign_idx
  on public.marketing_posts(organization_id, campaign_id, scheduled_date);
create index marketing_campaign_assets_asset_idx
  on public.marketing_campaign_assets(organization_id, asset_id);
create index marketing_campaign_item_assets_asset_idx
  on public.marketing_campaign_item_assets(organization_id, asset_id);
create index marketing_campaign_events_campaign_idx
  on public.marketing_campaign_events(organization_id, campaign_id, created_at desc);
create index marketing_campaign_events_item_idx
  on public.marketing_campaign_events(organization_id, item_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array[
    'marketing_campaigns','marketing_campaign_items','marketing_campaign_assets',
    'marketing_campaign_item_assets','marketing_campaign_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    if t = 'marketing_campaign_events' then
      execute format('grant select on public.%I to authenticated', t);
      execute format('create policy marketing_campaign_events_select on public.%I for select to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''view''))', t);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('create policy marketing_campaign_member on public.%I for all to authenticated using (
        app_private.has_visualcorp_access(organization_id,''marketing'',''view'') or
        app_private.has_visualcorp_access(organization_id,''marketing'',''edit'') or
        app_private.has_visualcorp_access(organization_id,''marketing'',''delete_records'')) with check (
        app_private.has_visualcorp_access(organization_id,''marketing'',''edit''))', t);
      execute format('create policy vc_access_select on public.%I as restrictive for select to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''view''))', t);
      execute format('create policy vc_access_insert on public.%I as restrictive for insert to authenticated with check (app_private.has_visualcorp_access(organization_id,''marketing'',''edit''))', t);
      execute format('create policy vc_access_update on public.%I as restrictive for update to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''edit'')) with check (app_private.has_visualcorp_access(organization_id,''marketing'',''edit''))', t);
      execute format('create policy vc_access_delete on public.%I as restrictive for delete to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''delete_records''))', t);
    end if;
  end loop;
end $$;

revoke insert, update, delete, truncate, references, trigger
  on public.marketing_campaign_events from authenticated;

create or replace function public.log_marketing_campaign_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_field text;
  v_old_value text;
  v_new_value text;
  v_fields text[];
begin
  if tg_table_name = 'marketing_campaigns' then
    v_fields := array['title','brief','start_date','end_date','owner','status'];
  else
    v_fields := array['campaign_id','activity_type','custom_activity_type','title','brief','start_date','due_date','start_time','end_time','owner','priority','status','next_action'];
  end if;

  if tg_op = 'DELETE' then
    insert into public.marketing_campaign_events(
      organization_id, campaign_id, item_id, actor_id, field_name, previous_value, new_value
    ) values (
      old.organization_id,
      case when tg_table_name = 'marketing_campaigns' then old.id else null end,
      case when tg_table_name = 'marketing_campaign_items' then old.id else null end,
      (select auth.uid()), 'deleted', coalesce(to_jsonb(old)->>'title',''), ''
    );
    return old;
  end if;

  if tg_op = 'INSERT' then
    insert into public.marketing_campaign_events(
      organization_id, campaign_id, item_id, actor_id, field_name, previous_value, new_value
    ) values (
      new.organization_id,
      case when tg_table_name = 'marketing_campaigns' then new.id else null end,
      case when tg_table_name = 'marketing_campaign_items' then new.id else null end,
      (select auth.uid()), 'created', '', coalesce(to_jsonb(new)->>'title','')
    );
    return new;
  end if;

  foreach v_field in array v_fields loop
    v_old_value := coalesce(to_jsonb(old)->>v_field, '');
    v_new_value := coalesce(to_jsonb(new)->>v_field, '');
    if v_old_value is distinct from v_new_value then
      insert into public.marketing_campaign_events(
        organization_id, campaign_id, item_id, actor_id, field_name, previous_value, new_value
      ) values (
        new.organization_id,
        case when tg_table_name = 'marketing_campaigns' then new.id else null end,
        case when tg_table_name = 'marketing_campaign_items' then new.id else null end,
        (select auth.uid()), v_field, v_old_value, v_new_value
      );
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.log_marketing_campaign_activity() from public, anon, authenticated;

create trigger marketing_campaign_activity
  after insert or update or delete on public.marketing_campaigns
  for each row execute function public.log_marketing_campaign_activity();
create trigger marketing_campaign_item_activity
  after insert or update or delete on public.marketing_campaign_items
  for each row execute function public.log_marketing_campaign_activity();

create or replace function public.log_marketing_campaign_reference_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_organization_id uuid;
  v_campaign_id uuid;
  v_item_id uuid;
  v_asset_id uuid;
  v_filename text;
  v_reference text;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_asset_id := old.asset_id;
    if tg_table_name = 'marketing_campaign_assets' then
      v_campaign_id := old.campaign_id;
    else
      v_item_id := old.item_id;
    end if;
  else
    v_organization_id := new.organization_id;
    v_asset_id := new.asset_id;
    if tg_table_name = 'marketing_campaign_assets' then
      v_campaign_id := new.campaign_id;
    else
      v_item_id := new.item_id;
    end if;
  end if;

  select filename into v_filename
    from public.marketing_assets
    where organization_id = v_organization_id and id = v_asset_id;
  v_reference := concat(coalesce(v_filename, 'Imagen'), ' [', v_asset_id::text, ']');

  insert into public.marketing_campaign_events(
    organization_id, campaign_id, item_id, actor_id, field_name, previous_value, new_value
  ) values (
    v_organization_id, v_campaign_id, v_item_id, (select auth.uid()), 'reference_image',
    case when tg_op = 'DELETE' then v_reference else '' end,
    case when tg_op = 'INSERT' then v_reference else '' end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.log_marketing_campaign_reference_activity() from public, anon, authenticated;

create trigger marketing_campaign_reference_activity
  after insert or delete on public.marketing_campaign_assets
  for each row execute function public.log_marketing_campaign_reference_activity();
create trigger marketing_campaign_item_reference_activity
  after insert or delete on public.marketing_campaign_item_assets
  for each row execute function public.log_marketing_campaign_reference_activity();

-- Extend the existing controlled post-write boundary so campaign links still
-- use the reviewed RPC instead of direct browser writes.
create or replace function public.save_marketing_post(p_organization_id uuid,p_post_id uuid,p_expected_version bigint,p_patch jsonb,p_creation_key uuid default null)
returns public.marketing_posts language plpgsql security definer set search_path='' as $$
declare v_old public.marketing_posts; v_new public.marketing_posts; v_key text; v_name text;
  v_fields constant text[] := array['title','content_line','platform','format','scheduled_date','scheduled_time','owner_user_id',
    'status','caption','next_action','due_date','objective','audience','offer','call_in','callout','cta','cta_destination',
    'external_url','hashtags','visual_direction','tags','calendar_color','design_ready','video_ready','canvas_width','canvas_height',
    'cover_status','art_status','caption_status','video_status','voiceover_status','tiktok_status','blocked_reason','record_kind','campaign_id'];
begin
  if auth.uid() is null or not app_private.has_visualcorp_access(p_organization_id,'marketing','edit') then
    raise exception 'Sin permiso para editar Marketing.' using errcode='42501'; end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Ficha no válida.'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not v_key=any(v_fields) then raise exception 'Campo no editable: %',v_key; end if;
  end loop;
  if p_post_id is null then
    insert into public.marketing_posts(organization_id,source_system,source_id)
    values(p_organization_id,'visualcorp-suite','suite-'||coalesce(p_creation_key,gen_random_uuid())::text)
    on conflict (organization_id,source_system,source_id) do nothing returning * into v_old;
    if not found then
      select * into v_old from public.marketing_posts where organization_id=p_organization_id and source_system='visualcorp-suite' and source_id='suite-'||p_creation_key::text for update;
      return v_old;
    end if;
  else
    select * into v_old from public.marketing_posts where id=p_post_id and organization_id=p_organization_id for update;
    if not found then raise exception 'Publicación no disponible.' using errcode='42501'; end if;
    if p_expected_version is distinct from v_old.row_version then
      raise exception 'La ficha cambió. Actualiza los datos y vuelve a intentarlo; tus cambios siguen en el formulario.' using errcode='40001'; end if;
  end if;
  v_new := jsonb_populate_record(v_old,p_patch);
  if (p_post_id is null or p_patch ? 'title') and length(trim(v_new.title)) not between 1 and 180 then raise exception 'Completa un título de hasta 180 caracteres.'; end if;
  if p_patch ? 'status' and v_new.status ~* '^aprobad[ao]$' and (p_post_id is null or v_old.status is distinct from v_new.status) then
    raise exception 'Usa el panel de revisión para aprobar esta versión.' using errcode='42501'; end if;
  if v_new.owner_user_id is not null and (p_patch ? 'owner_user_id') then
    select a.display_name into v_name from public.list_marketing_assignees(p_organization_id) a where a.user_id=v_new.owner_user_id;
    if v_name is null then raise exception 'El responsable debe ser un miembro activo de la organización.'; end if;
    v_new.owner := v_name;
  elsif p_patch ? 'owner_user_id' then v_new.owner := ''; end if;
  if v_new.scheduled_date<>'' and (not pg_input_is_valid(v_new.scheduled_date,'date') or v_new.scheduled_date !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Fecha de publicación no válida.'; end if;
  if v_new.due_date<>'' and (not pg_input_is_valid(v_new.due_date,'date') or v_new.due_date !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'Fecha de producción no válida.'; end if;
  if p_patch ? 'scheduled_time' and v_new.scheduled_time<>'' and v_new.scheduled_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'La hora debe usar HH:MM.'; end if;
  foreach v_key in array array['cover_status','art_status','caption_status','video_status','voiceover_status','tiktok_status'] loop
    if p_patch ? v_key and (to_jsonb(v_new)->>v_key) not in ('Sí','No','No aplica','Por confirmar') then raise exception 'Checklist no válido.'; end if;
  end loop;
  if p_patch ? 'art_status' then v_new.design_ready := v_new.art_status='Sí'; end if;
  if p_patch ? 'video_status' then v_new.video_ready := v_new.video_status='Sí'; end if;
  update public.marketing_posts set
    title=v_new.title,content_line=v_new.content_line,platform=v_new.platform,format=v_new.format,
    scheduled_date=v_new.scheduled_date,scheduled_time=v_new.scheduled_time,owner=v_new.owner,owner_user_id=v_new.owner_user_id,
    status=v_new.status,caption=v_new.caption,next_action=v_new.next_action,due_date=v_new.due_date,
    objective=v_new.objective,audience=v_new.audience,offer=v_new.offer,call_in=v_new.call_in,callout=v_new.callout,
    cta=v_new.cta,cta_destination=v_new.cta_destination,external_url=v_new.external_url,hashtags=v_new.hashtags,
    visual_direction=v_new.visual_direction,tags=v_new.tags,calendar_color=v_new.calendar_color,
    design_ready=v_new.design_ready,video_ready=v_new.video_ready,canvas_width=v_new.canvas_width,canvas_height=v_new.canvas_height,
    cover_status=v_new.cover_status,art_status=v_new.art_status,caption_status=v_new.caption_status,
    video_status=v_new.video_status,voiceover_status=v_new.voiceover_status,tiktok_status=v_new.tiktok_status,
    blocked_reason=v_new.blocked_reason,record_kind=v_new.record_kind,campaign_id=v_new.campaign_id
  where id=v_old.id returning * into v_new;
  return v_new;
end; $$;

revoke all on function public.save_marketing_post(uuid,uuid,bigint,jsonb,uuid) from public,anon;
grant execute on function public.save_marketing_post(uuid,uuid,bigint,jsonb,uuid) to authenticated;

comment on table public.marketing_campaigns is
  'Parent plans that group social publications and non-social marketing activities.';
comment on table public.marketing_campaign_items is
  'Non-social marketing tasks and deliverables; separate from imported marketing_work_items orders.';
