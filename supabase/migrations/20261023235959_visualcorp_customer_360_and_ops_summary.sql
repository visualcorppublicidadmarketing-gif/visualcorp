-- Customer 360 fields, interaction history, a safe login registry, and shared
-- operations metrics for the Visual Corp internal app.

alter table public.customers
  add column if not exists preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 8000),
  add column if not exists tags text[] not null default '{}';
alter table public.public_requests
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create table if not exists public.customer_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  customer_id uuid not null,
  interaction_type text not null check (interaction_type in ('call','message','meeting','note','follow_up')),
  summary text not null check (char_length(trim(summary)) between 1 and 2000),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete cascade
);
create index if not exists customer_interactions_timeline_idx
  on public.customer_interactions (organization_id, customer_id, occurred_at desc);
alter table public.customer_interactions enable row level security;
grant select, insert, update on public.customer_interactions to authenticated;
revoke delete on public.customer_interactions from anon, authenticated;
create policy customer_interactions_read on public.customer_interactions for select to authenticated
  using (app_private.has_visualcorp_access(organization_id,'crm','view'));
create policy customer_interactions_add on public.customer_interactions for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.has_visualcorp_access(organization_id,'crm','edit'));
create policy customer_interactions_update on public.customer_interactions for update to authenticated
  using (app_private.has_visualcorp_access(organization_id,'crm','edit'))
  with check (app_private.has_visualcorp_access(organization_id,'crm','edit'));
-- Lists only accounts that have completed at least one sign-in and have no
-- active or paused membership in this organization. Auth user data stays behind
-- a SECURITY DEFINER function and is exposed only to team managers.
create or replace function public.list_visualcorp_login_candidates()
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if auth.uid() is null or not app_private.has_visualcorp_access(v_org,'team','manage_members') then
    return;
  end if;
  return query
    select u.id, u.email::text, coalesce(nullif(trim(p.full_name),''),u.email::text), u.created_at, u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where u.last_sign_in_at is not null
      and u.email is not null
      and not exists (
        select 1 from public.organization_memberships m
        where m.organization_id = v_org and m.user_id = u.id
      )
    order by u.last_sign_in_at desc
    limit 200;
end;
$$;
revoke all on function public.list_visualcorp_login_candidates() from public, anon;
grant execute on function public.list_visualcorp_login_candidates() to authenticated;

create or replace function public.list_visualcorp_team_members()
returns table (
  id uuid,
  user_id uuid,
  role text,
  profile_id uuid,
  active boolean,
  created_at timestamptz,
  full_name text,
  email text,
  last_sign_in_at timestamptz,
  access_profile_name text,
  access_profile_key text
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if auth.uid() is null or not app_private.has_visualcorp_access(v_org,'team','view') then
    return;
  end if;
  return query
    select m.id,m.user_id,m.role,m.profile_id,m.active,m.created_at,p.full_name,p.email,u.last_sign_in_at,ap.name,ap.profile_key
    from public.organization_memberships m
    left join public.profiles p on p.user_id=m.user_id
    left join auth.users u on u.id=m.user_id
    left join public.access_profiles ap on ap.id=m.profile_id and ap.organization_id=m.organization_id
    where m.organization_id=v_org
    order by m.created_at;
end;
$$;
revoke all on function public.list_visualcorp_team_members() from public, anon;
grant execute on function public.list_visualcorp_team_members() to authenticated;

create or replace function public.convert_visualcorp_request_to_customer(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_user uuid := auth.uid();
  v_request public.public_requests%rowtype;
  v_customer uuid;
  v_interest text;
begin
  if v_user is null then raise exception 'Inicia sesión para convertir la solicitud.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if not app_private.has_visualcorp_access(v_org,'crm','edit') then
    raise exception 'No tienes permiso para convertir solicitudes.' using errcode='42501';
  end if;
  select * into v_request from public.public_requests where id=p_request_id for update;
  if not found then raise exception 'No se encontró la solicitud.'; end if;
  if v_request.customer_id is not null then return v_request.customer_id; end if;
  v_interest := concat_ws(E'\n',nullif(v_request.service,''),nullif(v_request.quote_data->'request'->>'productName',''));
  insert into public.customers(organization_id,full_name,phone,email,notes,preferences,tags,created_by)
  values(v_org,v_request.name,v_request.phone,v_request.email,
    concat_ws(E'\n',nullif(v_request.service,''),nullif(v_request.message,'')),
    jsonb_build_object('interests',coalesce(v_interest,''),'source','solicitud web'),
    array['solicitud web'],v_user)
  returning id into v_customer;
  update public.public_requests set customer_id=v_customer,status='won',updated_at=now() where id=p_request_id;
  return v_customer;
end;
$$;
revoke all on function public.convert_visualcorp_request_to_customer(uuid) from public, anon;
grant execute on function public.convert_visualcorp_request_to_customer(uuid) to authenticated;

-- One compact, permission-aware response avoids using browser-local fixtures as
-- operational totals and keeps each metric within the caller's assigned access.
create or replace function public.get_visualcorp_operations_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_sales_total numeric(14,2);
  v_sales_count bigint;
  v_open_leads bigint;
  v_quotes bigint;
  v_items bigint;
  v_low_stock bigint;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para ver el resumen.' using errcode='42501'; end if;
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null or not app_private.has_visualcorp_access(v_org,'dashboard','view') then
    raise exception 'Tu perfil no permite ver el panel de operaciones.' using errcode='42501';
  end if;
  v_today_start := (now() at time zone 'America/Guayaquil')::date at time zone 'America/Guayaquil';
  v_month_start := date_trunc('month', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil';

  if app_private.has_visualcorp_access(v_org,'sales','view') then
    select coalesce(sum(s.total),0), count(*) into v_sales_total,v_sales_count
    from public.sales s where s.organization_id=v_org and s.status='confirmed' and s.created_at>=v_today_start
      and app_private.has_visualcorp_access(v_org,'sales','view',s.branch_id);
  end if;
  if app_private.has_visualcorp_access(v_org,'crm','view') then
    select count(*) into v_open_leads from public.public_requests r
    where r.status not in ('won','lost','closed');
  end if;
  if app_private.has_visualcorp_access(v_org,'quotes','view') then
    select count(*) into v_quotes from public.central_quotes q
    where q.organization_id=v_org and q.created_at>=v_month_start;
  end if;
  if app_private.has_visualcorp_access(v_org,'inventory','view') then
    select count(*) into v_items from public.inventory_items i
    where i.organization_id=v_org and i.active;
    select count(*) into v_low_stock from (
      select i.id
      from public.inventory_items i
      join public.inventory_variants v on v.item_id=i.id and v.organization_id=i.organization_id and v.active
      left join public.inventory_stock s on s.variant_id=v.id and s.organization_id=v.organization_id
        and app_private.has_visualcorp_access(v_org,'inventory','view',s.branch_id)
      where i.organization_id=v_org and i.active
      group by i.id,i.minimum_quantity
      having coalesce(sum(s.quantity),0)<=i.minimum_quantity
    ) low;
  end if;
  return jsonb_build_object(
    'sales_today_total',v_sales_total,'sales_today_count',v_sales_count,
    'open_leads',v_open_leads,'quotes_this_month',v_quotes,
    'inventory_items',v_items,'inventory_low_stock',v_low_stock,
    'as_of',now()
  );
end;
$$;
revoke all on function public.get_visualcorp_operations_summary() from public, anon;
grant execute on function public.get_visualcorp_operations_summary() to authenticated;

