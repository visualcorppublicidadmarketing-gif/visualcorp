drop policy if exists sale_payments_staff_read on public.sale_payments;
create policy sale_payments_branch_members_read
  on public.sale_payments for select to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_payments.sale_id
        and s.organization_id = sale_payments.organization_id
        and app_private.has_org_role(s.organization_id, s.branch_id)
    )
  );

drop policy if exists sale_fulfillment_details_select on public.sale_fulfillment_details;
create policy sale_fulfillment_details_branch_members_read
  on public.sale_fulfillment_details for select to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_fulfillment_details.sale_id
        and s.organization_id = sale_fulfillment_details.organization_id
        and app_private.has_org_role(s.organization_id, s.branch_id)
    )
  );
