import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CircleHelp, MapPin, Plus, Printer, RotateCcw, Ruler, Sparkles, Trash2, Wrench } from 'lucide-react';
import { getGoogleMapsOpenUrl, isGoogleMapsUrl } from '../../lib/maps';
import './quote-calculator.css';
import { calculateScenario, loadQuoteProducts, type PricingMode, type QuoteProduct } from './pricing';
import { multiProductQuoteService } from '../content';
import { MAX_QUOTE_ITEMS } from './quoteConstants';
import { getStorefrontQuoteSourceKey } from './storefrontQuoteAliases';
import { buildInitialQuoteItemFromUrl, type StorefrontQuoteSourceChannel } from '../storefrontCatalog';
import { SignageScaleVisualizer } from './SignageScaleVisualizer';
import { ArtworkPreflightDropzone } from './ArtworkPreflightDropzone';

export type QuoteService = { id: string; name: string };
export type QuoteCalculationMode = 'unknown' | 'area' | 'units';
export type QuoteDesignSupport = 'ready' | 'adapt' | 'create' | 'unknown';
export type QuoteDesignService = 'none' | 'adaptation' | 'creation' | 'custom';
export type QuoteLineItemDraft = {
  id: string;
  service: string;
  project: string;
  sku?: string;
  calculationMode: QuoteCalculationMode;
  measurementUnit: 'cm' | 'm';
  width: number;
  height: number;
  area: number;
  quantity: number;
  quantityRange?: string;
  designSupport: QuoteDesignSupport;
  finishing: string;
  productId?: string;
  productName?: string;
  grommets: boolean;
  grommetSize: 'small' | 'large' | '';
  grommetCount: number | null;
  grommetUnitAmount: string | number;
  designService: QuoteDesignService;
  designDescription: string;
  designAmount: string | number;
  installation: boolean;
  extras?: Array<{ code: string; label: string; quantity: number; unitAmount: number; amount: number }>;
  extrasTotal?: number;
  pricingMode?: PricingMode;
  pricePreview?: { normal: number | null; installation: number | null; corporate: number | null };
  priceStatus?: 'pending-validation';
};

export type QuoteInstallationLocation = {
  address: string;
  mapsUrl: string;
  locationUnknown: boolean;
  floor: string;
  workHeight: string;
  accessNotes: string;
};

export type QuoteDraft = {
  /** Legacy summary fields are retained for current CRM and request reporting. */
  sourceChannel?: StorefrontQuoteSourceChannel;
  service: string;
  project: string;
  calculationMode: QuoteCalculationMode;
  measurementUnit: 'cm' | 'm';
  width: number;
  height: number;
  area: number;
  quantity: number;
  designSupport: QuoteDesignSupport;
  installation: boolean;
  finishing: string;
  productId?: string;
  productName?: string;
  requestedProducts?: string[];
  requestedQuantityRanges?: string[];
  pricingMode?: PricingMode;
  pricePreview?: { normal: number | null; installation: number | null; corporate: number | null };
  priceStatus?: 'pending-validation';
  items: QuoteLineItemDraft[];
  installationLocation?: QuoteInstallationLocation;
};

type Props = {
  services: QuoteService[];
  initialService?: string;
  initialProducts?: string[];
  initialProductSkus?: string[];
  initialItemServices?: string[];
  initialQuantityRanges?: string[];
  sourceChannel?: StorefrontQuoteSourceChannel;
  draftKey?: string;
  validationMessage?: string;
  onChange: (quote: QuoteDraft) => void;
};

const designLabels: Record<QuoteDesignSupport, string> = {
  ready: 'Ya tengo el arte listo',
  adapt: 'Necesito adaptar un diseño',
  create: 'Necesito crear el diseño',
  unknown: 'Aún no lo sé',
};
const designServiceLabels: Record<QuoteDesignService, string> = {
  none: 'Sin servicio de diseño',
  adaptation: 'Adaptación de arte',
  creation: 'Diseño desde cero',
  custom: 'Otro servicio de diseño',
};

const quantityFromRange = (range: string) => {
  const first = range.match(/[\d]+(?:[.,][\d]+)?/)?.[0];
  return first ? Math.max(1, Math.floor(Number(first.replace(',', '.')) || 1)) : 1;
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `quote-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeItem(service = '', project = '', quantity = 1, quantityRange = '', sku = ''): QuoteLineItemDraft {
  const seed = buildInitialQuoteItemFromUrl({ service, project, sku, quantityRange });
  return {
    id: makeId(),
    service: seed.service,
    project: seed.project,
    ...(seed.sku ? { sku: seed.sku } : {}),
    calculationMode: 'unknown',
    measurementUnit: 'cm',
    width: 100,
    height: 100,
    area: 0,
    quantity: quantity > 1 ? quantity : seed.quantity,
    quantityRange: seed.quantityRange,
    designSupport: 'unknown',
    finishing: '',
    grommets: false,
    grommetSize: '',
    grommetCount: null,
    grommetUnitAmount: '',
    designService: 'none',
    designDescription: '',
    designAmount: '',
    installation: false,
  };
}

const defaultLocation: QuoteInstallationLocation = {
  address: '',
  mapsUrl: '',
  locationUnknown: false,
  floor: '',
  workHeight: '',
  accessNotes: '',
};

const QUOTE_SESSION_PREFIX = 'vc-public-quote-draft:';

export function clearQuoteConfiguratorDraft(draftKey = 'default') {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${QUOTE_SESSION_PREFIX}${draftKey || 'default'}`);
  } catch {
    // Ignore storage removal errors.
  }
}

function readQuoteSessionDraft(draftKey: string): { items: QuoteLineItemDraft[]; location: QuoteInstallationLocation } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${QUOTE_SESSION_PREFIX}${draftKey || 'default'}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { items?: unknown; location?: unknown };
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    const items = parsed.items.slice(0, MAX_QUOTE_ITEMS).flatMap((entry): QuoteLineItemDraft[] => {
      if (!entry || typeof entry !== 'object') return [];
      const row = entry as Partial<QuoteLineItemDraft>;
      return [{
        ...makeItem(
          typeof row.service === 'string' ? row.service : '',
          typeof row.project === 'string' ? row.project : '',
          typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? Math.max(1, Math.floor(row.quantity)) : 1,
          typeof row.quantityRange === 'string' ? row.quantityRange : '',
          typeof row.sku === 'string' ? row.sku : '',
        ),
        ...row,
        id: typeof row.id === 'string' && row.id ? row.id : makeId(),
        service: typeof row.service === 'string' ? row.service : '',
        project: typeof row.project === 'string' ? row.project : '',
        sku: typeof row.sku === 'string' && row.sku.trim() ? row.sku.trim() : undefined,
        width: typeof row.width === 'number' && Number.isFinite(row.width) ? Math.max(0.01, row.width) : 100,
        height: typeof row.height === 'number' && Number.isFinite(row.height) ? Math.max(0.01, row.height) : 100,
        quantity: typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? Math.max(1, Math.floor(row.quantity)) : 1,
      }];
    });
    if (!items.length) return null;
    const loc = parsed.location && typeof parsed.location === 'object' ? parsed.location as Partial<QuoteInstallationLocation> : {};
    return {
      items,
      location: {
        address: typeof loc.address === 'string' ? loc.address : '',
        mapsUrl: typeof loc.mapsUrl === 'string' ? loc.mapsUrl : '',
        locationUnknown: Boolean(loc.locationUnknown),
        floor: typeof loc.floor === 'string' ? loc.floor : '',
        workHeight: typeof loc.workHeight === 'string' ? loc.workHeight : '',
        accessNotes: typeof loc.accessNotes === 'string' ? loc.accessNotes : '',
      },
    };
  } catch {
    return null;
  }
}

function areaOf(item: QuoteLineItemDraft) {
  return item.measurementUnit === 'cm' ? item.width * item.height / 10000 : item.width * item.height;
}

function basisOf(item: QuoteLineItemDraft) {
  return item.calculationMode === 'area' ? areaOf(item) * item.quantity : item.quantity;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value);
}

function amountValue(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function itemExtras(item: QuoteLineItemDraft) {
  const extras: Array<{ code: string; label: string; quantity: number; unitAmount: number; amount: number }> = [];
  if (item.grommets) {
    const quantity = item.grommetCount ? item.grommetCount * Math.max(1, item.quantity) : 0;
    const unitAmount = amountValue(item.grommetUnitAmount);
    if (quantity || unitAmount) extras.push({
      code: 'grommets',
      label: `Ojales ${item.grommetSize === 'small' ? 'pequeños' : item.grommetSize === 'large' ? 'grandes' : 'por definir'}`,
      quantity,
      unitAmount,
      amount: quantity * unitAmount,
    });
  }
  if (item.designService !== 'none') extras.push({
    code: 'design',
    label: item.designService === 'custom' && item.designDescription.trim()
      ? `${designServiceLabels[item.designService]}: ${item.designDescription.trim()}`
      : designServiceLabels[item.designService],
    quantity: 1,
    unitAmount: amountValue(item.designAmount),
    amount: amountValue(item.designAmount),
  });
  return extras;
}

function hasLona(item: QuoteLineItemDraft) {
  return /\blonas?\b/i.test(`${item.project} ${item.productName || ''}`);
}

function itemSummary(item: QuoteLineItemDraft) {
  const quantitySummary = item.quantityRange
    ? `Rango de catálogo ${item.quantityRange} · cantidad exacta por confirmar`
    : `${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`;
  const measurements = item.calculationMode === 'area'
    ? `${item.width} × ${item.height} ${item.measurementUnit} · ${areaOf(item).toFixed(2)} m² por pieza · ${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`
    : item.calculationMode === 'units'
      ? quantitySummary
      : 'Medidas y cantidad por definir';
  const details = [measurements, `Diseño: ${designLabels[item.designSupport]}`];
  if (item.finishing.trim()) details.push(`Acabados: ${item.finishing.trim()}`);
  if (item.grommets) details.push(`Ojales ${item.grommetSize === 'small' ? 'pequeños' : item.grommetSize === 'large' ? 'grandes' : 'por definir'}${item.grommetCount ? ` · ${item.grommetCount}` : ''}`);
  for (const extra of itemExtras(item)) {
    const amountLabel = extra.amount > 0 ? formatPrice(extra.amount) : 'valor por confirmar';
    details.push(`${extra.label}: ${extra.code === 'grommets' && extra.quantity ? `${extra.quantity} ojales · ` : ''}${amountLabel}`);
  }
  if (item.installation) details.push('Instalación solicitada');
  return details.join(' · ');
}

function quoteLocationUrl(location: QuoteInstallationLocation) {
  return getGoogleMapsOpenUrl(location.mapsUrl.trim(), location.address.trim());
}

type ItemEditorProps = {
  item: QuoteLineItemDraft;
  index: number;
  services: QuoteService[];
  products: QuoteProduct[];
  canRemove: boolean;
  onUpdate: (id: string, patch: Partial<QuoteLineItemDraft>) => void;
  onRemove: (id: string) => void;
};

function QuoteItemEditor({ item, index, services, products, canRemove, onUpdate, onRemove }: ItemEditorProps) {
  const [productSearch, setProductSearch] = useState('');
  const availableProducts = useMemo(() => {
    const compatible = item.calculationMode === 'area'
      ? products.filter((product) => product.mode === 'area')
      : item.calculationMode === 'units'
        ? products.filter((product) => product.mode === 'quantity' || product.mode === 'fixed')
        : products;
    const query = normalize(productSearch);
    const filtered = query
      ? compatible.filter((product) => normalize(`${product.name} ${product.family} ${product.search_text || ''}`).includes(query))
      : compatible;
    const selected = compatible.find((product) => product.source_key === item.productId);
    return selected && !filtered.some((product) => product.source_key === selected.source_key) ? [selected, ...filtered] : filtered;
  }, [item.calculationMode, item.productId, productSearch, products]);
  const selectedProduct = products.find((product) => product.source_key === item.productId);
  const update = (patch: Partial<QuoteLineItemDraft>) => onUpdate(item.id, {
    ...patch,
    ...(Object.prototype.hasOwnProperty.call(patch, 'quantity') && item.quantityRange ? { quantityRange: undefined } : {}),
  });
  const chooseMode = (calculationMode: QuoteCalculationMode) => {
    const product = products.find((row) => row.source_key === item.productId);
    const compatible = !product || calculationMode === 'unknown'
      || (calculationMode === 'area' && product.mode === 'area')
      || (calculationMode === 'units' && (product.mode === 'quantity' || product.mode === 'fixed'));
    update({ calculationMode, ...(!compatible ? { productId: undefined, productName: undefined, quantityRange: undefined } : {}) });
  };
  const chooseProduct = (sourceKey: string) => {
    const product = products.find((row) => row.source_key === sourceKey);
    if (!product) {
      update({ productId: undefined, productName: undefined, quantityRange: undefined });
      return;
    }
    update({
      productId: product.source_key,
      productName: product.name,
      sku: product.sku || item.sku,
      quantityRange: undefined,
      calculationMode: product.mode === 'area' ? 'area' : 'units',
      project: item.project.trim() ? item.project : product.name,
    });
    setProductSearch('');
  };
  const basePricePreview = selectedProduct && item.calculationMode !== 'unknown' ? {
    normal: calculateScenario(selectedProduct, 'normal', basisOf(item)),
    installation: calculateScenario(selectedProduct, 'installation', basisOf(item)),
    corporate: calculateScenario(selectedProduct, 'corporate', basisOf(item)),
  } : null;
  const extraAmount = itemExtras(item).reduce((total, extra) => total + extra.amount, 0);
  const pricePreview = basePricePreview ? {
    normal: basePricePreview.normal === null ? null : basePricePreview.normal + extraAmount,
    installation: basePricePreview.installation === null ? null : basePricePreview.installation + extraAmount,
    corporate: basePricePreview.corporate === null ? null : basePricePreview.corporate + extraAmount,
  } : null;

  return <article className="quote-item-card" aria-labelledby={`quote-item-title-${item.id}`}>
    <header className="quote-item-heading">
      <div>
        <span>ARTÍCULO {String(index + 1).padStart(2, '0')}{item.sku ? ` · SKU ${item.sku}` : ''}</span>
        <h4 id={`quote-item-title-${item.id}`}>{item.project.trim() || `Artículo ${index + 1}`}</h4>
      </div>
      {canRemove && <button type="button" className="quote-remove-item" onClick={() => onRemove(item.id)} aria-label={`Quitar artículo ${index + 1}`}><Trash2 size={15}/><span>Quitar</span></button>}
    </header>
    <div className="quote-step-fields quote-item-fields">
      <label>Familia de servicio
          <select id={`quote-item-service-${item.id}`} value={item.service} onChange={(event) => update({ service: event.target.value })}>
          <option value="">Selecciona una familia</option>
          {services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
        </select>
      </label>
      <label>¿Qué artículo o trabajo necesitas? <span>(requerido)</span>
        <input id={`quote-item-project-${item.id}`} required value={item.project} onChange={(event) => update({ project: event.target.value })} placeholder="Ej. lona para fachada" maxLength={120}/>
      </label>
    </div>

    <fieldset className="quote-builder-mode quote-item-mode" aria-describedby={`quote-item-mode-help-${item.id}`}>
      <legend>¿Qué datos tienes de este artículo?</legend>
      <p id={`quote-item-mode-help-${item.id}`}>La cantidad, medida, acabado y diseño se configuran por separado para cada artículo.</p>
      <div className="quote-mode-options">
        <label className={`quote-mode-option${item.calculationMode === 'area' ? ' active' : ''}`}>
          <input type="radio" name={`quote-mode-${item.id}`} value="area" checked={item.calculationMode === 'area'} onChange={() => chooseMode('area')}/><Ruler size={17} aria-hidden="true"/><span><b>Medidas</b><small>Tengo ancho y alto</small></span>
        </label>
        <label className={`quote-mode-option${item.calculationMode === 'units' ? ' active' : ''}`}>
          <input type="radio" name={`quote-mode-${item.id}`} value="units" checked={item.calculationMode === 'units'} onChange={() => chooseMode('units')}/><span className="quote-unit-icon" aria-hidden="true">×</span><span><b>Cantidad</b><small>Sé cuántas piezas necesito</small></span>
        </label>
        <label className={`quote-mode-option${item.calculationMode === 'unknown' ? ' active' : ''}`}>
          <input type="radio" name={`quote-mode-${item.id}`} value="unknown" checked={item.calculationMode === 'unknown'} onChange={() => chooseMode('unknown')}/><CircleHelp size={17} aria-hidden="true"/><span><b>Aún no sé</b><small>Necesito orientación</small></span>
        </label>
      </div>
    </fieldset>

    {item.calculationMode === 'area' && <div className="quote-dimension-block quote-item-dimensions">
      <div className="quote-unit-toggle" role="group" aria-label={`Unidad de medida del artículo ${index + 1}`}>
        <button type="button" aria-pressed={item.measurementUnit === 'cm'} className={item.measurementUnit === 'cm' ? 'active' : ''} onClick={() => update({ measurementUnit: 'cm' })}>cm</button>
        <button type="button" aria-pressed={item.measurementUnit === 'm'} className={item.measurementUnit === 'm' ? 'active' : ''} onClick={() => update({ measurementUnit: 'm' })}>m</button>
      </div>
      <div className="quote-field-pair">
        <label>Ancho ({item.measurementUnit})<input type="number" inputMode="decimal" min={0.01} step="any" value={item.width} onChange={(event) => update({ width: Math.max(0.01, Number(event.target.value) || 0.01) })}/></label>
        <label>Alto ({item.measurementUnit})<input type="number" inputMode="decimal" min={0.01} step="any" value={item.height} onChange={(event) => update({ height: Math.max(0.01, Number(event.target.value) || 0.01) })}/></label>
      </div>
      <p className="quote-area-readout">Área referencial por pieza <b>{areaOf(item).toFixed(2)} m²</b></p>
      <SignageScaleVisualizer
        width={item.width}
        height={item.height}
        unit={item.measurementUnit}
        label={item.project.trim() || item.productName || `Artículo ${index + 1}`}
      />
    </div>}

    {item.calculationMode !== 'unknown' && <div className="quote-step-fields quote-production-fields quote-item-production">
      <label>Buscar en el catálogo de tarifas
        <input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Nombre o familia del producto" aria-label={`Buscar producto para artículo ${index + 1}`}/>
      </label>
      <label>Producto o material <span>(opcional)</span>
        <select value={item.productId || ''} onChange={(event) => chooseProduct(event.target.value)} disabled={!availableProducts.length}>
          <option value="">Solicitar revisión del equipo</option>
          {availableProducts.map((product) => <option key={product.source_key} value={product.source_key}>{product.name}</option>)}
        </select>
        {selectedProduct?.quantity_tiers?.length ? <small className="quote-product-ranges">Rangos publicados en tienda: {selectedProduct.quantity_tiers.map((tier) => tier.replace(/(\d+)\.0\b/g, '$1')).join(' · ')}. La cantidad exacta se confirma en esta solicitud.</small> : null}
      </label>
      <label>Cantidad de piezas
        <input type="number" inputMode="numeric" min={1} step={1} value={item.quantity} onChange={(event) => update({ quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}/>
        {item.quantityRange && <small className="quote-quantity-range-note">Rango elegido: {item.quantityRange}. La cantidad parte del mínimo; actualízala cuando conozcas el número exacto.</small>}
      </label>
    </div>}

    <div className="quote-step-fields quote-item-finishing">
      <label>Estado del diseño
        <select value={item.designSupport} onChange={(event) => update({ designSupport: event.target.value as QuoteDesignSupport })}>
          {Object.entries(designLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label>Acabados o detalles <span>(opcional)</span>
        <input value={item.finishing} onChange={(event) => update({ finishing: event.target.value })} placeholder="Laminado, color, material…" maxLength={180}/>
      </label>
    </div>

    {hasLona(item) && <div className="quote-grommet-card">
      <label className="quote-check-option"><input type="checkbox" checked={item.grommets} onChange={(event) => update({ grommets: event.target.checked, grommetSize: event.target.checked ? item.grommetSize : '', grommetCount: event.target.checked ? item.grommetCount : null })}/><span><b>Agregar ojales a esta lona</b><small>Indica cantidad y valor unitario si los conoces. El equipo confirmará el acabado.</small></span></label>
      {item.grommets && <div className="quote-step-fields quote-grommet-fields">
        <label>Tamaño del ojal
          <select id={`quote-item-grommet-${item.id}`} required value={item.grommetSize} onChange={(event) => update({ grommetSize: event.target.value as QuoteLineItemDraft['grommetSize'] })}>
            <option value="">Selecciona un tamaño</option><option value="small">Pequeño</option><option value="large">Grande</option>
          </select>
        </label>
        <label>Cantidad de ojales <span>(si la conoces)</span>
          <input type="number" inputMode="numeric" min={1} step={1} value={item.grommetCount ?? ''} onChange={(event) => update({ grommetCount: event.target.value ? Math.max(1, Math.floor(Number(event.target.value) || 1)) : null })} placeholder="Por definir"/>
        </label>
        <label>Valor por ojal <span>(opcional · $)</span>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={item.grommetUnitAmount} onChange={(event) => update({ grommetUnitAmount: event.target.value })} aria-label={`Valor por ojal del artículo ${index + 1}`}/>
        </label>
      </div>}
    </div>}

    <div className="quote-step-fields quote-design-service-fields">
      <label>Servicio de diseño <span>(opcional)</span>
        <select value={item.designService} onChange={(event) => update({ designService: event.target.value as QuoteDesignService })}>
          {Object.entries(designServiceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      {item.designService === 'custom' && <label className="quote-design-description">Concepto de diseño libre
        <input maxLength={180} value={item.designDescription} onChange={(event) => update({ designDescription: event.target.value })} placeholder="Ej. vectorización, retoque o composición especial" aria-label={`Concepto de diseño del artículo ${index + 1}`}/>
      </label>}
      {item.designService !== 'none' && <label>Valor del diseño para este artículo <span>(editable · $)</span>
        <input type="number" inputMode="decimal" min={0} step="0.01" value={item.designAmount} onChange={(event) => update({ designAmount: event.target.value })} aria-label={`Valor del diseño del artículo ${index + 1}`}/>
      </label>}
    </div>

    <label className="quote-installation-option"><input type="checkbox" checked={item.installation} onChange={(event) => update({ installation: event.target.checked })}/><span><Wrench size={17}/><span><b>Quiero consultar instalación para este artículo</b><small>El valor se confirma según el lugar, altura y condiciones del trabajo.</small></span></span></label>

    {selectedProduct && item.calculationMode !== 'unknown' && <div className="quote-item-price" aria-live="polite">
      <span className="site-eyebrow"><i/> REFERENCIA PARA ESTE ARTÍCULO</span>
      <div><span>Normal</span><b>{pricePreview?.normal == null ? 'Tarifa pendiente' : `${formatPrice(pricePreview.normal)} · estimado`}</b></div>
      {item.installation && <div><span>Con instalación</span><b>{pricePreview?.installation == null ? 'Tarifa pendiente' : `${formatPrice(pricePreview.installation)} · estimado`}</b></div>}
      <small>{selectedProduct.confirmed ? 'Tarifa del catálogo; Visual Corp confirma disponibilidad y alcance.' : 'Tarifa referencial pendiente de validación por Visual Corp.'}</small>
    </div>}
  </article>;
}

export function QuoteConfigurator({ services, initialService = '', initialProducts = [], initialProductSkus = [], initialItemServices = [], initialQuantityRanges = [], sourceChannel = 'quote_page', draftKey = 'default', validationMessage = '', onChange }: Props) {
  const initialProductsKey = initialProducts.join('\u001f');
  const initialProductSkusKey = initialProductSkus.join('\u001f');
  const initialItemServicesKey = initialItemServices.join('\u001f');
  const initialQuantityRangesKey = initialQuantityRanges.join('\u001f');
  const hasItemServiceOverrides = initialItemServices.length > 0;
  const requestedProducts = initialProductsKey ? initialProductsKey.split('\u001f').slice(0, MAX_QUOTE_ITEMS) : [];
  const requestedProductSkus = initialProductSkusKey ? initialProductSkusKey.split('\u001f').slice(0, MAX_QUOTE_ITEMS) : [];
  const requestedServices = hasItemServiceOverrides ? initialItemServicesKey.split('\u001f').slice(0, MAX_QUOTE_ITEMS) : [];
  const requestedRanges = initialQuantityRangesKey ? initialQuantityRangesKey.split('\u001f').slice(0, MAX_QUOTE_ITEMS) : [];
  const hasExtraRequestedProducts = initialProducts.length > MAX_QUOTE_ITEMS;

  const buildFreshItems = () => {
    if (requestedProducts.length) {
      return requestedProducts.map((product, index) => makeItem(
        hasItemServiceOverrides ? requestedServices[index] || '' : initialService,
        product,
        requestedRanges[index] ? quantityFromRange(requestedRanges[index]) : 1,
        requestedRanges[index] || '',
        requestedProductSkus[index] || '',
      ));
    }
    if (requestedProductSkus.some((sku) => Boolean(sku.trim()))) {
      return requestedProductSkus.map((sku, index) => makeItem(
        hasItemServiceOverrides ? requestedServices[index] || '' : initialService,
        '',
        requestedRanges[index] ? quantityFromRange(requestedRanges[index]) : 1,
        requestedRanges[index] || '',
        sku,
      ));
    }
    return [makeItem(initialService)];
  };

  const initialSessionDraft = useMemo(() => readQuoteSessionDraft(draftKey), [draftKey]);
  const [restoredFromSession, setRestoredFromSession] = useState(() => Boolean(initialSessionDraft));
  const [items, setItems] = useState<QuoteLineItemDraft[]>(() => initialSessionDraft?.items || buildFreshItems());
  const [location, setLocation] = useState<QuoteInstallationLocation>(() => initialSessionDraft?.location || defaultLocation);
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [productLoadError, setProductLoadError] = useState(false);
  const [productLoadAttempt, setProductLoadAttempt] = useState(0);
  const [quoteDataLoadError, setQuoteDataLoadError] = useState(false);
  const userTouchedRef = useRef(Boolean(initialSessionDraft));

  useEffect(() => {
    let active = true;
    setProductLoadError(false);
    loadQuoteProducts().then((rows) => { if (active) setProducts(rows); }).catch(() => {
      if (active) { setProducts([]); setProductLoadError(true); }
    });
    return () => { active = false; };
  }, [productLoadAttempt]);

  // Gently backfill item service if WorkspaceProvider finishes hydrating after mount.
  useEffect(() => {
    if (!initialService && !hasItemServiceOverrides) return;
    setItems((current) => {
      let changed = false;
      const next = current.map((item, index) => {
        if (item.service.trim()) return item;
        const resolved = hasItemServiceOverrides ? requestedServices[index] || initialService : initialService;
        if (!resolved) return item;
        changed = true;
        return { ...item, service: resolved };
      });
      return changed ? next : current;
    });
  }, [initialService, hasItemServiceOverrides, initialItemServicesKey]);

  useEffect(() => {
    if ((!requestedProducts.length && !requestedProductSkus.some(Boolean)) || !products.length) return;
    setItems((current) => current.map((item, index) => {
      if (item.productId) return item;
      const target = normalize(requestedProducts[index] || '');
      const requestedSku = (item.sku || requestedProductSkus[index] || '').trim().toLocaleUpperCase('es');
      const aliasSourceKey = getStorefrontQuoteSourceKey(requestedSku);
      const skuMatches = requestedSku
        ? products.filter((product) => product.sku?.trim().toLocaleUpperCase('es') === requestedSku
          || product.source_skus?.some((sku) => sku.trim().toLocaleUpperCase('es') === requestedSku))
        : [];
      const sourceKeyMatches = skuMatches.length
        ? skuMatches
        : aliasSourceKey
          ? products.filter((product) => product.source_key === aliasSourceKey)
          : target
            ? products.filter((product) => normalize(product.source_key) === target)
            : [];
      const nameMatches = aliasSourceKey || sourceKeyMatches.length || !target
        ? []
        : products.filter((product) => normalize(product.name) === target);
      const match = sourceKeyMatches.length === 1 ? sourceKeyMatches[0] : nameMatches.length === 1 ? nameMatches[0] : undefined;
      if (!match) {
        return requestedSku && !item.sku ? { ...item, sku: requestedSku } : item;
      }
      return {
        ...item,
        project: item.project || match.name,
        sku: item.sku || match.sku || (requestedSku || undefined),
        productId: match.source_key,
        productName: match.name,
        calculationMode: item.calculationMode === 'unknown' ? (match.mode === 'area' ? 'area' : 'units') : item.calculationMode,
        quantity: !userTouchedRef.current && requestedRanges[index] ? quantityFromRange(requestedRanges[index]) : item.quantity,
      };
    }));
  }, [initialProductsKey, initialProductSkusKey, initialQuantityRangesKey, products]);

  const persistSessionDraft = (nextItems: QuoteLineItemDraft[], nextLocation: QuoteInstallationLocation) => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        `${QUOTE_SESSION_PREFIX}${draftKey || 'default'}`,
        JSON.stringify({ items: nextItems, location: nextLocation }),
      );
    } catch {
      // Ignore storage quota errors.
    }
  };

  const updateItem = (id: string, patch: Partial<QuoteLineItemDraft>) => {
    userTouchedRef.current = true;
    setItems((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      persistSessionDraft(next, location);
      return next;
    });
  };
  const removeItem = (id: string) => {
    userTouchedRef.current = true;
    setItems((current) => {
      if (current.length <= 1) return current;
      const next = current.filter((item) => item.id !== id);
      persistSessionDraft(next, location);
      return next;
    });
  };
  const addItem = () => {
    if (items.length >= MAX_QUOTE_ITEMS) return;
    userTouchedRef.current = true;
    setItems((current) => {
      const next = [...current, makeItem(initialService)];
      persistSessionDraft(next, location);
      return next;
    });
  };
  const updateLocation = (updater: (current: QuoteInstallationLocation) => QuoteInstallationLocation) => {
    userTouchedRef.current = true;
    setLocation((current) => {
      const next = updater(current);
      persistSessionDraft(items, next);
      return next;
    });
  };
  const resetQuoteDraft = () => {
    clearQuoteConfiguratorDraft(draftKey);
    setRestoredFromSession(false);
    userTouchedRef.current = false;
    setItems(buildFreshItems());
    setLocation(defaultLocation);
  };

  const normalizedDraft = useMemo<QuoteDraft>(() => {
    const itemsWithPrice = items.map((item) => {
      const selectedProduct = products.find((product) => product.source_key === item.productId);
      const area = item.calculationMode === 'area' ? areaOf(item) : 0;
      const pricePreview = selectedProduct && item.calculationMode !== 'unknown' ? {
        normal: calculateScenario(selectedProduct, 'normal', basisOf(item)),
        installation: calculateScenario(selectedProduct, 'installation', basisOf(item)),
        corporate: calculateScenario(selectedProduct, 'corporate', basisOf(item)),
      } : undefined;
      const extras = itemExtras(item);
      const extrasTotal = extras.reduce((total, extra) => total + extra.amount, 0);
      const withExtras = pricePreview ? {
        normal: pricePreview.normal === null ? null : pricePreview.normal + extrasTotal,
        installation: pricePreview.installation === null ? null : pricePreview.installation + extrasTotal,
        corporate: pricePreview.corporate === null ? null : pricePreview.corporate + extrasTotal,
      } : undefined;
      return {
        ...item,
        sku: item.sku?.trim() || selectedProduct?.sku || undefined,
        grommetUnitAmount: amountValue(item.grommetUnitAmount),
        designAmount: amountValue(item.designAmount),
        productId: selectedProduct?.source_key,
        productName: selectedProduct?.name || item.productName,
        area,
        pricingMode: selectedProduct?.mode === 'area' ? 'area' as const : selectedProduct ? 'quantity' as const : undefined,
        extras,
        extrasTotal,
        pricePreview: withExtras,
        priceStatus: selectedProduct ? 'pending-validation' as const : undefined,
      };
    });
    const distinctServices = [...new Set(itemsWithPrice.map((item) => item.service.trim()).filter(Boolean))];
    const first = itemsWithPrice[0] || makeItem();
    const installRequested = itemsWithPrice.some((item) => item.installation);
    const projectNames = itemsWithPrice.map((item) => item.project.trim()).filter(Boolean);
    return {
      sourceChannel,
      service: distinctServices.length > 1 ? multiProductQuoteService : distinctServices[0] || '',
      project: projectNames.slice(0, 4).join(' · ').slice(0, 160),
      calculationMode: first.calculationMode,
      measurementUnit: first.measurementUnit,
      width: first.calculationMode === 'area' ? first.width : 0,
      height: first.calculationMode === 'area' ? first.height : 0,
      area: first.area,
      quantity: first.calculationMode === 'unknown' ? 0 : first.quantity,
      designSupport: first.designSupport,
      installation: installRequested,
      finishing: first.finishing,
      productId: first.productId,
      productName: first.productName,
      requestedProducts: requestedProducts.length ? requestedProducts : undefined,
      requestedQuantityRanges: itemsWithPrice.some((item) => item.quantityRange)
        ? itemsWithPrice.map((item) => item.quantityRange || '')
        : undefined,
      pricingMode: first.pricingMode,
      pricePreview: first.pricePreview,
      priceStatus: first.priceStatus,
      items: itemsWithPrice,
      installationLocation: installRequested ? location : undefined,
    };
  }, [items, location, products, initialProductsKey, initialQuantityRangesKey, sourceChannel]);

  useEffect(() => {
    const payloadBytes = new TextEncoder().encode(JSON.stringify({ request: normalizedDraft })).length;
    setQuoteDataLoadError(payloadBytes > 17000);
    onChange(normalizedDraft);
  }, [normalizedDraft, onChange]);

  const installItems = items.filter((item) => item.installation);
  const mapLink = quoteLocationUrl(location);
  const summaryTotals = (['normal', 'installation', 'corporate'] as const).map((tier) => ({
    tier,
    label: tier === 'normal' ? 'Normal' : tier === 'installation' ? 'Instalación' : 'Corporativo',
    amount: normalizedDraft.items.every((item) => item.pricePreview?.[tier] != null)
      ? normalizedDraft.items.reduce((sum, item) => sum + (item.pricePreview?.[tier] || 0), 0)
      : null,
  }));
  const mapsUrlInvalid = location.mapsUrl.trim().length > 0 && !isGoogleMapsUrl(location.mapsUrl.trim());

  const printSummary = () => {
    const cleanup = () => document.body.classList.remove('print-quote-summary');
    document.body.classList.add('print-quote-summary');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  return <section className="quote-builder" aria-labelledby="quote-builder-title">
    <div className="quote-builder-panel">
      {validationMessage && <div className="quote-validation-message" role="alert">{validationMessage}</div>}
      <div className="quote-builder-heading">
        <span className="site-eyebrow"><i/> COTIZADOR GUIADO</span>
        <h2 id="quote-builder-title">Arma tu solicitud</h2>
        <p>Añade cada artículo por separado. Puedes indicar medidas, cantidad, diseño, acabados y si requiere instalación.</p>
      </div>
      {restoredFromSession && (
        <div className="quote-data-notice" role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span>Recuperamos los artículos que estabas configurando antes de recargar.</span>
          <button type="button" onClick={resetQuoteDraft} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <RotateCcw size={13} aria-hidden="true" /> Empezar de cero
          </button>
        </div>
      )}
      {hasExtraRequestedProducts && <p className="quote-data-notice" role="status">El enlace incluía más de {MAX_QUOTE_ITEMS} artículos. Se cargaron los primeros {MAX_QUOTE_ITEMS}; revisa la lista antes de enviar.</p>}
      {productLoadError && <div className="quote-data-warning" role="alert"><span>No se cargó la matriz de tarifas. Puedes solicitar una revisión sin seleccionar tarifas.</span><button type="button" onClick={() => setProductLoadAttempt((attempt) => attempt + 1)}>Reintentar</button></div>}
      {quoteDataLoadError && <div className="quote-data-warning" role="alert"><span>La solicitud supera el límite de datos. Reduce texto o artículos antes de enviarla.</span></div>}

      <section className="quote-step quote-items-step" aria-labelledby="quote-items-title">
        <div className="quote-step-heading"><span aria-hidden="true">01</span><div><h3 id="quote-items-title" tabIndex={-1}>Artículos de la cotización</h3><p>{items.length} {items.length === 1 ? 'artículo' : 'artículos'} · cada uno conserva sus propias opciones.</p></div></div>
        <div className="quote-items-list">
          {items.map((item, index) => <QuoteItemEditor key={item.id} item={item} index={index} services={services} products={products} canRemove={items.length > 1} onUpdate={updateItem} onRemove={removeItem}/>) }
        </div>
        <button type="button" className="quote-add-item" onClick={addItem} disabled={items.length >= MAX_QUOTE_ITEMS}><Plus size={16}/>{items.length >= MAX_QUOTE_ITEMS ? `Límite de ${MAX_QUOTE_ITEMS} artículos` : 'Añadir otro artículo'}</button>
      </section>

      {installItems.length > 0 && <section className="quote-step quote-location-step" aria-labelledby="quote-location-title">
        <div className="quote-step-heading"><span aria-hidden="true">02</span><div><h3 id="quote-location-title">Lugar de instalación</h3><p>Indica el mismo lugar para los {installItems.length} {installItems.length === 1 ? 'artículo con instalación solicitada' : 'artículos con instalación solicitada'}.</p></div></div>
        <label className="quote-check-option quote-location-unknown"><input type="checkbox" checked={location.locationUnknown} onChange={(event) => updateLocation((current) => ({ ...current, locationUnknown: event.target.checked }))}/><span><b>Aún no conozco el lugar exacto</b><small>El equipo me ayudará a precisarlo antes de confirmar el valor.</small></span></label>
        {!location.locationUnknown && <>
          <div className="quote-step-fields quote-location-fields">
            <label>Dirección o referencia del lugar <span>(necesaria para estimar instalación)</span>
            <input id="quote-installation-address" required value={location.address} onChange={(event) => updateLocation((current) => ({ ...current, address: event.target.value }))} placeholder="Ciudad, calle, local o referencia" maxLength={240}/>
            </label>
            <label>Enlace del pin de Google Maps <span>(opcional)</span>
              <input id="quote-installation-maps-url" value={location.mapsUrl} onChange={(event) => updateLocation((current) => ({ ...current, mapsUrl: event.target.value }))} placeholder="Pega el enlace compartido desde Google Maps" maxLength={1000} aria-invalid={mapsUrlInvalid} aria-describedby="quote-maps-help"/>
            </label>
          </div>
          <div className="quote-maps-actions">
            {mapLink && <a href={mapLink} target="_blank" rel="noopener noreferrer"><MapPin size={16}/>{isGoogleMapsUrl(location.mapsUrl) ? 'Abrir pin en Google Maps' : 'Buscar lugar en Google Maps'}<ArrowUpRight size={14}/></a>}
            <p id="quote-maps-help">Busca la dirección en Google Maps. Para compartir un pin exacto, copia el enlace de Google Maps y pégalo aquí.</p>
          </div>
          {mapsUrlInvalid && <small className="quote-location-error" role="alert">Pega un enlace HTTPS válido de Google Maps.</small>}
          {location.mapsUrl.trim() && !mapsUrlInvalid && <p className="quote-pin-confirmation"><MapPin size={14}/> Enlace de ubicación listo para incluir en la solicitud.</p>}
        </>}
        <div className="quote-step-fields quote-install-details">
          <label>Piso o nivel <span>(si aplica)</span><input value={location.floor} onChange={(event) => updateLocation((current) => ({ ...current, floor: event.target.value }))} placeholder="Ej. planta baja, piso 2" maxLength={80}/></label>
          <label>Altura aproximada de trabajo <span>(opcional)</span><div className="quote-number-unit"><input type="number" inputMode="decimal" min={0} step="0.1" value={location.workHeight} onChange={(event) => updateLocation((current) => ({ ...current, workHeight: event.target.value }))} placeholder="Por definir"/><span>m</span></div></label>
          <label className="quote-location-wide">Acceso, horario o detalle del sitio <span>(opcional)</span><input value={location.accessNotes} onChange={(event) => updateLocation((current) => ({ ...current, accessNotes: event.target.value }))} placeholder="Describe cualquier condición que debamos considerar" maxLength={240}/></label>
        </div>
      </section>}

      {(() => {
        const areaItem = items.find((entry) => entry.calculationMode === 'area');
        const initialWidthCm = areaItem
          ? areaItem.measurementUnit === 'm' ? areaItem.width * 100 : areaItem.width
          : 50;
        const initialHeightCm = areaItem
          ? areaItem.measurementUnit === 'm' ? areaItem.height * 100 : areaItem.height
          : 50;
        return (
          <ArtworkPreflightDropzone
            compact
            initialWidthCm={initialWidthCm}
            initialHeightCm={initialHeightCm}
          />
        );
      })()}
    </div>

    <aside className="quote-builder-summary">
      <div className="quote-summary-icon"><Sparkles size={20}/></div>
      <span className="site-eyebrow"><i/> RESUMEN DE TU PROYECTO</span>
      <h3>{items.length > 1 ? `Tu cotización · ${items.length} artículos` : items[0]?.project.trim() || 'Tu proyecto'}</h3>
      <div className="quote-summary-items">
        {items.map((item, index) => <section key={item.id} className="quote-summary-item">
          <b>{String(index + 1).padStart(2, '0')} · {item.project.trim() || 'Artículo por definir'}</b>
          <small>{item.service || 'Familia por seleccionar'} · {item.productName || 'Producto por definir'}{item.sku ? ` · SKU ${item.sku}` : ''}</small>
          <small>{itemSummary(item)}</small>
          {item.pricePreview && <small className="quote-summary-item-prices">Estimado por artículo · Normal {item.pricePreview.normal == null ? 'pendiente' : formatPrice(item.pricePreview.normal)} · Instalación {item.pricePreview.installation == null ? 'pendiente' : formatPrice(item.pricePreview.installation)} · Corporativo {item.pricePreview.corporate == null ? 'pendiente' : formatPrice(item.pricePreview.corporate)}</small>}
          {(item.extrasTotal || 0) > 0 && <small className="quote-summary-item-extras">Extras incluidos: {formatPrice(item.extrasTotal || 0)}</small>}
        </section>)}
      </div>
      <div className="quote-summary-totals" aria-label="Totales estimados de la cotización">
        <b>Totales estimados · incluyen extras</b>
        {summaryTotals.map((total) => <div key={total.tier}><span>{total.label}</span><strong>{total.amount == null ? 'Pendiente de revisión' : formatPrice(total.amount)}</strong></div>)}
      </div>
      {installItems.length > 0 && <div className="quote-summary-location"><MapPin size={15}/><span><b>Instalación solicitada</b><small>{location.locationUnknown ? 'Lugar por definir con el equipo' : location.address || 'Añade la dirección del sitio'}</small>{location.floor && <small>Piso/nivel: {location.floor}</small>}{location.workHeight && <small>Altura: {location.workHeight} m</small>}{mapLink && !mapsUrlInvalid && <a href={mapLink} target="_blank" rel="noopener noreferrer">Ver ubicación en Google Maps <ArrowUpRight size={12}/></a>}</span></div>}
      <div className="quote-summary-price"><CircleHelp size={17}/><span><b>Estimado sujeto a validación</b><small>Los valores por artículo son referenciales. La instalación y los acabados se confirman según el lugar y el alcance.</small></span></div>
      <a className="quote-continue-button" href="#formulario-cotizacion"><span><b>Continuar con mis datos</b><small>El equipo revisará tu solicitud y te responderá.</small></span><ArrowRight size={17} aria-hidden="true"/></a>
      <button type="button" className="quote-print-button" onClick={printSummary}><Printer size={16}/> Imprimir resumen</button>
    </aside>

    <article className="quote-print-sheet" aria-hidden="true">
      <img src="/brand/visualcorp-wordmark.png" alt="Visual Corp"/>
      <p className="quote-print-kicker">SOLICITUD DE COTIZACIÓN</p>
      <h1>{items.length > 1 ? `Cotización de ${items.length} artículos` : items[0]?.project.trim() || 'Proyecto por definir'}</h1>
      <p>Resumen para revisar con el equipo de Visual Corp · {new Date().toLocaleDateString('es-EC')}</p>
      <ol>{items.map((item, index) => <li key={item.id}><b>{String(index + 1).padStart(2, '0')} · {item.project || 'Artículo por definir'}</b><p>{item.service || 'Familia por seleccionar'} · {item.productName || 'Producto por definir'}</p><p>{itemSummary(item)}</p></li>)}</ol>
      {installItems.length > 0 && <div><b>Instalación</b><p>{location.locationUnknown ? 'Lugar por definir con el equipo' : location.address || 'Lugar pendiente'}{location.floor ? ` · ${location.floor}` : ''}{location.workHeight ? ` · altura ${location.workHeight} m` : ''}</p>{location.mapsUrl && isGoogleMapsUrl(location.mapsUrl) && <p>{location.mapsUrl}</p>}{location.accessNotes && <p>{location.accessNotes}</p>}</div>}
      <p className="quote-print-disclaimer">Los estimados son referenciales y no constituyen una oferta final ni confirman disponibilidad. Visual Corp confirma precio, materiales, ojales, instalación y tiempos según cada artículo y el lugar del trabajo.</p>
    </article>
  </section>;
}
