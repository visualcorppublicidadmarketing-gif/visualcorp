-- Link a confirmed warehouse receipt to one reviewed supplier payable.
-- The PO cost remains a reference; the invoice amount is entered by Finance.
alter table public.finance_expenses
  add column receipt_id uuid;

alter table public.finance_expenses
  add constraint finance_expenses_receipt_fk
  foreign key (receipt_id, organization_id)
  references public.purchase_receipts(id, organization_id)
  on delete restrict;

create unique index finance_expenses_receipt_unique
  on public.finance_expenses(receipt_id)
  where receipt_id is not null;

create or replace function public.record_finance_receipt_payable(
  p_receipt_id uuid,
  p_total numeric,
  p_document_reference text default '',
  p_due_date date default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_receipt record;
  v_total numeric(14,2) := round(coalesce(p_total, 0), 2);
  v_expense_id uuid;
begin
  select id into v_org from public.organizations where slug = 'visual-corp' limit 1;
  if v_org is null or not app_private.has_org_role(v_org, null, array['owner','admin','manager']) then
    raise exception 'No tienes permiso para registrar cuentas por pagar.' using errcode = '42501';
  end if;
  if p_receipt_id is null or v_total <= 0 then
    raise exception 'Selecciona una recepción y confirma un importe mayor a cero con la factura.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_receipt_id::text, 0));
  select r.id, r.organization_id, r.purchase_order_id, r.reference, o.branch_id, o.supplier_id, o.order_number
    into v_receipt
    from public.purchase_receipts r
    join public.purchase_orders o on o.id = r.purchase_order_id and o.organization_id = r.organization_id
   where r.id = p_receipt_id and r.organization_id = v_org;
  if not found then raise exception 'No encontramos una recepción de esta organización.' using errcode = '22023'; end if;

  select e.id into v_expense_id from public.finance_expenses e
   where e.organization_id = v_org and e.receipt_id = p_receipt_id;
  if v_expense_id is not null then
    return jsonb_build_object('expense_id', v_expense_id, 'already_created', true);
  end if;

  insert into public.finance_expenses(
    organization_id, branch_id, supplier_id, purchase_order_id, receipt_id,
    description, category, status, due_date, total, paid_total, reference, note, created_by
  ) values (
    v_org, v_receipt.branch_id, v_receipt.supplier_id, v_receipt.purchase_order_id, p_receipt_id,
    'Compra recibida · ' || v_receipt.order_number, 'Compras e insumos', 'payable', p_due_date, v_total, 0,
    left(coalesce(p_document_reference, ''), 200),
    'Cuenta por pagar creada desde recepción ' || p_receipt_id::text || '. Importe confirmado manualmente por Finanzas con factura.', auth.uid()
  ) returning id into v_expense_id;
  return jsonb_build_object('expense_id', v_expense_id, 'already_created', false);
end;
$$;

revoke all on function public.record_finance_receipt_payable(uuid,numeric,text,date) from public, anon;
grant execute on function public.record_finance_receipt_payable(uuid,numeric,text,date) to authenticated;
