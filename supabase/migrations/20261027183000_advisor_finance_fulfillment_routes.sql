create unique index if not exists areas_org_id_pair_idx on public.areas(organization_id,id);

create table if not exists public.sale_fulfillment_details (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_required boolean not null default false,
  installation_address text,
  installation_maps_url text,
  installation_latitude numeric(10,7),
  installation_longitude numeric(10,7),
  installation_estimated_at timestamptz,
  delivery_due_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint sale_fulfillment_coordinates_pair check ((installation_latitude is null) = (installation_longitude is null)),
  constraint sale_fulfillment_latitude_range check (installation_latitude is null or installation_latitude between -90 and 90),
  constraint sale_fulfillment_longitude_range check (installation_longitude is null or installation_longitude between -180 and 180)
);

create table if not exists public.catalog_product_area_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_product_id text not null,
  area_id uuid not null,
  requires_installation boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, catalog_product_id, area_id),
  foreign key (organization_id, area_id) references public.areas(organization_id, id) on delete cascade
);

create table if not exists public.production_order_sale_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  area_id uuid not null,
  production_order_id uuid not null unique references public.production_orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sale_id, area_id),
  foreign key (organization_id, area_id) references public.areas(organization_id, id) on delete cascade
);

alter table public.sale_fulfillment_details enable row level security;
alter table public.catalog_product_area_routes enable row level security;
alter table public.production_order_sale_routes enable row level security;

create policy sale_fulfillment_details_select on public.sale_fulfillment_details for select to authenticated
using (
  exists (select 1 from public.sales s where s.id = sale_id
    and (s.advisor_id = (select auth.uid()) or app_private.has_visualcorp_access(s.organization_id, 'finance', 'manage_finance', s.branch_id)))
);
create policy catalog_product_area_routes_select on public.catalog_product_area_routes for select to authenticated
using (app_private.has_visualcorp_access(organization_id, 'workshop', 'view', null));
create policy catalog_product_area_routes_manage on public.catalog_product_area_routes for all to authenticated
using (app_private.has_visualcorp_access(organization_id, 'sales', 'edit', null) and app_private.has_visualcorp_access(organization_id, 'workshop', 'edit', null))
with check (app_private.has_visualcorp_access(organization_id, 'sales', 'edit', null) and app_private.has_visualcorp_access(organization_id, 'workshop', 'edit', null));
create policy production_order_sale_routes_select on public.production_order_sale_routes for select to authenticated
using (app_private.has_visualcorp_access(organization_id, 'workshop', 'view', null));
grant select on public.sale_fulfillment_details, public.catalog_product_area_routes, public.production_order_sale_routes to authenticated;
grant insert, update, delete on public.catalog_product_area_routes to authenticated;

create or replace function public.save_sale_fulfillment(p_sale_id uuid, p_details jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_sale public.sales%rowtype; v_install boolean; v_created integer := 0;
begin
  select * into v_sale from public.sales where id=p_sale_id and status='confirmed' for update;
  if not found then raise exception 'No se encontró una venta confirmada.'; end if;
  if not app_private.has_visualcorp_access(v_sale.organization_id,'sales','edit',v_sale.branch_id)
     or (v_sale.advisor_id is distinct from (select auth.uid()) and not app_private.has_visualcorp_access(v_sale.organization_id,'finance','manage_finance',v_sale.branch_id)) then
    raise exception 'No tienes acceso para completar esta venta.';
  end if;
  v_install := coalesce((p_details->>'installation_required')::boolean,false);
  if v_install and nullif(btrim(p_details->>'installation_address'),'') is null then raise exception 'Agrega la ubicación de instalación.'; end if;
  if nullif(btrim(p_details->>'installation_maps_url'),'') is not null and (p_details->>'installation_maps_url') !~* '^https://(www[.])?google[.]com/maps/|^https://maps[.]app[.]goo[.]gl/|^https://goo[.]gl/maps/' then
    raise exception 'El enlace debe ser de Google Maps.';
  end if;
  insert into public.sale_fulfillment_details(sale_id,organization_id,installation_required,installation_address,installation_maps_url,installation_latitude,installation_longitude,installation_estimated_at,delivery_due_at,updated_by,updated_at)
  values (v_sale.id,v_sale.organization_id,v_install,nullif(btrim(p_details->>'installation_address'),''),nullif(btrim(p_details->>'installation_maps_url'),''),nullif(p_details->>'installation_latitude','')::numeric,nullif(p_details->>'installation_longitude','')::numeric,nullif(p_details->>'installation_estimated_at','')::timestamptz,nullif(p_details->>'delivery_due_at','')::timestamptz,(select auth.uid()),now())
  on conflict (sale_id) do update set installation_required=excluded.installation_required,installation_address=excluded.installation_address,installation_maps_url=excluded.installation_maps_url,installation_latitude=excluded.installation_latitude,installation_longitude=excluded.installation_longitude,installation_estimated_at=excluded.installation_estimated_at,delivery_due_at=excluded.delivery_due_at,updated_by=excluded.updated_by,updated_at=now();

  with newly_created as (
  insert into public.production_orders(organization_id,branch_id,sale_id,area_id,order_code,title,description,status,priority,due_at,created_by,next_step)
  select v_sale.organization_id,v_sale.branch_id,v_sale.id,r.area_id,
    'OT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
    'Trabajo · '||coalesce(string_agg(distinct nullif(sl.description_snapshot,''),' / '),'Venta '||coalesce(v_sale.sale_code,v_sale.id::text)),
    'Orden generada desde POS. Venta '||coalesce(v_sale.sale_code,v_sale.id::text)||'. '||coalesce(string_agg(distinct nullif(sl.description_snapshot,''),' / '),'')||
      case when v_install and exists(select 1 from public.catalog_product_area_routes c where c.organization_id=v_sale.organization_id and c.area_id=r.area_id and c.active and c.requires_installation)
        then ' Instalación: '||coalesce(nullif(btrim(p_details->>'installation_address'),''),'')||' · '||coalesce(nullif(p_details->>'installation_estimated_at',''),nullif(p_details->>'delivery_due_at',''),'')||case when nullif(p_details->>'installation_maps_url','') is not null then ' · Maps: '||(p_details->>'installation_maps_url') else '' end else '' end,
    'queued','normal',case when v_install and exists(select 1 from public.catalog_product_area_routes c where c.organization_id=v_sale.organization_id and c.area_id=r.area_id and c.active and c.requires_installation)
      then coalesce(nullif(p_details->>'installation_estimated_at','')::timestamptz,nullif(p_details->>'delivery_due_at','')::timestamptz)
      else coalesce(nullif(p_details->>'delivery_due_at','')::timestamptz,nullif(p_details->>'installation_estimated_at','')::timestamptz) end,
    (select auth.uid()),'Revisar detalles del producto y confirmar el siguiente paso.'
  from (select distinct c.area_id from public.catalog_product_area_routes c join public.sale_lines sl on sl.catalog_product_id=c.catalog_product_id and sl.sale_id=v_sale.id where c.organization_id=v_sale.organization_id and c.active) r
  join public.sale_lines sl on sl.sale_id=v_sale.id
  where exists (select 1 from public.catalog_product_area_routes c where c.organization_id=v_sale.organization_id and c.area_id=r.area_id and c.catalog_product_id=sl.catalog_product_id and c.active)
    and not exists (select 1 from public.production_order_sale_routes x where x.sale_id=v_sale.id and x.area_id=r.area_id)
  group by r.area_id
  returning id,area_id
  )
  insert into public.production_order_sale_routes(organization_id,sale_id,area_id,production_order_id)
  select v_sale.organization_id,v_sale.id,n.area_id,n.id from newly_created n
  on conflict (sale_id,area_id) do nothing;
  get diagnostics v_created = row_count;
  return jsonb_build_object('sale_id',v_sale.id,'production_orders_created',v_created);
end $function$;
revoke all on function public.save_sale_fulfillment(uuid,jsonb) from public,anon;
grant execute on function public.save_sale_fulfillment(uuid,jsonb) to authenticated;
