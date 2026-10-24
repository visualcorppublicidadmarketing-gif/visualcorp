-- Every settled POS refund gets a dated, auditable finance record. Cash
-- refunds also reduce the matching open till so the close reconciles.
create table public.sale_refund_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  return_id uuid not null,
  sale_id uuid not null,
  branch_id uuid not null,
  return_code text not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null check (method in ('cash','transfer','card','other')),
  reference text not null default '',
  cash_session_id uuid,
  settled_at timestamptz not null default now(),
  settled_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, return_id),
  foreign key (return_id, organization_id) references public.sale_returns(id, organization_id) on delete restrict,
  foreign key (sale_id, organization_id) references public.sales(id, organization_id) on delete restrict,
  foreign key (branch_id, organization_id) references public.branches(id, organization_id) on delete restrict,
  foreign key (cash_session_id, organization_id) references public.cash_sessions(id, organization_id) on delete restrict,
  check ((method = 'cash' and cash_session_id is not null) or (method <> 'cash' and cash_session_id is null))
);
create index sale_refund_settlements_org_date_idx
  on public.sale_refund_settlements(organization_id, settled_at desc);
create index sale_refund_settlements_sale_idx
  on public.sale_refund_settlements(sale_id, organization_id, settled_at desc);
alter table public.sale_refund_settlements enable row level security;
revoke all on public.sale_refund_settlements from public, anon, authenticated;
grant select on public.sale_refund_settlements to authenticated;
create policy sale_refund_settlements_read
  on public.sale_refund_settlements for select to authenticated
  using (app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id));

create or replace function app_private.settle_sale_refund(
  p_return uuid, p_reference text default '', p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_return public.sale_returns%rowtype;
  v_org uuid;
  v_branch uuid;
  v_sale_code text;
  v_session uuid;
  v_settlement uuid;
begin
  if v_uid is null then raise exception 'Inicia sesión para liquidar el reembolso.' using errcode = '42501'; end if;
  select r.* into v_return
    from public.sale_returns r
   where r.id = p_return
   for update;
  if not found then raise exception 'No encontramos el reembolso pendiente.' using errcode = '22023'; end if;

  v_org := v_return.organization_id;
  select s.branch_id, s.sale_code into v_branch, v_sale_code
    from public.sales s
   where s.id = v_return.sale_id and s.organization_id = v_org;
  if v_branch is null or not app_private.has_visualcorp_access(v_org, 'sales', 'settle_refund', v_branch) then
    raise exception 'No tienes permiso para liquidar este reembolso.' using errcode = '42501';
  end if;

  select rs.id into v_settlement
    from public.sale_refund_settlements rs
   where rs.organization_id = v_org and rs.return_id = p_return;
  if v_settlement is not null then
    return jsonb_build_object('settlement_id', v_settlement, 'already_settled', true);
  end if;
  if v_return.refund_status <> 'pending' or v_return.refund_amount <= 0 then
    raise exception 'El reembolso debe tener un monto positivo y seguir pendiente.' using errcode = '22023';
  end if;

  if v_return.refund_method = 'cash' then
    if not app_private.has_visualcorp_access(v_org, 'cash', 'manage_cash', v_branch) then
      raise exception 'Tu perfil no tiene permiso para registrar salidas en caja.' using errcode = '42501';
    end if;
    select cs.id into v_session
      from public.cash_sessions cs
     where cs.organization_id = v_org and cs.branch_id = v_branch
       and cs.opened_by = v_uid and cs.status = 'open'
     order by cs.opened_at desc
     limit 1
     for update;
    if v_session is null then
      raise exception 'Abre la caja de esta sucursal antes de liquidar un reembolso en efectivo.' using errcode = '22023';
    end if;
  end if;

  insert into public.sale_refund_settlements(
    organization_id, return_id, sale_id, branch_id, return_code, amount,
    method, reference, cash_session_id, settled_by
  ) values (
    v_org, v_return.id, v_return.sale_id, v_branch, v_return.return_code,
    round(v_return.refund_amount, 2), v_return.refund_method,
    left(trim(coalesce(p_reference, '')), 200), v_session, v_uid
  ) returning id into v_settlement;

  if v_return.refund_method = 'cash' then
    insert into public.cash_session_movements(
      organization_id, session_id, direction, amount, reason, idempotency_key, created_by
    ) values (
      v_org, v_session, 'out', round(v_return.refund_amount, 2),
      'Reembolso ' || v_return.return_code || ' · venta ' || coalesce(v_sale_code, v_return.sale_id::text),
      'sale-refund:' || v_return.id::text, v_uid
    );
  end if;

  update public.sale_returns
     set refund_status = 'refunded',
         note = concat_ws(E'\n', nullif(note, ''), nullif(left(trim(coalesce(p_note, '')), 500), ''))
   where id = v_return.id and organization_id = v_org;
  return jsonb_build_object('settlement_id', v_settlement, 'already_settled', false, 'cash_session_id', v_session);
end;
$$;
revoke all on function app_private.settle_sale_refund(uuid, text, text) from public, anon;
grant execute on function app_private.settle_sale_refund(uuid, text, text) to authenticated;

create or replace function public.settle_sale_refund(
  p_return uuid, p_reference text default '', p_note text default ''
) returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.settle_sale_refund($1, $2, $3);
$$;
revoke all on function public.settle_sale_refund(uuid, text, text) from public, anon;
grant execute on function public.settle_sale_refund(uuid, text, text) to authenticated;

-- Keep legacy callers on the same controlled, auditable settlement path.
create or replace function public.mark_sale_refund_completed(p_return uuid, p_note text default '')
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform app_private.settle_sale_refund(p_return, '', p_note);
end;
$$;
revoke all on function public.mark_sale_refund_completed(uuid, text) from public, anon;
grant execute on function public.mark_sale_refund_completed(uuid, text) to authenticated;

-- Keep the receipt-payable write logic out of the exposed API schema while
-- retaining the same authenticated manager checks and idempotency behavior.
create or replace function app_private.record_finance_receipt_payable(
  p_receipt_id uuid, p_total numeric, p_document_reference text default '', p_due_date date default null
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
revoke all on function app_private.record_finance_receipt_payable(uuid, numeric, text, date) from public, anon;
grant execute on function app_private.record_finance_receipt_payable(uuid, numeric, text, date) to authenticated;

create or replace function public.record_finance_receipt_payable(
  p_receipt_id uuid, p_total numeric, p_document_reference text default '', p_due_date date default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select app_private.record_finance_receipt_payable($1, $2, $3, $4);
$$;
revoke all on function public.record_finance_receipt_payable(uuid, numeric, text, date) from public, anon;
grant execute on function public.record_finance_receipt_payable(uuid, numeric, text, date) to authenticated;
