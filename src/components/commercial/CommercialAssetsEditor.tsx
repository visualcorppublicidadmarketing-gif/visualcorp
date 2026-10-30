import React, { useRef, useState } from 'react';
import { ImagePlus, Link2, Paperclip, Trash2, Upload } from 'lucide-react';
import { normalizeExternalWebUrl, optimizeCommercialImage, type CommercialAssetDraft } from '../../lib/commercialAssets';
import './commercial-components.css';

const id = () => crypto.randomUUID();
export function CommercialAssetsEditor({ value, onChange, label = 'Fotos, diseños y enlaces', maxImages = 20 }: { value: CommercialAssetDraft[]; onChange: (next: CommercialAssetDraft[]) => void; label?: string; maxImages?: number }) {
  const inputRef = useRef<HTMLInputElement>(null); const [dragging, setDragging] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [link, setLink] = useState({ title: '', description: '', url: '' });
  const addFiles = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    const currentCount = value.filter((item) => item.kind === 'image').length;
    if (currentCount + images.length > maxImages) { setError(`Puedes adjuntar hasta ${maxImages} imágenes por documento.`); return; }
    setBusy(true); setError('');
    try { const added = await Promise.all(images.map(async (file) => { const optimized = await optimizeCommercialImage(file); return { id: id(), kind: 'image' as const, title: file.name.replace(/\.[^.]+$/, ''), description: '', file: optimized, previewUrl: URL.createObjectURL(optimized) }; })); onChange([...value, ...added]); }
    catch (reason: any) { setError(reason?.message || 'No se pudieron preparar las imágenes.'); }
    finally { setBusy(false); }
  };
  const paste = (event: React.ClipboardEvent) => { const files = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean) as File[]; if (files.length) { event.preventDefault(); void addFiles(files); } };
  const addLink = () => {
    if (!link.title.trim()) { setError('Escribe un título para el enlace.'); return; }
    try {
      const url = normalizeExternalWebUrl(link.url);
      onChange([...value, { ...link, url, id: id(), kind: 'link' }]);
      setLink({ title: '', description: '', url: '' });
      setError('');
    } catch (reason: any) { setError(reason?.message || 'Revisa el enlace e inténtalo de nuevo.'); }
  };
  const remove = (item: CommercialAssetDraft) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); onChange(value.filter((asset) => asset.id !== item.id)); };
  return <section className="commercial-assets-editor" onPaste={paste} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}>
    <header><div><span className="eyebrow">MATERIAL DEL CLIENTE Y PRODUCCIÓN</span><h3>{label}</h3><p>Pega con Ctrl+V, arrastra fotos o selecciónalas. Añade también archivos editables mediante enlaces.</p></div><button type="button" className="button button-outline" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={15}/> Añadir fotos</button><input ref={inputRef} hidden type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }}/></header>
    <div className={`commercial-assets-drop${dragging ? ' is-dragging' : ''}`} tabIndex={0} aria-label="Zona para pegar o arrastrar imágenes" onClick={(event) => { if (event.target === event.currentTarget) inputRef.current?.click(); }}><ImagePlus size={20}/><b>{busy ? 'Optimizando imágenes…' : 'Pega aquí una imagen o arrástrala'}</b><span>Ctrl+V · JPG, PNG, WebP y formatos compatibles del portapapeles</span></div>
    {value.length > 0 && <div className="commercial-assets-grid">{value.map((asset) => <article className="commercial-asset-card" key={asset.id}>{asset.kind === 'image' ? <img src={asset.previewUrl} alt={asset.title}/> : <div className="commercial-asset-link-icon"><Link2/></div>}<label>Título<input value={asset.title} maxLength={160} onChange={(event) => onChange(value.map((row) => row.id === asset.id ? { ...row, title: event.target.value } : row))}/></label><label>Descripción<textarea rows={2} maxLength={500} value={asset.description} onChange={(event) => onChange(value.map((row) => row.id === asset.id ? { ...row, description: event.target.value } : row))}/></label>{asset.kind === 'link' && <label>Enlace<input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={asset.url} onChange={(event) => onChange(value.map((row) => row.id === asset.id ? { ...row, url: event.target.value } : row))} onBlur={(event) => { if (!event.target.value.trim()) return; try { const url = normalizeExternalWebUrl(event.target.value); onChange(value.map((row) => row.id === asset.id ? { ...row, url } : row)); setError(''); } catch (reason: any) { setError(reason?.message || 'Revisa el enlace.'); } }}/></label>}<small>{asset.kind === 'image' ? `${((asset.file?.size || 0) / 1024).toFixed(0)} KB · optimizada` : 'Enlace externo · se normaliza al guardar'}</small><button type="button" className="button button-outline is-danger" onClick={() => remove(asset)}><Trash2 size={14}/> Quitar</button></article>)}</div>}
    <div className="commercial-assets-link-add"><h4><Paperclip size={15}/> Añadir enlace a diseño o archivo</h4><div><label>Título<input value={link.title} maxLength={160} onChange={(event) => setLink({ ...link, title: event.target.value })} placeholder="Diseño editable en Drive"/></label><label>URL<input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={link.url} onChange={(event) => setLink({ ...link, url: event.target.value })} placeholder="drive.google.com/… o www.ejemplo.com"/></label><label>Descripción<input value={link.description} maxLength={500} onChange={(event) => setLink({ ...link, description: event.target.value })} placeholder="Versión final para impresión"/></label><button type="button" className="button button-outline" onClick={addLink}><Link2 size={14}/> Agregar enlace</button></div><p>Pega el dominio o enlace tal como lo recibiste; se guardará como HTTPS.</p></div>
    {error && <p className="commercial-assets-error" role="alert">{error}</p>}
  </section>;
}
