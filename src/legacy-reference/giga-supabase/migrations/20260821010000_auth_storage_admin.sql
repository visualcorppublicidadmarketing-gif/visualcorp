-- Production access layer for Gigaprint.
-- This migration is additive and safe to run after supabase/schema.sql.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins can manage the CMS tables while public policies keep the storefront read-only.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['site_settings','services','products','promotions','pages','page_blocks','media_assets','service_questions','design_tokens'] loop
    execute format('drop policy if exists %I on public.%I', 'admins manage ' || table_name, table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', 'admins manage ' || table_name, table_name);
  end loop;
end $$;

drop policy if exists "admins read inquiries" on public.inquiries;
create policy "admins read inquiries" on public.inquiries
  for select to authenticated using (public.is_admin());
drop policy if exists "admins manage inquiries" on public.inquiries;
create policy "admins manage inquiries" on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete inquiries" on public.inquiries;
create policy "admins delete inquiries" on public.inquiries
  for delete to authenticated using (public.is_admin());

drop policy if exists "admins read submissions" on public.form_submissions;
create policy "admins read submissions" on public.form_submissions
  for select to authenticated using (public.is_admin());
drop policy if exists "admins manage submissions" on public.form_submissions;
create policy "admins manage submissions" on public.form_submissions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete submissions" on public.form_submissions;
create policy "admins delete submissions" on public.form_submissions
  for delete to authenticated using (public.is_admin());

-- Public brand assets can be read by the storefront. Private customer files are never public.
insert into storage.buckets (id, name, public)
values ('gigaprint-media', 'gigaprint-media', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('gigaprint-private', 'gigaprint-private', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public reads Gigaprint media" on storage.objects;
create policy "public reads Gigaprint media" on storage.objects
  for select using (bucket_id = 'gigaprint-media');

drop policy if exists "admins write Gigaprint media" on storage.objects;
create policy "admins write Gigaprint media" on storage.objects
  for all to authenticated using (bucket_id = 'gigaprint-media' and public.is_admin())
  with check (bucket_id = 'gigaprint-media' and public.is_admin());

drop policy if exists "admins manage private files" on storage.objects;
create policy "admins manage private files" on storage.objects
  for all to authenticated using (bucket_id = 'gigaprint-private' and public.is_admin())
  with check (bucket_id = 'gigaprint-private' and public.is_admin());

drop policy if exists "public can upload inquiry files" on storage.objects;
create policy "public can upload inquiry files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'gigaprint-private' and name like 'inquiries/%');
