
-- Phase 2: supplier directory, purchase orders, partial receipts, and ledger-backed stock updates.
-- No supplier, purchase, stock, or price records are seeded by this migration.

create sequence if not exists public.purchase_order_number_seq;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  tax_id text not null default '',
  address text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index suppliers_org_name_unique on public.suppliers (organization_id, lower(btrim(name)));
create index suppliers_org_active_idx on public.suppliers (organization_id, active, lower(name));

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  supplier_id uuid not null,
  order_number text not null unique default ('OC-' || to_char(now() at time zone 'UTC','YYYY') || '-' || lpad(nextval('public.purchase_order_number_seq')::text, 6, '0')),
  status text not null default 'draft' check (status in ('draft','ordered','partially_received','received','cancelled')),
  expected_date date,
  currency text not null default 'USD' check (currency = 'USD'),
  note text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  submitted_by uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id) on delete restrict
);
create index purchase_orders_org_status_idx on public.purchase_orders (organization_id, status, created_at desc);
create index purchase_orders_supplier_idx on public.purchase_orders (organization_id, supplier_id, created_at desc);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  purchase_order_id uuid not null,
  variant_id uuid not null,
  description_snapshot text not null,
  sku_snapshot text not null,
  unit_snapshot text not null,
  quantity_ordered numeric(14,3) not null check (quantity_ordered > 0),
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0 and quantity_received <= quantity_ordered),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (purchase_order_id, variant_id),
  foreign key (purchase_order_id, organization_id) references public.purchase_orders(id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict
);
create index purchase_order_lines_order_idx on public.purchase_order_lines (organization_id, purchase_order_id);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  purchase_order_id uuid not null,
  idempotency_key uuid not null,
  reference text not null default '',
  note text not null default '',
  received_by uuid not null references auth.users(id) on delete restrict,
  received_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, idempotency_key),
  foreign key (purchase_order_id, organization_id) references public.purchase_orders(id, organization_id) on delete restrict
);
create index purchase_receipts_order_idx on public.purchase_receipts (organization_id, purchase_order_id, received_at desc);

create table public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  receipt_id uuid not null,
  purchase_order_line_id uuid not null,
  quantity_received numeric(14,3) not null check (quantity_received > 0),
  location_code text not null default 'MAIN' check (char_length(location_code) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key (receipt_id, organization_id) references public.purchase_receipts(id, organization_id) on delete restrict,
  foreign key (purchase_order_line_id, organization_id) references public.purchase_order_lines(id, organization_id) on delete restrict
);
create index purchase_receipt_lines_receipt_idx on public.purchase_receipt_lines (organization_id, receipt_id);

alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;

grant select, insert, update on public.suppliers to authenticated;
grant select on public.purchase_orders, public.purchase_order_lines, public.purchase_receipts, public.purchase_receipt_lines to authenticated;
grant usage, select on sequence public.purchase_order_number_seq to authenticated;

create policy suppliers_read on public.suppliers for select to authenticated
  using (app_private.has_org_role(organization_id));
create policy suppliers_add on public.suppliers for insert to authenticated
  with check (created_by = (select auth.uid()) and app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy suppliers_update on public.suppliers for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy purchase_orders_read on public.purchase_orders for select to authenticated
  using (app_private.has_org_role(organization_id, branch_id));
create policy purchase_order_lines_read on public.purchase_order_lines for select to authenticated
  using (app_private.has_org_role(organization_id));
create policy purchase_receipts_read on public.purchase_receipts for select to authenticated
  using (app_private.has_org_role(organization_id));
create policy purchase_receipt_lines_read on public.purchase_receipt_lines for select to authenticated
  using (app_private.has_org_role(organization_id));

create or replace function app_private.create_purchase_order(
  p_organization_id uuid, p_branch_id uuid, p_supplier_id uuid, p_lines jsonb,
  p_expected_date date default null, p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_order uuid; v_line jsonb; v_variant uuid; v_qty numeric; v_cost numeric;
begin
  if v_uid is null or not app_private.has_org_role(p_organization_id, p_branch_id, array['owner','admin','manager']) then
    raise exception 'No tienes permiso para crear órdenes en esta sucursal.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'La orden debe incluir entre 1 y 100 artículos.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches b where b.id=p_branch_id and b.organization_id=p_organization_id and b.active)
     or not exists (select 1 from public.suppliers s where s.id=p_supplier_id and s.organization_id=p_organization_id and s.active) then
    raise exception 'Sucursal o proveedor inactivo/no válido.' using errcode = '22023';
  end if;
  insert into public.purchase_orders (organization_id,branch_id,supplier_id,expected_date,note,created_by)
  values (p_organization_id,p_branch_id,p_supplier_id,p_expected_date,left(coalesce(p_note,''),2000),v_uid)
  returning id into v_order;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_variant := (v_line->>'variant_id')::uuid;
    v_qty := (v_line->>'quantity_ordered')::numeric;
    v_cost := (v_line->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 or v_cost is null or v_cost < 0 then raise exception 'Cantidad y costo deben ser válidos.' using errcode = '22023'; end if;
    insert into public.purchase_order_lines (organization_id,purchase_order_id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_ordered,unit_cost)
    select p_organization_id,v_order,v.id,i.name || case when nullif(v.label,'') is null then '' else ' · ' || v.label end,v.sku,i.base_unit,v_qty,v_cost
    from public.inventory_variants v join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id
    where v.id=v_variant and v.organization_id=p_organization_id and v.active and i.active;
    if not found then raise exception 'Un artículo no pertenece a la organización activa.' using errcode = '22023'; end if;
  end loop;
  return v_order;
end;
$$;

create or replace function app_private.submit_purchase_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_branch uuid;
begin
  select organization_id,branch_id into v_org,v_branch from public.purchase_orders where id=p_order_id for update;
  if v_org is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager']) then raise exception 'No tienes permiso para enviar esta orden.' using errcode='42501'; end if;
  if not exists(select 1 from public.purchase_order_lines where purchase_order_id=p_order_id and organization_id=v_org) then raise exception 'La orden no tiene artículos.' using errcode='22023'; end if;
  update public.purchase_orders set status='ordered',submitted_by=(select auth.uid()),submitted_at=now(),updated_at=now()
  where id=p_order_id and organization_id=v_org and status='draft';
  if not found then raise exception 'Solo se pueden enviar órdenes en borrador.' using errcode='22023'; end if;
end;
$$;

create or replace function app_private.cancel_purchase_order(p_order_id uuid,p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_branch uuid;
begin
  select organization_id,branch_id into v_org,v_branch from public.purchase_orders where id=p_order_id for update;
  if v_org is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager']) then raise exception 'No tienes permiso para cancelar esta orden.' using errcode='42501'; end if;
  if exists(select 1 from public.purchase_order_lines where purchase_order_id=p_order_id and quantity_received>0) then raise exception 'No se cancela una orden con recepciones registradas.' using errcode='22023'; end if;
  update public.purchase_orders set status='cancelled',note=concat_ws(E'\n',nullif(note,''),'Cancelada: '||left(coalesce(p_reason,'sin motivo indicado'),500)),updated_at=now()
  where id=p_order_id and organization_id=v_org and status in ('draft','ordered');
  if not found then raise exception 'La orden no puede cancelarse en su estado actual.' using errcode='22023'; end if;
end;
$$;

create or replace function app_private.receive_purchase_order(
  p_order_id uuid, p_lines jsonb, p_idempotency_key uuid, p_reference text default '', p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_org uuid; v_branch uuid; v_status text; v_receipt uuid; v_line jsonb;
  v_po_line uuid; v_qty numeric; v_location text; v_variant uuid; v_cost numeric; v_supplier text; v_received numeric;
begin
  select organization_id,branch_id,status into v_org,v_branch,v_status from public.purchase_orders where id=p_order_id for update;
  if v_org is null or not app_private.has_org_role(v_org,v_branch,array['owner','admin','manager','warehouse']) then raise exception 'No tienes permiso para recibir esta orden.' using errcode='42501'; end if;
  if v_status not in ('ordered','partially_received') then raise exception 'Solo se reciben órdenes enviadas o parcialmente recibidas.' using errcode='22023'; end if;
  if p_idempotency_key is null then raise exception 'Falta la clave de idempotencia.' using errcode='22023'; end if;
  select id into v_receipt from public.purchase_receipts where organization_id=v_org and idempotency_key=p_idempotency_key;
  if v_receipt is not null then return v_receipt; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'La recepción debe incluir al menos un artículo.' using errcode='22023'; end if;
  insert into public.purchase_receipts(organization_id,purchase_order_id,idempotency_key,reference,note,received_by)
  values(v_org,p_order_id,p_idempotency_key,left(coalesce(p_reference,''),180),left(coalesce(p_note,''),2000),v_uid) returning id into v_receipt;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_po_line := (v_line->>'purchase_order_line_id')::uuid;
    v_qty := (v_line->>'quantity_received')::numeric;
    v_location := coalesce(nullif(left(btrim(v_line->>'location_code'),80),''),'MAIN');
    if v_qty is null or v_qty <= 0 then raise exception 'Cada cantidad recibida debe ser mayor a cero.' using errcode='22023'; end if;
    select l.variant_id,l.unit_cost,l.quantity_ordered-l.quantity_received,s.name into v_variant,v_cost,v_received,v_supplier
      from public.purchase_order_lines l join public.purchase_orders o on o.id=l.purchase_order_id and o.organization_id=l.organization_id
      join public.suppliers s on s.id=o.supplier_id and s.organization_id=o.organization_id
      where l.id=v_po_line and l.purchase_order_id=p_order_id and l.organization_id=v_org for update of l;
    if v_variant is null then raise exception 'La línea no pertenece a esta orden.' using errcode='22023'; end if;
    if v_qty > v_received then raise exception 'La cantidad supera el saldo pendiente de una línea.' using errcode='22023'; end if;
    insert into public.purchase_receipt_lines(organization_id,receipt_id,purchase_order_line_id,quantity_received,location_code)
      values(v_org,v_receipt,v_po_line,v_qty,v_location);
    update public.purchase_order_lines set quantity_received=quantity_received+v_qty where id=v_po_line and organization_id=v_org;
    insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values(v_org,v_variant,v_branch,v_location,'receipt',v_qty,'Recepción de orden de compra '||p_order_id::text,'purchase_receipt',v_receipt,v_uid);
    insert into public.inventory_item_costs(organization_id,variant_id,unit_cost,currency,supplier_name,updated_by,updated_at)
      values(v_org,v_variant,v_cost,'USD',v_supplier,v_uid,now())
      on conflict(organization_id,variant_id) do update set unit_cost=excluded.unit_cost,currency='USD',supplier_name=excluded.supplier_name,updated_by=v_uid,updated_at=now();
  end loop;
  update public.purchase_orders o set status=case when not exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=o.id and l.organization_id=o.organization_id and l.quantity_received<l.quantity_ordered) then 'received' else 'partially_received' end,updated_at=now()
  where o.id=p_order_id and o.organization_id=v_org;
  return v_receipt;
end;
$$;

revoke all on function app_private.create_purchase_order(uuid,uuid,uuid,jsonb,date,text) from public,anon,authenticated;
revoke all on function app_private.submit_purchase_order(uuid) from public,anon,authenticated;
revoke all on function app_private.cancel_purchase_order(uuid,text) from public,anon,authenticated;
revoke all on function app_private.receive_purchase_order(uuid,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function app_private.create_purchase_order(uuid,uuid,uuid,jsonb,date,text) to authenticated;
grant execute on function app_private.submit_purchase_order(uuid) to authenticated;
grant execute on function app_private.cancel_purchase_order(uuid,text) to authenticated;
grant execute on function app_private.receive_purchase_order(uuid,jsonb,uuid,text,text) to authenticated;

create or replace function public.create_purchase_order(p_organization_id uuid,p_branch_id uuid,p_supplier_id uuid,p_lines jsonb,p_expected_date date default null,p_note text default '')
returns uuid language sql security invoker set search_path = '' as $$ select app_private.create_purchase_order($1,$2,$3,$4,$5,$6); $$;
create or replace function public.submit_purchase_order(p_order_id uuid)
returns void language sql security invoker set search_path = '' as $$ select app_private.submit_purchase_order($1); $$;
create or replace function public.cancel_purchase_order(p_order_id uuid,p_reason text default '')
returns void language sql security invoker set search_path = '' as $$ select app_private.cancel_purchase_order($1,$2); $$;
create or replace function public.receive_purchase_order(p_order_id uuid,p_lines jsonb,p_idempotency_key uuid,p_reference text default '',p_note text default '')
returns uuid language sql security invoker set search_path = '' as $$ select app_private.receive_purchase_order($1,$2,$3,$4,$5); $$;
revoke all on function public.create_purchase_order(uuid,uuid,uuid,jsonb,date,text) from public,anon;
revoke all on function public.submit_purchase_order(uuid) from public,anon;
revoke all on function public.cancel_purchase_order(uuid,text) from public,anon;
revoke all on function public.receive_purchase_order(uuid,jsonb,uuid,text,text) from public,anon;
grant execute on function public.create_purchase_order(uuid,uuid,uuid,jsonb,date,text) to authenticated;
grant execute on function public.submit_purchase_order(uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid,text) to authenticated;
grant execute on function public.receive_purchase_order(uuid,jsonb,uuid,text,text) to authenticated;
