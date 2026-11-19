-- Dedicated RPC for editing roll configuration (tag/lot, material family,
-- nominal length, active warehouse location, and operational notes) with full
-- audit logging and location-balanced inventory_stock transfers.

create or replace function public.update_inventory_roll_config(
  p_roll_id uuid,
  p_roll_tag text default null,
  p_material_family text default null,
  p_standard_length_m numeric default null,
  p_clear_standard_length boolean default false,
  p_location_code text default null,
  p_notes text default null,
  p_operator text default '',
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_roll public.inventory_active_rolls%rowtype;
  v_current_m numeric(14,3);
  v_new_tag text;
  v_new_family text;
  v_new_nominal numeric(10,2);
  v_new_percent numeric(5,2);
  v_new_location text;
  v_new_notes text;
  v_operator text;
  v_reason text;
  v_changes text[] := array[]::text[];
  v_old_qty numeric(14,3);
  v_old_reserved numeric(14,3);
  v_transfer_m numeric(14,3);
begin
  if v_user is null then
    raise exception 'Inicia sesión para actualizar la configuración del rollo.';
  end if;

  select *
    into v_roll
    from public.inventory_active_rolls
   where id = p_roll_id
   for update;

  if not found then
    raise exception 'No se encontró el rollo especificado.';
  end if;

  if not app_private.has_visualcorp_access(v_roll.organization_id, 'inventory', 'edit', v_roll.branch_id) then
    raise exception 'No tienes permisos para editar rollos en esta sucursal.';
  end if;

  v_current_m := coalesce(
    v_roll.remaining_m,
    case
      when v_roll.standard_length_m is not null and v_roll.remaining_percent is not null
        then round(v_roll.standard_length_m * v_roll.remaining_percent / 100, 3)
      else 0
    end
  );

  v_new_tag := case
    when p_roll_tag is null then v_roll.roll_tag
    else left(trim(p_roll_tag), 120)
  end;

  if p_material_family is null or length(trim(p_material_family)) = 0 then
    v_new_family := v_roll.material_family;
  else
    v_new_family := lower(trim(p_material_family));
    if v_new_family not in ('lona', 'vinil', 'papel', 'otro') then
      raise exception 'La familia del material debe ser lona, vinil, papel u otro.';
    end if;
  end if;

  if coalesce(p_clear_standard_length, false) then
    v_new_nominal := null;
    v_new_percent := null;
  elsif p_standard_length_m is not null then
    if p_standard_length_m <= 0 then
      raise exception 'El largo nominal debe ser mayor que cero.';
    end if;
    v_new_nominal := round(p_standard_length_m, 2);
    if v_new_nominal <= 0 then
      raise exception 'El largo nominal redondeado debe ser mayor que cero.';
    end if;
    if v_new_nominal < v_current_m then
      raise exception 'El largo nominal (% m) no puede ser menor que los metros restantes actuales (% m).', v_new_nominal, v_current_m;
    end if;
    v_new_percent := least(100.00, greatest(0.00, round(v_current_m * 100 / v_new_nominal, 2)));
  else
    v_new_nominal := v_roll.standard_length_m;
    v_new_percent := v_roll.remaining_percent;
  end if;

  if p_location_code is null or length(trim(p_location_code)) = 0 then
    v_new_location := v_roll.location_code;
  else
    v_new_location := trim(p_location_code);
  end if;

  v_new_notes := case
    when p_notes is null then v_roll.notes
    else left(trim(p_notes), 1000)
  end;

  if v_new_tag is distinct from v_roll.roll_tag then
    v_changes := array_append(v_changes, 'lote/etiqueta');
  end if;
  if v_new_family is distinct from v_roll.material_family then
    v_changes := array_append(v_changes, 'familia');
  end if;
  if v_new_nominal is distinct from v_roll.standard_length_m then
    v_changes := array_append(v_changes, 'largo nominal');
  end if;
  if v_new_location is distinct from v_roll.location_code then
    v_changes := array_append(v_changes, 'ubicación');
  end if;
  if v_new_notes is distinct from v_roll.notes then
    v_changes := array_append(v_changes, 'notas');
  end if;

  if coalesce(cardinality(v_changes), 0) = 0 then
    return jsonb_build_object(
      'success', true,
      'changed', false,
      'roll_id', p_roll_id,
      'roll_tag', v_roll.roll_tag,
      'material_family', v_roll.material_family,
      'standard_length_m', v_roll.standard_length_m,
      'remaining_percent', v_roll.remaining_percent,
      'location_code', v_roll.location_code,
      'notes', v_roll.notes
    );
  end if;

  v_operator := coalesce(nullif(trim(p_operator), ''), nullif(trim(v_roll.operator_name), ''), 'Taller');
  v_reason := coalesce(
    nullif(trim(p_reason), ''),
    'Configuración actualizada (' || array_to_string(v_changes, ', ') || ')'
  );

  if v_new_location is distinct from v_roll.location_code then
    if not exists (
      select 1
        from public.inventory_locations l
       where l.organization_id = v_roll.organization_id
         and l.branch_id = v_roll.branch_id
         and l.code = v_new_location
         and l.active
    ) then
      raise exception 'La ubicación % no está registrada como activa en esta sucursal.', v_new_location;
    end if;

    if v_current_m > 0 then
      select s.quantity, coalesce(s.reserved_quantity, 0)
        into v_old_qty, v_old_reserved
        from public.inventory_stock s
       where s.organization_id = v_roll.organization_id
         and s.variant_id = v_roll.variant_id
         and s.branch_id = v_roll.branch_id
         and s.location_code = v_roll.location_code
       for update;

      if found then
        if coalesce(v_old_reserved, 0) > 0 and (coalesce(v_old_qty, 0) - coalesce(v_old_reserved, 0)) < v_current_m then
          raise exception 'No se puede reubicar el rollo porque parte del stock en % está reservado.', v_roll.location_code;
        end if;
        v_transfer_m := greatest(0, least(v_current_m, coalesce(v_old_qty, 0) - coalesce(v_old_reserved, 0)));
        if v_transfer_m > 0 then
          insert into public.inventory_movements (
            organization_id, variant_id, branch_id, location_code,
            movement_type, quantity_delta, reason, reference_type, reference_id, created_by
          ) values
            (
              v_roll.organization_id, v_roll.variant_id, v_roll.branch_id, v_roll.location_code,
              'transfer_out', -v_transfer_m, v_reason, 'inventory_roll', p_roll_id, v_user
            ),
            (
              v_roll.organization_id, v_roll.variant_id, v_roll.branch_id, v_new_location,
              'transfer_in', v_transfer_m, v_reason, 'inventory_roll', p_roll_id, v_user
            );
        end if;
      end if;
    end if;
  end if;

  update public.inventory_active_rolls
     set roll_tag = v_new_tag,
         material_family = v_new_family,
         standard_length_m = v_new_nominal,
         remaining_percent = v_new_percent,
         location_code = v_new_location,
         notes = v_new_notes,
         operator_name = v_operator,
         updated_at = now()
   where id = p_roll_id;

  insert into public.inventory_roll_logs (
    organization_id, roll_id, previous_percent, new_percent, operator_name, notes,
    created_by, previous_m, new_m, event_type, reason, work_reference, previous_state, new_state
  ) values (
    v_roll.organization_id, p_roll_id, v_roll.remaining_percent, v_new_percent, v_operator, v_new_notes,
    v_user, v_current_m, v_current_m, 'config', v_reason, '', v_roll.roll_state, v_roll.roll_state
  );

  return jsonb_build_object(
    'success', true,
    'changed', true,
    'roll_id', p_roll_id,
    'roll_tag', v_new_tag,
    'material_family', v_new_family,
    'standard_length_m', v_new_nominal,
    'remaining_percent', v_new_percent,
    'location_code', v_new_location,
    'notes', v_new_notes,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.update_inventory_roll_config(uuid,text,text,numeric,boolean,text,text,text,text) from public, anon, authenticated;
grant execute on function public.update_inventory_roll_config(uuid,text,text,numeric,boolean,text,text,text,text) to authenticated;
