create policy profiles_staff_read on public.profiles for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.user_id = profiles.user_id and m.active
      and app_private.has_org_role(m.organization_id, null, array['owner','admin','manager'])
  ));

create or replace function public.assign_visualcorp_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_user uuid;
  v_caller_is_owner boolean;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then raise exception 'Visual Corp no está configurado.'; end if;
  v_caller_is_owner := app_private.has_org_role(v_org, null, array['owner']);
  if not v_caller_is_owner and not app_private.has_org_role(v_org, null, array['admin']) then
    raise exception 'Solo el propietario o un administrador puede gestionar perfiles.';
  end if;
  if p_role not in ('admin','manager','advisor','warehouse','production','marketing','website_admin') then
    raise exception 'El perfil solicitado no está permitido.';
  end if;
  if p_role = 'website_admin' and not v_caller_is_owner then
    raise exception 'Solo el propietario puede asignar administración de la página web.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'Ese correo todavía no ha iniciado sesión en Visual Corp.'; end if;
  insert into public.organization_memberships (organization_id, user_id, role, active)
  values (v_org, v_user, p_role, true)
  on conflict (organization_id, user_id, role) where branch_id is null
  do update set active = true;
end;
$$;
revoke all on function public.assign_visualcorp_role(text,text) from public, anon;
grant execute on function public.assign_visualcorp_role(text,text) to authenticated;
