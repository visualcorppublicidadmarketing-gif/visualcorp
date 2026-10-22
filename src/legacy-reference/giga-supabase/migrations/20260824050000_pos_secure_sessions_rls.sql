-- Secure POS access for PIN-based staff and Supabase-authenticated administrators.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.pos_advisors
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

UPDATE public.pos_advisors
SET pin_hash = extensions.crypt(COALESCE(NULLIF(weekly_pin, ''), NULLIF(pin, ''), encode(extensions.gen_random_bytes(6), 'hex')), extensions.gen_salt('bf')),
    pin_changed_at = COALESCE(pin_changed_at, NOW())
WHERE pin_hash IS NULL;

-- Raw credentials are no longer distributed through table reads.
UPDATE public.pos_advisors
SET pin = 'locked', weekly_pin = 'locked', weekly_password = NULL
WHERE pin_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pos_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id TEXT NOT NULL REFERENCES public.pos_advisors(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_hint TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_access_sessions_active
  ON public.pos_access_sessions(token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pos_auth_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advisor_id TEXT,
  device_id TEXT,
  succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_auth_attempts_rate
  ON public.pos_auth_attempts(advisor_id, device_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.pos_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id TEXT,
  actor_name TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_audit_entity ON public.pos_audit_log(entity_table, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_audit_actor ON public.pos_audit_log(actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.pos_is_manager_role(p_role TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_role, '') IN ('super_admin', 'admin', 'encargado_local', 'coordinador_taller');
$$;

CREATE OR REPLACE FUNCTION public.pos_team_directory()
RETURNS TABLE (
  id TEXT, name TEXT, email TEXT, phone TEXT, role TEXT, assigned_area TEXT,
  weekly_goal NUMERIC, is_active BOOLEAN, can_open_cash BOOLEAN,
  has_sales_goal BOOLEAN, workspace_type TEXT, daily_capacity_minutes INTEGER
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.name, a.email, a.phone, a.role, a.assigned_area,
    CASE WHEN a.has_sales_goal THEN a.weekly_goal ELSE 0 END,
    a.is_active, a.can_open_cash, a.has_sales_goal, a.workspace_type,
    a.daily_capacity_minutes
  FROM public.pos_advisors a
  WHERE a.is_active = TRUE
  ORDER BY a.name;
$$;

CREATE OR REPLACE FUNCTION public.pos_login_with_pin(
  p_advisor_id TEXT,
  p_pin TEXT,
  p_device_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  access_token TEXT, session_expires_at TIMESTAMPTZ, advisor_id TEXT,
  advisor_name TEXT, advisor_email TEXT, advisor_role TEXT,
  assigned_area TEXT, can_open_cash BOOLEAN, has_sales_goal BOOLEAN,
  workspace_type TEXT, weekly_goal NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_advisor public.pos_advisors%ROWTYPE;
  v_token TEXT;
  v_failed INTEGER;
BEGIN
  SELECT count(*) INTO v_failed
  FROM public.pos_auth_attempts attempt
  WHERE attempt.advisor_id = p_advisor_id
    AND COALESCE(attempt.device_id, '') = COALESCE(p_device_id, '')
    AND attempt.succeeded = FALSE
    AND attempt.attempted_at > NOW() - INTERVAL '15 minutes';

  IF v_failed >= 8 THEN
    RAISE EXCEPTION 'Demasiados intentos. Espera 15 minutos o solicita desbloqueo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_advisor
  FROM public.pos_advisors
  WHERE id = p_advisor_id AND is_active = TRUE;

  IF v_advisor.id IS NULL OR v_advisor.locked_until > NOW()
     OR v_advisor.pin_hash IS NULL
     OR extensions.crypt(trim(p_pin), v_advisor.pin_hash) <> v_advisor.pin_hash THEN
    INSERT INTO public.pos_auth_attempts(advisor_id, device_id, succeeded)
    VALUES (p_advisor_id, p_device_id, FALSE);
    UPDATE public.pos_advisors
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count + 1 >= 8 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
    WHERE id = p_advisor_id;
    RAISE EXCEPTION 'PIN incorrecto.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.pos_auth_attempts(advisor_id, device_id, succeeded)
  VALUES (p_advisor_id, p_device_id, TRUE);
  UPDATE public.pos_advisors SET failed_login_count = 0, locked_until = NULL WHERE id = p_advisor_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.pos_access_sessions(advisor_id, token_hash, device_id, expires_at)
  VALUES (v_advisor.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_device_id, NOW() + INTERVAL '12 hours');

  RETURN QUERY SELECT v_token, NOW() + INTERVAL '12 hours', v_advisor.id,
    v_advisor.name, v_advisor.email, v_advisor.role, v_advisor.assigned_area,
    v_advisor.can_open_cash, v_advisor.has_sales_goal, v_advisor.workspace_type,
    CASE WHEN v_advisor.has_sales_goal THEN v_advisor.weekly_goal ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_resolve_session(p_token TEXT)
RETURNS TABLE(advisor_id TEXT, advisor_name TEXT, advisor_role TEXT, assigned_area TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RETURN; END IF;
  RETURN QUERY
  UPDATE public.pos_access_sessions s
  SET last_seen_at = NOW()
  FROM public.pos_advisors a
  WHERE s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    AND s.advisor_id = a.id AND s.revoked_at IS NULL AND s.expires_at > NOW() AND a.is_active = TRUE
  RETURNING a.id, a.name, a.role, a.assigned_area;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_logout(p_token TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  UPDATE public.pos_access_sessions SET revoked_at = NOW()
  WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND revoked_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_fetch_store(p_token TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_actor RECORD;
BEGIN
  IF public.is_admin() THEN
    SELECT 'auth-admin'::TEXT AS advisor_id, 'Administrador'::TEXT AS advisor_name,
      'super_admin'::TEXT AS advisor_role, 'gerencia'::TEXT AS assigned_area INTO v_actor;
  ELSE
    SELECT * INTO v_actor FROM public.pos_resolve_session(p_token) LIMIT 1;
    IF v_actor.advisor_id IS NULL THEN RAISE EXCEPTION 'Sesión POS inválida o vencida.' USING ERRCODE = 'P0001'; END IF;
  END IF;

  RETURN jsonb_build_object(
    'advisors', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.pos_team_directory() d), '[]'::jsonb),
    'customers', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.pos_customers x), '[]'::jsonb),
    'orders', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM public.pos_orders ORDER BY created_at DESC LIMIT 500) x), '[]'::jsonb),
    'order_items', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_order_items ORDER BY created_at DESC LIMIT 2000) x), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_payments ORDER BY created_at DESC LIMIT 1000) x), '[]'::jsonb),
    'expenses', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_expenses ORDER BY created_at DESC LIMIT 500) x), '[]'::jsonb),
    'shifts', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_cash_shifts ORDER BY created_at DESC LIMIT 300) x), '[]'::jsonb),
    'materials', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.pos_materials_inventory x), '[]'::jsonb),
    'material_logs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_material_usage_logs ORDER BY created_at DESC LIMIT 1000) x), '[]'::jsonb),
    'customer_logs', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_customer_activity_logs ORDER BY created_at DESC LIMIT 1000) x), '[]'::jsonb),
    'suppliers', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.pos_suppliers x), '[]'::jsonb),
    'parked_sales', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.pos_parked_sales x), '[]'::jsonb),
    'products', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.pos_products x), '[]'::jsonb),
    'production_operations', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_production_operations ORDER BY scheduled_start NULLS LAST LIMIT 3000) x), '[]'::jsonb),
    'workstations', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.pos_workstations x), '[]'::jsonb),
    'cash_audits', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM public.pos_cash_audits ORDER BY timestamp DESC LIMIT 300) x), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_secure_upsert(p_token TEXT, p_table TEXT, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_actor RECORD;
  v_allowed TEXT[];
  v_columns TEXT;
  v_insert_columns TEXT;
  v_select_columns TEXT;
  v_before JSONB;
  v_payload JSONB := p_payload;
  v_id TEXT := p_payload ->> 'id';
BEGIN
  IF public.is_admin() THEN
    SELECT 'auth-admin'::TEXT AS advisor_id, 'Administrador'::TEXT AS advisor_name,
      'super_admin'::TEXT AS advisor_role, 'gerencia'::TEXT AS assigned_area INTO v_actor;
  ELSE
    SELECT * INTO v_actor FROM public.pos_resolve_session(p_token) LIMIT 1;
    IF v_actor.advisor_id IS NULL THEN RAISE EXCEPTION 'Sesión POS inválida o vencida.' USING ERRCODE = 'P0001'; END IF;
  END IF;

  v_allowed := CASE
    WHEN public.pos_is_manager_role(v_actor.advisor_role) THEN ARRAY['pos_advisors','pos_customers','pos_orders','pos_order_items','pos_payments','pos_cash_shifts','pos_expenses','pos_materials_inventory','pos_material_usage_logs','pos_customer_activity_logs','pos_suppliers','pos_purchase_orders','pos_parked_sales','pos_products','pos_production_operations','pos_workstations','pos_cash_audits']
    WHEN v_actor.advisor_role = 'asesora' THEN ARRAY['pos_customers','pos_orders','pos_order_items','pos_payments','pos_cash_shifts','pos_customer_activity_logs','pos_parked_sales']
    ELSE ARRAY['pos_orders','pos_order_items','pos_material_usage_logs','pos_production_operations']
  END;

  IF NOT (p_table = ANY(v_allowed)) OR v_id IS NULL THEN RAISE EXCEPTION 'Operación no autorizada.' USING ERRCODE = '42501'; END IF;

  IF p_table = 'pos_advisors' AND NOT public.pos_is_manager_role(v_actor.advisor_role) THEN
    RAISE EXCEPTION 'Solo administración puede gestionar integrantes.' USING ERRCODE = '42501';
  END IF;

  IF p_table = 'pos_advisors' AND COALESCE(v_payload ->> 'pin', '') NOT IN ('', 'locked') THEN
    v_payload := jsonb_set(v_payload, '{pin_hash}', to_jsonb(extensions.crypt(v_payload ->> 'pin', extensions.gen_salt('bf'))), TRUE)
      || jsonb_build_object('pin', 'locked', 'weekly_pin', 'locked', 'weekly_password', NULL, 'pin_changed_at', NOW());
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text = $1', p_table) INTO v_before USING v_id;
  SELECT
    string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum) FILTER (WHERE a.attname <> 'id'),
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
    string_agg(format('payload_row.%I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_columns, v_insert_columns, v_select_columns
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = p_table AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attgenerated = '' AND v_payload ? a.attname;

  IF v_insert_columns IS NULL OR NOT (v_payload ? 'id') THEN RAISE EXCEPTION 'Registro incompleto.' USING ERRCODE = '22023'; END IF;
  EXECUTE format(
    'INSERT INTO public.%1$I (%2$s) SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1) payload_row ON CONFLICT (id) DO %4$s',
    p_table, v_insert_columns, v_select_columns,
    CASE WHEN v_columns IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || v_columns END
  )
  USING v_payload;

  INSERT INTO public.pos_audit_log(actor_id, actor_name, actor_role, action, entity_table, entity_id, before_data, after_data)
  VALUES (v_actor.advisor_id, v_actor.advisor_name, v_actor.advisor_role, CASE WHEN v_before IS NULL THEN 'insert' ELSE 'update' END, p_table, v_id, v_before, v_payload);
  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_secure_delete(p_token TEXT, p_table TEXT, p_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_actor RECORD; v_before JSONB; v_deleted_count INTEGER := 0;
BEGIN
  IF public.is_admin() THEN
    SELECT 'auth-admin'::TEXT AS advisor_id, 'Administrador'::TEXT AS advisor_name,
      'super_admin'::TEXT AS advisor_role, 'gerencia'::TEXT AS assigned_area INTO v_actor;
  ELSE SELECT * INTO v_actor FROM public.pos_resolve_session(p_token) LIMIT 1; END IF;
  IF v_actor.advisor_id IS NULL OR NOT public.pos_is_manager_role(v_actor.advisor_role)
    OR p_table NOT IN ('pos_customers','pos_expenses','pos_suppliers','pos_purchase_orders','pos_parked_sales','pos_products','pos_workstations')
  THEN RAISE EXCEPTION 'Eliminación no autorizada.' USING ERRCODE = '42501'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text = $1', p_table) INTO v_before USING p_id;
  EXECUTE format('DELETE FROM public.%I WHERE id::text = $1', p_table) USING p_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  INSERT INTO public.pos_audit_log(actor_id, actor_name, actor_role, action, entity_table, entity_id, before_data)
  VALUES (v_actor.advisor_id, v_actor.advisor_name, v_actor.advisor_role, 'delete', p_table, p_id, v_before);
  RETURN v_deleted_count > 0;
END;
$$;

-- Remove every legacy permissive POS policy and allow direct access only to authenticated owners.
DO $$
DECLARE v_table TEXT; v_policy RECORD;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pos_advisors','pos_customers','pos_orders','pos_order_items','pos_payments','pos_cash_shifts','pos_expenses','pos_materials_inventory','pos_material_usage_logs','pos_suppliers','pos_purchase_orders','pos_parked_sales','pos_products','pos_customer_activity_logs','pos_cash_audits','pos_workstations','pos_production_operations','pos_access_sessions','pos_auth_attempts','pos_audit_log'] LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', 'Authenticated owners manage ' || v_table, v_table);
  END LOOP;
END $$;

CREATE POLICY "Public reads active POS catalog" ON public.pos_products
  FOR SELECT TO anon, authenticated USING (is_active = TRUE);

REVOKE ALL ON public.pos_advisors, public.pos_customers, public.pos_orders, public.pos_order_items,
  public.pos_payments, public.pos_cash_shifts, public.pos_expenses, public.pos_materials_inventory,
  public.pos_material_usage_logs, public.pos_suppliers, public.pos_purchase_orders, public.pos_parked_sales,
  public.pos_customer_activity_logs, public.pos_cash_audits, public.pos_workstations,
  public.pos_production_operations, public.pos_access_sessions, public.pos_auth_attempts, public.pos_audit_log
FROM anon;
GRANT SELECT ON public.pos_products TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_team_directory() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_login_with_pin(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_resolve_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_logout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_fetch_store(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_secure_upsert(TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_secure_delete(TEXT, TEXT, TEXT) TO anon, authenticated;

DROP VIEW IF EXISTS public.pos_active_weekly_credentials;
CREATE VIEW public.pos_active_weekly_credentials WITH (security_invoker = true) AS
SELECT id, name, email, phone, role, assigned_area, workspace_type,
  can_open_cash, has_sales_goal, current_week_code, pin_last_rotated_at,
  weekly_goal, is_active, pin_changed_at, locked_until
FROM public.pos_advisors
WHERE is_active = TRUE AND can_open_cash = TRUE;

REVOKE ALL ON public.pos_active_weekly_credentials FROM anon;
GRANT SELECT ON public.pos_active_weekly_credentials TO authenticated;
