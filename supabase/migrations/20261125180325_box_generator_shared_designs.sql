create table public.box_generator_designs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  storage_path text not null,
  revision integer not null default 1 check (revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_path),
  check (storage_path ~ ('^' || organization_id::text || '/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]vcbox[.]json$'))
);

create index box_generator_designs_org_updated_idx
  on public.box_generator_designs (organization_id, updated_at desc);

alter table public.box_generator_designs enable row level security;
revoke all on public.box_generator_designs from anon, authenticated;
grant select on public.box_generator_designs to authenticated;
grant insert (id, organization_id, title, storage_path, revision, created_by, updated_by, updated_at)
  on public.box_generator_designs to authenticated;
grant update (title, storage_path, revision, updated_by, updated_at) on public.box_generator_designs to authenticated;

create or replace function app_private.enforce_box_generator_design_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'A new shared box design must start at revision 1.';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'The identity and creator of a shared box design are immutable.';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'A shared box design revision must increase by exactly one.';
  end if;
  if new.storage_path = old.storage_path then
    raise exception 'Each saved revision must point to a new immutable storage object.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function app_private.enforce_box_generator_design_revision() from public, anon, authenticated;
create trigger box_generator_design_revision_guard
  before insert or update on public.box_generator_designs
  for each row execute function app_private.enforce_box_generator_design_revision();

create policy box_generator_designs_read
  on public.box_generator_designs for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'workshop', 'view'));

create policy box_generator_designs_create
  on public.box_generator_designs for insert to authenticated
  with check (
    app_private.has_visualcorp_access(organization_id, 'workshop', 'edit')
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and revision = 1
  );

create policy box_generator_designs_update
  on public.box_generator_designs for update to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'workshop', 'edit'))
  with check (
    app_private.has_visualcorp_access(organization_id, 'workshop', 'edit')
    and updated_by = (select auth.uid())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('box-generator-designs', 'box-generator-designs', false, 26214400, array['application/json'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy box_generator_designs_storage_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'box-generator-designs'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]vcbox[.]json$'
    and app_private.has_visualcorp_access(
      case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'workshop', 'view'
    )
    and exists (
      select 1 from public.box_generator_designs design
      where design.organization_id = case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end
        and design.id = case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid else null end
        and design.storage_path = name
    )
  );

create policy box_generator_designs_storage_create
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'box-generator-designs'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]vcbox[.]json$'
    and app_private.has_visualcorp_access(
      case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'workshop', 'edit'
    )
  );

create policy box_generator_designs_storage_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'box-generator-designs'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]vcbox[.]json$'
    and app_private.has_visualcorp_access(
      case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end,
      'workshop', 'edit'
    )
    and not exists (
      select 1 from public.box_generator_designs design
      where design.organization_id = case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid else null end
        and design.id = case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[2])::uuid else null end
        and design.storage_path = name
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'box_generator_designs'
     ) then
    alter publication supabase_realtime add table public.box_generator_designs;
  end if;
end;
$$;
