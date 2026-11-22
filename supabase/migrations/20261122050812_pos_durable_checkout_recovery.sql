-- Keep checkout idempotency durable across browser restarts and commit
-- sale-related follow-up records in the same database transaction.
create or replace function public.confirm_pos_sale_with_workflows(
  p_idempotency_key text,
  p_branch_code text,
  p_customer_id uuid,
  p_customer_data jsonb,
  p_discount numeric,
  p_note text,
  p_allow_backorder boolean,
  p_lines jsonb,
  p_payments jsonb,
  p_fulfillment jsonb,
  p_production_jobs jsonb,
  p_client_brief_html text,
  p_parked_order uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_sale uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para confirmar la venta.' using errcode = '42501';
  end if;
  if octet_length(coalesce(p_client_brief_html, '')) > 30000 then
    raise exception 'La descripción del cliente supera el límite permitido.' using errcode = '22023';
  end if;

  v_result := app_private.confirm_pos_sale_with_workflows(
    p_idempotency_key,
    p_branch_code,
    p_customer_id,
    p_customer_data,
    p_discount,
    p_note,
    p_allow_backorder,
    p_lines,
    p_payments,
    p_fulfillment,
    p_production_jobs
  );
  v_sale := nullif(v_result->>'sale_id', '')::uuid;
  if v_sale is null then
    raise exception 'No se pudo recuperar la venta confirmada.' using errcode = '55000';
  end if;

  -- These existing, permission-checked routines run in this transaction;
  -- a failure rolls back the sale rather than leaving partial follow-up work.
  perform public.save_pos_sale_client_brief(v_sale, coalesce(p_client_brief_html, ''));
  if p_parked_order is not null then
    perform public.complete_parked_pos_order(p_parked_order, v_sale);
  end if;

  return v_result;
end;
$$;

revoke all on function public.confirm_pos_sale_with_workflows(
  text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb, text, uuid
) from public, anon;
grant execute on function public.confirm_pos_sale_with_workflows(
  text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb, text, uuid
) to authenticated;

comment on function public.confirm_pos_sale_with_workflows(
  text, text, uuid, jsonb, numeric, text, boolean, jsonb, jsonb, jsonb, jsonb, text, uuid
) is 'Confirma una venta POS con clave idempotente y persiste brief/cierre de orden aparcada en la misma transacción.';
