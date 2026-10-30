import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, FileText, ImagePlus, PackagePlus, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useWorkspace } from '../../app/workspace';
import { supabase } from '../../lib/supabaseClient';
import { CatalogProductCode, CatalogProductDetailDialog } from './CatalogProductDetailDialog';
import './standard-custom-products.css';

const BUCKET = 'catalog-product-images';
const AREAS = [{ code: 'ASE', name: 'Asesoría' }, { code: 'DIS', name: 'Diseño' }, { code: 'IMP', name: 'Impresión' }, { code: 'LAS', name: 'Corte láser' }, { code: 'TAL', name: 'Taller / instalación' }, { code: 'SUB', name: 'Sublimación' }, { code: 'NEO', name: 'Neones' }, { code: 'TRO', name: 'Troquelado' }];
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
type DraftImage = { id: string; src: string; file?: File };
type PriceTierDraft = { qty: string; price: string };
type ProductDraft = {
  id: string; sku: string; name: string; category: string; description: string; calcType: 'unit' | 'm2';
  priceModel: 'fixed' | 'quantity'; price: string; priceTiers: PriceTierDraft[];
  materials: string; colors: string; dimensions: string; personalization: string;
  published: boolean; route: string; images: DraftImage[]; existingOptions: Record<string, any>; existingFeatures: string[];
};

const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const splitList = (value: string) => value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
const formatPrice = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);

async function compressedImage(file: File): Promise<File> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error('Usa imágenes PNG, JPG o WebP.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d'); if (!context) throw new Error('No pude preparar la imagen.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No pude comprimir la imagen.')), 'image/webp', 0.82));
  if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen supera el límite de 5 MB después de comprimirla.');
  return new File([blob], (slugify(file.name.replace(/\.[^.]+$/, '')) || 'producto') + '.webp', { type: 'image/webp' });
}

function filesFromClipboard(event: React.ClipboardEvent): File[] {
  const files = Array.from(event.clipboardData.files || []).filter((file) => IMAGE_TYPES.has(file.type));
  if (files.length) return files;
  return Array.from(event.clipboardData.items || []).filter((item) => IMAGE_TYPES.has(item.type)).map((item, index) => {
    const blob = item.getAsFile();
    return blob ? new File([blob], 'producto-portapapeles-' + Date.now() + '-' + index + '.png', { type: blob.type }) : null;
  }).filter((file): file is File => Boolean(file));
}

async function readClipboardImage(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const [index, item] of items.entries()) {
      const type = item.types.find((candidate) => IMAGE_TYPES.has(candidate));
      if (!type) continue;
      const blob = await item.getType(type);
      return new File([blob], 'producto-portapapeles-' + Date.now() + '-' + index + '.png', { type });
    }
  } catch { /* El navegador puede requerir Ctrl+V en el área de imágenes. */ }
  return null;
}

function emptyDraft(): ProductDraft {
  return { id: '', sku: '', name: '', category: 'Personalizados estándar', description: '', calcType: 'unit', priceModel: 'fixed', price: '', priceTiers: [{ qty: '1', price: '' }], materials: '', colors: '', dimensions: '', personalization: '', published: false, route: '', images: [], existingOptions: {}, existingFeatures: [] };
}

export function StandardCustomProducts({ editable, editablePrices }: { editable: boolean; editablePrices: boolean }) {
  const { organizationId, hasPermission } = useAuth();
  const { refreshRemote } = useWorkspace();
  const pendingImageUrls = useRef(new Set<string>());
  const [products, setProducts] = useState<any[]>([]); const [templates, setTemplates] = useState<any[]>([]); const [routes, setRoutes] = useState<Record<string, string>>({});
  const [detailProduct, setDetailProduct] = useState<any | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null); const [busy, setBusy] = useState(false); const [draggingImages, setDraggingImages] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [query, setQuery] = useState(''); const [imageMessage, setImageMessage] = useState('');
  const [templateName, setTemplateName] = useState(''); const [steps, setSteps] = useState<Array<{ area: string; title: string }>>([{ area: 'DIS', title: 'Preparar el arte' }, { area: 'IMP', title: 'Imprimir la imagen' }, { area: 'LAS', title: 'Grabar nombres y cortar el diseño' }, { area: 'TAL', title: 'Revisar y entregar' }]);
  const canEdit = editable;
  const canManageRoutes = hasPermission('sales', 'edit') && hasPermission('workshop', 'edit');
  useEffect(() => () => { pendingImageUrls.current.forEach((url) => URL.revokeObjectURL(url)); pendingImageUrls.current.clear(); }, []);
  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) return;
    const [p, t, r] = await Promise.all([
      supabase.from('catalog_products').select('id,sku,name,slug,description,category_id,subcategory,calc_type,price,price_scales,is_published,image_url,images,custom_options,features,product_kind').eq('organization_id', organizationId).eq('product_kind', 'standard_custom').order('name'),
      supabase.from('production_workflow_templates').select('code,name,required_fields,steps').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.from('catalog_product_workflow_routes').select('catalog_product_id,workflow_code').eq('organization_id', organizationId).eq('active', true),
    ]);
    if (p.error) { setError(p.error.message); return; }
    if (t.error) { setError(t.error.message); return; }
    if (r.error) { setError(r.error.message); return; }
    setProducts(p.data || []); setTemplates(t.data || []); setRoutes(Object.fromEntries((r.data || []).map((row) => [row.catalog_product_id, row.workflow_code])));
  }, [organizationId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const visible = useMemo(() => products.filter((p) => (p.name + ' ' + p.sku + ' ' + p.id + ' ' + p.description + ' ' + (p.subcategory || p.category_id)).toLowerCase().includes(query.toLowerCase())), [products, query]);

  const openEdit = (product?: any) => {
    setError(''); setNotice(''); setImageMessage('');
    if (!product) { setDraft(emptyDraft()); return; }
    const options = product.custom_options && typeof product.custom_options === 'object' && !Array.isArray(product.custom_options) ? product.custom_options : {};
    const details = options.standard_details && typeof options.standard_details === 'object' ? options.standard_details : {};
    const scales = (Array.isArray(product.price_scales) ? product.price_scales : []).filter((scale: any) => scale && scale.option == null && scale.qty != null && (scale.pvp != null || scale.price != null));
    const priceTiers = scales.map((scale: any) => ({ qty: String(scale.qty), price: String(scale.pvp ?? scale.price) }));
    const priceModel = details.price_model === 'quantity' || priceTiers.length ? 'quantity' : 'fixed';
    setDraft({
      id: product.id, sku: product.sku || product.id, name: product.name || '', category: product.subcategory || product.category_id || 'Personalizados estándar', description: product.description || '',
      calcType: product.calc_type === 'm2' ? 'm2' : 'unit', priceModel, price: Number(product.price) > 0 ? String(product.price) : '',
      priceTiers: priceTiers.length ? priceTiers : [{ qty: '1', price: Number(product.price) > 0 ? String(product.price) : '' }],
      materials: details.materials || '', colors: details.colors || '', dimensions: details.dimensions || '', personalization: details.personalization || '',
      published: product.is_published, route: routes[product.id] || '', images: (Array.isArray(product.images) ? product.images : []).filter(Boolean).map((src: string, i: number) => ({ id: product.id + '-' + i, src })), existingOptions: options, existingFeatures: Array.isArray(product.features) ? product.features.filter((feature: unknown): feature is string => typeof feature === 'string') : [],
    });
  };

  const addFiles = (files: FileList | File[]) => {
    if (busy || !draft) return;
    const incoming = Array.from(files).filter((file) => IMAGE_TYPES.has(file.type));
    if (!incoming.length) { setImageMessage('Elige una imagen PNG, JPG o WebP.'); return; }
    const added = incoming.slice(0, Math.max(0, 10 - draft.images.length)).map((file) => ({ id: crypto.randomUUID(), src: URL.createObjectURL(file), file }));
    added.forEach((image) => pendingImageUrls.current.add(image.src));
    setImageMessage(incoming.length > added.length ? 'La galería admite hasta 10 imágenes.' : added.length + (added.length === 1 ? ' imagen añadida.' : ' imágenes añadidas.'));
    setDraft((current) => {
      if (!current) return current;
      return { ...current, images: [...current.images, ...added] };
    });
    setError('');
  };
  const paste = (event: React.ClipboardEvent) => {
    if (busy) return;
    const files = filesFromClipboard(event);
    if (files.length) { event.preventDefault(); event.stopPropagation(); addFiles(files); }
  };
  const pasteFromSystemClipboard = async () => {
    if (busy) return;
    setImageMessage('');
    const file = await readClipboardImage();
    if (file) { addFiles([file]); return; }
    setImageMessage(navigator.clipboard?.read ? 'No se encontró una imagen. Copia una imagen y vuelve a intentarlo.' : 'Haz clic en el área de imágenes y pega con Ctrl + V.');
  };
  const uploadImages = async (images: DraftImage[], onUploaded: (path: string) => void) => {
    const output: string[] = [];
    for (const image of images) {
      if (!image.file) { output.push(image.src); continue; }
      const file = await compressedImage(image.file); const path = organizationId + '/' + crypto.randomUUID() + '.webp';
      const { error: uploadError } = await supabase!.storage.from(BUCKET).upload(path, file, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (uploadError) throw new Error('No se subió una foto: ' + uploadError.message);
      onUploaded(path); output.push(supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }
    return output;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase || !organizationId || !draft) return;
    if (!draft.name.trim()) { setError('Escribe el nombre del producto.'); return; }
    if (draft.id && !editablePrices && Number(draft.price) !== Number(products.find((product) => product.id === draft.id)?.price || 0)) { setError('Tu perfil no puede cambiar tarifas del catálogo.'); return; }
    const tierRows = draft.priceModel === 'quantity' ? draft.priceTiers : [];
    if (!draft.published && tierRows.some((tier) => Boolean(tier.qty.trim()) !== Boolean(tier.price.trim()))) { setError('Completa ambas celdas de cada escala de precio o elimina la fila vacía.'); return; }
    const tiers = tierRows.filter((tier) => tier.qty.trim() && tier.price.trim()).map((tier) => ({ qty: Number(tier.qty), pvp: Number(tier.price) }));
    if (draft.priceModel === 'quantity') {
      const validRows = tiers.every((tier) => Number.isFinite(tier.qty) && tier.qty > 0 && (draft.calcType === 'm2' || Number.isInteger(tier.qty)) && Number.isFinite(tier.pvp) && tier.pvp > 0);
      const sorted = [...tiers].sort((a, b) => a.qty - b.qty);
      const distinct = new Set(sorted.map((tier) => tier.qty)).size === sorted.length;
      const startsAtOne = sorted[0]?.qty === 1;
      if (!validRows || !distinct || (draft.published && (!tiers.length || !startsAtOne))) { setError('Cada escala necesita una cantidad mínima y un precio mayor que cero; para publicar, inicia en 1 y usa cantidades distintas.'); return; }
    }
    const basePrice = draft.priceModel === 'quantity' ? Number(tiers.find((tier) => tier.qty === 1)?.pvp || draft.price) : Number(draft.price);
    if (draft.published && !(basePrice > 0)) { setError('Configura una tarifa mayor que cero antes de publicar en la web y el cotizador.'); return; }
    if (draft.published && !products.find((product) => product.id === draft.id)?.is_published && draft.images.length < 4) { setError('Agrega al menos 4 imágenes de referencia antes de publicar. Puedes guardar el borrador y completar la galería después.'); return; }
    if (draft.published && !hasPermission('website', 'publish_content')) { setError('Tu perfil necesita permiso de publicación web para mostrar este producto públicamente.'); return; }
    setBusy(true); setError(''); setNotice('');
    let uploadedPaths: string[] = [];
    try {
      const images = await uploadImages(draft.images, (path) => uploadedPaths.push(path));
      const nameCode = slugify(draft.name).replace(/-/g, '').slice(0, 14).toUpperCase() || 'PRODUCTO';
      const id = draft.id || `VC-STD-${nameCode}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      const slug = (slugify(draft.name) || 'producto') + '-' + id.slice(-8).toLowerCase();
      const details = { materials: draft.materials.trim(), colors: draft.colors.trim(), dimensions: draft.dimensions.trim(), personalization: draft.personalization.trim(), price_model: draft.priceModel };
      const customOptions = { ...draft.existingOptions, standard_custom: true, configuration: draft.description.trim(), standard_details: details };
      const detailFeatures = [
        ...splitList(details.materials).map((value) => 'Material: ' + value),
        ...splitList(details.colors).map((value) => 'Color: ' + value),
        ...(details.dimensions ? ['Medidas: ' + details.dimensions] : []),
        ...(details.personalization ? ['Personalización: ' + details.personalization] : []),
      ];
      const preservedFeatures = draft.existingFeatures.filter((feature) => !/^(material|color|medidas|personalizaci[oó]n):/i.test(feature));
      const features = [...new Set([...preservedFeatures, ...detailFeatures])];
      const row = { id, organization_id: organizationId, name: draft.name.trim(), slug, description: draft.description.trim(), product_type: 'unit', category_id: 'Personalizados estándar', subcategory: draft.category.trim() || 'Personalizados estándar', calc_type: draft.calcType, price: basePrice || 0, price_inst: null, price_corp: null, price_scales: tiers.sort((a, b) => a.qty - b.qty), custom_options: customOptions, features, is_published: draft.published, image_url: images[0] || null, images, product_kind: 'standard_custom', updated_at: new Date().toISOString() };
      const result = draft.id ? await supabase.from('catalog_products').update(row).eq('id', id).eq('organization_id', organizationId).select('id').maybeSingle() : await supabase.from('catalog_products').insert(row).select('id').maybeSingle();
      if (result.error) throw new Error(result.error.message); if (!result.data) throw new Error('No tienes permiso para crear o modificar productos del catálogo.');
      uploadedPaths = [];
      if (canManageRoutes && draft.route) { const { error: routeError } = await supabase.from('catalog_product_workflow_routes').upsert({ organization_id: organizationId, catalog_product_id: id, workflow_code: draft.route, active: true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,catalog_product_id' }); if (routeError) throw new Error('Producto guardado, pero no se guardó su ruta: ' + routeError.message); }
      else if (canManageRoutes && draft.id && routes[id]) { await supabase.from('catalog_product_workflow_routes').update({ active: false }).eq('organization_id', organizationId).eq('catalog_product_id', id); }
      const previous = products.find((product) => product.id === id)?.images || [];
      const removedPaths = previous.map((url: string) => url.split('/storage/v1/object/public/' + BUCKET + '/')[1]).filter((path: string | undefined): path is string => Boolean(path)).map(decodeURIComponent).filter((path: string) => !images.some((url) => url.endsWith(path)));
      if (removedPaths.length) await supabase.storage.from(BUCKET).remove(removedPaths);
      uploadedPaths = [];
      setNotice(draft.published ? 'Producto actualizado y visible en la web y el cotizador.' : 'Borrador guardado. Aún no aparece en canales públicos.'); closeDraft(); await refresh(); await refreshRemote();
    } catch (saveError: any) { if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths); setError(saveError.message || 'No se pudo guardar el producto.'); }
    finally { setBusy(false); }
  };

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase || !organizationId) return;
    const name = templateName.trim(); const code = ('custom_' + slugify(name).replace(/-/g, '_')).slice(0, 48);
    if (name.length < 3 || steps.length < 1 || steps.length > 16 || steps.some((step) => !step.title.trim())) { setError('Completa el nombre y al menos una etapa (máximo 16).'); return; }
    setBusy(true); setError('');
    const workflowSteps = steps.map((step, index) => ({ key: 'step_' + (index + 1), area: step.area, title: step.title.trim(), depends_on: index ? ['step_' + index] : [] }));
    const { error: templateError } = await supabase.from('production_workflow_templates').upsert({ organization_id: organizationId, code, name, required_fields: [], steps: workflowSteps, active: true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,code' });
    setBusy(false); if (templateError) { setError(templateError.message); return; }
    setTemplateName(''); setNotice('Ruta guardada. Puedes asignarla a productos estándar o a cualquier producto en Administración de rutas.'); await refresh();
  };

  const updateTier = (index: number, field: keyof PriceTierDraft, value: string) => setDraft((current) => current ? { ...current, priceTiers: current.priceTiers.map((tier, row) => row === index ? { ...tier, [field]: value } : tier) } : current);
  const removeImage = (imageId: string) => {
    const removed = draft?.images.find((image) => image.id === imageId);
    if (removed?.file) { URL.revokeObjectURL(removed.src); pendingImageUrls.current.delete(removed.src); }
    setDraft((current) => current ? { ...current, images: current.images.filter((image) => image.id !== imageId) } : current);
  };
  const closeDraft = () => { pendingImageUrls.current.forEach((url) => URL.revokeObjectURL(url)); pendingImageUrls.current.clear(); setDraggingImages(false); setDraft(null); };

  return <section className="standard-products panel" aria-labelledby="standard-products-title">
    <header className="standard-products-heading"><div><span className="eyebrow">CATÁLOGO · PERSONALIZADOS</span><h2 id="standard-products-title">Productos estándar para venta</h2><p>Crea modelos que se reutilizan al cotizar y vender: precios fijos o por cantidad, especificaciones y opciones que cambian en cada pedido.</p></div>{canEdit && <button className="button button-dark" type="button" onClick={() => openEdit()}><PackagePlus size={16}/> Nuevo producto</button>}</header>
    {notice && <p className="standard-products-notice" role="status">{notice}</p>}{error && !draft && <p className="standard-products-error" role="alert">{error}</p>}
    <div className="standard-products-separation"><b>Catálogo de venta</b><span>Las plantillas aquí no representan existencias físicas ni generan movimientos de stock.</span></div>
    <div className="standard-products-search"><input aria-label="Buscar productos estándar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto estándar"/><span>{visible.length} productos</span></div>
    <div className="standard-products-list">{visible.map((product) => {
      const details = product.custom_options?.standard_details || {};
      const scales = (Array.isArray(product.price_scales) ? product.price_scales : []).filter((scale: any) => scale && scale.qty != null && (scale.pvp != null || scale.price != null));
      const fromPrice = scales.find((scale: any) => Number(scale.qty) === 1)?.pvp ?? scales.find((scale: any) => Number(scale.qty) === 1)?.price ?? product.price;
      const productUnit = product.calc_type === 'm2' ? ' / m²' : ' / unidad';
      const priceSummary = details.price_model === 'quantity' || scales.length ? 'Por cantidad · desde ' + formatPrice(Number(fromPrice)) + productUnit : 'Precio fijo · ' + formatPrice(Number(product.price)) + productUnit;
      const specSummary = [details.materials && 'Materiales: ' + details.materials, details.colors && 'Colores: ' + details.colors, details.dimensions && 'Medidas: ' + details.dimensions].filter(Boolean).join(' · ');
      const workflowRoute = routes[product.id] ? templates.find((template) => template.code === routes[product.id])?.name || routes[product.id] : '';
      return <article key={product.id}><div className="standard-product-thumb">{(product.image_url || product.images?.[0]) ? <img src={product.image_url || product.images[0]} alt={`Referencia de ${product.name}`}/> : <ImagePlus size={17}/>}</div><div className="standard-product-row-copy"><b>{product.name}</b><small>{product.subcategory || product.category_id} · {workflowRoute || 'Ruta por definir'}</small><small className="standard-product-price-summary">{priceSummary}{specSummary ? ' · ' + specSummary : ''}</small><CatalogProductCode value={product.sku || product.id}/></div><span className={product.is_published ? 'is-published' : ''}>{product.is_published ? 'Publicado' : 'Borrador'}</span><button className="button button-outline" type="button" onClick={() => setDetailProduct({ ...product, family: product.subcategory || product.category_id, workflowRoute })}><FileText size={14}/> Ficha</button>{canEdit && <button className="button button-outline" type="button" onClick={() => openEdit(product)}><Pencil size={14}/> Editar</button>}</article>;
    })}{!visible.length && <p className="standard-products-empty">Crea aquí modelos de productos que puedas personalizar y vender más de una vez.</p>}</div>
    {canManageRoutes && <details className="standard-workflow-builder"><summary><Plus size={15}/> Crear ruta de producción por áreas</summary><p>Estas etapas se copian al trabajo que se genere desde cada venta; las tareas ya creadas conservan su secuencia.</p><form onSubmit={saveTemplate}><label>Nombre de la ruta<input required minLength={3} maxLength={100} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Recuerdo de acrílico personalizado"/></label><div className="standard-workflow-steps">{steps.map((step, index) => <div key={index}><select aria-label={'Área de etapa ' + (index + 1)} value={step.area} onChange={(event) => setSteps((old) => old.map((row, rowIndex) => rowIndex === index ? { ...row, area: event.target.value } : row))}>{AREAS.map((area) => <option key={area.code} value={area.code}>{area.name}</option>)}</select><input aria-label={'Nombre de etapa ' + (index + 1)} value={step.title} maxLength={140} onChange={(event) => setSteps((old) => old.map((row, rowIndex) => rowIndex === index ? { ...row, title: event.target.value } : row))}/><button type="button" aria-label={'Eliminar etapa ' + (index + 1)} disabled={steps.length === 1} onClick={() => setSteps((old) => old.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14}/></button></div>)}</div><div className="standard-workflow-actions"><button className="button button-outline" type="button" disabled={steps.length >= 16} onClick={() => setSteps((old) => [...old, { area: 'TAL', title: '' }])}><Plus size={14}/> Añadir etapa</button><button className="button button-dark" type="submit" disabled={busy}><Save size={14}/> Guardar ruta</button></div></form></details>}

    <CatalogProductDetailDialog product={detailProduct} onClose={() => setDetailProduct(null)}/>
    {draft && <div className="standard-product-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeDraft(); }}><form className="standard-product-editor" role="dialog" aria-modal="true" onSubmit={save} onPaste={paste} aria-labelledby="standard-product-editor-title">
      <header><div><span className="eyebrow">PRODUCTO REUTILIZABLE · SIN STOCK FÍSICO</span><h3 id="standard-product-editor-title">{draft.id ? 'Editar producto estándar' : 'Nuevo producto estándar'}</h3><p>Define el modelo base y los datos que podrán cambiar en cada pedido.</p></div><button type="button" aria-label="Cerrar" disabled={busy} onClick={closeDraft}><X size={18}/></button></header>
      <div className="standard-product-fields">
        <label>SKU / código de identificación<input readOnly value={draft.sku} placeholder="Se asignará al guardar"/><small>El código queda fijo y sirve como ID en el catálogo, el sitio web, el cotizador y las operaciones.</small></label>
        <label>Nombre del modelo<input required maxLength={140} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Lámpara personalizada de acrílico"/></label>
        <label>Categoría<input maxLength={90} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}/></label>
        <label className="wide">Descripción<textarea rows={3} maxLength={1500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Lámpara de acrílico cortada a láser con base iluminada…"/></label>
        <label>Materiales<textarea rows={2} maxLength={800} value={draft.materials} onChange={(event) => setDraft({ ...draft, materials: event.target.value })} placeholder="Acrílico de 3 mm; base de madera"/><small>Separa varios materiales por coma o línea.</small></label>
        <label>Colores disponibles<textarea rows={2} maxLength={500} value={draft.colors} onChange={(event) => setDraft({ ...draft, colors: event.target.value })} placeholder="Transparente, blanco, negro"/><small>Especifica opciones confirmadas para este modelo.</small></label>
        <label>Medidas<input maxLength={300} value={draft.dimensions} onChange={(event) => setDraft({ ...draft, dimensions: event.target.value })} placeholder="20 × 15 cm · base de 12 cm"/></label>
        <label>Personalización por pedido<input maxLength={300} value={draft.personalization} onChange={(event) => setDraft({ ...draft, personalization: event.target.value })} placeholder="Nombres de la pareja para grabar"/><small>Describe qué datos deben cambiar al preparar cada venta.</small></label>
        <label>Tipo de cálculo<select value={draft.calcType} onChange={(event) => setDraft({ ...draft, calcType: event.target.value as ProductDraft['calcType'] })}><option value="unit">Por unidad / cantidad</option><option value="m2">Por m²</option></select></label>
        <label>Modelo de precio<select disabled={Boolean(draft.id && !editablePrices)} value={draft.priceModel} onChange={(event) => setDraft((current) => { if (!current) return current; const priceModel = event.target.value as ProductDraft['priceModel']; const firstPrice = current.priceTiers[0]?.price || current.price; return { ...current, priceModel, price: priceModel === 'fixed' ? (current.price || firstPrice) : current.price, priceTiers: priceModel === 'quantity' && !current.priceTiers[0]?.price ? [{ ...current.priceTiers[0], price: current.price }, ...current.priceTiers.slice(1)] : current.priceTiers }; })}><option value="fixed">Precio fijo</option><option value="quantity">Precio variable por cantidad</option></select><small>Usa el mismo cálculo que ya leen el cotizador y el POS.</small></label>
        {draft.priceModel === 'fixed' ? <label>Precio fijo {draft.calcType === 'm2' ? 'por m²' : 'por unidad'} · USD<input type="number" min="0" step="0.01" disabled={Boolean(draft.id && !editablePrices)} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="Configura antes de publicar"/></label> : <div className="standard-price-tiers wide"><div className="standard-price-tiers-heading"><div><b>Precios por cantidad</b><small>Define el precio que se aplica desde cada cantidad indicada.</small></div><button type="button" className="button button-outline" disabled={Boolean(draft.id && !editablePrices)} onClick={() => setDraft((current) => current ? { ...current, priceTiers: [...current.priceTiers, { qty: '', price: '' }] } : current)}><Plus size={14}/> Añadir escala</button></div><div className="standard-price-tier-list">{draft.priceTiers.map((tier, index) => <div className="standard-price-tier-row" key={index}><label>{draft.calcType === 'm2' ? 'Desde m²' : 'Desde unidades'}<input type="number" min={draft.calcType === 'm2' ? '0.01' : '1'} step={draft.calcType === 'm2' ? '0.01' : '1'} disabled={Boolean(draft.id && !editablePrices)} value={tier.qty} onChange={(event) => updateTier(index, 'qty', event.target.value)}/></label><label>{draft.calcType === 'm2' ? 'Precio por m² · USD' : 'Precio por unidad · USD'}<input type="number" min="0" step="0.01" disabled={Boolean(draft.id && !editablePrices)} value={tier.price} onChange={(event) => updateTier(index, 'price', event.target.value)}/></label><button type="button" aria-label={'Eliminar escala ' + (index + 1)} disabled={draft.priceTiers.length <= 1 || Boolean(draft.id && !editablePrices)} onClick={() => setDraft((current) => current ? { ...current, priceTiers: current.priceTiers.filter((_, rowIndex) => rowIndex !== index) } : current)}><Trash2 size={14}/></button></div>)}</div><p>La primera escala debe empezar en 1. Para cambiar de precio, agrega otra cantidad mínima; el cotizador tomará la escala correspondiente.</p></div>}
        <label>Ruta predeterminada<select disabled={!canManageRoutes} value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value })}><option value="">Asesoría define la ruta</option>{templates.map((template) => <option key={template.code} value={template.code}>{template.name}</option>)}</select><small>Para asignar rutas necesitas permisos de Ventas y Taller.</small></label>
        <label className="standard-publish"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })}/><span><b>Publicar en sitio web y cotizador</b><small>Al publicarlo, el precio y la descripción estarán disponibles en canales públicos.</small></span></label>
      </div>
      <div className={`standard-image-drop${draggingImages ? ' is-dragging' : ''}`} tabIndex={0} onPaste={paste} onDragOver={(event) => { event.preventDefault(); if (!busy) setDraggingImages(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImages(false); }} onDrop={(event) => { event.preventDefault(); setDraggingImages(false); if (!busy) addFiles(event.dataTransfer.files); }} onClick={() => { if (!busy) document.getElementById('standard-product-file-input')?.click(); }}><ImagePlus size={19}/><b>Portada y galería</b><span><ClipboardPaste size={13}/> Pega con Ctrl + V, arrastra o selecciona archivos</span><small className="standard-image-guidance">Usa entre 4 y 10 imágenes para mostrar el modelo y sus detalles.</small><div className="standard-image-actions"><button type="button" className="button button-outline" disabled={busy} onClick={(event) => { event.stopPropagation(); void pasteFromSystemClipboard(); }}><ClipboardPaste size={14}/> Pegar imagen</button><button type="button" className="button button-outline" disabled={busy} onClick={(event) => { event.stopPropagation(); document.getElementById('standard-product-file-input')?.click(); }}><Upload size={14}/> Subir imagen</button></div><input id="standard-product-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={busy} onClick={(event) => event.stopPropagation()} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ''; }}/></div>
      {imageMessage && <p className="standard-products-notice" role="status">{imageMessage}</p>}
      <div className="standard-image-grid">{draft.images.map((image, index) => <figure key={image.id}><img src={image.src} alt={'Imagen ' + (index + 1)}/><figcaption><button type="button" disabled={busy} className={index === 0 ? 'cover' : ''} onClick={() => setDraft((current) => current ? { ...current, images: [image, ...current.images.filter((row) => row.id !== image.id)] } : current)}>{index === 0 ? 'Portada' : 'Usar de portada'}</button><button type="button" disabled={busy} aria-label={'Quitar imagen ' + (index + 1)} onClick={() => removeImage(image.id)}><Trash2 size={13}/></button></figcaption></figure>)}</div>
      {error && <p className="standard-products-error" role="alert">{error}</p>}
      <footer><span><Upload size={13}/> Las imágenes se comprimen y guardan en la biblioteca del catálogo.</span><button className="button button-dark" type="submit" disabled={busy}><Save size={15}/>{busy ? 'Guardando…' : draft.published ? 'Guardar y publicar' : 'Guardar borrador'}</button></footer>
    </form></div>}
  </section>;
}

