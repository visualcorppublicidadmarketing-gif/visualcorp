import { supabase } from './supabaseClient';

export const COMMERCIAL_ASSET_BUCKET = 'commercial-document-assets';
export type CommercialAssetDraft = { id: string; kind: 'image' | 'link'; title: string; description: string; file?: File; previewUrl?: string; url?: string };

export function normalizeExternalWebUrl(value: string) {
  const input = String(value || '').trim();
  if (!input) throw new Error('Escribe una dirección web.');
  const hostPort = /^[^/?#\s]+:\d+(?:[/?#]|$)/.test(input);
  const candidate = input.startsWith('//')
    ? `https:${input}`
    : /^https?:\/\//i.test(input)
      ? input
      : /^[a-z][a-z\d+.-]*:/i.test(input) && !hostPort
        ? input
        : `https://${input}`;
  let url: URL;
  try { url = new URL(candidate); }
  catch { throw new Error('Revisa la dirección; puedes pegar solo el dominio o la dirección completa.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Usa un enlace web con http o https.');
  }
  url.protocol = 'https:';
  return url.href;
}

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

export type CommercialAssetManifestEntry = { asset_client_id: string; kind: 'image' | 'link'; title: string; description: string; url?: string; file_name?: string; mime_type?: string; file_size?: number; sha256?: string };
export async function commercialAssetManifest(assets: CommercialAssetDraft[]): Promise<CommercialAssetManifestEntry[]> {
  return Promise.all(assets.map(async (asset) => ({
    asset_client_id: asset.id, kind: asset.kind, title: asset.title.trim() || asset.file?.name || '', description: asset.description.trim(),
    ...(asset.kind === 'link' ? { url: normalizeExternalWebUrl(asset.url || '') } : {
      file_name: asset.file?.name || '', mime_type: asset.file?.type || '', file_size: asset.file?.size || 0,
      sha256: asset.file ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await asset.file.arrayBuffer()))).map(byte => byte.toString(16).padStart(2, '0')).join('') : '',
    }),
  })));
}

export async function persistCommercialAssets(args: { organizationId: string; documentId: string; kind: 'quote' | 'sale'; assets: CommercialAssetDraft[]; registered?: boolean }) {
  if (!supabase) throw new Error('No hay una conexión activa para guardar los adjuntos.');
  try {
    if (!args.registered) {
      const { error } = await supabase.rpc('register_commercial_asset_intent', { p_kind: args.kind, p_document: args.documentId, p_manifest: await commercialAssetManifest(args.assets) });
      if (error) throw error;
    }
    const { data: state, error: stateError } = await supabase.rpc('get_commercial_asset_sync', { p_kind: args.kind, p_document: args.documentId });
    if (stateError) throw stateError;
    for (const asset of args.assets) {
      if (state.uploaded_ids.includes(asset.id)) continue;
      const expected = state.manifest.find((entry: any) => entry.asset_client_id === asset.id);
      if (!expected) throw new Error('El adjunto no está declarado en el documento.');
      if (asset.kind === 'image') {
        if (!asset.file) throw new Error(`Vuelve a seleccionar ${expected.file_name || expected.title}.`);
        const [manifest] = await commercialAssetManifest([asset]);
        if (manifest.sha256 !== expected.sha256 || manifest.file_size !== expected.file_size || manifest.mime_type !== expected.mime_type) throw new Error('El archivo elegido no coincide con el original pendiente.');
        const path = `${args.organizationId}/${args.kind}/${args.documentId}/${asset.id}`;
        const { error } = await supabase.storage.from(COMMERCIAL_ASSET_BUCKET).upload(path, asset.file, { contentType: asset.file.type, upsert: false });
        // Immutable deterministic objects: a lost response is finalized, never overwritten.
        if (error && String((error as any).statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) throw error;
      }
      const { error } = await supabase.rpc('finalize_commercial_asset', { p_kind: args.kind, p_document: args.documentId, p_asset_client_id: asset.id });
      if (error) throw error;
    }
  } catch (error) {
    await supabase.rpc('mark_commercial_assets_repair_required', { p_kind: args.kind, p_document: args.documentId });
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
