import React, { useEffect, useState } from 'react';
import { Download, Eye, FileImage, LoaderCircle, X } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import './marketing-asset-preview.css';

type AssetPreview = { filename: string; extension?: string; rel_path: string; storage_status?: string };
const BUCKET_PREFIX = 'storage://marketing-assets/';

export function MarketingAssetPreview({ asset }: { asset: AssetPreview }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const extension = (asset.extension || '').replace(/^\./, '').toLowerCase();
  const isImage = ['png','jpg','jpeg','webp','gif','avif','svg','tif','tiff'].includes(extension);
  const isVideo = ['mp4','webm','mov'].includes(extension);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const showPreview = async () => {
    if (!supabase || !asset.rel_path.startsWith(BUCKET_PREFIX)) return;
    setOpen(true); setError(''); setLoading(true);
    try {
      const objectPath = asset.rel_path.slice(BUCKET_PREFIX.length);
      const { data, error: signedUrlError } = await supabase.storage.from('marketing-assets').createSignedUrl(objectPath, 300);
      if (signedUrlError) throw signedUrlError;
      setUrl(data.signedUrl);
    } catch (cause: any) {
      setError(cause?.message || 'No se pudo abrir una vista segura del archivo.');
    } finally { setLoading(false); }
  };

  if (asset.storage_status !== 'supabase_storage') return <div className="vc-marketing-asset-mark"><FileImage size={19}/><span>{extension.toUpperCase() || 'FILE'}</span></div>;
  return <>
    <button type="button" className="vc-marketing-asset-mark is-previewable" aria-label={`Previsualizar ${asset.filename}`} onClick={() => void showPreview()} title="Abrir vista previa"><FileImage size={19}/><span>{extension.toUpperCase() || 'FILE'}</span><i><Eye size={13}/></i></button>
    {open && <div className="vc-marketing-preview-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="vc-marketing-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="vc-marketing-preview-title"><header><div><span className="eyebrow">BIBLIOTECA · VISTA PRIVADA</span><h2 id="vc-marketing-preview-title">{asset.filename}</h2></div><button type="button" aria-label="Cerrar vista previa" onClick={() => setOpen(false)}><X size={18}/></button></header><div className="vc-marketing-preview-content">{loading ? <div className="vc-content-loading"><LoaderCircle className="vc-content-spin" size={21}/>Preparando acceso seguro…</div> : error ? <p role="alert">{error}</p> : isImage ? <img src={url} alt={asset.filename}/> : isVideo ? <video src={url} controls playsInline/> : extension === 'pdf' ? <iframe src={url} title={`Vista previa de ${asset.filename}`}/> : <div className="vc-marketing-preview-file"><FileImage size={34}/><p>Este formato no tiene vista previa en el navegador.</p><a href={url} download={asset.filename}><Download size={15}/>Descargar archivo</a></div>}</div><footer><span>El enlace temporal vence en cinco minutos y respeta los permisos de Marketing.</span>{url && !isImage && !isVideo && extension !== 'pdf' && <a href={url} download={asset.filename}><Download size={14}/>Descargar</a>}</footer></section></div>}
  </>;
}
