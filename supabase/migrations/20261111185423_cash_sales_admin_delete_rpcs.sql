-- Aplicar en Supabase SQL Editor (o vía scripts/apply-one-migration.mjs) para habilitar
-- eliminación administrativa atómica de ventas, turnos de caja, cajas registradoras y limpieza de pruebas,
-- además de la corrección en amend_confirmed_pos_sale.

create or replace function app_private.perform_delete_pos_sale(
  p_sale_id uuid,
  p_reason text default 'Eliminación administrativa de venta',
  p_restore_inventory boolean default true,
  p_is_test boolean default false,
  p_skip_session_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Eliminación administrativa de venta'), 500);
  v_snapshot jsonb;
  v_po_ids uuid[];
  v_return_ids uuid[];
  v_session_ids uuid[];
  v_comp record;
  v_prev_reserved numeric(14,3);
  v_new_reserved numeric(14,3);
  v_inv record;
  v_restore_qty numeric(14,3);
  v_remaining_roll_restore numeric(14,3);
  v_roll_entry record;
  v_roll public.inventory_active_rolls%rowtype;
  v_take_back numeric(14,3);
  v_before_m numeric(14,3);
  v_after_m numeric(14,3);
  v_before_pct numeric(5,2);
  v_after_pct numeric(5,2);
  v_new_roll_status text;
  v_restored_items_count integer := 0;
  v_restored_rolls_count integer := 0;
  v_sid uuid;
  v_recalculated_sessions uuid[] := '{}';
  v_quote_reverted boolean := false;
begin
  if v_user is null then
    raise exception 'Inicia sesión para eliminar ventas.' using errcode = '42501';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La venta solicitada no existe o ya fue eliminada.' using errcode = '22023';
  end if;

  if not (
    app_private.has_org_role(v_sale.organization_id, v_sale.branch_id, array['owner', 'admin', 'manager'])
    and app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'delete_records', v_sale.branch_id)
  ) then
    raise exception 'Solo propietario, administrador o encargado de local autorizado puede eliminar ventas.' using errcode = '42501';
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);

  select coalesce(array_agg(id), '{}') into v_po_ids
  from public.production_orders
  where sale_id = v_sale.id;

  select coalesce(array_agg(id), '{}') into v_return_ids
  from public.sale_returns
  where sale_id = v_sale.id;

  select coalesce(array_agg(distinct sid), '{}') into v_session_ids
  from (
    select sp.cash_session_id as sid
    from public.sale_payments sp
    where sp.sale_id = v_sale.id and sp.cash_session_id is not null
    union
    select rs.cash_session_id as sid
    from public.sale_refund_settlements rs
    where rs.sale_id = v_sale.id and rs.cash_session_id is not null
    union
    select csm.session_id as sid
    from public.cash_session_movements csm
    where array_length(v_return_ids, 1) > 0
      and csm.idempotency_key in (
        select 'sale-refund:' || rid::text from unnest(v_return_ids) rid
      )
  ) s;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id), '[]'::jsonb),
    'returns', coalesce((select jsonb_agg(to_jsonb(r)) from public.sale_returns r where r.sale_id = v_sale.id), '[]'::jsonb),
    'refund_settlements', coalesce((select jsonb_agg(to_jsonb(rs)) from public.sale_refund_settlements rs where rs.sale_id = v_sale.id), '[]'::jsonb),
    'production_orders_count', coalesce(array_length(v_po_ids, 1), 0)
  ) into v_snapshot;

  for v_comp in
    select *
    from public.sale_material_consumptions c
    where c.organization_id = v_sale.organization_id
      and c.sale_id = v_sale.id
      and c.reserved_quantity > 0
    for update
  loop
    select coalesce(s.reserved_quantity, 0)
    into v_prev_reserved
    from public.inventory_stock s
    where s.organization_id = v_comp.organization_id
      and s.variant_id = v_comp.variant_id
      and s.branch_id = v_comp.branch_id
      and s.location_code = v_comp.location_code
    for update;

    if found and v_prev_reserved > 0 then
      v_new_reserved := greatest(0, round(v_prev_reserved - v_comp.reserved_quantity, 3));
      update public.inventory_stock s
      set reserved_quantity = v_new_reserved,
          updated_at = now()
      where s.organization_id = v_comp.organization_id
        and s.variant_id = v_comp.variant_id
        and s.branch_id = v_comp.branch_id
        and s.location_code = v_comp.location_code;

      insert into public.inventory_reservation_audits (
        organization_id, variant_id, branch_id, location_code,
        previous_quantity, reserved_quantity, note, changed_by
      ) values (
        v_comp.organization_id, v_comp.variant_id, v_comp.branch_id, v_comp.location_code,
        v_prev_reserved, v_new_reserved,
        'Liberación por eliminación de venta ' || coalesce(v_sale.sale_code, v_sale.id::text),
        v_user
      );
    end if;
  end loop;

  if coalesce(p_restore_inventory, true) then
    for v_inv in
      select
        m.variant_id,
        m.branch_id,
        coalesce(nullif(trim(m.location_code), ''), 'MAIN') as location_code,
        sum(m.quantity_delta) as net_delta,
        coalesce(max(i.custom_fields->>'inventory_model'), '') as inventory_model
      from public.inventory_movements m
      join public.inventory_variants iv
        on iv.id = m.variant_id and iv.organization_id = m.organization_id
      join public.inventory_items i
        on i.id = iv.item_id and i.organization_id = iv.organization_id
      where m.organization_id = v_sale.organization_id
        and (
          (m.reference_type = 'sale' and m.reference_id = v_sale.id)
          or (m.reference_type = 'sale_return' and m.reference_id = any(v_return_ids))
          or (m.reference_type = 'production_order' and m.reference_id = any(v_po_ids))
        )
      group by m.variant_id, m.branch_id, coalesce(nullif(trim(m.location_code), ''), 'MAIN')
      having sum(m.quantity_delta) < 0
    loop
      v_restore_qty := round(abs(v_inv.net_delta), 3);
      v_restored_items_count := v_restored_items_count + 1;

      if v_inv.inventory_model = 'roll' then
        v_remaining_roll_restore := v_restore_qty;

        for v_roll_entry in
          select
            l.roll_id,
            round(sum(greatest(0, coalesce(l.previous_m, 0) - coalesce(l.new_m, 0))), 3) as consumed_m
          from public.inventory_roll_logs l
          join public.inventory_active_rolls r
            on r.id = l.roll_id and r.organization_id = l.organization_id
          where l.organization_id = v_sale.organization_id
            and r.variant_id = v_inv.variant_id
            and r.branch_id = v_inv.branch_id
            and coalesce(nullif(trim(r.location_code), ''), 'MAIN') = v_inv.location_code
            and l.event_type = 'estimated_consumption'
            and l.work_reference = any(
              array[v_sale.id::text] || coalesce(array(select pid::text from unnest(v_po_ids) pid), '{}')
            )
          group by l.roll_id
          having sum(greatest(0, coalesce(l.previous_m, 0) - coalesce(l.new_m, 0))) > 0
          order by max(l.recorded_at) desc
        loop
          exit when v_remaining_roll_restore <= 0;

          select * into v_roll
          from public.inventory_active_rolls
          where id = v_roll_entry.roll_id
          for update;

          if found then
            v_take_back := least(v_remaining_roll_restore, v_roll_entry.consumed_m);
            v_before_m := coalesce(v_roll.remaining_m, round(v_roll.standard_length_m * v_roll.remaining_percent / 100, 3), 0);
            v_after_m := round(v_before_m + v_take_back, 3);
            if v_roll.standard_length_m is not null and v_after_m > v_roll.standard_length_m then
              v_after_m := v_roll.standard_length_m;
              v_take_back := round(greatest(0, v_after_m - v_before_m), 3);
            end if;

            if v_take_back > 0 then
              v_before_pct := v_roll.remaining_percent;
              v_after_pct := case
                when v_roll.standard_length_m is null or v_roll.standard_length_m = 0 then null
                else round(v_after_m * 100 / v_roll.standard_length_m, 2)
              end;
              v_new_roll_status := case
                when v_after_m = 0 then 'agotado'
                when v_roll.roll_state = 'machine' then 'en_uso'
                else 'en_bodega'
              end;

              update public.inventory_active_rolls
              set remaining_m = v_after_m,
                  remaining_percent = v_after_pct,
                  status = v_new_roll_status,
                  notes = left('Reversión por eliminación de venta ' || coalesce(v_sale.sale_code, v_sale.id::text), 1000),
                  updated_at = now()
              where id = v_roll.id;

              insert into public.inventory_roll_logs (
                organization_id, roll_id, previous_percent, new_percent,
                operator_name, notes, created_by, previous_m, new_m,
                event_type, reason, work_reference, previous_state, new_state
              ) values (
                v_roll.organization_id, v_roll.id, v_before_pct, v_after_pct,
                v_roll.operator_name,
                left('Reversión por eliminación de venta ' || coalesce(v_sale.sale_code, v_sale.id::text), 1000),
                v_user, v_before_m, v_after_m,
                'measurement',
                v_reason,
                coalesce(v_sale.sale_code, v_sale.id::text),
                v_roll.roll_state, v_roll.roll_state
              );

              insert into public.inventory_movements (
                organization_id, variant_id, branch_id, location_code,
                movement_type, quantity_delta, reason, reference_type, reference_id, created_by
              ) values (
                v_sale.organization_id, v_inv.variant_id, v_inv.branch_id, v_inv.location_code,
                'adjustment', v_take_back,
                left('Reversión de rollo por eliminación de venta ' || coalesce(v_sale.sale_code, v_sale.id::text), 400),
                'inventory_roll', v_roll.id, v_user
              );

              v_remaining_roll_restore := round(v_remaining_roll_restore - v_take_back, 3);
              v_restored_rolls_count := v_restored_rolls_count + 1;
            end if;
          end if;
        end loop;

        if v_remaining_roll_restore > 0 then
          insert into public.inventory_movements (
            organization_id, variant_id, branch_id, location_code,
            movement_type, quantity_delta, reason, reference_type, reference_id, created_by
          ) values (
            v_sale.organization_id, v_inv.variant_id, v_inv.branch_id, v_inv.location_code,
            'adjustment', v_remaining_roll_restore,
            left('Reversión de saldo por eliminación de venta ' || coalesce(v_sale.sale_code, v_sale.id::text), 400),
            'inventory_roll', v_sale.id, v_user
          );
        end if;
      else
        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code,
          movement_type, quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id, v_inv.variant_id, v_inv.branch_id, v_inv.location_code,
          'adjustment', v_restore_qty,
          left('Reversión por eliminación de venta ' || coalesce(v_sale.sale_code, v_sale.id::text) || ': ' || v_reason, 400),
          'sale_deleted', v_sale.id, v_user
        );
      end if;
    end loop;
  end if;

  if array_length(v_return_ids, 1) > 0 then
    delete from public.cash_session_movements
    where organization_id = v_sale.organization_id
      and idempotency_key in (
        select 'sale-refund:' || rid::text from unnest(v_return_ids) rid
      );
    delete from public.sale_refund_settlements
    where organization_id = v_sale.organization_id
      and sale_id = v_sale.id;
    delete from public.sale_return_lines
    where organization_id = v_sale.organization_id
      and return_id = any(v_return_ids);
    delete from public.sale_returns
    where organization_id = v_sale.organization_id
      and id = any(v_return_ids);
  end if;

  update public.purchase_requests
  set production_job_id = null,
      updated_at = now()
  where organization_id = v_sale.organization_id
    and production_job_id in (
      select id from public.production_jobs where sale_id = v_sale.id
    );

  if array_length(v_po_ids, 1) > 0 then
    delete from public.production_order_events
    where organization_id = v_sale.organization_id
      and order_id = any(v_po_ids);
    delete from public.production_material_targets
    where organization_id = v_sale.organization_id
      and order_id = any(v_po_ids);
  end if;

  delete from public.production_order_sale_routes
  where sale_id = v_sale.id
     or (array_length(v_po_ids, 1) > 0 and production_order_id = any(v_po_ids));

  delete from public.production_jobs
  where organization_id = v_sale.organization_id
    and sale_id = v_sale.id;

  delete from public.production_orders
  where organization_id = v_sale.organization_id
    and sale_id = v_sale.id;

  delete from public.commercial_document_assets
  where organization_id = v_sale.organization_id
    and document_kind = 'sale'
    and document_id = v_sale.id;

  delete from public.commercial_history_exclusions
  where organization_id = v_sale.organization_id
    and document_kind = 'sale'
    and document_id = v_sale.id;

  delete from public.sales
  where id = v_sale.id
    and organization_id = v_sale.organization_id;

  if v_sale.central_quote_id is not null and not exists (
    select 1 from public.sales s2
    where s2.organization_id = v_sale.organization_id
      and s2.central_quote_id = v_sale.central_quote_id
  ) then
    update public.central_quotes
    set status = case when status = 'converted' then 'accepted' else status end,
        updated_at = now()
    where id = v_sale.central_quote_id
      and organization_id = v_sale.organization_id
      and status = 'converted';
    v_quote_reverted := found;
  end if;

  if array_length(v_session_ids, 1) > 0 then
    foreach v_sid in array v_session_ids loop
      if p_skip_session_id is null or v_sid <> p_skip_session_id then
        if app_private.recalculate_closed_cash_session(v_sid) then
          v_recalculated_sessions := array_append(v_recalculated_sessions, v_sid);
        end if;
      end if;
    end loop;
  end if;

  insert into public.admin_deletion_audits (
    organization_id, branch_id, entity_type, entity_id, entity_code,
    action, reason, is_test_cleanup, restore_inventory, cascade_sales,
    affected_session_ids, snapshot, created_by
  ) values (
    v_sale.organization_id, v_sale.branch_id, 'sale', v_sale.id,
    coalesce(v_sale.sale_code, left(v_sale.id::text, 8)),
    'permanent_delete', v_reason, coalesce(p_is_test, false),
    coalesce(p_restore_inventory, true), false,
    coalesce(v_session_ids, '{}'), v_snapshot, v_user
  );

  return jsonb_build_object(
    'deleted', true,
    'sale_id', v_sale.id,
    'sale_code', coalesce(v_sale.sale_code, ''),
    'total', v_sale.total,
    'restored_inventory_variants', v_restored_items_count,
    'restored_rolls', v_restored_rolls_count,
    'quote_reverted', v_quote_reverted,
    'recalculated_session_ids', to_jsonb(v_recalculated_sessions),
    'is_test_cleanup', coalesce(p_is_test, false)
  );
end;
$$;

create or replace function public.delete_pos_sale(
  p_sale_id uuid,
  p_reason text default 'Eliminación administrativa de venta',
  p_restore_inventory boolean default true,
  p_is_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  return app_private.perform_delete_pos_sale(
    p_sale_id,
    p_reason,
    coalesce(p_restore_inventory, true),
    coalesce(p_is_test, false),
    null
  );
end;
$$;

create or replace function public.delete_cash_session(
  p_session_id uuid,
  p_reason text default 'Eliminación administrativa de turno de caja',
  p_cascade_sales boolean default false,
  p_restore_inventory boolean default true,
  p_is_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.cash_sessions%rowtype;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Eliminación administrativa de turno de caja'), 500);
  v_linked_sale_ids uuid[];
  v_sale_id uuid;
  v_deleted_sales jsonb := '[]'::jsonb;
  v_detached_sales_count integer := 0;
  v_reverted_refunds_count integer := 0;
  v_snapshot jsonb;
  v_movements_count integer := 0;
begin
  if v_user is null then
    raise exception 'Inicia sesión para eliminar turnos de caja.' using errcode = '42501';
  end if;

  select * into v_session
  from public.cash_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'La sesión de caja no existe o ya fue eliminada.' using errcode = '22023';
  end if;

  if not (
    app_private.has_org_role(v_session.organization_id, v_session.branch_id, array['owner', 'admin', 'manager'])
    and app_private.has_visualcorp_access(v_session.organization_id, 'cash', 'delete_records', v_session.branch_id)
  ) then
    raise exception 'Solo propietario, administrador o encargado de local autorizado puede eliminar turnos de caja.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct sid), '{}') into v_linked_sale_ids
  from (
    select sp.sale_id as sid
    from public.sale_payments sp
    where sp.organization_id = v_session.organization_id
      and sp.cash_session_id = v_session.id
    union
    select rs.sale_id as sid
    from public.sale_refund_settlements rs
    where rs.organization_id = v_session.organization_id
      and rs.cash_session_id = v_session.id
  ) linked;

  if coalesce(p_cascade_sales, false) and coalesce(array_length(v_linked_sale_ids, 1), 0) > 0 then
    if not app_private.has_visualcorp_access(v_session.organization_id, 'sales', 'delete_records', v_session.branch_id) then
      raise exception 'También necesitas permiso de eliminación de ventas para borrar en cascada las ventas del turno.' using errcode = '42501';
    end if;
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);

  select jsonb_build_object(
    'session', to_jsonb(v_session),
    'movements', coalesce((select jsonb_agg(to_jsonb(m)) from public.cash_session_movements m where m.session_id = v_session.id), '[]'::jsonb),
    'audits', coalesce((select jsonb_agg(to_jsonb(a)) from public.cash_session_audits a where a.session_id = v_session.id), '[]'::jsonb),
    'linked_sale_ids', to_jsonb(coalesce(v_linked_sale_ids, '{}'))
  ) into v_snapshot;

  if coalesce(p_cascade_sales, false) and coalesce(array_length(v_linked_sale_ids, 1), 0) > 0 then
    foreach v_sale_id in array v_linked_sale_ids loop
      if exists (select 1 from public.sales where id = v_sale_id) then
        v_deleted_sales := v_deleted_sales || jsonb_build_array(
          app_private.perform_delete_pos_sale(
            v_sale_id,
            'Cascada por eliminación de caja (' || left(v_session.id::text, 8) || '): ' || v_reason,
            coalesce(p_restore_inventory, true),
            coalesce(p_is_test, false),
            v_session.id
          )
        );
      end if;
    end loop;
  else
    update public.sale_payments
    set cash_session_id = null
    where organization_id = v_session.organization_id
      and cash_session_id = v_session.id;
    get diagnostics v_detached_sales_count = row_count;

    with removed_settlements as (
      delete from public.sale_refund_settlements
      where organization_id = v_session.organization_id
        and cash_session_id = v_session.id
      returning return_id
    )
    update public.sale_returns
    set refund_status = 'pending'
    where organization_id = v_session.organization_id
      and id in (select return_id from removed_settlements);
    get diagnostics v_reverted_refunds_count = row_count;
  end if;

  delete from public.cash_session_movements
  where organization_id = v_session.organization_id
    and session_id = v_session.id;
  get diagnostics v_movements_count = row_count;

  delete from public.cash_sessions
  where organization_id = v_session.organization_id
    and id = v_session.id;

  insert into public.admin_deletion_audits (
    organization_id, branch_id, entity_type, entity_id, entity_code,
    action, reason, is_test_cleanup, restore_inventory, cascade_sales,
    affected_session_ids, snapshot, created_by
  ) values (
    v_session.organization_id, v_session.branch_id, 'cash_session', v_session.id,
    'CAJA-' || upper(left(replace(v_session.id::text, '-', ''), 8)),
    case when coalesce(p_cascade_sales, false) then 'cascade_delete' else 'permanent_delete' end,
    v_reason, coalesce(p_is_test, false), coalesce(p_restore_inventory, true), coalesce(p_cascade_sales, false),
    array[v_session.id], v_snapshot, v_user
  );

  return jsonb_build_object(
    'deleted', true,
    'session_id', v_session.id,
    'cascade_sales', coalesce(p_cascade_sales, false),
    'deleted_sales_count', jsonb_array_length(v_deleted_sales),
    'detached_payments_count', v_detached_sales_count,
    'reverted_refunds_count', v_reverted_refunds_count,
    'deleted_movements_count', v_movements_count,
    'is_test_cleanup', coalesce(p_is_test, false)
  );
end;
$$;

create or replace function public.delete_cash_register(
  p_register_id uuid,
  p_reason text default 'Eliminación administrativa de caja registradora',
  p_detach_sessions boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_register public.cash_registers%rowtype;
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Eliminación administrativa de caja registradora'), 500);
  v_closed_sessions_count integer := 0;
  v_goals_count integer := 0;
  v_snapshot jsonb;
begin
  if v_user is null then
    raise exception 'Inicia sesión para eliminar cajas registradoras.' using errcode = '42501';
  end if;

  select * into v_register
  from public.cash_registers
  where id = p_register_id
  for update;

  if not found then
    raise exception 'La caja registradora no existe o ya fue eliminada.' using errcode = '22023';
  end if;

  if not (
    app_private.has_org_role(v_register.organization_id, v_register.branch_id, array['owner', 'admin', 'manager'])
    and app_private.has_visualcorp_access(v_register.organization_id, 'cash', 'delete_records', v_register.branch_id)
  ) then
    raise exception 'Solo propietario, administrador o encargado de local autorizado puede eliminar cajas registradoras.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cash_sessions
    where organization_id = v_register.organization_id
      and cash_register_id = v_register.id
      and status = 'open'
  ) then
    raise exception 'Esta caja tiene un turno abierto. Ciérralo o elimínalo primero antes de borrar la caja registradora.' using errcode = '22023';
  end if;

  select count(*) into v_closed_sessions_count
  from public.cash_sessions
  where organization_id = v_register.organization_id
    and cash_register_id = v_register.id;

  if v_closed_sessions_count > 0 and not coalesce(p_detach_sessions, true) then
    raise exception 'Esta caja tiene % turno(s) histórico(s) vinculados; activa la desvinculación para conservarlos sin esta caja.', v_closed_sessions_count using errcode = '22023';
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);

  select jsonb_build_object(
    'register', to_jsonb(v_register),
    'goals', coalesce((select jsonb_agg(to_jsonb(g)) from public.cash_register_weekly_goals g where g.cash_register_id = v_register.id), '[]'::jsonb),
    'detached_sessions_count', v_closed_sessions_count
  ) into v_snapshot;

  if v_closed_sessions_count > 0 then
    update public.cash_sessions
    set cash_register_id = null,
        updated_at = now()
    where organization_id = v_register.organization_id
      and cash_register_id = v_register.id;
  end if;

  delete from public.cash_register_weekly_goals
  where organization_id = v_register.organization_id
    and cash_register_id = v_register.id;
  get diagnostics v_goals_count = row_count;

  delete from public.cash_registers
  where organization_id = v_register.organization_id
    and id = v_register.id;

  insert into public.admin_deletion_audits (
    organization_id, branch_id, entity_type, entity_id, entity_code,
    action, reason, is_test_cleanup, restore_inventory, cascade_sales,
    affected_session_ids, snapshot, created_by
  ) values (
    v_register.organization_id, v_register.branch_id, 'cash_register', v_register.id,
    v_register.name,
    'permanent_delete', v_reason, false, false, false,
    '{}', v_snapshot, v_user
  );

  return jsonb_build_object(
    'deleted', true,
    'register_id', v_register.id,
    'name', v_register.name,
    'detached_sessions_count', v_closed_sessions_count,
    'deleted_goals_count', v_goals_count
  );
end;
$$;

create or replace function public.bulk_cleanup_test_records(
  p_sale_ids uuid[] default '{}',
  p_session_ids uuid[] default '{}',
  p_reason text default 'Limpieza de ventas y turnos de ejemplo',
  p_restore_inventory boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reason text := left(coalesce(nullif(trim(p_reason), ''), 'Limpieza de ventas y turnos de ejemplo'), 500);
  v_sale_id uuid;
  v_session_id uuid;
  v_deleted_sales integer := 0;
  v_deleted_sessions integer := 0;
  v_sales_summary jsonb := '[]'::jsonb;
  v_sessions_summary jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Inicia sesión para ejecutar la limpieza de prueba.' using errcode = '42501';
  end if;

  if coalesce(array_length(p_sale_ids, 1), 0) = 0 and coalesce(array_length(p_session_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos una venta o turno para limpiar.' using errcode = '22023';
  end if;

  if coalesce(array_length(p_sale_ids, 1), 0) > 0 then
    foreach v_sale_id in array p_sale_ids loop
      if exists (select 1 from public.sales where id = v_sale_id) then
        v_sales_summary := v_sales_summary || jsonb_build_array(
          app_private.perform_delete_pos_sale(
            v_sale_id,
            v_reason,
            coalesce(p_restore_inventory, true),
            true,
            null
          )
        );
        v_deleted_sales := v_deleted_sales + 1;
      end if;
    end loop;
  end if;

  if coalesce(array_length(p_session_ids, 1), 0) > 0 then
    foreach v_session_id in array p_session_ids loop
      if exists (select 1 from public.cash_sessions where id = v_session_id) then
        v_sessions_summary := v_sessions_summary || jsonb_build_array(
          public.delete_cash_session(
            v_session_id,
            v_reason,
            false,
            coalesce(p_restore_inventory, true),
            true
          )
        );
        v_deleted_sessions := v_deleted_sessions + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'deleted_sales_count', v_deleted_sales,
    'deleted_sessions_count', v_deleted_sessions,
    'sales', v_sales_summary,
    'sessions', v_sessions_summary
  );
end;
$$;

create or replace function public.amend_confirmed_pos_sale(
  p_sale_id uuid,
  p_customer_id uuid default null,
  p_customer_data jsonb default null,
  p_discount numeric default 0,
  p_discount_reason text default '',
  p_note text default '',
  p_lines jsonb default '[]'::jsonb,
  p_payments jsonb default null,
  p_amendment_reason text default 'Edición de orden POS'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_sale public.sales%rowtype;
  v_customer uuid;
  v_cust_name text;
  v_cust_phone text;
  v_cust_email text;
  v_cust_doc text;
  v_cust_notes text;
  v_new_status text;
  v_prev_snapshot jsonb;
  v_new_snapshot jsonb;
  v_financial_delta numeric(14,2);
  v_old_line record;
  v_line jsonb;
  v_quantity numeric(14,3);
  v_price numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_disc_reason text;
  v_tax_rate numeric(7,4);
  v_tax_amount numeric(14,2) := 0;
  v_shipping numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_backorder_total numeric(14,3) := 0;
  v_variant uuid;
  v_product text;
  v_location text;
  v_fulfilled numeric(14,3);
  v_backordered numeric(14,3);
  v_available numeric(14,3);
  v_payment jsonb;
  v_p_amount numeric(14,2);
  v_p_method text;
  v_p_session uuid;
  v_prev_cash_session uuid;
  v_current_open_session uuid;
  v_touched_sessions uuid[];
  v_sid uuid;
  v_old_model text;
begin
  if v_user is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'La orden POS no existe.' using errcode = '22023';
  end if;

  if not (
    app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'edit', v_sale.branch_id)
    or app_private.has_visualcorp_access(v_sale.organization_id, 'sales', 'edit')
  ) then
    raise exception 'No tienes permiso para editar ventas en esta sucursal.' using errcode = '42501';
  end if;

  perform set_config('app.pos_rpc_bypass', 'true', true);

  select coalesce(array_agg(distinct sp.cash_session_id), '{}')
  into v_touched_sessions
  from public.sale_payments sp
  where sp.sale_id = v_sale.id and sp.cash_session_id is not null;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id), '[]'::jsonb)
  ) into v_prev_snapshot;

  v_customer := coalesce(p_customer_id, v_sale.customer_id);

  if p_customer_data is not null and jsonb_typeof(p_customer_data) = 'object' then
    v_cust_name := nullif(trim(p_customer_data->>'full_name'), '');
    if v_cust_name is not null then
      v_cust_phone := coalesce(trim(p_customer_data->>'phone'), '');
      v_cust_email := coalesce(trim(p_customer_data->>'email'), '');
      v_cust_doc := coalesce(trim(p_customer_data->>'document_reference'), '');
      v_cust_notes := coalesce(trim(p_customer_data->>'notes'), '');

      if v_customer is not null and exists (
        select 1 from public.customers where id = v_customer and organization_id = v_sale.organization_id
      ) then
        update public.customers
        set full_name = v_cust_name,
            phone = case when v_cust_phone <> '' then v_cust_phone else phone end,
            email = case when v_cust_email <> '' then v_cust_email else email end,
            document_reference = case when v_cust_doc <> '' then v_cust_doc else document_reference end,
            notes = case when v_cust_notes <> '' then v_cust_notes else notes end,
            updated_at = now()
        where id = v_customer and organization_id = v_sale.organization_id;
      else
        if v_cust_phone <> '' then
          select id into v_customer
          from public.customers
          where organization_id = v_sale.organization_id and phone = v_cust_phone
          limit 1;
        end if;
        if v_customer is null then
          insert into public.customers (
            organization_id, full_name, phone, email, document_reference, notes, created_by
          ) values (
            v_sale.organization_id, v_cust_name, v_cust_phone, v_cust_email, v_cust_doc, v_cust_notes, v_user
          ) returning id into v_customer;
        else
          update public.customers
          set full_name = v_cust_name,
              email = case when v_cust_email <> '' then v_cust_email else email end,
              document_reference = case when v_cust_doc <> '' then v_cust_doc else document_reference end,
              notes = case when v_cust_notes <> '' then v_cust_notes else notes end,
              updated_at = now()
          where id = v_customer and organization_id = v_sale.organization_id;
        end if;
      end if;
    end if;
  end if;

  if v_customer is not null and not exists (
    select 1 from public.customers where id = v_customer and organization_id = v_sale.organization_id
  ) then
    raise exception 'El cliente seleccionado no pertenece a Visual Corp.' using errcode = '22023';
  end if;

  v_new_status := case when v_sale.status = 'cancelled' then 'confirmed' else v_sale.status end;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' and jsonb_array_length(p_lines) > 0 then
    if exists (
      select 1 from public.sale_material_consumptions c
      where c.organization_id = v_sale.organization_id and c.sale_id = v_sale.id
    ) or exists (
      select 1
      from jsonb_array_elements(p_lines) entry(value)
      join public.catalog_material_recipes r
        on r.organization_id = v_sale.organization_id
       and r.catalog_product_id = entry.value->>'catalog_product_id'
       and r.branch_id = v_sale.branch_id and r.active
    ) then
      raise exception 'Esta venta usa materiales controlados por receta. No reemplaces sus líneas desde el editor; conserva la trazabilidad del consumo y gestiona cualquier corrección desde operaciones.' using errcode = '22023';
    end if;

    for v_old_line in
      select * from public.sale_lines where sale_id = v_sale.id
    loop
      if v_old_line.variant_id is not null and v_old_line.fulfilled_quantity > 0 then
        select coalesce(i.custom_fields->>'inventory_model', '') into v_old_model
        from public.inventory_variants iv
        join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id
        where iv.id = v_old_line.variant_id and iv.organization_id = v_sale.organization_id;

        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code, movement_type,
          quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id,
          v_old_line.variant_id,
          v_sale.branch_id,
          'MAIN',
          'adjustment',
          v_old_line.fulfilled_quantity,
          'Reversión por edición POS ' || coalesce(v_sale.sale_code, v_sale.id::text),
          case when v_old_model = 'roll' then 'inventory_roll' else 'sale' end,
          v_sale.id,
          v_user
        );
      end if;
    end loop;

    update public.purchase_requests
    set production_job_id = null, updated_at = now()
    where organization_id = v_sale.organization_id
      and production_job_id in (select id from public.production_jobs where sale_id = v_sale.id);
    delete from public.production_jobs where sale_id = v_sale.id;
    delete from public.sale_lines where sale_id = v_sale.id;

    v_subtotal := 0;
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      if v_quantity is null or v_quantity <= 0 or v_price is null or v_price < 0 then
        raise exception 'Cantidad o precio inválido en artículo o servicio.' using errcode = '22023';
      end if;
      v_subtotal := v_subtotal + round(v_quantity * v_price, 2);
    end loop;

    v_discount := round(coalesce(p_discount, 0), 2);
    if v_discount < 0 then
      raise exception 'El descuento no puede ser negativo.' using errcode = '22023';
    end if;
    if v_discount > v_subtotal then
      raise exception 'El descuento supera el subtotal.' using errcode = '22023';
    end if;

    v_tax_rate := coalesce(v_sale.tax_rate, 15);
    v_tax_amount := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_shipping := coalesce(v_sale.shipping_cost, 0);
    v_total := round(v_subtotal - v_discount + v_tax_amount + v_shipping, 2);

    v_backorder_total := 0;
    for v_line in select value from jsonb_array_elements(p_lines) loop
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      v_product := nullif(trim(v_line->>'catalog_product_id'), '');
      v_variant := nullif(trim(v_line->>'variant_id'), '')::uuid;
      v_location := coalesce(nullif(trim(v_line->>'location_code'), ''), 'MAIN');

      if v_variant is null and v_product is not null then
        select l.inventory_variant_id, l.location_code into v_variant, v_location
        from public.catalog_inventory_links l
        where l.organization_id = v_sale.organization_id
          and l.catalog_product_id = v_product
          and l.branch_id = v_sale.branch_id
          and l.active;
        if not found then v_variant := null; v_location := 'MAIN'; end if;
      end if;

      v_fulfilled := v_quantity;
      v_backordered := 0;

      if v_variant is not null then
        perform 1 from public.inventory_variants where id = v_variant and organization_id = v_sale.organization_id for update;
        select coalesce(sum(quantity), 0) into v_available
        from public.inventory_stock
        where organization_id = v_sale.organization_id
          and variant_id = v_variant
          and branch_id = v_sale.branch_id
          and location_code = v_location;

        if v_available < v_quantity then
          v_fulfilled := greatest(v_available, 0);
          v_backordered := v_quantity - v_fulfilled;
          v_backorder_total := v_backorder_total + v_backordered;
        end if;
      end if;

      insert into public.sale_lines (
        organization_id, sale_id, variant_id, catalog_product_id, client_line_key,
        sku_snapshot, description_snapshot, quantity, fulfilled_quantity, backordered_quantity,
        unit_price, line_total, material_requests, finishing_options
      ) values (
        v_sale.organization_id,
        v_sale.id,
        v_variant,
        v_product,
        nullif(trim(v_line->>'line_key'), ''),
        coalesce(nullif(trim(v_line->>'sku'), ''), nullif(trim(v_line->>'sku_snapshot'), ''), ''),
        coalesce(nullif(trim(v_line->>'description'), ''), nullif(trim(v_line->>'description_snapshot'), ''), 'Orden POS'),
        v_quantity,
        v_fulfilled,
        v_backordered,
        v_price,
        round(v_quantity * v_price, 2),
        case when jsonb_typeof(v_line->'material_requests') = 'array' then v_line->'material_requests' else '[]'::jsonb end,
        case when jsonb_typeof(v_line->'finishing_options') = 'object' then v_line->'finishing_options' else '{}'::jsonb end
      );

      if v_variant is not null and v_fulfilled > 0 then
        insert into public.inventory_movements (
          organization_id, variant_id, branch_id, location_code, movement_type,
          quantity_delta, reason, reference_type, reference_id, created_by
        ) values (
          v_sale.organization_id,
          v_variant,
          v_sale.branch_id,
          v_location,
          'sale',
          -v_fulfilled,
          'Orden POS ' || coalesce(v_sale.sale_code, v_sale.id::text),
          'sale',
          v_sale.id,
          v_user
        );
      end if;
    end loop;
  else
    v_subtotal := v_sale.subtotal;
    v_discount := round(coalesce(p_discount, v_sale.discount_total), 2);
    v_tax_rate := coalesce(v_sale.tax_rate, 15);
    v_tax_amount := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_shipping := coalesce(v_sale.shipping_cost, 0);
    v_total := round(v_subtotal - v_discount + v_tax_amount + v_shipping, 2);
    v_backorder_total := case when v_sale.urgent_backorder then 1 else 0 end;
  end if;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    select cash_session_id into v_prev_cash_session
    from public.sale_payments
    where sale_id = v_sale.id and method = 'cash' and cash_session_id is not null
    order by created_at asc
    limit 1;

    select id into v_current_open_session
    from public.cash_sessions
    where organization_id = v_sale.organization_id
      and branch_id = v_sale.branch_id
      and opened_by = v_user
      and status = 'open'
    order by opened_at desc
    limit 1;

    delete from public.sale_payments where sale_id = v_sale.id;

    for v_payment in select value from jsonb_array_elements(p_payments) loop
      v_p_amount := round(coalesce(nullif(v_payment->>'amount', '')::numeric, 0), 2);
      if v_p_amount > 0 then
        v_p_method := coalesce(v_payment->>'method', 'other');
        if v_p_method not in ('cash', 'transfer', 'card', 'other') then
          v_p_method := 'other';
        end if;
        v_p_session := null;
        if v_p_method = 'cash' then
          v_p_session := nullif(trim(v_payment->>'cash_session_id'), '')::uuid;
          if v_p_session is null then
            v_p_session := v_prev_cash_session;
          end if;
          if v_p_session is null then
            v_p_session := v_current_open_session;
          end if;
          if v_p_session is not null and not (v_p_session = any(v_touched_sessions)) then
            v_touched_sessions := array_append(v_touched_sessions, v_p_session);
          end if;
        end if;

        insert into public.sale_payments (
          organization_id, sale_id, method, amount, reference, note, created_by, cash_session_id
        ) values (
          v_sale.organization_id,
          v_sale.id,
          v_p_method,
          v_p_amount,
          coalesce(v_payment->>'reference', ''),
          coalesce(v_payment->>'note', ''),
          v_user,
          v_p_session
        );
      end if;
    end loop;
  end if;

  v_financial_delta := v_total - v_sale.total;

  v_disc_reason := trim(coalesce(p_discount_reason, ''));
  if v_disc_reason = '' then
    v_disc_reason := v_sale.discount_reason;
  end if;
  if v_discount > 0 and v_disc_reason = '' then
    v_disc_reason := 'Descuento autorizado en POS';
  end if;

  update public.sales
  set customer_id = v_customer,
      status = v_new_status,
      subtotal = v_subtotal,
      discount_total = v_discount,
      discount_reason = left(v_disc_reason, 300),
      tax_amount = v_tax_amount,
      total = v_total,
      note = coalesce(nullif(trim(p_note), ''), note),
      payment_method = coalesce((select min(method) from public.sale_payments where sale_id = v_sale.id), payment_method),
      urgent_backorder = (v_backorder_total > 0),
      updated_at = now()
  where id = v_sale.id
  returning * into v_sale;

  if array_length(v_touched_sessions, 1) > 0 then
    foreach v_sid in array v_touched_sessions loop
      perform app_private.recalculate_closed_cash_session(v_sid);
    end loop;
  end if;

  select jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.sale_lines l where l.sale_id = v_sale.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p)) from public.sale_payments p where p.sale_id = v_sale.id), '[]'::jsonb)
  ) into v_new_snapshot;

  insert into public.sale_amendments (
    organization_id, sale_id, reason, previous_snapshot, new_snapshot,
    financial_delta, created_by
  ) values (
    v_sale.organization_id,
    v_sale.id,
    coalesce(nullif(trim(p_amendment_reason), ''), 'Edición de orden POS'),
    v_prev_snapshot,
    v_new_snapshot,
    v_financial_delta,
    v_user
  );

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'sale_code', v_sale.sale_code,
    'status', v_sale.status,
    'customer_id', v_sale.customer_id,
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount_total,
    'discount_reason', v_sale.discount_reason,
    'tax_rate', v_sale.tax_rate,
    'tax_amount', v_sale.tax_amount,
    'total', v_sale.total,
    'financial_delta', v_financial_delta,
    'updated_at', v_sale.updated_at
  );
end;
$$;

revoke all on function app_private.perform_delete_pos_sale(uuid, text, boolean, boolean, uuid) from public, anon, authenticated;

revoke all on function public.delete_pos_sale(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.delete_pos_sale(uuid, text, boolean, boolean) to authenticated;

revoke all on function public.delete_cash_session(uuid, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.delete_cash_session(uuid, text, boolean, boolean, boolean) to authenticated;

revoke all on function public.delete_cash_register(uuid, text, boolean) from public, anon;
grant execute on function public.delete_cash_register(uuid, text, boolean) to authenticated;

revoke all on function public.bulk_cleanup_test_records(uuid[], uuid[], text, boolean) from public, anon;
grant execute on function public.bulk_cleanup_test_records(uuid[], uuid[], text, boolean) to authenticated;

revoke all on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) to authenticated;
