export const INVENTORY_REFERENCE_PREFIX = 'inventory-reference-images://';
const INVENTORY_REFERENCE_BUCKET = 'inventory-reference-images';

export function inventoryReferenceObjectPath(url) {
  if (!url) return null;
  if (url.startsWith(INVENTORY_REFERENCE_PREFIX)) {
    try { return decodeURIComponent(url.slice(INVENTORY_REFERENCE_PREFIX.length).split(/[?#]/)[0]); } catch { return null; }
  }
  const markers = [`/storage/v1/object/sign/${INVENTORY_REFERENCE_BUCKET}/`, `/storage/v1/object/public/${INVENTORY_REFERENCE_BUCKET}/`];
  for (const marker of markers) {
    const offset = url.indexOf(marker);
    if (offset < 0) continue;
    try { return decodeURIComponent(url.slice(offset + marker.length).split(/[?#]/)[0]); } catch { return null; }
  }
  return null;
}

export function normalizeInventoryImagePath(value, organizationId, itemId) {
  const path = String(value || '').trim();
  if (!path) return '';
  const objectPath = inventoryReferenceObjectPath(path)
    || (organizationId && itemId && path.startsWith(`${organizationId}/${itemId}/`) ? path : null);
  return objectPath ? `${INVENTORY_REFERENCE_PREFIX}${objectPath}` : path;
}
