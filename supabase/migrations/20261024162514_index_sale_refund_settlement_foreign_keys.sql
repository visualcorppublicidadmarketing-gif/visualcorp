create index if not exists sale_refund_settlements_return_fk_idx
  on public.sale_refund_settlements(return_id, organization_id);
create index if not exists sale_refund_settlements_branch_fk_idx
  on public.sale_refund_settlements(branch_id, organization_id);
create index if not exists sale_refund_settlements_cash_session_fk_idx
  on public.sale_refund_settlements(cash_session_id, organization_id)
  where cash_session_id is not null;
create index if not exists sale_refund_settlements_settled_by_fk_idx
  on public.sale_refund_settlements(settled_by);
