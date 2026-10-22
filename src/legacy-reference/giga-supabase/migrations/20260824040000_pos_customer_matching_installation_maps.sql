-- CRM customer matching and georeferenced installation work orders.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS source_quote_number TEXT,
  ADD COLUMN IF NOT EXISTS installation_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS installation_latitude NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS installation_longitude NUMERIC(9, 6);

CREATE INDEX IF NOT EXISTS idx_pos_customers_name_trgm
  ON public.pos_customers USING gin (lower(name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pos_customers_identification_digits
  ON public.pos_customers ((regexp_replace(coalesce(identification, ''), '[^0-9]', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_pos_customers_phone_digits
  ON public.pos_customers ((regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_pos_orders_installation_date
  ON public.pos_orders (installation_date)
  WHERE requires_installation = TRUE;

COMMENT ON COLUMN public.pos_orders.installation_maps_url IS
  'Google Maps share URL for the on-site installation work order.';

COMMENT ON COLUMN public.pos_orders.installation_latitude IS
  'Latitude parsed from a Google Maps URL when coordinates are available.';

COMMENT ON COLUMN public.pos_orders.installation_longitude IS
  'Longitude parsed from a Google Maps URL when coordinates are available.';
