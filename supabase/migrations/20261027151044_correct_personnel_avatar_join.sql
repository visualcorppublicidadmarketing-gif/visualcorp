-- Rebuild the applied personnel-avatar lookup from the current remote function definition.
create or replace function app_private.list_visualcorp_personnel_accounts_with_avatars()
returns table (
  user_id uuid,
  email text,
  full_name text,
  last_sign_in_at timestamptz,
  linked_personnel_id uuid,
  linked_personnel_name text,
  roles text[],
  access_profiles text[],
  access_active boolean,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if auth.uid() is null
    or not app_private.has_visualcorp_access(v_org, 'team', 'manage_members')
    or not app_private.has_visualcorp_access(v_org, 'personnel', 'edit') then
    raise exception 'Necesitas permisos para gestionar personal y accesos del equipo.' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, coalesce(nullif(trim(p.full_name), ''), u.email::text), u.last_sign_in_at,
      l.personnel_id, r.full_name, coalesce(m.roles, array[]::text[]), coalesce(m.profiles, array[]::text[]), coalesce(m.access_active, false),
      coalesce(nullif(trim(u.raw_user_meta_data ->> 'picture'), ''), nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), ''))
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.personnel_account_links l on l.organization_id = v_org and l.user_id = u.id
    left join public.personnel_records r on r.organization_id = l.organization_id and r.id = l.personnel_id
    left join lateral (
      select array_agg(distinct x.role order by x.role) roles,
        array_agg(distinct coalesce(ap.name, x.role) order by coalesce(ap.name, x.role)) profiles,
        bool_or(x.active and coalesce(ap.active, true)) access_active
      from public.organization_memberships x
      left join public.access_profiles ap on ap.id = x.profile_id
      where x.organization_id = v_org and x.user_id = u.id
    ) m on true
    where u.last_sign_in_at is not null and u.email is not null
      and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
    order by lower(u.email);
end;
$function$;
