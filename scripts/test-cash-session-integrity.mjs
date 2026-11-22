import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(__dirname, '../supabase/migrations/20261122050814_prevent_reopening_cash_amount_mutation.sql');
const amendmentMigrationPath = path.join(__dirname, '../supabase/migrations/20261122050818_validate_cash_session_on_sale_amendment.sql');
const openMigration = fs.readFileSync(migrationPath, 'utf8');
const amendmentMigration = fs.readFileSync(amendmentMigrationPath, 'utf8');
const posSaleEditor = fs.readFileSync(path.join(__dirname, '../src/pages/pos/components/POSSaleEditorModal.tsx'), 'utf8');
const commercialDocumentDetails = fs.readFileSync(path.join(__dirname, '../src/components/CommercialDocumentDetails.tsx'), 'utf8');

function extractSqlBlock(sql, startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing SQL block: ${startMarker}`);
  assert.notEqual(end, -1, `Missing SQL end marker: ${endMarker}`);
  return sql.slice(start, end);
}

const openFunction = extractSqlBlock(
  openMigration,
  'create or replace function public.open_pos_cash_session(',
  'revoke all on function public.open_pos_cash_session('
);
const attachFunction = extractSqlBlock(
  amendmentMigration,
  'create or replace function app_private.attach_open_cash_session()',
  'revoke all on function app_private.attach_open_cash_session()'
);
const resolveAmendmentSessionFunction = extractSqlBlock(
  amendmentMigration,
  'create or replace function app_private.resolve_pos_sale_amendment_cash_session(',
  'revoke all on function app_private.resolve_pos_sale_amendment_cash_session('
);
const amendFunction = extractSqlBlock(
  amendmentMigration,
  'create or replace function public.amend_confirmed_pos_sale(',
  'revoke all on function public.amend_confirmed_pos_sale('
);

const orgId = '00000000-0000-0000-0000-000000000001';
const actorId = '00000000-0000-0000-0000-000000000010';
const branchA = '00000000-0000-0000-0000-000000000101';
const branchB = '00000000-0000-0000-0000-000000000102';
const saleA = '00000000-0000-0000-0000-000000000201';
const sessionA = '00000000-0000-0000-0000-000000000301';
const sessionB = '00000000-0000-0000-0000-000000000302';
const sessionA2 = '00000000-0000-0000-0000-000000000303';
const paymentA = '00000000-0000-0000-0000-000000000401';
const paymentA2 = '00000000-0000-0000-0000-000000000402';

async function bootDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema app_private;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create or replace function app_private.has_visualcorp_access(uuid, text, text, uuid default null)
      returns boolean language sql stable as $$ select true $$;
    create table public.branches (
      id uuid primary key,
      organization_id uuid not null,
      name text not null,
      active boolean not null default true
    );
    create table public.cash_registers (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      branch_id uuid not null,
      name text not null,
      assigned_advisor_id uuid,
      active boolean not null default true,
      created_by uuid not null,
      created_at timestamptz not null default now()
    );
    create table public.cash_sessions (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      branch_id uuid not null,
      cash_register_id uuid,
      opened_by uuid not null,
      opening_cash numeric not null default 0,
      status text not null default 'open',
      opened_at timestamptz not null default now(),
      closing_denominations jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
    create table public.sales (
      id uuid primary key,
      organization_id uuid not null,
      branch_id uuid not null
    );
    create table public.sale_payments (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      sale_id uuid not null,
      method text not null,
      amount numeric not null,
      created_by uuid not null,
      cash_session_id uuid
    );
    insert into public.branches(id, organization_id, name) values
      ('${branchA}', '${orgId}', 'A'),
      ('${branchB}', '${orgId}', 'B');
    insert into public.sales(id, organization_id, branch_id)
      values ('${saleA}', '${orgId}', '${branchA}');
    insert into public.cash_sessions(id, organization_id, branch_id, opened_by, opening_cash, status)
      values
        ('${sessionA}', '${orgId}', '${branchA}', '${actorId}', 12.50, 'closed'),
        ('${sessionB}', '${orgId}', '${branchB}', '${actorId}', 70.00, 'closed'),
        ('${sessionA2}', '${orgId}', '${branchA}', '${actorId}', 35.00, 'closed');
  `);
  await db.exec(openFunction);
  await db.exec(attachFunction);
  await db.exec(resolveAmendmentSessionFunction);
  await db.exec(`
    create trigger attach_open_cash_session
      before insert on public.sale_payments
      for each row execute function app_private.attach_open_cash_session();
  `);
  await db.exec(`set request.jwt.claim.sub = '${actorId}';`);
  return db;
}

test('reopening an active cash session returns its recorded opening amount unchanged', async () => {
  const db = await bootDb();
  try {
    const created = await db.query(
      'select public.open_pos_cash_session($1, $2) as result',
      [branchA, 20]
    );
    assert.equal(created.rows[0].result.opening_cash, 20);
    assert.equal(created.rows[0].result.already_open, false);

    const retried = await db.query(
      'select public.open_pos_cash_session($1, $2) as result',
      [branchA, 500]
    );
    assert.equal(retried.rows[0].result.opening_cash, 20);
    assert.equal(retried.rows[0].result.already_open, true);

    const stored = await db.query(
      'select opening_cash from public.cash_sessions where branch_id = $1 and status = $2',
      [branchA, 'open']
    );
    assert.equal(Number(stored.rows[0].opening_cash), 20);
  } finally {
    await db.close();
  }
});

test('cash payment cannot be routed to a session in a different branch', async () => {
  const db = await bootDb();
  try {
    await assert.rejects(
      () => db.query(
        `insert into public.sale_payments(organization_id, sale_id, method, amount, created_by, cash_session_id)
         values ($1, $2, 'cash', 15, $3, $4)`,
        [orgId, saleA, actorId, sessionB]
      ),
      /no corresponde a la sucursal de esta venta/i
    );

    await db.query(
      `insert into public.sale_payments(organization_id, sale_id, method, amount, created_by, cash_session_id)
       values ($1, $2, 'cash', 15, $3, $4)`,
      [orgId, saleA, actorId, sessionA]
    );
    const linked = await db.query('select cash_session_id from public.sale_payments');
    assert.equal(linked.rows[0].cash_session_id, sessionA);
  } finally {
    await db.close();
  }
});

test('cash payment without an open shift is rejected and an open shift is attached automatically', async () => {
  const db = await bootDb();
  try {
    await assert.rejects(
      () => db.query(
        `insert into public.sale_payments(organization_id, sale_id, method, amount, created_by)
         values ($1, $2, 'cash', 15, $3)`,
        [orgId, saleA, actorId]
      ),
      /no hay una caja abierta para este pago/i
    );

    await db.query("update public.cash_sessions set status = 'open' where id = $1", [sessionA]);
    await db.query(
      `insert into public.sale_payments(organization_id, sale_id, method, amount, created_by)
       values ($1, $2, 'cash', 15, $3)`,
      [orgId, saleA, actorId]
    );
    const linked = await db.query('select cash_session_id from public.sale_payments');
    assert.equal(linked.rows[0].cash_session_id, sessionA);
  } finally {
    await db.close();
  }
});

test('amendment restores each prior payment session by payment id and prefers the current open session for new cash', async () => {
  const db = await bootDb();
  try {
    await db.query(
      `insert into public.sale_payments(id, organization_id, sale_id, method, amount, created_by, cash_session_id)
       values
         ($1, $3, $4, 'cash', 12, $5, $6),
         ($2, $3, $4, 'cash', 18, $5, $7)`,
      [paymentA, paymentA2, orgId, saleA, actorId, sessionA, sessionA2]
    );
    const mapResult = await db.query(
      `select coalesce(jsonb_object_agg(id::text, cash_session_id::text), '{}'::jsonb) as payment_sessions
       from public.sale_payments
       where sale_id = $1 and method = 'cash' and cash_session_id is not null`,
      [saleA]
    );
    const priorPaymentSessions = mapResult.rows[0].payment_sessions;

    const previousPaymentA = await db.query(
      `select app_private.resolve_pos_sale_amendment_cash_session(
        null, $1, $2, array[$3, $4]::uuid[], null, $3
      ) as session_id`,
      [paymentA, priorPaymentSessions, sessionA, sessionA2]
    );
    assert.equal(previousPaymentA.rows[0].session_id, sessionA);

    const previousPaymentA2 = await db.query(
      `select app_private.resolve_pos_sale_amendment_cash_session(
        null, $1, $2, array[$3, $4]::uuid[], null, $3
      ) as session_id`,
      [paymentA2, priorPaymentSessions, sessionA, sessionA2]
    );
    assert.equal(previousPaymentA2.rows[0].session_id, sessionA2);

    await db.query("update public.cash_sessions set status = 'open' where id = $1", [sessionA2]);
    const openSession = await db.query(
      `select id from public.cash_sessions
       where organization_id = $1 and branch_id = $2 and opened_by = $3 and status = 'open'
       order by opened_at desc limit 1`,
      [orgId, branchA, actorId]
    );
    assert.equal(openSession.rows[0].id, sessionA2);

    const newPaymentUsesCurrentOpen = await db.query(
      `select app_private.resolve_pos_sale_amendment_cash_session(
        null, null, $1, array[$2, $3]::uuid[], $3, coalesce($3, $2)
      ) as session_id`,
      [priorPaymentSessions, sessionA, sessionA2]
    );
    assert.equal(newPaymentUsesCurrentOpen.rows[0].session_id, sessionA2);

    await assert.rejects(
      () => db.query(
        `select app_private.resolve_pos_sale_amendment_cash_session(
          $1, null, $2, array[$3, $4]::uuid[], null, $3
        )`,
        [sessionB, priorPaymentSessions, sessionA, sessionA2]
      ),
      /ajena a esta venta/i
    );
  } finally {
    await db.close();
  }
});

test('amendment preserves prior same-branch sessions and migrations retain their RPC grants', () => {
  const mapCreatedBeforeDelete = amendFunction.indexOf('into v_previous_payment_sessions');
  const paymentsDeleted = amendFunction.indexOf('delete from public.sale_payments where sale_id = v_sale.id');
  assert.ok(mapCreatedBeforeDelete >= 0 && mapCreatedBeforeDelete < paymentsDeleted, 'historical payment/session map must be read before payments are deleted');
  assert.match(amendFunction, /jsonb_object_agg\(sp\.id::text, sp\.cash_session_id::text\)/i);
  assert.match(amendFunction, /app_private\.resolve_pos_sale_amendment_cash_session\([\s\S]*?v_payment->>'id'[\s\S]*?v_previous_payment_sessions[\s\S]*?v_touched_sessions[\s\S]*?v_current_open_session[\s\S]*?coalesce\(v_current_open_session, v_prev_cash_session\)/i);
  assert.match(amendFunction, /join public\.cash_sessions cs[\s\S]*?cs\.branch_id = v_sale\.branch_id/i);
  assert.match(amendFunction, /branch_id = v_sale\.branch_id[\s\S]*?opened_by = v_user[\s\S]*?status = 'open'/i);
  assert.match(openMigration, /revoke all on function public\.open_pos_cash_session\([^\n]+from public, anon;\s*grant execute on function public\.open_pos_cash_session\([^\n]+to authenticated;/i);
  assert.match(amendmentMigration, /revoke all on function public\.amend_confirmed_pos_sale\([^\n]+from public, anon;\s*grant execute on function public\.amend_confirmed_pos_sale\([^\n]+to authenticated;/i);
  assert.match(amendmentMigration, /revoke all on function app_private\.resolve_pos_sale_amendment_cash_session\(uuid, text, jsonb, uuid\[\], uuid, uuid\) from public, anon, authenticated;/i);
});

test('both sale editors retain historical payment sessions in their amendment payloads', () => {
  assert.match(posSaleEditor, /\.select\('id, method, amount, reference, note, cash_session_id'\)/);
  assert.match(posSaleEditor, /cash_session_id:\s*typeof p\.cash_session_id === 'string' \? p\.cash_session_id : null/);
  assert.match(posSaleEditor, /cash_session_id:\s*typeof p\.cash_session_id === 'string' \? p\.cash_session_id : null,[\s\S]*?method:\s*p\.method/);

  assert.match(commercialDocumentDetails, /sale_payments\(id,method,amount,reference,note,cash_session_id,created_at\)/);
  assert.match(commercialDocumentDetails, /cash_session_id:\s*p\.cash_session_id \|\| null/);
  assert.match(commercialDocumentDetails, /note:\s*p\.note\?\.trim\(\) \|\| '',\s*cash_session_id:\s*p\.cash_session_id \|\| null/);
});
