-- Reversible organization-level access suspension. This does not delete the
-- Google identity or the Supabase Auth user; historical references are kept.
create or replace function public.list_visualcorp_google_accounts_for_team()
returns table (
  user_id uuid,
  email text,
  full_name text,
  last_sign_in_at timestamptz,
  linked_personnel_name text,
  access_profiles text[],
  access_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if auth.uid() is null or not app_private.has_visualcorp_access(v_org, 'team', 'view') then
    raise exception 'No tienes permiso para consultar las cuentas Google del equipo.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text,
      coalesce(nullif(trim(p.full_name), ''), u.email::text), u.last_sign_in_at,
      pr.full_name,
      coalesce(m.profiles, array[]::text[]), coalesce(m.access_active, false)
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.personnel_account_links l on l.organization_id = v_org and l.user_id = u.id
    left join public.personnel_records pr on pr.organization_id = l.organization_id and pr.id = l.personnel_id
    left join lateral (
      select array_agg(distinct coalesce(ap.name, x.role) order by coalesce(ap.name, x.role)) profiles,
        bool_or(x.active and coalesce(ap.active, true)) access_active
      from public.organization_memberships x
      left join public.access_profiles ap on ap.id = x.profile_id and ap.organization_id = x.organization_id
      where x.organization_id = v_org and x.user_id = u.id
    ) m on true
    where u.last_sign_in_at is not null
      and u.email is not null
      and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
    order by lower(u.email);
end;
$$;

revoke all on function public.list_visualcorp_google_accounts_for_team() from public, anon;
grant execute on function public.list_visualcorp_google_accounts_for_team() to authenticated;

create or replace function public.set_visualcorp_user_access_active(
  p_user_id uuid,
  p_active boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_target_role text;
  v_changed integer := 0;
  v_active_admins integer;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para cambiar el acceso.' using errcode = '42501';
  end if;
  if p_user_id is null or p_active is null then
    raise exception 'Selecciona una cuenta y un estado válido.' using errcode = '22004';
  end if;
  if v_actor = p_user_id then
    raise exception 'No puedes bloquear tu propia cuenta.' using errcode = '42501';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    raise exception 'No se encontró la organización.';
  end if;
  if not app_private.has_org_role(v_org, null, array['owner'])
     and not app_private.has_visualcorp_access(v_org, 'team', 'manage_members') then
    raise exception 'No tienes permiso para cambiar accesos del equipo.' using errcode = '42501';
  end if;

  perform 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id
    for update;
  if not found then
    raise exception 'La cuenta no tiene accesos de Visual Corp para actualizar.';
  end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'El acceso de propietario está protegido.' using errcode = '42501';
  end if;

  if not p_active then
    select count(*) into v_active_admins from public.organization_memberships
      where organization_id = v_org and role = 'admin' and active
        and user_id <> p_user_id;
    if exists (select 1 from public.organization_memberships
      where organization_id = v_org and user_id = p_user_id and role = 'admin' and active)
      and v_active_admins = 0 then
      raise exception 'No se puede bloquear a la última cuenta Admin activa.' using errcode = '42501';
    end if;
  end if;

  update public.organization_memberships
    set active = p_active
    where organization_id = v_org and user_id = p_user_id and active <> p_active;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    insert into public.access_audit_log(
      organization_id, actor_user_id, target_user_id, event_key, details
    ) values (
      v_org, v_actor, p_user_id,
      case when p_active then 'user_access_reactivated' else 'user_access_blocked' end,
      jsonb_build_object('memberships_changed', v_changed, 'scope', 'visual-corp')
    );
  end if;
  return v_changed;
end;
$$;

revoke all on function public.set_visualcorp_user_access_active(uuid, boolean) from public, anon;
grant execute on function public.set_visualcorp_user_access_active(uuid, boolean) to authenticated;

create or replace function public.remove_visualcorp_user_access(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_removed integer := 0;
  v_admin_memberships integer;
begin
  if v_actor is null then
    raise exception 'Inicia sesión para retirar accesos.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Selecciona una cuenta válida.' using errcode = '22004';
  end if;
  if v_actor = p_user_id then
    raise exception 'No puedes retirar tu propia cuenta.' using errcode = '42501';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    raise exception 'No se encontró la organización.';
  end if;
  if not app_private.has_org_role(v_org, null, array['owner'])
     and not app_private.has_visualcorp_access(v_org, 'team', 'manage_members') then
    raise exception 'No tienes permiso para retirar accesos del equipo.' using errcode = '42501';
  end if;

  perform 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id
    for update;
  if not found then
    raise exception 'La cuenta no tiene perfiles asignados en Visual Corp.';
  end if;
  if exists (
    select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role = 'owner'
  ) then
    raise exception 'El acceso de propietario está protegido.' using errcode = '42501';
  end if;

  select count(*) into v_admin_memberships from public.organization_memberships
    where organization_id = v_org and role = 'admin' and active and user_id <> p_user_id;
  if exists (select 1 from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id and role = 'admin' and active)
    and v_admin_memberships = 0 then
    raise exception 'No se puede retirar la última cuenta Admin activa.' using errcode = '42501';
  end if;

  delete from public.organization_memberships
    where organization_id = v_org and user_id = p_user_id;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    insert into public.access_audit_log(
      organization_id, actor_user_id, target_user_id, event_key, details
    ) values (
      v_org, v_actor, p_user_id, 'user_access_removed',
      jsonb_build_object('memberships_removed', v_removed, 'scope', 'visual-corp')
    );
  end if;
  return v_removed;
end;
$$;

revoke all on function public.remove_visualcorp_user_access(uuid) from public, anon;
grant execute on function public.remove_visualcorp_user_access(uuid) to authenticated;
