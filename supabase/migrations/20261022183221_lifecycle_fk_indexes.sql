-- Cover lifecycle foreign keys in their declared column order.
create index if not exists cash_sessions_branch_org_fk_idx
  on public.cash_sessions(branch_id, organization_id);
create index if not exists sale_payments_cash_session_fk_idx
  on public.sale_payments(cash_session_id)
  where cash_session_id is not null;
create index if not exists sales_central_quote_fk_idx
  on public.sales(central_quote_id, organization_id)
  where central_quote_id is not null;
