import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, ImagePlus, Star, Trash2, Upload, X } from 'lucide-react';
import type { InventoryGalleryImage } from './inventoryImageUtils';
import './inventory-product-image-gallery.css';

type Props = {
  images: InventoryGalleryImage[];
  onChange: (images: InventoryGalleryImage[]) => void;
  disabled?: boolean;
  title?: string;
};

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const makeKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function clipboardFiles(data: DataTransfer): File[] {
  const files = Array.from(data.files || []).filter((file) => acceptedTypes.has(file.type));
  if (files.length) return files;
  return Array.from(data.items || []).filter((item) => acceptedTypes.has(item.type)).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
}

export function InventoryProductImageGallery({ images, onChange, disabled = false, title = 'Imágenes del producto' }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState('');
  const activeImage = images[active];

  const addFiles = (files: File[]) => {
    const accepted = files.filter((file) => acceptedTypes.has(file.type) && file.size <= 80 * 1024 * 1024);
    if (!accepted.length) { setFeedback('Usa imágenes PNG, JPG o WebP de hasta 80 MB cada una.'); return; }
    const available = Math.max(0, 12 - images.length);
    const additions = accepted.slice(0, available).map((file) => { const src=URL.createObjectURL(file);previewUrls.current.add(src);return { key: makeKey(), src, file, label: file.name }; });
    onChange([...images, ...additions]);
    setActive(images.length);
    setFeedback(`${additions.length} imagen${additions.length === 1 ? '' : 'es'} lista${additions.length === 1 ? '' : 's'}; se optimizará${additions.length === 1 ? '' : 'n'} al guardar.${accepted.length > available ? ' El producto admite hasta 12 imágenes.' : ''}`);
  };

  const paste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const files = clipboardFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation(); addFiles(files);
  };

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (disabled || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const files = event.clipboardData ? clipboardFiles(event.clipboardData) : [];
      if (!files.length) return;
      event.preventDefault(); addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  useEffect(() => () => { for(const url of previewUrls.current) URL.revokeObjectURL(url); }, []);

  const removeActive = () => {
    if (!activeImage) return;
    if (activeImage.file) { URL.revokeObjectURL(activeImage.src);previewUrls.current.delete(activeImage.src); }
    const next = images.filter((_, index) => index !== active);
    onChange(next); setActive(Math.max(0, Math.min(active, next.length - 1))); setFeedback('Imagen quitada de la galería. Guarda el producto para aplicar el cambio.');
  };

  const move = (direction: -1 | 1) => {
    const nextIndex = active + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const next = [...images]; [next[active], next[nextIndex]] = [next[nextIndex], next[active]];
    onChange(next); setActive(nextIndex);
  };

  return <section className="inventory-product-gallery" aria-label={title}>
    <header><div><b>{title}</b><small>{images.length} de 12 · la primera es la portada</small></div><span>Opcional</span></header>
    <div className={`inventory-product-gallery-stage${dragging ? ' is-dragging' : ''}`} tabIndex={0} role="group" aria-label="Galería de imágenes del producto. Puedes pegar con Ctrl y V." onPaste={paste} onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled) addFiles(Array.from(event.dataTransfer.files)); }}>
      {activeImage ? <>
        <img className="inventory-product-gallery-main" src={activeImage.src} alt={activeImage.label || `Imagen ${active + 1} del producto`} />
        <div className="inventory-product-gallery-controls"><button type="button" aria-label="Imagen anterior" disabled={disabled || active === 0} onClick={() => move(-1)}><ArrowLeft size={16}/></button><span>{active + 1} / {images.length}</span><button type="button" aria-label="Imagen siguiente" disabled={disabled || active === images.length - 1} onClick={() => move(1)}><ArrowRight size={16}/></button></div>
        <div className="inventory-product-gallery-image-actions"><button type="button" disabled={disabled} onClick={() => replaceInput.current?.click()} title="Reemplazar esta imagen"><Upload size={13}/> Reemplazar</button><button type="button" disabled={disabled || active === 0} onClick={() => move(-1)} title="Mover antes"><ArrowLeft size={13}/> Subir</button><button type="button" disabled={disabled || active >= images.length - 1} onClick={() => move(1)} title="Mover después"><ArrowRight size={13}/> Bajar</button><button type="button" disabled={disabled || active === 0} onClick={() => { const next = [...images]; const [cover] = next.splice(active, 1); next.unshift(cover); onChange(next); setActive(0); }} title="Usar como portada"><Star size={13}/> Hacer portada</button><button type="button" disabled={disabled} onClick={removeActive} title="Quitar imagen"><Trash2 size={13}/> Eliminar</button></div>
      </> : <div className="inventory-product-gallery-empty"><ImagePlus size={25}/><b>Añade fotos para mostrar el producto</b><span>Sube desde el dispositivo o copia y pega con Ctrl + V.</span></div>}
    </div>
    <div className="inventory-product-gallery-toolbar"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={disabled || images.length >= 12} onChange={(event) => { if (event.currentTarget.files) addFiles(Array.from(event.currentTarget.files)); event.currentTarget.value = ''; }}/><input ref={replaceInput} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled || !activeImage} onChange={(event) => { const file=event.currentTarget.files?.[0];if(file&&activeImage){const src=URL.createObjectURL(file);previewUrls.current.add(src);if(activeImage.file){URL.revokeObjectURL(activeImage.src);previewUrls.current.delete(activeImage.src);}const next=[...images];next[active]={key:makeKey(),src,file,label:file.name};onChange(next);setFeedback('Imagen lista para reemplazar; guarda el producto para aplicar el cambio.');}event.currentTarget.value='';}}/><button type="button" className="button button-outline" disabled={disabled || images.length >= 12} onClick={() => input.current?.click()}><Upload size={14}/> Subir imágenes</button><button type="button" className="button button-outline" disabled={disabled || images.length >= 12} onClick={() => { const zone = input.current?.closest('.inventory-product-gallery')?.querySelector('.inventory-product-gallery-stage') as HTMLElement | null; zone?.focus(); setFeedback('Haz clic dentro de la galería y pega con Ctrl + V.'); }}><ClipboardPaste size={14}/> Pegar imagen</button><small>PNG, JPG o WebP · optimización WebP al guardar · máx. 5 MB por imagen optimizada</small></div>
    {images.length > 1 && <div className="inventory-product-gallery-thumbnails" role="list" aria-label="Seleccionar imagen de la galería">{images.map((image, index) => <button type="button" role="listitem" key={image.key} className={index === active ? 'is-active' : ''} aria-label={`${index === 0 ? 'Portada, ' : ''}imagen ${index + 1}: ${image.label || 'sin nombre'}`} aria-pressed={index === active} onClick={() => setActive(index)}><img src={image.src} alt=""/>{index === 0 && <i><Check size={10}/></i>}</button>)}</div>}
    {feedback && <div className="inventory-product-gallery-feedback" role="status">{feedback}<button type="button" aria-label="Cerrar aviso" onClick={() => setFeedback('')}><X size={12}/></button></div>}
  </section>;
}
