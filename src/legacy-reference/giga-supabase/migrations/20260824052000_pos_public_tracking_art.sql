-- Privacy-safe public order tracking and art approval endpoints.

CREATE OR REPLACE FUNCTION public.pos_public_order(p_reference TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.pos_orders%ROWTYPE;
  v_advisor_name TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.pos_orders o
  WHERE lower(o.tracking_token::TEXT) = lower(trim(p_reference))
     OR o.order_number = trim(p_reference)
     OR o.id = trim(p_reference)
  LIMIT 1;

  IF v_order.id IS NULL THEN RETURN NULL; END IF;
  SELECT name INTO v_advisor_name FROM public.pos_advisors WHERE id = v_order.advisor_id;

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'tracking_token', v_order.tracking_token,
      'order_number', v_order.order_number, 'job_name', v_order.job_name,
      'customer_name', v_order.customer_name, 'advisor_id', v_order.advisor_id,
      'order_date', v_order.order_date, 'delivery_date', v_order.delivery_date,
      'production_stage', v_order.production_stage, 'stage_history', v_order.stage_history,
      'art_url', v_order.art_url, 'art_approved', v_order.art_approved,
      'art_approved_by', v_order.art_approved_by, 'art_proof_pins', v_order.art_proof_pins,
      'art_proof_signature', v_order.art_proof_signature,
      'pickup_location', v_order.pickup_location, 'pickup_pin', v_order.pickup_pin,
      'payment_status', v_order.payment_status, 'deposit_amount', v_order.deposit_amount,
      'balance_due', v_order.balance_due, 'status', v_order.status
    ),
    'advisor', jsonb_build_object('id', v_order.advisor_id, 'name', COALESCE(v_advisor_name, 'Asesora Gigaprint')),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'order_id', i.order_id, 'product_name', i.product_name,
        'category', i.category, 'width_cm', i.width_cm, 'height_cm', i.height_cm,
        'quantity', i.quantity, 'finishing', i.finishing
      ) ORDER BY i.created_at)
      FROM public.pos_order_items i WHERE i.order_id = v_order.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_submit_art_decision(
  p_reference TEXT,
  p_approver_name TEXT,
  p_decision TEXT,
  p_pins JSONB DEFAULT '[]'::jsonb,
  p_signature TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_order public.pos_orders%ROWTYPE; v_now TIMESTAMPTZ := NOW(); v_history JSONB;
BEGIN
  IF p_decision NOT IN ('approved', 'changes_requested') THEN RAISE EXCEPTION 'Decisión inválida.' USING ERRCODE = '22023'; END IF;
  IF length(trim(COALESCE(p_approver_name, ''))) < 2 THEN RAISE EXCEPTION 'Ingresa el nombre de quien revisa el arte.' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(COALESCE(p_pins, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_pins, '[]'::jsonb)) > 50 THEN
    RAISE EXCEPTION 'Las observaciones de arte no son válidas.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.pos_orders o
  WHERE lower(o.tracking_token::TEXT) = lower(trim(p_reference)) OR o.id = trim(p_reference)
  LIMIT 1 FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Orden no encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_order.status IN ('cancelled', 'cancelada') THEN RAISE EXCEPTION 'La orden está cancelada.' USING ERRCODE = 'P0001'; END IF;

  v_history := COALESCE(v_order.stage_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'stage', CASE WHEN p_decision = 'approved' THEN 'aprobacion_arte' ELSE COALESCE(v_order.production_stage, 'preprensa') END,
    'timestamp', v_now, 'advisorId', NULL,
    'note', CASE WHEN p_decision = 'approved' THEN 'Arte aprobado por el cliente desde el portal seguro.' ELSE 'El cliente solicitó correcciones desde el portal seguro.' END
  ));

  UPDATE public.pos_orders SET
    art_approved = p_decision = 'approved',
    art_approved_at = CASE WHEN p_decision = 'approved' THEN v_now ELSE NULL END,
    art_approved_by = CASE WHEN p_decision = 'approved' THEN trim(p_approver_name) ELSE NULL END,
    art_proof_pins = COALESCE(p_pins, '[]'::jsonb),
    art_proof_signature = CASE WHEN p_decision = 'approved' THEN p_signature ELSE art_proof_signature END,
    production_stage = CASE WHEN p_decision = 'approved' THEN 'impresion' ELSE 'aprobacion_arte' END,
    stage_history = v_history, updated_at = v_now
  WHERE id = v_order.id;

  INSERT INTO public.pos_audit_log(actor_name, actor_role, action, entity_table, entity_id, metadata)
  VALUES (trim(p_approver_name), 'customer', 'art_' || p_decision, 'pos_orders', v_order.id,
    jsonb_build_object('pin_count', jsonb_array_length(COALESCE(p_pins, '[]'::jsonb))));

  RETURN public.pos_public_order(COALESCE(v_order.tracking_token::TEXT, v_order.id));
END;
$$;

REVOKE ALL ON FUNCTION public.pos_public_order(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_submit_art_decision(TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pos_public_order(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_submit_art_decision(TEXT, TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
