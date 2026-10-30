import React, { useEffect, useId, useRef, useState } from 'react';
import { ClipboardPaste, FileImage, ImagePlus, LoaderCircle, Trash2, Upload } from 'lucide-react';
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
  canDelete?: boolean;
  variant: 'overview' | 'week' | 'compact' | 'detail' | 'editor';
  draftFile?: File | null;
  isDraft?: boolean;
  onDraftFileChange?: (file: File | null) => void;
  onSaved: () => void | Promise<void>;
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

async function readClipboardImages(): Promise<File[] | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const [index, item] of items.entries()) {
      const type = item.types.find((candidate) => candidate.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      const extension = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      files.push(new File([blob], `portapapeles-${Date.now()}-${index + 1}.${extension}`, { type, lastModified: Date.now() }));
    }
    return files;
  } catch {
    return null;
  }
}

function fileExtension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
}

function imageFolder(date?: string) {
  const month = date?.slice(0, 7);
  return `Campanas_y_publicaciones/${month ? `${month.slice(0, 4)}/${month}` : 'Por_programar'}`;
}

export function MarketingPostArtwork({ organizationId, post, asset, canEdit, canDelete, variant, draftFile = null, isDraft = false, onDraftFileChange, onSaved }: Props) {
  const id = useId();
  const zoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [draftPreviewUrl, setDraftPreviewUrl] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canUpload = Boolean(supabase && canEdit && organizationId);
  const usableAsset = asset?.storage_status === 'supabase_storage' && asset.rel_path.startsWith(BUCKET_PREFIX);
  const canRemoveAsset = Boolean(supabase && canDelete && usableAsset && asset);
  const canRemoveImage = canRemoveAsset || Boolean(draftFile && onDraftFileChange);

  useEffect(() => {
    if (!draftFile) {
      setDraftPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(draftFile);
    setDraftPreviewUrl(url);
    setPreviewFailed(false);
    return () => URL.revokeObjectURL(url);
  }, [draftFile]);

  useEffect(() => {
    if (!supabase || !asset || !usableAsset) {
      setPreviewUrl('');
      setPreviewFailed(false);
      setPreviewLoading(false);
      return undefined;
    }

    let active = true;
    let interval = 0;
    let observer: IntersectionObserver | undefined;
    setPreviewUrl('');
    setPreviewFailed(false);
    const refreshUrl = async () => {
      setPreviewLoading(true);
      try {
        const objectPath = asset.rel_path.slice(BUCKET_PREFIX.length);
        const { data, error: signedUrlError } = await supabase.storage.from(BUCKET).createSignedUrl(objectPath, 3600);
        if (!active) return;
        if (signedUrlError) {
          setPreviewFailed(true);
          setPreviewLoading(false);
          return;
        }
        setPreviewUrl(data.signedUrl);
        setPreviewFailed(false);
      } catch {
        if (!active) return;
        setPreviewFailed(true);
      } finally {
        if (active) setPreviewLoading(false);
      }
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
      await onSaved();
      if (draftFile && onDraftFileChange) onDraftFileChange(null);
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

  const removeImage = async () => {
    if (draftFile && onDraftFileChange) {
      onDraftFileChange(null);
      setError('');
      setMessage('Vista previa retirada. La imagen guardada, si existía, se conserva.');
      return;
    }
    if (!canRemoveAsset || !supabase || !asset || !usableAsset || busy || uploadLock.current) return;
    const accepted = window.confirm(
      `¿Quitar la imagen de “${post.title || 'esta publicación'}”? Si no está vinculada a otras publicaciones, también se eliminará de la biblioteca privada. Esta acción no se puede deshacer.`,
    );
    if (!accepted) return;

    uploadLock.current = true;
    setBusy(true);
    setError('');
    setMessage('Quitando imagen…');
    try {
      const { data: linkedPosts, error: linksError } = await supabase
        .from('marketing_post_assets')
        .select('post_id')
        .eq('organization_id', organizationId)
        .eq('asset_id', asset.id);
      if (linksError) throw new Error(`No se pudo comprobar dónde se usa la imagen: ${linksError.message}`);

      const usedByOtherPosts = (linkedPosts || []).some((link) => link.post_id !== post.id);
      if (!usedByOtherPosts) {
        const objectPath = asset.rel_path.slice(BUCKET_PREFIX.length);
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([objectPath]);
        if (storageError) throw new Error(`No se pudo eliminar la imagen del almacenamiento privado: ${storageError.message}`);
      }

      const { error: unlinkError } = await supabase.from('marketing_post_assets').delete()
        .eq('organization_id', organizationId)
        .eq('post_id', post.id)
        .eq('asset_id', asset.id);
      if (unlinkError) throw new Error(`No se pudo quitar la imagen de la publicación: ${unlinkError.message}`);

      if (!usedByOtherPosts) {
        const { error: indexError } = await supabase.from('marketing_assets').delete()
          .eq('organization_id', organizationId)
          .eq('id', asset.id)
          .eq('storage_status', 'supabase_storage');
        if (indexError) throw new Error(`La imagen salió del almacenamiento, pero no se pudo limpiar su ficha: ${indexError.message}`);
      }

      setMessage(usedByOtherPosts
        ? 'Imagen quitada de esta publicación; se conserva porque está vinculada a otras.'
        : 'Imagen eliminada de esta publicación y de la biblioteca.');
      onSaved();
    } catch (cause: unknown) {
      setMessage('');
      setError(cause instanceof Error ? cause.message : 'No se pudo quitar la imagen.');
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  };

  const handleFiles = (files: File[]) => {
    if (!canUpload || busy) return;
    const image = files.find((file) => file.type.startsWith('image/'));
    if (!image) {
      setError('Suelta o pega una imagen para esta publicación.');
      return;
    }
    if (files.filter((file) => file.type.startsWith('image/')).length > 1) {
      setError('Esta tarjeta guarda una imagen por vez. Selecciona o arrastra solo una imagen.');
      return;
    }
    if (image.size > MAX_SOURCE_FILE_BYTES) {
      setError('El archivo supera el máximo de 80 MB. Reduce su tamaño o resolución antes de continuar.');
      return;
    }
    if (onDraftFileChange) {
      onDraftFileChange(image);
      setError('');
      setMessage(isDraft ? 'Vista previa lista. Guarda la ficha y luego sube la imagen.' : 'Vista previa lista. Pulsa «Subir imagen» para vincularla.');
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

  const pasteFromSystemClipboard = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canUpload || busy) return;
    zoneRef.current?.focus();
    setError('');
    const files = await readClipboardImages();
    if (files === null) {
      setMessage('Listo para pegar. Presiona Ctrl+V aquí si el navegador no permite leer el portapapeles.');
      return;
    }
    if (!files.length) {
      setMessage('No hay una imagen en el portapapeles. También puedes copiarla y presionar Ctrl+V aquí.');
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

  const preview = Boolean(draftPreviewUrl || (previewUrl && !previewFailed));
  const imageUrl = draftPreviewUrl || previewUrl;
  const pendingDraft = Boolean(draftFile && onDraftFileChange && !isDraft);
  const compactLabel = pendingDraft ? `Subir imagen de ${post.title}` : preview ? `Cambiar imagen de ${post.title}` : `Añadir imagen a ${post.title}`;
  const removeLabel = draftFile ? 'Descartar imagen pendiente' : `Quitar imagen de ${post.title || 'la publicación'}`;

  return <div
    ref={zoneRef}
    className={`vc-marketing-post-artwork is-${variant}${dragOver ? ' is-drag-over' : ''}${preview ? ' has-image' : ''}${pendingDraft ? ' has-pending-upload' : ''}${canRemoveImage ? ' has-remove-control' : ''}${!canUpload ? ' is-readonly' : ''}`}
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
    {preview ? <img src={imageUrl} alt={draftFile ? `Vista previa pendiente: ${draftFile.name}` : `Imagen asociada: ${asset?.filename || post.title}`} loading="lazy" decoding="async" onError={() => { if (!draftPreviewUrl) setPreviewFailed(true); }}/> : <div className="vc-marketing-post-artwork-empty">
      {busy || previewLoading ? <LoaderCircle size={variant === 'compact' ? 13 : 22} className="vc-content-spin"/> : previewFailed ? <FileImage size={variant === 'compact' ? 13 : 22}/> : <ImagePlus size={variant === 'compact' ? 13 : 22}/>}
      {variant !== 'compact' && <><b>{busy ? 'Procesando y subiendo…' : previewLoading ? 'Cargando imagen…' : previewFailed ? 'No se pudo abrir la imagen' : canUpload ? 'Añade una imagen a esta publicación' : 'Sin imagen asociada'}</b><span>{previewLoading ? 'Preparando la vista previa de la biblioteca privada.' : canUpload ? 'Elige una imagen, arrástrala o pégala con Ctrl+V.' : 'Las imágenes vinculadas aparecerán en esta tarjeta'}</span></>}
    </div>}
    {canUpload && !previewLoading && variant !== 'compact' && <button
      type="button"
      className="vc-marketing-post-artwork-paste"
      aria-label={`Preparar ${post.title} para pegar una imagen con Ctrl+V`}
      title="Haz clic aquí y después presiona Ctrl+V"
      disabled={busy}
      onClick={(event) => { void pasteFromSystemClipboard(event); }}
    >
      <ClipboardPaste size={variant === 'overview' || variant === 'detail' ? 17 : 15}/>
      <span>{draftFile ? 'Pegar otra' : variant === 'week' ? 'Pegar' : 'Pegar imagen'}</span>
      <kbd>Ctrl + V</kbd>
    </button>}
    {canUpload && !previewLoading && <button type="button" className="vc-marketing-post-artwork-browse" aria-label={compactLabel} title={compactLabel} disabled={busy} onClick={(event) => { event.stopPropagation(); if (pendingDraft && draftFile) { void saveImage(draftFile); return; } inputRef.current?.click(); }}>
      {busy ? <LoaderCircle size={14} className="vc-content-spin"/> : pendingDraft ? <><Upload size={14}/><span>Subir imagen</span></> : variant === 'compact' ? <ImagePlus size={14}/> : <><Upload size={14}/><span>{preview ? (variant === 'week' ? 'Cambiar' : 'Cambiar imagen') : (variant === 'week' ? 'Elegir' : 'Elegir imagen')}</span></>}
    </button>}
    {canRemoveImage && <button
      type="button"
      className="vc-marketing-post-artwork-remove"
      aria-label={removeLabel}
      title={draftFile ? 'Descartar la vista previa; la imagen guardada se conserva.' : 'Quitar imagen de esta publicación'}
      disabled={busy}
      onClick={(event) => { event.stopPropagation(); void removeImage(); }}
    >
      <Trash2 size={variant === 'compact' ? 12 : 14}/>
      {variant !== 'compact' && <span>{draftFile ? 'Descartar' : variant === 'week' ? 'Quitar' : 'Quitar imagen'}</span>}
    </button>}
    {(message || error) && variant !== 'compact' && <small className={`vc-marketing-post-artwork-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</small>}
    {(message || error) && variant === 'compact' && <span className="vc-marketing-post-artwork-sr-only" role={error ? 'alert' : 'status'}>{error || message}</span>}
  </div>;
}
