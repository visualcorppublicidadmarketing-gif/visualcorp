-- Capture the inventory cost at the moment a POS recipe or production order
-- consumes a material. Cost values stay in a manager-only table because
-- inventory_movements is readable by a wider operational team.
create table public.inventory_movement_cost_snapshots (
  movement_id uuid primary key references public.inventory_movements(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  variant_id uuid not null,
  reference_type text not null check (reference_type in ('sale','production_order')),
  reference_id uuid not null,
  quantity_snapshot numeric(14,3) not null check (quantity_snapshot > 0),
  source_kind text not null check (source_kind in ('inventory_cost','missing_inventory_cost')),
  unit_cost_snapshot numeric(14,4),
  cost_total_snapshot numeric(14,2),
  inventory_cost_updated_at timestamptz,
  captured_at timestamptz not null default now(),
  foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete restrict,
  foreign key (variant_id, organization_id)
    references public.inventory_variants(id, organization_id) on delete restrict,
  check (
    (source_kind='inventory_cost' and unit_cost_snapshot is not null and cost_total_snapshot is not null)
    or (source_kind='missing_inventory_cost' and unit_cost_snapshot is null and cost_total_snapshot is null)
  )
);
create index inventory_movement_cost_snapshots_org_time_idx
  on public.inventory_movement_cost_snapshots(organization_id, captured_at desc);
create index inventory_movement_cost_snapshots_branch_time_idx
  on public.inventory_movement_cost_snapshots(branch_id, organization_id, captured_at desc);
create index inventory_movement_cost_snapshots_variant_org_idx
  on public.inventory_movement_cost_snapshots(variant_id, organization_id);
alter table public.inventory_movement_cost_snapshots enable row level security;
revoke all on public.inventory_movement_cost_snapshots from public,anon,authenticated;
grant select on public.inventory_movement_cost_snapshots to authenticated;
create policy inventory_movement_cost_snapshots_finance_read
  on public.inventory_movement_cost_snapshots for select to authenticated
  using (app_private.has_org_role(organization_id, branch_id, array['owner','admin','manager']));

create or replace function app_private.capture_inventory_consumption_cost()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_unit_cost numeric(14,4);
  v_cost_updated_at timestamptz;
  v_source text;
begin
  if new.movement_type<>'consumption'
     or new.quantity_delta>=0
     or new.reference_type is null
     or new.reference_type not in ('sale','production_order')
     or new.reference_id is null then
    return new;
  end if;

  if new.reference_type='sale' and not exists (
    select 1 from public.sales s
    where s.id=new.reference_id and s.organization_id=new.organization_id and s.branch_id=new.branch_id
  ) then
    raise exception 'El consumo de material debe vincularse con una venta de la misma sucursal.';
  elsif new.reference_type='production_order' and not exists (
    select 1 from public.production_orders po
    where po.id=new.reference_id and po.organization_id=new.organization_id and po.branch_id=new.branch_id
  ) then
    raise exception 'El consumo de material debe vincularse con una orden de producción de la misma sucursal.';
  end if;

  select unit_cost,updated_at into v_unit_cost,v_cost_updated_at
  from public.inventory_item_costs
  where organization_id=new.organization_id and variant_id=new.variant_id;

  if found then
    v_source:='inventory_cost';
  else
    v_source:='missing_inventory_cost';
  end if;

  insert into public.inventory_movement_cost_snapshots(
    movement_id,organization_id,branch_id,variant_id,reference_type,reference_id,
    quantity_snapshot,source_kind,unit_cost_snapshot,cost_total_snapshot,inventory_cost_updated_at,captured_at
  ) values (
    new.id,new.organization_id,new.branch_id,new.variant_id,new.reference_type,new.reference_id,
    abs(new.quantity_delta),v_source,v_unit_cost,
    case when v_source='inventory_cost' then round(v_unit_cost*abs(new.quantity_delta),2) else null end,
    v_cost_updated_at,now()
  ) on conflict (movement_id) do nothing;

  return new;
end;
$$;
revoke all on function app_private.capture_inventory_consumption_cost() from public,anon,authenticated;
create trigger inventory_movements_capture_consumption_cost
  after insert on public.inventory_movements
  for each row execute function app_private.capture_inventory_consumption_cost();

create or replace function public.get_finance_material_cost_summary(
  p_month date,
  p_branch_id uuid default null,
  p_advisor_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_org uuid;
  v_summary jsonb;
begin
  if auth.uid() is null or p_month is null then
    raise exception 'Inicia sesión y selecciona un mes.' using errcode='42501';
  end if;

  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager']) then
    raise exception 'No tienes permiso para consultar costos de materiales.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'consumption_movements',count(*),
    'costed_movements',count(*) filter (where c.source_kind='inventory_cost'),
    'missing_cost_movements',count(*) filter (where c.source_kind='missing_inventory_cost'),
    'material_cost_total',coalesce(sum(c.cost_total_snapshot) filter (where c.source_kind='inventory_cost'),0)
  ) into v_summary
  from public.inventory_movement_cost_snapshots c
  left join public.sales s
    on c.reference_type='sale' and s.id=c.reference_id and s.organization_id=c.organization_id
  left join public.production_orders po
    on c.reference_type='production_order' and po.id=c.reference_id and po.organization_id=c.organization_id
  left join public.sales ps
    on ps.id=po.sale_id and ps.organization_id=po.organization_id
  where c.organization_id=v_org
    and (p_branch_id is null or c.branch_id=p_branch_id)
    and (p_advisor_id is null or coalesce(s.advisor_id,ps.advisor_id)=p_advisor_id)
    and (c.captured_at at time zone 'America/Guayaquil')::date >= date_trunc('month',p_month)::date
    and (c.captured_at at time zone 'America/Guayaquil')::date < (date_trunc('month',p_month)+interval '1 month')::date;

  return v_summary;
end;
$$;
revoke all on function public.get_finance_material_cost_summary(date,uuid,uuid) from public,anon;
grant execute on function public.get_finance_material_cost_summary(date,uuid,uuid) to authenticated;
