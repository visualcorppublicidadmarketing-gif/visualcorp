import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeWeeklyAttribution } from '../src/pages/operations/weeklyFinanceSummaryModel.ts';

test('a later refund does not rewrite the sale week and is counted when settled', () => {
  const sale = {
    status: 'confirmed',
    total: '125.00',
    created_at: '2026-11-10T18:30:00.000Z',
  };
  const refund = {
    amount: '40.00',
    settled_at: '2026-11-16T15:00:00.000Z',
  };

  const historicalWeek = summarizeWeeklyAttribution([sale], [refund], '2026-11-09');
  const currentWeek = summarizeWeeklyAttribution([sale], [refund], '2026-11-16');

  assert.deepEqual(historicalWeek, {
    salesCents: 12_500,
    saleCount: 1,
    refundsCents: 0,
    refundCount: 0,
  });
  assert.deepEqual(currentWeek, {
    salesCents: 0,
    saleCount: 0,
    refundsCents: 4_000,
    refundCount: 1,
  });
});

test('current week sales and refund settlements use Ecuador business-day boundaries', () => {
  const sales = [
    { status: 'confirmed', total: 80, created_at: '2026-11-16T05:00:00.000Z' },
    { status: 'confirmed', total: 20, created_at: '2026-11-23T04:59:59.999Z' },
    { status: 'confirmed', total: 8, created_at: '2026-11-23T05:00:00.000Z' },
  ];
  const settlements = [
    { amount: 12.5, settled_at: '2026-11-22T04:59:59.999Z' },
    { amount: 8, settled_at: '2026-11-23T05:00:00.000Z' },
  ];

  assert.deepEqual(summarizeWeeklyAttribution(sales, settlements, '2026-11-16'), {
    salesCents: 10_000,
    saleCount: 2,
    refundsCents: 1_250,
    refundCount: 1,
  });
  assert.deepEqual(summarizeWeeklyAttribution(sales, settlements, '2026-11-23'), {
    salesCents: 800,
    saleCount: 1,
    refundsCents: 800,
    refundCount: 1,
  });
});

test('cancelled sales stay out of sales totals while their actual settled refund remains attributable', () => {
  const sales = [
    { status: 'cancelled', total: 99, created_at: '2026-11-18T17:00:00.000Z' },
    { status: 'confirmed', total: 75, created_at: '2026-11-18T17:00:00.000Z' },
  ];
  const settlements = [{ amount: 30, settled_at: '2026-11-19T17:00:00.000Z' }];

  assert.deepEqual(summarizeWeeklyAttribution(sales, settlements, '2026-11-16'), {
    salesCents: 7_500,
    saleCount: 1,
    refundsCents: 3_000,
    refundCount: 1,
  });
});
