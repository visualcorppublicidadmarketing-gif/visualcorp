export type InventoryEntry = {
  id: string;
  name: string;
  variantId?: string;
  variant?: string;
  sku?: string;
  variantSku?: string;
  category?: string;
  itemType?: string;
  tags?: string[];
  branchId?: string | null;
  branch?: string;
  area?: string;
  location?: string;
  unit?: string;
  quantity?: number | string | null;
  reservedQuantity?: number | string | null;
  availableQuantity?: number | string | null;
  minimum?: number | string | null;
  minimumConfigured?: boolean;
  sourceStatus?: string;
  archived?: boolean;
  updatedAt?: string;
  consumedLast30Days?: number | null;
  lifetimeConsumed?: number | null;
};

export type InventoryStatus = 'Sin conteo' | 'Por verificar' | 'Sin disponible' | 'Mínimo pendiente' | 'Reponer' | 'En stock';
export type InventoryPriority = 'unavailable' | 'below' | 'minimum' | 'minimum_unconfigured' | 'unverified' | 'healthy';

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function getInventoryBalance(item: InventoryEntry) {
  const physical = item.sourceStatus || !item.branchId ? null : numberOrNull(item.quantity);
  // Missing metrics are unknown. A physical count alone does not prove that nothing is reserved.
  const available = physical === null ? null : numberOrNull(item.availableQuantity);
  const reserved = available === null ? null : numberOrNull(item.reservedQuantity);
  const minimum = Math.max(0, numberOrNull(item.minimum) ?? 0);
  const minimumConfigured = item.minimumConfigured ?? minimum > 0;
  const toMinimum = available === null ? null : Math.max(0, Number((minimum - available).toFixed(6)));
  return { physical, reserved, available, minimum, minimumConfigured, toMinimum };
}

export function getInventoryStatus(item: InventoryEntry): InventoryStatus {
  const { physical, available, minimum, minimumConfigured } = getInventoryBalance(item);
  if (physical === null) return 'Sin conteo';
  if (available === null) return 'Por verificar';
  if (available <= 0) return 'Sin disponible';
  if (!minimumConfigured) return 'Mínimo pendiente';
  if (available <= minimum) return 'Reponer';
  return 'En stock';
}

export function getInventoryPriority(item: InventoryEntry): InventoryPriority {
  const { available, minimum, minimumConfigured } = getInventoryBalance(item);
  if (available === null) return 'unverified';
  if (available <= 0) return 'unavailable';
  if (!minimumConfigured) return 'minimum_unconfigured';
  if (available < minimum) return 'below';
  if (minimum > 0 && available === minimum) return 'minimum';
  return 'healthy';
}

export const inventoryStatusTone = (item: InventoryEntry) => {
  const priority = getInventoryPriority(item);
  return priority === 'unverified' || priority === 'minimum_unconfigured' ? 'pending' : priority === 'healthy' ? 'ok' : 'low';
};

export const needsInventoryReplenishment = (item: InventoryEntry) => !item.archived && !['healthy', 'unverified'].includes(getInventoryPriority(item));

export const normalizeInventorySearch = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function matchesInventorySearch(item: InventoryEntry, query: string) {
  const terms = normalizeInventorySearch(query).split(/\s+/).filter(Boolean);
  const text = normalizeInventorySearch([item.name, item.variant, item.sku, item.variantSku, item.category, item.itemType, item.branch, item.area, item.location, ...(item.tags || [])].join(' '));
  return terms.every(term => text.includes(term));
}

export function compareInventoryPriority(a: InventoryEntry, b: InventoryEntry) {
  const rank: Record<InventoryPriority, number> = { unavailable: 0, below: 1, minimum: 2, minimum_unconfigured: 3, unverified: 4, healthy: 5 };
  // Quantities of different materials/units cannot be used as a common priority score.
  return rank[getInventoryPriority(a)] - rank[getInventoryPriority(b)] || a.name.localeCompare(b.name, 'es') || String(a.branch).localeCompare(String(b.branch), 'es') || a.id.localeCompare(b.id);
}

const quantityFormat = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 6 });
export const formatInventoryQuantity = (value: number | null, unit = '') => value === null ? 'Por verificar' : `${quantityFormat.format(value)}${unit ? ` ${unit}` : ''}`;

export function inventoryReplenishmentReason(item: InventoryEntry) {
  const { available, minimum, minimumConfigured } = getInventoryBalance(item);
  if (!item.branchId) return 'Asigna una sucursal y confirma el conteo físico.';
  if (getInventoryBalance(item).physical === null) return 'Confirma el conteo físico antes de calcular una reposición.';
  if (available === null) return 'Falta verificar la disponibilidad y las reservas.';
  if (available <= 0) return minimum > 0 ? 'No hay cantidad disponible para cubrir nuevas salidas.' : 'No hay disponible y el mínimo registrado es 0; revisa la necesidad.';
  if (!minimumConfigured) return 'Define un mínimo de reposición o confirma que no requiere esta alerta.';
  if (available < minimum) return 'La cantidad disponible está por debajo del mínimo registrado.';
  if (minimum > 0 && available === minimum) return 'Está exactamente en el mínimo; no se calcula una cantidad adicional.';
  return minimum > 0 ? 'La cantidad disponible supera el mínimo registrado.' : 'Tiene disponible; el mínimo registrado es 0.';
}

export function inventoryUsageByUnit(items: InventoryEntry[], field: 'consumedLast30Days' | 'lifetimeConsumed') {
  const groups = new Map<string, number>();
  for (const item of items) {
    const quantity = numberOrNull(item[field]);
    if (quantity === null) continue;
    const unit = item.unit || 'Sin unidad';
    groups.set(unit, (groups.get(unit) || 0) + quantity);
  }
  return [...groups].map(([unit, quantity]) => ({ unit, quantity })).sort((a, b) => a.unit.localeCompare(b.unit, 'es'));
}

export function inventoryReplenishmentCsv(items: InventoryEntry[], capturedAt = new Date().toISOString()) {
  const rows: Array<Array<string | number | null>> = [
    ['Fecha de exportación', 'Artículo', 'Variante', 'SKU ficha', 'SKU variante', 'Sucursal', 'Área', 'Ubicación', 'Unidad', 'Estado', 'Físico', 'Reservado', 'Disponible', 'Mínimo de la ficha', 'Mínimo configurado', 'Falta para el mínimo (no es pedido)', 'Motivo', 'Última actualización'],
    ...items.map(item => {
      const balance = getInventoryBalance(item);
      return [capturedAt, item.name, item.variant || '', item.sku || '', item.variantSku || '', item.branch || '', item.area || '', item.location || '', item.unit || '', getInventoryStatus(item), balance.physical, balance.reserved, balance.available, balance.minimum, balance.minimumConfigured ? 'Sí' : 'No', balance.toMinimum, inventoryReplenishmentReason(item), item.updatedAt || ''];
    }),
  ];
  const cell = (value: string | number | null) => {
    if (typeof value === 'number') return String(value);
    const text = value ?? '';
    // Treat user-entered labels as text when the CSV is opened in a spreadsheet.
    const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
