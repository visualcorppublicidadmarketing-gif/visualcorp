-- The function's OUT column is also named `id`; qualify the organization
-- lookup to avoid PL/pgSQL resolving `id` as both an OUT variable and column.
create or replace function public.list_visualcorp_team_members()
returns table(
  id uuid, user_id uuid, role text, profile_id uuid, active boolean,
  created_at timestamptz, full_name text, email text, last_sign_in_at timestamptz,
  access_profile_name text, access_profile_key text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select o.id into v_org
  from public.organizations o
  where o.slug='visual-corp'
  limit 1;

  if auth.uid() is null or not app_private.has_visualcorp_access(v_org,'team','view') then
    return;
  end if;

  return query
    select m.id,m.user_id,m.role,m.profile_id,m.active,m.created_at,
      p.full_name,p.email,u.last_sign_in_at,ap.name,ap.profile_key
    from public.organization_memberships m
    left join public.profiles p on p.user_id=m.user_id
    left join auth.users u on u.id=m.user_id
    left join public.access_profiles ap on ap.id=m.profile_id and ap.organization_id=m.organization_id
    where m.organization_id=v_org
    order by m.created_at;
end;
$$;

revoke all on function public.list_visualcorp_team_members() from public, anon;
grant execute on function public.list_visualcorp_team_members() to authenticated;
