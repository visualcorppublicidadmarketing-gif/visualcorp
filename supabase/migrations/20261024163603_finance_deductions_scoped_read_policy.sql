-- Keep a single SELECT policy while allowing payroll viewers to read
-- deductions from Personnel, and finance owners/admins to manage the ledger.
drop policy if exists finance_deductions_compensation_read on public.finance_payroll_deductions;
drop policy if exists finance_deductions_owner_read on public.finance_payroll_deductions;
create policy finance_deductions_owner_read
  on public.finance_payroll_deductions for select to authenticated
  using (
    app_private.has_org_role(organization_id, null, array['owner','admin'])
    or (
      personnel_id is not null
      and app_private.has_visualcorp_access(organization_id, 'personnel', 'view_compensation')
    )
  );
