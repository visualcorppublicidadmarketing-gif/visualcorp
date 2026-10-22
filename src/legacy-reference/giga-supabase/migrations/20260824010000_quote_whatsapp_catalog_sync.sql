-- Flujo web -> WhatsApp -> asesor -> POS y catálogo de precios compartido.

alter table public.site_settings
  add column if not exists quote_whatsapp_routes jsonb not null default '[]'::jsonb,
  add column if not exists quote_message_intro text not null default '¡Hola Gigaprint! Acabo de generar una solicitud de cotización.',
  add column if not exists quote_message_closing text not null default '¿Podrían confirmar disponibilidad, precio final y tiempo de entrega?';

update public.site_settings
set quote_whatsapp_routes = jsonb_build_array(jsonb_build_object(
  'id', 'ventas-principal',
  'label', 'Ventas',
  'number', whatsapp,
  'categories', '[]'::jsonb,
  'active', true,
  'priority', 0
))
where id = 'main'
  and jsonb_array_length(coalesce(quote_whatsapp_routes, '[]'::jsonb)) = 0
  and coalesce(whatsapp, '') <> '';

alter table public.quote_requests
  add column if not exists customer_city text,
  add column if not exists destination_whatsapp text,
  add column if not exists destination_label text,
  add column if not exists converted_order_id text,
  add column if not exists converted_at timestamptz;

alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests add constraint quote_requests_status_check
  check (status in ('nuevo', 'contactado', 'convertido_pos', 'en_produccion', 'completado', 'descartado', 'cancelado'));

create or replace function public.create_quote_request(payload jsonb)
returns table (id uuid, quote_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.quote_requests (
    customer_name, customer_email, customer_phone, customer_company, customer_city,
    items, subtotal, tax_rate, tax_amount, total, notes, source,
    destination_whatsapp, destination_label
  ) values (
    nullif(payload->>'customer_name', ''), nullif(payload->>'customer_email', ''),
    nullif(payload->>'customer_phone', ''), nullif(payload->>'customer_company', ''),
    nullif(payload->>'customer_city', ''), coalesce(payload->'items', '[]'::jsonb),
    coalesce((payload->>'subtotal')::numeric, 0), coalesce((payload->>'tax_rate')::numeric, 15),
    coalesce((payload->>'tax_amount')::numeric, 0), coalesce((payload->>'total')::numeric, 0),
    nullif(payload->>'notes', ''), coalesce(nullif(payload->>'source', ''), 'cotizador'),
    nullif(payload->>'destination_whatsapp', ''), nullif(payload->>'destination_label', '')
  )
  returning quote_requests.id, quote_requests.quote_number;
end;
$$;

revoke all on function public.create_quote_request(jsonb) from public;
grant execute on function public.create_quote_request(jsonb) to anon, authenticated;

alter table public.pos_products alter column base_price type numeric(12,4) using base_price::numeric(12,4);

create or replace function public.sync_public_product_to_pos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  insert into public.pos_products (
    id, sku, name, category, parent_category, calc_type, base_price, min_price,
    unit, price_tiers, is_active, image_url, description, min_order_qty, updated_at
  ) values (
    new.id, 'WEB-' || upper(substr(md5(new.id), 1, 8)), new.name, coalesce(new.category, 'General'),
    coalesce(new.category, 'General'),
    case when new.calc_type = 'm2' then 'area' else coalesce(new.calc_type, 'unit') end,
    coalesce(new.price, 0), coalesce(new.price, 0), coalesce(new.unit, 'unidad'),
    coalesce(new.price_scales, '[]'::jsonb), new.is_published, new.image, new.description,
    coalesce(new.min_quantity, 1), now()
  )
  on conflict (id) do update set
    name = excluded.name, category = excluded.category, parent_category = excluded.parent_category,
    calc_type = excluded.calc_type, base_price = excluded.base_price, min_price = excluded.min_price,
    unit = excluded.unit, price_tiers = excluded.price_tiers, is_active = excluded.is_active,
    image_url = excluded.image_url, description = excluded.description,
    min_order_qty = excluded.min_order_qty, updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_pos_product_to_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  insert into public.products (
    id, name, category, type, calc_type, pricing_mode, price, unit, description,
    price_scales, min_quantity, source, is_published, sort_order
  ) values (
    new.id, new.name, coalesce(new.category, 'General'),
    case when new.calc_type = 'area' then 'm2' else coalesce(new.calc_type, 'unit') end,
    case when new.calc_type = 'area' then 'm2' else coalesce(new.calc_type, 'unit') end,
    case when new.calc_type = 'tier-total' then 'tier-total' else 'unit' end,
    coalesce(new.base_price, 0), coalesce(new.unit, 'unidad'), new.description,
    coalesce(new.price_tiers, '[]'::jsonb), coalesce(new.min_order_qty, 1),
    'pos', new.is_active, 9999
  )
  on conflict (id) do update set
    name = excluded.name, category = excluded.category, calc_type = excluded.calc_type,
    type = excluded.type, price = excluded.price, unit = excluded.unit,
    description = excluded.description, price_scales = excluded.price_scales,
    min_quantity = excluded.min_quantity, is_published = excluded.is_published;
  return new;
end;
$$;

drop trigger if exists products_sync_to_pos on public.products;
create trigger products_sync_to_pos after insert or update of name, category, calc_type, price, unit, price_scales, min_quantity, is_published, image, description
on public.products for each row execute function public.sync_public_product_to_pos();

drop trigger if exists pos_products_sync_to_public on public.pos_products;
create trigger pos_products_sync_to_public after insert or update of name, category, calc_type, base_price, unit, price_tiers, min_order_qty, is_active, description
on public.pos_products for each row execute function public.sync_pos_product_to_public();

-- Backfill inicial: el catálogo público (tienda/cotizador) prevalece como fuente canónica.
insert into public.pos_products (
  id, sku, name, category, parent_category, calc_type, base_price, min_price,
  unit, price_tiers, is_active, image_url, description, min_order_qty, updated_at
)
select id, 'WEB-' || upper(substr(md5(id), 1, 8)), name, coalesce(category, 'General'),
  coalesce(category, 'General'), case when calc_type = 'm2' then 'area' else coalesce(calc_type, 'unit') end,
  coalesce(price, 0), coalesce(price, 0), coalesce(unit, 'unidad'), coalesce(price_scales, '[]'::jsonb),
  is_published, image, description, coalesce(min_quantity, 1), now()
from public.products
on conflict (id) do update set
  name = excluded.name, category = excluded.category, parent_category = excluded.parent_category,
  calc_type = excluded.calc_type, base_price = excluded.base_price, min_price = excluded.min_price,
  unit = excluded.unit, price_tiers = excluded.price_tiers, is_active = excluded.is_active,
  image_url = excluded.image_url, description = excluded.description,
  min_order_qty = excluded.min_order_qty, updated_at = now();

alter table public.pos_orders add column if not exists source_quote_request_id uuid references public.quote_requests(id) on delete set null;
