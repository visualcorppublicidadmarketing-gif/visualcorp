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
const MIG_PRIORITY1 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261127010000_priority1_branch_permissions_and_roles.sql'), 'utf8');

const orgId = '00000000-0000-0000-0000-000000000001';
const otherOrgId = '00000000-0000-0000-0000-000000000002';
const branchAId = '00000000-0000-0000-0000-000000000301';
const branchBId = '00000000-0000-0000-0000-000000000302';
const inactiveBranchId = '00000000-0000-0000-0000-000000000303';
const otherOrgBranchId = '00000000-0000-0000-0000-000000000304';
const ownerId = '00000000-0000-0000-0000-000000000010';
const applicantId = '00000000-0000-0000-0000-000000000020';
const otherId = '00000000-0000-0000-0000-000000000030';
const managerId = '00000000-0000-0000-0000-000000000040';
const advisorDelegatorId = '00000000-0000-0000-0000-000000000050';
const branchManagerAId = '00000000-0000-0000-0000-000000000060';
const ownerProfileId = '00000000-0000-0000-0000-000000000101';
const profId = '00000000-0000-0000-0000-000000000100';
const managerProfileId = '00000000-0000-0000-0000-000000000102';
const financeProfileId = '00000000-0000-0000-0000-000000000103';
const limitedProfileId = '00000000-0000-0000-0000-000000000104';
const inactiveProfileId = '00000000-0000-0000-0000-000000000105';
const roleCreepProfileId = '00000000-0000-0000-0000-000000000106';
const advisorDelegatorProfileId = '00000000-0000-0000-0000-000000000107';
const otherOrgProfileId = '00000000-0000-0000-0000-000000000108';
const branchManagerProfileId = '00000000-0000-0000-0000-000000000109';

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
    create table public.branches (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      code text not null,
      name text not null,
      active boolean not null default true,
      unique (id, organization_id)
    );
    create table public.profiles (
      user_id uuid primary key references auth.users(id) on delete cascade,
      full_name text not null default '',
      email text
    );
    create table public.access_profiles (
      id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
      profile_key text not null, name text not null, description text not null default '',
      base_role text not null, is_system boolean not null default false, active boolean not null default true,
      created_by uuid references auth.users(id) on delete set null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
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
      role text not null, active boolean not null default true, profile_id uuid references public.access_profiles(id),
      created_at timestamptz not null default now()
    );
    create unique index org_mem_uq on public.organization_memberships(organization_id, user_id, profile_id) where branch_id is null and profile_id is not null;
    create unique index org_mem_branch_uq on public.organization_memberships(organization_id, user_id, profile_id, branch_id) where branch_id is not null and profile_id is not null;
    create table public.access_audit_log (
      id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
      actor_user_id uuid not null references auth.users(id), target_user_id uuid references auth.users(id),
      profile_id uuid references public.access_profiles(id), event_key text not null,
      details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
    );
    create table public.finance_expenses (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      branch_id uuid
    );
    create table public.finance_expense_payments (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      expense_id uuid not null references public.finance_expenses(id) on delete cascade
    );
    alter table public.finance_expenses enable row level security;
    alter table public.finance_expense_payments enable row level security;
    create table public.team_work_hours (
      organization_id uuid not null references public.organizations(id) on delete cascade,
      weekday smallint not null,
      is_open boolean not null default false,
      opens_at time,
      closes_at time
    );
    create table public.team_work_exceptions (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      work_date date not null,
      user_id uuid,
      kind text not null,
      opens_at time,
      closes_at time,
      note text not null default ''
    );
    create or replace function app_private.is_work_access_open(p_org uuid, p_user uuid) returns boolean language sql stable as $$
      select coalesce(nullif(current_setting('app.work_access_open', true), ''), 'true') <> 'false';
    $$;
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
    insert into public.branches(id, organization_id, code, name, active) values
      ('${branchAId}', '${orgId}', 'NTE', 'Matriz Norte', true),
      ('${branchBId}', '${orgId}', 'SUR', 'Sucursal Sur', true),
      ('${inactiveBranchId}', '${orgId}', 'INA', 'Sucursal Cerrada', false),
      ('${otherOrgBranchId}', '${otherOrgId}', 'EXT', 'Otra Organización', true);
    insert into auth.users(id, email, email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data) values
      ('${ownerId}', 'owner@visualcorp.ec', now(), now(), '{"provider":"google"}', '{"full_name":"Admin"}'),
      ('${applicantId}', 'Applicant@example.com', now(), now() - interval '25 minutes', '{"providers":["google"]}', '{"full_name":"Test Applicant","picture":"https://img/b.png"}'),
      ('${otherId}', 'peer@example.com', now(), null, '{"provider":"google"}', '{"name":"Peer"}'),
      ('${managerId}', 'manager@example.com', now(), now(), '{"provider":"google"}', '{"name":"Manager"}'),
      ('${advisorDelegatorId}', 'advisor-manager@example.com', now(), now(), '{"provider":"google"}', '{"name":"Advisor manager"}'),
      ('${branchManagerAId}', 'branch-manager@example.com', now(), now(), '{"provider":"google"}', '{"name":"Branch manager A"}');
    insert into public.profiles(user_id, full_name, email) values
      ('${ownerId}', 'Admin Propietario', 'owner@visualcorp.ec'),
      ('${applicantId}', 'Test Applicant', 'applicant@example.com'),
      ('${otherId}', 'Peer User', 'peer@example.com'),
      ('${managerId}', 'Manager Global', 'manager@example.com'),
      ('${advisorDelegatorId}', 'Advisor Manager', 'advisor-manager@example.com'),
      ('${branchManagerAId}', 'Encargado Norte', 'branch-manager@example.com');
    insert into public.access_profiles(id, organization_id, profile_key, name, base_role, active) values
      ('${ownerProfileId}', '${orgId}', 'owner', 'Owner', 'owner', true),
      ('${profId}', '${orgId}', 'advisor', 'Asesor Comercial', 'advisor', true),
      ('${managerProfileId}', '${orgId}', 'delegator', 'Delegator', 'manager', true),
      ('${financeProfileId}', '${orgId}', 'gerencia', 'Gerencia', 'manager', true),
      ('${limitedProfileId}', '${orgId}', 'sales_view', 'Sales view', 'advisor', true),
      ('${inactiveProfileId}', '${orgId}', 'inactive', 'Inactive', 'advisor', false),
      ('${roleCreepProfileId}', '${orgId}', 'manager_without_grants', 'Manager without grants', 'manager', true),
      ('${advisorDelegatorProfileId}', '${orgId}', 'advisor_delegator', 'Advisor delegator', 'advisor', true),
      ('${otherOrgProfileId}', '${otherOrgId}', 'cross_org', 'Cross org', 'advisor', true),
      ('${branchManagerProfileId}', '${orgId}', 'encargado_norte', 'Encargado Norte', 'manager', true);
    insert into public.access_profile_permissions(profile_id, module_key, action_key, enabled) values
      ('${managerProfileId}', 'team', 'manage_members', true),
      ('${managerProfileId}', 'sales', 'view', true),
      ('${financeProfileId}', 'finance', 'manage_finance', true),
      ('${limitedProfileId}', 'sales', 'view', true),
      ('${advisorDelegatorProfileId}', 'team', 'manage_members', true),
      ('${branchManagerProfileId}', 'team', 'view', true),
      ('${branchManagerProfileId}', 'team', 'manage_members', true),
      ('${branchManagerProfileId}', 'sales', 'view', true);
    insert into public.organization_memberships(organization_id, branch_id, user_id, role, active, profile_id) values
      ('${orgId}', null, '${ownerId}', 'owner', true, '${ownerProfileId}'),
      ('${orgId}', null, '${managerId}', 'manager', true, '${managerProfileId}'),
      ('${orgId}', null, '${advisorDelegatorId}', 'advisor', true, '${advisorDelegatorProfileId}'),
      ('${orgId}', '${branchAId}', '${branchManagerAId}', 'manager', true, '${branchManagerProfileId}');
    insert into public.team_work_hours(organization_id, weekday, is_open, opens_at, closes_at) values
      ('${orgId}', 1, true, '08:30', '18:00'),
      ('${orgId}', 2, true, '08:30', '18:00');
  `);
  await db.exec(MIG_INV);
  await db.exec(MIG_REQ);
  await db.exec(MIG_HARDEN);
  await db.exec(MIG_PRIORITY1);
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
  assert.deepEqual(appRes.rows[0].res, { status: 'approved', email: 'applicant@example.com', profile_name: 'Asesor Comercial', branch_id: null });

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

test('branch_id scoping, org-wide lifecycle enforcement, and assign_visualcorp_membership_branch isolation', async () => {
  const db = await bootDb();

  // Grant applicant a fresh access request before testing branch-scoped approvals
  await setActor(db, applicantId);
  const reqRes = await db.query(`select public.record_my_access_request() as res`);
  assert.equal(reqRes.rows[0].res.status, 'recorded');
  const reqRow = await db.query(`select id from public.organization_access_requests where user_id = $1`, [applicantId]);
  const requestId = reqRow.rows[0].id;

  // Owner verifies invalid/foreign/inactive branches are rejected
  await setActor(db, ownerId);
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3, $4)`, [orgId, 'peer@example.com', limitedProfileId, otherOrgBranchId]),
    /sucursal seleccionada no pertenece/
  );
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3, $4)`, [orgId, 'peer@example.com', limitedProfileId, inactiveBranchId]),
    /sucursal seleccionada no pertenece/
  );

  // Branch-restricted manager on Branch A cannot act globally or on Branch B
  await setActor(db, branchManagerAId);
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3, null)`, [orgId, 'peer@example.com', limitedProfileId]),
    /toda la organización/
  );
  await assert.rejects(
    () => db.query(`select public.create_organization_access_invitation($1, $2, $3, $4)`, [orgId, 'peer@example.com', limitedProfileId, branchBId]),
    /sucursal seleccionada/
  );
  await assert.rejects(
    () => db.query(`select * from public.list_organization_access_requests($1)`, [orgId]),
    /consultar las solicitudes/
  );
  await assert.rejects(
    () => db.query(`select public.approve_organization_access_request($1, $2, null)`, [requestId, limitedProfileId]),
    /alcance global/
  );
  await assert.rejects(
    () => db.query(`select public.approve_organization_access_request($1, $2, $3)`, [requestId, limitedProfileId, branchBId]),
    /sucursal seleccionada/
  );
  await assert.rejects(
    () => db.query(`select public.dismiss_organization_access_request($1)`, [requestId]),
    /gestionar solicitudes/
  );
  await assert.rejects(
    () => db.query(`select public.set_visualcorp_profile_active($1, false)`, [limitedProfileId]),
    /toda la organización/
  );
  await assert.rejects(
    () => db.query(`select public.set_visualcorp_user_access_active($1, false)`, [advisorDelegatorId]),
    /accesos globales/
  );
  await assert.rejects(
    () => db.query(`select public.remove_visualcorp_user_access($1)`, [advisorDelegatorId]),
    /accesos globales/
  );

  // Branch-restricted manager on Branch A CAN approve and invite within Branch A
  const branchApprove = await db.query(`select public.approve_organization_access_request($1, $2, $3) as res`, [requestId, limitedProfileId, branchAId]);
  assert.deepEqual(branchApprove.rows[0].res, {
    status: 'approved',
    email: 'applicant@example.com',
    profile_name: 'Sales view',
    branch_id: branchAId,
  });

  // Unregistered email receives a pending branch-scoped invitation distinct from global invitations
  const pendingBranchInv = await db.query(
    `select public.create_organization_access_invitation($1, $2, $3, $4) as res`,
    [orgId, 'nuevo.sucursal@example.com', limitedProfileId, branchAId]
  );
  assert.equal(pendingBranchInv.rows[0].res.status, 'pending');
  assert.equal(pendingBranchInv.rows[0].res.branch_id, branchAId);
  const invList = await db.query(`select invited_email, branch_id, branch_code, branch_name from public.list_organization_access_invitations($1)`, [orgId]);
  assert.ok(invList.rows.some((row) => row.invited_email === 'nuevo.sucursal@example.com' && row.branch_id === branchAId && row.branch_code === 'NTE'));

  // Branch-restricted manager only sees Branch A team members via list_visualcorp_team_members
  const branchMembers = await db.query(`select user_id, branch_id, branch_code, branch_name from public.list_visualcorp_team_members()`);
  assert.ok(branchMembers.rows.every((row) => row.branch_id === branchAId));
  assert.ok(branchMembers.rows.some((row) => row.user_id === applicantId && row.branch_code === 'NTE' && row.branch_name === 'Matriz Norte'));

  // Org-wide membership deactivation stays blocked for branch-restricted manager, while Branch A toggle succeeds
  const advisorMemRes = await db.query(`select id from public.organization_memberships where organization_id = $1 and user_id = $2 and branch_id is null`, [orgId, advisorDelegatorId]);
  const applicantMemRes = await db.query(`select id from public.organization_memberships where organization_id = $1 and user_id = $2 and branch_id = $3`, [orgId, applicantId, branchAId]);
  await assert.rejects(
    () => db.query(`select public.set_visualcorp_membership_active($1, false)`, [advisorMemRes.rows[0].id]),
    /membresías globales/
  );
  await db.query(`select public.set_visualcorp_membership_active($1, false)`, [applicantMemRes.rows[0].id]);
  await db.query(`select public.set_visualcorp_membership_active($1, true)`, [applicantMemRes.rows[0].id]);
  await assert.rejects(
    () => db.query(`select public.assign_visualcorp_membership_branch($1, $2, $3)`, [orgId, applicantMemRes.rows[0].id, branchBId]),
    /reasignar sucursales/
  );

  // Org-wide manager can reassign Branch A -> Branch B -> Global, but cannot touch admin/owner or other-org branches
  await setActor(db, managerId);
  const reassigned = await db.query(`select public.assign_visualcorp_membership_branch($1, $2, $3) as res`, [orgId, applicantMemRes.rows[0].id, branchBId]);
  assert.deepEqual(reassigned.rows[0].res, {
    membership_id: applicantMemRes.rows[0].id,
    branch_id: branchBId,
    branch_name: 'Sucursal Sur',
    branch_code: 'SUR',
  });
  await assert.rejects(
    () => db.query(`select public.assign_visualcorp_membership_branch($1, $2, $3)`, [orgId, applicantMemRes.rows[0].id, otherOrgBranchId]),
    /sucursal seleccionada no pertenece/
  );

  const ownerMemRes = await db.query(`select id from public.organization_memberships where organization_id = $1 and user_id = $2 and role = 'owner'`, [orgId, ownerId]);
  await assert.rejects(
    () => db.query(`select public.assign_visualcorp_membership_branch($1, $2, $3)`, [orgId, ownerMemRes.rows[0].id, branchAId]),
    /propietario/
  );

  // Owner sees all members with branch metadata
  await setActor(db, ownerId);
  const allMembers = await db.query(`select user_id, branch_id, branch_code from public.list_visualcorp_team_members()`);
  assert.ok(allMembers.rows.some((row) => row.user_id === ownerId && row.branch_id === null));
  assert.ok(allMembers.rows.some((row) => row.user_id === applicantId && row.branch_id === branchBId && row.branch_code === 'SUR'));
});

test('save_visualcorp_access_profile blocks p_base_role escalation and get_my_visualcorp_access exposes finance, branch_scopes and work schedule', async () => {
  const db = await bootDb();

  // Give org-wide manager and org-wide advisor profile-management capability to verify role ceiling guards
  await db.query(`
    insert into public.access_profile_permissions(profile_id, module_key, action_key, enabled) values
      ($1, 'team', 'manage_profiles', true),
      ($1, 'inventory', 'view', true),
      ($2, 'team', 'manage_profiles', true),
      ($2, 'sales', 'view', true)
    on conflict (profile_id, module_key, action_key) do update set enabled = excluded.enabled
  `, [managerProfileId, advisorDelegatorProfileId]);

  // Advisor cannot escalate a custom profile to base_role = 'manager'
  await setActor(db, advisorDelegatorId);
  await assert.rejects(
    () => db.query(
      `select public.save_visualcorp_access_profile(null, 'esc_manager', 'Escalada Manager', '', $1::jsonb, 'manager')`,
      [JSON.stringify([{ module_key: 'sales', action_key: 'view', enabled: true }])]
    ),
    /rol base superior/
  );

  // Manager cannot create admin, website_admin, or owner profiles, nor use invalid roles
  await setActor(db, managerId);
  for (const forbiddenRole of ['admin', 'website_admin', 'owner']) {
    await assert.rejects(
      () => db.query(
        `select public.save_visualcorp_access_profile(null, $1, 'Forbidden Role', '', '[]'::jsonb, $2)`,
        [`forbidden_${forbiddenRole}`, forbiddenRole]
      ),
      /owner, admin o website_admin/
    );
  }
  await assert.rejects(
    () => db.query(`select public.save_visualcorp_access_profile(null, 'bad_role', 'Bad Role', '', '[]'::jsonb, 'superadmin')`),
    /rol base del perfil no es válido/
  );

  // Branch-scoped actor with manage_profiles only on Branch A cannot edit profiles
  await db.query(`
    insert into public.access_profile_permissions(profile_id, module_key, action_key, enabled)
    values ($1, 'team', 'manage_profiles', true)
    on conflict (profile_id, module_key, action_key) do update set enabled = true
  `, [branchManagerProfileId]);
  await setActor(db, branchManagerAId);
  await assert.rejects(
    () => db.query(`select public.save_visualcorp_access_profile(null, 'branch_only_prof', 'Branch Only', '', '[]'::jsonb, 'advisor')`),
    /toda la organización/
  );

  // Manager CAN create an advisor profile and update it to warehouse within ceiling
  await setActor(db, managerId);
  const savedRes = await db.query(
    `select public.save_visualcorp_access_profile(null, 'cajero_sucursal', 'Cajero Sucursal', 'Opera ventas de sucursal', $1::jsonb, 'advisor') as id`,
    [JSON.stringify([{ module_key: 'sales', action_key: 'view', enabled: true }])]
  );
  const customProfileId = savedRes.rows[0].id;
  await db.query(
    `select public.save_visualcorp_access_profile($1, 'cajero_sucursal', 'Cajero Sucursal', 'Ahora bodega', $2::jsonb, 'warehouse')`,
    [customProfileId, JSON.stringify([{ module_key: 'inventory', action_key: 'view', enabled: true }])]
  );
  const profRow = await db.query(`select base_role from public.access_profiles where id = $1`, [customProfileId]);
  assert.equal(profRow.rows[0].base_role, 'warehouse');

  // Owner CAN create website_admin and receives finance + branch_scopes in get_my_visualcorp_access
  await setActor(db, ownerId);
  const webAdminIdRes = await db.query(
    `select public.save_visualcorp_access_profile(null, 'web_editor_custom', 'Editor Web', '', '[]'::jsonb, 'website_admin') as id`
  );
  const webAdminRow = await db.query(`select base_role from public.access_profiles where id = $1`, [webAdminIdRes.rows[0].id]);
  assert.equal(webAdminRow.rows[0].base_role, 'website_admin');

  const ownerAccess = (await db.query(`select public.get_my_visualcorp_access() as res`)).rows[0].res;
  assert.equal(ownerAccess.work_access_open, true);
  assert.deepEqual(ownerAccess.permissions.finance, { view: true, edit: true, manage_finance: true });
  assert.equal(ownerAccess.branch_scopes.length, 1);
  assert.equal(ownerAccess.branch_scopes[0].branch_id, null);
  assert.equal(ownerAccess.branch_scopes[0].profile_key, 'owner');

  // Multi-branch user gets per-branch scopes
  await db.query(`
    insert into public.organization_memberships(organization_id, branch_id, user_id, role, active, profile_id) values
      ($1, $2, $3, 'advisor', true, $4),
      ($1, $5, $3, 'manager', true, $6)
  `, [orgId, branchAId, otherId, limitedProfileId, branchBId, financeProfileId]);
  await setActor(db, otherId);
  const peerAccess = (await db.query(`select public.get_my_visualcorp_access() as res`)).rows[0].res;
  assert.equal(peerAccess.branch_scopes.length, 2);
  const scopeA = peerAccess.branch_scopes.find((s) => s.branch_id === branchAId);
  const scopeB = peerAccess.branch_scopes.find((s) => s.branch_id === branchBId);
  assert.equal(scopeA.branch_code, 'NTE');
  assert.equal(scopeA.permissions.sales.view, true);
  assert.equal(scopeA.permissions.finance, undefined);
  assert.equal(scopeB.branch_code, 'SUR');
  assert.equal(scopeB.permissions.finance.manage_finance, true);
  assert.equal(scopeB.permissions.sales, undefined);

  // Outside working hours: work_access_open=false still exposes real work_hours and active work_exception
  await db.query(`
    insert into public.team_work_exceptions(organization_id, work_date, user_id, kind, opens_at, closes_at, note)
    values ($1, (now() at time zone 'America/Guayaquil')::date, $2, 'closed', null, null, 'Inventario anual')
  `, [orgId, otherId]);
  await db.exec(`set app.work_access_open = 'false';`);
  const closedAccess = (await db.query(`select public.get_my_visualcorp_access() as res`)).rows[0].res;
  assert.equal(closedAccess.work_access_open, false);
  assert.deepEqual(closedAccess.branch_scopes, []);
  assert.equal(closedAccess.work_hours.length, 2);
  assert.equal(closedAccess.work_hours[0].opens_at, '08:30');
  assert.equal(closedAccess.work_exception.kind, 'closed');
  assert.equal(closedAccess.work_exception.note, 'Inventario anual');
  await db.exec(`reset app.work_access_open;`);
});
