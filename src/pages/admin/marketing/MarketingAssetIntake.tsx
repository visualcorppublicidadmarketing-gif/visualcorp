import React, { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, FileImage, FolderOpen, LoaderCircle, Plus, UploadCloud, X } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import './marketing-asset-intake.css';

const BUCKET = 'marketing-assets';
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type MarketingPost = { id: string; title: string; scheduled_date?: string; source_id?: string };
type Props = { organizationId: string; canEdit: boolean; posts: MarketingPost[]; onSaved: () => void };

function cleanRelativePath(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}

function getFileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
}

function filesFromClipboard(clipboardData: DataTransfer): File[] {
  const files = Array.from(clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
  if (files.length) return files;
  return Array.from(clipboardData.items || []).filter((item) => item.type.startsWith('image/')).map((item, index) => {
    const blob = item.getAsFile();
    if (!blob) return null;
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return new File([blob], `portapapeles-${Date.now()}-${index + 1}.${extension}`, { type: blob.type, lastModified: Date.now() });
  }).filter((file): file is File => Boolean(file));
}

function relativeVisualCorpPath(value: string) {
  let path = value.trim();
  if (/^file:\/\//i.test(path)) {
    try { path = decodeURIComponent(new URL(path).pathname).replace(/^\/[a-z]:\//i, (drive) => drive.slice(1)); } catch { return null; }
  }
  path = path.replace(/\\/g, '/');
  const root = 'E:/VISUAL CORP/';
  if (path.slice(0, root.length).toLocaleLowerCase('en') === root.toLocaleLowerCase('en')) return cleanRelativePath(path.slice(root.length));
  if (/^[a-z]:\//i.test(path)) return null;
  return null;
}

export function MarketingAssetIntake({ organizationId, canEdit, posts, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'upload' | 'reference'>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [section, setSection] = useState('06_Marketing_digital');
  const [folder, setFolder] = useState('');
  const [postId, setPostId] = useState('');
  const [retentionEnabled, setRetentionEnabled] = useState(true);
  const [retentionPreset, setRetentionPreset] = useState<'1' | '2' | 'custom'>('2');
  const [customRetentionMonths, setCustomRetentionMonths] = useState(3);
  const [relativePath, setRelativePath] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const retentionMonths = retentionPreset === 'custom' ? customRetentionMonths : Number(retentionPreset);

  const addFiles = (incoming: File[]) => {
    setError(''); setNotice('');
    const valid = incoming.filter((file) => {
      if (file.size > MAX_FILE_BYTES) { setError(`${file.name}: supera el máximo de 50 MB.`); return false; }
      return true;
    });
    if (valid.length) setFiles((current) => [...current, ...valid]);
  };

  useEffect(() => {
    if (!canEdit || mode !== 'upload') return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const pasted = event.clipboardData ? filesFromClipboard(event.clipboardData) : [];
      if (pasted.length) {
        event.preventDefault();
        addFiles(pasted);
        setNotice(`${pasted.length} imagen${pasted.length === 1 ? '' : 'es'} lista${pasted.length === 1 ? '' : 's'} desde el portapapeles.`);
        return;
      }
      const pastedText = event.clipboardData?.getData('text/plain') || '';
      if (!/^(?:file:\/\/\/|[a-z]:[\\/])/i.test(pastedText.trim())) return;
      event.preventDefault();
      const path = relativeVisualCorpPath(pastedText);
      if (!path) { setError('La ruta pegada no pertenece a E:\\VISUAL CORP. Usa la carpeta del proyecto para mantener el índice ordenado.'); return; }
      setMode('reference'); setRelativePath(path); setNotice('Ruta detectada desde el portapapeles. Revísala y pulsa “Indexar ruta”.');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canEdit, mode]);

  const saveUploads = async () => {
    if (!supabase || !canEdit || !organizationId || !files.length) return;
    setSaving(true); setError(''); setNotice('');
    const failures: string[] = [];
    try {
      const { error: storageReadyError } = await supabase.storage.from(BUCKET).list(organizationId, { limit: 1 });
      if (storageReadyError) throw new Error(`El almacenamiento de Marketing no está listo. Aplica la migración de recursos privados antes de cargar archivos. (${storageReadyError.message})`);
      for (const file of files) {
        const extension = getFileExtension(file.name);
        const objectName = `${organizationId}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
        const storagePath = `storage://${BUCKET}/${objectName}`;
        let width: number | null = null; let height: number | null = null;
        if (file.type.startsWith('image/')) {
          try { const bitmap = await createImageBitmap(file); width = bitmap.width; height = bitmap.height; bitmap.close(); } catch { /* Some supported image formats do not expose dimensions in every browser. */ }
        }
        const sourceId = `upload-${crypto.randomUUID()}`;
        const { data: indexedAsset, error: indexError } = await supabase.from('marketing_assets').insert({
          organization_id: organizationId, source_system: 'visualcorp-suite', source_id: sourceId,
          rel_path: storagePath, filename: file.name, section: section.trim(), folder: cleanRelativePath(folder),
          extension, size_bytes: file.size, modified_ns: Math.round(file.lastModified * 1_000_000), width, height,
          preview_status: 'pending', preview_error: '', is_available: false,
          scanned_at: new Date().toISOString(), updated_at: new Date().toISOString(), storage_status: 'uploading',
          retention_enabled: retentionEnabled && Boolean(postId) && file.type.startsWith('image/'),
          retention_months: retentionMonths,
        }).select('id').single();
        if (indexError || !indexedAsset) { failures.push(`${file.name}: no se pudo crear su ficha de índice: ${indexError?.message || 'sin identificador devuelto'}`); continue; }

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, file, {
          cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream',
        });
        if (uploadError) {
          await supabase.from('marketing_assets').update({ storage_status: 'upload_failed', preview_error: uploadError.message, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', indexedAsset.id);
          failures.push(`${file.name}: quedó indexado, pero la carga falló: ${uploadError.message}`);
          continue;
        }
        const { error: statusError } = await supabase.from('marketing_assets').update({ storage_status: 'supabase_storage', is_available: true, preview_status: width ? 'ready' : 'pending', updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', indexedAsset.id);
        if (statusError) { failures.push(`${file.name}: el archivo se subió y quedó indexado; no se pudo actualizar su estado: ${statusError.message}`); continue; }
        if (postId) {
          const linkedPost = posts.find((post) => post.id === postId);
          const { error: linkError } = await supabase.from('marketing_post_assets').insert({
            organization_id: organizationId, source_system: 'visualcorp-suite',
            source_id: `upload-link-${crypto.randomUUID()}`, source_post_id: linkedPost?.source_id || postId,
            source_asset_id: sourceId, post_id: postId, asset_id: indexedAsset.id, role: 'Arte final',
          });
          if (linkError) { failures.push(`${file.name}: se subió, pero no se pudo asociar a la publicación: ${linkError.message}`); continue; }
        }
      }
      const successful = files.length - failures.length;
      if (successful) { setNotice(`${successful} archivo${successful === 1 ? '' : 's'} guardado${successful === 1 ? '' : 's'} e indexado${successful === 1 ? '' : 's'} en la biblioteca.`); setFiles([]); onSaved(); }
      if (failures.length) setError(failures.join(' · '));
    } catch (cause: any) {
      setError(cause?.message || 'No se pudo completar la carga.');
    } finally { setSaving(false); }
  };

  const saveReference = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !canEdit || !organizationId) return;
    const rawPath = relativePath.trim();
    const isAbsolutePath = /^(?:file:\/\/\/|[a-z]:[\\/])/i.test(rawPath);
    const path = isAbsolutePath ? relativeVisualCorpPath(rawPath) || '' : cleanRelativePath(rawPath);
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2 || parts.some((part) => part === '.' || part === '..') || /^[a-z]:/i.test(path)) {
      setError('Usa una ruta relativa dentro de E:\\VISUAL CORP, por ejemplo 06_Marketing_digital/Campanas_y_publicaciones/2026/, o pega la ruta completa del proyecto.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const { data: existing, error: lookupError } = await supabase.from('marketing_assets').select('id').eq('organization_id', organizationId).eq('rel_path', path).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) { setNotice('Esta ruta ya está indexada en la biblioteca.'); return; }
      const filename = parts.at(-1) || path;
      const now = new Date().toISOString();
      const { error: insertError } = await supabase.from('marketing_assets').insert({
        organization_id: organizationId, source_system: 'visualcorp-suite', source_id: `local-${crypto.randomUUID()}`,
        rel_path: path, filename, section: parts[0], folder: parts.slice(0, -1).join(' / '),
        extension: getFileExtension(filename), size_bytes: 0, modified_ns: 0,
        preview_status: 'reference', preview_error: '', is_available: false, scanned_at: now,
        updated_at: now, storage_status: 'local_reference',
      });
      if (insertError) throw insertError;
      setNotice('Ruta guardada e indexada; el archivo original permanece en su carpeta.');
      setRelativePath(''); onSaved();
    } catch (cause: any) {
      setError(cause?.message || 'No se pudo guardar la ruta.');
    } finally { setSaving(false); }
  };

  return <section className="vc-marketing-intake" aria-label="Añadir recursos a la biblioteca">
    <header className="vc-marketing-intake-heading"><div><span className="eyebrow">BIBLIOTECA DE RECURSOS</span><h2>Añade archivos o indexa su ubicación</h2><p>Pega una imagen con Ctrl+V, selecciónala desde tu equipo o registra la ruta de un original ya guardado.</p></div><span className="vc-marketing-intake-badge"><FileImage size={16}/> Indexado al guardar</span></header>
    <div className="vc-marketing-intake-tabs" role="tablist" aria-label="Método para añadir un recurso">
      <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'is-active' : ''} onClick={() => { setMode('upload'); setError(''); }}><ClipboardPaste size={15}/>Pegar o subir archivos</button>
      <button type="button" role="tab" aria-selected={mode === 'reference'} className={mode === 'reference' ? 'is-active' : ''} onClick={() => { setMode('reference'); setError(''); }}><FolderOpen size={15}/>Ruta en Visual Corp</button>
    </div>
    {mode === 'upload' ? <div className="vc-marketing-intake-panel">
      <div className={`vc-marketing-paste-zone${dragOver ? ' is-drag-over' : ''}${!canEdit ? ' is-readonly' : ''}`} tabIndex={canEdit ? 0 : -1} role="button" aria-label="Pegar imagen con Ctrl más V o soltar un archivo"
        onClick={() => canEdit && inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); addFiles(Array.from(event.dataTransfer.files)); }}>
        <input ref={inputRef} type="file" multiple disabled={!canEdit} onClick={(event) => event.stopPropagation()} onChange={(event) => { if (event.target.files) addFiles(Array.from(event.target.files)); event.target.value = ''; }} hidden/>
        <span className="vc-marketing-paste-icon"><ClipboardPaste size={21}/></span><strong>Pega aquí con Ctrl+V</strong><span>También puedes arrastrar archivos o hacer clic para seleccionarlos · Máximo 50 MB por archivo</span>
      </div>
      <div className="vc-marketing-intake-meta"><label>Sección<input value={section} onChange={(event) => setSection(event.target.value)} placeholder="06_Marketing_digital" disabled={!canEdit}/></label><label>Carpeta o campaña<input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Campanas_y_publicaciones/2026/..." disabled={!canEdit}/></label></div>
      <div className="vc-marketing-retention"><label>Publicación asociada<select value={postId} onChange={(event) => setPostId(event.target.value)} disabled={!canEdit}><option value="">Sin asociar</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.scheduled_date ? `${post.scheduled_date.slice(0, 10)} · ` : ''}{post.title || 'Publicación sin título'}</option>)}</select></label><div className="vc-marketing-retention-policy"><label className="vc-marketing-retention-toggle"><input type="checkbox" checked={retentionEnabled} onChange={(event) => setRetentionEnabled(event.target.checked)} disabled={!canEdit || !postId}/><span>Eliminar imagen automáticamente</span></label><label className="vc-marketing-retention-duration"><span>Después de</span><select value={retentionPreset} onChange={(event) => setRetentionPreset(event.target.value as '1' | '2' | 'custom')} disabled={!canEdit || !postId || !retentionEnabled}><option value="1">1 mes</option><option value="2">2 meses</option><option value="custom">Personalizado</option></select>{retentionPreset === 'custom' && <><input aria-label="Meses de conservación" type="number" min="1" max="120" value={customRetentionMonths} onChange={(event) => setCustomRetentionMonths(Math.min(120, Math.max(1, Number(event.target.value) || 1)))} disabled={!canEdit || !postId || !retentionEnabled}/><span>meses</span></>}</label></div><small>Solo imágenes subidas y asociadas a una publicación. El plazo cuenta desde su fecha; el índice se conserva y los originales locales no se borran.</small></div>
      {files.length > 0 && <div className="vc-marketing-file-queue"><div><b>{files.length} archivo{files.length === 1 ? '' : 's'} listo{files.length === 1 ? '' : 's'} para subir</b><span>Se guardarán en almacenamiento privado y se añadirán al índice.{retentionEnabled && postId ? ` Se eliminarán ${retentionMonths} ${retentionMonths === 1 ? 'mes' : 'meses'} después de la fecha de publicación.` : ' Sin asociación, se conservarán hasta que se eliminen manualmente.'}</span></div><ul>{files.map((file, index) => <li key={`${file.name}-${index}`}><FileImage size={14}/><span>{file.name}</span><small>{Math.max(1, Math.ceil(file.size / 1024))} KB</small><button type="button" aria-label={`Quitar ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14}/></button></li>)}</ul><button className="button button-dark" type="button" onClick={() => void saveUploads()} disabled={!canEdit || saving || !section.trim() || (retentionPreset === 'custom' && (customRetentionMonths < 1 || customRetentionMonths > 120))}>{saving ? <LoaderCircle size={15} className="vc-content-spin"/> : <UploadCloud size={15}/>} {saving ? 'Subiendo e indexando…' : 'Guardar en biblioteca'}</button></div>}
      {files.length === 0 && <div className="vc-marketing-intake-footer"><span>La carga guarda una copia central; agrega sección y carpeta para encontrarla luego.</span>{canEdit && <button type="button" className="vc-content-text-link" onClick={() => inputRef.current?.click()}><Plus size={14}/> Elegir archivo</button>}</div>}
    </div> : <form className="vc-marketing-reference-panel" onSubmit={saveReference}>
      <label>Ruta relativa dentro de E:\\VISUAL CORP<input autoComplete="off" value={relativePath} onChange={(event) => setRelativePath(event.target.value)} placeholder="06_Marketing_digital/Campanas_y_publicaciones/2026/2026-10/archivo.png" disabled={!canEdit}/></label>
      <div><span>Se guardará como referencia local. No copia, mueve ni modifica el original; la suite no verifica que la ruta exista en este equipo.</span><button className="button button-dark" type="submit" disabled={!canEdit || saving || !relativePath.trim()}>{saving ? <LoaderCircle size={15} className="vc-content-spin"/> : <Plus size={15}/>} Indexar ruta</button></div>
    </form>}
    {error && <p className="vc-marketing-intake-message is-error" role="alert">{error}</p>}{notice && <p className="vc-marketing-intake-message" role="status">{notice}</p>}
  </section>;
}
