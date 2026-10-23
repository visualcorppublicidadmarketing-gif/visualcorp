-- The editable access-profile migration removed the legacy role index.
-- Keep auth profile synchronization, and bootstrap approved identities through
-- the profile_id unique index that now owns global membership idempotency.
create or replace function app_private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  )
  on conflict (user_id)
  do update set email = excluded.email, updated_at = now();

  return new;
end;
$function$;

revoke all on function app_private.handle_auth_user() from public, anon, authenticated;

create or replace function app_private.bootstrap_visualcorp_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org uuid;
  v_email text := lower(coalesce(new.email, ''));
  v_expected integer;
  v_affected integer;
begin
  if v_email not in (
      'visualcorp.publicidad.marketing@gmail.com',
      'estebanico10@gmail.com'
    ) or new.email_confirmed_at is null then
    return new;
  end if;

  select id into v_org
  from public.organizations
  where slug = 'visual-corp'
  limit 1;

  if v_org is null then
    return new;
  end if;

  insert into public.profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    new.email
  )
  on conflict (user_id)
  do update set email = excluded.email, updated_at = now();

  if v_email = 'visualcorp.publicidad.marketing@gmail.com' then
    v_expected := 1;
    insert into public.organization_memberships
      (organization_id, user_id, role, active, profile_id)
    select v_org, new.id, 'owner', true, p.id
    from public.access_profiles p
    where p.organization_id = v_org and p.profile_key = 'owner'
    on conflict (organization_id, user_id, profile_id)
      where branch_id is null and profile_id is not null
    do update set role = excluded.role, active = true;
  else
    v_expected := 2;
    insert into public.organization_memberships
      (organization_id, user_id, role, active, profile_id)
    select v_org, new.id, assignment.role, true, p.id
    from (values
      ('admin', 'admin'),
      ('website_admin', 'website_admin')
    ) as assignment(role, profile_key)
    join public.access_profiles p
      on p.organization_id = v_org
     and p.profile_key = assignment.profile_key
    on conflict (organization_id, user_id, profile_id)
      where branch_id is null and profile_id is not null
    do update set role = excluded.role, active = true;
  end if;

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected then
    raise exception 'Visual Corp access profile bootstrap expected % assignments but saved %.',
      v_expected, v_affected;
  end if;

  return new;
end;
$function$;

revoke all on function app_private.bootstrap_visualcorp_owner() from public, anon, authenticated;
