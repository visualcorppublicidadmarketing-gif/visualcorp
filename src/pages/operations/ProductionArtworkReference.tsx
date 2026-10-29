import { useEffect, useState } from 'react';
import { ArrowUpRight, FileImage, LoaderCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const BUCKET = 'production-artwork';
const PREFIX = `storage://${BUCKET}/`;

export function ProductionArtworkReference({ reference }: { reference: string }) {
  const [signedUrl, setSignedUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setSignedUrl(''); setError(''); }, [reference]);
  if (!reference) return null;

  if (!reference.startsWith(PREFIX)) {
    try {
      const url = new URL(reference);
      if (url.protocol !== 'https:') return null;
      return <a className="pj-artwork-link" href={url.href} target="_blank" rel="noopener noreferrer">Abrir enlace entregado <ArrowUpRight size={14}/></a>;
    } catch { return null; }
  }

  const path = reference.slice(PREFIX.length);
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpe?g|webp|pdf)$/i.test(path)) return null;
  const isPdf = path.toLowerCase().endsWith('.pdf');
  const preparePreview = async () => {
    if (!supabase || loading) return;
    setLoading(true); setError('');
    try {
      const { data, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (signedError) throw signedError;
      setSignedUrl(data.signedUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos abrir la prueba privada.'); }
    finally { setLoading(false); }
  };
  return <div className="pj-artwork-preview">
    <button className="button button-outline" type="button" disabled={loading} onClick={() => void preparePreview()}>{loading ? <LoaderCircle size={14} className="pj-artwork-loading"/> : <FileImage size={14}/>} {signedUrl ? 'Renovar acceso' : 'Ver prueba privada'}</button>
    {signedUrl && <><div className="pj-artwork-preview-frame">{isPdf ? <iframe src={signedUrl} title="Prueba de arte en PDF"/> : <img src={signedUrl} alt="Prueba de arte entregada por Diseño"/>}</div><a className="pj-artwork-link" href={signedUrl} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña <ArrowUpRight size={14}/></a><small>Acceso temporal de 5 minutos. Si vence, renueva la vista.</small></>}
    {error && <p className="pj-error" role="alert">{error}</p>}
  </div>;
}
