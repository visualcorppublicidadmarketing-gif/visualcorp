-- Editorial workflow. No imported IDs, dates, states or owner labels are discarded.
alter table public.marketing_posts
  add column record_kind text not null default 'publication' check (record_kind in ('publication','monthly_plan')),
  add column owner_user_id uuid references auth.users(id) on delete set null,
  add column blocked_reason text not null default '',
  add column content_revision integer not null default 1 check (content_revision > 0),
  add column row_version bigint not null default 1;
update public.marketing_posts set record_kind='monthly_plan' where title like 'PLAN MENSUAL%';
create index marketing_posts_owner_idx on public.marketing_posts(organization_id,owner_user_id);

create table public.marketing_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null,
  content_revision integer not null,
  decision text not null check (decision in ('approved','changes_requested')),
  feedback text not null default '',
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id,post_id) references public.marketing_posts(organization_id,id) on delete cascade,
  check (decision <> 'changes_requested' or length(trim(feedback)) > 0)
);
create index marketing_reviews_post_idx on public.marketing_reviews(organization_id,post_id,created_at desc);
create table public.marketing_nonproduction_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day date not null,
  reason text not null check (length(trim(reason)) between 1 and 300),
  unique(organization_id,day)
);
insert into public.marketing_nonproduction_days(organization_id,day,reason)
select o.id,d.day,'Cierre por feriado confirmado por gerencia'
from public.organizations o cross join (values ('2026-11-02'::date),('2026-11-03'::date)) d(day)
where o.slug='visual-corp';
alter table public.marketing_reviews enable row level security;
alter table public.marketing_nonproduction_days enable row level security;
create policy marketing_reviews_read on public.marketing_reviews for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'marketing','view'));
create policy marketing_days_read on public.marketing_nonproduction_days for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'marketing','view'));
revoke all on public.marketing_reviews,public.marketing_nonproduction_days from public,anon,authenticated;
grant select on public.marketing_reviews,public.marketing_nonproduction_days to authenticated;

-- Extend the existing permission catalog without removing actions added by other modules.
do $$
declare v_check text; v_def text; v_marker text := $m$coalesce(item->>'action_key','') not in ($m$;
begin
  select pg_get_constraintdef(oid) into v_check from pg_constraint
  where conrelid='public.access_profile_permissions'::regclass and conname='access_profile_permissions_action_key_check';
  if v_check is null or strpos(v_check,'ARRAY[')=0 then raise exception 'Revisar catálogo de acciones antes de migrar Marketing'; end if;
  alter table public.access_profile_permissions drop constraint access_profile_permissions_action_key_check;
  execute 'alter table public.access_profile_permissions add constraint access_profile_permissions_action_key_check ' || replace(v_check,'ARRAY[',$a$ARRAY['approve_content'::text, $a$);
  v_def := pg_get_functiondef('public.save_visualcorp_access_profile(uuid,text,text,text,jsonb)'::regprocedure);
  if strpos(v_def,v_marker)=0 then raise exception 'Revisar validador de perfiles antes de migrar Marketing'; end if;
  execute replace(v_def,v_marker,v_marker || '''approve_content'',');
end;
$$;
insert into public.access_profile_permissions(profile_id,module_key,action_key,enabled)
select id,'marketing','approve_content',true from public.access_profiles
where is_system and profile_key in ('owner','admin','gerencia')
on conflict (profile_id,module_key,action_key) do nothing;

create or replace function app_private.marketing_post_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.row_version := old.row_version+1;
  new.updated_at := timezone('UTC',clock_timestamp());
  if (to_jsonb(new) - array['id','organization_id','source_system','source_id','source_row','created_at','imported_at',
      'updated_at','row_version','content_revision','owner','owner_user_id','status','scheduled_date','scheduled_time',
      'due_date','next_action','blocked_reason','record_kind','tags','calendar_color','reach','interactions','clicks','leads',
      'notes','design_ready','video_ready','cover_status','art_status','caption_status','video_status','voiceover_status','tiktok_status'])
    is distinct from
    (to_jsonb(old) - array['id','organization_id','source_system','source_id','source_row','created_at','imported_at',
      'updated_at','row_version','content_revision','owner','owner_user_id','status','scheduled_date','scheduled_time',
      'due_date','next_action','blocked_reason','record_kind','tags','calendar_color','reach','interactions','clicks','leads',
      'notes','design_ready','video_ready','cover_status','art_status','caption_status','video_status','voiceover_status','tiktok_status']) then
    new.content_revision := old.content_revision+1;
  end if;
  return new;
end; $$;
create trigger marketing_revision before update on public.marketing_posts
for each row execute function app_private.marketing_post_revision();

-- Link and resource changes share the parent's row lock with save/review operations.
create or replace function app_private.marketing_material_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_post uuid;
begin
  if tg_table_name='marketing_assets' then
    if (new.rel_path,new.storage_status,new.size_bytes) is not distinct from (old.rel_path,old.storage_status,old.size_bytes) then return new; end if;
    for v_post in select distinct post_id from public.marketing_post_assets where asset_id=new.id order by post_id loop
      update public.marketing_posts set content_revision=content_revision+1 where id=v_post;
    end loop;
  else
    if tg_op='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
    for v_post in select distinct x from unnest(array[
      case when tg_op<>'INSERT' then old.post_id end,case when tg_op<>'DELETE' then new.post_id end]) x where x is not null order by x loop
      update public.marketing_posts set content_revision=content_revision+1 where id=v_post;
    end loop;
  end if;
  return null;
end; $$;
create trigger marketing_link_revision after insert or update or delete on public.marketing_post_assets
for each row execute function app_private.marketing_material_revision();
create trigger marketing_asset_revision after update on public.marketing_assets
for each row execute function app_private.marketing_material_revision();

create or replace function public.log_marketing_post_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_key text;
begin
  if auth.uid() is null then return new; end if;
  foreach v_key in array array['status','owner','owner_user_id','record_kind','blocked_reason','next_action',
    'cover_status','art_status','caption_status','video_status','voiceover_status','tiktok_status','content_revision'] loop
    if to_jsonb(new)->v_key is distinct from to_jsonb(old)->v_key then
      insert into public.marketing_post_events(organization_id,post_id,actor_id,field_name,previous_value,new_value)
      values(new.organization_id,new.id,auth.uid(),v_key,coalesce(to_jsonb(old)->>v_key,''),coalesce(to_jsonb(new)->>v_key,''));
    end if;
  end loop;
  if (new.scheduled_date,new.scheduled_time,new.due_date) is distinct from (old.scheduled_date,old.scheduled_time,old.due_date) then
    insert into public.marketing_post_events(organization_id,post_id,actor_id,field_name,previous_value,new_value)
    values(new.organization_id,new.id,auth.uid(),'schedule',concat_ws(' ',old.scheduled_date,old.scheduled_time)||' · producción '||old.due_date,
      concat_ws(' ',new.scheduled_date,new.scheduled_time)||' · producción '||new.due_date);
  end if;
  return new;
end; $$;

create or replace function public.list_marketing_assignees(p_organization_id uuid)
returns table(user_id uuid,display_name text) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.has_visualcorp_access(p_organization_id,'marketing','view') then
    raise exception 'Sin acceso a Marketing.' using errcode='42501'; end if;
  return query select distinct m.user_id,coalesce(nullif(trim(p.full_name),''),'Miembro '||left(m.user_id::text,8))
    from public.organization_memberships m left join public.profiles p on p.user_id=m.user_id
    where m.organization_id=p_organization_id and m.active
      and exists(select 1 from public.access_profiles ap where ap.organization_id=m.organization_id and ap.active
        and (ap.id=m.profile_id or (m.profile_id is null and ap.profile_key=case m.role when 'manager' then 'gerencia' when 'advisor' then 'asesoras' when 'warehouse' then 'inventario' when 'production' then 'personal_taller' else m.role end)))
    order by 2;
end; $$;

-- One write boundary for every UI entry point, with optimistic concurrency.
create or replace function public.save_marketing_post(p_organization_id uuid,p_post_id uuid,p_expected_version bigint,p_patch jsonb,p_creation_key uuid default null)
returns public.marketing_posts language plpgsql security definer set search_path='' as $$
declare v_old public.marketing_posts; v_new public.marketing_posts; v_key text; v_name text;
  v_fields constant text[] := array['title','content_line','platform','format','scheduled_date','scheduled_time','owner_user_id',
    'status','caption','next_action','due_date','objective','audience','offer','call_in','callout','cta','cta_destination',
    'external_url','hashtags','visual_direction','tags','calendar_color','design_ready','video_ready','canvas_width','canvas_height',
    'cover_status','art_status','caption_status','video_status','voiceover_status','tiktok_status','blocked_reason','record_kind'];
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
    blocked_reason=v_new.blocked_reason,record_kind=v_new.record_kind
  where id=v_old.id returning * into v_new;
  return v_new;
end; $$;

create or replace function public.review_marketing_post(p_organization_id uuid,p_post_id uuid,p_expected_version bigint,p_decision text,p_feedback text default '')
returns public.marketing_reviews language plpgsql security definer set search_path='' as $$
declare v_post public.marketing_posts; v_review public.marketing_reviews; v_actor_name text;
begin
  if auth.uid() is null or not app_private.has_visualcorp_access(p_organization_id,'marketing','approve_content')
    or not app_private.has_visualcorp_access(p_organization_id,'marketing','edit') then
    raise exception 'Solo gerencia o personas designadas pueden aprobar o solicitar cambios.' using errcode='42501'; end if;
  select * into v_post from public.marketing_posts where id=p_post_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Publicación no disponible.' using errcode='42501'; end if;
  if p_expected_version is distinct from v_post.row_version then raise exception 'La versión cambió; actualiza antes de revisar.' using errcode='40001'; end if;
  if v_post.record_kind<>'publication' or trim(v_post.title)='' then raise exception 'Solo se revisan publicaciones con título.'; end if;
  if p_decision not in ('approved','changes_requested') or p_decision is null then raise exception 'Decisión no válida.'; end if;
  if p_decision='changes_requested' and length(trim(coalesce(p_feedback,'')))=0 then raise exception 'Explica los cambios solicitados.'; end if;
  select coalesce(nullif(trim(full_name),''),'Miembro '||left(auth.uid()::text,8)) into v_actor_name from public.profiles where user_id=auth.uid();
  insert into public.marketing_reviews(organization_id,post_id,content_revision,decision,feedback,actor_id,actor_name,snapshot)
  values(p_organization_id,p_post_id,v_post.content_revision,p_decision,coalesce(p_feedback,''),auth.uid(),coalesce(v_actor_name,'Revisor'),
    jsonb_build_object('post',to_jsonb(v_post),'materials',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'path',a.rel_path,'role',l.role)),'[]'::jsonb)
    from public.marketing_post_assets l join public.marketing_assets a on a.id=l.asset_id where l.post_id=v_post.id))) returning * into v_review;
  update public.marketing_posts set status=case when p_decision='approved' then 'Aprobada' else 'En diseño' end where id=v_post.id;
  return v_review;
end; $$;

create or replace function public.set_marketing_nonproduction_day(p_organization_id uuid,p_day date,p_reason text,p_remove boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.has_visualcorp_access(p_organization_id,'marketing','edit') then raise exception 'Sin permiso para configurar días sin producción.' using errcode='42501'; end if;
  if p_day is null then raise exception 'Elige una fecha.'; end if;
  if p_remove then delete from public.marketing_nonproduction_days where organization_id=p_organization_id and day=p_day;
  else insert into public.marketing_nonproduction_days(organization_id,day,reason) values(p_organization_id,p_day,trim(p_reason))
    on conflict(organization_id,day) do update set reason=excluded.reason; end if;
end; $$;

-- INVOKER is intentional: browser statements run as authenticated, while the
-- checked SECURITY DEFINER RPCs run as their database owner. No client-set flag.
create or replace function app_private.marketing_controlled_write()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user in ('anon','authenticated') then
    raise exception 'Actualiza la página para usar el nuevo guardado de Marketing. Las fechas ya no se mueven automáticamente.' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger marketing_controlled_write before insert or update on public.marketing_posts
for each row execute function app_private.marketing_controlled_write();
grant insert,update on public.marketing_posts to authenticated;
create or replace function public.roll_overdue_marketing_posts()
returns integer language sql security invoker set search_path='' as $$ select 0; $$;
do $$ begin
  if to_regclass('cron.job') is not null then
    execute $s$select cron.unschedule(jobid) from cron.job where jobname='marketing-overdue-publications-daily'$s$;
  end if;
end; $$;
revoke all on function app_private.marketing_post_revision(),app_private.marketing_material_revision(),app_private.marketing_controlled_write() from public,anon,authenticated;
revoke all on function public.list_marketing_assignees(uuid),public.save_marketing_post(uuid,uuid,bigint,jsonb,uuid),public.review_marketing_post(uuid,uuid,bigint,text,text),public.set_marketing_nonproduction_day(uuid,date,text,boolean) from public,anon;
grant execute on function public.list_marketing_assignees(uuid),public.save_marketing_post(uuid,uuid,bigint,jsonb,uuid),public.review_marketing_post(uuid,uuid,bigint,text,text),public.set_marketing_nonproduction_day(uuid,date,text,boolean) to authenticated;
