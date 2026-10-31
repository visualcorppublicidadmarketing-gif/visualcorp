export type InventoryGalleryImage = {
  key: string;
  src: string;
  path?: string;
  file?: File;
  label?: string;
};

export const INVENTORY_REFERENCE_PREFIX = 'inventory-reference-images://';
export const INVENTORY_REFERENCE_BUCKET = 'inventory-reference-images';
export const MAX_INVENTORY_REFERENCE_BYTES = 5 * 1024 * 1024;

export function inventoryReferenceObjectPath(url: string | null | undefined): string | null {
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
export async function prepareInventoryReferenceImage(source: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type)) throw new Error('Usa una imagen PNG, JPG o WebP.');
  if (source.size > 80 * 1024 * 1024) throw new Error('La imagen supera 80 MB. Reduce su tamaño antes de continuar.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(source); } catch { throw new Error('No se pudo abrir la imagen. Prueba con un archivo PNG, JPG o WebP.'); }
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('No se pudo preparar la imagen para subirla.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.8));
  if (!blob) throw new Error('No se pudo comprimir la imagen.');
  if (blob.size > MAX_INVENTORY_REFERENCE_BYTES) throw new Error('La imagen supera el límite de 5 MB después de comprimirla.');
  const stem = source.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 48) || 'referencia';
  return new File([blob], `${stem}.webp`, { type: 'image/webp', lastModified: source.lastModified || Date.now() });
}

