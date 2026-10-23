import React, { useRef, useState } from 'react';
import { Check, File, FileImage, FileText, ImagePlus, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { uploadMedia } from '../../lib/siteRepository';

const formatBytes = (bytes) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function optimizeImage(file, quality = 0.82) {
  if (!file.type.startsWith('image/')) return { file, url: URL.createObjectURL(file), optimized: false };
  const bitmap = await createImageBitmap(file);
  const max = 2200; const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio); const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  const optimizedFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
  return { file: optimizedFile, url: URL.createObjectURL(blob), optimized: true, originalBytes: file.size, width: canvas.width, height: canvas.height };
}

function fileIcon(file) { return file.type.startsWith('image/') ? <FileImage size={18} /> : file.type.includes('pdf') ? <FileText size={18} /> : <File size={18} />; }

export function MediaUploader({ value = [], onChange, accept = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip', multiple = true, label = 'Medios y archivos', helper = 'Arrastra imágenes, documentos o archivos de marca', remoteFolder = '' }) {
  const inputRef = useRef(null); const [items, setItems] = useState(value); const [loading, setLoading] = useState(false); const [dragging, setDragging] = useState(false);
  const addFiles = async (fileList) => { const files = Array.from(fileList || []); if (!files.length) return; setLoading(true); const next = []; for (const file of files) { try { const prepared = await optimizeImage(file); if (remoteFolder) { try { const uploaded = await uploadMedia(prepared.file, remoteFolder); next.push({ ...prepared, ...uploaded, url: uploaded.publicUrl, uploaded: true }); } catch { next.push(prepared); } } else next.push(prepared); } catch { next.push({ file, url: URL.createObjectURL(file), optimized: false }); } } const merged = multiple ? [...items, ...next] : next.slice(0, 1); setItems(merged); onChange?.(merged); setLoading(false); };
  const remove = (index) => { const next = items.filter((_, itemIndex) => itemIndex !== index); setItems(next); onChange?.(next); };
  return <div className="studio-uploader"><div className="studio-picker-heading"><span>{label}</span><small>{items.length} archivo{items.length === 1 ? '' : 's'}</small></div><button type="button" className={`studio-dropzone ${dragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}><input ref={inputRef} hidden type="file" accept={accept} multiple={multiple} onChange={(event) => addFiles(event.target.files)} />{loading ? <LoaderCircle className="spin" size={25} /> : <UploadCloud size={25} />}<b>{loading ? remoteFolder ? 'Optimizando y subiendo…' : 'Optimizando medios…' : 'Sube o arrastra archivos aquí'}</b><small>{helper}</small><em>{remoteFolder ? 'Se optimiza y se guarda en Supabase Storage cuando tu sesión admin está activa.' : 'Las imágenes se convierten a WebP y se reducen sin salir del navegador.'}</em></button>{items.length > 0 && <div className="studio-media-list">{items.map((item, index) => <div className="studio-media-item" key={`${item.file.name}-${index}`}>{item.file.type.startsWith('image/') ? <img src={item.url} alt="" /> : <span className="studio-file-icon">{fileIcon(item.file)}</span>}<div><b>{item.file.name}</b><small>{formatBytes(item.file.size)} {item.optimized && <><Check size={11} /> WebP optimizado</>}{item.uploaded && <><Check size={11} /> Guardado en Storage</>}</small></div><button type="button" onClick={() => remove(index)} aria-label="Eliminar archivo"><X size={14} /></button></div>)}</div>}</div>;
}

export { optimizeImage };
