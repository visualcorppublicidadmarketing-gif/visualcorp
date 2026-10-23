-- These tables rely on narrow grants in addition to row-level policies.
revoke all on public.suppliers, public.purchase_orders, public.purchase_order_lines,
  public.purchase_receipts, public.purchase_receipt_lines from anon, authenticated;
grant select, insert, update on public.suppliers to authenticated;
grant select on public.purchase_orders, public.purchase_order_lines,
  public.purchase_receipts, public.purchase_receipt_lines to authenticated;
revoke all on sequence public.purchase_order_number_seq from anon, authenticated;
