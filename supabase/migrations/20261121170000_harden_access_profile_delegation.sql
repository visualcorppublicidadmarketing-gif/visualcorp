-- Organization invitations grant an unscoped membership, so delegated access
-- must be no broader than the inviter's organization-wide access.
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
  v_actor_email text;
  v_owner boolean;
  v_profile public.access_profiles%rowtype;
  v_user uuid;
  v_confirmed boolean := false;
  v_invitation public.organization_access_invitations%rowtype;
  v_pending record;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para gestionar accesos.' using errcode = '42501';
  end if;
  if v_email is null or length(v_email) not between 3 and 320
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Escribe un correo válido.' using errcode = '22023';
  end if;

  select lower(trim(u.email)) into v_actor_email
  from auth.users u
  where u.id = v_actor;
  if v_actor_email is not null and v_email = v_actor_email then
    raise exception 'No puedes asignarte un perfil a tu propia cuenta.' using errcode = '42501';
  end if;

  v_owner := app_private.has_org_role(p_organization_id, null, array['owner']);
  if not v_owner and not app_private.has_visualcorp_access_orgwide(
    p_organization_id, 'team', 'manage_members'
  ) then
    raise exception 'No tienes permiso para asignar perfiles en toda la organización.' using errcode = '42501';
  end if;

  select * into v_profile
  from public.access_profiles
  where id = p_profile_id
    and organization_id = p_organization_id
    and active
  for share;

  if not found or v_profile.profile_key = 'owner' or v_profile.base_role = 'owner' then
    raise exception 'El perfil no existe o no se puede asignar.' using errcode = '42501';
  end if;

  if not v_owner then
    if v_profile.base_role in ('admin', 'website_admin') then
      raise exception 'Solo el propietario puede asignar perfiles administrativos.' using errcode = '42501';
    end if;

    -- Keep the legacy role ceiling as well as the editable permission ceiling:
    -- older RPCs and policies may still consult organization_memberships.role.
    if not exists (
      select 1
      from public.organization_memberships actor_membership
      join public.access_profiles actor_profile
        on actor_profile.id = coalesce(actor_membership.profile_id, (
          select legacy.id
          from public.access_profiles legacy
          where legacy.organization_id = actor_membership.organization_id
            and legacy.profile_key = case actor_membership.role
              when 'manager' then 'gerencia'
              when 'advisor' then 'asesoras'
              when 'warehouse' then 'inventario'
              when 'production' then 'personal_taller'
              else actor_membership.role
            end
          limit 1
        ))
        and actor_profile.organization_id = actor_membership.organization_id
      where actor_membership.organization_id = p_organization_id
        and actor_membership.user_id = v_actor
        and actor_membership.active
        and actor_membership.branch_id is null
        and actor_profile.active
        and (
          actor_membership.role = v_profile.base_role
          or (
            actor_membership.role = 'admin'
            and v_profile.base_role in ('manager', 'advisor', 'warehouse', 'production', 'marketing')
          )
          or (
            actor_membership.role = 'manager'
            and v_profile.base_role in ('advisor', 'warehouse', 'production', 'marketing')
          )
        )
    ) then
      raise exception 'No puedes asignar un perfil con un rol base superior al tuyo.' using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.access_profile_permissions target_permission
      where target_permission.profile_id = v_profile.id
        and target_permission.enabled
        and not app_private.has_visualcorp_access_orgwide(
          p_organization_id,
          target_permission.module_key,
          target_permission.action_key
        )
    ) then
      raise exception 'No puedes delegar permisos que tu perfil no tiene en toda la organización.' using errcode = '42501';
    end if;
  end if;

  select u.id, u.email_confirmed_at is not null
  into v_user, v_confirmed
  from auth.users u
  where lower(trim(u.email)) = v_email
  order by u.created_at
  limit 1;

  if v_user = v_actor then
    raise exception 'No puedes asignarte un perfil a tu propia cuenta.' using errcode = '42501';
  end if;

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

-- Preserve the existing authenticated-only RPC surface.
revoke all on function app_private.create_organization_access_invitation(uuid,text,uuid) from public, anon;
grant execute on function app_private.create_organization_access_invitation(uuid,text,uuid) to authenticated;

-- Pending invitations may outlive changes to the inviter's membership or profile.
-- Revalidate the original delegation before turning one into a membership.
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
  v_authorized boolean;
  v_revoke_reason text;
  v_invitation record;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para aceptar invitaciones.' using errcode = '42501';
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u
  where u.id = v_actor and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  for v_invitation in
    select i.id, i.organization_id, i.profile_id, i.invited_by, i.invited_email,
      p.base_role, p.profile_key, p.active as profile_active
    from public.organization_access_invitations i
    join public.access_profiles p
      on p.id = i.profile_id and p.organization_id = i.organization_id
    where i.normalized_email = v_email
      and i.status = 'pending'
      and i.expires_at > now()
    for update of i
  loop
    v_revoke_reason := null;

    if not v_invitation.profile_active
      or v_invitation.profile_key = 'owner'
      or v_invitation.base_role = 'owner' then
      v_revoke_reason := 'target_profile_unavailable';
    else
      select
        exists (
          select 1
          from public.organization_memberships owner_membership
          where owner_membership.organization_id = v_invitation.organization_id
            and owner_membership.user_id = v_invitation.invited_by
            and owner_membership.active
            and owner_membership.branch_id is null
            and owner_membership.role = 'owner'
        )
        or exists (
          select 1
          from public.organization_memberships inviter_membership
          join public.access_profiles inviter_profile
            on inviter_profile.id = coalesce(inviter_membership.profile_id, (
              select legacy.id
              from public.access_profiles legacy
              where legacy.organization_id = inviter_membership.organization_id
                and legacy.profile_key = case inviter_membership.role
                  when 'manager' then 'gerencia'
                  when 'advisor' then 'asesoras'
                  when 'warehouse' then 'inventario'
                  when 'production' then 'personal_taller'
                  else inviter_membership.role
                end
              limit 1
            ))
            and inviter_profile.organization_id = inviter_membership.organization_id
          where inviter_membership.organization_id = v_invitation.organization_id
            and inviter_membership.user_id = v_invitation.invited_by
            and inviter_membership.active
            and inviter_membership.branch_id is null
            and inviter_profile.active
            and v_invitation.base_role not in ('owner', 'admin', 'website_admin')
            and exists (
              select 1
              from public.access_profile_permissions manage_permission
              where manage_permission.profile_id = inviter_profile.id
                and manage_permission.module_key = 'team'
                and manage_permission.action_key = 'manage_members'
                and manage_permission.enabled
            )
            and (
              inviter_membership.role = v_invitation.base_role
              or (
                inviter_membership.role = 'admin'
                and v_invitation.base_role in ('manager', 'advisor', 'warehouse', 'production', 'marketing')
              )
              or (
                inviter_membership.role = 'manager'
                and v_invitation.base_role in ('advisor', 'warehouse', 'production', 'marketing')
              )
            )
            and not exists (
              select 1
              from public.access_profile_permissions target_permission
              where target_permission.profile_id = v_invitation.profile_id
                and target_permission.enabled
                and not exists (
                  select 1
                  from public.access_profile_permissions inviter_permission
                  where inviter_permission.profile_id = inviter_profile.id
                    and inviter_permission.module_key = target_permission.module_key
                    and inviter_permission.enabled
                    and (
                      inviter_permission.action_key = target_permission.action_key
                      or (
                        target_permission.action_key = 'view'
                        and inviter_permission.action_key = 'edit'
                      )
                    )
                )
            )
        )
      into v_authorized;

      if not v_authorized then
        v_revoke_reason := 'inviter_authority_or_permissions_changed';
      end if;
    end if;

    if v_revoke_reason is not null then
      update public.organization_access_invitations
      set status = 'revoked'
      where id = v_invitation.id;

      insert into public.access_audit_log(
        organization_id, actor_user_id, target_user_id, profile_id, event_key, details
      ) values (
        v_invitation.organization_id, v_actor, v_actor, v_invitation.profile_id,
        'profile_invitation_revoked',
        jsonb_build_object(
          'invitation_id', v_invitation.id,
          'email', v_invitation.invited_email,
          'invited_by', v_invitation.invited_by,
          'reason', v_revoke_reason
        )
      );
      continue;
    end if;

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

revoke all on function app_private.claim_organization_access_invitations() from public, anon;
grant execute on function app_private.claim_organization_access_invitations() to authenticated;
