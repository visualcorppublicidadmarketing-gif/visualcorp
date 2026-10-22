-- Promote the two approved owners to the strongest CMS role.
-- The RLS function treats both admin and super_admin as privileged roles.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'editor'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin', 'admin')
  );
$$;

update public.profiles
set role = 'super_admin', updated_at = now()
where id in (
  select id from auth.users
  where lower(email) in (lower('ecgigaprint@gmail.com'), lower('estebanico10@gmail.com'))
);
