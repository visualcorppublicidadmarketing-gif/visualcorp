import React, { useEffect, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Link2, Trash2 } from 'lucide-react';
import { COMMERCIAL_ASSET_BUCKET, loadCommercialAssets } from '../../lib/commercialAssets';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthProvider';
import './commercial-components.css';

export function CommercialAssetsGallery({ kind, documentId }: { kind: 'quote' | 'sale'; documentId: string }) {
  const { hasPermission } = useAuth();
  const canDelete = kind === 'quote' ? hasPermission('quotes', 'delete_records') : hasPermission('sales', 'edit');
  const [assets, setAssets] = useState<any[]>([]); const [error, setError] = useState('');
  useEffect(() => { let active = true; loadCommercialAssets(kind, documentId).then((rows) => { if (active) setAssets(rows); }).catch((reason) => { if (active) setError(reason?.message || 'No se pudieron cargar los archivos adjuntos.'); }); return () => { active = false; }; }, [kind, documentId]);
  if (!assets.length && !error) return null;
  const remove = async (asset: any) => {
    if (!canDelete || !supabase || !window.confirm(`¿Quitar “${asset.title || 'este archivo'}” de la ficha?`)) return;
    setError('');
    if (asset.storage_path) { const { error: storageError } = await supabase.storage.from(COMMERCIAL_ASSET_BUCKET).remove([asset.storage_path]); if (storageError) { setError(storageError.message); return; } }
    const { error: rowError } = await supabase.from('commercial_document_assets').delete().eq('id', asset.id);
    if (rowError) { setError(rowError.message); return; }
    setAssets((current) => current.filter((row) => row.id !== asset.id));
  };
  return <section className="commercial-saved-assets"><div><span className="eyebrow">ARCHIVOS DEL TRABAJO</span><h4>Fotos, diseños y enlaces</h4></div>{error && <p role="alert">{error}</p>}<div className="commercial-assets-grid">{assets.map((asset) => <article className="commercial-asset-card" key={asset.id}>{asset.asset_type === 'image' && asset.signed_url ? <a href={asset.signed_url} target="_blank" rel="noreferrer"><img src={asset.signed_url} alt={asset.title || 'Imagen adjunta'}/></a> : <div className="commercial-asset-link-icon">{asset.asset_type === 'link' ? <Link2/> : <ImageIcon/>}</div>}<b>{asset.title || (asset.asset_type === 'link' ? 'Enlace' : 'Imagen')}</b>{asset.description && <p>{asset.description}</p>}{asset.external_url && <a href={asset.external_url} target="_blank" rel="noreferrer">Abrir enlace <ExternalLink size={13}/></a>}{canDelete && <button type="button" className="button button-outline is-danger" onClick={() => void remove(asset)}><Trash2 size={14}/> Quitar archivo</button>}</article>)}</div></section>;
}
