create or replace function public.record_inventory_movement(
  p_variant_id uuid,
  p_branch_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_location_code text default 'MAIN',
  p_reference_type text default null,
  p_reference_id uuid default null
) returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_delta numeric(14,3);
  v_location text;
  v_after numeric(14,3);
  v_quantity numeric(14,3);
  v_reserved numeric(14,3);
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para registrar el movimiento.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;
  if p_movement_type not in ('receipt','consumption','return','waste') then
    raise exception 'Tipo de movimiento no permitido.';
  end if;

  select organization_id into v_org
  from public.inventory_variants
  where id = p_variant_id and active;

  if v_org is null or not app_private.has_org_role(
    v_org, p_branch_id, array['owner','admin','manager','warehouse','production']
  ) then
    raise exception 'No tienes permiso para mover este artículo en esa sucursal.';
  end if;

  v_location := coalesce(nullif(trim(p_location_code), ''), 'MAIN');
  v_delta := case when p_movement_type in ('receipt','return') then p_quantity else -p_quantity end;

  if p_movement_type in ('consumption','waste') then
    select quantity, reserved_quantity
      into v_quantity, v_reserved
      from public.inventory_stock
      where organization_id = v_org
        and variant_id = p_variant_id
        and branch_id = p_branch_id
        and location_code = v_location
      for update;

    if not found or coalesce(v_quantity, 0) - coalesce(v_reserved, 0) < p_quantity then
      raise exception 'Existencia disponible insuficiente en la ubicación %.', v_location;
    end if;
  end if;

  insert into public.inventory_movements (
    organization_id, variant_id, branch_id, location_code,
    movement_type, quantity_delta, reason, reference_type, reference_id, created_by
  ) values (
    v_org, p_variant_id, p_branch_id, v_location,
    p_movement_type, v_delta, coalesce(p_reason, ''), p_reference_type, p_reference_id, (select auth.uid())
  );

  select quantity into v_after
  from public.inventory_stock
  where organization_id = v_org
    and variant_id = p_variant_id
    and branch_id = p_branch_id
    and location_code = v_location;

  return coalesce(v_after, 0);
end;
$$;

revoke all on function public.record_inventory_movement(uuid,uuid,text,numeric,text,text,text,uuid) from public, anon;
grant execute on function public.record_inventory_movement(uuid,uuid,text,numeric,text,text,text,uuid) to authenticated;

create index if not exists inventory_movements_org_created_id_idx
  on public.inventory_movements (organization_id, created_at desc, id desc);
