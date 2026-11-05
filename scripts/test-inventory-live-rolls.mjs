import test from 'node:test';
import assert from 'node:assert/strict';

function calculateRollMeters(standardLengthM, remainingPercent) {
  const clamped = Math.max(0, Math.min(100, Number(remainingPercent) || 0));
  return Math.round(((standardLengthM * clamped) / 100) * 100) / 100;
}

function resolveRollStatus(percent) {
  const p = Number(percent);
  if (p <= 0) return 'agotado';
  if (p <= 20) return 'en_peligro';
  return 'en_uso';
}

function validatePercentRange(percent) {
  const n = Number(percent);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    throw new Error('El porcentaje debe estar entre 0% y 100%.');
  }
  return Math.round(n * 100) / 100;
}

test('calculateRollMeters returns correct remaining meters for different roll lengths and percentages', () => {
  // Rollo de 50m al 30% -> 15m
  assert.equal(calculateRollMeters(50, 30), 15);
  // Rollo de 50m al 100% -> 50m
  assert.equal(calculateRollMeters(50, 100), 50);
  // Rollo de 50m al 0% -> 0m
  assert.equal(calculateRollMeters(50, 0), 0);
  // Rollo de 100m al 75% -> 75m
  assert.equal(calculateRollMeters(100, 75), 75);
  // Rollo de 25m al 40% -> 10m
  assert.equal(calculateRollMeters(25, 40), 10);
});

test('resolveRollStatus flags exhausted rolls as agotado and low levels as en_peligro', () => {
  assert.equal(resolveRollStatus(0), 'agotado');
  assert.equal(resolveRollStatus(10), 'en_peligro');
  assert.equal(resolveRollStatus(20), 'en_peligro');
  assert.equal(resolveRollStatus(25), 'en_uso');
  assert.equal(resolveRollStatus(100), 'en_uso');
});

test('validatePercentRange throws on out-of-bound percentages', () => {
  assert.throws(() => validatePercentRange(-5), /porcentaje debe estar entre 0% y 100%/);
  assert.throws(() => validatePercentRange(105), /porcentaje debe estar entre 0% y 100%/);
  assert.equal(validatePercentRange(35.5), 35.5);
});
