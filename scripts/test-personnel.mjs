import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const suiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(suiteRoot, 'node_modules/.cache/personnel-tests');
mkdirSync(cache, { recursive: true });

for (const file of ['personnelTypes', 'personnelDomain']) {
  const source = readFileSync(resolve(suiteRoot, `src/components/personnel/${file}.ts`), 'utf8').replaceAll(
    './personnelTypes',
    './personnelTypes.mjs',
  );
  writeFileSync(
    `${cache}/${file}.mjs`,
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
}

const domain = await import(pathToFileURL(`${cache}/personnelDomain.mjs`).href);

test('America/Guayaquil date helpers never shift forward after 19:00 local time (00:00 UTC next day)', () => {
  // 2026-11-12T02:30:00Z is 2026-11-11 21:30 in Ecuador (UTC-5)
  const lateEveningEcuador = new Date('2026-11-12T02:30:00Z');
  assert.equal(domain.ecuadorTodayIso(lateEveningEcuador), '2026-11-11');
  assert.equal(domain.ecuadorMonthIso(lateEveningEcuador), '2026-11');
  assert.equal(domain.ecuadorWeekday('2026-11-11'), 3); // Wednesday
});

test('Proportional time-not-worked calculation computes exact Ecuador fraction and returns 0 without monthly base', () => {
  assert.equal(domain.calculateMonthlyEquivalent(241, 'Quincenal'), 482);
  assert.equal(domain.calculateMonthlyEquivalent(480, 'Mensual'), 480);
  assert.equal(domain.calculateMonthlyEquivalent(12, 'Por hora'), null);

  // Base $480 -> $2.00/hour -> 30 minutes = $1.00; 1 day = $16.00
  assert.equal(domain.calculateProportionalTimeDeduction(480, { minutesLate: 30 }), 1);
  assert.equal(domain.calculateProportionalTimeDeduction(480, { daysAbsent: 1 }), 16);
  assert.equal(domain.calculateProportionalTimeDeduction(0, { minutesLate: 45 }), 0);
});

test('Art. 44 10% cap guardrail and Ecuador 2026 entitlements respect SBU and tenure thresholds', () => {
  const config2026 = domain.getEcuadorFiscalConfig(2026);
  assert.equal(config2026.sbu, 482);

  const fineOk = domain.evaluateArt44FineLimit(500, 50, config2026);
  assert.equal(fineOk.maxAllowedFine, 50);
  assert.equal(fineOk.exceedsTenPercentCap, false);

  const fineOver = domain.evaluateArt44FineLimit(500, 55, config2026);
  assert.equal(fineOver.exceedsTenPercentCap, true);

  // Under 12 months: not yet eligible for Fondos de Reserva; 15 vac days
  const month8 = domain.calculateEcuadorLaborEntitlements('2026-03-01', '2026-11-11', 600, config2026);
  assert.equal(month8.monthsWorked, 8);
  assert.equal(month8.reserveFundEligible, false);
  assert.equal(month8.reserveFundMonthsRemaining, 4);
  assert.equal(month8.vacationDaysPerYear, 15);
  assert.equal(month8.estimatedReserveFundMonthly, 0);

  // 7 completed years: Fondos de Reserva eligible + 17 vac days (15 + (7 - 5))
  const year7 = domain.calculateEcuadorLaborEntitlements('2019-01-10', '2026-11-11', 600, config2026);
  assert.equal(year7.completedYears, 7);
  assert.equal(year7.reserveFundEligible, true);
  assert.equal(year7.estimatedReserveFundMonthly, 50);
  assert.equal(year7.vacationDaysPerYear, 17);
  assert.equal(year7.estimatedIessPersonal, 56.7);
  assert.equal(year7.estimatedIessPatronal, 72.9);
});

test('Payroll deduction transition validator enforces exact 4-stage SQL trigger contract', () => {
  assert.deepEqual(domain.getAllowedDeductionTransitions('pending_authorization'), ['authorized', 'cancelled']);
  assert.deepEqual(domain.getAllowedDeductionTransitions('authorized'), ['sent_to_payroll', 'cancelled']);
  assert.deepEqual(domain.getAllowedDeductionTransitions('sent_to_payroll'), ['applied_externally']);
  assert.deepEqual(domain.getAllowedDeductionTransitions('applied_externally'), []);

  // Disallow direct authorized -> applied_externally skip (old bug)
  const skipCheck = domain.validateDeductionTransition('authorized', 'applied_externally', {});
  assert.equal(skipCheck.ok, false);

  // Authorize requires both meaningful refs (reject empty and placeholder strings)
  const missingAuthRef = domain.validateDeductionTransition('pending_authorization', 'authorized', {
    authorizationReference: 'Acta 12',
    evidenceReference: '   ',
  });
  assert.equal(missingAuthRef.ok, false);

  const genericAuthRef = domain.validateDeductionTransition('pending_authorization', 'authorized', {
    authorizationReference: 'ok',
    evidenceReference: 'si',
  });
  assert.equal(genericAuthRef.ok, false);

  const validAuth = domain.validateDeductionTransition('pending_authorization', 'authorized', {
    authorizationReference: 'Acta #012',
    evidenceReference: 'Comprobante #44',
  });
  assert.equal(validAuth.ok, true);

  // Sent to payroll requires real meaningful handoff ref
  const missingHandoff = domain.validateDeductionTransition('authorized', 'sent_to_payroll', {
    payrollHandoffReference: 'n/a',
  });
  assert.equal(missingHandoff.ok, false);

  const validHandoff = domain.validateDeductionTransition('authorized', 'sent_to_payroll', {
    payrollHandoffReference: 'Lote quincena nov-2026',
  });
  assert.equal(validHandoff.ok, true);
});

test('Schedule resolution prioritizes member exception over org exception over weekly hours and attaches area rotations', () => {
  const workHours = [
    { organization_id: 'org1', weekday: 3, is_open: true, opens_at: '08:00:00', closes_at: '18:30:00' },
  ];
  const exceptions = [
    { id: 'e1', organization_id: 'org1', work_date: '2026-11-11', user_id: null, kind: 'open', opens_at: '09:00:00', closes_at: '17:00:00', note: 'Jornada especial' },
    { id: 'e2', organization_id: 'org1', work_date: '2026-11-11', user_id: 'u-1', kind: 'closed', opens_at: null, closes_at: null, note: 'Permiso médico' },
  ];
  const rotations = [
    {
      id: 'r1',
      organization_id: 'org1',
      area_name: 'Impresión',
      task_name: 'Calibración plotter',
      weekday: 3,
      starts_on: '2026-11-01',
      starts_at: '08:00:00',
      ends_at: '09:30:00',
      active: true,
      note: '',
      members: [{ user_id: 'u-2', position: 1 }],
    },
  ];

  const memberLeave = domain.resolveDayScheduleForMember('2026-11-11', 'u-1', workHours, exceptions, rotations);
  assert.equal(memberLeave.isWorkingDay, false);
  assert.equal(memberLeave.source, 'member_exception');

  const orgSpecialMember = domain.resolveDayScheduleForMember('2026-11-11', 'u-2', workHours, exceptions, rotations);
  assert.equal(orgSpecialMember.isWorkingDay, true);
  assert.equal(orgSpecialMember.source, 'org_exception');
  assert.equal(orgSpecialMember.opensAt, '09:00');
  assert.equal(orgSpecialMember.rotations.length, 1);
  assert.equal(orgSpecialMember.rotations[0].areaName, 'Impresión');
});

test('Role-fair family detection, profile readiness and CSV injection defense behave accurately', () => {
  assert.equal(domain.resolveRoleFamily('Comercial / POS', 'Asesor de Ventas'), 'commercial');
  assert.equal(domain.resolveRoleFamily('Diseño Gráfico', 'Pre-prensa'), 'design');
  assert.equal(domain.resolveRoleFamily('Instalaciones y Campo', 'Rotulador'), 'production');

  const readiness = domain.evaluatePersonnelReadiness(
    {
      id: 'p1',
      organization_id: 'org1',
      full_name: 'Ana Pérez',
      email: '',
      phone: '',
      department: 'Diseño Gráfico',
      job_title: 'Diseñadora',
      status: 'active',
      start_date: null,
      end_date: null,
      created_by: 'u1',
      updated_by: 'u1',
      created_at: '2026-11-01',
      updated_at: '2026-11-01',
    },
    undefined,
    undefined,
  );
  assert.equal(readiness.tier, 'incomplete');
  assert.equal(readiness.score, 1);

  const csv = domain.buildCsvDocument(['Nombre', 'Fórmula'], [['Ana', '=SUM(A1:A2)']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=SUM(A1:A2)"'));
});
