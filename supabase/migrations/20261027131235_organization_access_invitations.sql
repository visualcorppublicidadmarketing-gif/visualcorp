-- Organization-scoped access invitations. No email is sent by this migration;
-- recipients must sign in with the exact invited, verified email address.
create table public.organization_access_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null,
  invited_email text not null check (length(trim(invited_email)) between 3 and 320),
  normalized_email text generated always as (lower(trim(invited_email))) stored,
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  unique (id, organization_id),
  foreign key (profile_id, organization_id)
    references public.access_profiles(id, organization_id) on delete restrict
);

create unique index organization_access_invitations_pending_uq
  on public.organization_access_invitations (organization_id, normalized_email, profile_id)
  where status = 'pending';
create index organization_access_invitations_claim_idx
  on public.organization_access_invitations (normalized_email, expires_at)
  where status = 'pending';

alter table public.organization_access_invitations enable row level security;
revoke all on public.organization_access_invitations from public, anon, authenticated, service_role;

alter table public.access_audit_log
  drop constraint if exists access_audit_log_event_key_check;
alter table public.access_audit_log
  add constraint access_audit_log_event_key_check
  check (event_key in (
    'profile_created','profile_updated','profile_activated','profile_deactivated',
    'profile_assigned','membership_activated','membership_deactivated',
    'profile_invited','profile_invitation_accepted','profile_invitation_revoked'
  ));

create or replace function app_private.create_organization_access_invitation(
  p_organization_id uuid,
  p_email text,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_owner boolean;
  v_profile public.access_profiles%rowtype;
  v_user uuid;
  v_confirmed boolean := false;
  v_invitation public.organization_access_invitations%rowtype;
  v_pending record;
begin
  if v_actor is null then raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501'; end if;
  if v_email is null or length(v_email) not between 3 and 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido.' using errcode = '22023';
  end if;
  v_owner := app_private.has_org_role(p_organization_id, null, array['owner']);
  if not v_owner and not app_private.has_visualcorp_access(p_organization_id, 'team', 'manage_members') then
    raise exception 'No tienes permiso para asignar perfiles.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.access_profiles
  where id = p_profile_id and organization_id = p_organization_id and active;
  if not found or v_profile.profile_key = 'owner' then raise exception 'El perfil no existe o no se puede asignar.'; end if;
  if v_profile.base_role in ('admin','website_admin') and not v_owner then
    raise exception 'Solo el propietario puede asignar perfiles administrativos.' using errcode = '42501';
  end if;

  select id, email_confirmed_at is not null into v_user, v_confirmed
  from auth.users where lower(email) = v_email order by created_at limit 1;
  if v_user is not null and v_confirmed then
    insert into public.organization_memberships(organization_id,user_id,role,active,profile_id)
    values(p_organization_id,v_user,v_profile.base_role,true,v_profile.id)
    on conflict (organization_id,user_id,profile_id) where branch_id is null and profile_id is not null
    do update set role = excluded.role, active = true;
    for v_pending in update public.organization_access_invitations
      set status = 'revoked'
      where organization_id = p_organization_id and normalized_email = v_email
        and profile_id = v_profile.id and status = 'pending'
      returning id
    loop
      insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,profile_id,event_key,details)
      values(p_organization_id,v_actor,v_user,v_profile.id,'profile_invitation_revoked',jsonb_build_object('invitation_id',v_pending.id,'reason','access_assigned'));
    end loop;
    insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,profile_id,event_key,details)
    values(p_organization_id,v_actor,v_user,v_profile.id,'profile_assigned',jsonb_build_object('profile_key',v_profile.profile_key));
    return jsonb_build_object('status','assigned','email',v_email,'profile_id',v_profile.id);
  end if;

  insert into public.organization_access_invitations(organization_id,profile_id,invited_email,invited_by,expires_at)
  values(p_organization_id,v_profile.id,v_email,v_actor,now() + interval '7 days')
  on conflict (organization_id,normalized_email,profile_id) where status = 'pending'
  do update set invited_email = excluded.invited_email, invited_by = excluded.invited_by,
                created_at = now(), expires_at = excluded.expires_at
  returning * into v_invitation;
  insert into public.access_audit_log(organization_id,actor_user_id,profile_id,event_key,details)
  values(p_organization_id,v_actor,v_profile.id,'profile_invited',jsonb_build_object('invitation_id',v_invitation.id,'email',v_email,'profile_key',v_profile.profile_key));
  return jsonb_build_object('status','pending','email',v_email,'profile_id',v_profile.id,'invitation_id',v_invitation.id,'expires_at',v_invitation.expires_at);
end;
$$;

create or replace function app_private.list_organization_access_invitations(p_organization_id uuid)
returns table(id uuid, invited_email text, profile_id uuid, profile_name text, created_at timestamptz, expires_at timestamptz)
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
    raise exception 'No tienes permiso para consultar las invitaciones.' using errcode = '42501';
  end if;
  return query
    select i.id,i.invited_email,i.profile_id,p.name,i.created_at,i.expires_at
    from public.organization_access_invitations i
    join public.access_profiles p on p.id = i.profile_id and p.organization_id = i.organization_id
    where i.organization_id = p_organization_id and i.status = 'pending' and i.expires_at > now()
    order by i.created_at desc;
end;
$$;

create or replace function app_private.revoke_organization_access_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.organization_access_invitations%rowtype;
begin
  if v_actor is null then raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501'; end if;
  select * into v_invitation from public.organization_access_invitations where id = p_invitation_id for update;
  if not found then raise exception 'La invitación ya no está disponible.'; end if;
  if not app_private.has_org_role(v_invitation.organization_id,null,array['owner'])
     and not app_private.has_visualcorp_access(v_invitation.organization_id,'team','manage_members') then
    raise exception 'No tienes permiso para cancelar esta invitación.' using errcode = '42501';
  end if;
  if v_invitation.status <> 'pending' then raise exception 'La invitación ya fue procesada.'; end if;
  update public.organization_access_invitations set status = 'revoked' where id = p_invitation_id;
  insert into public.access_audit_log(organization_id,actor_user_id,profile_id,event_key,details)
  values(v_invitation.organization_id,v_actor,v_invitation.profile_id,'profile_invitation_revoked',jsonb_build_object('invitation_id',v_invitation.id,'email',v_invitation.invited_email));
end;
$$;

create or replace function app_private.claim_organization_access_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_count integer := 0;
  v_invitation record;
begin
  if v_actor is null then raise exception 'Inicia sesión para aceptar invitaciones.' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_actor and email_confirmed_at is not null;
  if v_email is null then return 0; end if;

  for v_invitation in
    select i.id,i.organization_id,i.profile_id,p.base_role,p.profile_key
    from public.organization_access_invitations i
    join public.access_profiles p on p.id = i.profile_id and p.organization_id = i.organization_id and p.active
    where i.normalized_email = v_email and i.status = 'pending' and i.expires_at > now()
      and p.profile_key <> 'owner'
    for update of i
  loop
    insert into public.organization_memberships(organization_id,user_id,role,active,profile_id)
    values(v_invitation.organization_id,v_actor,v_invitation.base_role,true,v_invitation.profile_id)
    on conflict (organization_id,user_id,profile_id) where branch_id is null and profile_id is not null
    do update set role = excluded.role, active = true;
    update public.organization_access_invitations
      set status = 'accepted',accepted_by = v_actor,accepted_at = now()
      where id = v_invitation.id;
    insert into public.access_audit_log(organization_id,actor_user_id,target_user_id,profile_id,event_key,details)
    values(v_invitation.organization_id,v_actor,v_actor,v_invitation.profile_id,'profile_invitation_accepted',jsonb_build_object('invitation_id',v_invitation.id,'profile_key',v_invitation.profile_key));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Keep the client-facing RPCs SECURITY INVOKER. Privileged work stays in the
-- unexposed app_private schema and each helper validates auth.uid() itself.
create or replace function public.create_organization_access_invitation(
  p_organization_id uuid,p_email text,p_profile_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.create_organization_access_invitation(p_organization_id,p_email,p_profile_id);
$$;

create or replace function public.list_organization_access_invitations(p_organization_id uuid)
returns table(id uuid, invited_email text, profile_id uuid, profile_name text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app_private.list_organization_access_invitations(p_organization_id);
$$;

create or replace function public.revoke_organization_access_invitation(p_invitation_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.revoke_organization_access_invitation(p_invitation_id);
$$;

create or replace function public.claim_organization_access_invitations()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select app_private.claim_organization_access_invitations();
$$;

-- Keep the old signature to return a clear error to stale clients. It has no
-- organization argument, so it must not guess a tenant or fall back to a slug.
create or replace function public.assign_visualcorp_profile(p_email text,p_profile_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501'; end if;
  raise exception 'Actualiza la aplicación para usar la asignación de perfil por organización.' using errcode = '0A000';
end;
$$;

-- The legacy role endpoint delegates to the profile RPC above. Keep a clear
-- response for stale clients without retaining SECURITY DEFINER privileges.
create or replace function public.assign_visualcorp_role(p_email text,p_role text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501'; end if;
  raise exception 'Actualiza la aplicación para usar la asignación de perfil por organización.' using errcode = '0A000';
end;
$$;

revoke all on function app_private.create_organization_access_invitation(uuid,text,uuid) from public, anon;
revoke all on function app_private.list_organization_access_invitations(uuid) from public, anon;
revoke all on function app_private.revoke_organization_access_invitation(uuid) from public, anon;
revoke all on function app_private.claim_organization_access_invitations() from public, anon;
revoke all on function public.assign_visualcorp_profile(text,uuid) from public, anon;
revoke all on function public.assign_visualcorp_role(text,text) from public, anon;
revoke all on function public.create_organization_access_invitation(uuid,text,uuid) from public, anon;
revoke all on function public.list_organization_access_invitations(uuid) from public, anon;
revoke all on function public.revoke_organization_access_invitation(uuid) from public, anon;
revoke all on function public.claim_organization_access_invitations() from public, anon;
grant execute on function app_private.create_organization_access_invitation(uuid,text,uuid) to authenticated;
grant execute on function app_private.list_organization_access_invitations(uuid) to authenticated;
grant execute on function app_private.revoke_organization_access_invitation(uuid) to authenticated;
grant execute on function app_private.claim_organization_access_invitations() to authenticated;
grant usage on schema app_private to authenticated;
grant execute on function public.create_organization_access_invitation(uuid,text,uuid) to authenticated;
grant execute on function public.list_organization_access_invitations(uuid) to authenticated;
grant execute on function public.revoke_organization_access_invitation(uuid) to authenticated;
grant execute on function public.claim_organization_access_invitations() to authenticated;
grant execute on function public.assign_visualcorp_profile(text,uuid) to authenticated;
grant execute on function public.assign_visualcorp_role(text,text) to authenticated;
