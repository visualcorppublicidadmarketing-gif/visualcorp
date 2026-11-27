import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../supabase/migrations/20261122050821_restrict_commercial_data_read_permissions.sql');
const priority1MigrationPath = path.join(__dirname, '../supabase/migrations/20261127141520_priority1_branch_permissions_and_roles.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const priority1Migration = fs.readFileSync(priority1MigrationPath, 'utf8');

function extractFinanceRlsFromPriority1(sql) {
  const start = sql.indexOf('drop policy if exists finance_expenses_access_select');
  const end = sql.indexOf('-- 3. Harden save_visualcorp_access_profile');
  assert.ok(start >= 0 && end > start, 'Priority 1 migration must declare finance_expenses and finance_expense_payments RLS');
  return sql.slice(start, end);
}

const org = '10000000-0000-0000-0000-000000000001';
const branchA = '10000000-0000-0000-0000-000000000101';
const branchB = '10000000-0000-0000-0000-000000000102';
const users = {
  member: '10000000-0000-0000-0000-000000000201',
  sales: '10000000-0000-0000-0000-000000000202',
  finance: '10000000-0000-0000-0000-000000000203',
  cash: '10000000-0000-0000-0000-000000000204',
  cashManage: '10000000-0000-0000-0000-000000000205',
  ownSessionEditor: '10000000-0000-0000-0000-000000000206',
  outsider: '10000000-0000-0000-0000-000000000207',
  otherOpener: '10000000-0000-0000-0000-000000000208',
  financeManage: '10000000-0000-0000-0000-000000000209',
  workshop: '10000000-0000-0000-0000-000000000210',
};
const sales = {
  a: '10000000-0000-0000-0000-000000000301',
  b: '10000000-0000-0000-0000-000000000302',
};
const sessions = {
  ownA: '10000000-0000-0000-0000-000000000401',
  otherA: '10000000-0000-0000-0000-000000000402',
  b: '10000000-0000-0000-0000-000000000403',
};
const payments = {
  ownA: '10000000-0000-0000-0000-000000000501',
  otherA: '10000000-0000-0000-0000-000000000502',
  unlinkedA: '10000000-0000-0000-0000-000000000503',
  b: '10000000-0000-0000-0000-000000000504',
};
const fulfillment = {
  a: '10000000-0000-0000-0000-000000000505',
  b: '10000000-0000-0000-0000-000000000506',
};
const jobs = {
  a: '10000000-0000-0000-0000-000000000507',
  b: '10000000-0000-0000-0000-000000000508',
};
const lines = {
  a: '10000000-0000-0000-0000-000000000601',
  b: '10000000-0000-0000-0000-000000000602',
};
const returns = {
  a: '10000000-0000-0000-0000-000000000701',
  b: '10000000-0000-0000-0000-000000000702',
};
const returnLines = {
  a: '10000000-0000-0000-0000-000000000703',
  b: '10000000-0000-0000-0000-000000000704',
};
const movements = {
  ownA: '10000000-0000-0000-0000-000000000801',
  otherA: '10000000-0000-0000-0000-000000000802',
  b: '10000000-0000-0000-0000-000000000803',
};
const audits = {
  ownA: '10000000-0000-0000-0000-000000000804',
  otherA: '10000000-0000-0000-0000-000000000805',
  b: '10000000-0000-0000-0000-000000000806',
};
const refunds = {
  a: '10000000-0000-0000-0000-000000000901',
  b: '10000000-0000-0000-0000-000000000902',
};

async function bootDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create schema app_private;
    create table public.organization_memberships (
      organization_id uuid not null, user_id uuid not null, branch_id uuid,
      profile_id uuid not null, role text not null, active boolean not null default true
    );
    create table public.access_profiles (
      id uuid primary key, organization_id uuid not null, profile_key text not null,
      active boolean not null default true
    );
    create table public.access_profile_permissions (
      profile_id uuid not null, module_key text not null, action_key text not null,
      enabled boolean not null default true
    );
    create or replace function auth.uid() returns uuid
      language sql stable set search_path = '' as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
    create or replace function app_private.has_org_role(
      p_org uuid, p_branch uuid default null, p_roles text[] default null
    ) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from public.organization_memberships m
        where m.organization_id = p_org and m.user_id = (select auth.uid())
          and (p_branch is null or m.branch_id is null or m.branch_id = p_branch)
          and (p_roles is null or m.role = any(p_roles)) and m.active
      );
    $$;
    create or replace function app_private.has_visualcorp_access(
      p_org uuid, p_module text, p_action text, p_branch uuid default null
    ) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (
        select 1
        from public.organization_memberships m
        join public.access_profiles p on p.id = m.profile_id and p.organization_id = m.organization_id
        left join public.access_profile_permissions permission
          on permission.profile_id = p.id and permission.module_key = p_module
          and permission.action_key = p_action and permission.enabled
        where m.organization_id = p_org and m.user_id = (select auth.uid())
          and m.active and p.active
          and (p_branch is null or m.branch_id is null or m.branch_id = p_branch)
          and (m.role = 'owner' or permission.profile_id is not null or (
            p_action = 'view' and exists (
              select 1 from public.access_profile_permissions edit_permission
              where edit_permission.profile_id = p.id and edit_permission.module_key = p_module
                and edit_permission.action_key = 'edit' and edit_permission.enabled
            )
          ))
      );
    $$;
    grant usage on schema auth, app_private to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant execute on function app_private.has_org_role(uuid, uuid, text[]) to authenticated;
    grant execute on function app_private.has_visualcorp_access(uuid, text, text, uuid) to authenticated;

    create table public.sales (id uuid primary key, organization_id uuid not null, branch_id uuid not null);
    create table public.sale_lines (id uuid primary key, organization_id uuid not null, sale_id uuid not null);
    create table public.sale_returns (id uuid primary key, organization_id uuid not null, sale_id uuid not null);
    create table public.sale_return_lines (id uuid primary key, organization_id uuid not null, return_id uuid not null);
    create table public.production_jobs (
      id uuid primary key, organization_id uuid not null, branch_id uuid not null,
      sale_id uuid not null, advisor_id uuid
    );
    create table public.sale_fulfillment_details (
      sale_id uuid primary key, organization_id uuid not null,
      installation_address text, installation_maps_url text
    );
    create table public.cash_sessions (
      id uuid primary key, organization_id uuid not null, branch_id uuid not null,
      opened_by uuid not null, status text not null
    );
    create table public.sale_payments (
      id uuid primary key, organization_id uuid not null, sale_id uuid not null,
      method text not null, cash_session_id uuid
    );
    create table public.cash_session_movements (
      id uuid primary key, organization_id uuid not null, session_id uuid not null
    );
    create table public.cash_session_audits (
      id uuid primary key, organization_id uuid not null, session_id uuid not null
    );
    create table public.sale_refund_settlements (
      id uuid primary key, organization_id uuid not null, branch_id uuid not null
    );

    alter table public.sales enable row level security;
    alter table public.sale_lines enable row level security;
    alter table public.sale_returns enable row level security;
    alter table public.sale_return_lines enable row level security;
    alter table public.production_jobs enable row level security;
    alter table public.sale_fulfillment_details enable row level security;
    alter table public.sale_payments enable row level security;
    alter table public.cash_sessions enable row level security;
    alter table public.cash_session_movements enable row level security;
    alter table public.cash_session_audits enable row level security;
    alter table public.sale_refund_settlements enable row level security;
    grant select on public.sales, public.sale_lines, public.sale_returns, public.sale_return_lines,
      public.production_jobs, public.sale_fulfillment_details,
      public.sale_payments, public.cash_sessions, public.cash_session_movements, public.cash_session_audits,
      public.sale_refund_settlements to authenticated;

    -- Representative legacy permissive policies. The new restrictive policies
    -- must narrow these even for ordinary organization members.
    create policy sales_read on public.sales for select to authenticated
      using (app_private.has_org_role(organization_id, branch_id));
    create policy sale_lines_read on public.sale_lines for select to authenticated
      using (app_private.has_org_role(organization_id));
    create policy sale_returns_read on public.sale_returns for select to authenticated
      using (app_private.has_org_role(organization_id));
    create policy sale_return_lines_read on public.sale_return_lines for select to authenticated
      using (app_private.has_org_role(organization_id));
    -- The existing generic access-profile migration adds a restrictive
    -- sales.view gate to the five commercial tables; the new migration must
    -- replace these exact policies, otherwise finance/cash paths remain closed.
    create policy vc_access_select on public.sales as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id));
    create policy vc_access_select on public.sale_lines as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'sales', 'view'));
    create policy vc_access_select on public.sale_payments as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'sales', 'view'));
    create policy vc_access_select on public.sale_returns as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'sales', 'view'));
    create policy vc_access_select on public.sale_return_lines as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'sales', 'view'));
    -- The generic access-profile migration also installs restrictive cash
    -- gates. Preserve these legacy policies in the fixture so the migration
    -- must replace them for branch-scoped cash.view, manage_cash, and own
    -- sales.edit session access to work.
    create policy vc_access_select on public.cash_sessions as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id));
    create policy vc_access_select on public.cash_session_movements as restrictive for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'cash', 'view'));
    create policy production_jobs_read on public.production_jobs for select to authenticated
      using ((advisor_id = (select auth.uid()) and app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id))
        or app_private.has_visualcorp_access(organization_id, 'workshop', 'view', branch_id));
    create policy sale_fulfillment_details_branch_members_read on public.sale_fulfillment_details for select to authenticated
      using (
        exists (select 1 from public.sales s where s.id = sale_fulfillment_details.sale_id
          and s.organization_id = sale_fulfillment_details.organization_id
          and app_private.has_org_role(s.organization_id, s.branch_id))
        or exists (select 1 from public.production_jobs j where j.sale_id = sale_fulfillment_details.sale_id
          and j.organization_id = sale_fulfillment_details.organization_id
          and ((j.advisor_id = (select auth.uid()) and app_private.has_visualcorp_access(j.organization_id, 'sales', 'view', j.branch_id))
            or app_private.has_visualcorp_access(j.organization_id, 'workshop', 'view', j.branch_id)))
      );
    create policy sale_payments_branch_members_read on public.sale_payments for select to authenticated
      using (exists (
        select 1 from public.sales s where s.id = sale_payments.sale_id
          and s.organization_id = sale_payments.organization_id
          and app_private.has_org_role(s.organization_id, s.branch_id)
      ));
    create policy cash_sessions_access_select on public.cash_sessions for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'cash', 'view', branch_id));
    create policy cash_sessions_assigned_advisor_select on public.cash_sessions for select to authenticated
      using (opened_by = (select auth.uid()));
    create policy cash_movements_access_select on public.cash_session_movements for select to authenticated
      using (exists (
        select 1 from public.cash_sessions s where s.id = cash_session_movements.session_id
          and s.organization_id = cash_session_movements.organization_id
          and app_private.has_visualcorp_access(s.organization_id, 'cash', 'view', s.branch_id)
      ));
    create policy cash_movements_assigned_advisor_select on public.cash_session_movements for select to authenticated
      using (exists (
        select 1 from public.cash_sessions s where s.id = cash_session_movements.session_id
          and s.organization_id = cash_session_movements.organization_id
          and s.opened_by = (select auth.uid())
      ));
    create policy cash_session_audits_select on public.cash_session_audits for select to authenticated
      using (exists (
        select 1 from public.cash_sessions s where s.id = cash_session_audits.session_id
          and s.organization_id = cash_session_audits.organization_id
          and (
            app_private.has_visualcorp_access(s.organization_id, 'cash', 'view', s.branch_id)
            or app_private.has_visualcorp_access(s.organization_id, 'cash', 'manage_cash', s.branch_id)
            or app_private.has_visualcorp_access(s.organization_id, 'sales', 'edit', s.branch_id)
            or app_private.has_visualcorp_access(s.organization_id, 'sales', 'view', s.branch_id)
          )
      ));
    create policy sale_refund_settlements_read on public.sale_refund_settlements for select to authenticated
      using (app_private.has_visualcorp_access(organization_id, 'sales', 'view', branch_id));

    insert into public.access_profiles (id, organization_id, profile_key, active) values
      ('${users.member}', '${org}', 'member', true),
      ('${users.sales}', '${org}', 'sales_viewer', true),
      ('${users.finance}', '${org}', 'finance_viewer', true),
      ('${users.cash}', '${org}', 'cash_viewer', true),
      ('${users.cashManage}', '${org}', 'cash_manager', true),
      ('${users.ownSessionEditor}', '${org}', 'sales_editor', true),
      ('${users.otherOpener}', '${org}', 'other_opener', true),
      ('${users.financeManage}', '${org}', 'finance_manager', true),
      ('${users.workshop}', '${org}', 'workshop_viewer', true);

    insert into public.organization_memberships (organization_id, user_id, branch_id, profile_id, role, active) values
      ('${org}', '${users.member}', '${branchA}', '${users.member}', 'advisor', true),
      ('${org}', '${users.sales}', '${branchA}', '${users.sales}', 'advisor', true),
      ('${org}', '${users.finance}', '${branchA}', '${users.finance}', 'advisor', true),
      ('${org}', '${users.cash}', '${branchA}', '${users.cash}', 'advisor', true),
      ('${org}', '${users.cashManage}', '${branchB}', '${users.cashManage}', 'advisor', true),
      ('${org}', '${users.ownSessionEditor}', '${branchA}', '${users.ownSessionEditor}', 'advisor', true),
      ('${org}', '${users.otherOpener}', '${branchA}', '${users.otherOpener}', 'advisor', true),
      ('${org}', '${users.financeManage}', '${branchA}', '${users.financeManage}', 'advisor', true),
      ('${org}', '${users.workshop}', '${branchB}', '${users.workshop}', 'advisor', true);

    insert into public.access_profile_permissions (profile_id, module_key, action_key, enabled) values
      ('${users.sales}', 'sales', 'view', true),
      ('${users.finance}', 'finance', 'view', true),
      ('${users.cash}', 'cash', 'view', true),
      ('${users.cashManage}', 'cash', 'manage_cash', true),
      ('${users.ownSessionEditor}', 'sales', 'edit', true),
      ('${users.financeManage}', 'sales', 'edit', true),
      ('${users.financeManage}', 'finance', 'manage_finance', true),
      ('${users.workshop}', 'workshop', 'view', true);

    insert into public.sales (id, organization_id, branch_id) values
      ('${sales.a}', '${org}', '${branchA}'),
      ('${sales.b}', '${org}', '${branchB}');
    insert into public.sale_lines (id, organization_id, sale_id) values
      ('${lines.a}', '${org}', '${sales.a}'),
      ('${lines.b}', '${org}', '${sales.b}');
    insert into public.sale_returns (id, organization_id, sale_id) values
      ('${returns.a}', '${org}', '${sales.a}'),
      ('${returns.b}', '${org}', '${sales.b}');
    insert into public.sale_return_lines (id, organization_id, return_id) values
      ('${returnLines.a}', '${org}', '${returns.a}'),
      ('${returnLines.b}', '${org}', '${returns.b}');
    insert into public.sale_fulfillment_details (sale_id, organization_id, installation_address, installation_maps_url) values
      ('${sales.a}', '${org}', 'Dirección privada A', 'https://maps.example/a'),
      ('${sales.b}', '${org}', 'Dirección privada B', 'https://maps.example/b');
    insert into public.production_jobs (id, organization_id, branch_id, sale_id, advisor_id) values
      ('${jobs.a}', '${org}', '${branchA}', '${sales.a}', '${users.sales}'),
      ('${jobs.b}', '${org}', '${branchB}', '${sales.b}', null);
    insert into public.cash_sessions (id, organization_id, branch_id, opened_by, status) values
      ('${sessions.ownA}', '${org}', '${branchA}', '${users.ownSessionEditor}', 'closed'),
      ('${sessions.otherA}', '${org}', '${branchA}', '${users.otherOpener}', 'open'),
      ('${sessions.b}', '${org}', '${branchB}', '${users.otherOpener}', 'closed');
    insert into public.sale_payments (id, organization_id, sale_id, method, cash_session_id) values
      ('${payments.ownA}', '${org}', '${sales.a}', 'cash', '${sessions.ownA}'),
      ('${payments.otherA}', '${org}', '${sales.a}', 'cash', '${sessions.otherA}'),
      ('${payments.unlinkedA}', '${org}', '${sales.a}', 'transfer', null),
      ('${payments.b}', '${org}', '${sales.b}', 'cash', '${sessions.b}');
    insert into public.cash_session_movements (id, organization_id, session_id) values
      ('${movements.ownA}', '${org}', '${sessions.ownA}'),
      ('${movements.otherA}', '${org}', '${sessions.otherA}'),
      ('${movements.b}', '${org}', '${sessions.b}');
    insert into public.cash_session_audits (id, organization_id, session_id) values
      ('${audits.ownA}', '${org}', '${sessions.ownA}'),
      ('${audits.otherA}', '${org}', '${sessions.otherA}'),
      ('${audits.b}', '${org}', '${sessions.b}');
    insert into public.sale_refund_settlements (id, organization_id, branch_id) values
      ('${refunds.a}', '${org}', '${branchA}'),
      ('${refunds.b}', '${org}', '${branchB}');
  `);

  await db.exec(migration);
  await db.exec('set role authenticated');
  return db;
}

async function asUser(db, userId) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function visibleIds(db, table) {
  const result = await db.query(`select id from public.${table} order by id`);
  return result.rows.map((row) => row.id);
}

async function visibleSaleIds(db, table) {
  const result = await db.query(`select sale_id from public.${table} order by sale_id`);
  return result.rows.map((row) => row.sale_id);
}

function assertIds(actual, expected, context) {
  assert.deepEqual(actual, [...expected].sort(), context);
}

test('membership without sales or finance permissions cannot read commercial data despite legacy policies', async () => {
  const db = await bootDb();
  try {
    await asUser(db, users.member);
    for (const table of ['sales', 'sale_lines', 'sale_returns', 'sale_return_lines', 'sale_payments', 'sale_refund_settlements']) {
      assertIds(await visibleIds(db, table), [], `${table} should be hidden`);
    }
    assertIds(await visibleSaleIds(db, 'sale_fulfillment_details'), [], 'installation details should be hidden');
  } finally {
    await db.close();
  }
});

test('sales.view and finance.view each reveal only their permitted branch sales, lines, returns, and sale-linked payments', async () => {
  for (const userId of [users.sales, users.finance]) {
    const db = await bootDb();
    try {
      await asUser(db, userId);
      assertIds(await visibleIds(db, 'sales'), [sales.a], 'only branch A sale');
      assertIds(await visibleIds(db, 'sale_lines'), [lines.a], 'line scope follows sale branch');
      assertIds(await visibleIds(db, 'sale_returns'), [returns.a], 'return scope follows sale branch');
      assertIds(await visibleIds(db, 'sale_return_lines'), [returnLines.a], 'return line scope follows sale branch');
      assertIds(await visibleIds(db, 'sale_payments'), [payments.ownA, payments.otherA, payments.unlinkedA], 'sales/finance permission reads payment through the sale branch');
      assertIds(await visibleSaleIds(db, 'sale_fulfillment_details'), userId === users.sales ? [sales.a] : [], 'finance.view alone must not reveal installation location');
      if (userId === users.sales) {
        assertIds(await visibleIds(db, 'sale_refund_settlements'), [refunds.a], 'settlements retain sales.view boundary');
      } else {
        assertIds(await visibleIds(db, 'sale_refund_settlements'), [], 'finance.view does not expand settlement access');
      }
    } finally {
      await db.close();
    }
  }
});

test('cash.view reads only linked payments and cash records in its permitted session branch', async () => {
  const db = await bootDb();
  try {
    await asUser(db, users.cash);
    assertIds(await visibleIds(db, 'sales'), [], 'cash-only cannot read sales');
    assertIds(await visibleIds(db, 'sale_lines'), [], 'cash-only cannot read sale lines');
    assertIds(await visibleIds(db, 'sale_returns'), [], 'cash-only cannot read sale returns');
    assertIds(await visibleIds(db, 'sale_return_lines'), [], 'cash-only cannot read return lines');
    assertIds(await visibleSaleIds(db, 'sale_fulfillment_details'), [], 'cash-only cannot read installation details');
    assertIds(await visibleIds(db, 'sale_refund_settlements'), [], 'cash-only cannot read settlements');
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.ownA, sessions.otherA], 'cash scope is branch-scoped');
    assertIds(await visibleIds(db, 'cash_session_movements'), [movements.ownA, movements.otherA], 'movements inherit the session branch');
    assertIds(await visibleIds(db, 'cash_session_audits'), [audits.ownA, audits.otherA], 'cash audits inherit the session branch');
    assertIds(await visibleIds(db, 'sale_payments'), [payments.ownA, payments.otherA], 'cash only sees payments linked to visible sessions; null sessions are hidden');
  } finally {
    await db.close();
  }
});

test('cash.manage_cash works without cash.view and remains branch-scoped', async () => {
  const db = await bootDb();
  try {
    await asUser(db, users.cashManage);
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.b], 'manage_cash sees only branch B sessions');
    assertIds(await visibleIds(db, 'cash_session_movements'), [movements.b], 'manage_cash sees matching movements');
    assertIds(await visibleIds(db, 'cash_session_audits'), [audits.b], 'manage_cash sees matching audits');
    assertIds(await visibleIds(db, 'sale_payments'), [payments.b], 'manage_cash sees linked payment in its session branch');
    assertIds(await visibleIds(db, 'sales'), [], 'cash permission alone does not reveal sales');
    assertIds(await visibleSaleIds(db, 'sale_fulfillment_details'), [], 'cash permission alone does not reveal installation details');
  } finally {
    await db.close();
  }
});

test('sales.edit implies sales.view in the permitted branch and exposes only the user own cash session', async () => {
  const db = await bootDb();
  try {
    await asUser(db, users.ownSessionEditor);
    assertIds(await visibleIds(db, 'sales'), [sales.a], 'sales.edit implies sales.view within its branch');
    assertIds(await visibleIds(db, 'sale_lines'), [lines.a], 'sale lines follow implied sales.view');
    assertIds(await visibleIds(db, 'sale_returns'), [returns.a], 'returns follow implied sales.view');
    assertIds(await visibleIds(db, 'sale_return_lines'), [returnLines.a], 'return lines follow implied sales.view');
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.ownA], 'own session is visible only to its opener');
    assertIds(await visibleIds(db, 'cash_session_movements'), [movements.ownA], 'own-session movements are visible');
    assertIds(await visibleIds(db, 'cash_session_audits'), [audits.ownA], 'only own-session audits are visible');
    assertIds(await visibleIds(db, 'sale_payments'), [payments.ownA, payments.otherA, payments.unlinkedA], 'payments follow the authorized sale branch');
    assertIds(await visibleIds(db, 'sale_refund_settlements'), [refunds.a], 'settlements retain their existing sales.view boundary');
    assertIds(await visibleSaleIds(db, 'sale_fulfillment_details'), [sales.a], 'sales.edit inherits sales.view and may read its branch details');
  } finally {
    await db.close();
  }
});

test('installation locations require sales.view, finance.manage_finance, or the linked workshop workflow', async () => {
  const financeDb = await bootDb();
  try {
    await asUser(financeDb, users.finance);
    assertIds(await visibleSaleIds(financeDb, 'sale_fulfillment_details'), [], 'finance.view by itself cannot read addresses or maps');
  } finally {
    await financeDb.close();
  }

  const managerDb = await bootDb();
  try {
    await asUser(managerDb, users.financeManage);
    assertIds(await visibleSaleIds(managerDb, 'sale_fulfillment_details'), [sales.a], 'finance.manage_finance keeps its authorized details');
  } finally {
    await managerDb.close();
  }

  const workshopDb = await bootDb();
  try {
    await asUser(workshopDb, users.workshop);
    assertIds(await visibleSaleIds(workshopDb, 'sale_fulfillment_details'), [sales.b], 'workshop.view reads only details linked to visible workshop jobs');
  } finally {
    await workshopDb.close();
  }
});

test('outsider without membership or module permissions sees no scoped rows', async () => {
  const db = await bootDb();
  try {
    await asUser(db, users.outsider);
    for (const table of ['sales', 'sale_lines', 'sale_returns', 'sale_return_lines', 'sale_payments', 'cash_sessions', 'cash_session_movements', 'cash_session_audits', 'sale_refund_settlements']) {
      assertIds(await visibleIds(db, table), [], `${table} should be hidden from outsider`);
    }
  } finally {
    await db.close();
  }
});

test('migration leaves grants, RLS enablement and existing customer policies untouched', () => {
  assert.doesNotMatch(migration, /\b(grant|revoke|enable row level security|disable row level security|create table|alter table public\.customers)\b/i);
  assert.doesNotMatch(migration, /drop policy\s+.*sale_refund_settlements/i);
  assert.match(migration, /create policy vc_sale_refund_settlements_read_permission_scope[\s\S]*?has_visualcorp_access\(organization_id, 'sales', 'view', branch_id\)/i);
  assert.doesNotMatch(migration, /customers_read|public\.customers/i);
});

const priority1Users = {
  advisorA: '10000000-0000-0000-0000-000000001201',
  advisorB: '10000000-0000-0000-0000-000000001202',
  cashierA: '10000000-0000-0000-0000-000000001203',
  financeB: '10000000-0000-0000-0000-000000001204',
  financeGlobal: '10000000-0000-0000-0000-000000001205',
  productionB: '10000000-0000-0000-0000-000000001206',
  managerA: '10000000-0000-0000-0000-000000001207',
  managerGlobal: '10000000-0000-0000-0000-000000001208',
};

const expenses = {
  a: '10000000-0000-0000-0000-000000001301',
  b: '10000000-0000-0000-0000-000000001302',
  global: '10000000-0000-0000-0000-000000001303',
};

const expensePayments = {
  a: '10000000-0000-0000-0000-000000001401',
  b: '10000000-0000-0000-0000-000000001402',
  global: '10000000-0000-0000-0000-000000001403',
};

async function bootPriority1MultiBranchDb() {
  const db = await bootDb();
  const financeRls = extractFinanceRlsFromPriority1(priority1Migration);
  await db.exec(`
    reset role;
    create or replace function app_private.has_visualcorp_access_orgwide(
      p_org uuid, p_module text, p_action text
    ) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (
        select 1
        from public.organization_memberships m
        join public.access_profiles p on p.id = m.profile_id and p.organization_id = m.organization_id
        left join public.access_profile_permissions permission
          on permission.profile_id = p.id and permission.module_key = p_module
          and permission.action_key = p_action and permission.enabled
        where m.organization_id = p_org and m.user_id = (select auth.uid())
          and m.active and m.branch_id is null and p.active
          and (m.role = 'owner' or permission.profile_id is not null or (
            p_action = 'view' and exists (
              select 1 from public.access_profile_permissions edit_permission
              where edit_permission.profile_id = p.id and edit_permission.module_key = p_module
                and edit_permission.action_key = 'edit' and edit_permission.enabled
            )
          ))
      );
    $$;
    grant execute on function app_private.has_visualcorp_access_orgwide(uuid, text, text) to authenticated;

    create table public.finance_expenses (
      id uuid primary key,
      organization_id uuid not null,
      branch_id uuid,
      category text not null default 'operativo'
    );
    create table public.finance_expense_payments (
      id uuid primary key,
      organization_id uuid not null,
      expense_id uuid not null,
      amount numeric not null default 100
    );
    alter table public.finance_expenses enable row level security;
    alter table public.finance_expense_payments enable row level security;
    grant select on public.finance_expenses, public.finance_expense_payments to authenticated;

    create policy finance_expenses_access_select on public.finance_expenses for select to authenticated
      using (app_private.has_org_role(organization_id));
    create policy finance_expense_payments_access_select on public.finance_expense_payments for select to authenticated
      using (app_private.has_org_role(organization_id));

    insert into public.access_profiles (id, organization_id, profile_key, active) values
      ('${priority1Users.advisorA}', '${org}', 'asesora_a', true),
      ('${priority1Users.advisorB}', '${org}', 'asesora_b', true),
      ('${priority1Users.cashierA}', '${org}', 'cajero_a', true),
      ('${priority1Users.financeB}', '${org}', 'finanzas_b', true),
      ('${priority1Users.financeGlobal}', '${org}', 'finanzas_global', true),
      ('${priority1Users.productionB}', '${org}', 'taller_b', true),
      ('${priority1Users.managerA}', '${org}', 'gerencia_a', true),
      ('${priority1Users.managerGlobal}', '${org}', 'gerencia_global', true);

    insert into public.organization_memberships (organization_id, user_id, branch_id, profile_id, role, active) values
      ('${org}', '${priority1Users.advisorA}', '${branchA}', '${priority1Users.advisorA}', 'advisor', true),
      ('${org}', '${priority1Users.advisorB}', '${branchB}', '${priority1Users.advisorB}', 'advisor', true),
      ('${org}', '${priority1Users.cashierA}', '${branchA}', '${priority1Users.cashierA}', 'advisor', true),
      ('${org}', '${priority1Users.financeB}', '${branchB}', '${priority1Users.financeB}', 'advisor', true),
      ('${org}', '${priority1Users.financeGlobal}', null, '${priority1Users.financeGlobal}', 'manager', true),
      ('${org}', '${priority1Users.productionB}', '${branchB}', '${priority1Users.productionB}', 'production', true),
      ('${org}', '${priority1Users.managerA}', '${branchA}', '${priority1Users.managerA}', 'manager', true),
      ('${org}', '${priority1Users.managerGlobal}', null, '${priority1Users.managerGlobal}', 'manager', true);

    insert into public.access_profile_permissions (profile_id, module_key, action_key, enabled) values
      ('${priority1Users.advisorA}', 'sales', 'view', true),
      ('${priority1Users.advisorA}', 'sales', 'edit', true),
      ('${priority1Users.advisorA}', 'cash', 'view', true),
      ('${priority1Users.advisorA}', 'cash', 'edit', true),
      ('${priority1Users.advisorA}', 'workshop', 'view', true),
      ('${priority1Users.advisorB}', 'sales', 'view', true),
      ('${priority1Users.advisorB}', 'sales', 'edit', true),
      ('${priority1Users.advisorB}', 'cash', 'view', true),
      ('${priority1Users.advisorB}', 'cash', 'edit', true),
      ('${priority1Users.advisorB}', 'workshop', 'view', true),
      ('${priority1Users.cashierA}', 'cash', 'view', true),
      ('${priority1Users.cashierA}', 'cash', 'manage_cash', true),
      ('${priority1Users.financeB}', 'finance', 'view', true),
      ('${priority1Users.financeGlobal}', 'finance', 'view', true),
      ('${priority1Users.productionB}', 'workshop', 'view', true),
      ('${priority1Users.productionB}', 'workshop', 'edit', true),
      ('${priority1Users.managerA}', 'sales', 'view', true),
      ('${priority1Users.managerA}', 'sales', 'edit', true),
      ('${priority1Users.managerA}', 'sales', 'settle_refund', true),
      ('${priority1Users.managerA}', 'cash', 'view', true),
      ('${priority1Users.managerA}', 'cash', 'manage_cash', true),
      ('${priority1Users.managerA}', 'finance', 'view', true),
      ('${priority1Users.managerA}', 'finance', 'manage_finance', true),
      ('${priority1Users.managerA}', 'workshop', 'view', true),
      ('${priority1Users.managerGlobal}', 'sales', 'view', true),
      ('${priority1Users.managerGlobal}', 'sales', 'edit', true),
      ('${priority1Users.managerGlobal}', 'sales', 'settle_refund', true),
      ('${priority1Users.managerGlobal}', 'cash', 'view', true),
      ('${priority1Users.managerGlobal}', 'cash', 'manage_cash', true),
      ('${priority1Users.managerGlobal}', 'finance', 'view', true),
      ('${priority1Users.managerGlobal}', 'finance', 'manage_finance', true),
      ('${priority1Users.managerGlobal}', 'workshop', 'view', true);

    insert into public.finance_expenses (id, organization_id, branch_id) values
      ('${expenses.a}', '${org}', '${branchA}'),
      ('${expenses.b}', '${org}', '${branchB}'),
      ('${expenses.global}', '${org}', null);
    insert into public.finance_expense_payments (id, organization_id, expense_id, amount) values
      ('${expensePayments.a}', '${org}', '${expenses.a}', 120),
      ('${expensePayments.b}', '${org}', '${expenses.b}', 240),
      ('${expensePayments.global}', '${org}', '${expenses.global}', 500);
  `);
  await db.exec(financeRls);
  await db.exec('set role authenticated');
  return db;
}

test('finance.view isolates finance_expenses and payments by branch_id while orgwide finance reads all scopes', async () => {
  const db = await bootPriority1MultiBranchDb();
  try {
    await asUser(db, users.finance);
    assertIds(await visibleIds(db, 'finance_expenses'), [expenses.a], 'branch-A finance sees only branch-A expenses');
    assertIds(await visibleIds(db, 'finance_expense_payments'), [expensePayments.a], 'branch-A finance sees only branch-A expense payments');

    await asUser(db, priority1Users.financeB);
    assertIds(await visibleIds(db, 'finance_expenses'), [expenses.b], 'branch-B finance sees only branch-B expenses');
    assertIds(await visibleIds(db, 'finance_expense_payments'), [expensePayments.b], 'branch-B finance sees only branch-B expense payments');
    assertIds(await visibleIds(db, 'sales'), [sales.b], 'branch-B finance sees only branch-B sales');

    await asUser(db, priority1Users.financeGlobal);
    assertIds(await visibleIds(db, 'finance_expenses'), [expenses.a, expenses.b, expenses.global], 'org-wide finance sees both branches plus global expenses');
    assertIds(await visibleIds(db, 'finance_expense_payments'), [expensePayments.a, expensePayments.b, expensePayments.global], 'org-wide finance sees all expense payments');
    assertIds(await visibleIds(db, 'sales'), [sales.a, sales.b], 'org-wide finance sees sales from both branches');
  } finally {
    await db.close();
  }
});

test('realistic advisor, cashier, production and manager profiles isolate data across two branches', async () => {
  const db = await bootPriority1MultiBranchDb();
  try {
    // Advisor in Branch A vs Branch B
    await asUser(db, priority1Users.advisorA);
    assertIds(await visibleIds(db, 'sales'), [sales.a], 'advisor A sees only branch A sales');
    assertIds(await visibleIds(db, 'sale_lines'), [lines.a], 'advisor A sees only branch A lines');
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.ownA, sessions.otherA], 'advisor A with cash.view sees only branch A cash sessions');
    assertIds(await visibleIds(db, 'production_jobs'), [jobs.a], 'advisor A sees only branch A jobs');
    assertIds(await visibleIds(db, 'finance_expenses'), [], 'advisor A cannot read finance expenses');
    assertIds(await visibleIds(db, 'finance_expense_payments'), [], 'advisor A cannot read finance expense payments');

    await asUser(db, priority1Users.advisorB);
    assertIds(await visibleIds(db, 'sales'), [sales.b], 'advisor B sees only branch B sales');
    assertIds(await visibleIds(db, 'sale_payments'), [payments.b], 'advisor B sees only branch B sale payments');
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.b], 'advisor B sees only branch B cash sessions');
    assertIds(await visibleIds(db, 'production_jobs'), [jobs.b], 'advisor B sees only branch B jobs');
    assertIds(await visibleIds(db, 'finance_expenses'), [], 'advisor B cannot read finance expenses');

    // Cashier (cash.view + cash.manage_cash) in Branch A
    await asUser(db, priority1Users.cashierA);
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.ownA, sessions.otherA], 'cashier A sees only branch A sessions');
    assertIds(await visibleIds(db, 'cash_session_movements'), [movements.ownA, movements.otherA], 'cashier A sees only branch A movements');
    assertIds(await visibleIds(db, 'sale_payments'), [payments.ownA, payments.otherA], 'cashier A sees only session-linked payments in branch A');
    assertIds(await visibleIds(db, 'sales'), [], 'cashier without sales.view cannot read sales');
    assertIds(await visibleIds(db, 'finance_expenses'), [], 'cashier without finance.view cannot read finance expenses');

    // Production (workshop) in Branch B
    await asUser(db, priority1Users.productionB);
    assertIds(await visibleIds(db, 'production_jobs'), [jobs.b], 'production B sees only branch B jobs');
    assertIds(await visibleSaleIds(db, 'sale_fulfillment_details'), [sales.b], 'production B reads fulfillment details only for branch B jobs');
    assertIds(await visibleIds(db, 'sales'), [], 'production cannot read sales');
    assertIds(await visibleIds(db, 'cash_sessions'), [], 'production cannot read cash sessions');
    assertIds(await visibleIds(db, 'finance_expenses'), [], 'production cannot read finance expenses');

    // Branch-scoped Manager vs Org-wide Manager
    await asUser(db, priority1Users.managerA);
    assertIds(await visibleIds(db, 'sales'), [sales.a], 'branch-A manager sees only branch A sales');
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.ownA, sessions.otherA], 'branch-A manager sees only branch A cash sessions');
    assertIds(await visibleIds(db, 'finance_expenses'), [expenses.a], 'branch-A manager cannot read branch B or org-wide null expenses');
    assertIds(await visibleIds(db, 'finance_expense_payments'), [expensePayments.a], 'branch-A manager sees only branch A expense payments');
    assertIds(await visibleIds(db, 'sale_refund_settlements'), [refunds.a], 'branch-A manager sees only branch A settlements');

    await asUser(db, priority1Users.managerGlobal);
    assertIds(await visibleIds(db, 'sales'), [sales.a, sales.b], 'org-wide manager sees sales from both branches');
    assertIds(await visibleIds(db, 'cash_sessions'), [sessions.ownA, sessions.otherA, sessions.b], 'org-wide manager sees all cash sessions');
    assertIds(await visibleIds(db, 'finance_expenses'), [expenses.a, expenses.b, expenses.global], 'org-wide manager sees branch and global expenses');
    assertIds(await visibleIds(db, 'finance_expense_payments'), [expensePayments.a, expensePayments.b, expensePayments.global], 'org-wide manager sees all expense payments');
    assertIds(await visibleIds(db, 'sale_refund_settlements'), [refunds.a, refunds.b], 'org-wide manager sees all settlements');
  } finally {
    await db.close();
  }
});
