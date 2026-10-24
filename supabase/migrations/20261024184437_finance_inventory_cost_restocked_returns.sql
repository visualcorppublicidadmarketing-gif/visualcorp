-- Keep inventory cost metrics aligned with sellable stock returned through
-- POS Operations. Returned units marked inspection/scrap remain costed.
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
    'cost_total',coalesce(sum(greatest(c.cost_total_snapshot - least(sl.fulfilled_quantity,coalesce(r.restocked_quantity,0))*c.unit_cost_snapshot,0)) filter (where c.source_kind='inventory_cost'),0),
    'restocked_return_units',coalesce(sum(least(sl.fulfilled_quantity,coalesce(r.restocked_quantity,0))) filter (where c.source_kind='inventory_cost'),0),
    'restocked_return_cost',coalesce(sum(least(sl.fulfilled_quantity,coalesce(r.restocked_quantity,0))*c.unit_cost_snapshot) filter (where c.source_kind='inventory_cost'),0)
  ) into v_summary
  from public.sale_line_cost_snapshots c
  join public.sale_lines sl on sl.id=c.sale_line_id and sl.organization_id=c.organization_id
  join public.sales s on s.id=sl.sale_id and s.organization_id=sl.organization_id
  left join lateral (
    select coalesce(sum(srl.quantity),0) as restocked_quantity
    from public.sale_return_lines srl
    join public.sale_returns sr on sr.id=srl.return_id and sr.organization_id=srl.organization_id
    where srl.sale_line_id=sl.id
      and srl.organization_id=sl.organization_id
      and srl.disposition='restock'
      and sr.kind='return'
  ) r on true
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
