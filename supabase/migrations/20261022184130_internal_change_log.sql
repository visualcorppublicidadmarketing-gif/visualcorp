create table public.internal_change_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 160),
  summary text not null check (length(trim(summary)) between 3 and 500),
  details text not null default '' check (length(details) <= 10000),
  category text not null default 'operations'
    check (category in ('general','website','sales','inventory','operations','security')),
  audience text not null default 'both' check (audience in ('both','admin','operations')),
  version_tag text not null default '' check (length(version_tag) <= 80),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='published' and published_at is not null) or status<>'published'),
  unique (id, organization_id)
);

create index internal_change_log_feed_idx
  on public.internal_change_log (organization_id, audience, published_at desc)
  where status='published';
create index internal_change_log_admin_idx
  on public.internal_change_log (organization_id, status, updated_at desc);

alter table public.internal_change_log enable row level security;
grant select, insert, update, delete on public.internal_change_log to authenticated;

create policy internal_change_log_read on public.internal_change_log
  for select to authenticated
  using (
    (status='published' and published_at is not null and published_at <= now() and (
      (audience='both' and app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor','warehouse','production','marketing','website_admin']))
      or (audience='admin' and app_private.has_org_role(organization_id, null, array['owner','admin','manager','website_admin']))
      or (audience='operations' and app_private.has_org_role(organization_id, null, array['owner','admin','manager','advisor','warehouse','production','marketing']))
    ))
    or app_private.has_org_role(organization_id, null, array['owner','admin','manager','website_admin'])
  );
create policy internal_change_log_insert on public.internal_change_log
  for insert to authenticated
  with check (
    app_private.has_org_role(organization_id, null, array['owner','admin','manager','website_admin'])
    and created_by=(select auth.uid()) and updated_by=(select auth.uid())
  );
create policy internal_change_log_update on public.internal_change_log
  for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','website_admin']))
  with check (
    app_private.has_org_role(organization_id, null, array['owner','admin','manager','website_admin'])
    and updated_by=(select auth.uid())
  );
create policy internal_change_log_delete on public.internal_change_log
  for delete to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager','website_admin']));

do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='internal_change_log'
     ) then
    alter publication supabase_realtime add table public.internal_change_log;
  end if;
end $$;

insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,v.title,v.summary,v.details,v.category,'both',v.version_tag,'published',now()
from public.organizations o
cross join (values
  ('Inventario avanzado y trazable',
   'El inventario incorpora filtros, etiquetas, vistas y métricas de abastecimiento, uso, reserva y costos con historial.',
   'Se añadieron fichas ampliadas con tipo, tags e imagen de referencia; búsqueda y filtros; conteo y reserva auditables; métricas derivadas de movimientos; historial de costos y cola para conciliar las importaciones. Los saldos que no se han contado siguen pendientes y no se muestran como stock confirmado.',
   'inventory','483136c'),
  ('POS conectado con clientes e inventario',
   'Las ventas y los pagos se registran en Supabase, se asocian a clientes y actualizan variantes vinculadas de inventario.',
   'El POS permite localizar o crear clientes, guardar pagos y abonos, conservar saldos pendientes y señalar faltantes para compra urgente. La salida de stock aplica únicamente a vínculos de catálogo y variante configurados de forma explícita.',
   'sales','5a6cfef'),
  ('Caja, devoluciones, transferencias y producción',
   'Se publicaron los flujos de caja, devoluciones, traslados parciales, órdenes de producción y cotizaciones centrales enlazables al POS.',
   'El cierre concilia pagos y movimientos; las devoluciones registran el destino del artículo y el reembolso por separado; las transferencias conservan cantidades despachadas y recibidas; producción descuenta consumos reales; las cotizaciones guardan las alternativas y se convierten en venta cuando precio y total coinciden.',
   'operations','95126df')
) as v(title,summary,details,category,version_tag)
where o.slug='visual-corp'
on conflict do nothing;
