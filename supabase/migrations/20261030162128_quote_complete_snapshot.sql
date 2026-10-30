-- Preserve the commercial quote snapshot (customer, delivery, discount and tax
-- details) so the Cotizador history can show what was agreed when it was saved.
alter table public.central_quotes
  add column if not exists document_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(document_details) = 'object' and octet_length(document_details::text) <= 16000);

-- Keep the original RPC signature available to existing clients. New quote
-- screens call this overload and persist the complete quote snapshot atomically.
create or replace function public.create_central_quote(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_normal numeric,
  p_installation numeric,
  p_corporate numeric,
  p_chosen text,
  p_selected numeric,
  p_confirmed boolean,
  p_notes text,
  p_document_details jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_code text;
  v_id uuid;
  v_user uuid := auth.uid();
  v_items_total numeric;
begin
  if v_user is null
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) = 0
    or octet_length(p_items::text) > 50000
    or jsonb_typeof(p_document_details) is distinct from 'object'
    or octet_length(p_document_details::text) > 16000
    or p_chosen is null
    or p_chosen not in ('normal','installation','corporate') then
    raise exception 'Datos de cotización inválidos.' using errcode = '22023';
  end if;

  select id into v_org from public.organizations where slug = 'visual-corp';
  if v_org is null or not app_private.has_org_role(v_org, null, array['owner','admin','manager','advisor','marketing']) then
    raise exception 'No tienes permiso para cotizar.' using errcode = '42501';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and organization_id = v_org
  ) then
    raise exception 'Cliente no pertenece a Visual Corp.' using errcode = '22023';
  end if;
  if p_selected is not null and p_selected < 0 then
    raise exception 'Total inválido.' using errcode = '22023';
  end if;

  if coalesce(p_confirmed, false) then
    select coalesce(sum((item->>'total')::numeric), 0)
      into v_items_total
      from jsonb_array_elements(p_items) as entries(item);
    if p_selected is null or round(v_items_total, 2) <> round(p_selected, 2)
      or round(coalesce((p_document_details#>>'{financial,total}')::numeric, -1), 2) <> round(p_selected, 2) then
      raise exception 'El total cotizado debe coincidir con el desglose guardado.' using errcode = '22023';
    end if;
  end if;

  v_code := 'COT-' || to_char(now() at time zone 'UTC', 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.central_quotes (
    organization_id, quote_code, customer_id, customer_name, customer_phone,
    items, total_normal, total_installation, total_corporate, chosen_tier,
    selected_total, price_confirmed, notes, document_details, created_by
  ) values (
    v_org, v_code, p_customer_id, left(trim(coalesce(p_customer_name, '')), 200),
    left(trim(coalesce(p_customer_phone, '')), 60), p_items, p_normal,
    p_installation, p_corporate, p_chosen, p_selected, coalesce(p_confirmed, false),
    left(coalesce(p_notes, ''), 1200), p_document_details, v_user
  ) returning id into v_id;

  insert into public.central_quote_events (organization_id, quote_id, to_status, created_by)
  values (v_org, v_id, 'draft', v_user);

  return jsonb_build_object('id', v_id, 'quote_code', v_code, 'status', 'draft');
end;
$$;

revoke all on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,jsonb) from public, anon;
grant execute on function public.create_central_quote(uuid,text,text,jsonb,numeric,numeric,numeric,text,numeric,boolean,text,jsonb) to authenticated;
