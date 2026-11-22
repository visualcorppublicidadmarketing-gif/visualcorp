-- Restrictive read gates keep legacy organization-membership policies from
-- bypassing Visual Corp module permissions on commercial and cash records.
-- Existing grants and permissive policies remain intact; PostgreSQL combines
-- these policies with every permissive SELECT policy using AND.

-- The earlier generic access-profile migration installed a sales.view-only
-- restrictive gate on these tables. Replace it so finance and cash routes can
-- use their intended scoped paths while the policies below remain the final AND.
drop policy if exists vc_access_select on public.sales;
drop policy if exists vc_access_select on public.sale_lines;
drop policy if exists vc_access_select on public.sale_payments;
drop policy if exists vc_access_select on public.sale_returns;
drop policy if exists vc_access_select on public.sale_return_lines;
-- The same generated gate was installed on cash records too. It excludes
-- manage_cash-only profiles, and the movement table has no branch_id so its
-- old gate incorrectly requires organization-wide cash.view. Replace both
-- with the session-scoped rules below.
drop policy if exists vc_access_select on public.cash_sessions;
drop policy if exists vc_access_select on public.cash_session_movements;

-- Add matching permissive entry points for the module-authorized readers.
-- The legacy payment policy joins sales, whose own RLS correctly hides the
-- sale from cash-only readers; this policy permits its linked session path.
create policy vc_sale_payments_cash_session_access
  on public.sale_payments
  for select to authenticated
  using (
    sale_payments.cash_session_id is not null
    and exists (
      select 1
      from public.cash_sessions cs
      where cs.id = sale_payments.cash_session_id
        and cs.organization_id = sale_payments.organization_id
        and (
          app_private.has_visualcorp_access(cs.organization_id, 'cash', 'view', cs.branch_id)
          or app_private.has_visualcorp_access(cs.organization_id, 'cash', 'manage_cash', cs.branch_id)
          or (
            cs.opened_by = (select auth.uid())
            and app_private.has_visualcorp_access(cs.organization_id, 'sales', 'edit', cs.branch_id)
          )
        )
    )
  );

-- Current SELECT policies cover cash.view and own open sessions. This narrow
-- policy also admits manage_cash and an editor's own session; the restrictive
-- policy below remains the final boundary for all permissive policies.
create policy vc_cash_sessions_module_access
  on public.cash_sessions
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
    or (
      opened_by = (select auth.uid())
      and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    )
  );

create policy vc_cash_session_movements_module_access
  on public.cash_session_movements
  for select to authenticated
  using (exists (
    select 1
    from public.cash_sessions cs
    where cs.id = cash_session_movements.session_id
      and cs.organization_id = cash_session_movements.organization_id
      and (
        app_private.has_visualcorp_access(cs.organization_id, 'cash', 'view', cs.branch_id)
        or app_private.has_visualcorp_access(cs.organization_id, 'cash', 'manage_cash', cs.branch_id)
        or (
          cs.opened_by = (select auth.uid())
          and app_private.has_visualcorp_access(cs.organization_id, 'sales', 'edit', cs.branch_id)
        )
      )
  ));

create policy vc_sales_read_permission_scope
  on public.sales as restrictive
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'finance', 'view', branch_id)
  );

create policy vc_sale_lines_read_permission_scope
  on public.sale_lines as restrictive
  for select to authenticated
  using (exists (
    select 1
    from public.sales s
    where s.id = sale_lines.sale_id
      and s.organization_id = sale_lines.organization_id
      and (
        app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
        or app_private.has_visualcorp_access(s.organization_id, 'finance', 'view', s.branch_id)
      )
  ));

create policy vc_sale_returns_read_permission_scope
  on public.sale_returns as restrictive
  for select to authenticated
  using (exists (
    select 1
    from public.sales s
    where s.id = sale_returns.sale_id
      and s.organization_id = sale_returns.organization_id
      and (
        app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
        or app_private.has_visualcorp_access(s.organization_id, 'finance', 'view', s.branch_id)
      )
  ));

create policy vc_sale_return_lines_read_permission_scope
  on public.sale_return_lines as restrictive
  for select to authenticated
  using (exists (
    select 1
    from public.sale_returns sr
    join public.sales s
      on s.id = sr.sale_id
     and s.organization_id = sr.organization_id
    where sr.id = sale_return_lines.return_id
      and sr.organization_id = sale_return_lines.organization_id
      and (
        app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
        or app_private.has_visualcorp_access(s.organization_id, 'finance', 'view', s.branch_id)
      )
  ));

-- Installation location belongs to the sales, finance-manage, or workshop
-- workflow; finance.view alone should not expose a customer's address or map.
create policy vc_sale_fulfillment_details_read_permission_scope
  on public.sale_fulfillment_details as restrictive
  for select to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_fulfillment_details.sale_id
        and s.organization_id = sale_fulfillment_details.organization_id
        and (
          app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
          or app_private.has_visualcorp_access(s.organization_id, 'finance', 'manage_finance', s.branch_id)
        )
    )
    or exists (
      select 1
      from public.production_jobs j
      where j.sale_id = sale_fulfillment_details.sale_id
        and j.organization_id = sale_fulfillment_details.organization_id
        and (
          (j.advisor_id = (select auth.uid())
            and app_private.has_visualcorp_access(j.organization_id, 'sales', 'view', j.branch_id))
          or app_private.has_visualcorp_access(j.organization_id, 'workshop', 'view', j.branch_id)
        )
    )
  );

create policy vc_sale_payments_read_permission_scope
  on public.sale_payments as restrictive
  for select to authenticated
  using (
    exists (
      select 1
      from public.sales s
      where s.id = sale_payments.sale_id
        and s.organization_id = sale_payments.organization_id
        and (
          app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
          or app_private.has_visualcorp_access(s.organization_id, 'finance', 'view', s.branch_id)
        )
    )
    or (
      sale_payments.cash_session_id is not null
      and exists (
        select 1
        from public.cash_sessions cs
        where cs.id = sale_payments.cash_session_id
          and cs.organization_id = sale_payments.organization_id
          and (
            app_private.has_visualcorp_access(cs.organization_id, 'cash', 'view', cs.branch_id)
            or app_private.has_visualcorp_access(cs.organization_id, 'cash', 'manage_cash', cs.branch_id)
            or (
              cs.opened_by = (select auth.uid())
              and app_private.has_visualcorp_access(cs.organization_id, 'sales', 'edit', cs.branch_id)
            )
          )
      )
    )
  );

create policy vc_cash_sessions_read_permission_scope
  on public.cash_sessions as restrictive
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id)
    or app_private.has_visualcorp_access(organization_id, 'cash', 'manage_cash', branch_id)
    or (
      opened_by = (select auth.uid())
      and app_private.has_visualcorp_access(organization_id, 'sales', 'edit', branch_id)
    )
  );

create policy vc_cash_session_movements_read_permission_scope
  on public.cash_session_movements as restrictive
  for select to authenticated
  using (exists (
    select 1
    from public.cash_sessions cs
    where cs.id = cash_session_movements.session_id
      and cs.organization_id = cash_session_movements.organization_id
      and (
        app_private.has_visualcorp_access(cs.organization_id, 'cash', 'view', cs.branch_id)
        or app_private.has_visualcorp_access(cs.organization_id, 'cash', 'manage_cash', cs.branch_id)
        or (
          cs.opened_by = (select auth.uid())
          and app_private.has_visualcorp_access(cs.organization_id, 'sales', 'edit', cs.branch_id)
        )
      )
  ));

create policy vc_cash_session_audits_read_permission_scope
  on public.cash_session_audits as restrictive
  for select to authenticated
  using (exists (
    select 1
    from public.cash_sessions cs
    where cs.id = cash_session_audits.session_id
      and cs.organization_id = cash_session_audits.organization_id
      and (
        app_private.has_visualcorp_access(cs.organization_id, 'cash', 'view', cs.branch_id)
        or app_private.has_visualcorp_access(cs.organization_id, 'cash', 'manage_cash', cs.branch_id)
        or (
          cs.opened_by = (select auth.uid())
          and app_private.has_visualcorp_access(cs.organization_id, 'sales', 'edit', cs.branch_id)
        )
      )
  ));

-- Keep settlements at their existing sales.view boundary even if another
-- permissive policy is added later. Finance and cash permissions do not expand
-- access to settlement references or their audit details.
create policy vc_sale_refund_settlements_read_permission_scope
  on public.sale_refund_settlements as restrictive
  for select to authenticated
  using (
    app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id)
  );
