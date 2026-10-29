import React, { useEffect, useId, useRef, useState } from 'react';
import { FileImage, ImagePlus, LoaderCircle, Upload } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { formatMarketingFileSize, prepareMarketingImage } from './marketingImageUtils';
import './marketing-post-artwork.css';

const BUCKET = 'marketing-assets';
const BUCKET_PREFIX = `storage://${BUCKET}/`;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type MarketingArtworkPost = { id: string; source_id?: string; title: string; scheduled_date?: string };
export type MarketingArtworkAsset = {
  id: string;
  filename: string;
  rel_path: string;
  extension?: string;
  storage_status?: string;
  size_bytes?: number;
  width?: number | null;
  height?: number | null;
};

type Props = {
  organizationId: string;
  post: MarketingArtworkPost;
  asset?: MarketingArtworkAsset;
  canEdit: boolean;
  variant: 'overview' | 'week' | 'compact';
  onSaved: () => void;
};

function imagesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  const files = Array.from(clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
  if (files.length) return files;
  return Array.from(clipboardData.items || [])
    .filter((item) => item.type.startsWith('image/'))
    .map((item, index) => {
      const blob = item.getAsFile();
      if (!blob) return null;
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      return new File([blob], `portapapeles-${Date.now()}-${index + 1}.${extension}`, { type: blob.type, lastModified: Date.now() });
    })
    .filter((file): file is File => Boolean(file));
}

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
}

function imageFolder(date?: string) {
  const month = date?.slice(0, 7);
  return `Campanas_y_publicaciones/${month ? `${month.slice(0, 4)}/${month}` : 'Por_programar'}`;
}

export function MarketingPostArtwork({ organizationId, post, asset, canEdit, variant, onSaved }: Props) {
  const id = useId();
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canUpload = Boolean(supabase && canEdit && organizationId);
  const usableAsset = asset?.storage_status === 'supabase_storage' && asset.rel_path.startsWith(BUCKET_PREFIX);

  useEffect(() => {
    if (!supabase || !asset || !usableAsset) {
      setPreviewUrl('');
      setPreviewFailed(false);
      return undefined;
    }

    let active = true;
    let interval = 0;
    let observer: IntersectionObserver | undefined;
    const refreshUrl = async () => {
      const objectPath = asset.rel_path.slice(BUCKET_PREFIX.length);
      const { data, error: signedUrlError } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, 3600);
      if (!active) return;
      if (signedUrlError) {
        setPreviewFailed(true);
        return;
      }
      setPreviewUrl(data.signedUrl);
      setPreviewFailed(false);
    };
    const start = () => {
      void refreshUrl();
      interval = window.setInterval(() => void refreshUrl(), 50 * 60 * 1000);
    };

    if (typeof IntersectionObserver === 'undefined' || !zoneRef.current) start();
    else {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          start();
        }
      }, { rootMargin: '180px' });
      observer.observe(zoneRef.current);
    }

    return () => {
      active = false;
      observer?.disconnect();
      window.clearInterval(interval);
    };
  }, [asset?.id, asset?.rel_path, usableAsset]);

  const saveImage = async (source: File) => {
    if (!canUpload || !supabase || uploadLock.current) return;
    setError('');
    setMessage('');
    if (!source.type.startsWith('image/')) {
      setError('Este campo acepta imágenes. Para otros archivos usa la Biblioteca.');
      return;
    }
    if (source.size > MAX_FILE_BYTES) {
      setError('La imagen supera el límite de 50 MB antes de la optimización.');
      return;
    }

    uploadLock.current = true;
    setBusy(true);
    setMessage('Optimizando imagen…');
    try {
      const prepared = await prepareMarketingImage(source);
      const file = prepared.file;
      const extension = fileExtension(file.name);
      const objectName = `${organizationId}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
      const relPath = `storage://${BUCKET}/${objectName}`;
      const assetSourceId = `post-image-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const { data: indexedAsset, error: indexError } = await supabase.from('marketing_assets').insert({
        organization_id: organizationId,
        source_system: 'visualcorp-suite',
        source_id: assetSourceId,
        rel_path: relPath,
        filename: file.name,
        section: '06_Marketing_digital',
        folder: imageFolder(post.scheduled_date),
        extension,
        size_bytes: file.size,
        modified_ns: Math.round(file.lastModified * 1_000_000),
        width: prepared.width,
        height: prepared.height,
        preview_status: prepared.width && prepared.height ? 'ready' : 'pending',
        preview_error: '',
        is_available: false,
        scanned_at: now,
        updated_at: now,
        storage_status: 'uploading',
        retention_enabled: false,
        retention_months: null,
      }).select('id').single();
      if (indexError || !indexedAsset) throw new Error(indexError?.message || 'No se pudo crear la ficha de la imagen.');

      setMessage('Subiendo a la biblioteca privada…');
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (uploadError) {
        await supabase.from('marketing_assets').update({ storage_status: 'upload_failed', preview_error: uploadError.message, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', indexedAsset.id);
        throw new Error(`La imagen quedó indexada, pero la carga falló: ${uploadError.message}`);
      }

      const { error: statusError } = await supabase.from('marketing_assets').update({ storage_status: 'supabase_storage', is_available: true, preview_status: prepared.width ? 'ready' : 'pending', updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', indexedAsset.id);
      if (statusError) throw new Error(`La imagen se subió; no se pudo actualizar su ficha: ${statusError.message}`);

      const { error: linkError } = await supabase.from('marketing_post_assets').insert({
        organization_id: organizationId,
        source_system: 'visualcorp-suite',
        source_id: `post-image-link-${crypto.randomUUID()}`,
        source_post_id: post.source_id || post.id,
        source_asset_id: assetSourceId,
        post_id: post.id,
        asset_id: indexedAsset.id,
        role: 'Imagen de publicación',
      });
      if (linkError) throw new Error(`La imagen se guardó en la biblioteca, pero no pudo vincularse a la publicación: ${linkError.message}`);

      const ratio = source.size > file.size ? ` · ${formatMarketingFileSize(source.size)} → ${formatMarketingFileSize(file.size)} (${Math.round((1 - file.size / source.size) * 100)}% menos)` : ` · ${formatMarketingFileSize(file.size)}${prepared.optimized ? ' optimizada' : ' · formato original conservado'}`;
      setMessage(`Imagen guardada en esta publicación${ratio}.`);
      onSaved();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la imagen.');
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  };

  const handleFiles = (files: File[]) => {
    const image = files.find((file) => file.type.startsWith('image/'));
    if (!image) {
      setError('Suelta o pega una imagen para esta publicación.');
      return;
    }
    if (files.filter((file) => file.type.startsWith('image/')).length > 1) {
      setError('Esta tarjeta guarda una imagen por vez. Selecciona o arrastra solo una imagen.');
      return;
    }
    void saveImage(image);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = imagesFromClipboard(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    handleFiles(files);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    handleFiles(Array.from(event.dataTransfer.files));
  };

  const preview = previewUrl && !previewFailed;
  const compactLabel = asset?.filename ? `Cambiar o añadir imagen a ${post.title}` : `Añadir imagen a ${post.title}`;

  return <div
    ref={zoneRef}
    className={`vc-marketing-post-artwork is-${variant}${dragOver ? ' is-drag-over' : ''}${preview ? ' has-image' : ''}${!canUpload ? ' is-readonly' : ''}`}
    role="group"
    aria-label={`Imagen de ${post.title || 'la publicación'}`}
    tabIndex={canUpload ? 0 : -1}
    onPaste={handlePaste}
    onDragOver={(event) => { if (canUpload) { event.preventDefault(); setDragOver(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
    onDrop={handleDrop}
    title={canUpload ? 'Enfoca este espacio y pega con Ctrl+V, arrastra una imagen o selecciónala' : asset?.filename || 'Sin imagen asociada'}
  >
    <input ref={inputRef} id={id} type="file" accept="image/*" hidden disabled={!canUpload || busy} onChange={(event) => { if (event.target.files) handleFiles(Array.from(event.target.files)); event.target.value = ''; }}/>
    {preview ? <img src={previewUrl} alt={`Imagen asociada: ${asset?.filename || post.title}`} loading="lazy" decoding="async" onError={() => setPreviewFailed(true)}/> : <div className="vc-marketing-post-artwork-empty">
      {busy ? <LoaderCircle size={variant === 'compact' ? 13 : 22} className="vc-content-spin"/> : previewFailed ? <FileImage size={variant === 'compact' ? 13 : 22}/> : <ImagePlus size={variant === 'compact' ? 13 : 22}/>}
      {variant !== 'compact' && <><b>{busy ? 'Procesando y subiendo…' : previewFailed ? 'No se pudo abrir la imagen' : canUpload ? 'Añadir imagen de referencia' : 'Sin imagen asociada'}</b><span>{canUpload ? 'Pega con Ctrl+V o arrastra una imagen hasta aquí' : 'Las imágenes vinculadas aparecerán en esta tarjeta'}</span></>}
    </div>}
    {canUpload && <button type="button" className="vc-marketing-post-artwork-browse" aria-label={compactLabel} title={compactLabel} disabled={busy} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
      {busy ? <LoaderCircle size={14} className="vc-content-spin"/> : variant === 'compact' ? <ImagePlus size={14}/> : <><Upload size={14}/><span>Elegir imagen</span></>}
    </button>}
    {(message || error) && variant !== 'compact' && <small className={`vc-marketing-post-artwork-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</small>}
    {(message || error) && variant === 'compact' && <span className="vc-marketing-post-artwork-sr-only" role={error ? 'alert' : 'status'}>{error || message}</span>}
  </div>;
}
