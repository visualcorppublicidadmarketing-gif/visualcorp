import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, CircleHelp, MapPin, Plus, Printer, Ruler, Sparkles, Trash2, Wrench } from 'lucide-react';
import { getGoogleMapsOpenUrl, isGoogleMapsUrl } from '../../lib/maps';
import './quote-calculator.css';
import { calculateScenario, loadQuoteProducts, type PricingMode, type QuoteProduct } from './pricing';
import { multiProductQuoteService } from '../content';

export type QuoteService = { id: string; name: string };
export type QuoteCalculationMode = 'unknown' | 'area' | 'units';
export type QuoteDesignSupport = 'ready' | 'adapt' | 'create' | 'unknown';
export type QuoteLineItemDraft = {
  id: string;
  service: string;
  project: string;
  calculationMode: QuoteCalculationMode;
  measurementUnit: 'cm' | 'm';
  width: number;
  height: number;
  area: number;
  quantity: number;
  designSupport: QuoteDesignSupport;
  finishing: string;
  productId?: string;
  productName?: string;
  grommets: boolean;
  grommetSize: 'small' | 'large' | '';
  grommetCount: number | null;
  installation: boolean;
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
  initialQuantityRanges?: string[];
  onChange: (quote: QuoteDraft) => void;
};

const MAX_QUOTE_ITEMS = 12;
const designLabels: Record<QuoteDesignSupport, string> = {
  ready: 'Ya tengo el arte listo',
  adapt: 'Necesito adaptar un diseño',
  create: 'Necesito crear el diseño',
  unknown: 'Aún no lo sé',
};

const quantityFromRange = (range: string) => {
  const first = range.match(/[\d]+(?:[.,][\d]+)?/)?.[0];
  return first ? Math.max(1, Math.floor(Number(first.replace(',', '.')) || 1)) : 1;
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `quote-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeItem(service = '', project = '', quantity = 1): QuoteLineItemDraft {
  return {
    id: makeId(), service, project, calculationMode: 'unknown', measurementUnit: 'cm',
    width: 100, height: 100, area: 0, quantity, designSupport: 'unknown', finishing: '',
    grommets: false, grommetSize: '', grommetCount: null, installation: false,
  };
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

function hasLona(item: QuoteLineItemDraft) {
  return /\blonas?\b/i.test(`${item.project} ${item.productName || ''}`);
}

function itemSummary(item: QuoteLineItemDraft) {
  const measurements = item.calculationMode === 'area'
    ? `${item.width} × ${item.height} ${item.measurementUnit} · ${areaOf(item).toFixed(2)} m² por pieza · ${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`
    : item.calculationMode === 'units'
      ? `${item.quantity} ${item.quantity === 1 ? 'pieza' : 'piezas'}`
      : 'Medidas y cantidad por definir';
  const details = [measurements, `Diseño: ${designLabels[item.designSupport]}`];
  if (item.finishing.trim()) details.push(`Acabados: ${item.finishing.trim()}`);
  if (item.grommets) details.push(`Ojales ${item.grommetSize === 'small' ? 'pequeños' : item.grommetSize === 'large' ? 'grandes' : 'por definir'}${item.grommetCount ? ` · ${item.grommetCount}` : ''}`);
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
      ? compatible.filter((product) => normalize(`${product.name} ${product.family}`).includes(query))
      : compatible;
    const selected = compatible.find((product) => product.source_key === item.productId);
    return selected && !filtered.some((product) => product.source_key === selected.source_key) ? [selected, ...filtered] : filtered;
  }, [item.calculationMode, item.productId, productSearch, products]);
  const selectedProduct = products.find((product) => product.source_key === item.productId);
  const update = (patch: Partial<QuoteLineItemDraft>) => onUpdate(item.id, patch);
  const chooseMode = (calculationMode: QuoteCalculationMode) => {
    const product = products.find((row) => row.source_key === item.productId);
    const compatible = !product || calculationMode === 'unknown'
      || (calculationMode === 'area' && product.mode === 'area')
      || (calculationMode === 'units' && (product.mode === 'quantity' || product.mode === 'fixed'));
    update({ calculationMode, ...(!compatible ? { productId: undefined, productName: undefined } : {}) });
  };
  const chooseProduct = (sourceKey: string) => {
    const product = products.find((row) => row.source_key === sourceKey);
    if (!product) {
      update({ productId: undefined, productName: undefined });
      return;
    }
    update({
      productId: product.source_key,
      productName: product.name,
      calculationMode: product.mode === 'area' ? 'area' : 'units',
      project: item.project.trim() ? item.project : product.name,
    });
    setProductSearch('');
  };
  const pricePreview = selectedProduct && item.calculationMode !== 'unknown' ? {
    normal: calculateScenario(selectedProduct, 'normal', basisOf(item)),
    installation: calculateScenario(selectedProduct, 'installation', basisOf(item)),
    corporate: calculateScenario(selectedProduct, 'corporate', basisOf(item)),
  } : null;

  return <article className="quote-item-card" aria-labelledby={`quote-item-title-${item.id}`}>
    <header className="quote-item-heading">
      <div><span>ARTÍCULO {String(index + 1).padStart(2, '0')}</span><h4 id={`quote-item-title-${item.id}`}>{item.project.trim() || `Artículo ${index + 1}`}</h4></div>
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
      </label>
      <label>Cantidad de piezas
        <input type="number" inputMode="numeric" min={1} step={1} value={item.quantity} onChange={(event) => update({ quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}/>
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
      <label className="quote-check-option"><input type="checkbox" checked={item.grommets} onChange={(event) => update({ grommets: event.target.checked, grommetSize: event.target.checked ? item.grommetSize : '', grommetCount: event.target.checked ? item.grommetCount : null })}/><span><b>Agregar ojales a esta lona</b><small>La cantidad y el tamaño se revisan con el equipo; no se suman al estimado automático.</small></span></label>
      {item.grommets && <div className="quote-step-fields quote-grommet-fields">
        <label>Tamaño del ojal
          <select id={`quote-item-grommet-${item.id}`} required value={item.grommetSize} onChange={(event) => update({ grommetSize: event.target.value as QuoteLineItemDraft['grommetSize'] })}>
            <option value="">Selecciona un tamaño</option><option value="small">Pequeño</option><option value="large">Grande</option>
          </select>
        </label>
        <label>Cantidad de ojales <span>(si la conoces)</span>
          <input type="number" inputMode="numeric" min={1} step={1} value={item.grommetCount ?? ''} onChange={(event) => update({ grommetCount: event.target.value ? Math.max(1, Math.floor(Number(event.target.value) || 1)) : null })} placeholder="Por definir"/>
        </label>
      </div>}
    </div>}

    <label className="quote-installation-option"><input type="checkbox" checked={item.installation} onChange={(event) => update({ installation: event.target.checked })}/><span><Wrench size={17}/><span><b>Quiero consultar instalación para este artículo</b><small>El valor se confirma según el lugar, altura y condiciones del trabajo.</small></span></span></label>

    {selectedProduct && item.calculationMode !== 'unknown' && <div className="quote-item-price" aria-live="polite">
      <span className="site-eyebrow"><i/> REFERENCIA PARA ESTE ARTÍCULO</span>
      <div><span>Normal</span><b>{pricePreview?.normal == null ? 'Tarifa pendiente' : `${formatPrice(pricePreview.normal)} · estimado`}</b></div>
      {item.installation && <div><span>Con instalación</span><b>{pricePreview?.installation == null ? 'Tarifa pendiente' : `${formatPrice(pricePreview.installation)} · estimado`}</b></div>}
      <small>{selectedProduct.confirmed ? 'Tarifa del catálogo; Visual Corp confirma disponibilidad y alcance.' : 'Tarifa referencial pendiente de validación por Visual Corp.'}</small>
    </div>}
  </article>;
}

export function QuoteConfigurator({ services, initialService = '', initialProducts = [], initialQuantityRanges = [], onChange }: Props) {
  const initialProductsKey = initialProducts.join('\u001f');
  const initialQuantityRangesKey = initialQuantityRanges.join('\u001f');
  const requestedProducts = initialProductsKey ? initialProductsKey.split('\u001f') : [];
  const requestedRanges = initialQuantityRangesKey ? initialQuantityRangesKey.split('\u001f') : [];
  const [items, setItems] = useState<QuoteLineItemDraft[]>(() => {
    if (requestedProducts.length) return requestedProducts.map((product, index) => makeItem(initialService, product, requestedRanges[index] ? quantityFromRange(requestedRanges[index]) : 1));
    return [makeItem(initialService)];
  });
  const [location, setLocation] = useState<QuoteInstallationLocation>({ address: '', mapsUrl: '', locationUnknown: false, floor: '', workHeight: '', accessNotes: '' });
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [productLoadError, setProductLoadError] = useState(false);
  const [productLoadAttempt, setProductLoadAttempt] = useState(0);
  const [quoteDataLoadError, setQuoteDataLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    setProductLoadError(false);
    loadQuoteProducts().then((rows) => { if (active) setProducts(rows); }).catch(() => {
      if (active) { setProducts([]); setProductLoadError(true); }
    });
    return () => { active = false; };
  }, [productLoadAttempt]);

  useEffect(() => {
    if (!requestedProducts.length || !products.length) return;
    setItems((current) => current.map((item, index) => {
      const target = normalize(requestedProducts[index] || '');
      const match = products.find((product) => normalize(product.name) === target || normalize(product.source_key) === target);
      if (!match) return item;
      return {
        ...item,
        project: item.project || match.name,
        productId: match.source_key,
        productName: match.name,
        calculationMode: match.mode === 'area' ? 'area' : 'units',
        quantity: requestedRanges[index] ? quantityFromRange(requestedRanges[index]) : item.quantity,
      };
    }));
  }, [initialProductsKey, initialQuantityRangesKey, products]);

  const updateItem = (id: string, patch: Partial<QuoteLineItemDraft>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const removeItem = (id: string) => setItems((current) => current.length > 1 ? current.filter((item) => item.id !== id) : current);
  const addItem = () => {
    if (items.length >= MAX_QUOTE_ITEMS) return;
    setItems((current) => [...current, makeItem(initialService)]);
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
      return {
        ...item,
        productId: selectedProduct?.source_key,
        productName: selectedProduct?.name || item.productName,
        area,
        pricingMode: selectedProduct?.mode === 'area' ? 'area' as const : selectedProduct ? 'quantity' as const : undefined,
        pricePreview,
        priceStatus: selectedProduct ? 'pending-validation' as const : undefined,
      };
    });
    const distinctServices = [...new Set(itemsWithPrice.map((item) => item.service.trim()).filter(Boolean))];
    const first = itemsWithPrice[0] || makeItem();
    const installRequested = itemsWithPrice.some((item) => item.installation);
    const projectNames = itemsWithPrice.map((item) => item.project.trim()).filter(Boolean);
    return {
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
      requestedQuantityRanges: requestedRanges.length ? requestedRanges : undefined,
      pricingMode: first.pricingMode,
      pricePreview: first.pricePreview,
      priceStatus: first.priceStatus,
      items: itemsWithPrice,
      installationLocation: installRequested ? location : undefined,
    };
  }, [items, location, products, initialProductsKey, initialQuantityRangesKey]);

  useEffect(() => {
    const payloadBytes = new TextEncoder().encode(JSON.stringify({ request: normalizedDraft })).length;
    setQuoteDataLoadError(payloadBytes > 17000);
    onChange(normalizedDraft);
  }, [normalizedDraft, onChange]);

  const installItems = items.filter((item) => item.installation);
  const mapLink = quoteLocationUrl(location);
  const mapsUrlInvalid = location.mapsUrl.trim().length > 0 && !isGoogleMapsUrl(location.mapsUrl.trim());

  const printSummary = () => {
    const cleanup = () => document.body.classList.remove('print-quote-summary');
    document.body.classList.add('print-quote-summary');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  return <section className="quote-builder" aria-labelledby="quote-builder-title">
    <div className="quote-builder-panel">
      <div className="quote-builder-heading">
        <span className="site-eyebrow"><i/> COTIZADOR GUIADO</span>
        <h2 id="quote-builder-title">Arma tu solicitud</h2>
        <p>Añade cada artículo por separado. Puedes indicar medidas, cantidad, diseño, acabados y si requiere instalación.</p>
      </div>
      {productLoadError && <div className="quote-data-warning" role="alert"><span>No se cargó la matriz de tarifas. Puedes solicitar una revisión sin seleccionar tarifas.</span><button type="button" onClick={() => setProductLoadAttempt((attempt) => attempt + 1)}>Reintentar</button></div>}
      {quoteDataLoadError && <div className="quote-data-warning" role="alert"><span>La solicitud supera el límite de datos. Reduce texto o artículos antes de enviarla.</span></div>}

      <section className="quote-step quote-items-step" aria-labelledby="quote-items-title">
        <div className="quote-step-heading"><span aria-hidden="true">01</span><div><h3 id="quote-items-title">Artículos de la cotización</h3><p>{items.length} {items.length === 1 ? 'artículo' : 'artículos'} · cada uno conserva sus propias opciones.</p></div></div>
        <div className="quote-items-list">
          {items.map((item, index) => <QuoteItemEditor key={item.id} item={item} index={index} services={services} products={products} canRemove={items.length > 1} onUpdate={updateItem} onRemove={removeItem}/>) }
        </div>
        <button type="button" className="quote-add-item" onClick={addItem} disabled={items.length >= MAX_QUOTE_ITEMS}><Plus size={16}/>{items.length >= MAX_QUOTE_ITEMS ? `Límite de ${MAX_QUOTE_ITEMS} artículos` : 'Añadir otro artículo'}</button>
      </section>

      {installItems.length > 0 && <section className="quote-step quote-location-step" aria-labelledby="quote-location-title">
        <div className="quote-step-heading"><span aria-hidden="true">02</span><div><h3 id="quote-location-title">Lugar de instalación</h3><p>Indica el mismo lugar para los {installItems.length} {installItems.length === 1 ? 'artículo con instalación solicitada' : 'artículos con instalación solicitada'}.</p></div></div>
        <label className="quote-check-option quote-location-unknown"><input type="checkbox" checked={location.locationUnknown} onChange={(event) => setLocation((current) => ({ ...current, locationUnknown: event.target.checked }))}/><span><b>Aún no conozco el lugar exacto</b><small>El equipo me ayudará a precisarlo antes de confirmar el valor.</small></span></label>
        {!location.locationUnknown && <>
          <div className="quote-step-fields quote-location-fields">
            <label>Dirección o referencia del lugar <span>(necesaria para estimar instalación)</span>
            <input id="quote-installation-address" required value={location.address} onChange={(event) => setLocation((current) => ({ ...current, address: event.target.value }))} placeholder="Ciudad, calle, local o referencia" maxLength={240}/>
            </label>
            <label>Enlace del pin de Google Maps <span>(opcional)</span>
              <input id="quote-installation-maps-url" value={location.mapsUrl} onChange={(event) => setLocation((current) => ({ ...current, mapsUrl: event.target.value }))} placeholder="Pega el enlace compartido desde Google Maps" maxLength={1000} aria-invalid={mapsUrlInvalid} aria-describedby="quote-maps-help"/>
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
          <label>Piso o nivel <span>(si aplica)</span><input value={location.floor} onChange={(event) => setLocation((current) => ({ ...current, floor: event.target.value }))} placeholder="Ej. planta baja, piso 2" maxLength={80}/></label>
          <label>Altura aproximada de trabajo <span>(opcional)</span><div className="quote-number-unit"><input type="number" inputMode="decimal" min={0} step="0.1" value={location.workHeight} onChange={(event) => setLocation((current) => ({ ...current, workHeight: event.target.value }))} placeholder="Por definir"/><span>m</span></div></label>
          <label className="quote-location-wide">Acceso, horario o detalle del sitio <span>(opcional)</span><input value={location.accessNotes} onChange={(event) => setLocation((current) => ({ ...current, accessNotes: event.target.value }))} placeholder="Describe cualquier condición que debamos considerar" maxLength={240}/></label>
        </div>
      </section>}
    </div>

    <aside className="quote-builder-summary">
      <div className="quote-summary-icon"><Sparkles size={20}/></div>
      <span className="site-eyebrow"><i/> RESUMEN DE TU PROYECTO</span>
      <h3>{items.length > 1 ? `Tu cotización · ${items.length} artículos` : items[0]?.project.trim() || 'Tu proyecto'}</h3>
      <div className="quote-summary-items">
        {items.map((item, index) => <section key={item.id} className="quote-summary-item">
          <b>{String(index + 1).padStart(2, '0')} · {item.project.trim() || 'Artículo por definir'}</b>
          <small>{item.service || 'Familia por seleccionar'} · {item.productName || 'Producto por definir'}</small>
          <small>{itemSummary(item)}</small>
        </section>)}
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
