import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  DollarSign,
  Image as ImageIcon,
  Layers,
  MapPin,
  MoreHorizontal,
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
import type { InventoryGroup } from './InventoryGroupsPanel';
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
  inventoryGroupId: string;
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
  inventoryGroups: InventoryGroup[];
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
  inventoryGroups,
}: Props) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTerm, setLibraryTerm] = useState('');
  const [branchSelection, setBranchSelection] = useState(value.sourceItem?.branch || '');
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSectionFilter>('identity');
  const [copiedSku, setCopiedSku] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDetailsElement>(null);
  const sectionNavigationRef = useRef<HTMLDetailsElement>(null);
  const previousSectionRef = useRef(activeSection);

  useEffect(() => {
    setBranchSelection(value.sourceItem?.branch || '');
    setDeleteRequested(false);
    setLibraryOpen(false);
    setLibraryTerm('');
    setActiveSection('identity');
    overviewRef.current?.removeAttribute('open');
    sectionNavigationRef.current?.removeAttribute('open');
  }, [value.remoteItemId, value.variantId]);

  useEffect(() => {
    if (previousSectionRef.current === activeSection) return;
    previousSectionRef.current = activeSection;
    const content = contentRef.current;
    if (!content) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    content.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    const focusFrame = activeSection !== 'all'
      ? window.requestAnimationFrame(() => content.querySelector('h3')?.focus({ preventScroll: true }))
      : undefined;
    return () => {
      if (focusFrame !== undefined) window.cancelAnimationFrame(focusFrame);
    };
  }, [activeSection]);

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

  // Show which sections already contain useful information.
  const readiness = useMemo(() => {
    const specs = value.variantAttributes || {};
    const custom = value.customFields || {};
    const hasIdentity = Boolean(value.name.trim());
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
        String(custom.brand_model || '').trim() ||
        String(custom.purchase_notes || '').trim() ||
        sourceItem?.unitCost != null,
    );

    const steps: Array<{ id: EditorSectionFilter; label: string; done: boolean }> = [
      { id: 'identity', label: 'Identificación', done: hasIdentity },
      { id: 'specs', label: 'Medidas y ficha', done: hasSpecs },
      { id: 'media', label: 'Imágenes', done: hasMedia },
      { id: 'stock', label: 'Sucursal y conteo', done: hasStock },
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

  const editorSteps: Array<{ id: Exclude<EditorSectionFilter, 'all'>; label: string; Icon: typeof Package }> = [
    { id: 'identity', label: 'Identificación', Icon: Tag },
    { id: 'specs', label: 'Medidas y ficha', Icon: Ruler },
    { id: 'media', label: 'Imágenes', Icon: ImageIcon },
    { id: 'stock', label: 'Sucursal y conteo', Icon: MapPin },
    { id: 'purchase', label: 'Datos de compra', Icon: ShoppingBag },
  ];

  const activeStepIndex = readiness.steps.findIndex((step) => step.id === activeSection);
  const activeStep = activeStepIndex >= 0 ? readiness.steps[activeStepIndex] : undefined;
  const activeEditorStep = activeStepIndex >= 0 ? editorSteps[activeStepIndex] : undefined;
  const ActiveStepIcon = activeEditorStep?.Icon || Layers;
  const sectionStatus = (id: EditorSectionFilter, done: boolean) => {
    if (id === 'stock') {
      return hasCountedStock ? 'Conteo registrado' : sourceItem?.branchId ? 'Conteo pendiente' : 'Sucursal pendiente';
    }
    if (id === 'identity') return value.name.trim() ? 'Datos agregados' : 'Falta el nombre';
    if (id === 'media') {
      return galleryImages.length
        ? galleryImages.length + (galleryImages.length === 1 ? ' imagen' : ' imágenes')
        : 'Opcional';
    }
    return done ? 'Datos agregados' : 'Opcional';
  };
  const sectionTone = (id: EditorSectionFilter, done: boolean) => {
    if (id === 'stock') return hasCountedStock ? 'complete' : 'pending';
    if (id === 'identity') return value.name.trim() ? 'complete' : 'pending';
    return done ? 'complete' : 'optional';
  };
  const activeStepStatus = activeStep
    ? sectionStatus(activeStep.id, activeStep.done)
    : 'Todas las secciones';
  const activeStepTone = activeStep
    ? sectionTone(activeStep.id, activeStep.done)
    : 'complete';
  const goToSection = (section: EditorSectionFilter) => {
    sectionNavigationRef.current?.removeAttribute('open');
    setActiveSection(section);
  };
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
              <span className="eyebrow">Ficha de inventario</span>
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
              Edita los datos del artículo. Las existencias cambian solo con un conteo o movimiento.
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

        <details ref={overviewRef} className="inventory-editor-disclosure inventory-editor-overview">
          <summary className="inventory-editor-disclosure-summary">
            <span className="inventory-editor-disclosure-title">
              <Boxes size={15} aria-hidden="true" /> Resumen
            </span>
            <span className={'inventory-editor-disclosure-status is-' + stockTone}>{stockStateLabel}</span>
            <span className="inventory-editor-disclosure-count">
              {readiness.doneCount} de {readiness.total} secciones con datos
            </span>
            <ChevronDown size={16} className="inventory-editor-disclosure-chevron" aria-hidden="true" />
          </summary>
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
                <Sparkles size={13} /> Avance de la ficha
              </span>
              <b>
                {readiness.doneCount} de {readiness.total} secciones con datos
              </b>
            </div>
            <div
              className="inventory-editor-readiness-progress"
              role="progressbar"
              aria-label="Secciones de la ficha con información"
              aria-valuemin={0}
              aria-valuemax={readiness.total}
              aria-valuenow={readiness.doneCount}
              aria-valuetext={`${readiness.doneCount} de ${readiness.total} secciones con datos`}
            >
              <i style={{ width: `${readiness.pct}%` }} />
            </div>
            <p>No necesitas llenar todo: agrega solo lo que usas. El conteo físico se registra por sucursal.</p>
          </div>
        </div>
        </details>

        <details ref={sectionNavigationRef} className="inventory-editor-disclosure inventory-editor-section-disclosure">
          <summary className="inventory-editor-disclosure-summary inventory-editor-section-summary" aria-controls="inventory-editor-section-nav">
            <span className="inventory-editor-disclosure-step-number">
              {activeStepIndex >= 0 ? activeStepIndex + 1 : <Layers size={15} aria-hidden="true" />}
            </span>
            <span className="inventory-editor-disclosure-current">
              <strong><ActiveStepIcon size={14} aria-hidden="true" /> {activeEditorStep?.label || 'Ficha completa'}</strong>
              <small className={'is-' + activeStepTone}>{activeStepStatus}</small>
            </span>
            <span className="inventory-editor-section-disclosure-prompt">
              {activeSection === 'all' ? 'Mostrar secciones' : 'Cambiar sección'}
            </span>
            <ChevronDown size={16} className="inventory-editor-disclosure-chevron" aria-hidden="true" />
          </summary>

        <nav id="inventory-editor-section-nav" className="inventory-editor-section-nav" aria-label="Secciones de la ficha">
          {editorSteps.map(({ id, label, Icon }, index) => {
            const step = readiness.steps[index];
            const stepStatus = sectionStatus(id, step.done);
            const stepTone = sectionTone(id, step.done);
            return (
              <button
                key={id}
                type="button"
                className={['inventory-editor-step', 'is-' + stepTone, activeSection === id ? 'is-active' : ''].filter(Boolean).join(' ')}
                aria-current={activeSection === id ? 'step' : undefined}
                aria-controls="inventory-editor-content"
                aria-label={'Paso ' + (index + 1) + ': ' + label + '. ' + stepStatus + (activeSection === id ? ', actual' : '')}
                onClick={() => goToSection(id)}
              >
                <span className="inventory-editor-step-index">
                  {step.done ? <CheckCircle2 size={15} aria-hidden="true" /> : index + 1}
                </span>
                <span className="inventory-editor-step-copy">
                  <strong><Icon size={13} aria-hidden="true" /> {label}</strong>
                  <small className={'inventory-editor-step-status is-' + stepTone}>{stepStatus}</small>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className={['inventory-editor-all-view', activeSection === 'all' ? 'is-active' : ''].filter(Boolean).join(' ')}
            aria-pressed={activeSection === 'all'}
            aria-controls="inventory-editor-content"
            onClick={() => goToSection('all')}
          >
            <Layers size={14} /> Ver ficha completa
          </button>
        </nav>
        </details>

        <div className="inventory-editor-content" id="inventory-editor-content" ref={contentRef}>
          <div className="inventory-editor-sections">
            {isVisible('identity') && (
              <section className="inventory-editor-section">
                <div className="inventory-editor-section-title">
                  <span className="inventory-editor-section-icon">
                    <Package size={16} />
                  </span>
                  <div>
                    <h3 tabIndex={-1}>Identificación y clasificación</h3>
                    <p>Clasifica el artículo por nombre, marca, categoría y etiquetas para encontrarlo al instante.</p>
                  </div>
                </div>
                <div className="inventory-editor-grid">
                  <label>
                    Nombre del producto
                    <input
                      autoFocus={activeSection === 'identity' && previousSectionRef.current === 'identity'}
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
                  <label>
                    Colección
                    <select value={value.inventoryGroupId || ''} onChange={(event) => update({ inventoryGroupId: event.target.value })}>
                      <option value="">Inventario principal</option>
                      {inventoryGroups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.showInMain ? ' · visible en principal' : ''}</option>)}
                    </select>
                    <small>La ficha, sus variantes y todas sus sucursales permanecen juntas.</small>
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
                    <h3 tabIndex={-1}>Medidas y características</h3>
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
                    <h3 tabIndex={-1}>Imagen de referencia</h3>
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
                    <h3 tabIndex={-1}>Sucursal y existencias</h3>
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
                      <select
                        value={branchSelection}
                        disabled={saving || !branches.length}
                        aria-describedby="inventory-editor-branch-note"
                        onChange={(event) => setBranchSelection(event.target.value)}
                      >
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
                        disabled={saving || !branches.includes(branchSelection) || branchSelection === sourceItem?.branch}
                        title={
                          !branches.length
                            ? 'Configura una sucursal para habilitar el traspaso.'
                            : !branchSelection
                              ? 'Selecciona una sucursal para habilitar el traspaso.'
                              : undefined
                        }
                        onClick={() => onTransfer(sourceItem, branchSelection)}
                      >
                        <ArrowLeftRight size={15} />
                        Preparar traspaso
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-outline"
                        disabled={saving || !branches.includes(branchSelection) || branchSelection === sourceItem?.branch}
                        title={
                          !branches.length
                            ? 'Configura una sucursal para habilitar la asignación.'
                            : !branchSelection
                              ? 'Selecciona una sucursal para habilitar la asignación.'
                              : undefined
                        }
                        onClick={() => onAssignBranch(sourceItem, branchSelection)}
                      >
                        <MapPin size={15} />
                        {sourceItem?.branchId ? 'Cambiar sucursal' : 'Asignar sucursal'}
                      </button>
                    )}
                  </div>
                  {!branches.length ? (
                    <p className="inventory-editor-branch-note" id="inventory-editor-branch-note" role="status">
                      No hay sucursales disponibles en el inventario. Configura una antes de asignar este artículo.
                    </p>
                  ) : (
                    <p className="inventory-editor-branch-note" id="inventory-editor-branch-note">
                      {hasCountedStock
                        ? 'El traspaso solicita cantidad, responsable y motivo. El historial queda registrado.'
                        : 'Elige una sucursal y asígnala. Esto no crea saldo: el conteo físico se registra después.'}
                    </p>
                  )}
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
                    <h3 tabIndex={-1}>Datos de compra y proveedor</h3>
                    <p>Guarda proveedor, marca y empaque como referencia. Esta ficha no emite una orden de compra.</p>
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
          </div>

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
          <details className="inventory-editor-more-actions">
            <summary><MoreHorizontal size={15} aria-hidden="true" /> Más acciones</summary>
            <div>
              <button
                type="button"
                className="inventory-editor-delete-link"
                disabled={saving}
                onClick={(event) => {
                  setDeleteRequested(true);
                  event.currentTarget.closest('details')?.removeAttribute('open');
                }}
              >
                <Trash2 size={14} /> Retirar del catálogo
              </button>
            </div>
          </details>
          <div className="inventory-editor-footer-context" aria-live="polite">
            <span>{activeStepIndex >= 0 ? `Paso ${activeStepIndex + 1} de ${readiness.total} · ${readiness.steps[activeStepIndex].label}` : 'Vista completa · puedes editar todas las secciones'}</span>
            <small>El stock cambia solo con un conteo o movimiento.</small>
          </div>
          <div className="inventory-editor-footer-actions">
            <div className="inventory-editor-step-actions">
              {activeStepIndex > 0 && (
                <button type="button" className="button button-outline" onClick={() => goToSection(readiness.steps[activeStepIndex - 1].id)}>
                  <ChevronLeft size={15} /> Anterior
                </button>
              )}
              {activeStepIndex >= 0 && activeStepIndex < readiness.total - 1 && (
                <button type="button" className="button button-outline inventory-editor-next-step" onClick={() => goToSection(readiness.steps[activeStepIndex + 1].id)}>
                  Siguiente <ChevronRight size={15} />
                </button>
              )}
            </div>
            <div className="inventory-editor-primary-actions">
              <button type="button" className="button button-outline" disabled={saving} onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="button button-dark" disabled={saving}>
                <Check size={15} />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </div>
  );
}
