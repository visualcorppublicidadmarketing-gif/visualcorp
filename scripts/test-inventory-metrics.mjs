import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryCountDifference, inventoryNeedsReplenishment, summarizeInventoryUsage } from '../src/lib/inventoryMetrics.mjs';

test('counts inventory records and aggregates consumption only within each unit', () => {
  const summary = summarizeInventoryUsage([
    { name: 'Lona', unit: 'metro', consumedLast30Days: 15, lifetimeConsumed: 30 },
    { name: 'Ojales', unit: 'unidad', consumedLast30Days: 100, lifetimeConsumed: 200 },
    { name: 'Vinil', unit: 'metro', consumedLast30Days: 0, lifetimeConsumed: 40 },
    { name: 'Sin uso', unit: 'unidad', consumedLast30Days: null, lifetimeConsumed: null },
  ]);
  assert.equal(summary.recordsLast30Days, 2);
  assert.equal(summary.recordsHistorically, 3);
  assert.deepEqual(summary.totalsByUnit.map(({ unit, quantity }) => [unit, quantity]), [['metro', 70], ['unidad', 200]]);
});

test('replenishment includes counted zero stock only when a minimum is configured', () => {
  assert.equal(inventoryNeedsReplenishment({ quantity: 0, minimum: 5, reservedQuantity: 0 }), true);
  assert.equal(inventoryNeedsReplenishment({ quantity: 10, minimum: 4, reservedQuantity: 7 }), true);
  assert.equal(inventoryNeedsReplenishment({ quantity: 0, minimum: 0 }), false);
  assert.equal(inventoryNeedsReplenishment({ quantity: 0, minimum: 5, sourceStatus: 'count_pending' }), false);
  assert.equal(inventoryNeedsReplenishment({ quantity: null, minimum: 5 }), false);
});

test('count difference preserves zero and leaves first counts unclassified', () => {
  assert.equal(inventoryCountDifference(10, '7.5'), -2.5);
  assert.equal(inventoryCountDifference(10, '12'), 2);
  assert.equal(inventoryCountDifference(0, '0'), 0);
  assert.equal(inventoryCountDifference(null, '0'), null);
  assert.equal(inventoryCountDifference(10, ''), null);
});
