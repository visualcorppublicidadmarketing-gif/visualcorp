-- SECURITY DEFINER bypasses table RLS, so the summary must enforce the same
-- granular cost permissions and branch boundary as inventory_item_costs.
create or replace function app_private.has_visualcorp_access_orgwide(
  p_org uuid,
  p_module text,
  p_action text
) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_memberships m
    join public.access_profiles p on p.id=coalesce(m.profile_id,(
      select legacy.id from public.access_profiles legacy
      where legacy.organization_id=m.organization_id and legacy.profile_key=m.role limit 1
    )) and p.organization_id=m.organization_id
    left join public.access_profile_permissions permission
      on permission.profile_id=p.id and permission.module_key=p_module
      and permission.action_key=p_action and permission.enabled
    where m.organization_id=p_org and m.user_id=auth.uid() and m.active
      and m.branch_id is null and p.active
      and (m.role='owner' or permission.profile_id is not null
        or (p_action='view' and exists (
          select 1 from public.access_profile_permissions edit_permission
          where edit_permission.profile_id=p.id and edit_permission.module_key=p_module
            and edit_permission.action_key='edit' and edit_permission.enabled
        )))
  );
$$;

revoke all on function app_private.has_visualcorp_access_orgwide(uuid,text,text) from public,anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.has_visualcorp_access_orgwide(uuid,text,text) to authenticated;

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
  if v_org is null then
    raise exception 'No se encontró la organización de este resumen.' using errcode='42501';
  end if;

  if p_branch_id is null then
    if not app_private.has_visualcorp_access_orgwide(v_org,'inventory_costs','view')
       or not app_private.has_visualcorp_access_orgwide(v_org,'inventory_costs','view_costs') then
      raise exception 'El resumen de todas las sucursales requiere permiso de costos en un perfil de organización.' using errcode='42501';
    end if;
  elsif not exists (
    select 1 from public.branches b where b.id=p_branch_id and b.organization_id=v_org
  ) then
    raise exception 'La sucursal no pertenece a esta organización.' using errcode='22023';
  end if;

  if not app_private.has_visualcorp_access(v_org,'inventory_costs','view',p_branch_id)
     or not app_private.has_visualcorp_access(v_org,'inventory_costs','view_costs',p_branch_id) then
    raise exception 'Tu perfil no tiene permiso para consultar estos costos de inventario.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'inventory_lines',count(*) filter (where c.source_kind='inventory_cost'),
    'missing_inventory_cost_lines',count(*) filter (where c.source_kind='missing_inventory_cost'),
    'non_inventory_lines',count(*) filter (where c.source_kind='non_inventory_line'),
    'cost_total',coalesce(sum(greatest(c.cost_total_snapshot - round(least(sl.fulfilled_quantity,coalesce(r.restocked_quantity,0))*c.unit_cost_snapshot,2),0)) filter (where c.source_kind='inventory_cost'),0),
    'restocked_return_units',coalesce(sum(least(sl.fulfilled_quantity,coalesce(r.restocked_quantity,0))) filter (where c.source_kind='inventory_cost'),0),
    'restocked_return_cost',coalesce(sum(round(least(sl.fulfilled_quantity,coalesce(r.restocked_quantity,0))*c.unit_cost_snapshot,2)) filter (where c.source_kind='inventory_cost'),0)
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

-- These snapshots were created after the general profile policies. Replace
-- role-only permissive reads so direct REST selects obey the cost permissions.
drop policy if exists sale_line_cost_snapshots_finance_read on public.sale_line_cost_snapshots;
create policy sale_line_cost_snapshots_permission_read
  on public.sale_line_cost_snapshots for select to authenticated
  using (
    app_private.has_visualcorp_access_orgwide(organization_id,'inventory_costs','view')
    and app_private.has_visualcorp_access_orgwide(organization_id,'inventory_costs','view_costs')
  );

drop policy if exists inventory_movement_cost_snapshots_finance_read on public.inventory_movement_cost_snapshots;
create policy inventory_movement_cost_snapshots_permission_read
  on public.inventory_movement_cost_snapshots for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id,'inventory_costs','view',branch_id)
    and app_private.has_visualcorp_access(organization_id,'inventory_costs','view_costs',branch_id)
  );

-- Keep the invoker summary aligned with those row policies for a clear denial.
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
  if v_org is null then
    raise exception 'No se encontró la organización de este resumen.' using errcode='42501';
  end if;

  if p_branch_id is null then
    if not app_private.has_visualcorp_access_orgwide(v_org,'inventory_costs','view')
       or not app_private.has_visualcorp_access_orgwide(v_org,'inventory_costs','view_costs') then
      raise exception 'El resumen de todas las sucursales requiere permiso de costos en un perfil de organización.' using errcode='42501';
    end if;
  elsif not exists (
    select 1 from public.branches b where b.id=p_branch_id and b.organization_id=v_org
  ) or not app_private.has_visualcorp_access(v_org,'inventory_costs','view',p_branch_id)
     or not app_private.has_visualcorp_access(v_org,'inventory_costs','view_costs',p_branch_id) then
    raise exception 'Tu perfil no tiene permiso para consultar costos de materiales en esta sucursal.' using errcode='42501';
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
