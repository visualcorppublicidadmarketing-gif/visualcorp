import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, ImagePlus, PackagePlus, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useWorkspace } from '../../app/workspace';
import { supabase } from '../../lib/supabaseClient';
import './standard-custom-products.css';

const BUCKET = 'catalog-product-images';
const AREAS = [{ code: 'ASE', name: 'Asesoría' }, { code: 'DIS', name: 'Diseño' }, { code: 'IMP', name: 'Impresión' }, { code: 'LAS', name: 'Corte láser' }, { code: 'TAL', name: 'Taller / instalación' }, { code: 'SUB', name: 'Sublimación' }, { code: 'NEO', name: 'Neones' }, { code: 'TRO', name: 'Troquelado' }];
type DraftImage = { id: string; src: string; file?: File };
type ProductDraft = { id: string; name: string; category: string; description: string; calcType: 'unit' | 'm2'; price: string; published: boolean; route: string; images: DraftImage[] };
const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function compressedImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('El portapapeles solo admite imágenes.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d'); if (!context) throw new Error('No pude preparar la imagen.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('No pude comprimir la imagen.')), 'image/webp', 0.82));
  if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen supera el límite de almacenamiento después de comprimirla.');
  return new File([blob], `${slugify(file.name.replace(/\.[^.]+$/, '')) || 'producto'}.webp`, { type: 'image/webp' });
}

function emptyDraft(): ProductDraft { return { id: '', name: '', category: 'Personalizados estándar', description: '', calcType: 'unit', price: '', published: false, route: '', images: [] }; }

export function StandardCustomProducts({ editable, editablePrices }: { editable: boolean; editablePrices: boolean }) {
  const { organizationId, hasPermission } = useAuth();
  const { refreshRemote } = useWorkspace();
  const [products, setProducts] = useState<any[]>([]); const [templates, setTemplates] = useState<any[]>([]); const [routes, setRoutes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ProductDraft | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [query, setQuery] = useState('');
  const [templateName, setTemplateName] = useState(''); const [steps, setSteps] = useState<Array<{ area: string; title: string }>>([{ area: 'DIS', title: 'Preparar el arte' }, { area: 'IMP', title: 'Imprimir la imagen' }, { area: 'LAS', title: 'Grabar nombres y cortar el diseño' }, { area: 'TAL', title: 'Revisar y entregar' }]);
  const canEdit = editable;
  const canManageRoutes = hasPermission('sales', 'edit') && hasPermission('workshop', 'edit');
  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) return;
    const [p, t, r] = await Promise.all([
      supabase.from('catalog_products').select('id,name,slug,description,category_id,subcategory,calc_type,price,is_published,image_url,images,custom_options,product_kind').eq('organization_id', organizationId).eq('product_kind', 'standard_custom').order('name'),
      supabase.from('production_workflow_templates').select('code,name,required_fields,steps').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.from('catalog_product_workflow_routes').select('catalog_product_id,workflow_code').eq('organization_id', organizationId).eq('active', true),
    ]);
    if (p.error) { setError(p.error.message); return; }
    if (t.error) { setError(t.error.message); return; }
    if (r.error) { setError(r.error.message); return; }
    setProducts(p.data || []); setTemplates(t.data || []); setRoutes(Object.fromEntries((r.data || []).map((row) => [row.catalog_product_id, row.workflow_code])));
  }, [organizationId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const visible = useMemo(() => products.filter((p) => `${p.name} ${p.description} ${p.subcategory || p.category_id}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const openEdit = (product?: any) => {
    setError(''); setNotice('');
    setDraft(product ? { id: product.id, name: product.name, category: product.subcategory || product.category_id || 'Personalizados estándar', description: product.description || '', calcType: product.calc_type === 'm2' ? 'm2' : 'unit', price: Number(product.price) > 0 ? String(product.price) : '', published: product.is_published, route: routes[product.id] || '', images: (Array.isArray(product.images) ? product.images : []).filter(Boolean).map((src: string, i: number) => ({ id: `${product.id}-${i}`, src })) } : emptyDraft());
  };
  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
    const added = incoming.map((file) => ({ id: crypto.randomUUID(), src: URL.createObjectURL(file), file }));
    setDraft((current) => current ? { ...current, images: [...current.images, ...added].slice(0, 8) } : current);
    setError('');
  };
  const paste = (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData.items).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file && file.type.startsWith('image/')));
    if (files.length) { event.preventDefault(); event.stopPropagation(); addFiles(files); }
  };
  const uploadImages = async (images: DraftImage[], onUploaded: (path: string) => void) => {
    const output: string[] = [];
    for (const image of images) {
      if (!image.file) { output.push(image.src); continue; }
      const file = await compressedImage(image.file); const path = `${organizationId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase!.storage.from(BUCKET).upload(path, file, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
      if (uploadError) throw new Error(`No se subió una foto: ${uploadError.message}`);
      onUploaded(path);
      output.push(supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }
    return output;
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase || !organizationId || !draft) return;
    if (!draft.name.trim()) { setError('Escribe el nombre del producto.'); return; }
    if (draft.id && !editablePrices && Number(draft.price) !== Number(products.find((product) => product.id === draft.id)?.price || 0)) { setError('Tu perfil no puede cambiar tarifas del catálogo.'); return; }
    if (draft.published && !(Number(draft.price) > 0)) { setError('Configura una tarifa mayor que cero antes de publicar en la web y el cotizador.'); return; }
    if (draft.published && !hasPermission('website', 'publish_content')) { setError('Tu perfil necesita permiso de publicación web para mostrar este producto públicamente.'); return; }
    setBusy(true); setError(''); setNotice('');
    let uploadedPaths: string[] = [];
    try {
      const images = await uploadImages(draft.images, (path) => uploadedPaths.push(path)); const id = draft.id || `std-${crypto.randomUUID()}`; const slug = `${slugify(draft.name) || 'producto'}-${id.slice(-8)}`;
      const row = { id, organization_id: organizationId, name: draft.name.trim(), slug, description: draft.description.trim(), product_type: 'unit', category_id: 'Personalizados estándar', subcategory: draft.category.trim() || 'Personalizados estándar', calc_type: draft.calcType, price: Number(draft.price) || 0, price_inst: null, price_corp: null, custom_options: { standard_custom: true, configuration: draft.description.trim() }, is_published: draft.published, image_url: images[0] || null, images, product_kind: 'standard_custom', updated_at: new Date().toISOString() };
      const result = draft.id ? await supabase.from('catalog_products').update(row).eq('id', id).eq('organization_id', organizationId).select('id').maybeSingle() : await supabase.from('catalog_products').insert(row).select('id').maybeSingle();
      if (result.error) throw new Error(result.error.message); if (!result.data) throw new Error('No tienes permiso para crear o modificar productos del catálogo.');
      uploadedPaths = [];
      if (canManageRoutes && draft.route) { const { error: routeError } = await supabase.from('catalog_product_workflow_routes').upsert({ organization_id: organizationId, catalog_product_id: id, workflow_code: draft.route, active: true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,catalog_product_id' }); if (routeError) throw new Error(`Producto guardado, pero no se guardó su ruta: ${routeError.message}`); }
      else if (canManageRoutes && draft.id && routes[id]) { await supabase.from('catalog_product_workflow_routes').update({ active: false }).eq('organization_id', organizationId).eq('catalog_product_id', id); }
      const previous = products.find((product) => product.id === id)?.images || [];
      const removedPaths = previous.map((url: string) => url.split(`/storage/v1/object/public/${BUCKET}/`)[1]).filter((path: string | undefined): path is string => Boolean(path)).map(decodeURIComponent).filter((path: string) => !images.some((url) => url.endsWith(path)));
      if (removedPaths.length) await supabase.storage.from(BUCKET).remove(removedPaths);
      uploadedPaths = [];
      setNotice(draft.published ? 'Producto actualizado y visible en la web y el cotizador.' : 'Borrador guardado. Aún no aparece en canales públicos.'); setDraft(null); await refresh(); await refreshRemote();
    } catch (saveError: any) { if (uploadedPaths.length) await supabase.storage.from(BUCKET).remove(uploadedPaths); setError(saveError.message || 'No se pudo guardar el producto.'); }
    finally { setBusy(false); }
  };
  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase || !organizationId) return;
    const name = templateName.trim(); const code = `custom_${slugify(name).replace(/-/g, '_')}`.slice(0, 48);
    if (name.length < 3 || steps.length < 1 || steps.length > 16 || steps.some((s) => !s.title.trim())) { setError('Completa el nombre y al menos una etapa (máximo 16).'); return; }
    setBusy(true); setError('');
    const workflowSteps = steps.map((step, index) => ({ key: `step_${index + 1}`, area: step.area, title: step.title.trim(), depends_on: index ? [`step_${index}`] : [] }));
    const { error: templateError } = await supabase.from('production_workflow_templates').upsert({ organization_id: organizationId, code, name, required_fields: [], steps: workflowSteps, active: true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,code' });
    setBusy(false); if (templateError) { setError(templateError.message); return; }
    setTemplateName(''); setNotice('Ruta guardada. Puedes asignarla a productos estándar o a cualquier producto en Administración de rutas.'); await refresh();
  };
  return <section className="standard-products panel" aria-labelledby="standard-products-title">
    <header className="standard-products-heading"><div><span className="eyebrow">CATÁLOGO · PERSONALIZADOS</span><h2 id="standard-products-title">Productos estándar editables</h2><p>Define productos como recuerdos de acrílico, conserva su galería y asígnales una ruta de producción.</p></div>{canEdit && <button className="button button-dark" type="button" onClick={() => openEdit()}><PackagePlus size={16}/> Nuevo producto</button>}</header>
    {notice && <p className="standard-products-notice" role="status">{notice}</p>}{error && !draft && <p className="standard-products-error" role="alert">{error}</p>}
    <div className="standard-products-search"><input aria-label="Buscar productos estándar" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto estándar"/><span>{visible.length} productos</span></div>
    <div className="standard-products-list">{visible.map((product) => <article key={product.id}><img src={product.image_url || product.images?.[0] || ''} alt=""/><div><b>{product.name}</b><small>{product.subcategory || product.category_id} · {routes[product.id] ? templates.find((t) => t.code === routes[product.id])?.name || routes[product.id] : 'Ruta por definir'}</small></div><span className={product.is_published ? 'is-published' : ''}>{product.is_published ? 'Publicado' : 'Borrador'}</span>{canEdit && <button className="button button-outline" type="button" onClick={() => openEdit(product)}><Pencil size={14}/> Editar</button>}</article>)}{!visible.length && <p className="standard-products-empty">Crea aquí productos estandarizados que quieras personalizar y vender.</p>}</div>
    {canManageRoutes && <details className="standard-workflow-builder"><summary><Plus size={15}/> Crear ruta de producción por áreas</summary><p>Estas etapas se copian al trabajo que se genere desde cada venta; las tareas ya creadas conservan su secuencia.</p><form onSubmit={saveTemplate}><label>Nombre de la ruta<input required minLength={3} maxLength={100} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Recuerdo de acrílico personalizado"/></label><div className="standard-workflow-steps">{steps.map((step, index) => <div key={index}><select aria-label={`Área de etapa ${index + 1}`} value={step.area} onChange={(event) => setSteps((old) => old.map((row, i) => i === index ? { ...row, area: event.target.value } : row))}>{AREAS.map((area) => <option key={area.code} value={area.code}>{area.name}</option>)}</select><input aria-label={`Nombre de etapa ${index + 1}`} value={step.title} maxLength={140} onChange={(event) => setSteps((old) => old.map((row, i) => i === index ? { ...row, title: event.target.value } : row))}/><button type="button" aria-label={`Eliminar etapa ${index + 1}`} disabled={steps.length === 1} onClick={() => setSteps((old) => old.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>)}</div><div className="standard-workflow-actions"><button className="button button-outline" type="button" disabled={steps.length >= 16} onClick={() => setSteps((old) => [...old, { area: 'TAL', title: '' }])}><Plus size={14}/> Añadir etapa</button><button className="button button-dark" type="submit" disabled={busy}><Save size={14}/> Guardar ruta</button></div></form></details>}
    {draft && <div className="standard-product-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDraft(null); }}><form className="standard-product-editor" role="dialog" aria-modal="true" onSubmit={save} onPaste={paste} aria-labelledby="standard-product-editor-title"><header><div><span className="eyebrow">CATÁLOGO PÚBLICO</span><h3 id="standard-product-editor-title">{draft.id ? 'Editar producto estándar' : 'Nuevo producto estándar'}</h3></div><button type="button" aria-label="Cerrar" disabled={busy} onClick={() => setDraft(null)}><X size={18}/></button></header><div className="standard-product-fields"><label>Nombre<input required maxLength={140} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Recuerdo de acrílico personalizado"/></label><label>Categoría<input maxLength={90} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}/></label><label className="wide">Descripción y personalización<textarea rows={3} maxLength={1500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Foto impresa, nombres grabados y silueta cortada a láser…"/></label><label>{draft.calcType === 'm2' ? 'Precio por m² USD' : 'Precio por unidad USD'}<input type="number" min="0" step="0.01" disabled={Boolean(draft.id && !editablePrices)} value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="Configura antes de publicar"/></label><label>Cálculo<select value={draft.calcType} onChange={(event) => setDraft({ ...draft, calcType: event.target.value as ProductDraft['calcType'] })}><option value="unit">Por unidad / cantidad</option><option value="m2">Por m²</option></select></label><label>Ruta predeterminada<select disabled={!canManageRoutes} value={draft.route} onChange={(event) => setDraft({ ...draft, route: event.target.value })}><option value="">Asesoría define la ruta</option>{templates.map((template) => <option key={template.code} value={template.code}>{template.name}</option>)}</select><small>Para asignar rutas necesitas permisos de Ventas y Taller.</small></label><label className="standard-publish"><input type="checkbox" checked={draft.published} onChange={(event) => setDraft({ ...draft, published: event.target.checked })}/><span><b>Publicar en sitio web y cotizador</b><small>Al marcarlo se usará el precio configurado en ambos canales.</small></span></label></div><div className="standard-image-drop" tabIndex={0} onPaste={paste} onClick={() => document.getElementById('standard-product-file-input')?.click()}><ImagePlus size={19}/><b>Portada y galería</b><span><ClipboardPaste size={13}/> Pega imágenes con Ctrl + V, o selecciona varios archivos</span><input id="standard-product-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onClick={(event) => event.stopPropagation()} onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ''; }}/></div><div className="standard-image-grid">{draft.images.map((image, index) => <figure key={image.id}><img src={image.src} alt={`Imagen ${index + 1}`}/><figcaption><button type="button" className={index === 0 ? 'cover' : ''} onClick={() => setDraft((current) => current ? { ...current, images: [image, ...current.images.filter((row) => row.id !== image.id)] } : current)}>{index === 0 ? 'Portada' : 'Usar de portada'}</button><button type="button" aria-label={`Quitar imagen ${index + 1}`} onClick={() => setDraft((current) => { const removed = current?.images.find((row) => row.id === image.id); if (removed?.file) URL.revokeObjectURL(removed.src); return current ? { ...current, images: current.images.filter((row) => row.id !== image.id) } : current; })}><Trash2 size={13}/></button></figcaption></figure>)}</div>{error && <p className="standard-products-error" role="alert">{error}</p>}<footer><span><Upload size={13}/> Se comprimen y almacenan en el bucket gratuito del catálogo.</span><button className="button button-dark" type="submit" disabled={busy}><Save size={15}/>{busy ? 'Guardando…' : draft.published ? 'Guardar y publicar' : 'Guardar borrador'}</button></footer></form></div>}
  </section>;
}
