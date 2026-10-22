-- Provision only the two primary, verified Google identities authorized by the owner.
-- visualcorp.publicidad.marketing@gmail.com remains the organization owner.
-- estebanico10@gmail.com receives both internal POS admin and website admin roles.
create or replace function app_private.bootstrap_visualcorp_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_email text := lower(coalesce(new.email, ''));
begin
  if v_email not in (
      'visualcorp.publicidad.marketing@gmail.com',
      'estebanico10@gmail.com'
    ) or new.email_confirmed_at is null then
    return new;
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then
    return new;
  end if;

  insert into public.profiles (user_id, full_name, email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email), new.email)
  on conflict (user_id) do update set email = excluded.email, updated_at = now();

  if v_email = 'visualcorp.publicidad.marketing@gmail.com' then
    insert into public.organization_memberships (organization_id, user_id, role, active)
    values (v_org, new.id, 'owner', true)
    on conflict (organization_id, user_id, role) where branch_id is null do update set active = true;
  else
    insert into public.organization_memberships (organization_id, user_id, role, active)
    values
      (v_org, new.id, 'admin', true),
      (v_org, new.id, 'website_admin', true)
    on conflict (organization_id, user_id, role) where branch_id is null do update set active = true;
  end if;
  return new;
end;
$$;

revoke all on function app_private.bootstrap_visualcorp_owner() from public, anon, authenticated;

-- Also provision either account if it was already registered before this migration.
do $$
declare
  v_user record;
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null then return; end if;

  for v_user in
    select id, email, raw_user_meta_data
    from auth.users
    where email_confirmed_at is not null
      and lower(coalesce(email, '')) in (
        'visualcorp.publicidad.marketing@gmail.com',
        'estebanico10@gmail.com'
      )
  loop
    insert into public.profiles (user_id, full_name, email)
    values (v_user.id, coalesce(nullif(v_user.raw_user_meta_data ->> 'full_name', ''), v_user.email), v_user.email)
    on conflict (user_id) do update set email = excluded.email, updated_at = now();

    if lower(v_user.email) = 'visualcorp.publicidad.marketing@gmail.com' then
      insert into public.organization_memberships (organization_id, user_id, role, active)
      values (v_org, v_user.id, 'owner', true)
      on conflict (organization_id, user_id, role) where branch_id is null do update set active = true;
    else
      insert into public.organization_memberships (organization_id, user_id, role, active)
      values
        (v_org, v_user.id, 'admin', true),
        (v_org, v_user.id, 'website_admin', true)
      on conflict (organization_id, user_id, role) where branch_id is null do update set active = true;
    end if;
  end loop;
end;
$$;
