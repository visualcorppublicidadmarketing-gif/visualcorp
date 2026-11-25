create table public.admin_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 120),
  description text not null check (length(trim(description)) between 8 and 2400),
  category text not null check (category in ('website','physical_store','customer_service','process','team','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'new' check (status in ('new','reviewing','planned','in_progress','completed')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index admin_suggestions_org_created_idx
  on public.admin_suggestions (organization_id, created_at desc);

create index admin_suggestions_org_status_idx
  on public.admin_suggestions (organization_id, status);

alter table public.admin_suggestions enable row level security;
revoke all on public.admin_suggestions from anon, authenticated;
grant select on public.admin_suggestions to authenticated;
grant insert (organization_id, title, description, category, priority)
  on public.admin_suggestions to authenticated;
grant update (status) on public.admin_suggestions to authenticated;

create policy admin_suggestions_select
  on public.admin_suggestions for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'team', 'view'));

create policy admin_suggestions_insert
  on public.admin_suggestions for insert to authenticated
  with check (
    app_private.has_visualcorp_access(organization_id, 'team', 'view')
    and created_by is not distinct from (select auth.uid())
  );

create policy admin_suggestions_update
  on public.admin_suggestions for update to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'team', 'manage_suggestions'))
  with check (app_private.has_visualcorp_access(organization_id, 'team', 'manage_suggestions'));
