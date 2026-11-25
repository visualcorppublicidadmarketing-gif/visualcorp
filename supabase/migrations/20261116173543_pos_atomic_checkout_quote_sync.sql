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
