-- Atomic and idempotent creation of a complete POS sale.

CREATE TABLE IF NOT EXISTS public.pos_idempotency_keys (
  key TEXT PRIMARY KEY,
  actor_id TEXT,
  operation TEXT NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pos_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated owners manage pos_idempotency_keys" ON public.pos_idempotency_keys;
CREATE POLICY "Authenticated owners manage pos_idempotency_keys" ON public.pos_idempotency_keys
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.pos_idempotency_keys FROM anon;

CREATE OR REPLACE FUNCTION public.pos_internal_upsert(p_table TEXT, p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_update_columns TEXT; v_insert_columns TEXT; v_select_columns TEXT;
BEGIN
  IF p_table NOT IN ('pos_customers','pos_orders','pos_order_items','pos_payments','pos_materials_inventory','pos_material_usage_logs','pos_production_operations')
    OR NOT (p_payload ? 'id') THEN RAISE EXCEPTION 'Registro de venta inválido.' USING ERRCODE = '22023'; END IF;

  SELECT
    string_agg(format('%1$I = EXCLUDED.%1$I', a.attname), ', ' ORDER BY a.attnum) FILTER (WHERE a.attname <> 'id'),
    string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum),
    string_agg(format('payload_row.%I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_update_columns, v_insert_columns, v_select_columns
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = p_table AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attgenerated = '' AND p_payload ? a.attname;

  EXECUTE format(
    'INSERT INTO public.%1$I (%2$s) SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1) payload_row ON CONFLICT (id) DO %4$s',
    p_table, v_insert_columns, v_select_columns,
    CASE WHEN v_update_columns IS NULL THEN 'NOTHING' ELSE 'UPDATE SET ' || v_update_columns END
  ) USING p_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.pos_internal_upsert(TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_create_sale(
  p_token TEXT,
  p_idempotency_key TEXT,
  p_customer JSONB,
  p_order JSONB,
  p_items JSONB DEFAULT '[]'::jsonb,
  p_payments JSONB DEFAULT '[]'::jsonb,
  p_operations JSONB DEFAULT '[]'::jsonb,
  p_material_logs JSONB DEFAULT '[]'::jsonb,
  p_materials JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor RECORD; v_item JSONB; v_existing JSONB; v_order_id TEXT := p_order ->> 'id'; v_total NUMERIC; v_deposit NUMERIC;
BEGIN
  IF public.is_admin() THEN
    SELECT COALESCE(p_order ->> 'advisor_id', 'adv-admin')::TEXT AS advisor_id,
      'Administrador'::TEXT AS advisor_name, 'super_admin'::TEXT AS advisor_role,
      'gerencia'::TEXT AS assigned_area INTO v_actor;
  ELSE
    SELECT * INTO v_actor FROM public.pos_resolve_session(p_token) LIMIT 1;
    IF v_actor.advisor_id IS NULL THEN RAISE EXCEPTION 'Sesión POS inválida o vencida.' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT result INTO v_existing FROM public.pos_idempotency_keys WHERE key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  IF v_order_id IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'La venta no contiene orden o artículos.' USING ERRCODE = '22023'; END IF;
  IF COALESCE(p_order ->> 'advisor_id', '') <> v_actor.advisor_id AND NOT public.pos_is_manager_role(v_actor.advisor_role) THEN
    RAISE EXCEPTION 'La venta no pertenece a la sesión activa.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pos_advisors a WHERE a.id = COALESCE(p_order ->> 'advisor_id', v_actor.advisor_id) AND a.is_active AND a.can_open_cash) THEN
    RAISE EXCEPTION 'El integrante no tiene permiso de caja.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pos_cash_shifts s WHERE s.advisor_id = COALESCE(p_order ->> 'advisor_id', v_actor.advisor_id) AND s.status = 'open') THEN
    RAISE EXCEPTION 'No existe un turno de caja abierto.' USING ERRCODE = 'P0001';
  END IF;

  v_total := COALESCE((p_order ->> 'total_amount')::NUMERIC, 0);
  SELECT COALESCE(sum((entry ->> 'amount')::NUMERIC), 0) INTO v_deposit FROM jsonb_array_elements(p_payments) entry;
  IF v_total < 0 OR v_deposit < 0 THEN RAISE EXCEPTION 'Los valores de la venta son inválidos.' USING ERRCODE = '22023'; END IF;
  IF COALESCE((p_order ->> 'discount_percent')::NUMERIC, 0) > 0 AND COALESCE(trim(p_order ->> 'discount_reason'), '') = '' THEN
    RAISE EXCEPTION 'Todo descuento requiere motivo.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.pos_internal_upsert('pos_customers', p_customer);
  PERFORM public.pos_internal_upsert('pos_orders', p_order);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP PERFORM public.pos_internal_upsert('pos_order_items', v_item); END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payments) LOOP PERFORM public.pos_internal_upsert('pos_payments', v_item); END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_materials) LOOP PERFORM public.pos_internal_upsert('pos_materials_inventory', v_item); END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_material_logs) LOOP PERFORM public.pos_internal_upsert('pos_material_usage_logs', v_item); END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_operations) LOOP PERFORM public.pos_internal_upsert('pos_production_operations', v_item); END LOOP;

  v_existing := jsonb_build_object('order_id', v_order_id, 'order_number', p_order ->> 'order_number', 'saved_at', NOW());
  INSERT INTO public.pos_idempotency_keys(key, actor_id, operation, result)
  VALUES (p_idempotency_key, v_actor.advisor_id, 'create_sale', v_existing);
  INSERT INTO public.pos_audit_log(actor_id, actor_name, actor_role, action, entity_table, entity_id, after_data, metadata)
  VALUES (v_actor.advisor_id, v_actor.advisor_name, v_actor.advisor_role, 'create_sale', 'pos_orders', v_order_id, p_order,
    jsonb_build_object('items', jsonb_array_length(p_items), 'payments', jsonb_array_length(p_payments), 'total', v_total));
  RETURN v_existing;
EXCEPTION WHEN unique_violation THEN
  SELECT result INTO v_existing FROM public.pos_idempotency_keys WHERE key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_create_sale(TEXT, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) TO anon, authenticated;
