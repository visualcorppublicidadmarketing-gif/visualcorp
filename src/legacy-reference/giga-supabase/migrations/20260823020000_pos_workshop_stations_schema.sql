-- =============================================================================
-- GIGAPRINT WORKSHOP PRODUCTION & MULTI-ROLE SCHEMA EXTENSION
-- Migration: 20260823020000_pos_workshop_stations_schema.sql
-- =============================================================================

-- 1. EXTENDER TABLA pos_orders CON METADATOS DE TALLER Y MONTAJE
ALTER TABLE IF EXISTS public.pos_orders
  ADD COLUMN IF NOT EXISTS assigned_area TEXT DEFAULT 'impresion', -- 'impresion', 'sublimacion', 'corte_laser', 'acabados', 'instalacion', 'mixto'
  ADD COLUMN IF NOT EXISTS execution_date DATE,
  ADD COLUMN IF NOT EXISTS installation_date DATE,
  ADD COLUMN IF NOT EXISTS requires_installation BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS installation_address TEXT,
  ADD COLUMN IF NOT EXISTS field_measurements_notes TEXT,
  ADD COLUMN IF NOT EXISTS vector_url TEXT,
  ADD COLUMN IF NOT EXISTS machine_assigned TEXT,
  ADD COLUMN IF NOT EXISTS technician_assigned TEXT,
  ADD COLUMN IF NOT EXISTS station_stage TEXT DEFAULT 'pendiente', -- 'pendiente', 'en_maquina', 'en_secado', 'armado', 'aprobado_qc'
  ADD COLUMN IF NOT EXISTS technical_specs JSONB DEFAULT '{}'::jsonb;

-- 2. EXTENDER TABLA pos_order_items CON DETALLES DE ESTACIÓN DE TRABAJO
ALTER TABLE IF EXISTS public.pos_order_items
  ADD COLUMN IF NOT EXISTS workstation TEXT DEFAULT 'impresion',
  ADD COLUMN IF NOT EXISTS linear_meters NUMERIC(8,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS rip_profile TEXT,
  ADD COLUMN IF NOT EXISTS thermal_temp_c INTEGER,
  ADD COLUMN IF NOT EXISTS thermal_time_sec INTEGER,
  ADD COLUMN IF NOT EXISTS laser_power_pct INTEGER,
  ADD COLUMN IF NOT EXISTS laser_speed_mms INTEGER,
  ADD COLUMN IF NOT EXISTS garment_size TEXT,
  ADD COLUMN IF NOT EXISTS garment_color TEXT,
  ADD COLUMN IF NOT EXISTS item_status TEXT DEFAULT 'pending';

-- 3. TABLA DE MÁQUINAS Y ESTACIONES DE TALLER
CREATE TABLE IF NOT EXISTS public.pos_workstations (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  area TEXT NOT NULL, -- 'impresion', 'sublimacion', 'corte_laser', 'acabados'
  model TEXT,
  max_width_m NUMERIC(5,2),
  status TEXT DEFAULT 'active', -- 'active', 'maintenance', 'offline'
  current_operator_id TEXT,
  last_maintenance_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en pos_workstations
ALTER TABLE public.pos_workstations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública/equipo de estaciones"
  ON public.pos_workstations FOR SELECT
  USING (true);

CREATE POLICY "Admin y Coordinador gestionan estaciones"
  ON public.pos_workstations FOR ALL
  USING (
    auth.role() = 'authenticated'
  );

-- 4. INSERTAR ESTACIONES PREDEFINIDAS
INSERT INTO public.pos_workstations (id, code, name, area, model, max_width_m, status, notes)
VALUES
  ('ws-flora-320', 'FLORA-01', 'Plotter Flora Solvente 3.20m', 'impresion', 'Flora LJ-320P', 3.20, 'active', 'Cabezales Konica 512i alta velocidad para lonas.'),
  ('ws-roland-160', 'ROLAND-01', 'Plotter Roland TrueVIS 1.60m', 'impresion', 'TrueVIS VG3-640', 1.60, 'active', 'Tinta eco-solvente para viniles y adhesivos.'),
  ('ws-prensa-dtf', 'DTF-01', 'Plotter Textil DTF 60cm', 'sublimacion', 'DTF Pro 60', 0.60, 'active', 'Impresión y poliamida para prendas textiles.'),
  ('ws-plancha-neum', 'HEAT-01', 'Plancha Térmica Neumática 40x60', 'sublimacion', 'HeatPress Auto 4060', 0.60, 'active', 'Planchado de camisetas y almohadas a 180°C-200°C.'),
  ('ws-laser-co2', 'LASER-01', 'Cortadora Láser CO2 130W 130x90', 'corte_laser', 'RedSail 1390 CO2', 1.30, 'active', 'Corte y grabado de acrílico, MDF y Sintra.'),
  ('ws-router-cnc', 'CNC-01', 'Ruteadora CNC 1.30x2.50m', 'corte_laser', 'CNC HeavyDuty 1325', 1.30, 'active', 'Corte de PVC espumado, Alucobond y madera.')
ON CONFLICT (id) DO NOTHING;
