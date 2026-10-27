-- Auth identities are project-wide. Only expose Google identity details for
-- accounts already associated with this organization; new accounts can still
-- be assigned by a known email through the guarded team-access RPC.
create or replace function app_private.list_visualcorp_google_accounts_for_team()
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
      and exists (
        select 1 from public.organization_memberships scoped
        where scoped.organization_id = v_org and scoped.user_id = u.id
      )
    order by lower(u.email);
end;
$$;

-- Expose an invoker RPC only; the restricted auth.users lookup stays internal.
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
language sql
stable
security invoker
set search_path = ''
as $$
  select * from app_private.list_visualcorp_google_accounts_for_team();
$$;

revoke all on function app_private.list_visualcorp_google_accounts_for_team() from public, anon;
revoke all on function public.list_visualcorp_google_accounts_for_team() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.list_visualcorp_google_accounts_for_team() to authenticated;
grant execute on function public.list_visualcorp_google_accounts_for_team() to authenticated;

-- Preserve the RPC signature for compatibility with an older client, but stop
-- returning unassigned auth.users across unrelated organizations. Assignment
-- remains possible through the explicit, permission-checked email form.
create or replace function public.list_visualcorp_login_candidates()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select null::uuid, null::text, null::text, null::timestamptz, null::timestamptz
  where false;
$$;

revoke all on function public.list_visualcorp_login_candidates() from public, anon;
grant execute on function public.list_visualcorp_login_candidates() to authenticated;
