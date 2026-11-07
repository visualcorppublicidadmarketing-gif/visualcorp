import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Copy,
  DollarSign,
  Image as ImageIcon,
  Layers,
  MapPin,
  Package,
  PackageMinus,
  PackagePlus,
  Ruler,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { InventorySpecificationDraft } from './InventorySpecificationFields';
import { InventorySpecificationFields } from './InventorySpecificationFields';
import { InventoryOptionPicker } from './InventoryOptionPicker';
import { InventoryProductImageGallery } from './InventoryProductImageGallery';
import type { InventoryGalleryImage } from './inventoryImageUtils';
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
  area?: string;
  sourceStatus?: string | null;
  referenceImageStoragePath?: string | null;
  productImages?: Array<{ path: string; storagePath?: string | null; url: string; label?: string }>;
  quantity?: number;
  availableQuantity?: number | null;
  reservedQuantity?: number | null;
  minimum?: number;
  unitCost?: number | null;
  supplierName?: string | null;
  unit?: string;
};
type Draft = {
  remoteItemId: string;
  variantId: string;
  name: string;
  category: string;
  variant: string;
  minimum: string;
  description: string;
  itemType: string;
  tags: string;
  referenceImageUrl: string;
  productImages: InventoryGalleryImage[];
  customFields: Record<string, unknown>;
  brandScope: string;
  variantAttributes: InventorySpecificationDraft & Record<string, unknown>;
  sourceItem: ArticleSource;
};

type EditorSectionFilter = 'all' | 'identity' | 'specs' | 'media' | 'stock' | 'purchase';

const QUICK_CATEGORY_PRESETS = [
  'Lonas y Viniles',
  'Tintas e Insumos',
  'Sustratos Rígidos',
  'Sublimación y Textil',
  'Displays y Estructuras',
  'Acabados y Ojales',
  'Papelería e Imprenta',
];

type Props = {
  value: Draft;
  saving: boolean;
  onChange: (value: Draft) => void;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (item: ArticleSource, confirmed?: boolean) => void;
  onAssignBranch: (item: ArticleSource, branchName: string) => void;
  onTransfer: (item: ArticleSource, branchName: string) => void;
  onMovement?: (item: any, type: string) => void;
  onCost?: (item: any) => void;
  canSeeCosts?: boolean;
  canEditCosts?: boolean;
  formatMoney?: (val: number) => string;
  branches: string[];
  libraryProducts: ReferenceProduct[];
  libraryCount: number;
  itemTypeOptions: string[];
  tagOptions: string[];
  specificationOptions: Partial<Record<'finish' | 'color' | 'purchase_unit' | 'material', string[]>>;
};

const stringValue = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const makeKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function InventoryArticleEditor({
  value,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
  onAssignBranch,
  onTransfer,
  onMovement,
  onCost,
  canSeeCosts = false,
  canEditCosts = false,
  formatMoney,
  branches,
  libraryProducts,
  libraryCount,
  itemTypeOptions,
  tagOptions,
  specificationOptions,
}: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTerm, setLibraryTerm] = useState('');
  const [branchSelection, setBranchSelection] = useState(value.sourceItem?.branch || '');
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionFilter>('all');
  const [copiedSku, setCopiedSku] = useState(false);

  useEffect(() => {
    setBranchSelection(value.sourceItem?.branch || '');
    setDeleteRequested(false);
    setLibraryOpen(false);
    setLibraryTerm('');
    setActiveSection('all');
  }, [value.remoteItemId, value.variantId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        if (libraryOpen) setLibraryOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [libraryOpen, onClose, saving]);

  const update = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  const patchCustom = (key: string, next: string) => update({ customFields: { ...(value.customFields || {}), [key]: next } });
  const patchSpec = (patch: InventorySpecificationDraft) => update({ variantAttributes: { ...(value.variantAttributes || {}), ...patch } });
  const sourceItem = value.sourceItem;
  const hasCountedStock = Boolean(sourceItem?.branchId && !sourceItem.sourceStatus);
  const filteredProducts = libraryProducts.filter((product) =>
    `${product.name} ${product.images.map((image) => image.label).join(' ')}`.toLocaleLowerCase('es').includes(libraryTerm.trim().toLocaleLowerCase('es')),
  );
  const currentImage = libraryProducts.flatMap((product) => product.images).find((image) => image.path === value.referenceImageUrl);
  const selectedTags = value.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  const galleryImages = value.productImages?.length
    ? value.productImages
    : value.referenceImageUrl
      ? [
          {
            key: `legacy-${sourceItem?.remoteItemId || 'item'}`,
            src: value.referenceImageUrl,
            path: sourceItem?.referenceImageStoragePath || value.referenceImageUrl,
            label: currentImage?.label || 'Imagen de referencia',
          },
        ]
      : [];

  const skuDisplay = sourceItem?.sku || sourceItem?.variantSku || 'Código pendiente';
  const handleCopySku = async () => {
    if (!sourceItem?.sku && !sourceItem?.variantSku) return;
    try {
      await navigator.clipboard.writeText(skuDisplay);
      setCopiedSku(true);
      setTimeout(() => setCopiedSku(false), 1800);
    } catch {
      // ignore clipboard restriction
    }
  };

  // Semiotic Stock Health Metrics
  const isUncounted = Boolean(sourceItem?.sourceStatus || !sourceItem?.branchId);
  const qty = Number(sourceItem?.quantity ?? 0);
  const reserved = Number(sourceItem?.reservedQuantity ?? 0);
  const available = Number(sourceItem?.availableQuantity ?? Math.max(0, qty - reserved));
  const minQty = Number(value.minimum ?? sourceItem?.minimum ?? 0);
  const unitLabel = sourceItem?.unit || 'unidades';

  const stockTone: 'pending' | 'danger' | 'warning' | 'ok' = isUncounted
    ? 'pending'
    : qty <= 0
      ? 'danger'
      : available <= minQty
        ? 'warning'
        : 'ok';

  const stockStateLabel = isUncounted
    ? 'Conteo físico pendiente'
    : qty <= 0
      ? 'Agotado en bodega'
      : available <= minQty
        ? 'Reponer pronto (bajo mínimo)'
        : 'En stock óptimo';

  const stockBarPct = isUncounted
    ? 0
    : qty <= 0
      ? 5
      : minQty > 0
        ? Math.min(100, Math.max(12, Math.round((available / (minQty * 2)) * 100)))
        : 100;

  // Completeness / Ficha Quality Checklist
  const readiness = useMemo(() => {
    const specs = value.variantAttributes || {};
    const custom = value.customFields || {};
    const hasIdentity = Boolean(value.name.trim() && value.category.trim() && value.itemType.trim());
    const hasSpecs = Boolean(
      value.variant.trim() ||
        value.description.trim() ||
        Object.entries(specs).some(([k, v]) => k !== 'purchase_unit' && String(v || '').trim() !== ''),
    );
    const hasMedia = galleryImages.length > 0;
    const hasStock = hasCountedStock;
    const hasPurchase = Boolean(
      String(specs.purchase_unit || '').trim() ||
        String(custom.preferred_supplier || '').trim() ||
        String(custom.purchase_notes || '').trim() ||
        sourceItem?.unitCost != null,
    );

    const steps: Array<{ id: EditorSectionFilter; label: string; done: boolean }> = [
      { id: 'identity', label: 'Identificación', done: hasIdentity },
      { id: 'specs', label: 'Medidas y ficha', done: hasSpecs },
      { id: 'media', label: 'Imagen', done: hasMedia },
      { id: 'stock', label: 'Stock contado', done: hasStock },
      { id: 'purchase', label: 'Datos de compra', done: hasPurchase },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    return {
      steps,
      doneCount,
      total: steps.length,
      pct: Math.round((doneCount / steps.length) * 100),
    };
  }, [value, galleryImages.length, hasCountedStock, sourceItem?.unitCost]);

  const navTabs: Array<{ id: EditorSectionFilter; label: string; Icon: typeof Package; badge?: number }> = [
    { id: 'all', label: 'Ficha completa', Icon: Layers },
    { id: 'identity', label: 'Identificación', Icon: Tag },
    { id: 'specs', label: 'Medidas y ficha', Icon: Ruler },
    { id: 'media', label: 'Imágenes', Icon: ImageIcon, badge: galleryImages.length },
    { id: 'stock', label: 'Sucursal y stock', Icon: MapPin },
    { id: 'purchase', label: 'Compra', Icon: ShoppingBag },
  ];

  const isVisible = (section: EditorSectionFilter) => activeSection === 'all' || activeSection === section;

  return (
    <div
      className="inventory-modal-backdrop inventory-editor-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget && !libraryOpen) onClose();
      }}
    >
      <form
        className="inventory-article-editor"
        onSubmit={onSave}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-editor-title"
        aria-describedby="inventory-editor-description"
      >
        <header className="inventory-editor-header">
          <div className={`inventory-editor-hero-icon ${galleryImages[0]?.src ? 'has-thumb' : ''}`}>
            {galleryImages[0]?.src ? (
              <>
                <img src={galleryImages[0].src} alt={value.name || 'Referencia del artículo'} />
                <span className="inventory-editor-thumb-badge">{galleryImages.length}</span>
              </>
            ) : (
              <Package size={20} />
            )}
          </div>
          <div className="inventory-editor-heading">
            <div className="inventory-editor-eyebrow-row">
              <span className="eyebrow">FICHA MAESTRA DE INVENTARIO</span>
              <span className="inventory-editor-brand-pill">
                {value.brandScope === 'giga' ? 'GigaPrint' : value.brandScope === 'general' ? 'General · Compartido' : 'Visual Corp'}
              </span>
              {sourceItem?.area && (
                <span className="inventory-editor-area-pill">
                  <Building2 size={11} /> {sourceItem.area}
                </span>
              )}
            </div>
            <h2 id="inventory-editor-title">{value.name || 'Editar artículo'}</h2>
            <p id="inventory-editor-description">
              Organiza identidad, ficha técnica, galería de referencia y abastecimiento. El stock se controla por sucursal con trazabilidad completa.
            </p>
            <div className="inventory-editor-identifiers">
              <button
                type="button"
                className={`inventory-editor-sku-btn ${copiedSku ? 'is-copied' : ''}`}
                onClick={() => void handleCopySku()}
                title="Copiar código SKU al portapapeles"
              >
                <code>{skuDisplay}</code>
                {copiedSku ? <Check size={12} /> : <Copy size={12} />}
                <small>{copiedSku ? 'Copiado' : 'Copiar'}</small>
              </button>
              {value.variant && <span className="inventory-editor-variant-chip">{value.variant}</span>}
              <span className={`inventory-editor-stock-state is-${stockTone}`}>
                {stockStateLabel}
              </span>
            </div>
          </div>
          <button
            className="icon-button inventory-editor-close"
            type="button"
            aria-label="Cerrar ficha"
            disabled={saving}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        {/* Semiotic Stock Health & Completeness Strip */}
        <div className="inventory-editor-semiotic-strip">
          <div className={`inventory-editor-health-card is-${stockTone}`}>
            <div className="inventory-editor-health-top">
              <div>
                <span className="inventory-editor-health-eyebrow">SALUD DE EXISTENCIAS EN SUCURSAL</span>
                <strong>
                  {isUncounted
                    ? 'Pendiente de conteo físico'
                    : `${available} ${unitLabel} disponibles para uso o venta`}
                </strong>
              </div>
              <div className="inventory-editor-health-metrics">
                <div>
                  <small>Físico</small>
                  <b>{isUncounted ? '—' : `${qty} ${unitLabel}`}</b>
                </div>
                <div>
                  <small>Reservado</small>
                  <b>{isUncounted ? '—' : `${reserved} ${unitLabel}`}</b>
                </div>
                <div>
                  <small>Mínimo</small>
                  <b>{minQty} {unitLabel}</b>
                </div>
                {canSeeCosts && (
                  <div>
                    <small>Costo unit.</small>
                    <b>
                      {sourceItem?.unitCost != null && formatMoney
                        ? formatMoney(sourceItem.unitCost)
                        : 'Sin registrar'}
                    </b>
                  </div>
                )}
              </div>
            </div>
            <div
              className="inventory-editor-health-bar"
              role="progressbar"
              aria-label="Nivel de stock frente al mínimo de reposición"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stockBarPct}
            >
              <i className={`is-${stockTone}`} style={{ width: `${stockBarPct}%` }} />
            </div>
          </div>

          <div className="inventory-editor-readiness-card">
            <div className="inventory-editor-readiness-head">
              <span>
                <Sparkles size={13} /> Integridad de la ficha
              </span>
              <b>
                {readiness.doneCount}/{readiness.total} ({readiness.pct}%)
              </b>
            </div>
            <div className="inventory-editor-readiness-pills">
              {readiness.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  className={`inventory-editor-readiness-pill ${step.done ? 'is-done' : 'is-pending'} ${activeSection === step.id ? 'is-active' : ''}`}
                  onClick={() => setActiveSection(activeSection === step.id ? 'all' : step.id)}
                  title={`Enfocar sección: ${step.label}`}
                >
                  {step.done ? <CheckCircle2 size={12} /> : <ClipboardList size={12} />}
                  <span>{step.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Section Filter Bar */}
        <nav className="inventory-editor-section-nav" aria-label="Navegación rápida de secciones">
          {navTabs.map(({ id, label, Icon, badge }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? 'is-active' : ''}
              aria-pressed={activeSection === id}
              onClick={() => setActiveSection(id)}
            >
              <Icon size={14} />
              <span>{label}</span>
              {badge !== undefined && <b>{badge}</b>}
            </button>
          ))}
        </nav>

        <div className="inventory-editor-content">
          <AnimatedList className="inventory-editor-sections" itemClassName="inventory-editor-section-wrap" stagger={0.035}>
            {isVisible('identity') && (
              <section className="inventory-editor-section">
                <div className="inventory-editor-section-title">
                  <span className="inventory-editor-section-icon">
                    <Package size={16} />
                  </span>
                  <div>
                    <h3>Identificación y clasificación</h3>
                    <p>Clasifica el artículo por nombre, marca, categoría y etiquetas para encontrarlo al instante.</p>
                  </div>
                </div>
                <div className="inventory-editor-grid">
                  <label>
                    Nombre del producto
                    <input
                      autoFocus
                      required
                      maxLength={160}
                      value={value.name}
                      onChange={(event) => update({ name: event.target.value })}
                      placeholder="Nombre visible en el catálogo"
                    />
                  </label>
                  <label>
                    Inventario de marca
                    <select
                      value={value.brandScope || 'visual'}
                      onChange={(event) => update({ brandScope: event.target.value })}
                    >
                      <option value="visual">Visual Corp (Exclusivo)</option>
                      <option value="giga">GigaPrint (Exclusivo)</option>
                      <option value="general">General / Compartido (Ambas marcas)</option>
                    </select>
                  </label>
                  <label className="inventory-editor-wide">
                    Categoría
                    <input
                      maxLength={100}
                      value={value.category}
                      onChange={(event) => update({ category: event.target.value })}
                      placeholder="Ej. Lonas y Viniles, Tintas e Insumos, Sustratos Rígidos"
                    />
                    <div className="inventory-editor-preset-chips" aria-label="Categorías sugeridas">
                      {QUICK_CATEGORY_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={value.category === preset ? 'is-active' : ''}
                          onClick={() => update({ category: preset })}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label>
                    Variante
                    <input
                      maxLength={160}
                      value={value.variant}
                      onChange={(event) => update({ variant: event.target.value })}
                      placeholder="Color, medida o presentación"
                    />
                    <small>Solo cambia esta variante; el código de variante se conserva.</small>
                  </label>
                  <label>
                    Mínimo para reponer
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      required
                      value={value.minimum}
                      onChange={(event) => update({ minimum: event.target.value })}
                      placeholder="0"
                    />
                    <small>Alerta cuando las existencias lleguen a este nivel; no cambia el stock.</small>
                  </label>
                  <InventoryOptionPicker
                    label="Tipo de artículo"
                    mode="single"
                    value={value.itemType}
                    options={itemTypeOptions}
                    placeholder="Selecciona un tipo"
                    helpText="Busca un tipo existente o elige “Escribir” para agregar otro."
                    onChange={(next) => update({ itemType: String(next) })}
                  />
                  <label className="inventory-editor-wide">
                    Descripción y notas técnicas
                    <textarea
                      rows={3}
                      value={value.description || ''}
                      onChange={(event) => update({ description: event.target.value })}
                      placeholder="Detalle del artículo, uso en taller, perfil de color o notas para el equipo"
                    />
                    <small>Esta información se muestra dentro de la ficha, no en la tarjeta del catálogo.</small>
                  </label>
                  <InventoryOptionPicker
                    className="inventory-editor-wide"
                    label="Etiquetas"
                    mode="multiple"
                    value={selectedTags}
                    options={tagOptions}
                    placeholder="Busca y selecciona etiquetas"
                    helpText="Puedes combinar sugerencias o escribir hasta 40 etiquetas."
                    onChange={(next) => update({ tags: (Array.isArray(next) ? next : [next]).join(', ') })}
                  />
                  <p className="inventory-editor-wide inventory-editor-identity-note">
                    El nombre y la categoría se comparten entre las variantes y sucursales de esta ficha. El SKU y la unidad base se conservan para proteger sus movimientos e historial.
                  </p>
                </div>
              </section>
            )}

            {isVisible('specs') && (
              <section className="inventory-editor-section">
                <div className="inventory-editor-section-title">
                  <span className="inventory-editor-section-icon">
                    <Boxes size={16} />
                  </span>
                  <div>
                    <h3>Medidas y características</h3>
                    <p>Registra solo las especificaciones que correspondan al producto.</p>
                  </div>
                </div>
                <InventorySpecificationFields
                  idPrefix="edit-inventory"
                  value={value.variantAttributes || {}}
                  onChange={patchSpec}
                  options={specificationOptions}
                />
              </section>
            )}

            {isVisible('media') && (
              <section className="inventory-editor-section">
                <div className="inventory-editor-section-title">
                  <span className="inventory-editor-section-icon">
                    <ImageIcon size={16} />
                  </span>
                  <div>
                    <h3>Imagen de referencia</h3>
                    <p>Elige una foto de la biblioteca o añade una desde tu equipo o portapapeles.</p>
                  </div>
                  <span className="inventory-editor-library-count">
                    {libraryCount} imágenes · {libraryProducts.length} productos
                  </span>
                </div>
                <InventoryProductImageGallery
                  images={galleryImages}
                  disabled={saving}
                  onChange={(productImages) => update({ productImages })}
                />
                <button
                  type="button"
                  className="inventory-editor-library-toggle"
                  aria-expanded={libraryOpen}
                  onClick={() => {
                    setLibraryOpen((current) => !current);
                    setLibraryTerm('');
                  }}
                >
                  <ImageIcon size={15} />
                  {libraryOpen ? 'Cerrar biblioteca de imágenes' : 'Buscar en la biblioteca'}
                  <ChevronDown size={14} className={libraryOpen ? 'is-open' : ''} />
                </button>
                {libraryOpen && (
                  <div className="inventory-editor-library">
                    <label className="inventory-editor-search">
                      <ImageIcon size={15} />
                      <input
                        autoFocus
                        value={libraryTerm}
                        onChange={(event) => setLibraryTerm(event.target.value)}
                        placeholder="Buscar papel, tinta, vinil…"
                      />
                      <span>{filteredProducts.length} productos</span>
                    </label>
                    <div className="inventory-editor-library-list">
                      {filteredProducts.map((product) => (
                        <article key={product.id}>
                          <h4>
                            {product.name}
                            <small>{product.images.length} imágenes</small>
                          </h4>
                          <div className="inventory-editor-image-options">
                            {product.images.map((image) => (
                              <button
                                type="button"
                                key={image.path}
                                aria-label={`Añadir imagen ${image.label} de ${product.name}`}
                                className={
                                  galleryImages.some((entry) => entry.path === image.path || entry.src === image.path)
                                    ? 'is-selected'
                                    : ''
                                }
                                onClick={() => {
                                  if (!galleryImages.some((entry) => entry.path === image.path || entry.src === image.path)) {
                                    update({
                                      productImages: [
                                        ...galleryImages,
                                        { key: `library-${makeKey()}`, src: image.path, path: image.path, label: image.label },
                                      ],
                                    });
                                  }
                                  setLibraryOpen(false);
                                }}
                              >
                                <img src={image.path} alt="" loading="lazy" />
                                <span>Añadir · {image.label}</span>
                                {galleryImages.some((entry) => entry.path === image.path || entry.src === image.path) && (
                                  <i>
                                    <Check size={13} />
                                  </i>
                                )}
                              </button>
                            ))}
                          </div>
                        </article>
                      ))}
                      {!filteredProducts.length && (
                        <p className="inventory-editor-library-empty">No hay coincidencias. Prueba otra palabra.</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {isVisible('stock') && (
              <section className="inventory-editor-section">
                <div className="inventory-editor-section-title">
                  <span className="inventory-editor-section-icon">
                    <MapPin size={16} />
                  </span>
                  <div>
                    <h3>Sucursal y existencias</h3>
                    <p>Asigna el artículo o registra un traspaso, entrada, salida o conteo con su responsable.</p>
                  </div>
                </div>
                <div className="inventory-editor-branch-card">
                  <div className="inventory-editor-branch-current">
                    <span className="inventory-editor-branch-pin">
                      <MapPin size={16} />
                    </span>
                    <div>
                      <small>SUCURSAL ACTUAL</small>
                      <b>{sourceItem?.branch || 'Pendiente de asignar'}</b>
                      <span>
                        {hasCountedStock
                          ? `${sourceItem?.quantity ?? 0} ${sourceItem?.unit || 'unidades'} registradas`
                          : 'Sin conteo físico confirmado'}
                      </span>
                    </div>
                  </div>
                  <div className="inventory-editor-branch-controls">
                    <label>
                      {sourceItem?.branchId && hasCountedStock
                        ? 'Destino del traspaso'
                        : sourceItem?.branchId
                          ? 'Sucursal del conteo pendiente'
                          : 'Asignar sucursal'}
                      <select value={branchSelection} onChange={(event) => setBranchSelection(event.target.value)}>
                        <option value="">Selecciona una sucursal</option>
                        {branches
                          .filter((name) => !hasCountedStock || name !== sourceItem?.branch)
                          .map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {hasCountedStock ? (
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={!branchSelection || branchSelection === sourceItem?.branch}
                        onClick={() => onTransfer(sourceItem, branchSelection)}
                      >
                        <ArrowLeftRight size={15} />
                        Preparar traspaso
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={!branchSelection || branchSelection === sourceItem?.branch}
                        onClick={() => onAssignBranch(sourceItem, branchSelection)}
                      >
                        <MapPin size={15} />
                        {sourceItem?.branchId ? 'Cambiar sucursal' : 'Asignar sucursal'}
                      </button>
                    )}
                  </div>
                  <p className="inventory-editor-branch-note">
                    {hasCountedStock
                      ? 'El traspaso solicita cantidad, responsable y motivo. El historial queda registrado.'
                      : 'La asignación no crea saldo. El artículo seguirá pendiente hasta contar sus existencias.'}
                  </p>
                </div>
                {sourceItem?.branchId && (onMovement || (canEditCosts && onCost)) && (
                  <div className="inventory-editor-stock-actions">
                    {onMovement && (
                      <>
                        <button
                          type="button"
                          className="button button-outline is-action-count"
                          onClick={() => {
                            onClose();
                            onMovement(sourceItem, 'ajuste');
                          }}
                        >
                          <ClipboardCheck size={14} />
                          <span>Ajustar / Confirmar conteo</span>
                        </button>
                        <button
                          type="button"
                          className="button button-outline is-action-in"
                          onClick={() => {
                            onClose();
                            onMovement(sourceItem, 'entrada');
                          }}
                        >
                          <PackagePlus size={14} />
                          <span>+ Entrada rápida</span>
                        </button>
                        {hasCountedStock && (
                          <button
                            type="button"
                            className="button button-outline is-action-out"
                            onClick={() => {
                              onClose();
                              onMovement(sourceItem, 'consumo');
                            }}
                          >
                            <PackageMinus size={14} />
                            <span>− Consumo de taller</span>
                          </button>
                        )}
                      </>
                    )}
                    {canEditCosts && onCost && (
                      <button
                        type="button"
                        className="button button-outline is-action-cost"
                        onClick={() => {
                          onClose();
                          onCost(sourceItem);
                        }}
                      >
                        <DollarSign size={14} />
                        <span>Configurar costo unitario</span>
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            {isVisible('purchase') && (
              <section className="inventory-editor-section">
                <div className="inventory-editor-section-title">
                  <span className="inventory-editor-section-icon">
                    <ShoppingBag size={16} />
                  </span>
                  <div>
                    <h3>Información de compra y proveedor</h3>
                    <p>Datos de referencia comercial para facilitar órdenes de compra y reposición.</p>
                  </div>
                </div>
                <div className="inventory-editor-grid">
                  <label>
                    Proveedor de referencia
                    <input
                      value={stringValue(value.customFields?.preferred_supplier || sourceItem?.supplierName)}
                      onChange={(event) => patchCustom('preferred_supplier', event.target.value)}
                      placeholder="Nombre del proveedor habitual"
                    />
                  </label>
                  <label>
                    Marca o línea comercial
                    <input
                      value={stringValue(value.customFields?.brand_model)}
                      onChange={(event) => patchCustom('brand_model', event.target.value)}
                      placeholder="Ej. Galaxy, Arclad, 3M, Avery"
                    />
                  </label>
                  <label className="inventory-editor-wide">
                    Nota de compra y empaque
                    <textarea
                      rows={2}
                      value={stringValue(value.customFields?.purchase_notes)}
                      onChange={(event) => patchCustom('purchase_notes', event.target.value)}
                      placeholder="Presentación (caja, rollo sellado, litro), código de proveedor o detalle útil para reponerlo"
                    />
                  </label>
                </div>
              </section>
            )}
          </AnimatedList>

          <details className="inventory-editor-help">
            <summary>¿Qué ocurre al guardar?</summary>
            <p>
              Se actualizan la ficha y sus especificaciones. El conteo físico solo cambia cuando alguien registra un conteo o movimiento autorizado.
            </p>
          </details>
          {deleteRequested && (
            <div className="inventory-editor-delete-confirm" role="alert">
              <Trash2 size={16} />
              <span>
                <b>¿Retirar este artículo del catálogo activo?</b>
                <small>Se conservarán conteos, movimientos y registros vinculados para auditoría.</small>
              </span>
              <button
                type="button"
                className="button button-danger"
                disabled={saving}
                onClick={() => onDelete(sourceItem, true)}
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={saving}
                onClick={() => setDeleteRequested(false)}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        <footer className="inventory-editor-footer">
          <button type="button" className="inventory-editor-delete-link" onClick={() => setDeleteRequested(true)}>
            <Trash2 size={14} />
            Eliminar del catálogo
          </button>
          <span>Las existencias y el historial se conservan.</span>
          <div>
            <button type="button" className="button button-outline" disabled={saving} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button button-dark" disabled={saving}>
              <Check size={15} />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
