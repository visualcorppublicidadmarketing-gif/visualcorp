-- Production workflows generated from a confirmed POS sale.
-- One job per productive sale line; templates may visit the same area more than once.

alter table public.sale_lines add column if not exists client_line_key text;
alter table public.sale_lines add constraint sale_lines_client_line_key_length
  check (client_line_key is null or length(client_line_key) between 1 and 160);
create unique index if not exists sale_lines_sale_client_key_uq
  on public.sale_lines (sale_id, client_line_key) where client_line_key is not null;
alter table public.sales add column if not exists production_confirmation_fingerprint text;

insert into public.areas (organization_id,code,name,active)
select o.id,v.code,v.name,true from public.organizations o
cross join (values ('ASE','Asesoría'),('DIS','Diseño')) as v(code,name)
where o.slug='visual-corp'
on conflict (organization_id,code) do update set name=excluded.name,active=true;

create table public.production_workflow_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,47}$'),
  name text not null check (length(trim(name)) between 3 and 100),
  required_fields text[] not null default '{}',
  deposit_required numeric(14,2) not null default 0 check (deposit_required >= 0),
  steps jsonb not null check (jsonb_typeof(steps)='array' and jsonb_array_length(steps)<=16 and octet_length(steps::text)<=16000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,code)
);

create table public.catalog_product_workflow_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  catalog_product_id text not null,
  workflow_code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,catalog_product_id),
  foreign key (catalog_product_id,organization_id) references public.catalog_products(id,organization_id) on delete cascade,
  foreign key (organization_id,workflow_code) references public.production_workflow_templates(organization_id,code) on delete restrict
);
create index catalog_product_workflow_routes_active_idx
  on public.catalog_product_workflow_routes(organization_id,active,workflow_code);

create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  sale_id uuid not null,
  sale_line_id uuid not null,
  advisor_id uuid not null references auth.users(id) on delete restrict,
  catalog_product_id text,
  workflow_code text not null,
  sale_code text not null default '',
  customer_name text not null default '',
  customer_phone text not null default '',
  title text not null check (length(trim(title)) between 2 and 300),
  specifications jsonb not null default '{}'::jsonb
    check (jsonb_typeof(specifications)='object' and octet_length(specifications::text)<=16000),
  spec_version integer not null default 1 check (spec_version>0),
  review_from_version integer check (review_from_version>0 and review_from_version<=spec_version),
  deposit_required numeric(14,2) not null default 0 check (deposit_required>=0),
  approval_required boolean not null default false,
  artwork_review_status text not null default 'not_required'
    check (artwork_review_status in ('not_required','awaiting_art','awaiting_review','changes_requested','approved')),
  artwork_revision integer not null default 0 check (artwork_revision>=0),
  artwork_reference text not null default '' check (length(artwork_reference)<=1000),
  artwork_submitted_by uuid references auth.users(id) on delete set null,
  artwork_submitted_at timestamptz,
  artwork_reviewed_by uuid references auth.users(id) on delete set null,
  artwork_reviewed_at timestamptz,
  status text not null default 'open' check (status in ('open','needs_review','completed','cancelled')),
  due_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,sale_line_id),
  unique (id,organization_id),
  foreign key (branch_id,organization_id) references public.branches(id,organization_id),
  foreign key (sale_id,organization_id) references public.sales(id,organization_id),
  foreign key (sale_line_id,organization_id) references public.sale_lines(id,organization_id),
  foreign key (organization_id,workflow_code) references public.production_workflow_templates(organization_id,code)
);
create index production_jobs_advisor_queue_idx
  on public.production_jobs(organization_id,advisor_id,status,due_at);
create index production_jobs_sale_idx on public.production_jobs(sale_id);

create table public.production_job_spec_versions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_id uuid not null,
  version integer not null check (version>0),
  specifications jsonb not null check (jsonb_typeof(specifications)='object' and octet_length(specifications::text)<=16000),
  note text not null default '' check (length(note)<=1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (job_id,version),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade
);
create index production_job_spec_versions_job_idx on public.production_job_spec_versions(job_id,version desc);

create table public.production_job_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_id uuid not null,
  step_key text not null check (step_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  step_order integer not null check (step_order between 1 and 16),
  area_id uuid not null,
  title text not null check (length(trim(title)) between 3 and 200),
  status text not null default 'waiting' check (status in ('waiting','ready','in_progress','blocked','completed','cancelled')),
  review_hold boolean not null default false check (not review_hold or status='blocked'),
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  notes text not null default '' check (length(notes)<=4000),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id,step_key),
  unique (job_id,step_order),
  unique (id,organization_id),
  unique (id,job_id,organization_id),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade,
  foreign key (area_id,organization_id) references public.areas(id,organization_id)
);
create index production_job_steps_area_queue_idx
  on public.production_job_steps(organization_id,area_id,status,due_at);
create index production_job_steps_person_queue_idx
  on public.production_job_steps(organization_id,assigned_to,status,due_at);

create table public.production_job_step_dependencies (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_id uuid not null,
  step_id uuid not null,
  prerequisite_step_id uuid not null,
  primary key (step_id,prerequisite_step_id),
  check (step_id <> prerequisite_step_id),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade,
  foreign key (step_id,job_id,organization_id) references public.production_job_steps(id,job_id,organization_id) on delete cascade,
  foreign key (prerequisite_step_id,job_id,organization_id) references public.production_job_steps(id,job_id,organization_id) on delete cascade
);
create index production_job_step_dependencies_job_idx on public.production_job_step_dependencies(job_id);

create table public.production_job_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  job_id uuid not null,
  step_id uuid,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object' and octet_length(details::text)<=16000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (job_id,organization_id) references public.production_jobs(id,organization_id) on delete cascade,
  foreign key (step_id,organization_id) references public.production_job_steps(id,organization_id)
);
create index production_job_events_job_timeline_idx
  on public.production_job_events(job_id,created_at desc,id desc);

alter table public.production_workflow_templates enable row level security;
alter table public.catalog_product_workflow_routes enable row level security;
alter table public.production_jobs enable row level security;
alter table public.production_job_spec_versions enable row level security;
alter table public.production_job_steps enable row level security;
alter table public.production_job_step_dependencies enable row level security;
alter table public.production_job_events enable row level security;

revoke all on public.production_workflow_templates,public.catalog_product_workflow_routes,
  public.production_jobs,public.production_job_spec_versions,public.production_job_steps,public.production_job_step_dependencies,
  public.production_job_events from public,anon,authenticated;
grant select on public.production_workflow_templates,public.catalog_product_workflow_routes,
  public.production_jobs,public.production_job_spec_versions,public.production_job_steps,public.production_job_step_dependencies,
  public.production_job_events to authenticated;

create policy production_templates_read on public.production_workflow_templates for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'sales','view')
  or app_private.has_visualcorp_access(organization_id,'workshop','view'));
create policy production_product_routes_read on public.catalog_product_workflow_routes for select to authenticated
using (app_private.has_visualcorp_access(organization_id,'sales','view')
  or app_private.has_visualcorp_access(organization_id,'workshop','view'));
create policy production_product_routes_manage on public.catalog_product_workflow_routes for all to authenticated
using (app_private.has_visualcorp_access(organization_id,'sales','edit')
  and app_private.has_visualcorp_access(organization_id,'workshop','edit'))
with check (app_private.has_visualcorp_access(organization_id,'sales','edit')
  and app_private.has_visualcorp_access(organization_id,'workshop','edit'));
grant insert,update on public.catalog_product_workflow_routes to authenticated;
create policy production_jobs_read on public.production_jobs for select to authenticated
using ((advisor_id=(select auth.uid()) and app_private.has_visualcorp_access(organization_id,'sales','view',branch_id))
  or app_private.has_visualcorp_access(organization_id,'workshop','view',branch_id));
create policy production_steps_read on public.production_job_steps for select to authenticated
using (exists(select 1 from public.production_jobs j where j.id=job_id and j.organization_id=organization_id));
create policy production_job_versions_read on public.production_job_spec_versions for select to authenticated
using (exists(select 1 from public.production_jobs j where j.id=job_id and j.organization_id=organization_id));
create policy production_dependencies_read on public.production_job_step_dependencies for select to authenticated
using (exists(select 1 from public.production_jobs j where j.id=job_id and j.organization_id=organization_id));
create policy production_events_read on public.production_job_events for select to authenticated
using (exists(select 1 from public.production_jobs j where j.id=job_id and j.organization_id=organization_id));

insert into public.production_workflow_templates
  (organization_id,code,name,required_fields,steps)
select o.id,v.code,v.name,v.required_fields,v.steps::jsonb
from public.organizations o
cross join (values
  ('none','Entrega directa','{}'::text[],'[]'),
  ('review','Revisión de producción','{}'::text[],
   '[{"key":"review","area":"ASE","title":"Definir ruta de producción","depends_on":[]}]'),
  ('print','Impresión de lona o vinil',array['width_cm','height_cm'],
   '[{"key":"intake","area":"ASE","title":"Verificar ficha y medidas","depends_on":[]},{"key":"design","area":"DIS","title":"Diseñar y preparar arte","depends_on":["intake"]},{"key":"print","area":"IMP","title":"Imprimir el trabajo","depends_on":["design"]}]'),
  ('laser','Corte láser',array['width_cm','height_cm'],
   '[{"key":"intake","area":"ASE","title":"Verificar ficha y medidas","depends_on":[]},{"key":"design","area":"DIS","title":"Diseñar archivo de corte","depends_on":["intake"]},{"key":"laser","area":"LAS","title":"Realizar corte láser","depends_on":["design"]}]'),
  ('sign','Rótulo con fabricación',array['width_cm','height_cm','installation_address'],
   '[{"key":"intake","area":"ASE","title":"Verificar ficha del rótulo","depends_on":[]},{"key":"design","area":"DIS","title":"Diseñar rótulo","depends_on":["intake"]},{"key":"print","area":"IMP","title":"Imprimir piezas del rótulo","depends_on":["design"]},{"key":"workshop","area":"TAL","title":"Fabricar e instalar rótulo","depends_on":["print"]}]'),
  ('sign_measure','Rótulo con visita de medidas',array['installation_address'],
   '[{"key":"intake","area":"ASE","title":"Coordinar visita de medidas","depends_on":[]},{"key":"site_visit","area":"TAL","title":"Tomar y verificar medidas","depends_on":["intake"]},{"key":"design","area":"DIS","title":"Diseñar con medidas verificadas","depends_on":["site_visit"]},{"key":"print","area":"IMP","title":"Imprimir piezas del rótulo","depends_on":["design"]},{"key":"workshop","area":"TAL","title":"Fabricar e instalar rótulo","depends_on":["print"]}]'),
  ('neon','Neón con corte y armado',array['width_cm','height_cm'],
   '[{"key":"intake","area":"ASE","title":"Verificar ficha del neón","depends_on":[]},{"key":"design","area":"DIS","title":"Diseñar piezas y recorrido","depends_on":["intake"]},{"key":"laser","area":"LAS","title":"Cortar piezas de acrílico","depends_on":["design"]},{"key":"workshop","area":"TAL","title":"Armar neón e instalar si corresponde","depends_on":["laser"]}]'),
  ('sublimation','Sublimación',array['material'],
   '[{"key":"intake","area":"ASE","title":"Verificar ficha de sublimación","depends_on":[]},{"key":"design","area":"DIS","title":"Preparar diseño para sublimar","depends_on":["intake"]},{"key":"sublimation","area":"SUB","title":"Sublimar el producto","depends_on":["design"]}]')
) as v(code,name,required_fields,steps)
where o.slug='visual-corp'
on conflict (organization_id,code) do nothing;

-- Suggest routes only for product names whose work type is explicit. The POS
-- shows the suggestion and the advisor can change it for each sale line.
insert into public.catalog_product_workflow_routes
  (organization_id,catalog_product_id,workflow_code)
select c.organization_id,c.id,
  case
    when c.slug ~ '(^|-)neon(-|$)' then 'neon'
    when c.slug ~ '(^|-)(rotulo|letrero)(-|$)' then 'sign'
    when c.slug ~ '(^|-)laser(-|$)' then 'laser'
    when c.slug ~ '(^|-)sublima[a-z]*(-|$)' then 'sublimation'
    when c.slug ~ '^(lona|vinil)-' then 'print'
  end
from public.catalog_products c
join public.organizations o on o.id=c.organization_id and o.slug='visual-corp'
where c.slug ~ '(^|-)neon(-|$)|(^|-)(rotulo|letrero)(-|$)|(^|-)laser(-|$)|(^|-)sublima[a-z]*(-|$)|^(lona|vinil)-'
on conflict (organization_id,catalog_product_id) do nothing;

-- Preserve the existing sale behavior while retaining an exact key for every line.
CREATE OR REPLACE FUNCTION public.create_pos_sale_idempotent(p_idempotency_key text, p_branch_code text, p_customer_id uuid, p_customer_data jsonb, p_discount numeric, p_note text, p_allow_backorder boolean, p_lines jsonb, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_branch uuid;
  v_user uuid := (select auth.uid());
  v_role text;
  v_customer uuid := p_customer_id;
  v_sale uuid;
  v_sale_code text;
  v_existing_fingerprint text;
  v_line jsonb;
  v_payment jsonb;
  v_variant uuid;
  v_product text;
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_fulfilled numeric(14,3);
  v_backordered numeric(14,3);
  v_available numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(p_discount,0);
  v_paid numeric(14,2) := 0;
  v_backorder_total numeric(14,3) := 0;
  v_fingerprint text;
  v_location text;
  v_method text;
begin
  if v_user is null then raise exception 'Inicia sesión para registrar la orden.'; end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) not between 12 and 160 then
    raise exception 'La clave de operación no es válida.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Agrega al menos un artículo o servicio.';
  end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then raise exception 'Los pagos no tienen un formato válido.'; end if;
  if exists (select 1 from jsonb_array_elements(p_lines) l where l ? 'line_key'
    and (nullif(trim(l->>'line_key'),'') is null or length(trim(l->>'line_key'))>160)) then
    raise exception 'La clave de línea no es válida.';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines) l where nullif(trim(l->>'line_key'),'') is not null)
     <> (select count(distinct trim(l->>'line_key')) from jsonb_array_elements(p_lines) l where nullif(trim(l->>'line_key'),'') is not null) then
    raise exception 'La clave de línea está duplicada.';
  end if;

  select id into v_org from public.organizations where slug='visual-corp';
  select id into v_branch from public.branches where organization_id=v_org and code=upper(trim(p_branch_code)) and active;
  if v_branch is null then raise exception 'La sucursal seleccionada no está activa.'; end if;
  if not app_private.has_visualcorp_access(v_org,'sales','edit',v_branch) then
    raise exception 'No tienes permiso para registrar órdenes en esta sucursal.';
  end if;
  if v_discount < 0 then raise exception 'El descuento no puede ser negativo.'; end if;

  v_fingerprint := md5(jsonb_build_object(
    'branch',upper(trim(p_branch_code)), 'customer',p_customer_id,
    'customer_data',coalesce(p_customer_data,'{}'::jsonb), 'discount',v_discount,
    'note',coalesce(p_note,''), 'allow_backorder',coalesce(p_allow_backorder,false),
    'lines',p_lines, 'payments',p_payments
  )::text);
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || trim(p_idempotency_key),0));
  select id,sale_code,idempotency_fingerprint into v_sale,v_sale_code,v_existing_fingerprint
    from public.sales where organization_id=v_org and idempotency_key=trim(p_idempotency_key);
  if v_sale is not null then
    if v_existing_fingerprint is distinct from v_fingerprint then raise exception 'La clave ya fue usada con datos diferentes.'; end if;
    return jsonb_build_object('sale_id',v_sale,'sale_code',v_sale_code,'replayed',true);
  end if;

  if v_customer is not null and not exists(select 1 from public.customers where id=v_customer and organization_id=v_org) then
    raise exception 'El cliente seleccionado no pertenece a Visual Corp.';
  end if;
  if v_customer is null and coalesce(trim(p_customer_data->>'full_name'),'') <> '' then
    if coalesce(trim(p_customer_data->>'phone'),'') <> '' then
      select id into v_customer from public.customers where organization_id=v_org and phone=trim(p_customer_data->>'phone') limit 1;
    end if;
    if v_customer is null then
      insert into public.customers (organization_id,full_name,phone,email,document_reference,notes,created_by)
      values (v_org,trim(p_customer_data->>'full_name'),coalesce(trim(p_customer_data->>'phone'),''),
        coalesce(trim(p_customer_data->>'email'),''),coalesce(trim(p_customer_data->>'document_reference'),''),
        coalesce(trim(p_customer_data->>'notes'),''),v_user) returning id into v_customer;
    end if;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := nullif(v_line->>'quantity','')::numeric;
    v_price := nullif(v_line->>'unit_price','')::numeric;
    if v_quantity is null or v_quantity<=0 or v_price is null or v_price<0 then raise exception 'Cantidad o precio inválido.'; end if;
    v_subtotal := v_subtotal + round(v_quantity*v_price,2);
  end loop;
  if v_discount>v_subtotal then raise exception 'El descuento supera el subtotal.'; end if;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_method := coalesce(v_payment->>'method','other');
    if v_method not in ('cash','transfer','card','other') then raise exception 'Método de pago no válido.'; end if;
    if coalesce(nullif(v_payment->>'amount','')::numeric,0)<0 then raise exception 'El valor de pago no puede ser negativo.'; end if;
    v_paid := v_paid + round(coalesce(nullif(v_payment->>'amount','')::numeric,0),2);
  end loop;
  if v_paid > v_subtotal-v_discount then raise exception 'Los pagos superan el total de la orden.'; end if;

  v_sale_code := 'VC-'||to_char(now() at time zone 'UTC','YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales (organization_id,branch_id,customer_id,status,urgent_backorder,subtotal,discount_total,total,note,created_by,sale_code,payment_method,idempotency_key,idempotency_fingerprint)
  values (v_org,v_branch,v_customer,'confirmed',false,v_subtotal,v_discount,v_subtotal-v_discount,coalesce(p_note,''),v_user,v_sale_code,'other',trim(p_idempotency_key),v_fingerprint)
  returning id into v_sale;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_quantity := nullif(v_line->>'quantity','')::numeric;
    v_price := nullif(v_line->>'unit_price','')::numeric;
    v_product := nullif(v_line->>'catalog_product_id','');
    v_variant := null;
    v_location := 'MAIN';
    if v_product is not null then
      select l.inventory_variant_id,l.location_code into v_variant,v_location
        from public.catalog_inventory_links l
        join public.catalog_products c on c.id=l.catalog_product_id and c.organization_id=l.organization_id
        join public.inventory_variants iv on iv.id=l.inventory_variant_id and iv.organization_id=l.organization_id and iv.active
        where l.organization_id=v_org and l.catalog_product_id=v_product and l.branch_id=v_branch and l.active and c.is_published;
      if not found then v_variant:=null; v_location:='MAIN'; end if;
    end if;
    v_fulfilled:=v_quantity; v_backordered:=0;
    if v_variant is not null then
      -- Lock the variant row so concurrent sales cannot both consume the last units,
      -- including when the branch has no inventory_stock row yet.
      perform 1 from public.inventory_variants where id=v_variant and organization_id=v_org for update;
      select coalesce(sum(quantity-reserved_quantity),0) into v_available from public.inventory_stock
        where organization_id=v_org and variant_id=v_variant and branch_id=v_branch and location_code=v_location;
      if v_available<v_quantity then
        if not coalesce(p_allow_backorder,false) then raise exception 'Existencia disponible insuficiente para %.',coalesce(v_line->>'description','artículo'); end if;
        v_fulfilled:=greatest(v_available,0); v_backordered:=v_quantity-v_fulfilled;
        v_backorder_total:=v_backorder_total+v_backordered;
      end if;
    end if;
    insert into public.sale_lines (organization_id,sale_id,variant_id,catalog_product_id,client_line_key,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,unit_price,line_total)
    values (v_org,v_sale,v_variant,v_product,nullif(trim(v_line->>'line_key'),''),coalesce(v_line->>'sku',''),coalesce(v_line->>'description','Orden POS'),v_quantity,v_fulfilled,v_backordered,v_price,round(v_quantity*v_price,2));
    if v_variant is not null and v_fulfilled>0 then
      insert into public.inventory_movements (organization_id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_by)
      values (v_org,v_variant,v_branch,v_location,'sale',-v_fulfilled,'Orden POS '||v_sale_code,'sale',v_sale,v_user);
    end if;
  end loop;
  update public.sales set urgent_backorder=(v_backorder_total>0) where id=v_sale;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if coalesce(nullif(v_payment->>'amount','')::numeric,0)>0 then
      insert into public.sale_payments (organization_id,sale_id,method,amount,reference,note,created_by)
      values (v_org,v_sale,v_payment->>'method',round((v_payment->>'amount')::numeric,2),coalesce(v_payment->>'reference',''),coalesce(v_payment->>'note',''),v_user);
    end if;
  end loop;
  update public.sales set payment_method=coalesce((select min(method) from public.sale_payments where sale_id=v_sale),'other') where id=v_sale;
  return jsonb_build_object('sale_id',v_sale,'sale_code',v_sale_code,'subtotal',v_subtotal,'discount',v_discount,
    'total',v_subtotal-v_discount,'paid',v_paid,'balance',v_subtotal-v_discount-v_paid,'backordered_quantity',v_backorder_total,'replayed',false);
end;
$function$;

revoke all on function public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.create_pos_sale_idempotent(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb) to authenticated;

create or replace function app_private.can_work_production_area(
  p_organization_id uuid,p_branch_id uuid,p_area_code text,p_user_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id is not null and exists (
    select 1 from public.organization_memberships m
    join public.access_profiles p on p.id=m.profile_id and p.organization_id=m.organization_id and p.active
    where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active
      and (m.branch_id is null or m.branch_id=p_branch_id)
      and (
        m.role in ('owner','admin')
        or p.profile_key in ('admin','gerencia','coordinador_taller','encargado_local')
        or (p_area_code='ASE' and p.profile_key in ('asesoras','coordinador_ventas'))
        or (p_area_code='DIS' and p.profile_key='disenador_grafico')
        or (p_area_code='IMP' and p.profile_key='impresor')
        or (p_area_code='SUB' and p.profile_key='sublimacion')
        or (p_area_code in ('LAS','TAL','NEO','TRO') and p.profile_key='personal_taller')
      )
  );
$$;
revoke all on function app_private.can_work_production_area(uuid,uuid,text,uuid) from public,anon,authenticated;

create or replace function app_private.can_coordinate_production(
  p_organization_id uuid,p_branch_id uuid,p_user_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select p_user_id=(select auth.uid())
    and app_private.has_visualcorp_access(p_organization_id,'workshop','edit',p_branch_id)
    and exists (
      select 1 from public.organization_memberships m
      left join public.access_profiles p on p.id=m.profile_id and p.organization_id=m.organization_id and p.active
      where m.organization_id=p_organization_id and m.user_id=p_user_id and m.active
        and (m.branch_id is null or m.branch_id=p_branch_id)
        and (m.role in ('owner','admin') or p.profile_key in ('admin','gerencia','coordinador_taller','encargado_local'))
    );
$$;
revoke all on function app_private.can_coordinate_production(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function app_private.production_job_intake_complete(p_job uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_fields text[]; v_field text; v_value text;
begin
  select * into v_job from public.production_jobs where id=p_job;
  if not found or v_job.workflow_code='review' then return false; end if;
  select required_fields into v_fields from public.production_workflow_templates
    where organization_id=v_job.organization_id and code=v_job.workflow_code;
  foreach v_field in array coalesce(v_fields,'{}'::text[]) loop
    v_value:=nullif(trim(v_job.specifications->>v_field),'');
    if v_value is null then return false; end if;
    if v_field in ('width_cm','height_cm') then
      if v_value !~ '^[0-9]+([.][0-9]+)?$' or v_value::numeric<=0 then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function app_private.production_job_intake_complete(uuid) from public,anon,authenticated;

create or replace function app_private.production_step_gate_open(p_step uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype; v_paid numeric;
begin
  select * into v_step from public.production_job_steps where id=p_step;
  if not found then return false; end if;
  select * into v_job from public.production_jobs where id=v_step.job_id;
  if not found or v_job.status<>'open' then return false; end if;
  if exists (
    select 1 from public.production_job_step_dependencies d
    join public.production_job_steps prerequisite on prerequisite.id=d.prerequisite_step_id
    where d.step_id=p_step and prerequisite.status<>'completed'
  ) then return false; end if;
  if v_step.step_key in ('print','laser','sublimation','workshop') then
    if v_job.approval_required and v_job.artwork_review_status<>'approved' then return false; end if;
    if v_job.deposit_required>0 then
      select coalesce(sum(amount),0) into v_paid from public.sale_payments where sale_id=v_job.sale_id;
      if v_paid<v_job.deposit_required then return false; end if;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function app_private.production_step_gate_open(uuid) from public,anon,authenticated;

create or replace function app_private.refresh_production_job_readiness(p_job uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_step record;
begin
  for v_step in
    select id,status from public.production_job_steps
    where job_id=p_job and status in ('waiting','ready')
    order by step_order
  loop
    if app_private.production_step_gate_open(v_step.id) and v_step.status='waiting' then
      update public.production_job_steps set status='ready',updated_at=now() where id=v_step.id;
    elsif not app_private.production_step_gate_open(v_step.id) and v_step.status='ready' then
      update public.production_job_steps set status='waiting',updated_at=now() where id=v_step.id;
    end if;
  end loop;
end;
$$;
revoke all on function app_private.refresh_production_job_readiness(uuid) from public,anon,authenticated;

create or replace function app_private.create_production_job_steps(p_job uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_job public.production_jobs%rowtype; v_template public.production_workflow_templates%rowtype;
  v_step record; v_dependency text; v_step_id uuid; v_prerequisite_id uuid;
  v_prerequisite_order integer; v_base integer; v_area_id uuid; v_key text;
begin
  select * into v_job from public.production_jobs where id=p_job for update;
  if not found then raise exception 'Trabajo no encontrado.'; end if;
  select * into v_template from public.production_workflow_templates
    where organization_id=v_job.organization_id and code=v_job.workflow_code and active;
  if not found then raise exception 'La plantilla de producción no está activa.'; end if;
  select coalesce(max(step_order),0) into v_base from public.production_job_steps where job_id=p_job;
  for v_step in select value,ordinality::integer as sequence
    from jsonb_array_elements(v_template.steps) with ordinality
  loop
    if jsonb_typeof(v_step.value)<>'object'
       or jsonb_typeof(v_step.value->'depends_on')<>'array' then
      raise exception 'La plantilla % contiene un paso inválido.',v_template.code;
    end if;
    v_key:=v_step.value->>'key';
    select id into v_area_id from public.areas
      where organization_id=v_job.organization_id and code=v_step.value->>'area' and active;
    if v_area_id is null then raise exception 'Área no disponible en la plantilla %.',v_template.code; end if;
    insert into public.production_job_steps(
      organization_id,job_id,step_key,step_order,area_id,title,status,assigned_to,due_at,completed_at
    ) values (
      v_job.organization_id,p_job,v_key,v_base+v_step.sequence,v_area_id,v_step.value->>'title',
      case when v_key='intake' and app_private.production_job_intake_complete(p_job) then 'completed'
           when v_key in ('intake','review') then 'ready' else 'waiting' end,
      case when v_key in ('intake','review') then v_job.advisor_id else null end,
      v_job.due_at,
      case when v_key='intake' and app_private.production_job_intake_complete(p_job) then now() else null end
    );
  end loop;
  for v_step in select value,ordinality::integer as sequence
    from jsonb_array_elements(v_template.steps) with ordinality
  loop
    select id into v_step_id from public.production_job_steps
      where job_id=p_job and step_key=v_step.value->>'key';
    for v_dependency in select value from jsonb_array_elements_text(v_step.value->'depends_on')
    loop
      select id,step_order into v_prerequisite_id,v_prerequisite_order
      from public.production_job_steps where job_id=p_job and step_key=v_dependency;
      if v_prerequisite_id is null or v_prerequisite_order>=v_base+v_step.sequence then
        raise exception 'Dependencia inválida en la plantilla %.',v_template.code;
      end if;
      insert into public.production_job_step_dependencies(
        organization_id,job_id,step_id,prerequisite_step_id
      ) values(v_job.organization_id,p_job,v_step_id,v_prerequisite_id);
    end loop;
  end loop;
  perform app_private.refresh_production_job_readiness(p_job);
end;
$$;
revoke all on function app_private.create_production_job_steps(uuid) from public,anon,authenticated;

create or replace function app_private.update_production_job(
  p_job_id uuid,p_expected_version integer,p_specifications jsonb default null,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_job public.production_jobs%rowtype; v_user uuid:=(select auth.uid());
  v_changed boolean; v_material_change boolean; v_started boolean; v_needs_review boolean;
  v_site_visit_editor boolean;
begin
  if v_user is null then raise exception 'Inicia sesión para editar el trabajo.' using errcode='42501'; end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.status in ('completed','cancelled') then
    raise exception 'Trabajo no encontrado o cerrado.' using errcode='55000';
  end if;
  v_site_visit_editor:=exists(
    select 1 from public.production_job_steps s
    join public.areas a on a.id=s.area_id and a.organization_id=s.organization_id
    where s.job_id=v_job.id and s.step_key='site_visit' and a.code='TAL'
      and s.status in ('ready','in_progress') and s.assigned_to=v_user
  ) and app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,'TAL',v_user);
  if not (
    (v_job.advisor_id=v_user and app_private.has_visualcorp_access(v_job.organization_id,'sales','edit',v_job.branch_id))
    or app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)
    or v_site_visit_editor
  ) then raise exception 'No puedes editar esta ficha.' using errcode='42501'; end if;
  if p_expected_version is distinct from v_job.spec_version then
    raise exception 'La ficha cambió. Recárgala antes de guardar.' using errcode='40001';
  end if;
  if p_specifications is not null and (jsonb_typeof(p_specifications)<>'object' or octet_length(p_specifications::text)>16000) then
    raise exception 'Las especificaciones deben ser un objeto válido.' using errcode='22023';
  end if;
  if p_specifications is not null and (
    p_specifications->'artwork_status' is distinct from v_job.specifications->'artwork_status'
    or p_specifications->'approval_required' is distinct from v_job.specifications->'approval_required'
  ) then
    raise exception 'La revisión de arte se controla desde su panel, no desde la ficha.' using errcode='42501';
  end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  if v_site_visit_editor and v_job.advisor_id<>v_user
    and not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)
    and p_specifications is not null
    and (p_specifications - array['width_cm','height_cm','site_visit_notes'])
       is distinct from (v_job.specifications - array['width_cm','height_cm','site_visit_notes']) then
    raise exception 'En la visita solo puedes registrar medidas y observaciones.' using errcode='42501';
  end if;
  v_changed:=p_specifications is not null and p_specifications is distinct from v_job.specifications;
  if not v_changed and nullif(trim(p_note),'') is null then
    return jsonb_build_object('job_id',v_job.id,'spec_version',v_job.spec_version,'status',v_job.status,'changed',false);
  end if;
  if v_changed then
    v_material_change:=(p_specifications - 'artwork_status') is distinct from (v_job.specifications - 'artwork_status');
    select exists(select 1 from public.production_job_steps
      where job_id=v_job.id and step_key not in ('intake','review')
        and (status='completed' or (status='in_progress' and step_key<>'site_visit'))) into v_started;
    v_needs_review:=v_material_change and v_started;
    update public.production_jobs
    set specifications=p_specifications,
        spec_version=spec_version+1,
        status=case when v_needs_review then 'needs_review' else status end,
        review_from_version=case when v_needs_review and v_job.status<>'needs_review'
          then v_job.spec_version else review_from_version end,
        artwork_review_status=case when v_material_change and approval_required then 'awaiting_art' else artwork_review_status end,
        artwork_reviewed_by=case when v_material_change and approval_required then null else artwork_reviewed_by end,
        artwork_reviewed_at=case when v_material_change and approval_required then null else artwork_reviewed_at end,
        updated_at=now()
    where id=v_job.id;
    insert into public.production_job_spec_versions(
      organization_id,job_id,version,specifications,note,created_by
    ) values (v_job.organization_id,v_job.id,v_job.spec_version+1,p_specifications,left(coalesce(p_note,''),1000),v_user);
    if v_needs_review then
      update public.production_job_steps set status='blocked',review_hold=true,updated_at=now()
      where job_id=v_job.id and status in ('waiting','ready');
    else
      perform app_private.refresh_production_job_readiness(v_job.id);
    end if;
  end if;
  insert into public.production_job_events(
    organization_id,job_id,event_type,details,created_by
  ) values (
    v_job.organization_id,v_job.id,case when v_changed then 'specifications_updated' else 'note_added' end,
    jsonb_build_object('note',left(coalesce(p_note,''),1000),'from_version',v_job.spec_version,
      'to_version',v_job.spec_version+case when v_changed then 1 else 0 end,
      'requires_review',coalesce(v_needs_review,false)),v_user
  );
  return jsonb_build_object('job_id',v_job.id,
    'spec_version',v_job.spec_version+case when v_changed then 1 else 0 end,
    'status',case when coalesce(v_needs_review,false) then 'needs_review' else v_job.status end,
    'changed',v_changed);
end;
$$;
revoke all on function app_private.update_production_job(uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function app_private.update_production_job(uuid,integer,jsonb,text) to authenticated;
create or replace function public.update_production_job(
  p_job_id uuid,p_expected_version integer,p_specifications jsonb default null,p_note text default ''
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.update_production_job($1,$2,$3,$4);
$$;
revoke all on function public.update_production_job(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.update_production_job(uuid,integer,jsonb,text) to authenticated;

-- A specification review belongs to the whole job. It must remain resolvable
-- even when the only active stage is in progress and no waiting stage was held.
create or replace function app_private.resolve_production_job_review(
  p_job_id uuid,p_expected_version integer,p_decision text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_user uuid:=(select auth.uid()); v_note text:=trim(coalesce(p_note,''));
begin
  if v_user is null then raise exception 'Inicia sesión para revisar el trabajo.' using errcode='42501'; end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.status<>'needs_review' then
    raise exception 'Este trabajo no tiene una revisión pendiente.' using errcode='55000';
  end if;
  if not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user) then
    raise exception 'Solo coordinación puede aceptar este cambio.' using errcode='42501';
  end if;
  if p_expected_version is distinct from v_job.spec_version then
    raise exception 'La ficha cambió. Recárgala antes de decidir.' using errcode='40001';
  end if;
  if p_decision not in ('accepted','changes_requested') or p_decision is null then
    raise exception 'La decisión de revisión no es válida.' using errcode='22023';
  end if;
  if length(v_note)<3 or length(v_note)>1000 then
    raise exception 'Explica la decisión en 3 a 1000 caracteres.' using errcode='22023';
  end if;
  if p_decision='accepted' then
    update public.production_jobs set status='open',review_from_version=null,updated_at=now() where id=v_job.id;
    update public.production_job_steps set status='waiting',review_hold=false,updated_at=now()
      where job_id=v_job.id and status='blocked' and review_hold;
    perform app_private.refresh_production_job_readiness(v_job.id);
  else
    update public.production_jobs set updated_at=now() where id=v_job.id;
  end if;
  insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
    values (v_job.organization_id,v_job.id,case when p_decision='accepted'
      then 'specification_review_accepted' else 'specification_review_changes_requested' end,
      jsonb_build_object('note',v_note,'from_version',v_job.review_from_version,
        'to_version',v_job.spec_version),v_user);
  return jsonb_build_object('job_id',v_job.id,
    'status',case when p_decision='accepted' then 'open' else 'needs_review' end,
    'spec_version',v_job.spec_version);
end;
$$;
revoke all on function app_private.resolve_production_job_review(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function app_private.resolve_production_job_review(uuid,integer,text,text) to authenticated;
create or replace function public.resolve_production_job_review(
  p_job_id uuid,p_expected_version integer,p_decision text,p_note text
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.resolve_production_job_review($1,$2,$3,$4);
$$;
revoke all on function public.resolve_production_job_review(uuid,integer,text,text) from public,anon;
grant execute on function public.resolve_production_job_review(uuid,integer,text,text) to authenticated;

-- The POS uses one database call. An error at any point rolls back the sale,
-- fulfillment and every generated job together.
create or replace function app_private.confirm_pos_sale_with_workflows(
  p_idempotency_key text,p_branch_code text,p_customer_id uuid,p_customer_data jsonb,
  p_discount numeric,p_note text,p_allow_backorder boolean,p_lines jsonb,p_payments jsonb,
  p_fulfillment jsonb,p_production_jobs jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_sale_result jsonb; v_sale public.sales%rowtype; v_line public.sale_lines%rowtype;
  v_customer public.customers%rowtype; v_entry jsonb; v_spec jsonb; v_template public.production_workflow_templates%rowtype;
  v_code text; v_index integer; v_line_key text; v_job_id uuid; v_fingerprint text;
  v_created integer:=0; v_skipped integer:=0; v_user uuid:=(select auth.uid());
  v_install boolean; v_address text; v_maps text;
begin
  if v_user is null then raise exception 'Inicia sesión para confirmar la venta.' using errcode='42501'; end if;
  if p_fulfillment is null or jsonb_typeof(p_fulfillment)<>'object'
     or octet_length(p_fulfillment::text)>8000 then
    raise exception 'Los datos de entrega no son válidos.' using errcode='22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0
     or jsonb_array_length(p_lines)>100 or octet_length(p_lines::text)>100000 then
    raise exception 'La venta necesita de 1 a 100 artículos.' using errcode='22023';
  end if;
  if p_production_jobs is null or jsonb_typeof(p_production_jobs)<>'array'
     or jsonb_array_length(p_production_jobs)<>jsonb_array_length(p_lines)
     or octet_length(p_production_jobs::text)>250000 then
    raise exception 'Cada artículo necesita una ruta de trabajo.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l
    where jsonb_typeof(l)<>'object' or nullif(trim(l->>'line_key'),'') is null
      or length(l->>'line_key')>160) then
    raise exception 'Cada artículo necesita una clave única.' using errcode='22023';
  end if;
  if (select count(distinct l->>'line_key') from jsonb_array_elements(p_lines) l)
     <>jsonb_array_length(p_lines) then
    raise exception 'Hay claves de artículo repetidas.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_production_jobs) j
    where jsonb_typeof(j)<>'object' or coalesce(j->>'line_index','') !~ '^(0|[1-9][0-9]?)$'
      or case when coalesce(j->>'line_index','') ~ '^(0|[1-9][0-9]?)$'
        then (j->>'line_index')::integer>=jsonb_array_length(p_lines) else true end
      or jsonb_typeof(j->'specifications')<>'object'
      or octet_length((j->'specifications')::text)>16000) then
    raise exception 'Una ficha de producción es inválida.' using errcode='22023';
  end if;
  if (select count(distinct (j->>'line_index')::integer) from jsonb_array_elements(p_production_jobs) j)
     <>jsonb_array_length(p_lines) then
    raise exception 'Cada artículo debe tener una sola ficha de producción.' using errcode='22023';
  end if;
  v_install:=coalesce((p_fulfillment->>'installation_required')::boolean,false);
  v_address:=nullif(trim(p_fulfillment->>'installation_address'),'');
  v_maps:=nullif(trim(p_fulfillment->>'installation_maps_url'),'');
  if v_install and v_address is null then
    raise exception 'Agrega la ubicación de instalación.' using errcode='22023';
  end if;
  if v_maps is not null and v_maps !~* '^https://(www[.])?google[.]com/maps/|^https://maps[.]app[.]goo[.]gl/|^https://goo[.]gl/maps/' then
    raise exception 'El enlace debe ser de Google Maps.' using errcode='22023';
  end if;
  -- The older sale RPC already locks the idempotency key, validates prices,
  -- consumes inventory and records payments. Its call remains in this transaction.
  v_sale_result:=public.create_pos_sale_idempotent(
    p_idempotency_key,p_branch_code,p_customer_id,p_customer_data,p_discount,p_note,
    p_allow_backorder,p_lines,p_payments
  );
  select * into v_sale from public.sales where id=(v_sale_result->>'sale_id')::uuid for update;
  if not found or v_sale.status<>'confirmed' then
    raise exception 'No se pudo confirmar la venta.' using errcode='55000';
  end if;
  if v_sale.advisor_id is distinct from v_user and not app_private.can_coordinate_production(
    v_sale.organization_id,v_sale.branch_id,v_user
  ) then raise exception 'No puedes confirmar el trabajo de otra asesora.' using errcode='42501'; end if;
  v_fingerprint:=md5(jsonb_build_object('fulfillment',p_fulfillment,'jobs',p_production_jobs)::text);
  if v_sale.production_confirmation_fingerprint is not null then
    if v_sale.production_confirmation_fingerprint is distinct from v_fingerprint then
      raise exception 'La clave de venta ya se usó con otra ficha de producción.' using errcode='23505';
    end if;
    return v_sale_result || jsonb_build_object('workflows_created',0,'production_jobs_skipped',0,
      'production_workflow_ids',coalesce((select jsonb_agg(id order by created_at,id)
        from public.production_jobs where sale_id=v_sale.id),'[]'::jsonb));
  end if;
  if coalesce((v_sale_result->>'replayed')::boolean,false) then
    raise exception 'La venta ya existe sin ficha de producción. Requiere revisión antes de reintentar.' using errcode='55000';
  end if;
  insert into public.sale_fulfillment_details(
    sale_id,organization_id,installation_required,installation_address,installation_maps_url,
    installation_latitude,installation_longitude,installation_estimated_at,delivery_due_at,updated_by
  ) values (
    v_sale.id,v_sale.organization_id,v_install,v_address,v_maps,
    nullif(p_fulfillment->>'installation_latitude','')::numeric,
    nullif(p_fulfillment->>'installation_longitude','')::numeric,
    nullif(p_fulfillment->>'installation_estimated_at','')::timestamptz,
    nullif(p_fulfillment->>'delivery_due_at','')::timestamptz,v_user
  );
  if v_sale.customer_id is not null then
    select * into v_customer from public.customers where id=v_sale.customer_id;
  end if;
  for v_entry in select value from jsonb_array_elements(p_production_jobs) loop
    v_index:=(v_entry->>'line_index')::integer;
    v_line_key:=p_lines->v_index->>'line_key';
    v_code:=v_entry->>'workflow_code';
    v_spec:=v_entry->'specifications';
    select * into v_template from public.production_workflow_templates
      where organization_id=v_sale.organization_id and code=v_code and active;
    if not found then raise exception 'La ruta % no está disponible.',coalesce(v_code,'sin nombre') using errcode='22023'; end if;
    select * into v_line from public.sale_lines
      where sale_id=v_sale.id and organization_id=v_sale.organization_id and client_line_key=v_line_key;
    if not found then raise exception 'No se encontró el artículo % de la venta.',v_line_key using errcode='55000'; end if;
    if v_code='none' then v_skipped:=v_skipped+1; continue; end if;
    insert into public.production_jobs(
      organization_id,branch_id,sale_id,sale_line_id,advisor_id,catalog_product_id,
      workflow_code,sale_code,customer_name,customer_phone,title,specifications,
      deposit_required,approval_required,artwork_review_status,due_at,created_by
    ) values (
      v_sale.organization_id,v_sale.branch_id,v_sale.id,v_line.id,v_sale.advisor_id,
      v_line.catalog_product_id,v_code,coalesce(v_sale.sale_code,''),
      coalesce(v_customer.full_name,''),coalesce(v_customer.phone,''),v_line.description_snapshot,
      v_spec,v_template.deposit_required,
      coalesce((v_spec->>'approval_required')::boolean,false),
      case when coalesce((v_spec->>'approval_required')::boolean,false) then 'awaiting_art' else 'not_required' end,
      nullif(p_fulfillment->>'delivery_due_at','')::timestamptz,v_user
    ) returning id into v_job_id;
    insert into public.production_job_spec_versions(
      organization_id,job_id,version,specifications,note,created_by
    ) values (v_sale.organization_id,v_job_id,1,v_spec,'Ficha creada al confirmar la venta',v_user);
    perform app_private.create_production_job_steps(v_job_id);
    insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
    values (v_sale.organization_id,v_job_id,'job_created',
      jsonb_build_object('workflow_code',v_code,'sale_id',v_sale.id),v_user);
    v_created:=v_created+1;
  end loop;
  update public.sales set production_confirmation_fingerprint=v_fingerprint where id=v_sale.id;
  return v_sale_result || jsonb_build_object('workflows_created',v_created,
    'production_jobs_skipped',v_skipped,
    'production_workflow_ids',coalesce((select jsonb_agg(id order by created_at,id)
      from public.production_jobs where sale_id=v_sale.id),'[]'::jsonb));
end;
$$;
revoke all on function app_private.confirm_pos_sale_with_workflows(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function app_private.confirm_pos_sale_with_workflows(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb,jsonb,jsonb) to authenticated;
create or replace function public.confirm_pos_sale_with_workflows(
  p_idempotency_key text,p_branch_code text,p_customer_id uuid,p_customer_data jsonb,
  p_discount numeric,p_note text,p_allow_backorder boolean,p_lines jsonb,p_payments jsonb,
  p_fulfillment jsonb,p_production_jobs jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.confirm_pos_sale_with_workflows($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11);
$$;
revoke all on function public.confirm_pos_sale_with_workflows(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.confirm_pos_sale_with_workflows(text,text,uuid,jsonb,numeric,text,boolean,jsonb,jsonb,jsonb,jsonb) to authenticated;

create or replace function app_private.transition_production_job_step(
  p_step_id uuid,p_action text,p_note text default '',p_assigned_to uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_area_code text; v_user uuid:=(select auth.uid()); v_coordinator boolean; v_area_access boolean;
  v_new_status text; v_target uuid; v_job_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión para cambiar una tarea.' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select job_id into v_job_id from public.production_job_steps where id=p_step_id;
  if not found then raise exception 'Tarea no encontrada.' using errcode='P0002'; end if;
  select * into v_job from public.production_jobs where id=v_job_id for update;
  if not found or v_job.status in ('completed','cancelled') then
    raise exception 'El trabajo está cerrado.' using errcode='55000';
  end if;
  select * into v_step from public.production_job_steps where id=p_step_id for update;
  if not found then raise exception 'Tarea no encontrada.' using errcode='P0002'; end if;
  select code into v_area_code from public.areas where id=v_step.area_id and organization_id=v_job.organization_id;
  v_coordinator:=app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user);
  v_area_access:=app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area_code,v_user);
  if not v_coordinator and not v_area_access then
    raise exception 'Esta tarea corresponde a otra área.' using errcode='42501';
  end if;
  if p_action='assign' then
    if not v_coordinator then raise exception 'Solo coordinación puede asignar personas.' using errcode='42501'; end if;
    if v_step.status in ('completed','cancelled') then raise exception 'No se puede reasignar una tarea cerrada.' using errcode='55000'; end if;
    v_target:=p_assigned_to;
    if v_target is not null and not app_private.can_work_production_area(
      v_job.organization_id,v_job.branch_id,v_area_code,v_target
    ) then raise exception 'La persona no tiene acceso activo a esta área.' using errcode='42501'; end if;
    update public.production_job_steps set assigned_to=v_target,updated_at=now() where id=p_step_id;
    v_new_status:=v_step.status;
  elsif p_action='take' then
    if v_step.status not in ('ready','blocked') or v_step.assigned_to is not null then
      raise exception 'Solo puedes tomar una tarea disponible y sin responsable.' using errcode='55000';
    end if;
    update public.production_job_steps set assigned_to=v_user,updated_at=now() where id=p_step_id;
    v_new_status:=v_step.status;
  elsif p_action='start' then
    if v_step.status<>'ready' or not app_private.production_step_gate_open(p_step_id) then
      raise exception 'La tarea aún no está lista para empezar.' using errcode='55000';
    end if;
    if v_step.assigned_to is not null and v_step.assigned_to<>v_user and not v_coordinator then
      raise exception 'La tarea está asignada a otra persona.' using errcode='42501';
    end if;
    update public.production_job_steps set status='in_progress',
      assigned_to=coalesce(assigned_to,v_user),started_at=coalesce(started_at,now()),updated_at=now()
    where id=p_step_id;
    v_new_status:='in_progress';
  elsif p_action='complete' then
    if v_step.status not in ('ready','in_progress') or not app_private.production_step_gate_open(p_step_id) then
      raise exception 'Completa primero los pasos y requisitos anteriores.' using errcode='55000';
    end if;
    if v_step.assigned_to is not null and v_step.assigned_to<>v_user and not v_coordinator then
      raise exception 'La tarea está asignada a otra persona.' using errcode='42501';
    end if;
    if v_step.step_key='intake' and not app_private.production_job_intake_complete(v_job.id) then
      raise exception 'Completa los datos técnicos obligatorios antes de avanzar.' using errcode='55000';
    end if;
    if v_step.step_key='site_visit' and (
      coalesce(v_job.specifications->>'width_cm','') !~ '^[0-9]+([.][0-9]+)?$'
      or coalesce(v_job.specifications->>'height_cm','') !~ '^[0-9]+([.][0-9]+)?$'
      or case when coalesce(v_job.specifications->>'width_cm','') ~ '^[0-9]+([.][0-9]+)?$'
        then (v_job.specifications->>'width_cm')::numeric<=0 else true end
      or case when coalesce(v_job.specifications->>'height_cm','') ~ '^[0-9]+([.][0-9]+)?$'
        then (v_job.specifications->>'height_cm')::numeric<=0 else true end
    ) then raise exception 'Registra medidas verificadas mayores a cero antes de cerrar la visita.' using errcode='55000'; end if;
    if v_step.step_key='review' then
      raise exception 'Selecciona primero una ruta de producción para este trabajo.' using errcode='55000';
    end if;
    if v_step.step_key='design' and v_job.approval_required then
      raise exception 'Entrega el enlace del arte desde Diseño para solicitar su aprobación.' using errcode='55000';
    end if;
    update public.production_job_steps set status='completed',assigned_to=coalesce(assigned_to,v_user),
      started_at=coalesce(started_at,now()),completed_at=now(),updated_at=now() where id=p_step_id;
    v_new_status:='completed';
    perform app_private.refresh_production_job_readiness(v_job.id);
    if not exists(select 1 from public.production_job_steps where job_id=v_job.id and status<>'completed') then
      update public.production_jobs set status='completed',updated_at=now() where id=v_job.id;
    end if;
  elsif p_action='block' then
    if v_step.status not in ('ready','in_progress') then raise exception 'Solo se puede bloquear una tarea activa.' using errcode='55000'; end if;
    if nullif(trim(p_note),'') is null then raise exception 'Explica el motivo del bloqueo.' using errcode='22023'; end if;
    if v_step.assigned_to is not null and v_step.assigned_to<>v_user and not v_coordinator then
      raise exception 'La tarea está asignada a otra persona.' using errcode='42501';
    end if;
    update public.production_job_steps set status='blocked',assigned_to=coalesce(assigned_to,v_user),
      notes=left(p_note,1000),updated_at=now() where id=p_step_id;
    v_new_status:='blocked';
  elsif p_action='unblock' then
    if v_step.status<>'blocked' then raise exception 'La tarea no está bloqueada.' using errcode='55000'; end if;
    if v_job.status='needs_review' or v_step.review_hold then
      raise exception 'Coordinación debe revisar primero el cambio en la ficha.' using errcode='55000';
    end if;
    if v_step.assigned_to is not null and v_step.assigned_to<>v_user and not v_coordinator then
      raise exception 'La tarea está asignada a otra persona.' using errcode='42501';
    end if;
    update public.production_job_steps set status='waiting',updated_at=now() where id=p_step_id;
    perform app_private.refresh_production_job_readiness(v_job.id);
    select status into v_new_status from public.production_job_steps where id=p_step_id;
  else
    raise exception 'Acción de tarea no reconocida.' using errcode='22023';
  end if;
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values (v_job.organization_id,v_job.id,v_step.id,'step_'||p_action,
    jsonb_build_object('from_status',v_step.status,'to_status',v_new_status,
      'note',left(coalesce(p_note,''),1000),'assigned_to',
      (select assigned_to from public.production_job_steps where id=p_step_id)),v_user);
  return jsonb_build_object('step_id',v_step.id,'job_id',v_job.id,'status',v_new_status,
    'job_status',(select status from public.production_jobs where id=v_job.id));
end;
$$;
revoke all on function app_private.transition_production_job_step(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function app_private.transition_production_job_step(uuid,text,text,uuid) to authenticated;
create or replace function public.transition_production_job_step(
  p_step_id uuid,p_action text,p_note text default '',p_assigned_to uuid default null
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.transition_production_job_step($1,$2,$3,$4);
$$;
revoke all on function public.transition_production_job_step(uuid,text,text,uuid) from public,anon;
grant execute on function public.transition_production_job_step(uuid,text,text,uuid) to authenticated;

-- An assigned designer submits a versioned reference. Production remains gated until advisory approval.
create or replace function app_private.submit_production_artwork(
  p_job_id uuid,p_reference text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_user uuid:=(select auth.uid()); v_reference text:=trim(coalesce(p_reference,''));
  v_object_name text;
begin
  if v_user is null then raise exception 'Inicia sesión para entregar el arte.' using errcode='42501'; end if;
  if length(v_reference)>1000 or (v_reference !~* '^https://[^[:space:]]+$'
     and v_reference !~ '^storage://production-artwork/') then
    raise exception 'Añade un enlace HTTPS o una prueba privada válida.' using errcode='22023';
  end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.status<>'open' or not v_job.approval_required then
    raise exception 'La revisión de arte no está disponible para este trabajo.' using errcode='55000';
  end if;
  select * into v_step from public.production_job_steps
    where job_id=p_job_id and step_key='design' for update;
  if not found then raise exception 'Este trabajo no tiene etapa de diseño.' using errcode='55000'; end if;
  if not app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,'DIS',v_user)
     or v_step.assigned_to is distinct from v_user then
    raise exception 'Solo la persona asignada en Diseño puede entregar este arte.' using errcode='42501';
  end if;
  if v_job.artwork_review_status not in ('awaiting_art','changes_requested')
     or v_step.status not in ('in_progress','completed') then
    raise exception 'Inicia la etapa de Diseño antes de entregar una nueva versión.' using errcode='55000';
  end if;
  if v_reference like 'storage://production-artwork/%' then
    v_object_name:=substring(v_reference from length('storage://production-artwork/')+1);
    if split_part(v_object_name,'/',1)<>v_job.organization_id::text
       or split_part(v_object_name,'/',2)<>v_job.id::text
       or not exists(select 1 from storage.objects o
         where o.bucket_id='production-artwork' and o.name=v_object_name and o.owner_id=v_user::text) then
      raise exception 'La prueba privada no pertenece a esta orden o no está disponible.' using errcode='42501';
    end if;
  end if;
  if v_step.status='in_progress' then
    update public.production_job_steps set status='completed',completed_at=now(),updated_at=now()
      where id=v_step.id;
  end if;
  update public.production_jobs set artwork_review_status='awaiting_review',
    artwork_revision=artwork_revision+1,artwork_reference=v_reference,
    artwork_submitted_by=v_user,artwork_submitted_at=now(),
    artwork_reviewed_by=null,artwork_reviewed_at=null,updated_at=now()
    where id=v_job.id;
  perform app_private.refresh_production_job_readiness(v_job.id);
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,v_step.id,'artwork_submitted',
    jsonb_build_object('revision',v_job.artwork_revision+1,'reference',v_reference,
      'note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('job_id',v_job.id,'revision',v_job.artwork_revision+1,'status','awaiting_review');
end;
$$;
revoke all on function app_private.submit_production_artwork(uuid,text,text) from public,anon,authenticated;
grant execute on function app_private.submit_production_artwork(uuid,text,text) to authenticated;
create or replace function public.submit_production_artwork(
  p_job_id uuid,p_reference text,p_note text default ''
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.submit_production_artwork($1,$2,$3);
$$;
revoke all on function public.submit_production_artwork(uuid,text,text) from public,anon;
grant execute on function public.submit_production_artwork(uuid,text,text) to authenticated;

create or replace function app_private.review_production_artwork(
  p_job_id uuid,p_expected_revision integer,p_decision text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_user uuid:=(select auth.uid()); v_new_status text;
begin
  if v_user is null then raise exception 'Inicia sesión para revisar el arte.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approved','changes_requested') then
    raise exception 'Decisión de revisión inválida.' using errcode='22023';
  end if;
  if length(coalesce(p_note,''))>1000 or (p_decision='changes_requested' and length(trim(coalesce(p_note,'')))<3) then
    raise exception 'Explica la corrección solicitada (máximo 1000 caracteres).' using errcode='22023';
  end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.status<>'open' or not v_job.approval_required
     or v_job.artwork_review_status<>'awaiting_review' then
    raise exception 'No hay un arte entregado pendiente de revisión.' using errcode='55000';
  end if;
  select * into v_step from public.production_job_steps
    where job_id=p_job_id and step_key='design' for update;
  if not found or v_step.status<>'completed' then
    raise exception 'No hay un arte entregado pendiente de revisión.' using errcode='55000';
  end if;
  if p_expected_revision is distinct from v_job.artwork_revision then
    raise exception 'El arte cambió. Recarga la ficha antes de decidir.' using errcode='40001';
  end if;
  if not ((v_job.advisor_id=v_user and
           app_private.has_visualcorp_access(v_job.organization_id,'sales','edit',v_job.branch_id))
          or app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)) then
    raise exception 'Solo Asesoría o coordinación pueden revisar este arte.' using errcode='42501';
  end if;
  if p_decision='changes_requested' and exists(
    select 1 from public.production_job_steps
    where job_id=v_job.id and step_key in ('print','laser','sublimation','workshop')
      and status in ('in_progress','completed')
  ) then
    raise exception 'Ya hay producción iniciada. Coordinación debe revisar las etapas antes de devolver el arte.' using errcode='55000';
  end if;
  v_new_status:=p_decision;
  update public.production_jobs set artwork_review_status=v_new_status,
    artwork_reviewed_by=v_user,artwork_reviewed_at=now(),updated_at=now() where id=v_job.id;
  if p_decision='changes_requested' then
    update public.production_job_steps set status='ready',completed_at=null,updated_at=now()
      where id=v_step.id;
  end if;
  perform app_private.refresh_production_job_readiness(v_job.id);
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values(v_job.organization_id,v_job.id,v_step.id,
    case when p_decision='approved' then 'artwork_approved' else 'artwork_changes_requested' end,
    jsonb_build_object('revision',v_job.artwork_revision,'note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('job_id',v_job.id,'revision',v_job.artwork_revision,'status',v_new_status);
end;
$$;
revoke all on function app_private.review_production_artwork(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function app_private.review_production_artwork(uuid,integer,text,text) to authenticated;
create or replace function public.review_production_artwork(
  p_job_id uuid,p_expected_revision integer,p_decision text,p_note text default ''
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.review_production_artwork($1,$2,$3,$4);
$$;
revoke all on function public.review_production_artwork(uuid,integer,text,text) from public,anon;
grant execute on function public.review_production_artwork(uuid,integer,text,text) to authenticated;

-- Coordination sees only active members eligible for the selected step's area.
create or replace function app_private.list_production_step_assignees(p_step_id uuid)
returns table(user_id uuid, display_name text)
language plpgsql stable security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype; v_area_code text;
begin
  select * into v_step from public.production_job_steps where id=p_step_id;
  if not found then raise exception 'Tarea no encontrada.' using errcode='P0002'; end if;
  select * into v_job from public.production_jobs where id=v_step.job_id;
  if not found or not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,(select auth.uid())) then
    raise exception 'Solo coordinación puede consultar responsables.' using errcode='42501';
  end if;
  select a.code into v_area_code from public.areas a
    where a.id=v_step.area_id and a.organization_id=v_job.organization_id;
  return query
    select distinct m.user_id,
      coalesce(nullif(trim(p.full_name),''),'Integrante '||left(m.user_id::text,8))::text
    from public.organization_memberships m
    left join public.profiles p on p.user_id=m.user_id
    where m.organization_id=v_job.organization_id and m.active
      and (m.branch_id is null or m.branch_id=v_job.branch_id)
      and app_private.can_work_production_area(v_job.organization_id,v_job.branch_id,v_area_code,m.user_id)
    order by 2,1;
end;
$$;
revoke all on function app_private.list_production_step_assignees(uuid) from public,anon,authenticated;
grant execute on function app_private.list_production_step_assignees(uuid) to authenticated;
create or replace function public.list_production_step_assignees(p_step_id uuid)
returns table(user_id uuid, display_name text)
language sql stable security invoker set search_path='' as $$
  select * from app_private.list_production_step_assignees($1);
$$;
revoke all on function public.list_production_step_assignees(uuid) from public,anon;
grant execute on function public.list_production_step_assignees(uuid) to authenticated;

-- Assignment and scheduling are saved together so the audit record describes one decision.
create or replace function app_private.coordinate_production_job_step(
  p_step_id uuid,p_expected_updated_at timestamptz,p_assigned_to uuid,p_due_at timestamptz,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_step public.production_job_steps%rowtype; v_job public.production_jobs%rowtype;
  v_area_code text; v_user uuid:=(select auth.uid()); v_job_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión para coordinar esta tarea.' using errcode='42501'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'La nota es demasiado larga.' using errcode='22001'; end if;
  select job_id into v_job_id from public.production_job_steps where id=p_step_id;
  if not found then raise exception 'Tarea no encontrada.' using errcode='P0002'; end if;
  select * into v_job from public.production_jobs where id=v_job_id for update;
  if not found or v_job.status in ('completed','cancelled') then
    raise exception 'Esta etapa ya está cerrada.' using errcode='55000';
  end if;
  select * into v_step from public.production_job_steps where id=p_step_id for update;
  if not found or v_step.status in ('completed','cancelled') then
    raise exception 'Esta etapa ya está cerrada.' using errcode='55000';
  end if;
  if not app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user) then
    raise exception 'Solo coordinación puede asignar y programar etapas.' using errcode='42501';
  end if;
  if p_expected_updated_at is distinct from v_step.updated_at then
    raise exception 'La etapa cambió. Actualiza la ficha antes de guardar.' using errcode='40001';
  end if;
  select code into v_area_code from public.areas
    where id=v_step.area_id and organization_id=v_job.organization_id;
  if p_assigned_to is not null and not app_private.can_work_production_area(
    v_job.organization_id,v_job.branch_id,v_area_code,p_assigned_to
  ) then raise exception 'La persona no tiene acceso activo a esta área.' using errcode='42501'; end if;
  if v_step.assigned_to is not distinct from p_assigned_to and v_step.due_at is not distinct from p_due_at then
    raise exception 'Cambia el responsable o la fecha antes de guardar.' using errcode='22023';
  end if;
  update public.production_job_steps
    set assigned_to=p_assigned_to,due_at=p_due_at,updated_at=now()
    where id=p_step_id;
  update public.production_jobs set updated_at=now() where id=v_job.id;
  insert into public.production_job_events(organization_id,job_id,step_id,event_type,details,created_by)
  values (v_job.organization_id,v_job.id,v_step.id,'step_coordinated',
    jsonb_build_object('previous_assignee',v_step.assigned_to,'assigned_to',p_assigned_to,
      'previous_assignee_name',(select full_name from public.profiles where user_id=v_step.assigned_to),
      'assigned_to_name',(select full_name from public.profiles where user_id=p_assigned_to),
      'previous_due_at',v_step.due_at,'due_at',p_due_at,'note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('step_id',v_step.id,'job_id',v_job.id,
    'assigned_to',p_assigned_to,'due_at',p_due_at);
end;
$$;
revoke all on function app_private.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function app_private.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) to authenticated;
create or replace function public.coordinate_production_job_step(
  p_step_id uuid,p_expected_updated_at timestamptz,p_assigned_to uuid,p_due_at timestamptz,p_note text default ''
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.coordinate_production_job_step($1,$2,$3,$4,$5);
$$;
revoke all on function public.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) from public,anon;
grant execute on function public.coordinate_production_job_step(uuid,timestamptz,uuid,timestamptz,text) to authenticated;

create or replace function app_private.choose_production_job_workflow(
  p_job_id uuid,p_workflow_code text,p_expected_version integer,p_note text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.production_jobs%rowtype; v_user uuid:=(select auth.uid()); v_template public.production_workflow_templates%rowtype;
begin
  if v_user is null then raise exception 'Inicia sesión para definir la ruta.' using errcode='42501'; end if;
  select * into v_job from public.production_jobs where id=p_job_id for update;
  if not found or v_job.workflow_code<>'review' or v_job.status<>'open' then
    raise exception 'Este trabajo ya tiene una ruta o está cerrado.' using errcode='55000';
  end if;
  if v_job.spec_version<>p_expected_version then
    raise exception 'La ficha cambió. Recárgala antes de elegir la ruta.' using errcode='40001';
  end if;
  if not ((v_job.advisor_id=v_user and app_private.has_visualcorp_access(
    v_job.organization_id,'sales','edit',v_job.branch_id))
    or app_private.can_coordinate_production(v_job.organization_id,v_job.branch_id,v_user)) then
    raise exception 'No puedes definir la ruta de este trabajo.' using errcode='42501';
  end if;
  select * into v_template from public.production_workflow_templates
    where organization_id=v_job.organization_id and code=p_workflow_code and active;
  if not found or p_workflow_code='review' then
    raise exception 'Selecciona una ruta de producción válida.' using errcode='22023';
  end if;
  update public.production_job_steps set status='completed',completed_at=now(),updated_at=now()
    where job_id=v_job.id and step_key='review' and status in ('ready','in_progress','blocked');
  update public.production_jobs set workflow_code=p_workflow_code,
    deposit_required=v_template.deposit_required,
    status=case when p_workflow_code='none' then 'completed' else 'open' end,
    updated_at=now() where id=v_job.id;
  if p_workflow_code<>'none' then perform app_private.create_production_job_steps(v_job.id); end if;
  insert into public.production_job_events(organization_id,job_id,event_type,details,created_by)
  values (v_job.organization_id,v_job.id,'workflow_selected',
    jsonb_build_object('workflow_code',p_workflow_code,'note',left(coalesce(p_note,''),1000)),v_user);
  return jsonb_build_object('job_id',v_job.id,'workflow_code',p_workflow_code);
end;
$$;
revoke all on function app_private.choose_production_job_workflow(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function app_private.choose_production_job_workflow(uuid,text,integer,text) to authenticated;
create or replace function public.choose_production_job_workflow(
  p_job_id uuid,p_workflow_code text,p_expected_version integer,p_note text default ''
) returns jsonb language sql security invoker set search_path='' as $$
  select app_private.choose_production_job_workflow($1,$2,$3,$4);
$$;
revoke all on function public.choose_production_job_workflow(uuid,text,integer,text) from public,anon;
grant execute on function public.choose_production_job_workflow(uuid,text,integer,text) to authenticated;

-- Small approval proofs live in a private bucket. Production source files may use an external HTTPS link.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('production-artwork','production-artwork',false,6291456,
  array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy production_artwork_read on storage.objects for select to authenticated
using (
  bucket_id='production-artwork' and
  case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists(
      select 1 from public.production_jobs j
      where j.id=(storage.foldername(name))[2]::uuid
        and j.organization_id=(storage.foldername(name))[1]::uuid
        and ((j.advisor_id=(select auth.uid()) and app_private.has_visualcorp_access(
          j.organization_id,'sales','view',j.branch_id))
          or app_private.has_visualcorp_access(j.organization_id,'workshop','view',j.branch_id))
    ) else false end
);

create policy production_artwork_upload on storage.objects for insert to authenticated
with check (
  bucket_id='production-artwork' and owner_id=(select auth.uid())::text
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](png|jpe?g|webp|pdf)$'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists(
      select 1 from public.production_jobs j
      join public.production_job_steps s on s.job_id=j.id and s.step_key='design'
      where j.id=(storage.foldername(name))[2]::uuid
        and j.organization_id=(storage.foldername(name))[1]::uuid
        and j.status='open' and j.approval_required
        and j.artwork_review_status in ('awaiting_art','changes_requested')
        and s.assigned_to=(select auth.uid()) and s.status in ('in_progress','completed')
        and app_private.has_visualcorp_access(j.organization_id,'workshop','edit',j.branch_id)
    ) else false end
);
