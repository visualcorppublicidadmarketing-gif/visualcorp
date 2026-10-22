-- Gigaprint POS: motor de rutas, operaciones, responsables y capacidad.

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS involved_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'planned';

ALTER TABLE public.pos_advisors
  ADD COLUMN IF NOT EXISTS assigned_area TEXT,
  ADD COLUMN IF NOT EXISTS daily_capacity_minutes INTEGER NOT NULL DEFAULT 480;

ALTER TABLE public.pos_payments
  ADD COLUMN IF NOT EXISTS tendered_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS change_given NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pos_production_operations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  order_item_id TEXT REFERENCES public.pos_order_items(id) ON DELETE SET NULL,
  area TEXT NOT NULL CHECK (area IN ('asesoria', 'diseno', 'aprobacion', 'impresion', 'corte_laser', 'sublimacion', 'taller', 'calidad', 'entrega')),
  title TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  depends_on JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked', 'ready', 'in_progress', 'review', 'done', 'cancelled')),
  assigned_to TEXT REFERENCES public.pos_advisors(id) ON DELETE SET NULL,
  workstation_id TEXT REFERENCES public.pos_workstations(id) ON DELETE SET NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_minutes > 0),
  actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK (actual_minutes >= 0),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_operation_schedule_valid CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_pos_operations_order ON public.pos_production_operations(order_id, sequence);
CREATE INDEX IF NOT EXISTS idx_pos_operations_area_status ON public.pos_production_operations(area, status);
CREATE INDEX IF NOT EXISTS idx_pos_operations_assignee ON public.pos_production_operations(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_pos_operations_schedule ON public.pos_production_operations(scheduled_start, scheduled_end);

ALTER TABLE public.pos_production_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "POS Operations Read" ON public.pos_production_operations;
DROP POLICY IF EXISTS "POS Operations Staff Write" ON public.pos_production_operations;

CREATE POLICY "POS Operations Read"
  ON public.pos_production_operations FOR SELECT
  USING (true);

-- Compatibilidad temporal con las terminales POS que usan PIN local. Debe
-- reemplazarse por Supabase Auth individual antes de exponer el POS en Internet.
CREATE POLICY "POS Operations Staff Write"
  ON public.pos_production_operations FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.pos_refresh_operation_readiness(target_order_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pos_production_operations AS operation
  SET status = CASE
    WHEN operation.status IN ('done', 'in_progress', 'cancelled') THEN operation.status
    WHEN NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(operation.depends_on) AS dependency(id)
      LEFT JOIN public.pos_production_operations prerequisite ON prerequisite.id = dependency.id
      WHERE prerequisite.status IS DISTINCT FROM 'done'
    ) THEN 'ready'
    ELSE 'blocked'
  END,
  updated_at = NOW()
  WHERE operation.order_id = target_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_operation_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.pos_refresh_operation_readiness(NEW.order_id);
  END IF;

  UPDATE public.pos_orders
  SET workflow_status = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.pos_production_operations
      WHERE order_id = NEW.order_id AND status NOT IN ('done', 'cancelled')
    ) THEN 'completed'
    WHEN EXISTS (
      SELECT 1 FROM public.pos_production_operations
      WHERE order_id = NEW.order_id AND status = 'in_progress'
    ) THEN 'in_progress'
    ELSE 'planned'
  END,
  updated_at = NOW()
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_operation_after_change ON public.pos_production_operations;
CREATE TRIGGER trg_pos_operation_after_change
AFTER INSERT OR UPDATE OF status ON public.pos_production_operations
FOR EACH ROW EXECUTE FUNCTION public.pos_operation_after_change();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_production_operations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.pos_production_operations IS
  'Operaciones encadenadas generadas por cada venta: diseño, aprobación, producción, taller, calidad y entrega.';
