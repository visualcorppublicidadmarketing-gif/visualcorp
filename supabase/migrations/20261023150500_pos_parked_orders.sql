-- Recoverable POS drafts. Drafting does not reserve stock or create a sale.
create table public.parked_pos_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  total numeric(14,2) not null check (total > 0),
  status text not null default 'parked' check (status in ('parked','converted')),
  converted_sale_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  check ((status = 'parked' and converted_sale_id is null) or (status = 'converted' and converted_sale_id is not null))
);

create index parked_pos_orders_active_idx
  on public.parked_pos_orders (organization_id, branch_id, created_at desc)
  where status = 'parked';

alter table public.parked_pos_orders enable row level security;
create policy parked_pos_orders_staff_read on public.parked_pos_orders
  for select to authenticated
  using (status = 'parked' and app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager','advisor']));
grant select on public.parked_pos_orders to authenticated;
revoke insert, update, delete on public.parked_pos_orders from public, anon, authenticated;

create or replace function public.park_pos_order(
  p_organization_id uuid,
  p_branch_code text,
  p_idempotency_key text,
  p_payload jsonb,
  p_total numeric
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_branch uuid;
  v_id uuid;
  v_existing public.parked_pos_orders%rowtype;
begin
  if v_user is null or p_organization_id is null then raise exception 'Inicia sesión en la organización para guardar la orden.'; end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 12 then raise exception 'La clave de recuperación de la orden no es válida.'; end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 50000 then raise exception 'Los datos de la orden en espera no son válidos.'; end if;
  if p_total is null or p_total <= 0 or p_total > 10000000 then raise exception 'El total de la orden debe ser mayor que cero.'; end if;
  select b.id into v_branch from public.branches b
    where b.organization_id = p_organization_id and b.code = upper(trim(coalesce(p_branch_code,''))) and b.active;
  if v_branch is null or not app_private.has_org_role(p_organization_id, v_branch, array['owner','admin','manager','advisor']) then
    raise exception 'No tienes acceso a esta sucursal.';
  end if;
  select * into v_existing from public.parked_pos_orders
    where organization_id = p_organization_id and idempotency_key = trim(p_idempotency_key) for update;
  if found then
    if v_existing.created_by <> v_user or v_existing.branch_id <> v_branch or v_existing.payload <> p_payload or v_existing.total <> round(p_total,2) then
      raise exception 'La clave ya está asociada a otra orden en espera.';
    end if;
    return v_existing.id;
  end if;
  insert into public.parked_pos_orders(organization_id,branch_id,created_by,idempotency_key,payload,total)
    values (p_organization_id,v_branch,v_user,trim(p_idempotency_key),p_payload,round(p_total,2))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.park_pos_order(uuid,text,text,jsonb,numeric) from public, anon;
grant execute on function public.park_pos_order(uuid,text,text,jsonb,numeric) to authenticated;

create or replace function public.complete_parked_pos_order(p_parked_order uuid, p_sale uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_order public.parked_pos_orders%rowtype;
  v_sale_org uuid;
  v_sale_branch uuid;
  v_sale_key text;
begin
  if v_user is null then raise exception 'Inicia sesión para completar la orden.'; end if;
  select * into v_order from public.parked_pos_orders where id = p_parked_order for update;
  if not found or not app_private.has_org_role(v_order.organization_id,v_order.branch_id,array['owner','admin','manager','advisor']) then
    raise exception 'La orden en espera no existe o no tienes acceso.';
  end if;
  select s.organization_id,s.branch_id,s.idempotency_key into v_sale_org,v_sale_branch,v_sale_key
    from public.sales s where s.id = p_sale and s.status = 'confirmed';
  if v_sale_org is distinct from v_order.organization_id or v_sale_branch is distinct from v_order.branch_id or v_sale_key is distinct from v_order.idempotency_key then
    raise exception 'La venta debe coincidir con la clave de recuperación y la sucursal de la orden.';
  end if;
  if v_order.status = 'converted' then
    if v_order.converted_sale_id = p_sale then return; end if;
    raise exception 'La orden ya fue convertida en otra venta.';
  end if;
  update public.parked_pos_orders set status='converted', converted_sale_id=p_sale, updated_at=now() where id=v_order.id;
end $$;
revoke all on function public.complete_parked_pos_order(uuid,uuid) from public, anon;
grant execute on function public.complete_parked_pos_order(uuid,uuid) to authenticated;

comment on table public.parked_pos_orders is 'Recoverable POS drafts. Parked orders do not reserve stock; stock changes only when the associated sale is confirmed.';

insert into public.internal_change_log
  (organization_id,title,summary,details,category,audience,version_tag,status,published_at)
select o.id,
  'Ventas POS recuperables',
  'Guarda carritos y cotizaciones aprobadas en espera para retomarlos en el POS sin reservar ni descontar existencias.',
  'Las órdenes en espera se guardan en Supabase con sucursal, responsable, fecha, total y detalle del borrador. Se recuperan desde cualquier dispositivo autorizado de la misma sucursal. Al confirmar, la misma clave idempotente evita duplicar la venta; el borrador queda cerrado solo cuando la venta enlazada coincide. Guardar en espera no reserva stock ni registra pagos.',
  'sales','both','phase3-pos-parked-orders','published',now()
from public.organizations o where o.slug='visual-corp'
on conflict do nothing;
