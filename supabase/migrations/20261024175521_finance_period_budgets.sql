-- User-entered monthly expense budgets for Finance, scoped to the organization,
-- period, category and branch. Budgets are targets only; they do not create bills.
create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null check (extract(day from period_start) = 1),
  category text not null check (length(trim(category)) between 1 and 100),
  branch_id uuid,
  budget_amount numeric(14,2) not null check (budget_amount > 0),
  note text not null default '' check (length(note) <= 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_budgets_branch_org_fkey foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete restrict,
  constraint finance_budgets_org_period_category_branch_key
    unique nulls not distinct (organization_id, period_start, category, branch_id)
);

create index finance_budgets_org_period_branch_idx
  on public.finance_budgets (organization_id, period_start, branch_id);
create index finance_budgets_branch_org_idx
  on public.finance_budgets (branch_id, organization_id);
create index finance_budgets_created_by_idx
  on public.finance_budgets (created_by);

alter table public.finance_budgets enable row level security;
grant select, insert, update on public.finance_budgets to authenticated;

create policy finance_budgets_admin_read
  on public.finance_budgets for select to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
create policy finance_budgets_admin_insert
  on public.finance_budgets for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app_private.has_org_role(organization_id, null, array['owner','admin','manager'])
  );
create policy finance_budgets_admin_update
  on public.finance_budgets for update to authenticated
  using (app_private.has_org_role(organization_id, null, array['owner','admin','manager']))
  with check (app_private.has_org_role(organization_id, null, array['owner','admin','manager']));
