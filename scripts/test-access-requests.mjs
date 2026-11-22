import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIG_INV = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027131235_organization_access_invitations.sql'), 'utf8');
const MIG_REQ = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261119184952_organization_access_requests.sql'), 'utf8');
const MIG_HARDEN = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261122050754_harden_access_profile_delegation.sql'), 'utf8');

const orgId = '00000000-0000-0000-0000-000000000001';
const otherOrgId = '00000000-0000-0000-0000-000000000002';
const ownerId = '00000000-0000-0000-0000-000000000010';
const applicantId = '00000000-0000-0000-0000-000000000020';
const otherId = '00000000-0000-0000-0000-000000000030';
const managerId = '00000000-0000-0000-0000-000000000040';
const advisorDelegatorId = '00000000-0000-0000-0000-000000000050';
const ownerProfileId = '00000000-0000-0000-0000-000000000101';
const profId = '00000000-0000-0000-0000-000000000100';
const managerProfileId = '00000000-0000-0000-0000-000000000102';
const financeProfileId = '00000000-0000-0000-0000-000000000103';
const limitedProfileId = '00000000-0000-0000-0000-000000000104';
const inactiveProfileId = '00000000-0000-0000-0000-000000000105';
const roleCreepProfileId = '00000000-0000-0000-0000-000000000106';
const advisorDelegatorProfileId = '00000000-0000-0000-0000-000000000107';
const otherOrgProfileId = '00000000-0000-0000-0000-000000000108';

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
    create table public.access_profile_permissions (
      profile_id uuid not null references public.access_profiles(id) on delete cascade,
      module_key text not null, action_key text not null, enabled boolean not null default false,
      primary key(profile_id, module_key, action_key)
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
    create or replace function app_private.has_visualcorp_access(p_org uuid, p_mod text, p_act text, p_branch uuid default null) returns boolean language sql stable security definer as $$
      select exists(
        select 1
        from public.organization_memberships m
        join public.access_profiles p on p.id = coalesce(m.profile_id, (
          select legacy.id from public.access_profiles legacy
          where legacy.organization_id = m.organization_id and legacy.profile_key = m.role limit 1
        )) and p.organization_id = m.organization_id
        left join public.access_profile_permissions permission
          on permission.profile_id = p.id and permission.module_key = p_mod and permission.action_key = p_act and permission.enabled
        where m.organization_id = p_org and m.user_id = auth.uid() and m.active and p.active
          and (p_branch is null or m.branch_id is null or m.branch_id = p_branch)
          and (m.role = 'owner' or permission.profile_id is not null or (p_act = 'view' and exists (
            select 1 from public.access_profile_permissions edit_permission
            where edit_permission.profile_id = p.id and edit_permission.module_key = p_mod
              and edit_permission.action_key = 'edit' and edit_permission.enabled
          )))
      );
    $$;
    create or replace function app_private.has_visualcorp_access_orgwide(p_org uuid, p_mod text, p_act text) returns boolean language sql stable security definer as $$
      select exists(
        select 1
        from public.organization_memberships m
        join public.access_profiles p on p.id = coalesce(m.profile_id, (
          select legacy.id from public.access_profiles legacy
          where legacy.organization_id = m.organization_id and legacy.profile_key = m.role limit 1
        )) and p.organization_id = m.organization_id
        left join public.access_profile_permissions permission
          on permission.profile_id = p.id and permission.module_key = p_mod and permission.action_key = p_act and permission.enabled
        where m.organization_id = p_org and m.user_id = auth.uid() and m.active and m.branch_id is null and p.active
          and (m.role = 'owner' or permission.profile_id is not null or (p_act = 'view' and exists (
            select 1 from public.access_profile_permissions edit_permission
            where edit_permission.profile_id = p.id and edit_permission.module_key = p_mod
              and edit_permission.action_key = 'edit' and edit_permission.enabled
          )))
      );
    $$;
    insert into public.organizations(id, slug, name) values ('${orgId}', 'visual-corp', 'Visual Corp');
    insert into public.organizations(id, slug, name) values ('${otherOrgId}', 'other-org', 'Other Org');
    insert into auth.users(id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data) values
      ('${ownerId}', 'owner@visualcorp.ec', now(), now(), '{"provider":"google"}', '{"full_name":"Admin"}'),
      ('${applicantId}', 'Applicant@example.com', now(), now() - interval '25 minutes', '{"providers":["google"]}', '{"full_name":"Test Applicant","picture":"https://img/b.png"}'),
      ('${otherId}', 'peer@example.com', now(), null, '{"provider":"google"}', '{"name":"Peer"}'),
      ('${managerId}', 'manager@example.com', now(), now(), '{"provider":"google"}', '{"name":"Manager"}'),
      ('${advisorDelegatorId}', 'advisor-manager@example.com', now(), now(), '{"provider":"google"}', '{"name":"Advisor manager"}');
    insert into public.access_profiles(id, organization_id, profile_key, name, base_role, active) values
      ('${ownerProfileId}', '${orgId}', 'owner', 'Owner', 'owner', true),
      ('${profId}', '${orgId}', 'advisor', 'Asesor Comercial', 'advisor', true),
      ('${managerProfileId}', '${orgId}', 'delegator', 'Delegator', 'manager', true),
      ('${financeProfileId}', '${orgId}', 'gerencia', 'Gerencia', 'manager', true),
      ('${limitedProfileId}', '${orgId}', 'sales_view', 'Sales view', 'advisor', true),
      ('${inactiveProfileId}', '${orgId}', 'inactive', 'Inactive', 'advisor', false),
      ('${roleCreepProfileId}', '${orgId}', 'manager_without_grants', 'Manager without grants', 'manager', true),
      ('${advisorDelegatorProfileId}', '${orgId}', 'advisor_delegator', 'Advisor delegator', 'advisor', true),
      ('${otherOrgProfileId}', '${otherOrgId}', 'cross_org', 'Cross org', 'advisor', true);
    insert into public.access_profile_permissions(profile_id, module_key, action_key, enabled) values
      ('${managerProfileId}', 'team', 'manage_members', true),
      ('${managerProfileId}', 'sales', 'view', true),
      ('${financeProfileId}', 'finance', 'manage_finance', true),
      ('${limitedProfileId}', 'sales', 'view', true),
      ('${advisorDelegatorProfileId}', 'team', 'manage_members', true);
    insert into public.organization_memberships(organization_id, user_id, role, active, profile_id) values
      ('${orgId}', '${ownerId}', 'owner', true, '${ownerProfileId}'),
      ('${orgId}', '${managerId}', 'manager', true, '${managerProfileId}'),
      ('${orgId}', '${advisorDelegatorId}', 'advisor', true, '${advisorDelegatorProfileId}');
  `);
  await db.exec(MIG_INV);
  await db.exec(MIG_REQ);
  await db.exec(MIG_HARDEN);
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

test('organization access invitations cap delegated grants and block self-assignment', async () => {
  const db = await bootDb();

  await setActor(db, managerId);
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3)`, [orgId, 'peer@example.com', financeProfileId]),
    /No puedes delegar permisos/
  );
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3)`, [orgId, 'manager@example.com', limitedProfileId]),
    /No puedes asignarte un perfil/
  );
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3)`, [orgId, 'peer@example.com', inactiveProfileId]),
    /El perfil no existe o no se puede asignar/
  );
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3)`, [orgId, 'peer@example.com', otherOrgProfileId]),
    /El perfil no existe o no se puede asignar/
  );

  const limited = await db.query(`select public.create_organization_access_invitation($1, $2, $3) as res`, [orgId, 'peer@example.com', limitedProfileId]);
  assert.equal(limited.rows[0].res.status, 'assigned');
  const limitedMembership = await db.query(`select role, profile_id from public.organization_memberships where organization_id = $1 and user_id = $2`, [orgId, otherId]);
  assert.equal(limitedMembership.rows[0].role, 'advisor');
  assert.equal(limitedMembership.rows[0].profile_id, limitedProfileId);

  await setActor(db, advisorDelegatorId);
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3)`, [orgId, 'applicant@example.com', roleCreepProfileId]),
    /rol base superior/
  );

  await setActor(db, ownerId);
  const elevated = await db.query(`select public.create_organization_access_invitation($1, $2, $3) as res`, [orgId, 'peer@example.com', financeProfileId]);
  assert.equal(elevated.rows[0].res.status, 'assigned');
  const financeMembership = await db.query(`select role, profile_id from public.organization_memberships where organization_id = $1 and user_id = $2 and profile_id = $3`, [orgId, otherId, financeProfileId]);
  assert.equal(financeMembership.rows[0].role, 'manager');

  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3)`, [orgId, 'owner@visualcorp.ec', limitedProfileId]),
    /No puedes asignarte un perfil/
  );
});

test('claim revokes pending invitations whose inviter no longer has delegated authority', async () => {
  const db = await bootDb();

  // Simulate legacy invitations written before the delegation ceiling existed:
  // one over-grants finance, while the other grants only a permission the manager has.
  await db.query(`
    insert into public.organization_access_invitations(organization_id, profile_id, invited_email, invited_by, expires_at)
    values
      ($1, $2, 'applicant@example.com', $3, now() + interval '7 days'),
      ($1, $4, 'applicant@example.com', $3, now() + interval '7 days')
  `, [orgId, financeProfileId, managerId, limitedProfileId]);

  await setActor(db, applicantId);
  let claim = await db.query(`select public.claim_organization_access_invitations() as count`);
  assert.equal(claim.rows[0].count, 1);

  const applicantInvitations = await db.query(`
    select profile_id, status from public.organization_access_invitations
    where organization_id = $1 and normalized_email = 'applicant@example.com'
  `, [orgId]);
  assert.deepEqual(
    Object.fromEntries(applicantInvitations.rows.map((row) => [row.profile_id, row.status])),
    { [financeProfileId]: 'revoked', [limitedProfileId]: 'accepted' }
  );
  const applicantMemberships = await db.query(`
    select profile_id from public.organization_memberships
    where organization_id = $1 and user_id = $2 and branch_id is null
  `, [orgId, applicantId]);
  assert.deepEqual(applicantMemberships.rows.map((row) => row.profile_id), [limitedProfileId]);

  // A valid invitation also becomes unusable if its inviter loses the grant
  // that authorized organization-wide membership changes.
  await db.query(`
    insert into public.organization_access_invitations(organization_id, profile_id, invited_email, invited_by, expires_at)
    values ($1, $2, 'peer@example.com', $3, now() + interval '7 days')
  `, [orgId, limitedProfileId, managerId]);
  await db.query(`
    update public.access_profile_permissions
    set enabled = false
    where profile_id = $1 and module_key = 'team' and action_key = 'manage_members'
  `, [managerProfileId]);

  await setActor(db, otherId);
  claim = await db.query(`select public.claim_organization_access_invitations() as count`);
  assert.equal(claim.rows[0].count, 0);

  const staleInvitation = await db.query(`
    select status from public.organization_access_invitations
    where organization_id = $1 and normalized_email = 'peer@example.com' and profile_id = $2
  `, [orgId, limitedProfileId]);
  assert.equal(staleInvitation.rows[0].status, 'revoked');
  const peerMembership = await db.query(`
    select 1 from public.organization_memberships
    where organization_id = $1 and user_id = $2 and profile_id = $3 and branch_id is null
  `, [orgId, otherId, limitedProfileId]);
  assert.equal(peerMembership.rows.length, 0);

  const revocations = await db.query(`
    select details->>'email' as email, details->>'reason' as reason
    from public.access_audit_log
    where event_key = 'profile_invitation_revoked'
    order by id
  `);
  assert.deepEqual(revocations.rows.map((row) => row.email), ['applicant@example.com', 'peer@example.com']);
  assert.deepEqual(revocations.rows.map((row) => row.reason), [
    'inviter_authority_or_permissions_changed',
    'inviter_authority_or_permissions_changed'
  ]);
});
