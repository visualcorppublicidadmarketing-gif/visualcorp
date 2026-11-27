import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { persistCommercialAssets, type CommercialAssetDraft } from '../../lib/commercialAssets';
import { posSaleAssetRecovery } from '../../lib/posSaleAssetRecovery';
import './commercial-asset-repair.css';

export function CommercialAssetRepair({ kind, documentId, onSynced }: { kind: 'quote' | 'sale'; documentId: string; onSynced?: () => void }) {
  const { organizationId, user, hasPermission } = useAuth();
  const [state, setState] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Record<string, File>>({});
  const scope = `${organizationId}:${user?.id}:repair:${kind}:${documentId}`;
  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data, error: issue } = await supabase.rpc('get_commercial_asset_sync', { p_kind: kind, p_document: documentId });
    if (issue) throw issue;
    setState(data);
  }, [kind, documentId]);
  useEffect(() => { setFiles({}); setState(null); setError(''); void refresh().catch(issue => setError(issue.message)); }, [refresh]);
  const missing = (state?.manifest || []).filter((entry: any) => !state.uploaded_ids.includes(entry.asset_client_id));
  const retry = async () => {
    if (!organizationId || busy) return;
    setBusy(true); setError('');
    try {
      const cached = await posSaleAssetRecovery.load(scope);
      const assets: CommercialAssetDraft[] = missing.map((entry: any) => ({ id: entry.asset_client_id, kind: entry.kind, title: entry.title, description: entry.description, url: entry.url,
        file: files[entry.asset_client_id] || cached?.assets.find(asset => asset.id === entry.asset_client_id)?.file }));
      const complete = assets.filter(asset => asset.kind === 'link' || asset.file);
      if (!complete.length) throw new Error('Selecciona el archivo original pendiente para repararlo.');
      await posSaleAssetRecovery.save(scope, complete, documentId);
      await persistCommercialAssets({ organizationId, kind, documentId, assets: complete, registered: true });
      await posSaleAssetRecovery.clear(scope);
      await refresh(); onSynced?.();
    } catch (issue: any) { setError(issue.message || 'No se pudo completar la sincronización.'); }
    finally { setBusy(false); }
  };
  if (!missing.length && !error) return null;
  return <section className="commercial-asset-repair" aria-label="Recuperación de adjuntos">
    <div role="status"><strong>Adjuntos pendientes de reparación: {missing.length}/{state?.manifest?.length || 0}</strong><p>La intención está guardada en el documento. Puedes reanudar desde este dispositivo seleccionando los archivos originales.</p></div>
    {error && <p role="alert">{error}</p>}
    {hasPermission(kind === 'sale' ? 'sales' : 'quotes', 'edit') && <>
      {missing.map((entry: any) => <label key={entry.asset_client_id}><span>{entry.title || entry.file_name || 'Enlace pendiente'}</span>{entry.kind === 'image' ? <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(current => ({ ...current, [entry.asset_client_id]: file })); }}/> : <small>{entry.url}</small>}</label>)}
      <button type="button" className="button button-outline" onClick={() => void retry()} disabled={busy}><RefreshCw size={14}/>{busy ? 'Sincronizando…' : 'Reintentar adjuntos'}</button>
    </>}
  </section>;
}
