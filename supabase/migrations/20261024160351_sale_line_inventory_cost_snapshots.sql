-- Preserve the inventory unit cost known at POS sale time without exposing
-- this sensitive field through the staff-readable sale_lines table.
create table public.sale_line_cost_snapshots (
  sale_line_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_kind text not null check (source_kind in ('inventory_cost','missing_inventory_cost','non_inventory_line')),
  unit_cost_snapshot numeric(14,4),
  cost_total_snapshot numeric(14,2),
  inventory_cost_updated_at timestamptz,
  captured_at timestamptz not null default now(),
  foreign key (sale_line_id, organization_id)
    references public.sale_lines(id, organization_id) on delete cascade,
  check (
    (source_kind='inventory_cost' and unit_cost_snapshot is not null and cost_total_snapshot is not null)
    or (source_kind<>'inventory_cost' and unit_cost_snapshot is null and cost_total_snapshot is null)
  )
);
create index sale_line_cost_snapshots_org_captured_idx
  on public.sale_line_cost_snapshots(organization_id, captured_at desc);
alter table public.sale_line_cost_snapshots enable row level security;
grant select on public.sale_line_cost_snapshots to authenticated;
create policy sale_line_cost_snapshots_finance_read
  on public.sale_line_cost_snapshots for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));

create or replace function app_private.capture_sale_line_cost_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_unit_cost numeric(14,4);
  v_cost_updated_at timestamptz;
  v_source text;
begin
  if tg_op='UPDATE' then
    -- Only update recognized quantity for lines captured by this migration.
    -- Older sales remain uncosted; current costs are never backfilled into history.
    update public.sale_line_cost_snapshots
    set cost_total_snapshot=round(unit_cost_snapshot*new.fulfilled_quantity,2)
    where sale_line_id=new.id and organization_id=new.organization_id and source_kind='inventory_cost';
    return new;
  end if;

  if new.variant_id is null then
    v_source:='non_inventory_line';
  else
    select unit_cost,updated_at into v_unit_cost,v_cost_updated_at
    from public.inventory_item_costs
    where organization_id=new.organization_id and variant_id=new.variant_id;
    if found then
      v_source:='inventory_cost';
    else
      v_source:='missing_inventory_cost';
    end if;
  end if;

  insert into public.sale_line_cost_snapshots(
    sale_line_id,organization_id,source_kind,unit_cost_snapshot,cost_total_snapshot,inventory_cost_updated_at
  ) values (
    new.id,new.organization_id,v_source,v_unit_cost,
    case when v_source='inventory_cost' then round(v_unit_cost*new.fulfilled_quantity,2) else null end,
    v_cost_updated_at
  );
  return new;
end;
$$;
revoke all on function app_private.capture_sale_line_cost_snapshot() from public,anon,authenticated;
create trigger sale_lines_capture_inventory_cost
  after insert or update of fulfilled_quantity on public.sale_lines
  for each row execute function app_private.capture_sale_line_cost_snapshot();

create or replace function public.get_finance_inventory_cost_summary(
  p_month date,
  p_branch_id uuid default null,
  p_advisor_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_org uuid;
  v_summary jsonb;
begin
  if auth.uid() is null or p_month is null then
    raise exception 'Inicia sesión y selecciona un mes.' using errcode='42501';
  end if;
  select id into v_org from public.organizations where slug='visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org,p_branch_id,array['owner','admin','manager']) then
    raise exception 'No tienes permiso para consultar costos de inventario.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'inventory_lines',count(*) filter (where c.source_kind='inventory_cost'),
    'missing_inventory_cost_lines',count(*) filter (where c.source_kind='missing_inventory_cost'),
    'non_inventory_lines',count(*) filter (where c.source_kind='non_inventory_line'),
    'cost_total',coalesce(sum(c.cost_total_snapshot) filter (where c.source_kind='inventory_cost'),0)
  ) into v_summary
  from public.sale_line_cost_snapshots c
  join public.sale_lines sl on sl.id=c.sale_line_id and sl.organization_id=c.organization_id
  join public.sales s on s.id=sl.sale_id and s.organization_id=sl.organization_id
  where c.organization_id=v_org
    and s.status='confirmed'
    and (p_branch_id is null or s.branch_id=p_branch_id)
    and (p_advisor_id is null or s.advisor_id=p_advisor_id)
    and (s.created_at at time zone 'America/Guayaquil')::date >= date_trunc('month',p_month)::date
    and (s.created_at at time zone 'America/Guayaquil')::date < (date_trunc('month',p_month)+interval '1 month')::date;
  return v_summary;
end;
$$;
revoke all on function public.get_finance_inventory_cost_summary(date,uuid,uuid) from public,anon;
grant execute on function public.get_finance_inventory_cost_summary(date,uuid,uuid) to authenticated;
