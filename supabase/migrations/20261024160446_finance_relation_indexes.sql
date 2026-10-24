-- Cover foreign keys introduced by the finance integrations.
create index finance_recurring_templates_org_idx
  on public.finance_recurring_templates(organization_id);
create index finance_recurring_templates_created_by_idx
  on public.finance_recurring_templates(created_by);
create index finance_recurring_templates_branch_org_idx
  on public.finance_recurring_templates(branch_id,organization_id);
create index finance_recurring_templates_supplier_org_idx
  on public.finance_recurring_templates(supplier_id,organization_id);

create index finance_recurring_occurrences_template_org_idx
  on public.finance_recurring_occurrences(template_id,organization_id);
create index finance_recurring_occurrences_expense_org_idx
  on public.finance_recurring_occurrences(expense_id,organization_id);
create index finance_recurring_occurrences_created_by_idx
  on public.finance_recurring_occurrences(created_by);

create index sale_line_cost_snapshots_line_org_idx
  on public.sale_line_cost_snapshots(sale_line_id,organization_id);
