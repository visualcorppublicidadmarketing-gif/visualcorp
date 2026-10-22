-- Operational modules: recipes, quality, returns, maintenance, field service and automation.

CREATE TABLE IF NOT EXISTS public.pos_product_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id TEXT NOT NULL,
  name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  materials JSONB NOT NULL DEFAULT '[]', operations JSONB NOT NULL DEFAULT '[]',
  expected_minutes INTEGER NOT NULL DEFAULT 0, waste_percent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_product_recipes_product ON public.pos_product_recipes(product_id, is_active);

CREATE TABLE IF NOT EXISTS public.pos_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id TEXT NOT NULL, operation_id TEXT,
  title TEXT NOT NULL DEFAULT 'Control de calidad', status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','passed','failed','rework')),
  checklist JSONB NOT NULL DEFAULT '[]', notes TEXT, inspected_by TEXT,
  inspected_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_quality_checks_order ON public.pos_quality_checks(order_id, status);

CREATE TABLE IF NOT EXISTS public.pos_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id TEXT NOT NULL, customer_id TEXT,
  title TEXT NOT NULL, reason TEXT, resolution TEXT, status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','approved','rejected','resolved')),
  estimated_cost NUMERIC NOT NULL DEFAULT 0, actual_cost NUMERIC NOT NULL DEFAULT 0,
  owner_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_returns_status ON public.pos_returns(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pos_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, asset_type TEXT NOT NULL,
  serial_number TEXT, area TEXT, status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','in_use','maintenance','out_of_service')),
  purchase_date DATE, next_maintenance_at DATE, metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_maintenance_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), asset_id UUID REFERENCES public.pos_assets(id) ON DELETE SET NULL,
  title TEXT NOT NULL, notes TEXT, priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','scheduled','in_progress','completed','cancelled')),
  assigned_to TEXT, scheduled_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  estimated_cost NUMERIC NOT NULL DEFAULT 0, actual_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_maintenance_status ON public.pos_maintenance_orders(status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.pos_field_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id TEXT NOT NULL, title TEXT NOT NULL,
  visit_type TEXT NOT NULL DEFAULT 'installation', status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','confirmed','en_route','on_site','completed','cancelled')),
  scheduled_start TIMESTAMPTZ, scheduled_end TIMESTAMPTZ, assigned_team JSONB NOT NULL DEFAULT '[]',
  address TEXT, maps_url TEXT, checklist JSONB NOT NULL DEFAULT '[]', evidence JSONB NOT NULL DEFAULT '[]',
  customer_signature TEXT, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_field_visits_schedule ON public.pos_field_visits(scheduled_start, status);

CREATE TABLE IF NOT EXISTS public.pos_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, trigger_event TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}', actions JSONB NOT NULL DEFAULT '[]', is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.pos_automation_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), rule_id UUID REFERENCES public.pos_automation_rules(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ, last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['pos_product_recipes','pos_quality_checks','pos_returns','pos_assets','pos_maintenance_orders','pos_field_visits','pos_automation_rules','pos_automation_outbox'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin manages %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admin manages %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- Useful defaults; administrators can edit or disable them later.
INSERT INTO public.pos_automation_rules(name, trigger_event, actions)
SELECT 'Avisar al iniciar producción', 'operation.started', '[{"type":"notify","audience":"coordinator"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.pos_automation_rules WHERE trigger_event = 'operation.started');
INSERT INTO public.pos_automation_rules(name, trigger_event, actions)
SELECT 'Avisar cuando el trabajo esté listo', 'order.ready', '[{"type":"whatsapp","audience":"customer"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.pos_automation_rules WHERE trigger_event = 'order.ready');
INSERT INTO public.pos_automation_rules(name, trigger_event, actions)
SELECT 'Escalar trabajo atrasado', 'order.overdue', '[{"type":"notify","audience":"manager"}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.pos_automation_rules WHERE trigger_event = 'order.overdue');
