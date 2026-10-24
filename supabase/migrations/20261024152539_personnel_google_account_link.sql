-- Link a personnel record to an already registered Google-authenticated user.
-- Access profiles remain managed through organization_memberships and the
-- existing assign_visualcorp_profile RPC; HR department is not authorization.

create table public.personnel_account_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  personnel_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_by uuid references auth.users(id) on delete set null default auth.uid(),
  linked_at timestamptz not null default now(),
  foreign key (personnel_id, organization_id) references public.personnel_records(id, organization_id) on delete restrict,
  unique (organization_id, personnel_id),
  unique (organization_id, user_id)
);
alter table public.personnel_account_links enable row level security;
revoke all on public.personnel_account_links from public, anon, authenticated;

alter table public.personnel_events drop constraint if exists personnel_events_event_key_check;
alter table public.personnel_events add constraint personnel_events_event_key_check
  check (event_key in ('record_created','record_updated','compensation_changed','account_linked','account_unlinked'));

create or replace function public.list_visualcorp_personnel_google_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  last_sign_in_at timestamptz,
  linked_personnel_id uuid,
  linked_personnel_name text,
  roles text[],
  access_profiles text[],
  access_active boolean
) language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if auth.uid() is null
    or not app_private.has_visualcorp_access(v_org,'team','manage_members')
    or not app_private.has_visualcorp_access(v_org,'personnel','edit') then
    raise exception 'Necesitas permisos para gestionar personal y accesos del equipo.' using errcode='42501';
  end if;
  return query
    select u.id, u.email::text,
      coalesce(nullif(trim(p.full_name),''),u.email::text), u.last_sign_in_at,
      l.personnel_id, r.full_name,
      coalesce(m.roles,array[]::text[]), coalesce(m.profiles,array[]::text[]), coalesce(m.access_active,false)
    from auth.users u
    left join public.profiles p on p.user_id=u.id
    left join public.personnel_account_links l on l.organization_id=v_org and l.user_id=u.id
    left join public.personnel_records r on r.organization_id=l.organization_id and r.id=l.personnel_id
    left join lateral (
      select array_agg(distinct x.role order by x.role) roles,
        array_agg(distinct coalesce(ap.name,x.role) order by coalesce(ap.name,x.role)) profiles,
        bool_or(x.active and coalesce(ap.active,true)) access_active
      from public.organization_memberships x
      left join public.access_profiles ap on ap.id=x.profile_id
      where x.organization_id=v_org and x.user_id=u.id
    ) m on true
    where u.last_sign_in_at is not null and u.email is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google')
    order by lower(u.email);
end;
$$;
revoke all on function public.list_visualcorp_personnel_google_accounts() from public,anon;
grant execute on function public.list_visualcorp_personnel_google_accounts() to authenticated;

create or replace function public.list_visualcorp_personnel_access_profiles()
returns table (id uuid, profile_key text, name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if auth.uid() is null
    or not app_private.has_visualcorp_access(v_org,'team','manage_members')
    or not app_private.has_visualcorp_access(v_org,'personnel','edit') then
    raise exception 'Necesitas permisos para gestionar personal y accesos del equipo.' using errcode='42501';
  end if;
  return query select p.id,p.profile_key,p.name from public.access_profiles p
    where p.organization_id=v_org and p.active and p.profile_key<>'owner' order by p.name;
end;
$$;
revoke all on function public.list_visualcorp_personnel_access_profiles() from public,anon;
grant execute on function public.list_visualcorp_personnel_access_profiles() to authenticated;

create or replace function public.link_visualcorp_personnel_google_account(p_personnel_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_name text; v_user_email text; v_linked_user uuid; v_actor_label text;
begin
  if v_actor is null then raise exception 'Inicia sesión para vincular una cuenta.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'team','manage_members')
    or not app_private.has_visualcorp_access(v_org,'personnel','edit') then
    raise exception 'Necesitas permisos para gestionar personal y accesos del equipo.' using errcode='42501';
  end if;
  select full_name into v_name from public.personnel_records where id=p_personnel_id and organization_id=v_org;
  if not found then raise exception 'La ficha de personal no existe.'; end if;
  select u.email::text into v_user_email from auth.users u
    where u.id=p_user_id and u.last_sign_in_at is not null
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
  if v_user_email is null then raise exception 'La cuenta debe haber iniciado sesión previamente con Google.'; end if;
  select user_id into v_linked_user from public.personnel_account_links where organization_id=v_org and personnel_id=p_personnel_id;
  if v_linked_user is not null and v_linked_user<>p_user_id then raise exception 'Desvincula primero la cuenta actual de esta ficha.'; end if;
  if exists(select 1 from public.personnel_account_links where organization_id=v_org and user_id=p_user_id and personnel_id<>p_personnel_id) then
    raise exception 'Esta cuenta ya está vinculada a otra ficha de personal.';
  end if;
  insert into public.personnel_account_links(organization_id,personnel_id,user_id,linked_by)
    values(v_org,p_personnel_id,p_user_id,v_actor) on conflict(organization_id,personnel_id) do nothing;
  if v_linked_user is null then
    select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Usuario del sistema') into v_actor_label
      from public.profiles p where p.user_id=v_actor;
    insert into public.personnel_events(organization_id,personnel_id,event_key,summary,changed_fields,actor_user_id,actor_label)
      values(v_org,p_personnel_id,'account_linked','Cuenta de Google vinculada',array['google_account'],v_actor,coalesce(v_actor_label,'Usuario del sistema'));
  end if;
end;
$$;
revoke all on function public.link_visualcorp_personnel_google_account(uuid,uuid) from public,anon;
grant execute on function public.link_visualcorp_personnel_google_account(uuid,uuid) to authenticated;

create or replace function public.unlink_visualcorp_personnel_google_account(p_personnel_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid:=auth.uid(); v_actor_label text;
begin
  if v_actor is null then raise exception 'Inicia sesión para desvincular una cuenta.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'team','manage_members')
    or not app_private.has_visualcorp_access(v_org,'personnel','edit') then
    raise exception 'Necesitas permisos para gestionar personal y accesos del equipo.' using errcode='42501';
  end if;
  if not exists(select 1 from public.personnel_account_links where organization_id=v_org and personnel_id=p_personnel_id) then
    raise exception 'Esta ficha no tiene una cuenta vinculada.';
  end if;
  delete from public.personnel_account_links where organization_id=v_org and personnel_id=p_personnel_id;
  select coalesce(nullif(trim(p.full_name),''),nullif(trim(p.email),''),'Usuario del sistema') into v_actor_label
    from public.profiles p where p.user_id=v_actor;
  insert into public.personnel_events(organization_id,personnel_id,event_key,summary,changed_fields,actor_user_id,actor_label)
    values(v_org,p_personnel_id,'account_unlinked','Cuenta de Google desvinculada',array['google_account'],v_actor,coalesce(v_actor_label,'Usuario del sistema'));
end;
$$;
revoke all on function public.unlink_visualcorp_personnel_google_account(uuid) from public,anon;
grant execute on function public.unlink_visualcorp_personnel_google_account(uuid) to authenticated;
