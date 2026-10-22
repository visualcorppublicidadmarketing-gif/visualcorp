-- ==============================================================================
-- GIGAPRINT POS & CRM ULTRA-COMPLETE CONSOLIDATED SUPABASE SCHEMA
-- Contains: Advisors, Customers CRM, Orders & Items, Multi-Tender Payments,
-- Expenses, Shifts (Arqueo), Weekly PIN Rotation, Production Kanban Stages,
-- Art Proofing, Materials Inventory, and Material Usage Logs.
-- ==============================================================================

﻿-- ========================================================================
-- Gigaprint POS & CRM System Migration
-- Tables: pos_advisors, pos_customers, pos_orders, pos_order_items,
--         pos_payments, pos_expenses, pos_daily_closures
-- ========================================================================

CREATE TABLE IF NOT EXISTS public.pos_advisors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  pin TEXT DEFAULT '1234',
  phone TEXT,
  role TEXT DEFAULT 'asesora',
  weekly_goal NUMERIC DEFAULT 3200.00,
  commission_rate NUMERIC DEFAULT 0.0,
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pos_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identification TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT DEFAULT 'Quito',
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_customers_ident ON public.pos_customers(identification);
CREATE INDEX IF NOT EXISTS idx_pos_customers_phone ON public.pos_customers(phone);
CREATE INDEX IF NOT EXISTS idx_pos_customers_name ON public.pos_customers(name);

CREATE TABLE IF NOT EXISTS public.pos_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  advisor_id TEXT,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  customer_identification TEXT,
  job_name TEXT NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  day_of_week TEXT,
  day_number INT,
  status TEXT DEFAULT 'en_produccion',
  payment_status TEXT DEFAULT 'con_saldo',
  subtotal NUMERIC DEFAULT 0.0,
  tax_rate NUMERIC DEFAULT 15.0,
  tax_amount NUMERIC DEFAULT 0.0,
  shipping_cost NUMERIC DEFAULT 0.0,
  discount_amount NUMERIC DEFAULT 0.0,
  total_amount NUMERIC NOT NULL DEFAULT 0.0,
  deposit_amount NUMERIC DEFAULT 0.0,
  balance_due NUMERIC DEFAULT 0.0,
  flag_paid BOOLEAN DEFAULT false,
  flag_design BOOLEAN DEFAULT false,
  flag_delivered BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_advisor ON public.pos_orders(advisor_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_date ON public.pos_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON public.pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_payment_status ON public.pos_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_number ON public.pos_orders(order_number);

CREATE TABLE IF NOT EXISTS public.pos_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  category TEXT,
  calc_type TEXT DEFAULT 'unit',
  width_cm NUMERIC,
  height_cm NUMERIC,
  area_m2 NUMERIC,
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0.0,
  finishing TEXT DEFAULT 'none',
  eyelet_count INT DEFAULT 0,
  eyelet_type TEXT DEFAULT 'none',
  design_level TEXT DEFAULT 'none',
  has_installation BOOLEAN DEFAULT false,
  total_price NUMERIC NOT NULL DEFAULT 0.0,
  custom_details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_order_items_order ON public.pos_order_items(order_id);

CREATE TABLE IF NOT EXISTS public.pos_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  advisor_id TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0.0,
  bank_name TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_order ON public.pos_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_date ON public.pos_payments(payment_date);

CREATE TABLE IF NOT EXISTS public.pos_expenses (
  id TEXT PRIMARY KEY,
  advisor_id TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0.0,
  category TEXT DEFAULT 'suministros',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_expenses_advisor ON public.pos_expenses(advisor_id);
CREATE INDEX IF NOT EXISTS idx_pos_expenses_date ON public.pos_expenses(expense_date);

CREATE TABLE IF NOT EXISTS public.pos_daily_closures (
  id TEXT PRIMARY KEY,
  advisor_id TEXT NOT NULL,
  closure_date DATE NOT NULL,
  day_name TEXT,
  total_sales NUMERIC DEFAULT 0.0,
  total_deposits NUMERIC DEFAULT 0.0,
  total_balance NUMERIC DEFAULT 0.0,
  total_cash NUMERIC DEFAULT 0.0,
  total_transfer NUMERIC DEFAULT 0.0,
  total_check NUMERIC DEFAULT 0.0,
  total_expenses NUMERIC DEFAULT 0.0,
  net_amount NUMERIC DEFAULT 0.0,
  status TEXT DEFAULT 'closed',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(advisor_id, closure_date)
);

ALTER TABLE public.pos_advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_daily_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read pos_advisors" ON public.pos_advisors FOR SELECT USING (true);
CREATE POLICY "Public Write pos_advisors" ON public.pos_advisors FOR ALL USING (true);

CREATE POLICY "Public Read pos_customers" ON public.pos_customers FOR SELECT USING (true);
CREATE POLICY "Public Write pos_customers" ON public.pos_customers FOR ALL USING (true);

CREATE POLICY "Public Read pos_orders" ON public.pos_orders FOR SELECT USING (true);
CREATE POLICY "Public Write pos_orders" ON public.pos_orders FOR ALL USING (true);

CREATE POLICY "Public Read pos_order_items" ON public.pos_order_items FOR SELECT USING (true);
CREATE POLICY "Public Write pos_order_items" ON public.pos_order_items FOR ALL USING (true);

CREATE POLICY "Public Read pos_payments" ON public.pos_payments FOR SELECT USING (true);
CREATE POLICY "Public Write pos_payments" ON public.pos_payments FOR ALL USING (true);

CREATE POLICY "Public Read pos_expenses" ON public.pos_expenses FOR SELECT USING (true);
CREATE POLICY "Public Write pos_expenses" ON public.pos_expenses FOR ALL USING (true);

CREATE POLICY "Public Read pos_daily_closures" ON public.pos_daily_closures FOR SELECT USING (true);
CREATE POLICY "Public Write pos_daily_closures" ON public.pos_daily_closures FOR ALL USING (true);


-- ==============================================================================
-- MIGRATION: 20260822010000_weekly_credential_rotation.sql
-- DESCRIPTION: Dynamic weekly credential & PIN rotation for commercial advisors.
-- Rotates every Monday automatically or on demand via SQL function.
-- ==============================================================================

-- 1. Extend pos_advisors table with weekly credentials tracking
ALTER TABLE IF EXISTS public.pos_advisors
  ADD COLUMN IF NOT EXISTS weekly_pin text DEFAULT '1234',
  ADD COLUMN IF NOT EXISTS weekly_password text DEFAULT 'asesora-1234',
  ADD COLUMN IF NOT EXISTS current_week_code text DEFAULT to_char(CURRENT_DATE, 'IYYY-"W"IW'),
  ADD COLUMN IF NOT EXISTS pin_last_rotated_at date DEFAULT (date_trunc('week', CURRENT_DATE)::date);

-- 2. Function to rotate credentials for all active advisors
CREATE OR REPLACE FUNCTION public.rotate_advisor_weekly_credentials(p_force boolean DEFAULT false)
RETURNS TABLE (
  advisor_id text,
  advisor_name text,
  new_weekly_pin text,
  new_weekly_password text,
  week_code text,
  rotated_at date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_week text;
  v_monday date;
BEGIN
  v_current_week := to_char(CURRENT_DATE, 'IYYY-"W"IW');
  v_monday := date_trunc('week', CURRENT_DATE)::date;

  -- Update all active advisors if new week started or force requested
  RETURN QUERY
  UPDATE public.pos_advisors AS a
  SET
    weekly_pin = lpad((floor(random() * 9000 + 1000))::text, 4, '0'),
    weekly_password = lower(regexp_replace(split_part(a.name, ' ', 1), '[^a-zA-Z0-9]', '', 'g')) || '-' || lpad((floor(random() * 9000 + 1000))::text, 4, '0'),
    current_week_code = v_current_week,
    pin_last_rotated_at = v_monday,
    updated_at = now()
  WHERE
    a.is_active = true
    AND (p_force = true OR a.current_week_code IS NULL OR a.current_week_code != v_current_week)
  RETURNING
    a.id AS advisor_id,
    a.name AS advisor_name,
    a.weekly_pin AS new_weekly_pin,
    a.weekly_password AS new_weekly_password,
    a.current_week_code AS week_code,
    a.pin_last_rotated_at AS rotated_at;
END;
$$;

-- 3. View for easy administrative audit of current credentials
CREATE OR REPLACE VIEW public.pos_active_weekly_credentials AS
SELECT
  id,
  name,
  email,
  phone,
  role,
  weekly_pin,
  weekly_password,
  current_week_code,
  pin_last_rotated_at,
  weekly_goal,
  is_active
FROM public.pos_advisors
WHERE is_active = true
ORDER BY name ASC;

-- Grant permissions
GRANT SELECT ON public.pos_active_weekly_credentials TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rotate_advisor_weekly_credentials(boolean) TO authenticated, service_role;

-- 4. Initial seed/update for current week
UPDATE public.pos_advisors
SET
  current_week_code = to_char(CURRENT_DATE, 'IYYY-"W"IW'),
  pin_last_rotated_at = date_trunc('week', CURRENT_DATE)::date
WHERE current_week_code IS NULL;

-- ==============================================================================
-- ROLLBACK REFERENCE:
--
-- DROP VIEW IF EXISTS public.pos_active_weekly_credentials;
-- DROP FUNCTION IF EXISTS public.rotate_advisor_weekly_credentials(boolean);
-- ALTER TABLE public.pos_advisors
--   DROP COLUMN IF EXISTS weekly_pin,
--   DROP COLUMN IF EXISTS weekly_password,
--   DROP COLUMN IF EXISTS current_week_code,
--   DROP COLUMN IF EXISTS pin_last_rotated_at;
-- ==============================================================================


-- ==============================================================================
-- MIGRATION: 20260822020000_pos_shifts_and_multitender.sql
-- DESCRIPTION: Adds tables for cash register shifts (Arqueo de Caja) and
-- multi-tender split payment records with full RLS policies.
-- ==============================================================================

-- 1. CASH REGISTER SHIFTS TABLE (Arqueo y Cierre de Caja)
CREATE TABLE IF NOT EXISTS public.pos_cash_shifts (
  id text PRIMARY KEY,
  advisor_id text REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  shift_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_cash numeric(10,2) NOT NULL DEFAULT 0.00,
  closing_cash numeric(10,2),
  expected_cash numeric(10,2),
  difference numeric(10,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast shift lookups
CREATE INDEX IF NOT EXISTS idx_pos_cash_shifts_date ON public.pos_cash_shifts(shift_date);
CREATE INDEX IF NOT EXISTS idx_pos_cash_shifts_advisor ON public.pos_cash_shifts(advisor_id);

-- Enable RLS
ALTER TABLE public.pos_cash_shifts ENABLE ROW LEVEL SECURITY;

-- Policies for pos_cash_shifts
CREATE POLICY "Public & Authenticated Read Access to Shifts"
  ON public.pos_cash_shifts FOR SELECT USING (true);

CREATE POLICY "Authenticated Staff Full Access to Shifts"
  ON public.pos_cash_shifts FOR ALL
  USING (true)
  WITH CHECK (true);

-- 2. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_cash_shifts TO authenticated, anon;

-- ==============================================================================
-- ROLLBACK REFERENCE:
--
-- DROP TABLE IF EXISTS public.pos_cash_shifts CASCADE;
-- ==============================================================================


-- ==============================================================================
-- MIGRATION: 20260822030000_pos_production_kanban_crm_inventory.sql
-- DESCRIPTION: Expands POS & CRM with Production Kanban stages, Art Proofing,
-- Customer CRM Tags/Notes, Materials Inventory (Bobinas y Sustratos), and Job Costing.
-- ==============================================================================

-- 1. ADD PRODUCTION STAGE & ART PROOFING COLUMNS TO pos_orders
ALTER TABLE public.pos_orders 
  ADD COLUMN IF NOT EXISTS production_stage text NOT NULL DEFAULT 'preprensa',
  ADD COLUMN IF NOT EXISTS art_url text,
  ADD COLUMN IF NOT EXISTS art_preview_url text,
  ADD COLUMN IF NOT EXISTS art_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS art_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS art_approved_by text,
  ADD COLUMN IF NOT EXISTS production_priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS production_notes text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS estimated_material_cost numeric(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS estimated_labor_cost numeric(10,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_pos_orders_production_stage ON public.pos_orders(production_stage);
CREATE INDEX IF NOT EXISTS idx_pos_orders_priority ON public.pos_orders(production_priority);
CREATE INDEX IF NOT EXISTS idx_pos_orders_delivery_date ON public.pos_orders(delivery_date);

-- 2. EXPAND pos_customers FOR CRM 360
ALTER TABLE public.pos_customers
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS credit_limit numeric(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS credit_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent numeric(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS order_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_date date,
  ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false;

-- 3. CREATE MATERIALS INVENTORY TABLE (Control de Bobinas, Sustratos e Insumos)
CREATE TABLE IF NOT EXISTS public.pos_materials_inventory (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL, -- 'lona', 'vinil', 'rigido', 'tinta', 'accesorio'
  unit text NOT NULL DEFAULT 'm2', -- 'm2', 'ml', 'unid', 'litro'
  current_stock numeric(10,2) NOT NULL DEFAULT 0.00,
  min_stock_alert numeric(10,2) NOT NULL DEFAULT 5.00,
  width_m numeric(5,2), -- ej. 3.20m, 1.52m, 1.07m
  length_m numeric(6,2), -- ej. 50m
  cost_per_unit numeric(10,2) NOT NULL DEFAULT 0.00,
  supplier_name text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. CREATE MATERIAL USAGE LOGS TABLE
CREATE TABLE IF NOT EXISTS public.pos_material_usage_logs (
  id text PRIMARY KEY,
  material_id text REFERENCES public.pos_materials_inventory(id) ON DELETE CASCADE,
  order_id text REFERENCES public.pos_orders(id) ON DELETE SET NULL,
  quantity_used numeric(10,2) NOT NULL,
  cost_applied numeric(10,2) NOT NULL DEFAULT 0.00,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_materials_category ON public.pos_materials_inventory(category);
CREATE INDEX IF NOT EXISTS idx_pos_material_usage_order ON public.pos_material_usage_logs(order_id);

-- Enable RLS
ALTER TABLE public.pos_materials_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_material_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Public & Authenticated Read Access to Materials"
  ON public.pos_materials_inventory FOR SELECT USING (true);

CREATE POLICY "Full Access to Materials"
  ON public.pos_materials_inventory FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Public & Authenticated Read Access to Material Usage"
  ON public.pos_material_usage_logs FOR SELECT USING (true);

CREATE POLICY "Full Access to Material Usage"
  ON public.pos_material_usage_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_materials_inventory TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_material_usage_logs TO authenticated, anon;

-- Seed default initial substrate materials if empty
INSERT INTO public.pos_materials_inventory (id, name, category, unit, current_stock, min_stock_alert, width_m, length_m, cost_per_unit, supplier_name)
VALUES
  ('mat-lona-front-13', 'Lona Frontlit 13oz 3.20m', 'lona', 'm2', 250.00, 20.00, 3.20, 50.00, 1.25, 'Importadora Gráfica'),
  ('mat-lona-front-10', 'Lona Frontlit 10oz Económica 3.20m', 'lona', 'm2', 180.00, 15.00, 3.20, 50.00, 0.95, 'Importadora Gráfica'),
  ('mat-lona-mesh', 'Lona Mesh Microperforada con Liner 3.20m', 'lona', 'm2', 90.00, 10.00, 3.20, 50.00, 1.80, 'Suministros Visuales'),
  ('mat-lona-backlit', 'Lona Backlit para Rótulos Luminosos 3.20m', 'lona', 'm2', 120.00, 15.00, 3.20, 50.00, 2.10, 'Suministros Visuales'),
  ('mat-vinil-brillo', 'Vinil Adhesivo Blanco Brillante 1.52m', 'vinil', 'm2', 150.00, 15.00, 1.52, 50.00, 1.10, 'Avery / Ritrama'),
  ('mat-vinil-mate', 'Vinil Adhesivo Blanco Mate 1.52m', 'vinil', 'm2', 120.00, 15.00, 1.52, 50.00, 1.15, 'Avery / Ritrama'),
  ('mat-vinil-micro', 'Vinil Microperforado para Vidrios 1.52m', 'vinil', 'm2', 85.00, 10.00, 1.52, 50.00, 2.20, 'Suministros Visuales'),
  ('mat-vinil-trans', 'Vinil Transparente Brillante 1.52m', 'vinil', 'm2', 60.00, 10.00, 1.52, 50.00, 1.30, 'Ritrama'),
  ('mat-lam-frio', 'Laminado en Frío Mate/Brillo 1.52m', 'vinil', 'm2', 110.00, 15.00, 1.52, 50.00, 0.85, 'Avery'),
  ('mat-sintra-3mm', 'Plancha Sintra / PVC Espumado 3mm (1.22x2.44m)', 'rigido', 'm2', 45.00, 8.00, 1.22, 2.44, 4.50, 'Plásticos Industriales'),
  ('mat-acrilico-3mm', 'Plancha Acrílico Cristal 3mm (1.22x2.44m)', 'rigido', 'm2', 25.00, 5.00, 1.22, 2.44, 9.50, 'Acrílicos Ecuador'),
  ('mat-ojales-peq', 'Ojales Niquelados Pequeños #3', 'accesorio', 'unid', 2500.00, 200.00, NULL, NULL, 0.04, 'Ferretería Industrial'),
  ('mat-ojales-gran', 'Ojales Reforzados Grandes #5', 'accesorio', 'unid', 1800.00, 150.00, NULL, NULL, 0.07, 'Ferretería Industrial')
ON CONFLICT (id) DO NOTHING;


-- ==============================================================================
-- GIGAPRINT POS & CRM - FASE 1 & 2: CATALOGO UNIFICADO, CRM LOGS, TRACKING & PROVEEDORES
-- Migracion: 20260822160000_crm_products_tracking.sql
-- ==============================================================================

-- 1. TABLA DE CATALOGO DE PRODUCTOS UNIFICADO (pos_products)
CREATE TABLE IF NOT EXISTS public.pos_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  advisor_id UUID REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'call', 'whatsapp', 'visit', 'email', 'note', 'proof_sent', 'proof_approved', 'payment_reminder'
  title TEXT,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA DE PROVEEDORES (pos_suppliers)
CREATE TABLE IF NOT EXISTS public.pos_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    ALTER TABLE public.pos_orders ADD COLUMN tracking_token UUID NOT NULL DEFAULT gen_random_uuid();
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID REFERENCES public.pos_advisors(id) ON DELETE CASCADE,
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


-- ==============================================================================
-- GIGAPRINT POS & CRM - FASE 1 & 2: CATALOGO UNIFICADO, CRM LOGS, TRACKING & PROVEEDORES
-- Migracion: 20260822160000_crm_products_tracking.sql
-- ==============================================================================

-- 1. TABLA DE CATALOGO DE PRODUCTOS UNIFICADO (pos_products)
CREATE TABLE IF NOT EXISTS public.pos_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  advisor_id UUID REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'call', 'whatsapp', 'visit', 'email', 'note', 'proof_sent', 'proof_approved', 'payment_reminder'
  title TEXT,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABLA DE PROVEEDORES (pos_suppliers)
CREATE TABLE IF NOT EXISTS public.pos_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    ALTER TABLE public.pos_orders ADD COLUMN tracking_token UUID NOT NULL DEFAULT gen_random_uuid();
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id UUID REFERENCES public.pos_advisors(id) ON DELETE CASCADE,
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

-- 8. TALLER MULTI-ROL Y ESTACIONES DE PRODUCCION
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'assigned_area') THEN
    ALTER TABLE public.pos_orders ADD COLUMN assigned_area TEXT DEFAULT 'impresion';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'execution_date') THEN
    ALTER TABLE public.pos_orders ADD COLUMN execution_date DATE DEFAULT CURRENT_DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'installation_date') THEN
    ALTER TABLE public.pos_orders ADD COLUMN installation_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'requires_installation') THEN
    ALTER TABLE public.pos_orders ADD COLUMN requires_installation BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'installation_address') THEN
    ALTER TABLE public.pos_orders ADD COLUMN installation_address TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'installation_maps_url') THEN
    ALTER TABLE public.pos_orders ADD COLUMN installation_maps_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'installation_latitude') THEN
    ALTER TABLE public.pos_orders ADD COLUMN installation_latitude NUMERIC(9, 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'installation_longitude') THEN
    ALTER TABLE public.pos_orders ADD COLUMN installation_longitude NUMERIC(9, 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'field_measurements_notes') THEN
    ALTER TABLE public.pos_orders ADD COLUMN field_measurements_notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'vector_url') THEN
    ALTER TABLE public.pos_orders ADD COLUMN vector_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'machine_assigned') THEN
    ALTER TABLE public.pos_orders ADD COLUMN machine_assigned TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'technician_assigned') THEN
    ALTER TABLE public.pos_orders ADD COLUMN technician_assigned TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'station_stage') THEN
    ALTER TABLE public.pos_orders ADD COLUMN station_stage TEXT DEFAULT 'pendiente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pos_orders' AND column_name = 'technical_specs') THEN
    ALTER TABLE public.pos_orders ADD COLUMN technical_specs JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pos_workstations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  machine_model TEXT,
  technician_name TEXT,
  status TEXT DEFAULT 'activo',
  max_width_cm NUMERIC,
  capabilities JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_workstations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lectura y escritura publica de workstations" ON public.pos_workstations FOR ALL USING (true);
