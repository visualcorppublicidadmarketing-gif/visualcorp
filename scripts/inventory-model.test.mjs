import test from 'node:test';
import assert from 'node:assert/strict';
import { compareInventoryPriority, getInventoryBalance, getInventoryPriority, getInventoryStatus, inventoryReplenishmentCsv, inventoryUsageByUnit, matchesInventorySearch, needsInventoryReplenishment } from '../src/lib/inventoryModel.ts';

const counted = (overrides = {}) => ({ id: 'vinyl:vis:MAIN', name: 'Vinil adhesivo', branchId: 'vis', branch: 'Visual Corp', location: 'MAIN', area: 'Impresión', unit: 'm', quantity: 20, reservedQuantity: 18, availableQuantity: 2, minimum: 5, ...overrides });

test('an uncounted record never becomes an exhausted stock or a purchase quantity', () => {
  const row = counted({ sourceStatus: 'Sin conteo físico', quantity: 0, availableQuantity: 0 });
  assert.equal(getInventoryStatus(row), 'Sin conteo');
  assert.equal(getInventoryPriority(row), 'unverified');
  assert.equal(getInventoryBalance(row).toMinimum, null);
  assert.equal(needsInventoryReplenishment(row), false);
});

test('reservations affect replenishment even when the physical stock is above minimum', () => {
  assert.equal(getInventoryStatus(counted()), 'Reponer');
  assert.equal(getInventoryBalance(counted()).toMinimum, 3);
  assert.equal(needsInventoryReplenishment(counted()), true);
});

test('fully reserved physical stock has no availability', () => {
  assert.equal(getInventoryStatus(counted({ availableQuantity: 0, reservedQuantity: 20 })), 'Sin disponible');
});

test('missing metrics are not assumed to mean zero reservations', () => {
  const row = counted({ availableQuantity: null, reservedQuantity: undefined });
  assert.equal(getInventoryStatus(row), 'Por verificar');
  assert.deepEqual(getInventoryBalance(row), { physical: 20, reserved: null, available: null, minimum: 5, toMinimum: null });
  assert.equal(getInventoryBalance(counted({ availableQuantity: null, reservedQuantity: 0 })).reserved, null);
});

test('a missing branch cannot be presented as a confirmed quantity', () => {
  assert.equal(getInventoryBalance(counted({ branchId: null })).physical, null);
});

test('at minimum means review with zero additional quantity', () => {
  const row = counted({ availableQuantity: 5 });
  assert.equal(getInventoryPriority(row), 'minimum');
  assert.equal(getInventoryBalance(row).toMinimum, 0);
});

test('zero minimum does not invent a replenishment target', () => {
  assert.equal(getInventoryPriority(counted({ minimum: 0, availableQuantity: 4 })), 'healthy');
  assert.equal(getInventoryBalance(counted({ minimum: 0, availableQuantity: 0 })).toMinimum, 0);
  assert.equal(getInventoryPriority(counted({ minimum: 0, availableQuantity: 0 })), 'unavailable');
});

test('invalid physical values remain unknown and decimal differences are stable', () => {
  assert.equal(getInventoryBalance(counted({ quantity: 'invalid' })).available, null);
  assert.equal(getInventoryBalance(counted({ minimum: 0.3, availableQuantity: 0.1 })).toMinimum, 0.2);
});

test('search handles accents, word order, variant SKU and location together', () => {
  const row = counted({ variantSku: 'VC-IMP-01', location: 'ESTANTE-A' });
  assert.equal(matchesInventorySearch(row, 'estante impresion adhesivo vc-imp'), true);
  assert.equal(matchesInventorySearch(row, 'estante inexistente'), false);
});

test('consumption is grouped by its exact unit and missing metrics stay absent', () => {
  const rows = [counted({ unit: 'm', consumedLast30Days: 3 }), counted({ unit: 'm', consumedLast30Days: 2 }), counted({ unit: 'unidad', consumedLast30Days: 7 }), counted({ unit: 'm²', consumedLast30Days: null })];
  assert.deepEqual(inventoryUsageByUnit(rows, 'consumedLast30Days'), [{ unit: 'm', quantity: 5 }, { unit: 'unidad', quantity: 7 }]);
});

test('priority sorts by condition and identity, not unrelated quantities or units', () => {
  const rows = [counted({ id: 'healthy', availableQuantity: 8 }), counted({ id: 'unknown', sourceStatus: 'Sin conteo' }), counted({ id: 'below' }), counted({ id: 'empty', availableQuantity: 0 })];
  assert.deepEqual(rows.sort(compareInventoryPriority).map(row => row.id), ['empty', 'below', 'unknown', 'healthy']);
  assert.equal(needsInventoryReplenishment(counted({ archived: true })), false);
});

test('CSV preserves unknowns, Unicode, separators, quotes and neutralizes spreadsheet formulas', () => {
  const csv = inventoryReplenishmentCsv([counted({ name: '  =HYPERLINK("bad")', variant: 'Blanco; "mate"', quantity: 0, reservedQuantity: 0, availableQuantity: -2 }), counted({ id: 'unknown', sourceStatus: 'Sin conteo' })], '2026-10-26T12:00:00Z');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'  =HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"Blanco; ""mate"""'));
  assert.ok(csv.includes(';0;0;-2;5;7;'));
  assert.ok(csv.includes('"Sin conteo";"";"";"";5;"";'));
});
