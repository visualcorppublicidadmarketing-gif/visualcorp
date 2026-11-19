-- Cola de solicitudes de acceso: quien entra con Google sin invitacion queda
-- visible para administradores con permiso de equipo. Migracion aditiva.
create table public.organization_access_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  status text not null default 'pending' check (status in ('pending','approved','dismissed')),
  request_count int not null default 1,
  requested_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);
create unique index organization_access_requests_pending_uq
  on public.organization_access_requests (organization_id, user_id) where status = 'pending';
create index organization_access_requests_user_idx
  on public.organization_access_requests (organization_id, user_id, status, resolved_at);

alter table public.organization_access_requests enable row level security;
revoke all on public.organization_access_requests from public, anon, authenticated, service_role;

alter table public.access_audit_log drop constraint if exists access_audit_log_event_key_check;
alter table public.access_audit_log add constraint access_audit_log_event_key_check
  check (event_key in (
    'profile_created','profile_updated','profile_activated','profile_deactivated',
    'profile_assigned','membership_activated','membership_deactivated',
    'profile_invited','profile_invitation_accepted','profile_invitation_revoked',
    'access_request_approved','access_request_dismissed'
  ));

create or replace function app_private.record_my_access_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_user record;
  v_name text;
  v_avatar text;
  v_req public.organization_access_requests%rowtype;
begin
  if v_uid is null then raise exception 'Inicia sesión para solicitar acceso.' using errcode = '42501'; end if;
  select id into v_org from public.organizations where slug = 'visual-corp';
  if v_org is null then raise exception 'Organización no encontrada.'; end if;

  select u.email, u.email_confirmed_at, u.raw_user_meta_data, u.raw_app_meta_data into v_user
  from auth.users u where u.id = v_uid;
  if not found or v_user.email is null or v_user.email_confirmed_at is null then
    raise exception 'Tu correo debe estar verificado para solicitar acceso.' using errcode = '42501';
  end if;
  if not (coalesce(v_user.raw_app_meta_data->>'provider','') = 'google'
          or coalesce(v_user.raw_app_meta_data->'providers','[]'::jsonb) ? 'google') then
    raise exception 'Solo se aceptan solicitudes de cuentas de Google.' using errcode = '42501';
  end if;

  if exists (select 1 from public.organization_memberships m
             where m.organization_id = v_org and m.user_id = v_uid and m.active) then
    return jsonb_build_object('status','already_has_access');
  end if;

  v_name := nullif(trim(coalesce(v_user.raw_user_meta_data->>'full_name', v_user.raw_user_meta_data->>'name','')),'');
  v_avatar := nullif(trim(coalesce(v_user.raw_user_meta_data->>'avatar_url', v_user.raw_user_meta_data->>'picture','')),'');

  if exists (select 1 from public.organization_access_requests r
             where r.organization_id = v_org and r.user_id = v_uid and r.status = 'dismissed'
               and r.resolved_at > now() - interval '24 hours')
     and not exists (select 1 from public.organization_access_requests r
             where r.organization_id = v_org and r.user_id = v_uid and r.status = 'pending') then
    return jsonb_build_object('status','dismissed');
  end if;

  select * into v_req from public.organization_access_requests r
  where r.organization_id = v_org and r.user_id = v_uid and r.status = 'pending';
  if found then
    if v_req.last_seen_at > now() - interval '10 minutes' then
      return jsonb_build_object('status','recorded');
    end if;
    update public.organization_access_requests
    set request_count = request_count + 1, last_seen_at = now(),
        email = lower(v_user.email), full_name = v_name, avatar_url = v_avatar
    where id = v_req.id;
  else
    insert into public.organization_access_requests(organization_id,user_id,email,full_name,avatar_url)
    values (v_org, v_uid, lower(v_user.email), v_name, v_avatar);
  end if;
  return jsonb_build_object('status','recorded');
end;
$$;

create or replace function app_private.list_organization_access_requests(p_organization_id uuid)
returns table(id uuid, user_id uuid, email text, full_name text, avatar_url text,
              requested_at timestamptz, last_seen_at timestamptz, request_count int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or (
    not app_private.has_org_role(p_organization_id,null,array['owner'])
    and not app_private.has_visualcorp_access(p_organization_id,'team','manage_members')
  ) then
    raise exception 'No tienes permiso para consultar las solicitudes de acceso.' using errcode = '42501';
  end if;
  return query
  select r.id, r.user_id, r.email, r.full_name, r.avatar_url, r.requested_at, r.last_seen_at, r.request_count
  from public.organization_access_requests r
  where r.organization_id = p_organization_id and r.status = 'pending'
  order by r.last_seen_at desc;
end;
$$;

create or replace function app_private.approve_organization_access_request(p_request_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.organization_access_requests%rowtype;
  v_profile public.access_profiles%rowtype;
begin
  if v_actor is null then raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501'; end if;
  select * into v_req from public.organization_access_requests where id = p_request_id for update;
  if not found then raise exception 'La solicitud no existe.' using errcode = 'P0002'; end if;
  if not app_private.has_org_role(v_req.organization_id,null,array['owner'])
     and not app_private.has_visualcorp_access(v_req.organization_id,'team','manage_members') then
    raise exception 'No tienes permiso para asignar perfiles.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then raise exception 'La solicitud ya fue resuelta.' using errcode = '22023'; end if;
  select * into v_profile from public.access_profiles
  where id = p_profile_id and organization_id = v_req.organization_id and active;
  if not found then raise exception 'El perfil no existe o no está activo.' using errcode = '22023'; end if;

  -- Reutiliza la logica de invitaciones: asigna directo (verifica owner/admin y perfil).
  perform app_private.create_organization_access_invitation(v_req.organization_id, v_req.email, p_profile_id);

  update public.organization_access_requests
  set status = 'approved', resolved_by = v_actor, resolved_at = now()
  where id = v_req.id;
  insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,profile_id,event_key,details)
  values (v_req.organization_id, v_actor, v_req.user_id, v_profile.id, 'access_request_approved',
          jsonb_build_object('request_id', v_req.id, 'email', v_req.email));
  return jsonb_build_object('status','approved','email',v_req.email,'profile_name',v_profile.name);
end;
$$;

create or replace function app_private.dismiss_organization_access_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.organization_access_requests%rowtype;
begin
  if v_actor is null then raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501'; end if;
  select * into v_req from public.organization_access_requests where id = p_request_id for update;
  if not found then raise exception 'La solicitud no existe.' using errcode = 'P0002'; end if;
  if not app_private.has_org_role(v_req.organization_id,null,array['owner'])
     and not app_private.has_visualcorp_access(v_req.organization_id,'team','manage_members') then
    raise exception 'No tienes permiso para gestionar solicitudes.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then return; end if;
  update public.organization_access_requests
  set status = 'dismissed', resolved_by = v_actor, resolved_at = now() where id = v_req.id;
  insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,event_key,details)
  values (v_req.organization_id, v_actor, v_req.user_id, 'access_request_dismissed',
          jsonb_build_object('request_id', v_req.id, 'email', v_req.email));
end;
$$;

create or replace function public.record_my_access_request()
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.record_my_access_request();
$$;
create or replace function public.list_organization_access_requests(p_organization_id uuid)
returns table(id uuid, user_id uuid, email text, full_name text, avatar_url text,
              requested_at timestamptz, last_seen_at timestamptz, request_count int)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.list_organization_access_requests(p_organization_id);
$$;
create or replace function public.approve_organization_access_request(p_request_id uuid, p_profile_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.approve_organization_access_request(p_request_id, p_profile_id);
$$;
create or replace function public.dismiss_organization_access_request(p_request_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select app_private.dismiss_organization_access_request(p_request_id);
$$;

revoke all on function app_private.record_my_access_request() from public, anon;
revoke all on function app_private.list_organization_access_requests(uuid) from public, anon;
revoke all on function app_private.approve_organization_access_request(uuid,uuid) from public, anon;
revoke all on function app_private.dismiss_organization_access_request(uuid) from public, anon;
revoke all on function public.record_my_access_request() from public, anon;
revoke all on function public.list_organization_access_requests(uuid) from public, anon;
revoke all on function public.approve_organization_access_request(uuid,uuid) from public, anon;
revoke all on function public.dismiss_organization_access_request(uuid) from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.record_my_access_request() to authenticated;
grant execute on function app_private.list_organization_access_requests(uuid) to authenticated;
grant execute on function app_private.approve_organization_access_request(uuid,uuid) to authenticated;
grant execute on function app_private.dismiss_organization_access_request(uuid) to authenticated;
grant execute on function public.record_my_access_request() to authenticated;
grant execute on function public.list_organization_access_requests(uuid) to authenticated;
grant execute on function public.approve_organization_access_request(uuid,uuid) to authenticated;
grant execute on function public.dismiss_organization_access_request(uuid) to authenticated;

-- Backfill idempotente: cuentas Google verificadas con inicio de sesion en los
-- ultimos 7 dias que aun no tienen membresia ni solicitud registrada.
insert into public.organization_access_requests (
  organization_id, user_id, email, full_name, avatar_url,
  status, request_count, requested_at, last_seen_at
)
select
  o.id,
  u.id,
  lower(u.email),
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '')), ''),
  'pending',
  1,
  coalesce(u.created_at, now()),
  coalesce(u.last_sign_in_at, now())
from public.organizations o
cross join auth.users u
where o.slug = 'visual-corp'
  and u.email is not null
  and u.email_confirmed_at is not null
  and u.last_sign_in_at >= now() - interval '7 days'
  and (
    coalesce(u.raw_app_meta_data->>'provider', '') = 'google'
    or coalesce(u.raw_app_meta_data->'providers', '[]'::jsonb) ? 'google'
  )
  and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = o.id and m.user_id = u.id
  )
  and not exists (
    select 1 from public.organization_access_requests r
    where r.organization_id = o.id and r.user_id = u.id
  );