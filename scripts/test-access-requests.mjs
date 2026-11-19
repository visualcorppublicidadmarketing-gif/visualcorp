import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG_INV = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027131235_organization_access_invitations.sql'), 'utf8');
const MIG_REQ = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261119184952_organization_access_requests.sql'), 'utf8');

const orgId = '00000000-0000-0000-0000-000000000001';
const ownerId = '00000000-0000-0000-0000-000000000010';
const applicantId = '00000000-0000-0000-0000-000000000020';
const otherId = '00000000-0000-0000-0000-000000000030';
const profId = '00000000-0000-0000-0000-000000000100';

async function bootDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema app_private;
    create table auth.users (
      id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(), last_sign_in_at timestamptz
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.organizations (id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null);
    create table public.access_profiles (
      id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
      profile_key text not null, name text not null, base_role text not null, active boolean not null default true,
      unique(id, organization_id), unique(organization_id, profile_key)
    );
    create table public.organization_memberships (
      id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
      branch_id uuid, user_id uuid not null references auth.users(id) on delete cascade,
      role text not null, active boolean not null default true, profile_id uuid references public.access_profiles(id)
    );
    create unique index org_mem_uq on public.organization_memberships(organization_id, user_id, profile_id) where branch_id is null and profile_id is not null;
    create table public.access_audit_log (
      id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
      actor_user_id uuid not null references auth.users(id), target_user_id uuid references auth.users(id),
      profile_id uuid references public.access_profiles(id), event_key text not null,
      details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
    );
    create or replace function app_private.has_org_role(p_org uuid, p_branch uuid, p_roles text[]) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.organization_memberships where organization_id = p_org and user_id = auth.uid() and active and role = any(p_roles));
    $$;
    create or replace function app_private.has_visualcorp_access(p_org uuid, p_mod text, p_act text) returns boolean language sql stable security definer as $$
      select exists(select 1 from public.organization_memberships where organization_id = p_org and user_id = auth.uid() and active and role in ('owner','admin','manager'));
    $$;
    insert into public.organizations(id, slug, name) values ('${orgId}', 'visual-corp', 'Visual Corp');
    insert into auth.users(id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data) values
      ('${ownerId}', 'owner@visualcorp.ec', now(), now(), '{"provider":"google"}', '{"full_name":"Admin"}'),
      ('${applicantId}', 'Applicant@example.com', now(), now() - interval '25 minutes', '{"providers":["google"]}', '{"full_name":"Test Applicant","picture":"https://img/b.png"}'),
      ('${otherId}', 'peer@example.com', now(), null, '{"provider":"google"}', '{"name":"Peer"}');
    insert into public.access_profiles(id, organization_id, profile_key, name, base_role)
      values ('${profId}', '${orgId}', 'advisor', 'Asesor Comercial', 'advisor');
    insert into public.organization_memberships(organization_id, user_id, role, active)
      values ('${orgId}', '${ownerId}', 'owner', true);
  `);
  await db.exec(MIG_INV);
  await db.exec(MIG_REQ);
  return db;
}

const setActor = (db, id) => db.exec(`set request.jwt.claim.sub = '${id || ''}';`);

test('access requests lifecycle: 7-day backfill, record, spam debounce, list, approve, dismiss & 24h cooldown', async () => {
  const db = await bootDb();

  // 0) Backfill inserted the applicant (recent login <7d without membership) but NOT owner or peer (null last_sign_in_at)
  await setActor(db, ownerId);
  const backfilled = await db.query(`select * from public.list_organization_access_requests('${orgId}')`);
  assert.equal(backfilled.rows.length, 1);
  assert.equal(backfilled.rows[0].email, 'applicant@example.com');
  assert.equal(backfilled.rows[0].request_count, 1);

  // 1) Existing member gets already_has_access
  let r = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(r.rows[0].res.status, 'already_has_access');

  // 2) the applicant records request (>10m since backfilled last_seen_at -> count=2) + immediate retry stays at 2
  await setActor(db, applicantId);
  r = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(r.rows[0].res.status, 'recorded');
  r = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(r.rows[0].res.status, 'recorded');

  // 3) Unauthorized user cannot list requests
  await assert.rejects(() => db.query(`select * from public.list_organization_access_requests('${orgId}')`));

  // 4) Admin lists pending request with updated request_count = 2
  await setActor(db, ownerId);
  const list = await db.query(`select * from public.list_organization_access_requests('${orgId}')`);
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].email, 'applicant@example.com');
  assert.equal(list.rows[0].full_name, 'Test Applicant');
  assert.equal(list.rows[0].avatar_url, 'https://img/b.png');
  assert.equal(list.rows[0].request_count, 2);

  // 5) Approve assigns membership, logs audit, clears pending list
  const appRes = await db.query(`select public.approve_organization_access_request('${list.rows[0].id}', '${profId}') as res`);
  assert.deepEqual(appRes.rows[0].res, { status: 'approved', email: 'applicant@example.com', profile_name: 'Asesor Comercial' });

  await setActor(db, applicantId);
  r = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(r.rows[0].res.status, 'already_has_access');

  // 6) Dismiss & 24h cooldown on second user
  await setActor(db, otherId);
  await db.query(`select public.record_my_access_request()`);
  await setActor(db, ownerId);
  const list2 = await db.query(`select * from public.list_organization_access_requests('${orgId}')`);
  assert.equal(list2.rows.length, 1);
  await db.query(`select public.dismiss_organization_access_request('${list2.rows[0].id}')`);

  await setActor(db, otherId);
  r = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(r.rows[0].res.status, 'dismissed');

  await db.exec(`update public.organization_access_requests set resolved_at = now() - interval '25 hours' where user_id = '${otherId}'`);
  r = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(r.rows[0].res.status, 'recorded');

  const audits = await db.query(`select event_key from public.access_audit_log where event_key like 'access_request_%' order by id`);
  assert.deepEqual(audits.rows.map((x) => x.event_key), ['access_request_approved', 'access_request_dismissed']);
});