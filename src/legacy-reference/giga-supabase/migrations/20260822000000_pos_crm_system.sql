-- ========================================================================
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
