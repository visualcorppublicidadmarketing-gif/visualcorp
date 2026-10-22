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
