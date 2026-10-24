-- Exact POS customer summary, calculated from the authorized sales history.
-- SECURITY INVOKER keeps table RLS in effect; explicit module checks also
-- prevent exposing CRM or sales data through a guessed customer UUID.
create or replace function public.get_visualcorp_pos_customer_summary(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_org uuid;
  v_purchase_count bigint := 0;
  v_net_spent numeric(14,2) := 0;
  v_net_paid numeric(14,2) := 0;
  v_refunded numeric(14,2) := 0;
  v_balance numeric(14,2) := 0;
  v_last_purchase timestamptz;
  v_recent jsonb := '[]'::jsonb;
  v_favorites jsonb := '[]'::jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para consultar las compras del cliente.' using errcode = '42501';
  end if;

  select o.id into v_org
  from public.organizations o
  where o.slug = 'visual-corp'
  limit 1;

  if v_org is null
     or not app_private.has_visualcorp_access(v_org, 'crm', 'view', null::uuid)
     or not app_private.has_visualcorp_access(v_org, 'sales', 'view', null::uuid) then
    raise exception 'Tu perfil no permite consultar el resumen comercial de clientes.' using errcode = '42501';
  end if;

  if p_customer_id is null or not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = v_org
  ) then
    raise exception 'No encontramos ese cliente en Visual Corp.' using errcode = '22023';
  end if;

  with visible_sales as (
    select s.id, s.branch_id, s.sale_code, s.total, s.created_at, s.note,
      coalesce((
        select sum(p.amount) from public.sale_payments p
        where p.organization_id = v_org and p.sale_id = s.id
      ), 0)::numeric(14,2) as paid,
      coalesce((
        select sum(r.refund_amount) from public.sale_returns r
        where r.organization_id = v_org and r.sale_id = s.id and r.refund_status = 'refunded'
      ), 0)::numeric(14,2) as refunded
    from public.sales s
    where s.organization_id = v_org
      and s.customer_id = p_customer_id
      and s.status = 'confirmed'
      and app_private.has_visualcorp_access(v_org, 'sales', 'view', s.branch_id)
  )
  select count(*),
    coalesce(sum(greatest(total - refunded, 0)), 0),
    coalesce(sum(greatest(paid - refunded, 0)), 0),
    coalesce(sum(refunded), 0),
    coalesce(sum(greatest(greatest(total - refunded, 0) - greatest(paid - refunded, 0), 0)), 0),
    max(created_at)
  into v_purchase_count, v_net_spent, v_net_paid, v_refunded, v_balance, v_last_purchase
  from visible_sales;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'code', recent.sale_code,
    'total', greatest(recent.total - recent.refunded, 0),
    'date', recent.created_at,
    'description', recent.description
  ) order by recent.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select s.id, s.sale_code, s.total, s.created_at,
      coalesce((select sum(r.refund_amount) from public.sale_returns r
        where r.organization_id = v_org and r.sale_id = s.id and r.refund_status = 'refunded'), 0) as refunded,
      coalesce((select string_agg(left(l.description_snapshot, 120) || ' × ' || l.quantity::text, ' · ' order by l.id)
        from public.sale_lines l where l.organization_id = v_org and l.sale_id = s.id), nullif(s.note, ''), 'Compra registrada') as description
    from public.sales s
    where s.organization_id = v_org and s.customer_id = p_customer_id and s.status = 'confirmed'
      and app_private.has_visualcorp_access(v_org, 'sales', 'view', s.branch_id)
    order by s.created_at desc
    limit 4
  ) recent;

  select coalesce(jsonb_agg(jsonb_build_object('name', products.name, 'quantity', products.quantity)
    order by products.quantity desc, products.name), '[]'::jsonb)
  into v_favorites
  from (
    select coalesce(nullif(l.catalog_product_id, ''), l.description_snapshot) as product_key,
      max(l.description_snapshot) as name,
      sum(greatest(l.quantity - l.returned_quantity, 0)) as quantity
    from public.sale_lines l
    join public.sales s on s.id = l.sale_id and s.organization_id = l.organization_id
    where l.organization_id = v_org and s.customer_id = p_customer_id and s.status = 'confirmed'
      and app_private.has_visualcorp_access(v_org, 'sales', 'view', s.branch_id)
    group by coalesce(nullif(l.catalog_product_id, ''), l.description_snapshot)
    having sum(greatest(l.quantity - l.returned_quantity, 0)) > 0
    order by quantity desc, name
    limit 3
  ) products;

  return jsonb_build_object(
    'purchase_count', v_purchase_count,
    'net_spent', round(v_net_spent, 2),
    'net_paid', round(v_net_paid, 2),
    'refunded', round(v_refunded, 2),
    'balance_due', round(v_balance, 2),
    'last_purchase_at', v_last_purchase,
    'top_products', v_favorites,
    'recent_purchases', v_recent
  );
end;
$function$;

revoke all on function public.get_visualcorp_pos_customer_summary(uuid) from public, anon;
grant execute on function public.get_visualcorp_pos_customer_summary(uuid) to authenticated;

-- Search the full client directory server-side so POS lookup stays responsive
-- even when the workspace's in-memory customer list has reached its row cap.
create or replace function public.search_visualcorp_pos_customers(
  p_query text,
  p_phone text default null,
  p_email text default null,
  p_document_reference text default null,
  p_limit integer default 8
)
returns table (
  id uuid,
  full_name text,
  phone text,
  email text,
  document_reference text,
  notes text,
  preferences jsonb,
  tags text[],
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_org uuid;
  v_query text := trim(coalesce(p_query, ''));
  v_query_normalized text;
  v_query_digits text;
  v_query_phone text;
  v_query_tokens text[];
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_document_digits text := regexp_replace(coalesce(p_document_reference, ''), '[^0-9]', '', 'g');
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para buscar clientes.' using errcode = '42501';
  end if;

  select o.id into v_org from public.organizations o where o.slug = 'visual-corp' limit 1;
  if v_org is null or not app_private.has_visualcorp_access(v_org, 'crm', 'view', null::uuid) then
    raise exception 'Tu perfil no permite buscar en la base de clientes.' using errcode = '42501';
  end if;

  v_query_normalized := translate(lower(v_query), 'áéíóúüñ', 'aeiouun');
  v_query_tokens := regexp_split_to_array(v_query_normalized, '[[:space:]]+');
  v_query_digits := regexp_replace(v_query, '[^0-9]', '', 'g');
  v_query_phone := case when left(v_query_digits, 3) = '593'
    then '0' || regexp_replace(substr(v_query_digits, 4), '^0', '') else v_query_digits end;
  v_phone_digits := case when left(v_phone_digits, 3) = '593'
    then '0' || regexp_replace(substr(v_phone_digits, 4), '^0', '') else v_phone_digits end;

  if char_length(v_query) < 2 and char_length(v_phone_digits) < 3
     and char_length(v_email) < 3 and char_length(v_document_digits) < 4 then
    return;
  end if;

  return query
  with normalized as (
    select c.id, c.full_name, c.phone, c.email, c.document_reference, c.notes,
      c.preferences, c.tags, c.created_at,
      translate(lower(c.full_name), 'áéíóúüñ', 'aeiouun') as name_search,
      regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') as phone_raw,
      regexp_replace(coalesce(c.document_reference, ''), '[^0-9]', '', 'g') as document_digits
    from public.customers c
    where c.organization_id = v_org
      and app_private.has_visualcorp_access(v_org, 'crm', 'view', null::uuid)
  ), candidates as (
    select n.*,
      case when left(n.phone_raw, 3) = '593'
        then '0' || regexp_replace(substr(n.phone_raw, 4), '^0', '') else n.phone_raw end as phone_search
    from normalized n
  )
  select c.id, c.full_name, c.phone, c.email, c.document_reference, c.notes,
    c.preferences, c.tags, c.created_at
  from candidates c
  where
    (char_length(v_query) >= 2 and (
      c.name_search ilike '%' || v_query_normalized || '%'
      or lower(coalesce(c.email, '')) like '%' || lower(v_query) || '%'
      or lower(coalesce(c.notes, '')) like '%' || lower(v_query) || '%'
      or exists (select 1 from unnest(c.tags) as tag_value(value) where lower(tag_value.value) like '%' || lower(v_query) || '%')
      or (cardinality(v_query_tokens) > 1 and not exists (
        select 1 from unnest(v_query_tokens) as search_token(value)
        where search_token.value <> '' and not (
          c.name_search like '%' || search_token.value || '%'
          or lower(coalesce(c.email, '')) like '%' || search_token.value || '%'
          or lower(coalesce(c.notes, '')) like '%' || search_token.value || '%'
          or exists (select 1 from unnest(c.tags) as token_tag(value) where lower(token_tag.value) like '%' || search_token.value || '%')
        )
      ))
      or (char_length(v_query_digits) >= 4 and c.document_digits like '%' || v_query_digits || '%')
      or (char_length(v_query_phone) >= 3 and c.phone_search like '%' || v_query_phone || '%')
    ))
    or (char_length(v_phone_digits) >= 3 and c.phone_search like '%' || v_phone_digits || '%')
    or (char_length(v_email) >= 3 and lower(coalesce(c.email, '')) like '%' || v_email || '%')
    or (char_length(v_document_digits) >= 4 and c.document_digits like '%' || v_document_digits || '%')
  order by
    case
      when v_query_normalized <> '' and c.name_search = v_query_normalized then 0
      when (v_email <> '' and lower(coalesce(c.email, '')) = v_email)
        or (position('@' in v_query) > 0 and lower(coalesce(c.email, '')) = lower(v_query)) then 1
      when char_length(v_phone_digits) >= 7 and c.phone_search = v_phone_digits then 2
      when char_length(v_query_phone) >= 7 and c.phone_search = v_query_phone then 2
      when char_length(v_document_digits) >= 7 and c.document_digits = v_document_digits then 3
      when char_length(v_query_digits) >= 7 and c.document_digits = v_query_digits then 3
      when v_query_normalized <> '' and c.name_search like v_query_normalized || '%' then 4
      when cardinality(v_query_tokens) > 1 and not exists (
        select 1 from unnest(v_query_tokens) as search_token(value)
        where search_token.value <> '' and c.name_search not like '%' || search_token.value || '%'
      ) then 5
      when v_email <> '' and lower(coalesce(c.email, '')) like v_email || '%' then 5
      else 6
    end,
    c.created_at desc,
    c.full_name
  limit v_limit;
end;
$function$;

revoke all on function public.search_visualcorp_pos_customers(text, text, text, text, integer) from public, anon;
grant execute on function public.search_visualcorp_pos_customers(text, text, text, text, integer) to authenticated;
