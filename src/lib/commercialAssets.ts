import { supabase } from './supabaseClient';

export const COMMERCIAL_ASSET_BUCKET = 'commercial-document-assets';
export type CommercialAssetDraft = { id: string; kind: 'image' | 'link'; title: string; description: string; file?: File; previewUrl?: string; url?: string };

export async function optimizeCommercialImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Elige un archivo de imagen.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La imagen supera el límite de 20 MB.');
  if (typeof createImageBitmap !== 'function') {
    if (file.size > 10 * 1024 * 1024) throw new Error('El navegador no puede optimizar esta imagen y supera 10 MB. Prueba con una versión más ligera.');
    return file;
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d'); if (!context) { bitmap.close(); return file; }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo optimizar la imagen.')), 'image/webp', 0.82));
  if (blob.size > 10 * 1024 * 1024) {
    if (file.size <= 10 * 1024 * 1024) return file;
    throw new Error('La imagen sigue superando 10 MB después de optimizarla. Redúcela o exporta una versión más ligera.');
  }
  if (blob.size >= file.size) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'imagen'}.webp`, { type: 'image/webp', lastModified: Date.now() });
}

export async function persistCommercialAssets(args: { organizationId: string; documentId: string; kind: 'quote' | 'sale'; assets: CommercialAssetDraft[] }) {
  if (!supabase) throw new Error('No hay una conexión activa para guardar los adjuntos.');
  const rows: any[] = []; const uploaded: string[] = [];
  try {
    for (let index = 0; index < args.assets.length; index += 1) {
      const asset = args.assets[index];
      if (asset.kind === 'link') {
        const url = new URL(asset.url || '');
        if (url.protocol !== 'https:') throw new Error(`El enlace “${asset.title}” debe usar HTTPS.`);
        rows.push({ organization_id: args.organizationId, document_kind: args.kind, document_id: args.documentId, asset_type: 'link', title: asset.title.trim(), description: asset.description.trim(), external_url: url.toString(), sort_order: index });
        continue;
      }
      if (!asset.file) continue;
      const path = `${args.organizationId}/${args.kind}/${args.documentId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(COMMERCIAL_ASSET_BUCKET).upload(path, asset.file, { contentType: asset.file.type || 'image/webp', upsert: false });
      if (error) throw error;
      uploaded.push(path);
      rows.push({ organization_id: args.organizationId, document_kind: args.kind, document_id: args.documentId, asset_type: 'image', title: asset.title.trim() || asset.file.name, description: asset.description.trim(), storage_path: path, mime_type: asset.file.type, file_size: asset.file.size, sort_order: index });
    }
    if (rows.length) { const { error } = await supabase.from('commercial_document_assets').insert(rows); if (error) throw error; }
    return rows;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(COMMERCIAL_ASSET_BUCKET).remove(uploaded);
    throw error;
  }
}

export async function loadCommercialAssets(kind: 'quote' | 'sale', documentId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('commercial_document_assets').select('*').eq('document_kind', kind).eq('document_id', documentId).order('sort_order');
  if (error) throw error;
  return Promise.all((data || []).map(async (asset: any) => {
    if (!asset.storage_path) return asset;
    const { data: signed, error: signedError } = await supabase.storage.from(COMMERCIAL_ASSET_BUCKET).createSignedUrl(asset.storage_path, 3600);
    if (signedError) throw signedError;
    return { ...asset, signed_url: signed.signedUrl };
  }));
}
