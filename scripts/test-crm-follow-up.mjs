import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.dirname(fileURLToPath(import.meta.url));
const migrationFolder = path.join(root, '../supabase/migrations');
const migrationFile = fs.readdirSync(migrationFolder).find((name) => /^\d+_crm_follow_up_workspace\.sql$/.test(name));
assert.ok(migrationFile, 'CRM migration is present');
const migration = fs.readFileSync(path.join(migrationFolder, migrationFile), 'utf8');
const organizationId = '10000000-0000-0000-0000-000000000001';
const adviserId = '10000000-0000-0000-0000-000000000002';
const teammateId = '10000000-0000-0000-0000-000000000003';

async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.organizations(id uuid primary key, slug text unique);
    create table public.profiles(user_id uuid primary key, full_name text not null default '', email text);
    create table public.organization_memberships(organization_id uuid, user_id uuid, role text, active boolean default true);
    create table public.customers(
      id uuid primary key default gen_random_uuid(), organization_id uuid, full_name text not null,
      phone text not null default '', email text not null default '', notes text not null default '',
      preferences jsonb not null default '{}', tags text[] not null default '{}', created_by uuid,
      created_at timestamptz not null default now()
    );
    create table public.public_requests(
      id uuid primary key default gen_random_uuid(), request_type text not null default 'contact',
      name text not null, phone text not null default '', email text not null default '', service text not null default '',
      company text not null default '', message text not null default '', quote_data jsonb not null default '{}', status text not null default 'new',
      assigned_to uuid, created_by uuid, customer_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.central_quotes(
      id uuid primary key default gen_random_uuid(), organization_id uuid, quote_code text not null,
      customer_id uuid, customer_name text not null default '', customer_phone text not null default '', items jsonb not null default '[]',
      total_normal numeric, total_installation numeric, total_corporate numeric, chosen_tier text, selected_total numeric,
      price_confirmed boolean not null default false, notes text not null default '', client_brief_html text not null default '',
      created_by uuid, status text not null default 'draft', created_at timestamptz not null default now(), public_request_id uuid
    );
    create table public.central_quote_events(id uuid primary key default gen_random_uuid(),organization_id uuid,quote_id uuid,to_status text,created_by uuid);
    create schema app_private;
    create function app_private.has_visualcorp_access(p_org uuid,p_module text,p_action text,p_branch uuid default null)
      returns boolean language sql stable security definer as $$
        select auth.uid() is not null and exists (
          select 1 from public.organization_memberships m where m.organization_id=p_org and m.user_id=auth.uid() and m.active
        ) and (p_action='view' or current_setting('test.crm_edit',true)='true')
      $$;
    alter table public.public_requests enable row level security;
    create policy public_requests_anon_add on public.public_requests for insert to anon
      with check(status='new' and assigned_to is null and created_by is null);
    grant insert (request_type,name,phone,email,company,service,message,quote_data) on public.public_requests to anon;
    grant select,update on public.public_requests to authenticated;
    insert into public.organizations(id,slug) values('${organizationId}','visual-corp');
    insert into auth.users(id) values('${adviserId}'),('${teammateId}');
    insert into public.profiles(user_id,full_name,email) values
      ('${adviserId}','Asesora de prueba','asesora@example.test'),('${teammateId}','Equipo de prueba','equipo@example.test');
    insert into public.organization_memberships(organization_id,user_id,role) values
      ('${organizationId}','${adviserId}','advisor'),('${organizationId}','${teammateId}','advisor');
  `);
  await db.exec(migration);
  return db;
}

async function setUser(db, userId, canEdit) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.crm_edit',$2,false)", [userId, canEdit ? 'true' : 'false']);
}

test('CRM server workflow preserves public intake, enforces access, and persists follow-up links', async () => {
  const db = await createTestDatabase();
  try {
    await db.exec('set role anon');
    await db.query(`insert into public.public_requests(name,phone,email,service,message) values('Contacto web','0991234567','web@example.test','Rótulos','Formulario público')`);
    await assert.rejects(
      db.query(`insert into public.public_requests(name,status,assigned_to) values('Intento interno','won','${adviserId}')`),
      /permission denied|violates row-level security/i,
    );
    await db.exec('reset role');

    await setUser(db, adviserId, false);
    await db.exec('set role authenticated');
    const readonlyInbox = await db.query(`select public.get_visualcorp_crm_inbox(p_view=>'all') as data`);
    assert.equal(Number(readonlyInbox.rows[0].data.total), 1);
    await assert.rejects(
      db.query(`select public.create_visualcorp_manual_request('Prueba','','','','','','Local')`),
      /No tienes permiso/,
    );
    await assert.rejects(
      db.query(`select public.create_central_quote_from_request(null,'Solo lectura','','[{}]'::jsonb,null,null,null,'normal',null,false,'','',null)`),
      /Sin permiso para crear cotizaciones/,
    );
    await db.exec('reset role');

    await setUser(db, adviserId, true);
    await db.exec('set role authenticated');
    const manual = await db.query(`select public.create_visualcorp_manual_request($1,$2,$3,$4,$5,$6,$7) as id`, [
      'Prospecto CRM', '+593 99 123 4567', 'crm@example.test', 'Empresa de prueba', 'Señalética', 'Consulta inicial', 'WhatsApp',
    ]);
    const requestId = manual.rows[0].id;
    await db.query(`select public.update_visualcorp_request($1,p_update_assignment=>true,p_assigned_to=>$2,p_update_follow_up=>true,p_follow_up_at=>now()-interval '1 day',p_note=>'Primera llamada agendada',p_follow_up_action=>'Llamar para revisar el alcance')`, [requestId, teammateId]);

    const inbox = await db.query(`select public.get_visualcorp_crm_inbox(p_view=>'overdue',p_search=>'Prospecto CRM',p_source=>'WhatsApp',p_assignee=>$1,p_page_size=>1) as data`, [teammateId]);
    assert.equal(Number(inbox.rows[0].data.total), 1);
    assert.equal(inbox.rows[0].data.items[0].assigned_name, 'Equipo de prueba');
    assert.equal(inbox.rows[0].data.items[0].follow_up_action, 'Llamar para revisar el alcance');
    assert.equal(Number(inbox.rows[0].data.metrics.overdue), 1);
    const pageOne = await db.query(`select public.get_visualcorp_crm_inbox(p_page=>1,p_page_size=>1) as data`);
    const pageOneAgain = await db.query(`select public.get_visualcorp_crm_inbox(p_page=>1,p_page_size=>1) as data`);
    const pageTwo = await db.query(`select public.get_visualcorp_crm_inbox(p_page=>2,p_page_size=>1) as data`);
    assert.equal(pageOne.rows[0].data.items[0].id, requestId, 'the overdue follow-up stays first');
    assert.equal(pageOneAgain.rows[0].data.items[0].id, requestId, 'page order stays stable');
    assert.notEqual(pageOne.rows[0].data.items[0].id, pageTwo.rows[0].data.items[0].id, 'pagination does not duplicate rows');

    await assert.rejects(db.query(`select public.update_visualcorp_request($1,p_status=>'lost')`, [requestId]), /Indica el motivo de pérdida/);
    await db.query(`select public.log_visualcorp_request_contact($1,'Teléfono','Hablamos sobre la medida')`, [requestId]);
    const detail = await db.query(`select public.get_visualcorp_request_detail($1) as data`, [requestId]);
    const activity = detail.rows[0].data.activity;
    assert.ok(activity.some((entry) => entry.kind === 'assignment' && entry.details.to_name === 'Equipo de prueba'));
    assert.ok(activity.some((entry) => entry.kind === 'note' && entry.details.text === 'Primera llamada agendada'));
    assert.ok(activity.some((entry) => entry.kind === 'contact' && entry.details.method === 'Teléfono'));
    assert.ok(activity.some((entry) => entry.kind === 'follow_up' && entry.details.action === 'Llamar para revisar el alcance'));

    const quote = await db.query(`select public.create_central_quote_from_request(null,'Prospecto CRM','0991234567','[{}]'::jsonb,null,null,null,'normal',null,false,'','', $1) as data`, [requestId]);
    const linkedQuote = await db.query(`select public.get_visualcorp_request_detail($1) as data`, [requestId]);
    assert.equal(linkedQuote.rows[0].data.quotes[0].quote_code, quote.rows[0].data.quote_code);

    const convertedFirst = await db.query(`select public.convert_visualcorp_request_to_customer($1) as id`, [requestId]);
    const convertedAgain = await db.query(`select public.convert_visualcorp_request_to_customer($1) as id`, [requestId]);
    assert.equal(convertedFirst.rows[0].id, convertedAgain.rows[0].id);
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
