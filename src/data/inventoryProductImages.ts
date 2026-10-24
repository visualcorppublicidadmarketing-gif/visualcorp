import imageIndex from './inventory-product-images.json';

type InventoryImageSource = 'generated' | 'company-photo' | 'company-sample';
type InventoryImageRecord = { name: string; source: InventoryImageSource; file?: string; sheet?: string; tile?: number; asset?: string };
const products = (imageIndex as { products: Record<string, InventoryImageRecord> }).products;

export function inventoryImageRecordForSku(sku?: string | null) {
  const record = sku ? products[sku] : undefined;
  if (!record || !sku) return null;
  return {
    ...record,
    path: `/inventory/${record.asset || `${sku}.webp`}`,
    label: record.source === 'generated' ? 'Referencia generada' : record.source === 'company-sample' ? 'Muestra Visual Corp' : 'Foto Visual Corp',
  };
}

export function inventoryImageForSku(sku?: string | null) {
  return inventoryImageRecordForSku(sku)?.path || '';
}

export function inventoryImageForItem(item: { sku?: string | null; referenceImageUrl?: string | null }) {
  return item.referenceImageUrl || inventoryImageForSku(item.sku);
}

export function inventoryImageSourceForSku(sku?: string | null) {
  return inventoryImageRecordForSku(sku)?.label || '';
}
