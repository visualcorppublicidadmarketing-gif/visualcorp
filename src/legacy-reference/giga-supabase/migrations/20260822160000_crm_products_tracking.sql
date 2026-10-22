-- ==============================================================================
-- GIGAPRINT POS & CRM - FASE 1 & 2: CATALOGO UNIFICADO, CRM LOGS, TRACKING & PROVEEDORES
-- Migracion: 20260822160000_crm_products_tracking.sql
-- ==============================================================================

-- 1. TABLA DE CATALOGO DE PRODUCTOS UNIFICADO (pos_products)
CREATE TABLE IF NOT EXISTS public.pos_products (
  id TEXT PRIMARY KEY,
  sku TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Gran Formato',
  parent_category TEXT DEFAULT 'Gran Formato',
  calc_type TEXT NOT NULL DEFAULT 'area', -- 'area', 'unit', 'scale', 'tier-total'
  base_price NUMERIC(12, 4) NOT NULL DEFAULT 0.00,
  min_price NUMERIC(12, 4) DEFAULT 0.00,
  unit TEXT NOT NULL DEFAULT 'm2', -- 'm2', 'unidad', 'ciento', 'millar', 'metro_lineal'
  price_tiers JSONB DEFAULT '[]'::jsonb, -- Escalas de volumen [{minQty, maxQty, price}]
  finishing_options JSONB DEFAULT '[]'::jsonb, -- [{id, name, price, type}]
  is_active BOOLEAN NOT NULL DEFAULT true,
  image_url TEXT,
  description TEXT,
  min_order_qty NUMERIC(10, 2) DEFAULT 1,
  lead_time_days INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABLA DE BITACORA DE ACTIVIDADES CRM (pos_customer_activity_logs)
CREATE TABLE IF NOT EXISTS public.pos_customer_activity_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'call', 'whatsapp', 'visit', 'email', 'note', 'proof_sent', 'proof_approved', 'payment_reminder'
  title TEXT,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA DE PROVEEDORES (pos_suppliers)
CREATE TABLE IF NOT EXISTS public.pos_suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identification TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  city TEXT DEFAULT 'Quito',
  address TEXT,
  materials_supplied TEXT[] DEFAULT '{}',
  payment_terms TEXT DEFAULT 'Contado', -- 'Contado', 'Credito 15d', 'Credito 30d'
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. AMPLIAR TABLA DE ORDENES (pos_orders) CON TRACKING PUBLICO Y DESCUENTOS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'tracking_token') THEN
    ALTER TABLE public.pos_orders ADD COLUMN tracking_token TEXT NOT NULL DEFAULT gen_random_uuid()::text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'stage_history') THEN
    ALTER TABLE public.pos_orders ADD COLUMN stage_history JSONB DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'pickup_location') THEN
    ALTER TABLE public.pos_orders ADD COLUMN pickup_location TEXT DEFAULT 'Matriz Gigaprint - Av. de la Prensa y Vaca de Castro, Quito';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'pickup_pin') THEN
    ALTER TABLE public.pos_orders ADD COLUMN pickup_pin TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'discount_percent') THEN
    ALTER TABLE public.pos_orders ADD COLUMN discount_percent NUMERIC(5, 2) DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'discount_amount') THEN
    ALTER TABLE public.pos_orders ADD COLUMN discount_amount NUMERIC(12, 2) DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'discount_reason') THEN
    ALTER TABLE public.pos_orders ADD COLUMN discount_reason TEXT;
  END IF;
END $$;

-- 5. TABLA DE VENTAS EN ESPERA / BORRADORES (pos_parked_sales)
CREATE TABLE IF NOT EXISTS public.pos_parked_sales (
  id TEXT PRIMARY KEY,
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  cart_data JSONB NOT NULL,
  total_amount NUMERIC(12, 2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. INDICES PARA MAXIMO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_pos_products_category ON public.pos_products(category);
CREATE INDEX IF NOT EXISTS idx_pos_products_is_active ON public.pos_products(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_orders_tracking_token ON public.pos_orders(tracking_token);
CREATE INDEX IF NOT EXISTS idx_pos_customer_activity_customer_id ON public.pos_customer_activity_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_customer_activity_created_at ON public.pos_customer_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_suppliers_is_active ON public.pos_suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_pos_parked_sales_advisor ON public.pos_parked_sales(advisor_id);

-- 7. SEGURIDAD RLS
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_customer_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_parked_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura y escritura publica o autenticada de productos" ON public.pos_products FOR ALL USING (true);
CREATE POLICY "Lectura y escritura de bitacora CRM" ON public.pos_customer_activity_logs FOR ALL USING (true);
CREATE POLICY "Lectura y escritura de proveedores" ON public.pos_suppliers FOR ALL USING (true);
CREATE POLICY "Lectura y escritura de ventas en espera" ON public.pos_parked_sales FOR ALL USING (true);
