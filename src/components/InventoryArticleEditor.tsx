import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Boxes, Check, ChevronDown, ClipboardPaste, Image as ImageIcon, MapPin, Package, Trash2, Upload, X } from 'lucide-react';
import type { InventorySpecificationDraft } from './InventorySpecificationFields';
import { InventorySpecificationFields } from './InventorySpecificationFields';
import { InventoryOptionPicker } from './InventoryOptionPicker';
import { AnimatedList } from './ui/MagicComponents';
import './InventoryArticleEditor.css';

type ReferenceImage = { path: string; label: string; series?: string };
type ReferenceProduct = { id: string; name: string; images: ReferenceImage[] };
type ArticleSource = {
  id: string;
  remoteItemId: string;
  variantId: string;
  name: string;
  sku?: string;
  variantSku?: string;
  variant?: string;
  description?: string;
  branch?: string;
  branchId?: string | null;
  sourceStatus?: string | null;
  quantity?: number;
  unit?: string;
};
type Draft = {
  remoteItemId: string;
  variantId: string;
  description: string;
  itemType: string;
  tags: string;
  referenceImageUrl: string;
  referenceImageFile?: File | null;
  customFields: Record<string, unknown>;
  brandScope: string;
  variantAttributes: InventorySpecificationDraft & Record<string, unknown>;
  sourceItem: ArticleSource;
};

type Props = {
  value: Draft;
  saving: boolean;
  onChange: (value: Draft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (item: ArticleSource, confirmed?: boolean) => void;
  onAssignBranch: (item: ArticleSource, branchName: string) => void;
  onTransfer: (item: ArticleSource, branchName: string) => void;
  branches: string[];
  libraryProducts: ReferenceProduct[];
  libraryCount: number;
  itemTypeOptions: string[];
  tagOptions: string[];
};

const stringValue = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value);
const referenceImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function imagesFromClipboard(clipboardData: DataTransfer): File[] {
  const directFiles = Array.from(clipboardData.files || []).filter((file) => referenceImageTypes.has(file.type));
  if (directFiles.length) return directFiles;
  return Array.from(clipboardData.items || []).filter((item) => referenceImageTypes.has(item.type)).map((item, index) => {
    const blob = item.getAsFile();
    return blob ? new File([blob], `inventario-portapapeles-${Date.now()}-${index + 1}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type, lastModified: Date.now() }) : null;
  }).filter((file): file is File => Boolean(file));
}

async function readClipboardImage(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const [index, item] of items.entries()) {
      const type = item.types.find((candidate) => referenceImageTypes.has(candidate));
      if (!type) continue;
      const blob = await item.getType(type);
      return new File([blob], `inventario-portapapeles-${Date.now()}-${index + 1}.${type.split('/')[1]}`, { type, lastModified: Date.now() });
    }
  } catch { /* El navegador puede exigir pegar con Ctrl+V en la zona enfocada. */ }
  return null;
}

export function InventoryArticleEditor({ value, saving, onChange, onClose, onSave, onDelete, onAssignBranch, onTransfer, branches, libraryProducts, libraryCount, itemTypeOptions, tagOptions }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTerm, setLibraryTerm] = useState('');
  const [branchSelection, setBranchSelection] = useState(value.sourceItem?.branch || '');
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageFeedback, setImageFeedback] = useState('');
  const [draggingImage, setDraggingImage] = useState(false);

  useEffect(() => {
    setBranchSelection(value.sourceItem?.branch || '');
    setDeleteRequested(false);
    setLibraryOpen(false);
    setLibraryTerm('');
  }, [value.remoteItemId, value.variantId]);

  useEffect(() => {
    if (!value.referenceImageFile) { setImagePreviewUrl(''); return; }
    const previewUrl = URL.createObjectURL(value.referenceImageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [value.referenceImageFile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) { if (libraryOpen) setLibraryOpen(false); else onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [libraryOpen, onClose, saving]);

  const update = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  const patchCustom = (key: string, next: string) => update({ customFields: { ...(value.customFields || {}), [key]: next } });
  const patchSpec = (patch: InventorySpecificationDraft) => update({ variantAttributes: { ...(value.variantAttributes || {}), ...patch } });
  const sourceItem = value.sourceItem;
  const hasCountedStock = Boolean(sourceItem?.branchId && !sourceItem.sourceStatus);
  const filteredProducts = libraryProducts.filter((product) => `${product.name} ${product.images.map((image) => image.label).join(' ')}`.toLocaleLowerCase('es').includes(libraryTerm.trim().toLocaleLowerCase('es')));
  const currentImage = libraryProducts.flatMap((product) => product.images).find((image) => image.path === value.referenceImageUrl);
  const selectedTags = value.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  const imageSource = imagePreviewUrl || value.referenceImageUrl;
  const addReferenceImage = (files: File[]) => {
    if (saving) return;
    const image = files.find((file) => referenceImageTypes.has(file.type));
    if (!image) { setImageFeedback('Elige o copia una imagen PNG, JPG o WebP.'); return; }
    if (image.size > 80 * 1024 * 1024) { setImageFeedback('La imagen supera 80 MB. Reduce su tamaño antes de añadirla.'); return; }
    update({ referenceImageFile: image, referenceImageUrl: '' });
    setImageFeedback('Vista previa lista. Guarda la ficha para subir la imagen.');
  };
  const handleImagePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (saving) return;
    const files = imagesFromClipboard(event.clipboardData);
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation(); addReferenceImage(files);
  };
  const pasteFromSystemClipboard = async () => {
    if (saving) return;
    setImageFeedback('');
    const image = await readClipboardImage();
    if (image) { addReferenceImage([image]); return; }
    setImageFeedback(navigator.clipboard?.read ? 'No se encontró una imagen. Copia una captura o imagen y prueba Ctrl + V.' : 'Haz clic en esta zona y pega con Ctrl + V.');
  };

  return <div className="inventory-modal-backdrop inventory-editor-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget && !libraryOpen) onClose(); }}>
    <form className="inventory-article-editor" onSubmit={onSave} role="dialog" aria-modal="true" aria-labelledby="inventory-editor-title" aria-describedby="inventory-editor-description">
      <header className="inventory-editor-header">
        <div className="inventory-editor-hero-icon"><Package size={19}/></div>
        <div className="inventory-editor-heading">
          <span className="eyebrow">FICHA DE INVENTARIO</span>
          <h2 id="inventory-editor-title">{sourceItem?.name || 'Editar artículo'}</h2>
          <p id="inventory-editor-description">Organiza los datos del producto. El stock se controla por sucursal y conserva su historial.</p>
          <div className="inventory-editor-identifiers"><span>{sourceItem?.sku || 'Código pendiente'}</span>{sourceItem?.variant && <span>{sourceItem.variant}</span>}<span className={`inventory-editor-stock-state${sourceItem?.sourceStatus ? ' is-pending' : ''}`}>{sourceItem?.sourceStatus ? 'Conteo pendiente' : `${sourceItem?.quantity ?? 0} ${sourceItem?.unit || 'unidades'} contadas`}</span></div>
        </div>
        <button className="icon-button inventory-editor-close" type="button" aria-label="Cerrar ficha" disabled={saving} onClick={onClose}><X size={18}/></button>
      </header>

      <div className="inventory-editor-content">
        <AnimatedList className="inventory-editor-sections" itemClassName="inventory-editor-section-wrap" stagger={0.035}>
          <section className="inventory-editor-section">
            <div className="inventory-editor-section-title"><span className="inventory-editor-section-icon"><Package size={16}/></span><div><h3>Identificación</h3><p>Clasifica el artículo para encontrarlo con rapidez.</p></div></div>
            <div className="inventory-editor-grid">
              <InventoryOptionPicker autoFocus label="Tipo de artículo" mode="single" value={value.itemType} options={itemTypeOptions} placeholder="Selecciona un tipo" helpText="Busca un tipo existente o elige “Escribir” para agregar otro." onChange={(next) => update({ itemType: String(next) })}/>
              <label className="inventory-editor-wide">Descripción<textarea rows={3} value={value.description || ''} onChange={(event) => update({ description: event.target.value })} placeholder="Detalle del artículo, uso o notas para el equipo"/><small>Esta información se muestra dentro de la ficha, no en la tarjeta del catálogo.</small></label>
              <InventoryOptionPicker className="inventory-editor-wide" label="Etiquetas" mode="multiple" value={selectedTags} options={tagOptions} placeholder="Busca y selecciona etiquetas" helpText="Puedes combinar sugerencias o escribir hasta 40 etiquetas." onChange={(next) => update({ tags: (Array.isArray(next) ? next : [next]).join(', ') })}/>
            </div>
          </section>

          <section className="inventory-editor-section">
            <div className="inventory-editor-section-title"><span className="inventory-editor-section-icon"><Boxes size={16}/></span><div><h3>Medidas y características</h3><p>Registra solo las especificaciones que correspondan al producto.</p></div></div>
            <InventorySpecificationFields idPrefix="edit-inventory" value={value.variantAttributes || {}} onChange={patchSpec}/>
          </section>

          <section className="inventory-editor-section">
            <div className="inventory-editor-section-title"><span className="inventory-editor-section-icon"><ImageIcon size={16}/></span><div><h3>Imagen de referencia</h3><p>Elige una foto de la biblioteca o añade una desde tu equipo o portapapeles.</p></div><span className="inventory-editor-library-count">{libraryCount} imágenes · {libraryProducts.length} productos</span></div>
            <div className={`inventory-editor-image-zone${draggingImage ? ' is-dragging' : ''}`} tabIndex={0} role="group" aria-label="Imagen de referencia" onPaste={handleImagePaste} onDragOver={(event) => { event.preventDefault(); setDraggingImage(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImage(false); }} onDrop={(event) => { event.preventDefault(); setDraggingImage(false); addReferenceImage(Array.from(event.dataTransfer.files)); }}>
              {imageSource ? <div className="inventory-editor-current-image"><img src={imageSource} alt={`Referencia de ${sourceItem?.name || 'artículo'}`}/><div><b>{value.referenceImageFile ? 'Imagen lista para subir' : currentImage?.label || 'Imagen seleccionada'}</b><small>{value.referenceImageFile ? value.referenceImageFile.name : currentImage?.series || 'Referencia visual · no confirma marca ni existencias'}</small></div></div> : <div className="inventory-editor-image-empty"><ImageIcon size={19}/><span>Sin imagen seleccionada</span></div>}
            <div className="inventory-editor-image-actions"><input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={saving} onChange={(event) => { if (event.currentTarget.files) addReferenceImage(Array.from(event.currentTarget.files)); event.currentTarget.value = ''; }}/><button type="button" className="button button-outline" disabled={saving} onClick={() => imageInputRef.current?.click()}><Upload size={14}/>{imageSource ? 'Subir otra' : 'Subir imagen'}</button><button type="button" className="button button-outline" disabled={saving} onClick={() => { void pasteFromSystemClipboard(); }}><ClipboardPaste size={14}/>{imageSource ? 'Pegar otra' : 'Pegar imagen'}</button>{imageSource && <button type="button" className="inventory-editor-clear-image" disabled={saving} onClick={() => { update({ referenceImageUrl: '', referenceImageFile: null }); setImageFeedback('Imagen quitada de la ficha.'); }}>Quitar imagen</button>}</div>
              {imageFeedback && <small className="inventory-editor-image-feedback" role="status">{imageFeedback}</small>}
              <span className="inventory-editor-image-hint">También puedes pegar con Ctrl + V aquí o arrastrar una imagen. · PNG, JPG o WebP · Máximo 5 MB al guardar.</span>
            </div>
            <button type="button" className="inventory-editor-library-toggle" aria-expanded={libraryOpen} onClick={() => { setLibraryOpen((current) => !current); setLibraryTerm(''); }}><ImageIcon size={15}/>{libraryOpen ? 'Cerrar biblioteca de imágenes' : 'Buscar en la biblioteca'}<ChevronDown size={14} className={libraryOpen ? 'is-open' : ''}/></button>
            {libraryOpen && <div className="inventory-editor-library"><label className="inventory-editor-search"><ImageIcon size={15}/><input autoFocus value={libraryTerm} onChange={(event) => setLibraryTerm(event.target.value)} placeholder="Buscar papel, tinta, vinil…"/><span>{filteredProducts.length} productos</span></label><div className="inventory-editor-library-list">{filteredProducts.map((product) => <article key={product.id}><h4>{product.name}<small>{product.images.length} imágenes</small></h4><div className="inventory-editor-image-options">{product.images.map((image) => <button type="button" key={image.path} aria-label={`Usar imagen ${image.label} de ${product.name}`} className={value.referenceImageUrl === image.path ? 'is-selected' : ''} onClick={() => { update({ referenceImageUrl: image.path, referenceImageFile: null }); setImageFeedback('Imagen de la biblioteca seleccionada.'); setLibraryOpen(false); }}><img src={image.path} alt="" loading="lazy"/><span>{image.label}</span>{value.referenceImageUrl === image.path && <i><Check size={13}/></i>}</button>)}</div></article>)}{!filteredProducts.length && <p className="inventory-editor-library-empty">No hay coincidencias. Prueba otra palabra.</p>}</div></div>}
          </section>

          <section className="inventory-editor-section">
            <div className="inventory-editor-section-title"><span className="inventory-editor-section-icon"><MapPin size={16}/></span><div><h3>Sucursal y existencias</h3><p>Asigna el artículo o registra un traspaso con su responsable.</p></div></div>
            <div className="inventory-editor-branch-card"><div className="inventory-editor-branch-current"><span className="inventory-editor-branch-pin"><MapPin size={16}/></span><div><small>SUCURSAL ACTUAL</small><b>{sourceItem?.branch || 'Pendiente de asignar'}</b><span>{hasCountedStock ? `${sourceItem?.quantity ?? 0} ${sourceItem?.unit || 'unidades'} registradas` : 'Sin conteo físico confirmado'}</span></div></div><div className="inventory-editor-branch-controls"><label>{sourceItem?.branchId && hasCountedStock ? 'Destino del traspaso' : sourceItem?.branchId ? 'Sucursal del conteo pendiente' : 'Asignar sucursal'}<select value={branchSelection} onChange={(event) => setBranchSelection(event.target.value)}><option value="">Selecciona una sucursal</option>{branches.filter((name) => !hasCountedStock || name !== sourceItem?.branch).map((name) => <option key={name} value={name}>{name}</option>)}</select></label>{hasCountedStock ? <button type="button" className="button button-outline" disabled={!branchSelection || branchSelection === sourceItem?.branch} onClick={() => onTransfer(sourceItem, branchSelection)}><ArrowLeftRight size={15}/>Preparar traspaso</button> : <button type="button" className="button button-outline" disabled={!branchSelection || branchSelection === sourceItem?.branch} onClick={() => onAssignBranch(sourceItem, branchSelection)}><MapPin size={15}/>{sourceItem?.branchId ? 'Cambiar sucursal' : 'Asignar sucursal'}</button>}</div><p className="inventory-editor-branch-note">{hasCountedStock ? 'El traspaso solicita cantidad, responsable y motivo. El historial queda registrado.' : 'La asignación no crea saldo. El artículo seguirá pendiente hasta contar sus existencias.'}</p></div>
          </section>

          <section className="inventory-editor-section">
            <div className="inventory-editor-section-title"><span className="inventory-editor-section-icon"><Boxes size={16}/></span><div><h3>Información de compra</h3><p>Datos de referencia para que el equipo pueda reponerlo.</p></div></div>
            <div className="inventory-editor-grid">
              <label>Proveedor de referencia<input value={stringValue(value.customFields?.preferred_supplier)} onChange={(event) => patchCustom('preferred_supplier', event.target.value)} placeholder="Nombre del proveedor"/></label>
              <label className="inventory-editor-wide">Nota de compra<textarea rows={2} value={stringValue(value.customFields?.purchase_notes)} onChange={(event) => patchCustom('purchase_notes', event.target.value)} placeholder="Presentación, empaque o detalle útil para reponerlo"/></label>
            </div>
          </section>
        </AnimatedList>

        <details className="inventory-editor-help"><summary>¿Qué ocurre al guardar?</summary><p>Se actualizan la ficha y sus especificaciones. El conteo físico solo cambia cuando alguien registra un conteo o movimiento autorizado.</p></details>
        {deleteRequested && <div className="inventory-editor-delete-confirm" role="alert"><Trash2 size={16}/><span><b>¿Retirar este artículo del catálogo activo?</b><small>Se conservarán conteos, movimientos y registros vinculados para auditoría.</small></span><button type="button" className="button button-danger" disabled={saving} onClick={() => onDelete(sourceItem, true)}>Sí, eliminar</button><button type="button" className="button button-outline" disabled={saving} onClick={() => setDeleteRequested(false)}>Cancelar</button></div>}
      </div>

      <footer className="inventory-editor-footer">
        <button type="button" className="inventory-editor-delete-link" onClick={() => setDeleteRequested(true)}><Trash2 size={14}/>Eliminar del catálogo</button>
        <span>Las existencias y el historial se conservan.</span>
        <div><button type="button" className="button button-outline" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="button button-dark" disabled={saving}><Check size={15}/>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>
      </footer>
    </form>
  </div>;
}
