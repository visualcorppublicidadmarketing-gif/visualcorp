-- ============================================================================
-- GIGAPRINT - UNIFIED POS & CRM DATABASE SCHEMA V3.0 (COMPREHENSIVE)
-- Multi-terminal Cashier, Kanban, Purchasing, Inventory, Financial Telemetry & SRI
-- ============================================================================

-- 1. ADVISORS & CASHIERS
CREATE TABLE IF NOT EXISTS public.pos_advisors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT DEFAULT 'asesora', -- 'super_admin', 'admin', 'cajera', 'asesora', 'taller'
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  weekly_goal NUMERIC(10,2) DEFAULT 3200.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CUSTOMERS CRM
CREATE TABLE IF NOT EXISTS public.pos_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identification TEXT,
  phone TEXT,
  email TEXT,
  company_name TEXT,
  city TEXT DEFAULT 'Quito',
  address TEXT,
  is_vip BOOLEAN DEFAULT FALSE,
  credit_limit NUMERIC(10,2) DEFAULT 0.00,
  credit_days INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT ARRAY['General'],
  notes TEXT,
  total_spent NUMERIC(10,2) DEFAULT 0.00,
  orders_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCT CATALOG
CREATE TABLE IF NOT EXISTS public.pos_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT DEFAULT 'Gran Formato',
  parent_category TEXT DEFAULT 'Gran Formato',
  calc_type TEXT DEFAULT 'area', -- 'area' (m2), 'unit', 'volume', 'fixed'
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  min_price NUMERIC(10,2) DEFAULT 0.00,
  unit TEXT DEFAULT 'm2',
  lead_time_days INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. POS ORDERS
CREATE TABLE IF NOT EXISTS public.pos_orders (
  id TEXT PRIMARY KEY,
  tracking_token TEXT UNIQUE,
  order_number TEXT UNIQUE NOT NULL,
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES public.pos_customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_identification TEXT,
  customer_phone TEXT,
  job_name TEXT NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  delivery_date DATE,
  pickup_location TEXT DEFAULT 'Matriz Gigaprint - Av. de la Prensa y Vaca de Castro, Quito',
  production_priority TEXT DEFAULT 'normal', -- 'normal', 'urgent', 'scheduled'
  production_stage TEXT DEFAULT 'preprensa', -- 'preprensa', 'aprobado_arte', 'impresion', 'acabados', 'control_calidad', 'listo', 'entregado', 'cancelado'
  production_notes TEXT,
  art_url TEXT,
  art_approved BOOLEAN DEFAULT FALSE,
  art_approved_by TEXT,
  art_approved_at TIMESTAMPTZ,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_percent NUMERIC(5,2) DEFAULT 0.00,
  discount_amount NUMERIC(10,2) DEFAULT 0.00,
  discount_reason TEXT,
  tax_rate NUMERIC(5,2) DEFAULT 0.00,
  tax_amount NUMERIC(10,2) DEFAULT 0.00,
  shipping_cost NUMERIC(10,2) DEFAULT 0.00,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  deposit_amount NUMERIC(10,2) DEFAULT 0.00,
  balance_due NUMERIC(10,2) DEFAULT 0.00,
  payment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'paid'
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  stage_history JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.pos_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  category TEXT,
  width_cm NUMERIC(8,2) DEFAULT 0,
  height_cm NUMERIC(8,2) DEFAULT 0,
  area_m2 NUMERIC(8,4) DEFAULT 0,
  quantity NUMERIC(8,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  finishing_type TEXT DEFAULT 'none',
  finishing_cost NUMERIC(10,2) DEFAULT 0.00,
  eyelet_count INTEGER DEFAULT 0,
  item_notes TEXT,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POS PAYMENTS
CREATE TABLE IF NOT EXISTS public.pos_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payment_method TEXT NOT NULL DEFAULT 'cash', -- 'cash', 'transfer', 'card', 'check', 'credit'
  bank_name TEXT,
  reference_number TEXT,
  notes TEXT,
  payment_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. CASH SHIFTS (ARQUEOS Y TURNOS)
CREATE TABLE IF NOT EXISTS public.pos_cash_shifts (
  id TEXT PRIMARY KEY,
  advisor_id TEXT NOT NULL REFERENCES public.pos_advisors(id) ON DELETE CASCADE,
  shift_date DATE DEFAULT CURRENT_DATE,
  opening_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  closing_cash NUMERIC(10,2),
  expected_cash NUMERIC(10,2),
  difference NUMERIC(10,2),
  status TEXT DEFAULT 'open', -- 'open', 'closed'
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EXPENSES (GASTOS DE CAJA CHICA)
CREATE TABLE IF NOT EXISTS public.pos_expenses (
  id TEXT PRIMARY KEY,
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'General', -- 'Suministros', 'Transporte', 'Alimentación', 'Mantenimiento', 'General'
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. INVENTORY MATERIALS & RAW SUBSTRATES
CREATE TABLE IF NOT EXISTS public.pos_materials_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT DEFAULT 'Sustratos',
  unit TEXT DEFAULT 'm2',
  current_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  min_stock_alert NUMERIC(10,2) DEFAULT 50.00,
  cost_per_unit NUMERIC(10,2) DEFAULT 0.00,
  supplier_name TEXT,
  supplier_contact TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. MATERIAL USAGE LOGS (KARDEX)
CREATE TABLE IF NOT EXISTS public.pos_material_usage_logs (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES public.pos_materials_inventory(id) ON DELETE CASCADE,
  order_id TEXT REFERENCES public.pos_orders(id) ON DELETE SET NULL,
  quantity_used NUMERIC(10,2) NOT NULL,
  cost_applied NUMERIC(10,2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. SUPPLIERS
CREATE TABLE IF NOT EXISTS public.pos_suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  identification TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  category TEXT DEFAULT 'Sustratos y Tintas',
  terms TEXT DEFAULT 'Contado',
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PURCHASE ORDERS (ÓRDENES DE COMPRA A PROVEEDORES)
CREATE TABLE IF NOT EXISTS public.pos_purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id TEXT REFERENCES public.pos_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  supplier_phone TEXT,
  supplier_email TEXT,
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  status TEXT DEFAULT 'pending', -- 'draft', 'pending', 'received', 'cancelled'
  items JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(10,2) DEFAULT 0.00,
  notes TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. PARKED SALES
CREATE TABLE IF NOT EXISTS public.pos_parked_sales (
  id TEXT PRIMARY KEY,
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  cart_data JSONB NOT NULL,
  total_amount NUMERIC(10,2) DEFAULT 0.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. CUSTOMER ACTIVITY LOGS (CRM BITÁCORA)
CREATE TABLE IF NOT EXISTS public.pos_customer_activity_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES public.pos_customers(id) ON DELETE CASCADE,
  activity_type TEXT DEFAULT 'whatsapp', -- 'call', 'whatsapp', 'email', 'meeting', 'note'
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. BLIND CASH AUDITS (ARQUEO CIEGO Y DESGLOSE)
CREATE TABLE IF NOT EXISTS public.pos_cash_audits (
  id TEXT PRIMARY KEY,
  date DATE DEFAULT CURRENT_DATE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  advisor_id TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  advisor_name TEXT,
  shift_id TEXT REFERENCES public.pos_cash_shifts(id) ON DELETE SET NULL,
  denominations JSONB DEFAULT '{}'::jsonb,
  total_declared NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  expected_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discrepancy NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  is_balanced BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'balanced',
  notes TEXT
);

-- ============================================================================
-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
-- ============================================================================
ALTER TABLE public.pos_materials_inventory ADD COLUMN IF NOT EXISTS sku TEXT;
CREATE INDEX IF NOT EXISTS idx_pos_orders_customer_id ON public.pos_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_advisor_id ON public.pos_orders(advisor_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_order_number ON public.pos_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_pos_orders_tracking_token ON public.pos_orders(tracking_token);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON public.pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created_at ON public.pos_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_order_items_order_id ON public.pos_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_order_id ON public.pos_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_advisor_id ON public.pos_payments(advisor_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_created_at ON public.pos_payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_cash_shifts_advisor_id ON public.pos_cash_shifts(advisor_id);
CREATE INDEX IF NOT EXISTS idx_pos_materials_inventory_sku ON public.pos_materials_inventory(sku);
CREATE INDEX IF NOT EXISTS idx_pos_purchase_orders_supplier ON public.pos_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pos_customer_logs_cust_id ON public.pos_customer_activity_logs(customer_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.pos_advisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_cash_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_materials_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_material_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_parked_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_customer_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_cash_audits ENABLE ROW LEVEL SECURITY;

-- Políticas idempotentes. La compatibilidad anónima se conserva mientras las
-- terminales POS migran de PIN local a Supabase Auth individual.
DROP POLICY IF EXISTS "Public Read Products" ON public.pos_products;
CREATE POLICY "Public Read Products" ON public.pos_products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public Read Order Tracking" ON public.pos_orders;
CREATE POLICY "Public Read Order Tracking" ON public.pos_orders FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public Read Order Tracking Items" ON public.pos_order_items;
CREATE POLICY "Public Read Order Tracking Items" ON public.pos_order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "POS Full Access Advisors" ON public.pos_advisors;
CREATE POLICY "POS Full Access Advisors" ON public.pos_advisors FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Customers" ON public.pos_customers;
CREATE POLICY "POS Full Access Customers" ON public.pos_customers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Products" ON public.pos_products;
CREATE POLICY "POS Full Access Products" ON public.pos_products FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Orders" ON public.pos_orders;
CREATE POLICY "POS Full Access Orders" ON public.pos_orders FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Items" ON public.pos_order_items;
CREATE POLICY "POS Full Access Items" ON public.pos_order_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Payments" ON public.pos_payments;
CREATE POLICY "POS Full Access Payments" ON public.pos_payments FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Shifts" ON public.pos_cash_shifts;
CREATE POLICY "POS Full Access Shifts" ON public.pos_cash_shifts FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Expenses" ON public.pos_expenses;
CREATE POLICY "POS Full Access Expenses" ON public.pos_expenses FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Materials" ON public.pos_materials_inventory;
CREATE POLICY "POS Full Access Materials" ON public.pos_materials_inventory FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Material Logs" ON public.pos_material_usage_logs;
CREATE POLICY "POS Full Access Material Logs" ON public.pos_material_usage_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Suppliers" ON public.pos_suppliers;
CREATE POLICY "POS Full Access Suppliers" ON public.pos_suppliers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Purchase Orders" ON public.pos_purchase_orders;
CREATE POLICY "POS Full Access Purchase Orders" ON public.pos_purchase_orders FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Parked Sales" ON public.pos_parked_sales;
CREATE POLICY "POS Full Access Parked Sales" ON public.pos_parked_sales FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Customer Logs" ON public.pos_customer_activity_logs;
CREATE POLICY "POS Full Access Customer Logs" ON public.pos_customer_activity_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "POS Full Access Cash Audits" ON public.pos_cash_audits;
CREATE POLICY "POS Full Access Cash Audits" ON public.pos_cash_audits FOR ALL USING (true) WITH CHECK (true);
