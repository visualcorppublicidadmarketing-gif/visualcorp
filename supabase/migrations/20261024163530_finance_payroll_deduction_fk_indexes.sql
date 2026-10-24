-- Cover the deduction table's foreign keys and keep person/month lookups fast.
drop index public.finance_payroll_deductions_personnel_period_idx;
create index finance_payroll_deductions_personnel_period_idx
  on public.finance_payroll_deductions(personnel_id, organization_id, payroll_period desc);

create index finance_payroll_deductions_employee_user_idx
  on public.finance_payroll_deductions(employee_user_id);
create index finance_payroll_deductions_created_by_idx
  on public.finance_payroll_deductions(created_by);
create index finance_payroll_deductions_reviewed_by_idx
  on public.finance_payroll_deductions(reviewed_by);
