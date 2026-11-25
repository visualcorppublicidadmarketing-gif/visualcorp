-- A payment may only be linked to a cash session from the same organization
-- and branch as its sale. Historical amendments may keep their own previous
-- session, but the client cannot redirect cash to a different branch.
create or replace function app_private.attach_open_cash_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_branch uuid;
begin
  if new.method <> 'cash' then
    new.cash_session_id := null;
    return new;
  end if;

  select s.branch_id
    into v_sale_branch
    from public.sales s
   where s.id = new.sale_id
     and s.organization_id = new.organization_id;

  if v_sale_branch is null then
    raise exception 'No encontramos la sucursal de esta venta.' using errcode = '22023';
  end if;

  if new.cash_session_id is not null then
    if exists (
      select 1
        from public.cash_sessions cs
       where cs.id = new.cash_session_id
         and cs.organization_id = new.organization_id
         and cs.branch_id = v_sale_branch
    ) then
      return new;
    end if;

    raise exception 'La caja asignada no corresponde a la sucursal de esta venta.' using errcode = '22023';
  end if;

  select cs.id
    into new.cash_session_id
    from public.cash_sessions cs
   where cs.organization_id = new.organization_id
     and cs.branch_id = v_sale_branch
     and cs.opened_by = new.created_by
     and cs.status = 'open'
   for update;

  if new.cash_session_id is null then
    raise exception 'No hay una caja abierta para este pago. Actualiza la pantalla y abre un nuevo turno antes de registrar efectivo.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;
revoke all on function app_private.attach_open_cash_session() from public, anon, authenticated;

-- Keep historical distributions only when a session was already linked to
-- this sale; newly selected cash must belong to the caller's open session.
create or replace function app_private.resolve_pos_sale_amendment_cash_session(
  p_requested_session uuid,
  p_payment_id text,
  p_previous_payment_sessions jsonb,
  p_previous_sessions uuid[],
  p_current_open_session uuid,
  p_fallback_session uuid
) returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_requested_session uuid := p_requested_session;
begin
  if v_requested_session is null and p_payment_id is not null then
    v_requested_session := nullif(p_previous_payment_sessions ->> p_payment_id, '')::uuid;
  end if;

  if v_requested_session is null then
    return p_fallback_session;
  end if;

  if v_requested_session = any(coalesce(p_previous_sessions, '{}'::uuid[]))
    or v_requested_session is not distinct from p_current_open_session then
    return v_requested_session;
  end if;

  raise exception 'El pago no puede asignarse a una sesión de caja ajena a esta venta.'
    using errcode = '42501';
end;
$$;
revoke all on function app_private.resolve_pos_sale_amendment_cash_session(uuid, text, jsonb, uuid[], uuid, uuid) from public, anon, authenticated;

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
  v_line_id uuid;
  v_kept_line_ids uuid[] := '{}';
  v_deleted_job_ids uuid[] := '{}';
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
  v_requested_variant uuid;
  v_active_link_count integer;
  v_link_count integer;
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
  v_previous_payment_sessions jsonb := '{}'::jsonb;
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
  join public.cash_sessions cs
    on cs.id = sp.cash_session_id
   and cs.organization_id = sp.organization_id
   and cs.branch_id = v_sale.branch_id
  where sp.sale_id = v_sale.id
    and sp.organization_id = v_sale.organization_id
    and sp.method = 'cash'
    and sp.cash_session_id is not null;

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

  if v_cust_name is null and v_customer is not null then
    select full_name, phone into v_cust_name, v_cust_phone
    from public.customers
    where id = v_customer and organization_id = v_sale.organization_id;
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

    -- Revert inventory movements for all old lines of this sale
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

    -- Identify kept line ids
    select coalesce(array_agg(distinct (nullif(trim(entry.value->>'id'), ''))::uuid), '{}')
    into v_kept_line_ids
    from jsonb_array_elements(p_lines) entry(value)
    where nullif(trim(entry.value->>'id'), '') is not null
      and exists (
        select 1 from public.sale_lines sl
        where sl.id = (nullif(trim(entry.value->>'id'), ''))::uuid
          and sl.sale_id = v_sale.id
      );

    -- Guard: If a removed line has an active/completed production job or started steps, prevent loss of workshop progress
    if exists (
      select 1
      from public.production_jobs j
      where j.sale_id = v_sale.id
        and j.sale_line_id in (
          select id from public.sale_lines
          where sale_id = v_sale.id and not (id = any(v_kept_line_ids))
        )
        and (
          j.status = 'completed'
          or exists (
            select 1 from public.production_job_steps s
            where s.job_id = j.id and s.status in ('in_progress', 'completed')
          )
        )
    ) then
      raise exception 'No se puede quitar un artículo cuyo trabajo de taller ya inició o terminó.' using errcode = '22023';
    end if;

    -- Unlink purchase requests for deleted jobs and delete jobs of removed lines only
    select coalesce(array_agg(j.id), '{}')
    into v_deleted_job_ids
    from public.production_jobs j
    where j.sale_id = v_sale.id
      and j.sale_line_id in (
        select id from public.sale_lines
        where sale_id = v_sale.id and not (id = any(v_kept_line_ids))
      );

    if array_length(v_deleted_job_ids, 1) > 0 then
      update public.purchase_requests
      set production_job_id = null, updated_at = now()
      where organization_id = v_sale.organization_id
        and production_job_id = any(v_deleted_job_ids);

      delete from public.production_jobs
      where id = any(v_deleted_job_ids);
    end if;

    -- Delete removed sale lines only
    delete from public.sale_lines
    where sale_id = v_sale.id and not (id = any(v_kept_line_ids));

    -- Calculate subtotal
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
      v_line_id := nullif(trim(v_line->>'id'), '')::uuid;
      v_quantity := nullif(v_line->>'quantity', '')::numeric;
      v_price := nullif(v_line->>'unit_price', '')::numeric;
      v_product := nullif(trim(v_line->>'catalog_product_id'), '');
      v_requested_variant := nullif(trim(v_line->>'variant_id'), '')::uuid;
      v_variant := null;
      v_location := coalesce(nullif(trim(v_line->>'location_code'), ''), 'MAIN');

      if v_product is not null then
        select count(*) into v_active_link_count
        from public.catalog_inventory_links l
        where l.organization_id = v_sale.organization_id
          and l.catalog_product_id = v_product
          and l.branch_id = v_sale.branch_id
          and l.active;

        select count(*) into v_link_count
        from public.catalog_inventory_links l
        join public.catalog_products c on c.id = l.catalog_product_id and c.organization_id = l.organization_id
        join public.inventory_variants iv on iv.id = l.inventory_variant_id and iv.organization_id = l.organization_id and iv.active
        join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id and i.active
        where l.organization_id = v_sale.organization_id
          and l.catalog_product_id = v_product
          and l.branch_id = v_sale.branch_id
          and l.active
          and c.is_published;

        if v_link_count <> v_active_link_count then
          raise exception 'El producto tiene vínculos activos con fichas o variantes inactivas. Corrige el vínculo en Inventario antes de editar la venta.' using errcode = '22023';
        end if;

        if v_requested_variant is not null then
          select l.inventory_variant_id, l.location_code into v_variant, v_location
          from public.catalog_inventory_links l
          join public.catalog_products c on c.id = l.catalog_product_id and c.organization_id = l.organization_id
          join public.inventory_variants iv on iv.id = l.inventory_variant_id and iv.organization_id = l.organization_id and iv.active
          join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id and i.active
          where l.organization_id = v_sale.organization_id
            and l.catalog_product_id = v_product
            and l.branch_id = v_sale.branch_id
            and l.inventory_variant_id = v_requested_variant
            and l.active
            and c.is_published;
          if not found then
            raise exception 'La variante seleccionada no está vinculada a este producto y sucursal.' using errcode = '22023';
          end if;
        elsif v_link_count = 1 then
          select l.inventory_variant_id, l.location_code into v_variant, v_location
          from public.catalog_inventory_links l
          join public.catalog_products c on c.id = l.catalog_product_id and c.organization_id = l.organization_id
          join public.inventory_variants iv on iv.id = l.inventory_variant_id and iv.organization_id = l.organization_id and iv.active
          join public.inventory_items i on i.id = iv.item_id and i.organization_id = iv.organization_id and i.active
          where l.organization_id = v_sale.organization_id
            and l.catalog_product_id = v_product
            and l.branch_id = v_sale.branch_id
            and l.active
            and c.is_published
          limit 1;
        elsif v_link_count > 1 then
          raise exception 'Selecciona una variante de inventario para %.', coalesce(v_line->>'description','artículo') using errcode = '22023';
        end if;
      elsif v_requested_variant is not null then
        -- Preserve legacy non-catalog inventory lines; catalog variants are always validated above.
        v_variant := v_requested_variant;
      end if;

      if v_product is not null and v_variant is not null then
        if pg_catalog.upper(pg_catalog.btrim(coalesce(v_location, 'MAIN'))) <> 'MAIN' then
          raise exception 'Los productos del catálogo deben descontar desde MAIN hasta que la reversión de ventas conserve la ubicación.' using errcode = '22023';
        end if;
        v_location := 'MAIN';
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

      if v_line_id is not null and (v_line_id = any(v_kept_line_ids)) then
        -- Update kept line in place, preserving line ID and associated production_job
        update public.sale_lines
        set variant_id = v_variant,
            catalog_product_id = v_product,
            client_line_key = coalesce(nullif(trim(v_line->>'line_key'), ''), client_line_key),
            sku_snapshot = coalesce(nullif(trim(v_line->>'sku'), ''), nullif(trim(v_line->>'sku_snapshot'), ''), sku_snapshot),
            description_snapshot = coalesce(nullif(trim(v_line->>'description'), ''), nullif(trim(v_line->>'description_snapshot'), ''), description_snapshot),
            quantity = v_quantity,
            fulfilled_quantity = v_fulfilled,
            backordered_quantity = v_backordered,
            unit_price = v_price,
            line_total = round(v_quantity * v_price, 2),
            material_requests = case when jsonb_typeof(v_line->'material_requests') = 'array' then v_line->'material_requests' else material_requests end,
            finishing_options = case when jsonb_typeof(v_line->'finishing_options') = 'object' then v_line->'finishing_options' else finishing_options end
        where id = v_line_id and sale_id = v_sale.id;

        update public.production_jobs
        set title = coalesce(nullif(trim(v_line->>'description'), ''), nullif(trim(v_line->>'description_snapshot'), ''), title),
            customer_name = coalesce(v_cust_name, customer_name),
            customer_phone = coalesce(nullif(v_cust_phone, ''), customer_phone),
            updated_at = now()
        where sale_line_id = v_line_id
          and sale_id = v_sale.id
          and status not in ('cancelled', 'completed');
      else
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
      end if;

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
    select sp.cash_session_id into v_prev_cash_session
    from public.sale_payments sp
    join public.cash_sessions cs
      on cs.id = sp.cash_session_id
     and cs.organization_id = sp.organization_id
     and cs.branch_id = v_sale.branch_id
    where sp.sale_id = v_sale.id
      and sp.organization_id = v_sale.organization_id
      and sp.method = 'cash'
      and sp.cash_session_id is not null
    order by sp.created_at asc
    limit 1;

    select coalesce(jsonb_object_agg(sp.id::text, sp.cash_session_id::text), '{}'::jsonb)
    into v_previous_payment_sessions
    from public.sale_payments sp
    join public.cash_sessions cs
      on cs.id = sp.cash_session_id
     and cs.organization_id = sp.organization_id
     and cs.branch_id = v_sale.branch_id
    where sp.sale_id = v_sale.id
      and sp.organization_id = v_sale.organization_id
      and sp.method = 'cash'
      and sp.cash_session_id is not null;

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
          v_p_session := app_private.resolve_pos_sale_amendment_cash_session(
            nullif(trim(v_payment->>'cash_session_id'), '')::uuid,
            nullif(trim(v_payment->>'id'), ''),
            v_previous_payment_sessions,
            v_touched_sessions,
            v_current_open_session,
            coalesce(v_current_open_session, v_prev_cash_session)
          );
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

revoke all on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) to authenticated;
