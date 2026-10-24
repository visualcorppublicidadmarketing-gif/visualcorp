-- The returned OUT column is also named "id". Qualify the organization
-- lookup so PL/pgSQL cannot confuse it with that output variable.
create or replace function public.list_visualcorp_personnel_access_profiles()
returns table (id uuid, profile_key text, name text)
language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select o.id into v_org from public.organizations o where o.slug='visual-corp' limit 1;
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
