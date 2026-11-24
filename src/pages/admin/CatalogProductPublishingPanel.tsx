import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, Check, CircleAlert, CloudUpload, Download, ExternalLink, FileArchive, FileImage, FileText, LockKeyhole, MessageCircle, Package, RefreshCw, Send, ShieldCheck, Smartphone } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { zipSync } from 'fflate';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthProvider';
import { Dialog } from '../../components/ui/OperationalKit';
import { supabase } from '../../lib/supabaseClient';
import './catalog-product-publishing.css';

const EDITABLES_BUCKET = 'catalog-product-editables';
const EDITABLE_MAX_BYTES = 45 * 1024 * 1024;
const EDITABLE_MAX_COUNT = 10;
const PUBLIC_SITE = 'https://visualcorp-suite.vercel.app';
const PUBLIC_CHANNEL = 'Visual Corp · Productos';
const INTERNAL_CHANNEL = 'Visual Corp · Catálogo estándar (interno)';

type Product = Record<string, any>;
type Target = 'public' | 'internal';
type Editable = { name: string; path: string; size: number; updatedAt?: string };
type Publication = { id: string; target: Target; status: string; message_link: string | null; error_message: string | null; created_at: string };
type ChannelStatus = { ready: boolean; reason: string };

function publicProductUrl(product: Product) {
  const key = String(product.slug || product.id || '');
  return `${PUBLIC_SITE}/tienda?producto=${encodeURIComponent(key)}`;
}

function listImages(product: Product) {
  const values = [...(Array.isArray(product.images) ? product.images : []), product.image_url];
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().startsWith('https://')))];
}

function safeFilename(value: string) {
  return value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 110) || 'producto';
}

function formatMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount) : 'Pendiente';
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dataUrlBytes(value: string) {
  const encoded = value.slice(value.indexOf(',') + 1);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function asArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer as ArrayBuffer;
}

function saveBlob(filename: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('El navegador no pudo preparar el PNG.')), type, quality));
}

async function barcodePng(sku: string) {
  if (!sku || sku === 'Pendiente') throw new Error('Este producto todavía no tiene SKU.');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, sku, { format: 'CODE128', width: 2, height: 92, displayValue: true, font: 'Arial', fontOptions: 'bold', fontSize: 22, margin: 18, background: '#ffffff', lineColor: '#16131a' });
  const markup = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('No se pudo dibujar el código de barras.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(900, image.naturalWidth + 40);
    canvas.height = Math.max(280, image.naturalHeight + 40);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo dibujar el código de barras.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min((canvas.width - 40) / image.naturalWidth, (canvas.height - 40) / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return await canvasBlob(canvas, 'image/png');
  } finally { URL.revokeObjectURL(url); }
}

async function qrPng(value: string) {
  const dataUrl = await QRCode.toDataURL(value, { width: 512, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#17131a', light: '#ffffff' } });
  return new Blob([asArrayBuffer(dataUrlBytes(dataUrl))], { type: 'image/png' });
}

async function convertTelegramPhoto(source: string, index: number) {
  const response = await fetch(source, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`No se pudo leer la imagen ${index + 1}.`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('No se pudo convertir una imagen para Telegram.'); }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.72);
  if (jpeg.size > 700_000) throw new Error(`La imagen ${index + 1} queda demasiado pesada para enviarla con seguridad.`);
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return { name: `producto-${index + 1}.jpg`, dataUrl: `data:image/jpeg;base64,${btoa(binary)}` };
}

function priceTierLines(product: Product) {
  const scales = Array.isArray(product.price_scales) ? product.price_scales.filter((row: any) => row && row.qty != null && (row.pvp != null || row.price != null)) : [];
  return scales.map((row: any) => `Desde ${row.qty}: ${formatMoney(row.pvp ?? row.price)}`);
}

function productFacts(product: Product, includePrice: boolean) {
  const lines = [
    'VISUAL CORP · CATÁLOGO ESTÁNDAR',
    `Producto: ${product.name || 'Pendiente'}`,
    `Código / SKU: ${product.sku || product.id || 'Pendiente'}`,
    `Categoría: ${product.subcategory || product.category_id || 'Pendiente'}`,
    `Unidad: ${product.calc_type === 'm2' ? 'm²' : 'unidad'}`,
    `Descripción: ${product.description || 'Pendiente'}`,
  ];
  if (includePrice) {
    lines.push(`Precio base: ${formatMoney(product.price)}`);
    if (product.price_inst != null) lines.push(`Precio con instalación: ${formatMoney(product.price_inst)}`);
    if (product.price_corp != null) lines.push(`Precio corporativo: ${formatMoney(product.price_corp)}`);
    const tiers = priceTierLines(product);
    if (tiers.length) lines.push('Escalas de precio:', ...tiers);
    const details = product.custom_options?.standard_details || {};
    for (const [label, value] of [['Materiales', details.materials], ['Colores', details.colors], ['Medidas', details.dimensions], ['Personalización', details.personalization]]) {
      if (value) lines.push(`${label}: ${value}`);
    }
  }
  lines.push(`Ficha web: ${publicProductUrl(product)}`);
  return lines.join('\n');
}

async function fetchImageForZip(url: string, index: number) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`No se pudo incluir la imagen ${index + 1}.`);
  const blob = await response.blob();
  const mime = blob.type.toLowerCase();
  const extension = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'bin';
  if (extension === 'bin') throw new Error(`La imagen ${index + 1} tiene un formato no reconocido.`);
  return { filename: `fotos/${String(index + 1).padStart(2, '0')}-producto.${extension}`, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

function statusLabel(status: string) {
  if (status === 'published') return 'Publicado';
  if (status === 'partial') return 'Parcial · faltan archivos';
  if (status === 'failed') return 'No publicado';
  if (status === 'unknown') return 'Respuesta incierta · revisar canal';
  if (status === 'sending') return 'Enviando';
  return 'Sin publicar';
}

function stateClass(status?: string) {
  return status === 'published' ? 'is-success' : status === 'partial' || status === 'unknown' ? 'is-warning' : status === 'failed' ? 'is-error' : '';
}

function CatalogProductPublishingPanel({ product, canManageEditables, canPublishPublic, canPublishInternal }: {
  product: Product;
  canManageEditables: boolean;
  canPublishPublic: boolean;
  canPublishInternal: boolean;
}) {
  const { organizationId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editables, setEditables] = useState<Editable[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [channels, setChannels] = useState<Record<Target, ChannelStatus>>({
    public: { ready: false, reason: 'Todavía no se comprobó la conexión.' },
    internal: { ready: false, reason: 'Todavía no se comprobó la conexión.' },
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<Target | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Target | null>(null);
  const [checkedChannelReview, setCheckedChannelReview] = useState(false);
  const [detectedChannels, setDetectedChannels] = useState<Array<{ id: string; title: string; type: string }>>([]);
  const images = useMemo(() => listImages(product), [product]);
  const sku = String(product.sku || product.id || 'Pendiente');
  const filesTotalBytes = editables.reduce((sum, file) => sum + file.size, 0);

  const refresh = useCallback(async () => {
    if (!supabase || !product.id) return;
    setLoading(true);
    setError('');
    const [statusResult, logResult] = await Promise.all([
      supabase.functions.invoke('telegram-catalog-publisher', { body: { action: 'status' } }),
      supabase.from('catalog_product_telegram_publications')
        .select('id,target,status,message_link,error_message,created_at')
        .eq('product_id', String(product.id))
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (!statusResult.error && statusResult.data) {
      setChannels({
        public: { ready: Boolean(statusResult.data.channels?.public), reason: statusResult.data.messages?.public || 'Canal sin comprobar.' },
        internal: { ready: Boolean(statusResult.data.channels?.internal), reason: statusResult.data.messages?.internal || 'Canal sin comprobar.' },
      });
    } else {
      setChannels({ public: { ready: false, reason: 'No se pudo comprobar la conexión con Telegram.' }, internal: { ready: false, reason: 'No se pudo comprobar la conexión con Telegram.' } });
    }
    if (logResult.error) setError('No se pudo cargar el historial de publicaciones.');
    else setPublications((logResult.data || []) as Publication[]);
    if (canManageEditables && organizationId) {
      const prefix = `${organizationId}/${product.id}`;
      const { data, error: assetsError } = await supabase.storage.from(EDITABLES_BUCKET).list(prefix, { limit: EDITABLE_MAX_COUNT, sortBy: { column: 'name', order: 'asc' } });
      if (assetsError) setError('No se pudieron leer los editables privados.');
      else setEditables((data || []).filter((item) => item.name && /\.(ai|psd)$/i.test(item.name)).map((item) => ({
        name: item.name.replace(/^\d+_[a-f0-9-]+_/, ''),
        path: `${prefix}/${item.name}`,
        size: Number(item.metadata?.size || 0),
        updatedAt: item.updated_at || item.created_at || undefined,
      })));
    } else setEditables([]);
    setLoading(false);
  }, [canManageEditables, organizationId, product.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const latestByTarget = (target: Target) => publications.find((entry) => entry.target === target);

  const createPackage = async (target: Target) => {
    if (!supabase) { toast.error('La conexión con el catálogo no está disponible.'); return; }
    if (target === 'internal' && !canPublishInternal) { toast.error('Tu perfil no tiene permiso para el paquete interno.'); return; }
    setBusy(`package-${target}`);
    try {
      const files: Record<string, Uint8Array> = {};
      const qr = await qrPng(publicProductUrl(product));
      const barcode = await barcodePng(sku);
      files['codigos/codigo-qr.png'] = new Uint8Array(await qr.arrayBuffer());
      files['codigos/codigo-barras-code128.png'] = new Uint8Array(await barcode.arrayBuffer());
      for (const [index, url] of images.entries()) {
        const image = await fetchImageForZip(url, index);
        files[image.filename] = image.bytes;
      }
      files['ficha.txt'] = new TextEncoder().encode(productFacts(product, target === 'internal'));
      if (target === 'internal') {
        let totalBytes = 0;
        for (const asset of editables) {
          const { data, error: downloadError } = await supabase.storage.from(EDITABLES_BUCKET).download(asset.path);
          if (downloadError || !data) throw new Error(`No se pudo incluir el editable ${asset.name}.`);
          totalBytes += data.size;
          if (totalBytes > 150 * 1024 * 1024) throw new Error('El paquete supera 150 MB. Descarga los masters por separado y vuelve a generarlo con menos archivos.');
          files[`editables/${safeFilename(asset.name)}`] = new Uint8Array(await data.arrayBuffer());
        }
      }
      const archive = zipSync(files, { level: 0 });
      const targetLabel = target === 'public' ? 'publico' : 'interno';
      saveBlob(`Visual-Corp-${targetLabel}-${safeFilename(String(product.name || sku))}.zip`, new Blob([asArrayBuffer(archive)], { type: 'application/zip' }));
      toast.success(`Paquete ${targetLabel} listo con ${images.length} imagen(es), QR y código de barras${target === 'internal' ? ` y ${editables.length} editable(s)` : ''}.`);
    } catch (packageError) {
      toast.error(packageError instanceof Error ? packageError.message : 'No se pudo generar el paquete.');
    } finally { setBusy(''); }
  };

  const uploadEditables = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length || !supabase || !organizationId) return;
    if (editables.length + selected.length > EDITABLE_MAX_COUNT) { toast.error(`Guarda hasta ${EDITABLE_MAX_COUNT} editables por producto.`); return; }
    if (selected.some((file) => !/\.(ai|psd)$/i.test(file.name))) { toast.error('Solo se permiten archivos .AI o .PSD.'); return; }
    const tooLarge = selected.find((file) => file.size > EDITABLE_MAX_BYTES);
    if (tooLarge) { toast.error(`${tooLarge.name} supera 45 MB.`); return; }
    setBusy('upload');
    try {
      for (const file of selected) {
        const cleanName = safeFilename(file.name);
        const path = `${organizationId}/${product.id}/${Date.now()}_${crypto.randomUUID()}_${cleanName}`;
        const contentType = ['application/postscript', 'application/pdf', 'application/illustrator', 'application/vnd.adobe.photoshop', 'image/vnd.adobe.photoshop'].includes(file.type) ? file.type : 'application/octet-stream';
        const { error: uploadError } = await supabase.storage.from(EDITABLES_BUCKET).upload(path, file, { contentType, upsert: false, cacheControl: '3600' });
        if (uploadError) throw new Error(`No se pudo guardar ${file.name}: ${uploadError.message}`);
      }
      toast.success('Editables guardados en el almacenamiento privado del producto.');
      await refresh();
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'No se pudieron guardar los editables.');
    } finally { setBusy(''); }
  };

  const downloadEditable = async (asset: Editable) => {
    if (!supabase) return;
    setBusy(`download-${asset.path}`);
    const { data, error: downloadError } = await supabase.storage.from(EDITABLES_BUCKET).download(asset.path);
    if (downloadError || !data) toast.error(`No se pudo descargar ${asset.name}.`);
    else saveBlob(asset.name, data);
    setBusy('');
  };

  const discoverInternal = async () => {
    if (!supabase || !product.id) return;
    setBusy('discover');
    setDetectedChannels([]);
    const { data, error: invokeError } = await supabase.functions.invoke('telegram-catalog-publisher', { body: { action: 'discover_internal', product_id: String(product.id) } });
    if (invokeError) toast.error('No se pudo detectar el canal. Comprueba que el token del bot esté configurado.');
    else if (data?.error) toast.error(data.error);
    else if (data?.candidates?.length) setDetectedChannels(data.candidates);
    else toast.message('No hay actualizaciones de canal pendientes. Añade el bot como administrador y vuelve a comprobar.');
    setBusy('');
  };

  const resolveUncertainPublication = async () => {
    if (!supabase || !resolveTarget) return;
    const current = latestByTarget(resolveTarget);
    if (!current) return;
    setBusy(`resolve-${resolveTarget}`);
    const { data, error: invokeError } = await supabase.functions.invoke('telegram-catalog-publisher', {
      body: { action: 'resolve_unknown', publication_id: current.id, product_id: String(product.id), target: resolveTarget },
    });
    if (invokeError || data?.error) toast.error(data?.error || 'No se pudo habilitar el reintento.');
    else toast.success('Reintento habilitado. La siguiente publicación omitirá los archivos ya enviados.');
    setResolveTarget(null);
    setCheckedChannelReview(false);
    await refresh();
    setBusy('');
  };

  const publish = async (target: Target) => {
    if (!supabase) return;
    setConfirmTarget(null);
    setBusy(`publish-${target}`);
    try {
      if (!images.length) throw new Error('Agrega al menos una foto pública del producto.');
      const photos = await Promise.all(images.slice(0, 5).map(convertTelegramPhoto));
      const body: Record<string, unknown> = { action: 'publish', product_id: String(product.id), target, photos };
      if (target === 'internal') {
        body.qr = await qrPng(publicProductUrl(product)).then(async (blob) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          return `data:image/png;base64,${btoa(binary)}`;
        });
        body.barcode = await barcodePng(sku).then(async (blob) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
          return `data:image/png;base64,${btoa(binary)}`;
        });
      }
      const { data, error: publishError } = await supabase.functions.invoke('telegram-catalog-publisher', { body });
      if (publishError) throw new Error(data?.error || 'No se pudo conectar con la función de Telegram.');
      if (data?.error) throw new Error(data.error);
      if (data?.status === 'unknown') throw new Error('Telegram no confirmó la respuesta. Comprueba el canal antes de volver a enviar.');
      if (data?.status === 'partial') throw new Error(data.error || 'El mensaje salió, pero falta entregar uno o más editables.');
      toast.success(data?.already_published ? 'Esta versión ya se publicó en ese canal.' : 'Producto publicado en el canal seleccionado.');
      await refresh();
    } catch (publishError) {
      toast.error(publishError instanceof Error ? publishError.message : 'No se pudo publicar el producto.');
      await refresh();
    } finally { setBusy(''); }
  };

  const currentConfirmation = confirmTarget;
  const canOfferPublic = canPublishPublic && Boolean(product.is_published ?? product.published);
  const activeChannel = currentConfirmation ? channels[currentConfirmation] : null;
  const publicPostCaption = [product.name, product.description, `Código: ${sku}`, publicProductUrl(product)].filter(Boolean).join('\n\n');

  return <section className="catalog-publishing-panel" aria-labelledby="catalog-publishing-heading">
    <header className="catalog-publishing-heading">
      <div className="catalog-publishing-icon"><MessageCircle size={17}/></div>
      <div><h3 id="catalog-publishing-heading">Publicación y paquetes por canal</h3><p>Prepara ZIP separados y envía cada producto solo después de revisar el destino.</p></div>
      <button type="button" className="catalog-publishing-refresh" onClick={() => void refresh()} disabled={loading || Boolean(busy)} aria-label="Actualizar estado de Telegram"><RefreshCw size={14}/></button>
    </header>

    {!supabase && <div className="catalog-publishing-notice is-warning"><CircleAlert size={15}/> Conecta el catálogo para generar paquetes y consultar Telegram.</div>}
    {error && <div className="catalog-publishing-notice is-warning" role="status"><CircleAlert size={15}/>{error}</div>}

    <div className="catalog-publishing-grid">
      <article className="catalog-publishing-card">
        <div className="catalog-publishing-card-header"><span className="catalog-publishing-card-icon is-public"><Smartphone size={16}/></span><div><b>{PUBLIC_CHANNEL}</b><small>Visible para clientes · sin precios ni archivos editables</small></div></div>
        <div className="catalog-publishing-channel-state"><span className={`catalog-publishing-dot${channels.public.ready ? ' is-ready' : ''}`}/><span>{channels.public.reason}</span></div>
        {latestByTarget('public') && <div className="catalog-publishing-last"><span className={stateClass(latestByTarget('public')?.status)}>{statusLabel(latestByTarget('public')!.status)}</span>{latestByTarget('public')?.message_link && <a href={latestByTarget('public')!.message_link!} target="_blank" rel="noreferrer">Abrir mensaje <ExternalLink size={12}/></a>}</div>}
        {latestByTarget('public')?.status === 'unknown' && canOfferPublic && <button className="catalog-publishing-resolve" type="button" onClick={() => { setConfirmTarget(null); setCheckedChannelReview(false); setResolveTarget('public'); }}>Revisé el canal y quiero habilitar un reintento</button>}
        <div className="catalog-publishing-actions">
          <button className="button button-outline" type="button" onClick={() => void createPackage('public')} disabled={Boolean(busy) || !images.length}><FileArchive size={14}/>{busy === 'package-public' ? 'Preparando…' : 'Descargar paquete público'}</button>
          {canOfferPublic && <button className="button button-dark" type="button" onClick={() => setConfirmTarget('public')} disabled={!channels.public.ready || Boolean(busy) || !images.length}><Send size={14}/>{busy === 'publish-public' ? 'Publicando…' : 'Publicar en Telegram'}</button>}
        </div>
        {!canOfferPublic && <small className="catalog-publishing-note">Para enviarlo al canal público, publica primero la ficha en el sitio y usa un perfil con permiso de publicación web.</small>}
      </article>

      <article className="catalog-publishing-card is-internal">
        <div className="catalog-publishing-card-header"><span className="catalog-publishing-card-icon is-private"><LockKeyhole size={16}/></span><div><b>{INTERNAL_CHANNEL}</b><small>Interno · incluye precios, especificaciones y masters</small></div></div>
        <div className="catalog-publishing-channel-state"><span className={`catalog-publishing-dot${channels.internal.ready ? ' is-ready' : ''}`}/><span>{channels.internal.reason}</span></div>
        {latestByTarget('internal') && <div className="catalog-publishing-last"><span className={stateClass(latestByTarget('internal')?.status)}>{statusLabel(latestByTarget('internal')!.status)}</span>{latestByTarget('internal')?.message_link && <a href={latestByTarget('internal')!.message_link!} target="_blank" rel="noreferrer">Abrir mensaje <ExternalLink size={12}/></a>}</div>}
        {latestByTarget('internal')?.status === 'unknown' && canPublishInternal && <button className="catalog-publishing-resolve" type="button" onClick={() => { setConfirmTarget(null); setCheckedChannelReview(false); setResolveTarget('internal'); }}>Revisé el canal y quiero habilitar un reintento</button>}
        <div className="catalog-publishing-actions">
          {canPublishInternal ? <button className="button button-outline" type="button" onClick={() => void createPackage('internal')} disabled={Boolean(busy)}><FileArchive size={14}/>{busy === 'package-internal' ? 'Preparando…' : 'Descargar paquete interno'}</button> : <span className="catalog-publishing-restricted"><ShieldCheck size={13}/> Requiere permiso para gestionar precios</span>}
          {canPublishInternal && <button className="button button-dark" type="button" onClick={() => setConfirmTarget('internal')} disabled={!channels.internal.ready || Boolean(busy) || !images.length}><Send size={14}/>{busy === 'publish-internal' ? 'Publicando…' : 'Publicar en Telegram'}</button>}
        </div>
        {!channels.internal.ready && canPublishInternal && /Falta configurar el ID/i.test(channels.internal.reason) && <button type="button" className="catalog-publishing-discover" onClick={() => void discoverInternal()} disabled={Boolean(busy)}><Smartphone size={13}/>{busy === 'discover' ? 'Buscando…' : 'Detectar ID del canal privado'}</button>}
        {detectedChannels.length > 0 && <div className="catalog-publishing-candidates"><b>Canales detectados por el bot</b>{detectedChannels.map((channel) => <div key={channel.id}><span>{channel.title} · <code>{channel.id}</code></span><button type="button" onClick={() => { void navigator.clipboard.writeText(channel.id); toast.success('ID copiado. Agrégalo a TELEGRAM_INTERNAL_CHANNEL_ID en Supabase.'); }}>Copiar ID <Check size={12}/></button></div>)}<small>Guarda el ID en Supabase → Edge Function Secrets. El token nunca se muestra en esta página.</small></div>}
      </article>
    </div>

    <section className="catalog-editables-box" aria-labelledby="catalog-editables-heading">
      <div className="catalog-editables-heading"><div><h4 id="catalog-editables-heading"><LockKeyhole size={14}/> Editables privados del producto</h4><p>Archiva archivos AI o PSD dentro del producto. El bucket no es público y exige permiso de edición del catálogo.</p></div>
        {canManageEditables && <><input ref={fileInputRef} className="catalog-editables-input" type="file" accept=".ai,.psd,application/postscript,application/vnd.adobe.photoshop" multiple onChange={(event) => void uploadEditables(event)}/><button className="button button-outline" type="button" onClick={() => fileInputRef.current?.click()} disabled={Boolean(busy) || editables.length >= EDITABLE_MAX_COUNT}><CloudUpload size={14}/>{busy === 'upload' ? 'Guardando…' : 'Añadir AI / PSD'}</button></>}
      </div>
      {editables.length ? <>
        <ul className="catalog-editables-list">{editables.map((asset) => <li key={asset.path}><span className="catalog-editable-file-icon"><FileImage size={15}/></span><div><b>{asset.name}</b><small>{formatBytes(asset.size)}</small></div><button type="button" aria-label={`Descargar ${asset.name}`} onClick={() => void downloadEditable(asset)} disabled={Boolean(busy)}><Download size={14}/></button></li>)}</ul>
        <small className="catalog-editables-total">{editables.length} de {EDITABLE_MAX_COUNT} archivos · {formatBytes(filesTotalBytes)} · máximo 45 MB por archivo</small>
      </> : <div className="catalog-editables-empty"><FileText size={16}/><span>{canManageEditables ? 'Todavía no hay archivos maestros guardados.' : 'Tu perfil no puede acceder a los archivos maestros.'}</span></div>}
    </section>

    <div className="catalog-publishing-footnote"><Barcode size={14}/><span>Los dos ZIP generan QR al enlace público de la ficha y código Code 128 desde el SKU. El paquete público nunca incluye precios ni editables.</span><Package size={14}/></div>

    <Dialog open={Boolean(currentConfirmation)} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }} title={currentConfirmation === 'public' ? 'Revisar publicación pública' : 'Revisar publicación interna'} description={currentConfirmation === 'public' ? 'Esta confirmación enviará el producto y su precio permanecerá fuera del mensaje.' : 'Esta confirmación enviará el precio y los archivos maestros al canal privado.'} size="sm" tone={currentConfirmation === 'internal' ? 'warning' : 'brand'} footer={<div className="catalog-publishing-confirm-actions"><button className="button button-outline" type="button" onClick={() => setConfirmTarget(null)}>Volver a revisar</button><button className="button button-dark" type="button" disabled={!activeChannel?.ready || Boolean(busy)} onClick={() => currentConfirmation && void publish(currentConfirmation)}><Send size={14}/> Confirmar y publicar</button></div>}>
      {currentConfirmation && <div className="catalog-publishing-preview"><div className="catalog-publishing-preview-product"><b>{product.name}</b><small>SKU {sku} · {images.length} foto(s)</small></div>{currentConfirmation === 'public' ? <p>{publicPostCaption}</p> : <><dl><div><dt>Precio base</dt><dd>{formatMoney(product.price)}</dd></div>{product.price_inst != null && <div><dt>Con instalación</dt><dd>{formatMoney(product.price_inst)}</dd></div>}{product.price_corp != null && <div><dt>Corporativo</dt><dd>{formatMoney(product.price_corp)}</dd></div>}<div><dt>Editables adjuntos</dt><dd>{editables.length}</dd></div></dl><small>El mensaje incluirá fotos, QR, Code 128, precio y el enlace público. Los AI/PSD irán como documentos privados.</small></>}</div>}
    </Dialog>
    <Dialog open={Boolean(resolveTarget)} onOpenChange={(open) => { if (!open) { setResolveTarget(null); setCheckedChannelReview(false); } }} title="Habilitar reintento manual" description="Telegram no confirmó si recibió la publicación. El reintento se bloquea para evitar duplicados hasta que revises el canal." size="sm" tone="warning" footer={<div className="catalog-publishing-confirm-actions"><button className="button button-outline" type="button" onClick={() => { setResolveTarget(null); setCheckedChannelReview(false); }}>Cancelar</button><button className="button button-dark" type="button" disabled={!checkedChannelReview || Boolean(busy)} onClick={() => void resolveUncertainPublication()}><RefreshCw size={14}/> Habilitar reintento</button></div>}>
      <label className="catalog-publishing-review-check"><input type="checkbox" checked={checkedChannelReview} onChange={(event) => setCheckedChannelReview(event.target.checked)}/><span>Ya revisé el canal de destino y confirmé que el mensaje o el archivo incierto no aparece.</span></label>
    </Dialog>
  </section>;
}

export default CatalogProductPublishingPanel;
