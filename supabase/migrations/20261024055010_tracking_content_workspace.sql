-- Centralize the existing Visual Content Studio records in the Visual Corp
-- workspace. Source IDs remain stable so the import can be safely repeated.

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido',
  source_id text not null,
  scheduled_date text not null default '', scheduled_time text not null default '',
  content_line text not null default '', title text not null default '', format text not null default '',
  cover text not null default '', art text not null default '', art_text text not null default '',
  caption text not null default '', video text not null default '', voiceover text not null default '',
  status text not null default 'Por iniciar', owner text not null default '', platform text not null default 'Instagram',
  reach integer not null default 0, interactions integer not null default 0, clicks integer not null default 0,
  leads integer not null default 0, external_url text not null default '', notes text not null default '',
  source_row integer, created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  cover_status text not null default 'Por confirmar', art_status text not null default 'Por confirmar',
  caption_status text not null default 'Por confirmar', video_status text not null default 'Por confirmar',
  voiceover_status text not null default 'Por confirmar', tiktok_status text not null default 'Por confirmar',
  next_action text not null default '', due_date text not null default '',
  imported_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id),
  unique (organization_id, source_id), unique (organization_id, id)
);

create table if not exists public.marketing_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null,
  rel_path text not null, filename text not null, section text not null default '', folder text not null default '',
  extension text not null default '', size_bytes bigint not null default 0, modified_ns bigint not null default 0,
  width integer, height integer, preview_status text not null default 'pending', preview_error text not null default '',
  is_available boolean not null default false, scanned_at timestamp without time zone,
  updated_at timestamp without time zone, storage_status text not null default 'local_only',
  imported_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id),
  unique (organization_id, source_id), unique (organization_id, id),
  unique (organization_id, rel_path)
);

create table if not exists public.marketing_post_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null,
  source_post_id text not null, source_asset_id text not null,
  post_id uuid not null, asset_id uuid not null, role text not null default 'Arte final',
  created_at timestamp without time zone not null default now(), imported_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id),
  unique (organization_id, post_id, asset_id, role),
  foreign key (organization_id, post_id) references public.marketing_posts(organization_id, id) on delete cascade,
  foreign key (organization_id, asset_id) references public.marketing_assets(organization_id, id) on delete restrict
);

create table if not exists public.marketing_lead_tracking (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null,
  lead_ref text not null default '', product_interest text not null default '', source_post_id text,
  quote_ref text not null default '', stage text not null default 'Consulta', assigned_username text not null default '',
  sale_amount numeric, sale_evidence text not null default '', notes text not null default '', created_by text not null default '',
  created_at timestamp without time zone not null default now(), updated_at timestamp without time zone not null default now(),
  imported_at timestamptz not null default now(), unique (organization_id, source_system, source_id),
  foreign key (organization_id, source_post_id) references public.marketing_posts(organization_id, source_id) on delete set null (source_post_id)
);

create table if not exists public.marketing_sales_snapshots (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null,
  source_name text not null, source_hash text not null, imported_at timestamp without time zone not null default now(),
  data_json jsonb not null, copied_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id), unique (organization_id, source_hash)
);

create table if not exists public.marketing_strategy_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null,
  category text not null, title text not null, detail text not null default '', evidence text not null default 'Hipótesis',
  status text not null default 'Por validar', owner text not null default '',
  created_at timestamp without time zone not null default now(), updated_at timestamp without time zone not null default now(),
  imported_at timestamptz not null default now(), unique (organization_id, source_system, source_id)
);

create table if not exists public.marketing_work_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null,
  order_ref text not null default '', title text not null, process_area text not null, stage text not null default 'Pendiente',
  priority text not null default 'Normal', due_date text not null default '', assigned_username text not null default '',
  notes text not null default '', created_by text not null default '',
  created_at timestamp without time zone not null default now(), updated_at timestamp without time zone not null default now(),
  next_action text not null default '', blocked_reason text not null default '', imported_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id), unique (organization_id, source_id), unique (organization_id, id)
);

create table if not exists public.marketing_work_item_history (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'tracking-contenido', source_id text not null, source_work_item_id text not null,
  work_item_id uuid not null, actor_username text not null, action text not null, details text not null default '',
  created_at timestamp without time zone not null default now(), imported_at timestamptz not null default now(),
  unique (organization_id, source_system, source_id),
  foreign key (organization_id, work_item_id) references public.marketing_work_items(organization_id, id) on delete cascade
);

create table if not exists public.marketing_post_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  post_id uuid not null, actor_id uuid references auth.users(id) on delete set null,
  field_name text not null, previous_value text not null default '', new_value text not null default '',
  created_at timestamptz not null default now(),
  foreign key (organization_id, post_id) references public.marketing_posts(organization_id, id) on delete cascade
);

create table if not exists public.marketing_import_batches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null, source_name text not null, source_sha256 text not null, row_counts jsonb not null,
  status text not null default 'completed', imported_at timestamptz not null default now(),
  unique (organization_id, source_system, source_sha256)
);

create index if not exists marketing_posts_calendar_idx on public.marketing_posts(organization_id, scheduled_date, status);
create index if not exists marketing_assets_section_idx on public.marketing_assets(organization_id, section, is_available);
create index if not exists marketing_work_items_due_idx on public.marketing_work_items(organization_id, due_date, stage);
create index if not exists marketing_strategy_category_idx on public.marketing_strategy_items(organization_id, category, status);
create index if not exists marketing_post_events_recent_idx on public.marketing_post_events(organization_id, post_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['marketing_posts','marketing_assets','marketing_post_assets','marketing_lead_tracking',
    'marketing_sales_snapshots','marketing_strategy_items','marketing_work_items','marketing_work_item_history',
    'marketing_post_events','marketing_import_batches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon', t);
    if t in ('marketing_post_events','marketing_import_batches') then
      execute format('grant select on public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end if;
    execute format('create policy marketing_member on public.%I for all to authenticated using (
      app_private.has_visualcorp_access(organization_id,''marketing'',''view'') or
      app_private.has_visualcorp_access(organization_id,''marketing'',''edit'') or
      app_private.has_visualcorp_access(organization_id,''marketing'',''delete_records'')) with check (
      app_private.has_visualcorp_access(organization_id,''marketing'',''edit''))', t);
    execute format('create policy vc_access_select on public.%I as restrictive for select to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''view''))', t);
    execute format('create policy vc_access_insert on public.%I as restrictive for insert to authenticated with check (app_private.has_visualcorp_access(organization_id,''marketing'',''edit''))', t);
    execute format('create policy vc_access_update on public.%I as restrictive for update to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''edit'')) with check (app_private.has_visualcorp_access(organization_id,''marketing'',''edit''))', t);
    execute format('create policy vc_access_delete on public.%I as restrictive for delete to authenticated using (app_private.has_visualcorp_access(organization_id,''marketing'',''delete_records''))', t);
  end loop;
end $$;

-- Activity history is written by this trigger and remains read-only to clients.
revoke insert, update, delete on public.marketing_post_events from authenticated;

create or replace function public.log_marketing_post_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.status is distinct from old.status then
    insert into public.marketing_post_events(organization_id, post_id, actor_id, field_name, previous_value, new_value)
    values(new.organization_id, new.id, (select auth.uid()), 'status', old.status, new.status);
  end if;
  if new.scheduled_date is distinct from old.scheduled_date or new.scheduled_time is distinct from old.scheduled_time then
    insert into public.marketing_post_events(organization_id, post_id, actor_id, field_name, previous_value, new_value)
    values(new.organization_id, new.id, (select auth.uid()), 'schedule',
      concat_ws(' ', old.scheduled_date, old.scheduled_time), concat_ws(' ', new.scheduled_date, new.scheduled_time));
  end if;
  if new.owner is distinct from old.owner then
    insert into public.marketing_post_events(organization_id, post_id, actor_id, field_name, previous_value, new_value)
    values(new.organization_id, new.id, (select auth.uid()), 'owner', old.owner, new.owner);
  end if;
  return new;
end;
$$;

revoke all on function public.log_marketing_post_activity() from public, anon, authenticated;

drop trigger if exists marketing_post_activity on public.marketing_posts;
create trigger marketing_post_activity after update on public.marketing_posts
for each row execute function public.log_marketing_post_activity();

grant select on public.marketing_post_events to authenticated;

