import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  buildRollConfigAuditReason,
  computeMeterStepTarget,
  computeMetersForPercent,
  computeRollMetrics,
  inferRollFamily,
  isRollRpcMissingError,
  resolveRollFamilyMeta,
  resolveRollHealthLabel,
  resolveRollHealthTier,
} from '../src/lib/inventoryRollHelpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUITE_ROOT = path.resolve(__dirname, '..');

test('computeRollMetrics computes meters, percent, m2 area and plotter width ratio accurately', () => {
  const m = computeRollMetrics({
    remaining_m: 37.5,
    remaining_percent: 75,
    standard_length_m: 50,
    nominal_width_cm: 127,
  });
  assert.equal(m.remainingM, 37.5);
  assert.equal(m.nominalM, 50);
  assert.equal(m.percent, 75);
  assert.equal(m.widthCm, 127);
  assert.equal(m.areaM2, 47.63);
  assert.equal(m.nominalAreaM2, 63.5);
  assert.ok(Math.abs(m.widthRatioToMaxPlotter - 127 / 320) < 0.001);
});

test('computeRollMetrics handles rolls without nominal length safely without division by zero', () => {
  const m = computeRollMetrics({
    remaining_m: 18.25,
    remaining_percent: null,
    standard_length_m: null,
    nominal_width_cm: 310,
  });
  assert.equal(m.remainingM, 18.25);
  assert.equal(m.nominalM, null);
  assert.equal(m.percent, null);
  assert.equal(m.areaM2, 56.58);
  assert.equal(m.widthRatioToMaxPlotter, 310 / 320);

  // Legacy fallback from percent when remaining_m is null
  const legacy = computeRollMetrics({
    remaining_m: null,
    remaining_percent: 40,
    standard_length_m: 50,
    nominal_width_cm: null,
  });
  assert.equal(legacy.remainingM, 20);
  assert.equal(legacy.percent, 40);
  assert.equal(legacy.areaM2, null);
});

test('resolveRollHealthTier and resolveRollHealthLabel map all health states consistently', () => {
  assert.equal(resolveRollHealthTier({ status: 'agotado', remainingM: 10, percent: 20 }), 'exhausted');
  assert.equal(resolveRollHealthTier({ status: 'en_uso', remainingM: 0, percent: 0 }), 'exhausted');
  assert.equal(resolveRollHealthTier({ status: 'en_uso', remainingM: 5, percent: 10 }), 'critical');
  assert.equal(resolveRollHealthTier({ status: 'en_uso', remainingM: 15, percent: 30 }), 'warning');
  assert.equal(resolveRollHealthTier({ status: 'en_uso', remainingM: 25, percent: 50 }), 'medium');
  assert.equal(resolveRollHealthTier({ status: 'en_uso', remainingM: 45, percent: 90 }), 'healthy');
  assert.equal(resolveRollHealthTier({ status: 'en_bodega', remainingM: 12, percent: null }), 'medium');

  assert.equal(resolveRollHealthLabel('critical', 'machine'), 'Crítico');
  assert.equal(resolveRollHealthLabel('healthy', 'machine'), 'Óptimo en plotter');
  assert.equal(resolveRollHealthLabel('healthy', 'bodega'), 'Disponible');
});

test('inferRollFamily, computeMetersForPercent, computeMeterStepTarget and error helpers work properly', () => {
  assert.equal(inferRollFamily('', 'Lona Front 13oz 3.10m'), 'lona');
  assert.equal(inferRollFamily('', 'Vinil Microperforado 1.52m'), 'vinil');
  assert.equal(inferRollFamily('', 'Papel Sublimación 1.60m'), 'papel');
  assert.equal(inferRollFamily('papel', 'Nombre genérico'), 'papel');
  assert.equal(resolveRollFamilyMeta('', 'Banner Blackout').shortTag, 'LONA');

  assert.equal(computeMetersForPercent(50, 35), 17.5);
  assert.equal(computeMetersForPercent(null, 50), null);

  assert.equal(computeMeterStepTarget(12.5, -5), 7.5);
  assert.equal(computeMeterStepTarget(3, -5), 0);
  assert.equal(computeMeterStepTarget(48, 10, 50), 50);

  assert.equal(isRollRpcMissingError({ code: 'PGRST202', message: 'Not found' }), true);
  assert.equal(
    isRollRpcMissingError(new Error('Could not find the function public.update_inventory_roll_config')),
    true
  );
  assert.equal(isRollRpcMissingError(new Error('Permission denied')), false);

  const reason = buildRollConfigAuditReason(
    { roll_tag: 'A-1', material_family: 'lona', standard_length_m: 50, location_code: 'MAIN', notes: '' },
    { roll_tag: 'A-2', material_family: 'lona', standard_length_m: 100, location_code: 'MAIN', notes: 'Revisado' }
  );
  assert.match(reason, /lote\/etiqueta/);
  assert.match(reason, /largo nominal/);
  assert.match(reason, /notas/);
});

test('SQL migration 20261119175920_inventory_roll_config_rpc.sql runs cleanly in PGlite and preserves stock + audit', async () => {
  const db = new PGlite();

  await db.exec(`
    create schema if not exists auth;
    create schema if not exists app_private;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    end $$;

    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.test_uid', true), '')::uuid;
    $$;

    create or replace function app_private.has_visualcorp_access(
      p_org uuid,
      p_module text,
      p_action text,
      p_branch uuid default null
    ) returns boolean language sql stable as $$
      select coalesce(nullif(current_setting('app.test_allow_edit', true), '')::boolean, true);
    $$;

    create table public.organizations (id uuid primary key, slug text not null);
    create table public.branches (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      name text not null,
      active boolean not null default true,
      unique (id, organization_id)
    );
    create table public.inventory_locations (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      branch_id uuid not null references public.branches(id),
      code text not null,
      name text not null,
      active boolean not null default true,
      unique (organization_id, branch_id, code)
    );
    create table public.inventory_items (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      name text not null,
      base_unit text not null,
      custom_fields jsonb not null default '{}'::jsonb,
      active boolean not null default true,
      unique (id, organization_id)
    );
    create table public.inventory_variants (
      id uuid primary key,
      organization_id uuid not null references public.organizations(id),
      item_id uuid not null references public.inventory_items(id),
      sku text not null,
      label text not null default '',
      attributes jsonb not null default '{}'::jsonb,
      active boolean not null default true,
      unique (id, organization_id)
    );
    create table public.inventory_stock (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      variant_id uuid not null,
      branch_id uuid not null,
      location_code text not null default 'MAIN',
      quantity numeric(14,3) not null default 0 check (quantity >= 0),
      reserved_quantity numeric(14,3) not null default 0 check (reserved_quantity >= 0 and reserved_quantity <= quantity),
      updated_at timestamptz not null default now(),
      unique (organization_id, variant_id, branch_id, location_code)
    );
    create table public.inventory_movements (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id),
      variant_id uuid not null,
      branch_id uuid not null,
      location_code text not null default 'MAIN',
      movement_type text not null check (movement_type in ('receipt','adjustment','consumption','sale','return','waste','transfer_out','transfer_in')),
      quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
      reason text not null default '',
      reference_type text,
      reference_id uuid,
      created_by uuid not null references auth.users(id),
      created_at timestamptz not null default now()
    );

    create or replace function app_private.validate_inventory_location()
    returns trigger language plpgsql as $$
    begin
      if not exists (
        select 1 from public.inventory_locations l
        where l.organization_id = new.organization_id
          and l.branch_id = new.branch_id
          and l.code = new.location_code
          and l.active
      ) then
        raise exception 'Ubicación inválida: %', new.location_code;
      end if;
      return new;
    end;
    $$;
    create trigger inventory_movements_location_check
      before insert or update of organization_id, branch_id, location_code
      on public.inventory_movements
      for each row execute function app_private.validate_inventory_location();

    create table public.inventory_active_rolls (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      branch_id uuid not null references public.branches(id) on delete cascade,
      variant_id uuid not null references public.inventory_variants(id) on delete cascade,
      location_code text not null default 'MAIN',
      machine_name text not null default '',
      material_name text not null,
      material_family text not null default 'lona' check (material_family in ('lona', 'vinil', 'papel', 'otro')),
      roll_tag text not null default '',
      standard_length_m numeric(10,2) check (standard_length_m is null or standard_length_m > 0),
      nominal_width_cm numeric(10,2) check (nominal_width_cm is null or nominal_width_cm > 0),
      remaining_m numeric(14,3) not null check (remaining_m >= 0 and remaining_m <= standard_length_m),
      remaining_percent numeric(5,2) check (remaining_percent is null or (remaining_percent >= 0 and remaining_percent <= 100.00)),
      remaining_is_estimate boolean not null default false,
      roll_state text not null default 'bodega' check (roll_state in ('bodega', 'machine')),
      status text not null default 'en_bodega' check (status in ('en_uso', 'en_espera', 'agotado', 'en_bodega')),
      operator_name text not null default '',
      notes text not null default '',
      last_measured_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.inventory_roll_logs (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      roll_id uuid not null references public.inventory_active_rolls(id) on delete cascade,
      previous_percent numeric(5,2),
      new_percent numeric(5,2),
      operator_name text not null default '',
      notes text not null default '',
      recorded_at timestamptz not null default now(),
      created_by uuid references auth.users(id) on delete set null,
      previous_m numeric(14,3),
      new_m numeric(14,3),
      event_type text not null default 'legacy',
      reason text not null default '',
      work_reference text not null default '',
      previous_state text,
      new_state text
    );
  `);

  // Load real production movement trigger (20261106183000) and real roll movement trigger (20261110150000)
  const stockTriggerFixSql = fs.readFileSync(
    path.join(SUITE_ROOT, 'supabase', 'migrations', '20261106183000_fix_inventory_stock_movement_trigger.sql'),
    'utf8'
  );
  await db.exec(stockTriggerFixSql);
  await db.exec(`
    drop trigger if exists inventory_movement_updates_stock on public.inventory_movements;
    create trigger inventory_movement_updates_stock
      after insert on public.inventory_movements
      for each row execute function app_private.apply_inventory_movement();
  `);

  const meterModelSql = fs.readFileSync(
    path.join(SUITE_ROOT, 'supabase', 'migrations', '20261110150000_inventory_roll_meter_model.sql'),
    'utf8'
  );
  const rollTriggerMatch = meterModelSql.match(
    /create or replace function app_private\.apply_roll_material_movement\(\)[\s\S]*?create trigger inventory_movement_updates_physical_rolls[\s\S]*?apply_roll_material_movement\(\);/
  );
  assert.ok(rollTriggerMatch, 'Expected apply_roll_material_movement trigger block in 20261110150000 migration');
  await db.exec(rollTriggerMatch[0]);

  const migrationSql = fs.readFileSync(
    path.join(SUITE_ROOT, 'supabase', 'migrations', '20261119175920_inventory_roll_config_rpc.sql'),
    'utf8'
  );

  // Execute twice to verify idempotency
  await db.exec(migrationSql);
  await db.exec(migrationSql);

  const userId = '11111111-1111-4111-8111-111111111111';
  const orgId = '22222222-2222-4222-8222-222222222222';
  const branchId = '33333333-3333-4333-8333-333333333333';
  const itemId = '44444444-4444-4444-8444-444444444444';
  const variantId = '55555555-5555-4555-8555-555555555555';
  const rollId = '66666666-6666-4666-8666-666666666666';

  await db.exec(`
    insert into auth.users (id) values ('${userId}');
    insert into public.organizations (id, slug) values ('${orgId}', 'visual-corp');
    insert into public.branches (id, organization_id, name, active) values ('${branchId}', '${orgId}', 'Visual Corp', true);
    insert into public.inventory_locations (organization_id, branch_id, code, name, active) values
      ('${orgId}', '${branchId}', 'MAIN', 'Bodega principal', true),
      ('${orgId}', '${branchId}', 'RACK-B', 'Estantería B', true),
      ('${orgId}', '${branchId}', 'OLD-INACTIVE', 'Inactiva', false);
    insert into public.inventory_items (id, organization_id, name, base_unit, custom_fields)
      values ('${itemId}', '${orgId}', 'Vinil Blanco Brillante 127 cm', 'metro lineal', '{"inventory_model":"roll"}');
    insert into public.inventory_variants (id, organization_id, item_id, sku, label, attributes)
      values ('${variantId}', '${orgId}', '${itemId}', 'VIN-127', 'Ancho 127 cm', '{"width_cm":127}');

    select set_config('app.test_uid', '${userId}', false);
    select set_config('app.test_allow_edit', 'true', false);

    insert into public.inventory_active_rolls (
      id, organization_id, branch_id, variant_id, location_code, machine_name,
      material_name, material_family, roll_tag, standard_length_m, nominal_width_cm,
      remaining_m, remaining_percent, roll_state, status, operator_name, notes
    ) values (
      '${rollId}', '${orgId}', '${branchId}', '${variantId}', 'MAIN', '',
      'Vinil Blanco Brillante 127 cm', 'vinil', 'ROL-001', 50, 127,
      40, 80, 'bodega', 'en_bodega', 'Esteban', 'Inicial'
    );

    insert into public.inventory_movements (
      organization_id, variant_id, branch_id, location_code, movement_type,
      quantity_delta, reason, reference_type, reference_id, created_by
    ) values (
      '${orgId}', '${variantId}', '${branchId}', 'MAIN', 'receipt',
      40, 'Ingreso inicial', 'inventory_roll', '${rollId}', '${userId}'
    );
  `);

  // 1. Update tag, family, nominal length (40m -> 100m => 40%), location (MAIN -> RACK-B), notes
  const res = await db.query(
    `select public.update_inventory_roll_config($1, $2, $3, $4, false, $5, $6, $7, $8) as result`,
    [rollId, 'ROL-VIN-99', 'lona', 100, 'RACK-B', 'Movido al rack B', 'Operario A', '']
  );
  const payload = res.rows[0].result;
  assert.equal(payload.success, true);
  assert.equal(payload.changed, true);
  assert.equal(payload.remaining_percent, 40);
  assert.equal(payload.location_code, 'RACK-B');

  // Verify stock transferred cleanly from MAIN (0) to RACK-B (40)
  const stockRes = await db.query(
    `select location_code, quantity::float8 as qty from public.inventory_stock where variant_id = $1 order by location_code`,
    [variantId]
  );
  const stockByLoc = Object.fromEntries(stockRes.rows.map((r) => [r.location_code, r.qty]));
  assert.equal(stockByLoc.MAIN, 0);
  assert.equal(stockByLoc['RACK-B'], 40);

  // Verify audit log row created with event_type = 'config'
  const logRes = await db.query(
    `select event_type, previous_m::float8, new_m::float8, previous_percent::float8, new_percent::float8, reason
     from public.inventory_roll_logs where roll_id = $1`,
    [rollId]
  );
  assert.equal(logRes.rows.length, 1);
  assert.equal(logRes.rows[0].event_type, 'config');
  assert.equal(logRes.rows[0].previous_m, 40);
  assert.equal(logRes.rows[0].new_m, 40);
  assert.equal(logRes.rows[0].previous_percent, 80);
  assert.equal(logRes.rows[0].new_percent, 40);

  // 2. Calling again with identical values returns changed: false without extra logs
  const noopRes = await db.query(
    `select public.update_inventory_roll_config($1, $2, $3, $4, false, $5, $6, $7, '') as result`,
    [rollId, 'ROL-VIN-99', 'lona', 100, 'RACK-B', 'Movido al rack B', 'Operario A']
  );
  assert.equal(noopRes.rows[0].result.changed, false);

  // 3. Reject nominal length smaller than remaining_m (40m)
  await assert.rejects(
    db.query(`select public.update_inventory_roll_config($1, null, null, 25, false, null, null, '', '')`, [rollId]),
    /no puede ser menor que los metros restantes/
  );

  // 4. Reject inactive/nonexistent location
  await assert.rejects(
    db.query(`select public.update_inventory_roll_config($1, null, null, null, false, 'OLD-INACTIVE', null, '', '')`, [rollId]),
    /no está registrada como activa/
  );

  // 5. Clear nominal length safely (remaining_percent becomes null, remaining_m stays 40)
  const clearRes = await db.query(
    `select public.update_inventory_roll_config($1, null, null, null, true, null, null, 'Operario A', 'Modo libre') as result`,
    [rollId]
  );
  assert.equal(clearRes.rows[0].result.standard_length_m, null);
  assert.equal(clearRes.rows[0].result.remaining_percent, null);

  // 6. Reject location move when reserved stock in current location would be violated
  await db.exec(`
    update public.inventory_stock
       set reserved_quantity = 15
     where variant_id = '${variantId}' and location_code = 'RACK-B';
  `);
  await assert.rejects(
    db.query(
      `select public.update_inventory_roll_config($1, null, null, null, false, 'MAIN', null, 'Operario A', 'Intento con reserva')`,
      [rollId]
    ),
    /parte del stock.*está reservado/
  );
  const unchangedLoc = await db.query(
    `select location_code from public.inventory_active_rolls where id = $1`,
    [rollId]
  );
  assert.equal(unchangedLoc.rows[0].location_code, 'RACK-B');

  // 7. Reject unauthorized editor
  await db.exec(`select set_config('app.test_allow_edit', 'false', false);`);
  await assert.rejects(
    db.query(`select public.update_inventory_roll_config($1, 'X', null, null, false, null, null, '', '')`, [rollId]),
    /No tienes permisos/
  );

  await db.close();
});
