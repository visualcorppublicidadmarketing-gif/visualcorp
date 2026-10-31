export function nextInventorySku(prefix, itemSkus, variantSkus) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
  let next = itemSkus.reduce((maximum, sku) => {
    const match = String(sku || '').match(pattern);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;

  const itemCodes = new Set(itemSkus.map((sku) => String(sku || '').toUpperCase()));
  const variantCodes = new Set(variantSkus.map((sku) => String(sku || '').toUpperCase()));
  let candidate = `${prefix}${String(next).padStart(3, '0')}`;
  while (itemCodes.has(candidate.toUpperCase()) || variantCodes.has(`${candidate}-01`.toUpperCase())) {
    next += 1;
    candidate = `${prefix}${String(next).padStart(3, '0')}`;
  }
  return candidate;
}

export function isInventoryItemSkuConflict(error) {
  return Boolean(error && typeof error === 'object' && error.code === '23505' &&
    (error.constraint === 'inventory_items_organization_id_sku_key' ||
      String(error.message || '').includes('inventory_items_organization_id_sku_key')));
}

export function isValidInventoryReference(value) {
  return /^(https?:\/\/|\/storage\/|\/inventory\/|\/inventory-reference-library\/|inventory-reference-images:\/\/)/i.test(String(value || '').trim());
}

export function isRecoverableInventoryItem(row, { userId, areaId, brandScope, requestedSku = '', now = Date.now() }) {
  if (!row || row.created_by !== userId || row.area_id !== areaId || row.custom_fields?.brand_scope !== brandScope) return false;
  if (requestedSku && row.sku !== requestedSku) return false;
  const createdAt = new Date(row.created_at).getTime();
  return Number.isFinite(createdAt) && createdAt <= now && now - createdAt <= 24 * 60 * 60 * 1000;
}
