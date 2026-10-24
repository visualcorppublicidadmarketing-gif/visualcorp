-- Finance and operations dashboards consume these organization-scoped tables.
-- Row-level security remains enabled; Realtime applies each subscriber's SELECT policies.
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is unavailable; finance live updates are disabled.';
    return;
  end if;

  foreach v_table in array array[
    'organization_memberships',
    'branches',
    'customers',
    'suppliers',
    'personnel_records',
    'personnel_account_links',
    'sales',
    'sale_payments',
    'sale_returns',
    'sale_refund_settlements',
    'finance_expenses',
    'finance_expense_payments',
    'finance_recurring_templates',
    'finance_recurring_occurrences',
    'finance_payroll_deductions',
    'finance_budgets',
    'purchase_orders',
    'purchase_order_lines',
    'purchase_receipts',
    'purchase_receipt_lines',
    'cash_sessions',
    'cash_session_movements',
    'inventory_variants',
    'inventory_items',
    'inventory_item_costs',
    'sale_line_cost_snapshots',
    'inventory_movement_cost_snapshots'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null
       and not exists (
         select 1
           from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = v_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;
