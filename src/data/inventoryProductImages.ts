import imageIndex from './inventory-product-images.json';

type InventoryImageSource = 'generated' | 'company-photo' | 'company-sample';
type InventoryImageRecord = { name: string; source: InventoryImageSource; file?: string; sheet?: string; tile?: number; asset?: string };
const products = (imageIndex as { products: Record<string, InventoryImageRecord> }).products;
const materialRollImages: Record<string, { name: string; asset: string; matches: RegExp[] }> = {
  microperforatedVinyl: { name: 'Vinil microperforado', asset: 'vinil-microperforado.webp', matches: [/microperforad/] },
  translucentBanner: { name: 'Lona translúcida', asset: 'lona-translucida.webp', matches: [/lona.*(transluc|trasluc)|(?:transluc|trasluc).*lona/] },
  standardBanner: { name: 'Lona estándar', asset: 'lona-estandar.webp', matches: [/lonas?/] },
  reflectiveVinyl: { name: 'Vinil reflectivo', asset: 'vinil-reflectivo.webp', matches: [/reflectiv/] },
  frostedVinyl: { name: 'Vinil esmerilado', asset: 'vinil-esmerilado.webp', matches: [/esmerilad|arenad/] },
  transparentVinyl: { name: 'Vinil transparente', asset: 'vinil-transparente.webp', matches: [/transparent/] },
  matteVinyl: { name: 'Vinil mate', asset: 'vinil-mate.webp', matches: [/\bmate\b|\bmatte\b/] },
  glossyVinyl: { name: 'Vinil adhesivo brillante', asset: 'vinil-brillante.webp', matches: [/brillant|dorado|vinil/] },
};
const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const materialAssetPath = (asset: string) => `/inventory/catalog-materials/${asset}`;

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

export type InventoryImageItem = {
  sku?: string | null;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  itemType?: string | null;
  variant?: string | null;
  tags?: string[] | null;
  referenceImageUrl?: string | null;
};

export function inventoryRollMaterialImageRecord(item: InventoryImageItem) {
  const sku = normalize(item.sku);
  const text = normalize([
    item.sku,
    item.name,
    item.description,
    item.category,
    item.itemType,
    item.variant,
    ...(item.tags || []),
  ].join(' '));
  if (!/\b(lonas?|viniles?|microperforados?)\b/.test(text)) return null;

  const match = Object.values(materialRollImages).find((material) => material.matches.some((pattern) => pattern.test(text)));
  if (!match) return null;
  const record = sku ? products[item.sku!] : undefined;
  return {
    name: record?.name || match.name,
    source: 'generated' as const,
    path: record?.asset ? `/inventory/${record.asset}` : materialAssetPath(match.asset),
    label: 'Referencia generada',
  };
}

export function inventoryImageForItem(item: InventoryImageItem) {
  return inventoryRollMaterialImageRecord(item)?.path || item.referenceImageUrl || inventoryImageForSku(item.sku);
}

export function inventoryImageSourceForSku(sku?: string | null) {
  return inventoryImageRecordForSku(sku)?.label || '';
}
