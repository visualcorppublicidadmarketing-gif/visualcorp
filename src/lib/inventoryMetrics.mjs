const positiveAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export function inventoryHealthState(item) {
  if (item.archived) return 'archived';
  if (item.sourceStatus) return 'uncounted';
  if (Number(item.quantity) <= 0) return 'outOfStock';

  const available = Number(item.availableQuantity ?? (Number(item.quantity) - Number(item.reservedQuantity || 0)));
  return available <= Number(item.minimum) ? 'replenish' : 'inStock';
}

export function summarizeInventoryHealth(items) {
  const summary = { total: 0, inStock: 0, replenish: 0, outOfStock: 0, uncounted: 0 };
  for (const item of items) {
    const state = inventoryHealthState(item);
    if (state === 'archived') continue;
    summary.total += 1;
    summary[state] += 1;
  }
  return summary;
}

export function inventoryNeedsReplenishment(item) {
  if (item.archived || item.sourceStatus || item.quantity == null) return false;
  const minimum = Number(item.minimum);
  const available = Number(item.availableQuantity ?? (Number(item.quantity) - Number(item.reservedQuantity || 0)));
  return Number.isFinite(minimum) && minimum > 0 && Number.isFinite(available) && available <= minimum;
}

export function summarizeInventoryUsage(items) {
  const totalsByUnit = new Map();
  let recordsLast30Days = 0;
  let recordsHistorically = 0;

  for (const item of items) {
    if (positiveAmount(item.consumedLast30Days)) recordsLast30Days += 1;
    const historical = positiveAmount(item.lifetimeConsumed);
    if (!historical) continue;
    recordsHistorically += 1;
    const unit = String(item.unit || 'Unidad sin definir').trim() || 'Unidad sin definir';
    const unitKey = unit.toLocaleLowerCase('es');
    const current = totalsByUnit.get(unitKey);
    totalsByUnit.set(unitKey, { unit, quantity: (current?.quantity || 0) + historical });
  }

  return {
    recordsLast30Days,
    recordsHistorically,
    totalsByUnit: [...totalsByUnit.values()].sort((a, b) => a.unit.localeCompare(b.unit, 'es')),
  };
}

export function inventoryCountDifference(expected, counted) {
  if (expected == null || expected === '' || counted == null || counted === '') return null;
  const expectedAmount = Number(expected);
  const countedAmount = Number(counted);
  if (!Number.isFinite(expectedAmount) || !Number.isFinite(countedAmount)) return null;
  return Number((countedAmount - expectedAmount).toFixed(3));
}
