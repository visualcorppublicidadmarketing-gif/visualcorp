import React, { useEffect, useId, useRef, useState } from 'react';
import { ClipboardPaste, FileImage, ImagePlus, LoaderCircle, Upload } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { formatMarketingFileSize, prepareMarketingImage } from './marketingImageUtils';
import './marketing-post-artwork.css';
import './marketing-post-artwork-paste.css';

const BUCKET = 'marketing-assets';
const BUCKET_PREFIX = `storage://${BUCKET}/`;
const MAX_STORAGE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 80 * 1024 * 1024;

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
    if (source.size > MAX_SOURCE_FILE_BYTES) {
      setError('El archivo supera el máximo de 80 MB que podemos procesar con seguridad en el navegador. Redúcelo antes de subirlo.');
      return;
    }

    uploadLock.current = true;
    setBusy(true);
    setMessage('Optimizando imagen…');
    let indexedAssetId: string | null = null;
    let pendingObjectPath: string | null = null;
    try {
      const prepared = await prepareMarketingImage(source);
      const file = prepared.file;
      if (file.size > MAX_STORAGE_FILE_BYTES) {
        throw new Error(`Después de optimizar, la imagen todavía pesa ${formatMarketingFileSize(file.size)} y supera el límite de 50 MB. Reduce su tamaño o resolución y vuelve a intentarlo.`);
      }
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
      }).select('id').single();
      if (indexError || !indexedAsset) {
        const message = /retention_months/i.test(indexError?.message || '')
          ? 'No se pudo preparar el guardado de la imagen. Actualiza la página e inténtalo de nuevo; el archivo todavía no se ha subido.'
          : indexError?.message || 'No se pudo crear la ficha de la imagen.';
        throw new Error(message);
      }
      indexedAssetId = indexedAsset.id;

      setMessage('Subiendo a la biblioteca privada…');
      pendingObjectPath = objectName;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (uploadError) {
        throw new Error(`No se pudo subir la imagen: ${uploadError.message}`);
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
      let cleanupNote = '';
      if (indexedAssetId) {
        try {
          const { data: existingLink, error: linkCheckError } = await supabase.from('marketing_post_assets')
            .select('id').eq('organization_id', organizationId).eq('asset_id', indexedAssetId).limit(1).maybeSingle();
          if (linkCheckError) {
            cleanupNote = ' No pudimos confirmar si quedó vinculada; conserva su registro para evitar borrar una imagen que sí se haya guardado.';
          } else if (existingLink) {
            cleanupNote = ' La imagen quedó vinculada. Actualiza la vista para confirmar su estado.';
          } else {
            let storageClean = true;
            if (pendingObjectPath) {
              const { error: removeError } = await supabase.storage.from(BUCKET).remove([pendingObjectPath]);
              storageClean = !removeError;
              if (removeError) cleanupNote = ' No se pudo retirar el archivo incompleto de Storage.';
            }
            if (storageClean) {
              const { error: removeIndexError } = await supabase.from('marketing_assets').delete()
                .eq('organization_id', organizationId).eq('id', indexedAssetId);
              if (removeIndexError) cleanupNote = ' No se pudo retirar la ficha incompleta de la biblioteca.';
            }
          }
        } catch {
          cleanupNote = ' No se pudo verificar ni retirar el recurso temporal incompleto; revisa la biblioteca antes de volver a intentarlo.';
        }
      }
      setError(`${cause instanceof Error ? cause.message : 'No se pudo guardar la imagen.'}${cleanupNote}`);
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
    if (!canUpload || busy) return;
    const files = imagesFromClipboard(event.clipboardData);
    event.preventDefault();
    event.stopPropagation();
    if (!files.length) {
      setMessage('');
      setError('No se encontró una imagen en el portapapeles. Copia una imagen o captura y vuelve a pegarla aquí.');
      return;
    }
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
    aria-keyshortcuts="Control+V"
    tabIndex={canUpload ? 0 : -1}
    onPaste={handlePaste}
    onClick={(event) => {
      if (!canUpload || busy || (event.target as HTMLElement).closest('button')) return;
      zoneRef.current?.focus();
      setError('');
      setMessage('Listo para pegar. Presiona Ctrl+V.');
    }}
    onDragOver={(event) => { if (canUpload) { event.preventDefault(); setDragOver(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
    onDrop={handleDrop}
    title={canUpload ? 'Enfoca este espacio y pega con Ctrl+V, arrastra una imagen o selecciónala' : asset?.filename || 'Sin imagen asociada'}
  >
    <input ref={inputRef} id={id} type="file" accept="image/*" hidden disabled={!canUpload || busy} onChange={(event) => { if (event.target.files) handleFiles(Array.from(event.target.files)); event.target.value = ''; }}/>
    {preview ? <img src={previewUrl} alt={`Imagen asociada: ${asset?.filename || post.title}`} loading="lazy" decoding="async" onError={() => setPreviewFailed(true)}/> : <div className="vc-marketing-post-artwork-empty">
      {busy ? <LoaderCircle size={variant === 'compact' ? 13 : 22} className="vc-content-spin"/> : previewFailed ? <FileImage size={variant === 'compact' ? 13 : 22}/> : <ImagePlus size={variant === 'compact' ? 13 : 22}/>}
      {variant !== 'compact' && <><b>{busy ? 'Procesando y subiendo…' : previewFailed ? 'No se pudo abrir la imagen' : canUpload ? 'Añade una imagen a esta publicación' : 'Sin imagen asociada'}</b><span>{canUpload ? 'Haz clic aquí y luego presiona Ctrl+V, o arrastra una imagen.' : 'Las imágenes vinculadas aparecerán en esta tarjeta'}</span></>}
    </div>}
    {canUpload && !preview && variant !== 'compact' && <button
      type="button"
      className="vc-marketing-post-artwork-paste"
      aria-label={`Preparar ${post.title} para pegar una imagen con Ctrl+V`}
      title="Haz clic aquí y después presiona Ctrl+V"
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        zoneRef.current?.focus();
        setError('');
        setMessage('Listo para pegar. Presiona Ctrl+V.');
      }}
    >
      <ClipboardPaste size={variant === 'overview' ? 17 : 15}/>
      <span>Pegar imagen</span>
      <kbd>Ctrl + V</kbd>
    </button>}
    {canUpload && <button type="button" className="vc-marketing-post-artwork-browse" aria-label={compactLabel} title={compactLabel} disabled={busy} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
      {busy ? <LoaderCircle size={14} className="vc-content-spin"/> : variant === 'compact' ? <ImagePlus size={14}/> : <><Upload size={14}/><span>Elegir imagen</span></>}
    </button>}
    {(message || error) && variant !== 'compact' && <small className={`vc-marketing-post-artwork-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</small>}
    {(message || error) && variant === 'compact' && <span className="vc-marketing-post-artwork-sr-only" role={error ? 'alert' : 'status'}>{error || message}</span>}
  </div>;
}
