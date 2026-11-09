-- Command center for purchasing: request intake, supplier quote comparison, and
-- branch-scoped operational metrics. No business records are seeded by this migration.

create sequence if not exists public.purchase_request_number_seq;

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  area_id uuid not null,
  production_job_id uuid,
  request_number text not null unique default (
    'SOL-' || to_char(now() at time zone 'UTC','YYYY') || '-' ||
    lpad(nextval('public.purchase_request_number_seq')::text, 6, '0')
  ),
  title text not null check (char_length(btrim(title)) between 3 and 180),
  note text not null default '' check (char_length(note) <= 2000),
  needed_by date,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','converted','cancelled')),
  resolution_note text not null default '' check (char_length(resolution_note) <= 500),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  purchase_order_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (purchase_order_id),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  foreign key (area_id, organization_id) references public.areas(id, organization_id) on delete restrict,
  foreign key (production_job_id, organization_id) references public.production_jobs(id, organization_id) on delete restrict
);
create index purchase_requests_queue_idx
  on public.purchase_requests (organization_id, branch_id, status, created_at desc);
create index purchase_requests_job_idx
  on public.purchase_requests (organization_id, production_job_id) where production_job_id is not null;

alter table public.purchase_orders add column purchase_request_id uuid;
alter table public.purchase_orders
  add constraint purchase_orders_request_fk
  foreign key (purchase_request_id, organization_id)
  references public.purchase_requests(id, organization_id) on delete restrict;
alter table public.purchase_requests
  add constraint purchase_requests_order_fk
  foreign key (purchase_order_id, organization_id)
  references public.purchase_orders(id, organization_id) on delete restrict;
create unique index purchase_orders_request_unique
  on public.purchase_orders (purchase_request_id) where purchase_request_id is not null;

create table public.purchase_request_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  variant_id uuid not null,
  description_snapshot text not null,
  sku_snapshot text not null default '',
  unit_snapshot text not null default '',
  quantity_requested numeric(14,3) not null check (quantity_requested > 0),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (request_id, variant_id),
  foreign key (request_id, organization_id) references public.purchase_requests(id, organization_id) on delete cascade,
  foreign key (variant_id, organization_id) references public.inventory_variants(id, organization_id) on delete restrict
);
create index purchase_request_lines_request_idx
  on public.purchase_request_lines (organization_id, request_id);

create table public.purchase_request_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  event_key text not null check (event_key in ('submitted','approved','rejected','quote_registered','quote_selected','order_created')),
  note text not null default '' check (char_length(note) <= 1000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (request_id, organization_id) references public.purchase_requests(id, organization_id) on delete cascade
);
create index purchase_request_events_request_idx
  on public.purchase_request_events (organization_id, request_id, created_at desc);

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null,
  supplier_id uuid not null,
  reference text not null default '' check (char_length(reference) <= 180),
  valid_until date,
  delivery_date date,
  note text not null default '' check (char_length(note) <= 1500),
  status text not null default 'submitted' check (status in ('submitted','selected','not_selected')),
  captured_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (request_id, organization_id) references public.purchase_requests(id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id) on delete restrict
);
create index supplier_quotes_request_idx
  on public.supplier_quotes (organization_id, request_id, status, created_at desc);

create table public.supplier_quote_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  quote_id uuid not null,
  request_line_id uuid not null,
  quantity_quoted numeric(14,3) not null check (quantity_quoted > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (quote_id, request_line_id),
  foreign key (quote_id, organization_id) references public.supplier_quotes(id, organization_id) on delete cascade,
  foreign key (request_line_id, organization_id) references public.purchase_request_lines(id, organization_id) on delete restrict
);
create index supplier_quote_lines_quote_idx
  on public.supplier_quote_lines (organization_id, quote_id);

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_lines enable row level security;
alter table public.purchase_request_events enable row level security;
alter table public.supplier_quotes enable row level security;
alter table public.supplier_quote_lines enable row level security;

revoke all on public.purchase_requests, public.purchase_request_lines, public.purchase_request_events,
  public.supplier_quotes, public.supplier_quote_lines from public, anon, authenticated;
grant select on public.purchase_requests, public.purchase_request_lines, public.purchase_request_events,
  public.supplier_quotes, public.supplier_quote_lines to authenticated;

create policy purchase_requests_access_select on public.purchase_requests for select to authenticated
using (
  app_private.has_visualcorp_access(organization_id,'purchases','view',branch_id)
  or (created_by=(select auth.uid()) and (
    app_private.has_visualcorp_access(organization_id,'workshop','view',branch_id)
    or app_private.has_visualcorp_access(organization_id,'sales','view',branch_id)
  ))
);
create policy purchase_request_lines_access_select on public.purchase_request_lines for select to authenticated
using (exists (
  select 1 from public.purchase_requests request
  where request.id=purchase_request_lines.request_id and request.organization_id=purchase_request_lines.organization_id
));
create policy purchase_request_events_access_select on public.purchase_request_events for select to authenticated
using (exists (
  select 1 from public.purchase_requests request
  where request.id=purchase_request_events.request_id and request.organization_id=purchase_request_events.organization_id
));
create policy supplier_quotes_access_select on public.supplier_quotes for select to authenticated
using (exists (
  select 1 from public.purchase_requests request
  where request.id=supplier_quotes.request_id and request.organization_id=supplier_quotes.organization_id
    and app_private.has_visualcorp_access(request.organization_id,'purchases','view',request.branch_id)
));
create policy supplier_quote_lines_access_select on public.supplier_quote_lines for select to authenticated
using (exists (
  select 1 from public.supplier_quotes quote_row
  join public.purchase_requests request on request.id=quote_row.request_id and request.organization_id=quote_row.organization_id
  where quote_row.id=supplier_quote_lines.quote_id and quote_row.organization_id=supplier_quote_lines.organization_id
    and app_private.has_visualcorp_access(request.organization_id,'purchases','view',request.branch_id)
));

create or replace function public.create_purchase_request(
  p_organization_id uuid, p_branch_id uuid, p_area_id uuid, p_production_job_id uuid,
  p_title text, p_note text, p_needed_by date, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_request uuid;
  v_line jsonb;
  v_variant uuid;
  v_quantity numeric;
begin
  if v_uid is null or not (
    app_private.has_visualcorp_access(p_organization_id,'purchases','edit',p_branch_id)
    or app_private.has_visualcorp_access(p_organization_id,'workshop','view',p_branch_id)
    or app_private.has_visualcorp_access(p_organization_id,'sales','view',p_branch_id)
  ) then
    raise exception 'No tienes permiso para solicitar materiales en esta sucursal.' using errcode='42501';
  end if;
  if not exists (select 1 from public.branches b where b.id=p_branch_id and b.organization_id=p_organization_id and b.active)
     or not exists (select 1 from public.areas a where a.id=p_area_id and a.organization_id=p_organization_id and a.active) then
    raise exception 'La sucursal o el área seleccionada no está activa.' using errcode='22023';
  end if;
  if p_needed_by is not null and p_needed_by < (now() at time zone 'America/Guayaquil')::date then
    raise exception 'La fecha requerida no puede estar en el pasado.' using errcode='22023';
  end if;
  if p_production_job_id is not null and not exists (
    select 1 from public.production_jobs job
    join public.production_job_steps step on step.job_id=job.id and step.organization_id=job.organization_id
    where job.id=p_production_job_id and job.organization_id=p_organization_id and job.branch_id=p_branch_id
      and job.status in ('open','needs_review') and step.area_id=p_area_id and step.status not in ('completed','cancelled')
  ) then
    raise exception 'El trabajo no tiene una etapa activa en el área elegida.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 180
     or char_length(coalesce(p_note,''))>2000
     or p_lines is null or jsonb_typeof(p_lines)<>'array'
     or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'Completa el motivo y al menos un artículo solicitado.' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) line
    group by line->>'variant_id' having count(*)>1
  ) then raise exception 'Cada variante debe aparecer una sola vez.' using errcode='22023'; end if;

  insert into public.purchase_requests(organization_id,branch_id,area_id,production_job_id,title,note,needed_by,created_by)
  values(p_organization_id,p_branch_id,p_area_id,p_production_job_id,btrim(p_title),coalesce(p_note,''),p_needed_by,v_uid)
  returning id into v_request;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_variant := (v_line->>'variant_id')::uuid;
    v_quantity := (v_line->>'quantity_requested')::numeric;
    if v_quantity is null or v_quantity<=0 or v_quantity>1000000000 then
      raise exception 'Cada cantidad solicitada debe ser mayor a cero.' using errcode='22023';
    end if;
    insert into public.purchase_request_lines(organization_id,request_id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_requested,note)
    select p_organization_id,v_request,v.id,
      i.name || case when nullif(v.label,'') is null then '' else ' · ' || v.label end,
      coalesce(v.sku,''),coalesce(i.base_unit,''),v_quantity,left(coalesce(v_line->>'note',''),500)
    from public.inventory_variants v
    join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id
    where v.id=v_variant and v.organization_id=p_organization_id and v.active and i.active;
    if not found then raise exception 'Un artículo no pertenece al inventario activo de esta organización.' using errcode='22023'; end if;
  end loop;
  insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id)
  values(p_organization_id,v_request,'submitted','Solicitud enviada para revisión',v_uid);
  return v_request;
end;
$$;

create or replace function public.resolve_purchase_request(p_request_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_request public.purchase_requests%rowtype;
begin
  select * into v_request from public.purchase_requests where id=p_request_id for update;
  if v_request.id is null or v_uid is null
     or not app_private.has_visualcorp_access(v_request.organization_id,'purchases','approve_purchase',v_request.branch_id) then
    raise exception 'No tienes permiso para revisar esta solicitud.' using errcode='42501';
  end if;
  if p_decision is null or p_decision not in ('approved','rejected') or char_length(coalesce(p_note,''))>500 then
    raise exception 'La decisión o la nota no son válidas.' using errcode='22023';
  end if;
  if v_request.status<>'submitted' then raise exception 'La solicitud ya fue revisada.' using errcode='22023'; end if;
  if p_decision='rejected' and char_length(btrim(coalesce(p_note,'')))<3 then
    raise exception 'Escribe el motivo del rechazo.' using errcode='22023';
  end if;
  update public.purchase_requests set status=p_decision,resolution_note=left(coalesce(p_note,''),500),
    resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=p_request_id;
  insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id)
  values(v_request.organization_id,p_request_id,p_decision,coalesce(nullif(btrim(p_note),''),'Solicitud aprobada'),v_uid);
end;
$$;

create or replace function public.capture_supplier_quote(
  p_request_id uuid, p_supplier_id uuid, p_reference text, p_valid_until date,
  p_delivery_date date, p_note text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.purchase_requests%rowtype;
  v_quote uuid;
  v_line jsonb;
  v_request_line uuid;
  v_cost numeric;
  v_quantity numeric;
begin
  select * into v_request from public.purchase_requests where id=p_request_id for update;
  if v_request.id is null or v_uid is null
     or not app_private.has_visualcorp_access(v_request.organization_id,'purchases','edit',v_request.branch_id) then
    raise exception 'No tienes permiso para registrar cotizaciones en esta sucursal.' using errcode='42501';
  end if;
  if v_request.status<>'approved' then raise exception 'Primero debe aprobarse la solicitud.' using errcode='22023'; end if;
  if not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.organization_id=v_request.organization_id and s.active) then
    raise exception 'Selecciona un proveedor activo de esta organización.' using errcode='22023';
  end if;
  if char_length(coalesce(p_reference,''))>180 or char_length(coalesce(p_note,''))>1500
     or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 50 then
    raise exception 'Revisa la referencia, fecha, nota y precios de la oferta.' using errcode='22023';
  end if;
  insert into public.supplier_quotes(organization_id,request_id,supplier_id,reference,valid_until,delivery_date,note,captured_by)
  values(v_request.organization_id,p_request_id,p_supplier_id,left(coalesce(p_reference,''),180),p_valid_until,p_delivery_date,left(coalesce(p_note,''),1500),v_uid)
  returning id into v_quote;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_request_line := (v_line->>'request_line_id')::uuid;
    v_cost := (v_line->>'unit_cost')::numeric;
    select quantity_requested into v_quantity from public.purchase_request_lines
      where id=v_request_line and request_id=p_request_id and organization_id=v_request.organization_id;
    if v_quantity is null or v_cost is null or v_cost<0 or v_cost>9999999999.9999 then
      raise exception 'Cada precio debe corresponder a un artículo solicitado y ser válido.' using errcode='22023';
    end if;
    insert into public.supplier_quote_lines(organization_id,quote_id,request_line_id,quantity_quoted,unit_cost,note)
    values(v_request.organization_id,v_quote,v_request_line,v_quantity,v_cost,left(coalesce(v_line->>'note',''),500));
  end loop;
  if (select count(*) from public.supplier_quote_lines where quote_id=v_quote)
     <> (select count(*) from public.purchase_request_lines where request_id=p_request_id) then
    raise exception 'La oferta debe incluir precio para cada artículo solicitado.' using errcode='22023';
  end if;
  insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id)
  values(v_request.organization_id,p_request_id,'quote_registered','Oferta registrada: '||coalesce(nullif(btrim(p_reference),''),'sin referencia'),v_uid);
  return v_quote;
end;
$$;

create or replace function public.select_supplier_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_quote public.supplier_quotes%rowtype;
  v_request public.purchase_requests%rowtype;
  v_order uuid;
  v_supplier_name text;
  v_lines jsonb;
  v_total numeric(14,2);
begin
  select * into v_quote from public.supplier_quotes where id=p_quote_id for update;
  select * into v_request from public.purchase_requests where id=v_quote.request_id for update;
  if v_quote.id is null or v_request.id is null or v_uid is null
     or not app_private.has_visualcorp_access(v_request.organization_id,'purchases','approve_purchase',v_request.branch_id)
     or not app_private.has_visualcorp_access(v_request.organization_id,'purchases','edit',v_request.branch_id) then
    raise exception 'No tienes permiso para elegir esta oferta.' using errcode='42501';
  end if;
  if v_request.status<>'approved' or v_quote.status<>'submitted' then
    raise exception 'La solicitud u oferta ya cambió de estado.' using errcode='22023';
  end if;
  if (v_quote.valid_until is not null and v_quote.valid_until<(now() at time zone 'America/Guayaquil')::date)
     or (v_quote.delivery_date is not null and v_quote.delivery_date<(now() at time zone 'America/Guayaquil')::date) then
    raise exception 'La vigencia o fecha de entrega de la oferta ya pasó; confirma las condiciones antes de convertirla en orden.' using errcode='22023';
  end if;
  if (select count(*) from public.supplier_quote_lines where quote_id=v_quote.id)
     <> (select count(*) from public.purchase_request_lines where request_id=v_request.id) then
    raise exception 'La oferta no contiene precio para todos los artículos solicitados.' using errcode='22023';
  end if;
  select s.name into v_supplier_name from public.suppliers s
    where s.id=v_quote.supplier_id and s.organization_id=v_quote.organization_id and s.active;
  if v_supplier_name is null then raise exception 'El proveedor ya no está activo.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object(
    'request_line_id',rl.id,'variant_id',rl.variant_id,
    'description_snapshot',rl.description_snapshot,'sku_snapshot',rl.sku_snapshot,
    'unit_snapshot',rl.unit_snapshot,'quantity_ordered',rl.quantity_requested,'unit_cost',ql.unit_cost
  ) order by rl.created_at,rl.id),
  sum(rl.quantity_requested*ql.unit_cost)
  into v_lines,v_total
  from public.purchase_request_lines rl
  join public.supplier_quote_lines ql on ql.request_line_id=rl.id and ql.organization_id=rl.organization_id
  where rl.request_id=v_request.id and ql.quote_id=v_quote.id;

  insert into public.purchase_orders(organization_id,branch_id,supplier_id,purchase_request_id,expected_date,note,created_by,status)
  values(v_request.organization_id,v_request.branch_id,v_quote.supplier_id,v_request.id,v_quote.delivery_date,
    left('Solicitud '||left(v_request.request_number,28)||' · Oferta '||coalesce(nullif(v_quote.reference,''),'sin referencia')||
      case when nullif(v_request.note,'') is null then '' else E'\n'||v_request.note end,2000),v_uid,'draft')
  returning id into v_order;
  insert into public.purchase_order_lines(organization_id,purchase_order_id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_ordered,unit_cost)
  select v_request.organization_id,v_order,(line->>'variant_id')::uuid,line->>'description_snapshot',
    coalesce(line->>'sku_snapshot',''),coalesce(line->>'unit_snapshot',''),
    (line->>'quantity_ordered')::numeric,(line->>'unit_cost')::numeric
  from jsonb_array_elements(v_lines) line;
  update public.supplier_quotes set status=case when id=v_quote.id then 'selected' else 'not_selected' end
    where request_id=v_request.id and status='submitted';
  update public.purchase_requests set status='converted',purchase_order_id=v_order,
    resolved_by=v_uid,resolved_at=now(),updated_at=now() where id=v_request.id;
  insert into public.purchase_request_events(organization_id,request_id,event_key,note,actor_id)
  values(v_request.organization_id,v_request.id,'quote_selected','Oferta de '||v_supplier_name||' seleccionada. Total cotizado USD '||to_char(v_total,'FM9999999990.00'),v_uid),
    (v_request.organization_id,v_request.id,'order_created','Borrador de orden creado desde la oferta seleccionada.',v_uid);
  return v_order;
end;
$$;

create or replace function public.get_purchasing_dashboard(
  p_organization_id uuid, p_branch_id uuid, p_period_start date, p_period_end date
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or p_period_start is null or p_period_end is null
     or p_period_end<p_period_start or p_period_end-p_period_start>370 then
    raise exception 'El periodo seleccionado no es válido.' using errcode='22023';
  end if;
  if p_branch_id is not null and not app_private.has_visualcorp_access(p_organization_id,'purchases','view',p_branch_id) then
    raise exception 'No tienes acceso a la sucursal seleccionada.' using errcode='42501';
  end if;
  with scoped_orders as (
    select o.* from public.purchase_orders o
    where o.organization_id=p_organization_id and (p_branch_id is null or o.branch_id=p_branch_id)
      and app_private.has_visualcorp_access(o.organization_id,'purchases','view',o.branch_id)
  ),
  order_amounts as (
    select o.id,o.supplier_id,o.status,o.expected_date,o.submitted_at,
      (o.submitted_at at time zone 'America/Guayaquil')::date as submitted_local_date,
      coalesce(sum(l.quantity_ordered*l.unit_cost),0)::numeric(14,2) as ordered_value,
      coalesce(sum(l.quantity_received*l.unit_cost),0)::numeric(14,2) as received_value,
      coalesce(sum((l.quantity_ordered-l.quantity_received)*l.unit_cost),0)::numeric(14,2) as outstanding_value
    from scoped_orders o left join public.purchase_order_lines l on l.purchase_order_id=o.id and l.organization_id=o.organization_id
    group by o.id
  ),
  final_receipts as (
    select r.purchase_order_id,max(r.received_at) as received_at
    from public.purchase_receipts r
    join scoped_orders o on o.id=r.purchase_order_id and o.organization_id=r.organization_id
    group by r.purchase_order_id
  ),
  supplier_payments as (
    select payment.id,payment.amount
    from public.finance_expense_payments payment
    join public.finance_expenses expense on expense.id=payment.expense_id and expense.organization_id=payment.organization_id
    join scoped_orders o on o.id=expense.purchase_order_id and o.organization_id=expense.organization_id
    where expense.status<>'void'
      and (payment.paid_at at time zone 'America/Guayaquil')::date between p_period_start and p_period_end
      and app_private.has_visualcorp_access(o.organization_id,'finance','view',o.branch_id)
  ),
  selected_period as (
    select a.* from order_amounts a where a.submitted_local_date between p_period_start and p_period_end and a.status<>'cancelled'
  ),
  monthly as (
    select to_char(date_trunc('month',a.submitted_local_date)::date,'YYYY-MM') as month,
      sum(a.ordered_value)::numeric(14,2) as committed,
      sum(a.received_value)::numeric(14,2) as received
    from selected_period a group by date_trunc('month',a.submitted_local_date)::date
    order by date_trunc('month',a.submitted_local_date)::date
  ),
  suppliers as (
    select s.id,s.name,count(*)::integer as orders,sum(a.ordered_value)::numeric(14,2) as committed
    from selected_period a join public.suppliers s on s.id=a.supplier_id and s.organization_id=p_organization_id
    group by s.id,s.name order by sum(a.ordered_value) desc,s.name limit 5
  ),
  punctuality as (
    select count(*)::integer as sample,
      count(*) filter (where (fr.received_at at time zone 'America/Guayaquil')::date<=a.expected_date)::integer as on_time
    from selected_period a join final_receipts fr on fr.purchase_order_id=a.id
    where a.status='received' and a.expected_date is not null
  ),
  lead_time as (
    select percentile_cont(0.5) within group (order by extract(epoch from (fr.received_at-a.submitted_at))::double precision/86400.0) as median_days,
      count(*)::integer as sample
    from selected_period a join final_receipts fr on fr.purchase_order_id=a.id
    where a.status='received' and a.submitted_at is not null and fr.received_at>=a.submitted_at
  )
  select jsonb_build_object(
    'confirmedValue',coalesce((select sum(ordered_value) from selected_period),0),
    'ordersInPeriod',coalesce((select count(*) from selected_period),0),
    'receivedValue',coalesce((select sum(received_value) from selected_period),0),
    'paidDocumented',coalesce((select sum(amount) from supplier_payments),0),
    'paymentSample',coalesce((select count(*) from supplier_payments),0),
    'outstandingValue',coalesce((select sum(outstanding_value) from order_amounts where status in ('ordered','partially_received')),0),
    'overdueCount',coalesce((select count(*) from order_amounts where status in ('ordered','partially_received') and expected_date<(now() at time zone 'America/Guayaquil')::date),0),
    'overdueValue',coalesce((select sum(outstanding_value) from order_amounts where status in ('ordered','partially_received') and expected_date<(now() at time zone 'America/Guayaquil')::date),0),
    'onTimeCount',coalesce((select on_time from punctuality),0),
    'onTimeSample',coalesce((select sample from punctuality),0),
    'onTimePercent',case when coalesce((select sample from punctuality),0)=0 then null else round(100.0*(select on_time from punctuality)/(select sample from punctuality),1) end,
    'medianLeadDays',case when (select sample from lead_time)=0 then null else round((select median_days from lead_time)::numeric,1) end,
    'leadTimeSample',coalesce((select sample from lead_time),0),
    'monthly',coalesce((select jsonb_agg(to_jsonb(monthly) order by month) from monthly),'[]'::jsonb),
    'suppliers',coalesce((select jsonb_agg(to_jsonb(suppliers) order by committed desc,name) from suppliers),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name) order by b.name)
      from public.branches b where b.organization_id=p_organization_id and b.active
        and app_private.has_visualcorp_access(b.organization_id,'purchases','view',b.id)),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_purchase_request_options(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.organizations o where o.id=p_organization_id) then
    raise exception 'Inicia sesión para consultar materiales y áreas disponibles.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name) order by b.name)
      from public.branches b where b.organization_id=p_organization_id and b.active
        and (app_private.has_visualcorp_access(b.organization_id,'purchases','edit',b.id)
          or app_private.has_visualcorp_access(b.organization_id,'workshop','view',b.id)
          or app_private.has_visualcorp_access(b.organization_id,'sales','view',b.id))),'[]'::jsonb),
    'areas',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'code',a.code,'name',a.name) order by a.name)
      from public.areas a where a.organization_id=p_organization_id and a.active
        and exists(select 1 from public.branches b where b.organization_id=a.organization_id and b.active
          and (app_private.has_visualcorp_access(b.organization_id,'workshop','view',b.id)
            or app_private.has_visualcorp_access(b.organization_id,'sales','view',b.id)
            or app_private.has_visualcorp_access(b.organization_id,'purchases','edit',b.id)))),'[]'::jsonb),
    'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',i.name,'variant',v.label,'sku',coalesce(v.sku,''),'unit',i.base_unit) order by i.name,v.label)
      from public.inventory_variants v join public.inventory_items i on i.id=v.item_id and i.organization_id=v.organization_id
      where v.organization_id=p_organization_id and v.active and i.active
        and exists(select 1 from public.branches b where b.organization_id=v.organization_id and b.active
          and (app_private.has_visualcorp_access(b.organization_id,'workshop','view',b.id)
            or app_private.has_visualcorp_access(b.organization_id,'sales','view',b.id)
            or app_private.has_visualcorp_access(b.organization_id,'purchases','edit',b.id)))),'[]'::jsonb),
    'jobs',coalesce((select jsonb_agg(jsonb_build_object(
        'id',job.id,'branch_id',job.branch_id,'title',job.title,'sale_code',job.sale_code,
        'workflow_code',job.workflow_code,'areas',coalesce((select jsonb_agg(jsonb_build_object('id',step.area_id,'title',step.title))
          from public.production_job_steps step where step.job_id=job.id and step.organization_id=job.organization_id
            and step.status not in ('completed','cancelled')),'[]'::jsonb)
      ) order by job.due_at nulls last,job.created_at desc)
      from public.production_jobs job where job.organization_id=p_organization_id and job.status in ('open','needs_review')
        and (app_private.has_visualcorp_access(job.organization_id,'workshop','view',job.branch_id)
          or app_private.has_visualcorp_access(job.organization_id,'sales','view',job.branch_id)
          or app_private.has_visualcorp_access(job.organization_id,'purchases','edit',job.branch_id))
        and exists(select 1 from public.production_job_steps step where step.job_id=job.id and step.organization_id=job.organization_id
          and step.status not in ('completed','cancelled'))),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Rejected units remain outstanding and never become inventory movements.
alter table public.purchase_receipt_lines
  add column quantity_rejected numeric(14,3) not null default 0 check (quantity_rejected>=0),
  add column discrepancy_note text not null default '' check (char_length(discrepancy_note)<=600);
alter table public.purchase_receipt_lines drop constraint if exists purchase_receipt_lines_quantity_received_check;
alter table public.purchase_receipt_lines add constraint purchase_receipt_lines_quantity_received_check check (quantity_received>=0);

create or replace function app_private.receive_purchase_order(
  p_order_id uuid, p_lines jsonb, p_idempotency_key uuid, p_reference text default '', p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_org uuid; v_branch uuid; v_status text; v_receipt uuid; v_existing_order uuid; v_line jsonb;
  v_po_line uuid; v_qty numeric; v_rejected numeric; v_discrepancy text; v_location text;
  v_variant uuid; v_cost numeric; v_supplier text; v_pending numeric;
begin
  select organization_id,branch_id,status into v_org,v_branch,v_status
    from public.purchase_orders where id=p_order_id for update;
  if v_org is null or v_uid is null or not app_private.has_visualcorp_access(v_org,'purchases','receive_purchase',v_branch) then
    raise exception 'No tienes permiso para recibir esta orden.' using errcode='42501';
  end if;
  if p_idempotency_key is null then raise exception 'Falta la clave de idempotencia.' using errcode='22023'; end if;
  select id,purchase_order_id into v_receipt,v_existing_order
    from public.purchase_receipts where organization_id=v_org and idempotency_key=p_idempotency_key;
  if v_receipt is not null then
    if v_existing_order<>p_order_id then raise exception 'La clave de recepción ya pertenece a otra orden.' using errcode='22023'; end if;
    return v_receipt;
  end if;
  if v_status not in ('ordered','partially_received') then
    raise exception 'Solo se reciben órdenes enviadas o parcialmente recibidas.' using errcode='22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'La recepción debe incluir al menos un artículo.' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) line
    group by line->>'purchase_order_line_id' having count(*)>1
  ) then raise exception 'Cada línea de orden debe aparecer una sola vez en la recepción.' using errcode='22023'; end if;
  insert into public.purchase_receipts(organization_id,purchase_order_id,idempotency_key,reference,note,received_by)
  values(v_org,p_order_id,p_idempotency_key,left(coalesce(p_reference,''),180),left(coalesce(p_note,''),2000),v_uid)
  returning id into v_receipt;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_po_line := (v_line->>'purchase_order_line_id')::uuid;
    v_qty := coalesce(nullif(v_line->>'quantity_received','')::numeric,0);
    v_rejected := coalesce(nullif(v_line->>'quantity_rejected','')::numeric,0);
    v_discrepancy := left(btrim(coalesce(v_line->>'discrepancy_note','')),600);
    v_location := coalesce(nullif(left(btrim(v_line->>'location_code'),80),''),'MAIN');
    if v_qty<0 or v_rejected<0 or v_qty+v_rejected<=0 then
      raise exception 'Registra una cantidad aceptada o rechazada mayor a cero.' using errcode='22023';
    end if;
    if v_rejected>0 and char_length(v_discrepancy)<3 then
      raise exception 'Describe el motivo de cada cantidad rechazada.' using errcode='22023';
    end if;
    select l.variant_id,l.unit_cost,l.quantity_ordered-l.quantity_received,s.name
      into v_variant,v_cost,v_pending,v_supplier
      from public.purchase_order_lines l
      join public.purchase_orders o on o.id=l.purchase_order_id and o.organization_id=l.organization_id
      join public.suppliers s on s.id=o.supplier_id and s.organization_id=o.organization_id
      where l.id=v_po_line and l.purchase_order_id=p_order_id and l.organization_id=v_org for update of l;
    if v_variant is null then raise exception 'La línea no pertenece a esta orden.' using errcode='22023'; end if;
    if v_qty+v_rejected>v_pending then raise exception 'La cantidad aceptada y rechazada supera el saldo pendiente.' using errcode='22023'; end if;
    insert into public.purchase_receipt_lines(organization_id,receipt_id,purchase_order_line_id,quantity_received,quantity_rejected,discrepancy_note,location_code)
    values(v_org,v_receipt,v_po_line,v_qty,v_rejected,v_discrepancy,v_location);
    if v_qty>0 then
      update public.purchase_order_lines set quantity_received=quantity_received+v_qty where id=v_po_line and organization_id=v_org;
      insert into public.inventory_movements(organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values(v_org,v_variant,v_branch,v_location,'receipt',v_qty,'Recepción aceptada de orden de compra '||p_order_id::text,'purchase_receipt',v_receipt,v_uid);
      if app_private.has_visualcorp_access(v_org,'inventory_costs','edit_costs',v_branch) then
        insert into public.inventory_item_costs(organization_id,variant_id,unit_cost,currency,supplier_name,updated_by,updated_at)
        values(v_org,v_variant,v_cost,'USD',v_supplier,v_uid,now())
        on conflict(organization_id,variant_id) do update set unit_cost=excluded.unit_cost,currency='USD',supplier_name=excluded.supplier_name,updated_by=v_uid,updated_at=now();
      end if;
    end if;
  end loop;
  update public.purchase_orders o set status=case
    when not exists(select 1 from public.purchase_order_lines l where l.purchase_order_id=o.id and l.organization_id=o.organization_id and l.quantity_received<l.quantity_ordered) then 'received'
    else 'partially_received' end,updated_at=now()
  where o.id=p_order_id and o.organization_id=v_org;
  return v_receipt;
end;
$$;

revoke all on function public.create_purchase_request(uuid,uuid,uuid,uuid,text,text,date,jsonb) from public,anon;
revoke all on function public.resolve_purchase_request(uuid,text,text) from public,anon;
revoke all on function public.capture_supplier_quote(uuid,uuid,text,date,date,text,jsonb) from public,anon;
revoke all on function public.select_supplier_quote(uuid) from public,anon;
revoke all on function public.get_purchasing_dashboard(uuid,uuid,date,date) from public,anon;
revoke all on function public.get_purchase_request_options(uuid) from public,anon;
revoke all on function app_private.receive_purchase_order(uuid,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_purchase_request(uuid,uuid,uuid,uuid,text,text,date,jsonb) to authenticated;
grant execute on function public.resolve_purchase_request(uuid,text,text) to authenticated;
grant execute on function public.capture_supplier_quote(uuid,uuid,text,date,date,text,jsonb) to authenticated;
grant execute on function public.select_supplier_quote(uuid) to authenticated;
grant execute on function public.get_purchasing_dashboard(uuid,uuid,date,date) to authenticated;
grant execute on function public.get_purchase_request_options(uuid) to authenticated;
grant execute on function app_private.receive_purchase_order(uuid,jsonb,uuid,text,text) to authenticated;
