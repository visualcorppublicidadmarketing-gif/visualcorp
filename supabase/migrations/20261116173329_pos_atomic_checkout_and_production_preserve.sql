-- Migration: 20261116190000_pos_atomic_checkout_and_production_preserve.sql
-- 1. Idempotent link_pos_sale_to_central_quote
-- 2. Atomic quote conversion in confirm_pos_sale_with_workflows
-- 3. update_central_quote_status with price_confirmed = true and validation on accepted
-- 4. amend_confirmed_pos_sale preserving existing production_jobs and sale_lines

-- a) Idempotent link_pos_sale_to_central_quote
create or replace function public.link_pos_sale_to_central_quote(p_sale uuid, p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.sales%rowtype;
  v_q public.central_quotes%rowtype;
begin
  select * into v_s from public.sales where id = p_sale for update;
  select * into v_q from public.central_quotes where id = p_quote for update;
  if not found or v_s.id is null or v_q.organization_id <> v_s.organization_id or v_s.status <> 'confirmed' then
    raise exception 'Venta o cotización no válida.' using errcode = '22023';
  end if;

  if not app_private.has_visualcorp_access(v_s.organization_id, 'sales', 'edit', v_s.branch_id)
     or (v_s.created_by <> auth.uid() and not app_private.has_org_role(v_s.organization_id, v_s.branch_id, array['owner','admin','manager'])) then
    raise exception 'No tienes permiso para vincular esta venta.' using errcode = '42501';
  end if;

  -- Idempotent bypass if already converted and linked
  if v_s.central_quote_id = p_quote and v_q.status = 'converted' then
    return;
  end if;

  if v_s.central_quote_id is not null and v_s.central_quote_id <> p_quote then
    raise exception 'La venta ya está vinculada a otra cotización.' using errcode = '22023';
  end if;

  if v_q.status <> 'accepted' or not coalesce(v_q.price_confirmed, false) or v_q.selected_total is null or v_s.total <> v_q.selected_total then
    raise exception 'La cotización debe estar aceptada, con precio confirmado y el total debe coincidir.' using errcode = '22023';
  end if;

  update public.sales set central_quote_id = p_quote where id = p_sale;
  insert into public.central_quote_events(organization_id, quote_id, from_status, to_status, note, created_by)
  values(v_q.organization_id, v_q.id, v_q.status, 'converted', 'Venta ' || coalesce(v_s.sale_code, v_s.id::text), auth.uid());
  update public.central_quotes set status = 'converted', updated_at = now() where id = p_quote;
end;
$$;

revoke all on function public.link_pos_sale_to_central_quote(uuid, uuid) from public, anon;
grant execute on function public.link_pos_sale_to_central_quote(uuid, uuid) to authenticated;

-- b) confirm_pos_sale_with_workflows with atomic central_quote_id link and conversion
create or replace function app_private.confirm_pos_sale_with_workflows(
  p_idempotency_key text, p_branch_code text, p_customer_id uuid, p_customer_data jsonb,
  p_discount numeric, p_note text, p_allow_backorder boolean, p_lines jsonb, p_payments jsonb,
  p_fulfillment jsonb, p_production_jobs jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_result jsonb;
  v_sale public.sales%rowtype;
  v_line public.sale_lines%rowtype;
  v_customer public.customers%rowtype;
  v_entry jsonb;
  v_spec jsonb;
  v_template public.production_workflow_templates%rowtype;
  v_code text;
  v_index integer;
  v_line_key text;
  v_job_id uuid;
  v_fingerprint text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_user uuid := (select auth.uid());
  v_install boolean;
  v_address text;
  v_maps text;
  v_quote_id uuid;
begin
  if v_user is null then raise exception 'Inicia sesión para confirmar la venta.' using errcode = '42501'; end if;
  if p_fulfillment is null or jsonb_typeof(p_fulfillment) <> 'object'
     or octet_length(p_fulfillment::text) > 8000 then
    raise exception 'Los datos de entrega no son válidos.' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 100 or octet_length(p_lines::text) > 100000 then
    raise exception 'La venta necesita de 1 a 100 artículos.' using errcode = '22023';
  end if;
  if p_production_jobs is null or jsonb_typeof(p_production_jobs) <> 'array'
     or jsonb_array_length(p_production_jobs) <> jsonb_array_length(p_lines)
     or octet_length(p_production_jobs::text) > 250000 then
    raise exception 'Cada artículo necesita una ruta de trabajo.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l
    where jsonb_typeof(l) <> 'object' or nullif(trim(l->>'line_key'), '') is null
      or length(l->>'line_key') > 160) then
    raise exception 'Cada artículo necesita una clave única.' using errcode = '22023';
  end if;
  if (select count(distinct l->>'line_key') from jsonb_array_elements(p_lines) l)
     <> jsonb_array_length(p_lines) then
    raise exception 'Hay claves de artículo repetidas.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_production_jobs) j
    where jsonb_typeof(j) <> 'object' or coalesce(j->>'line_index', '') !~ '^(0|[1-9][0-9]?)$'
      or case when coalesce(j->>'line_index', '') ~ '^(0|[1-9][0-9]?)$'
        then (j->>'line_index')::integer >= jsonb_array_length(p_lines) else true end
      or jsonb_typeof(j->'specifications') <> 'object'
      or octet_length((j->'specifications')::text) > 16000) then
    raise exception 'Una ficha de producción es inválida.' using errcode = '22023';
  end if;
  if (select count(distinct (j->>'line_index')::integer) from jsonb_array_elements(p_production_jobs) j)
     <> jsonb_array_length(p_lines) then
    raise exception 'Cada artículo debe tener una sola ficha de producción.' using errcode = '22023';
  end if;
  v_install := coalesce((p_fulfillment->>'installation_required')::boolean, false);
  v_address := nullif(trim(p_fulfillment->>'installation_address'), '');
  v_maps := nullif(trim(p_fulfillment->>'installation_maps_url'), '');
  if v_install and v_address is null then
    raise exception 'Agrega la ubicación de instalación.' using errcode = '22023';
  end if;
  if v_maps is not null and v_maps !~* '^https://(www[.])?google[.]com/maps/|^https://maps[.]app[.]goo[.]gl/|^https://goo[.]gl/maps/' then
    raise exception 'El enlace debe ser de Google Maps.' using errcode = '22023';
  end if;

  v_sale_result := public.create_pos_sale_idempotent(
    p_idempotency_key, p_branch_code, p_customer_id, p_customer_data, p_discount, p_note,
    p_allow_backorder, p_lines, p_payments
  );
  select * into v_sale from public.sales where id = (v_sale_result->>'sale_id')::uuid for update;
  if not found or v_sale.status <> 'confirmed' then
    raise exception 'No se pudo confirmar la venta.' using errcode = '55000';
  end if;
  if v_sale.advisor_id is distinct from v_user and not app_private.can_coordinate_production(
    v_sale.organization_id, v_sale.branch_id, v_user
  ) then
    raise exception 'No puedes confirmar el trabajo de otra asesora.' using errcode = '42501';
  end if;

  v_fingerprint := md5(jsonb_build_object('fulfillment', p_fulfillment, 'jobs', p_production_jobs)::text);
  if v_sale.production_confirmation_fingerprint is not null then
    if v_sale.production_confirmation_fingerprint is distinct from v_fingerprint then
      raise exception 'La clave de venta ya se usó con otra ficha de producción.' using errcode = '23505';
    end if;
    return v_sale_result || jsonb_build_object(
      'workflows_created', 0,
      'production_jobs_skipped', 0,
      'production_workflow_ids', coalesce((select jsonb_agg(id order by created_at, id)
        from public.production_jobs where sale_id = v_sale.id), '[]'::jsonb),
      'central_quote_id', v_sale.central_quote_id
    );
  end if;

  if coalesce((v_sale_result->>'replayed')::boolean, false) then
    raise exception 'La venta ya existe sin ficha de producción. Requiere revisión antes de reintentar.' using errcode = '55000';
  end if;

  insert into public.sale_fulfillment_details(
    sale_id, organization_id, installation_required, installation_address, installation_maps_url,
    installation_latitude, installation_longitude, installation_estimated_at, delivery_due_at, updated_by
  ) values (
    v_sale.id, v_sale.organization_id, v_install, v_address, v_maps,
    nullif(p_fulfillment->>'installation_latitude', '')::numeric,
    nullif(p_fulfillment->>'installation_longitude', '')::numeric,
    nullif(p_fulfillment->>'installation_estimated_at', '')::timestamptz,
    nullif(p_fulfillment->>'delivery_due_at', '')::timestamptz, v_user
  );

  if v_sale.customer_id is not null then
    select * into v_customer from public.customers where id = v_sale.customer_id;
  end if;

  for v_entry in select value from jsonb_array_elements(p_production_jobs) loop
    v_index := (v_entry->>'line_index')::integer;
    v_line_key := p_lines->v_index->>'line_key';
    v_code := v_entry->>'workflow_code';
    v_spec := v_entry->'specifications';
    select * into v_template from public.production_workflow_templates
      where organization_id = v_sale.organization_id and code = v_code and active;
    if not found then raise exception 'La ruta % no está disponible.', coalesce(v_code, 'sin nombre') using errcode = '22023'; end if;
    select * into v_line from public.sale_lines
      where sale_id = v_sale.id and organization_id = v_sale.organization_id and client_line_key = v_line_key;
    if not found then raise exception 'No se encontró el artículo % de la venta.', v_line_key using errcode = '55000'; end if;
    if v_code = 'none' then v_skipped := v_skipped + 1; continue; end if;

    insert into public.production_jobs(
      organization_id, branch_id, sale_id, sale_line_id, advisor_id, catalog_product_id,
      workflow_code, sale_code, customer_name, customer_phone, title, specifications,
      deposit_required, approval_required, artwork_review_status, due_at, created_by
    ) values (
      v_sale.organization_id, v_sale.branch_id, v_sale.id, v_line.id, v_sale.advisor_id,
      v_line.catalog_product_id, v_code, coalesce(v_sale.sale_code, ''),
      coalesce(v_customer.full_name, ''), coalesce(v_customer.phone, ''), v_line.description_snapshot,
      v_spec, v_template.deposit_required,
      coalesce((v_spec->>'approval_required')::boolean, false),
      case when coalesce((v_spec->>'approval_required')::boolean, false) then 'awaiting_art' else 'not_required' end,
      nullif(p_fulfillment->>'delivery_due_at', '')::timestamptz, v_user
    ) returning id into v_job_id;

    insert into public.production_job_spec_versions(
      organization_id, job_id, version, specifications, note, created_by
    ) values (v_sale.organization_id, v_job_id, 1, v_spec, 'Ficha creada al confirmar la venta', v_user);

    perform app_private.create_production_job_steps(v_job_id);

    insert into public.production_job_events(organization_id, job_id, event_type, details, created_by)
    values (v_sale.organization_id, v_job_id, 'job_created',
      jsonb_build_object('workflow_code', v_code, 'sale_id', v_sale.id), v_user);

    v_created := v_created + 1;
  end loop;

  -- Atomic link and conversion of central_quote_id
  v_quote_id := coalesce(
    nullif(trim(v_sale_result->>'central_quote_id'), '')::uuid,
    nullif(trim(p_customer_data->>'central_quote_id'), '')::uuid
  );
  if v_quote_id is not null and v_sale.central_quote_id is distinct from v_quote_id then
    update public.sales set central_quote_id = v_quote_id where id = v_sale.id;
    insert into public.central_quote_events(organization_id, quote_id, from_status, to_status, note, created_by)
    values (v_sale.organization_id, v_quote_id, 'accepted', 'converted', 'Venta ' || coalesce(v_sale.sale_code, v_sale.id::text), v_user);
    update public.central_quotes
    set status = 'converted', updated_at = now()
    where id = v_quote_id and organization_id = v_sale.organization_id and status = 'accepted';
    v_sale.central_quote_id := v_quote_id;
  end if;

  update public.sales set production_confirmation_fingerprint = v_fingerprint where id = v_sale.id;

  return v_sale_result || jsonb_build_object(
    'workflows_created', v_created,
    'production_jobs_skipped', v_skipped,
    'production_workflow_ids', coalesce((select jsonb_agg(id order by created_at, id)
      from public.production_jobs where sale_id = v_sale.id), '[]'::jsonb),
    'central_quote_id', coalesce(v_sale.central_quote_id, v_quote_id)
  );
end;
$$;

revoke all on function app_private.confirm_pos_sale_with_workflows(text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function app_private.confirm_pos_sale_with_workflows(text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.confirm_pos_sale_with_workflows(
  p_idempotency_key text, p_branch_code text, p_customer_id uuid, p_customer_data jsonb,
  p_discount numeric, p_note text, p_allow_backorder boolean, p_lines jsonb, p_payments jsonb,
  p_fulfillment jsonb, p_production_jobs jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select app_private.confirm_pos_sale_with_workflows($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
$$;

revoke all on function public.confirm_pos_sale_with_workflows(text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_pos_sale_with_workflows(text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- c) update_central_quote_status with price_confirmed = true and validation on accepted
create or replace function public.update_central_quote_status(
  p_quote uuid, p_status text, p_note text default ''
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q public.central_quotes%rowtype;
begin
  if p_status is null or p_status not in ('sent', 'accepted', 'rejected', 'expired') then
    raise exception 'Estado de cotización inválido. La conversión se registra desde una venta confirmada.' using errcode = '22023';
  end if;

  select * into v_q from public.central_quotes where id = p_quote for update;
  if not found or not app_private.has_visualcorp_access(v_q.organization_id, 'quotes', 'edit') then
    raise exception 'Cotización no encontrada o sin permiso.' using errcode = '42501';
  end if;

  if v_q.status in ('rejected', 'expired', 'converted') then
    raise exception 'La cotización ya está cerrada.' using errcode = '22023';
  end if;

  if p_status = 'accepted' then
    if v_q.selected_total is null then
      raise exception 'No se puede aceptar una cotización sin tarifa o total seleccionado.' using errcode = '22023';
    end if;

    insert into public.central_quote_events(organization_id, quote_id, from_status, to_status, note, created_by)
    values(v_q.organization_id, v_q.id, v_q.status, p_status, left(coalesce(p_note, ''), 1000), auth.uid());

    update public.central_quotes
    set status = p_status, price_confirmed = true, updated_at = now()
    where id = p_quote;
  else
    insert into public.central_quote_events(organization_id, quote_id, from_status, to_status, note, created_by)
    values(v_q.organization_id, v_q.id, v_q.status, p_status, left(coalesce(p_note, ''), 1000), auth.uid());

    update public.central_quotes
    set status = p_status, updated_at = now()
    where id = p_quote;
  end if;
end;
$$;

revoke all on function public.update_central_quote_status(uuid, text, text) from public, anon;
grant execute on function public.update_central_quote_status(uuid, text, text) to authenticated;

-- d) amend_confirmed_pos_sale preserving existing production_jobs and sale_lines
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

revoke all on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.amend_confirmed_pos_sale(uuid, uuid, jsonb, numeric, text, text, jsonb, jsonb, text) to authenticated;
