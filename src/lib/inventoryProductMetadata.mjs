const MAXIMUM_INVENTORY_QUANTITY = 99_999_999_999.999;

const normalizeOptionKey = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es');

export const INVENTORY_TYPE_SUGGESTIONS = [
  'Material',
  'Insumo',
  'Consumible',
  'Accesorio',
  'Sustrato de impresión',
  'Producto terminado',
  'Componente',
  'Repuesto',
  'Herramienta',
  'Equipo',
  'Empaque / embalaje',
];

export const INVENTORY_TAG_SUGGESTIONS = [
  'alucobond', 'panel compuesto de aluminio', 'acrílico', 'aluminio', 'PVC espumado',
  'material rígido', 'material flexible', 'vinil', 'vinil adhesivo', 'vinil de transferencia',
  'lona', 'papel', 'cartón', 'tinta', 'tinta ecosolvente', 'tinta de sublimación',
  'adhesivo', 'laminado', 'brillante', 'mate', 'arenado', 'transparente',
  'impresión', 'sublimación', 'rotulación', 'señalética', 'corte láser',
  'interior', 'exterior', 'consumible', 'repuesto', 'proveedor por confirmar',
];

export const INVENTORY_PURCHASE_UNIT_SUGGESTIONS = [
  'Unidad', 'Paquete', 'Rollo', 'Resma', 'Hoja', 'Lámina', 'Metro lineal',
  'Metro cuadrado', 'Litro', 'Galón', 'Caja', 'Juego',
];

export const INVENTORY_BASE_UNIT_SUGGESTIONS = [
  'unidad', 'paquete', 'metro lineal', 'metro cuadrado', 'metro', 'centímetro',
  'hoja', 'rollo', 'lámina', 'litro', 'mililitro', 'kilogramo', 'gramo',
];

export const INVENTORY_SPECIFICATION_SUGGESTIONS = {
  finish: ['Brillante', 'Mate', 'Satinado', 'Transparente', 'Arenado / esmerilado', 'Metalizado', 'Texturizado', 'Natural'],
  color: ['Blanco', 'Negro', 'Transparente', 'Natural', 'Dorado', 'Plateado', 'Rojo', 'Amarillo', 'Azul', 'Verde', 'Multicolor'],
  material: ['Aluminio', 'Panel compuesto de aluminio (ACM)', 'Acrílico', 'PVC espumado', 'Vinil', 'Lona', 'Papel', 'Cartón', 'Poliéster', 'PET', 'Polipropileno', 'Plástico'],
};

export function mergeInventoryOptionSuggestions(...groups) {
  const values = new Map();
  for (const group of groups) {
    for (const rawValue of Array.isArray(group) ? group : [group]) {
      const value = String(rawValue ?? '').trim().replace(/\s+/g, ' ');
      const key = normalizeOptionKey(value);
      if (key && !values.has(key)) values.set(key, value);
    }
  }
  return [...values.values()].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }));
}

export function inventoryTypeSuggestions(items = []) {
  return mergeInventoryOptionSuggestions(INVENTORY_TYPE_SUGGESTIONS, items.map((item) => item?.itemType));
}

export function inventoryTagSuggestions(items = []) {
  return mergeInventoryOptionSuggestions(INVENTORY_TAG_SUGGESTIONS, items.flatMap((item) => Array.isArray(item?.tags) ? item.tags : []));
}

export function inventorySpecificationSuggestions(items = [], field) {
  const defaults = field === 'purchase_unit'
    ? INVENTORY_PURCHASE_UNIT_SUGGESTIONS
    : INVENTORY_SPECIFICATION_SUGGESTIONS[field] || [];
  const savedValues = items.flatMap((item) => [item?.variantAttributes?.[field], item?.customFields?.[field]]);
  return mergeInventoryOptionSuggestions(defaults, savedValues);
}

export function inventoryBaseUnitSuggestions(items = []) {
  return mergeInventoryOptionSuggestions(INVENTORY_BASE_UNIT_SUGGESTIONS, items.map((item) => item?.unit));
}

export function inventoryVariantSpecificationValues(variantAttributes = {}, customFields = {}) {
  const result = { ...(variantAttributes && typeof variantAttributes === 'object' ? variantAttributes : {}) };
  const inheritedKeys = ['paper_size', 'width_cm', 'length_m', 'roll_length_reference_m', 'finish', 'color', 'purchase_unit', 'supplier_code', 'barcode', 'material'];
  for (const key of inheritedKeys) {
    if ((result[key] === undefined || result[key] === null || result[key] === '') && customFields?.[key] !== undefined && customFields?.[key] !== null && customFields?.[key] !== '') {
      result[key] = customFields[key];
    }
  }
  return result;
}

export function normalizeInventoryCategoryName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es');
}

export function inventoryCategoryCode(value) {
  const slug = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug ? 'CAT-' + slug : '';
}

export function normalizeInventoryProductMetadata({ name, category, variant, minimum }) {
  const normalizedName = String(name ?? '').trim();
  if (!normalizedName) throw new Error('Escribe el nombre del producto antes de guardar.');

  const minimumText = String(minimum ?? '').trim();
  const normalizedMinimum = Number(minimumText);
  if (!minimumText || !Number.isFinite(normalizedMinimum) || normalizedMinimum < 0 || normalizedMinimum > MAXIMUM_INVENTORY_QUANTITY) {
    throw new Error('El mínimo para reponer debe ser un número igual o mayor que cero.');
  }

  const normalizedCategory = String(category ?? '').trim().replace(/\s+/g, ' ');
  const categoryCode = inventoryCategoryCode(normalizedCategory);
  if (normalizedCategory && !categoryCode) throw new Error('Escribe una categoría con al menos una letra o un número.');

  return {
    name: normalizedName,
    category: normalizedCategory,
    categoryCode: categoryCode || null,
    variant: String(variant ?? '').trim(),
    minimum: Math.round(normalizedMinimum * 1000) / 1000,
  };
}
