import React, { useEffect, useMemo, useState } from 'react';
import { CircleHelp, Printer, Ruler, Sparkles, Wrench } from 'lucide-react';
import './quote-calculator.css';
import { calculateScenario, loadQuoteProducts, type PricingMode, type QuoteProduct } from './pricing';

export type QuoteService = { id: string; name: string };
export type QuoteDraft = {
  service: string;
  project: string;
  calculationMode: 'unknown' | 'area' | 'units';
  measurementUnit: 'cm' | 'm';
  width: number;
  height: number;
  area: number;
  quantity: number;
  designSupport: 'ready' | 'adapt' | 'create' | 'unknown';
  installation: boolean;
  finishing: string;
  productId?: string;
  productName?: string;
  pricingMode?: PricingMode;
  pricePreview?: { normal: number | null; installation: number | null; corporate: number | null };
  priceStatus?: 'pending-validation';
};

type Props = {
  services: QuoteService[];
  initialService?: string;
  onChange: (quote: QuoteDraft) => void;
};

const initialDraft = (service = ''): QuoteDraft => ({
  service,
  project: '',
  calculationMode: 'unknown',
  measurementUnit: 'cm',
  width: 100,
  height: 100,
  area: 0,
  quantity: 1,
  designSupport: 'unknown',
  installation: false,
  finishing: '',
});

const designLabels: Record<QuoteDraft['designSupport'], string> = {
  ready: 'Ya tengo el arte listo',
  adapt: 'Necesito adaptar un diseño',
  create: 'Necesito crear el diseño',
  unknown: 'Aún no lo sé',
};

function areaBasis(draft: QuoteDraft) {
  const area = draft.measurementUnit === 'cm'
    ? draft.width * draft.height / 10000
    : draft.width * draft.height;
  return area * draft.quantity;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value);
}

export function QuoteConfigurator({ services, initialService = '', onChange }: Props) {
  const [draft, setDraft] = useState<QuoteDraft>(() => initialDraft(initialService));
  const [productId, setProductId] = useState('');
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  useEffect(() => { loadQuoteProducts().then(setProducts).catch(() => setProducts([])); }, []);
  const pricingMode: PricingMode = draft.calculationMode === 'area' ? 'area' : 'quantity';
  const modeProducts = products.filter((product) => product.mode === pricingMode || (pricingMode === 'quantity' && product.mode === 'fixed'));
  const selectedProduct = modeProducts.find((product) => product.source_key === productId) || modeProducts[0];
  const activeProduct = draft.calculationMode === 'unknown' ? undefined : selectedProduct;
  const selectedService = services.find((service) => service.name === draft.service || service.id === draft.service);
  const productBasis = draft.calculationMode === 'area' ? areaBasis(draft) : draft.quantity;
  const prices = selectedProduct ? {
    normal: calculateScenario(selectedProduct, 'normal', productBasis),
    installation: calculateScenario(selectedProduct, 'installation', productBasis),
    corporate: calculateScenario(selectedProduct, 'corporate', productBasis),
  } : { normal: null, installation: null, corporate: null };
  const normalizedDraft = useMemo(() => ({
    ...draft,
    service: selectedService?.name || draft.service,
    productId: activeProduct?.source_key,
    productName: activeProduct?.name,
    pricingMode: activeProduct?.mode === 'area' ? 'area' as const : activeProduct ? 'quantity' as const : undefined,
    pricePreview: activeProduct ? prices : undefined,
    priceStatus: activeProduct ? 'pending-validation' as const : undefined,
    width: draft.calculationMode === 'area' ? draft.width : 0,
    height: draft.calculationMode === 'area' ? draft.height : 0,
    area: draft.calculationMode === 'area' ? (draft.measurementUnit === 'cm' ? draft.width * draft.height / 10000 : draft.width * draft.height) : 0,
    quantity: draft.calculationMode === 'unknown' ? 0 : draft.quantity,
  }), [draft, selectedService, activeProduct]);
  const area = draft.calculationMode === 'area'
    ? (draft.measurementUnit === 'cm' ? draft.width * draft.height / 10000 : draft.width * draft.height)
    : 0;

  useEffect(() => onChange(normalizedDraft), [normalizedDraft, onChange]);
  useEffect(() => {
    if (!initialService) return;
    const match = services.find((service) => service.name === initialService || service.id === initialService);
    if (match) setDraft((current) => ({ ...current, service: match.name }));
  }, [initialService, services]);

  const update = <K extends keyof QuoteDraft>(key: K, value: QuoteDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

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
          <p>Elige la calculadora por medidas o por cantidad y mira los escenarios de tarifa mientras configuras el pedido.</p>
      </div>

      <div className="quote-builder-fields">
        <label>Familia de servicio
          <select value={draft.service} onChange={(event) => update('service', event.target.value)}>
            <option value="">Selecciona una familia</option>
            {services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
          </select>
        </label>
        <label>¿Qué pieza o proyecto necesitas?<span> (requerido)</span>
          <input value={draft.project} onChange={(event) => update('project', event.target.value)} placeholder="Ej. letrero para la fachada" maxLength={120}/>
        </label>

        <fieldset className="quote-builder-mode">
          <legend>¿Qué información tienes?</legend>
          <div className="quote-mode-options">
            <button type="button" className={draft.calculationMode === 'area' ? 'active' : ''} aria-pressed={draft.calculationMode === 'area'} onClick={() => update('calculationMode', 'area')}><Ruler size={17}/> Medidas</button>
            <button type="button" className={draft.calculationMode === 'units' ? 'active' : ''} aria-pressed={draft.calculationMode === 'units'} onClick={() => update('calculationMode', 'units')}><span className="quote-unit-icon">×</span> Cantidad</button>
            <button type="button" className={draft.calculationMode === 'unknown' ? 'active' : ''} aria-pressed={draft.calculationMode === 'unknown'} onClick={() => update('calculationMode', 'unknown')}><CircleHelp size={17}/> Aún no sé</button>
          </div>
        </fieldset>

        {draft.calculationMode === 'area' && <div className="quote-dimension-block">
          <div className="quote-unit-toggle" role="group" aria-label="Unidad de medida">
            <button type="button" aria-pressed={draft.measurementUnit === 'cm'} className={draft.measurementUnit === 'cm' ? 'active' : ''} onClick={() => update('measurementUnit', 'cm')}>cm</button>
            <button type="button" aria-pressed={draft.measurementUnit === 'm'} className={draft.measurementUnit === 'm' ? 'active' : ''} onClick={() => update('measurementUnit', 'm')}>m</button>
          </div>
          <div className="quote-field-pair">
            <label>Ancho ({draft.measurementUnit})<input type="number" min="0.01" step="any" value={draft.width} onChange={(event) => update('width', Math.max(0.01, Number(event.target.value) || 0.01))}/></label>
            <label>Alto ({draft.measurementUnit})<input type="number" min="0.01" step="any" value={draft.height} onChange={(event) => update('height', Math.max(0.01, Number(event.target.value) || 0.01))}/></label>
          </div>
          <p className="quote-area-readout">Área referencial por pieza <b>{area.toFixed(2)} m²</b></p>
        </div>}

        {draft.calculationMode !== 'unknown' && <label>Producto o material
          <select value={selectedProduct?.source_key || ''} onChange={(event) => setProductId(event.target.value)} disabled={!modeProducts.length}>
            {modeProducts.map((product) => <option key={product.source_key} value={product.source_key}>{product.name}</option>)}
          </select>
        </label>}

        {draft.calculationMode !== 'unknown' && <label>Cantidad de piezas
          <input type="number" min="1" step="1" value={draft.quantity} onChange={(event) => update('quantity', Math.max(1, Math.floor(Number(event.target.value) || 1)))}/>
        </label>}

        <label>Estado del diseño
          <select value={draft.designSupport} onChange={(event) => update('designSupport', event.target.value as QuoteDraft['designSupport'])}>
            {Object.entries(designLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Acabados o detalles<span> (opcional)</span>
          <input value={draft.finishing} onChange={(event) => update('finishing', event.target.value)} placeholder="Ojales, laminado, color, material…" maxLength={180}/>
        </label>
        <label className="quote-installation-option"><input type="checkbox" checked={draft.installation} onChange={(event) => update('installation', event.target.checked)}/><span><Wrench size={17}/><span><b>Quiero consultar instalación</b><small>La disponibilidad y el valor se confirman según el proyecto.</small></span></span></label>
      </div>
    </div>

    <aside className="quote-builder-summary" aria-live="polite">
      <div className="quote-summary-icon"><Sparkles size={20}/></div>
      <span className="site-eyebrow"><i/> RESUMEN DE TU PROYECTO</span>
      <h3>{draft.project.trim() || 'Tu proyecto'}</h3>
      <dl>
        <div><dt>Servicio</dt><dd>{selectedService?.name || 'Por seleccionar'}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Producto</dt><dd>{selectedProduct?.name || 'Por seleccionar'}</dd></div>}
        <div><dt>Producción</dt><dd>{draft.calculationMode === 'area' ? `${draft.width} × ${draft.height} ${draft.measurementUnit} · ${area.toFixed(2)} m² por pieza` : draft.calculationMode === 'units' ? 'Por unidades' : 'Por definir con el equipo'}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Cantidad</dt><dd>{draft.quantity} {draft.quantity === 1 ? 'pieza' : 'piezas'}</dd></div>}
        <div><dt>Diseño</dt><dd>{designLabels[draft.designSupport]}</dd></div>
        {draft.installation && <div><dt>Instalación</dt><dd>Solicitada para revisión</dd></div>}
        {draft.finishing.trim() && <div><dt>Acabados</dt><dd>{draft.finishing}</dd></div>}
      </dl>
      {draft.calculationMode !== 'unknown' && <div className="quote-price-comparison" aria-live="polite">
        <div className="quote-price-comparison-heading"><span className="site-eyebrow"><i/> PRECIOS EN TIEMPO REAL</span><small>Base: {draft.calculationMode === 'area' ? `${productBasis.toFixed(2)} m²` : `${draft.quantity} ${draft.quantity === 1 ? 'unidad' : 'unidades'}`}</small></div>
        {([
          ['normal', 'Normal', prices.normal],
          ['installation', 'Con instalación', prices.installation],
          ['corporate', 'Corporativo', prices.corporate],
        ] as const).map(([key, label, price]) => <div className="quote-price-option" key={key}><span>{label}</span><b>{price == null ? 'Tarifa pendiente' : <>{formatPrice(price)}<small>* estimado</small></>}</b></div>)}
        <p>* Valores referenciales calculados con la matriz cargada; Visual Corp debe confirmar su vigencia antes de aceptar el pedido. Los escenarios sin tarifa específica quedan pendientes.</p>
      </div>}
      <div className="quote-summary-price"><CircleHelp size={17}/><span><b>Estimado sujeto a validación</b><small>Estos valores son referenciales y no constituyen una oferta final ni confirman disponibilidad.</small></span></div>
      <button type="button" className="quote-print-button" onClick={printSummary}><Printer size={16}/> Imprimir resumen</button>
    </aside>

    <article className="quote-print-sheet" aria-hidden="true">
      <img src="/brand/visualcorp-wordmark.png" alt="Visual Corp"/>
      <p className="quote-print-kicker">SOLICITUD DE COTIZACIÓN</p>
      <h1>{draft.project.trim() || 'Proyecto por definir'}</h1>
      <p>Resumen para revisar con el equipo de Visual Corp · {new Date().toLocaleDateString('es-EC')}</p>
      <dl>
        <div><dt>Servicio</dt><dd>{selectedService?.name || 'Por seleccionar'}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Producto</dt><dd>{selectedProduct?.name || 'Por seleccionar'}</dd></div>}
        <div><dt>Producción</dt><dd>{draft.calculationMode === 'area' ? `${draft.width} × ${draft.height} ${draft.measurementUnit} · ${area.toFixed(2)} m² por pieza` : draft.calculationMode === 'units' ? 'Por unidades' : 'Por definir con el equipo'}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Cantidad</dt><dd>{draft.quantity} {draft.quantity === 1 ? 'pieza' : 'piezas'}</dd></div>}
        <div><dt>Diseño</dt><dd>{designLabels[draft.designSupport]}</dd></div>
        {draft.installation && <div><dt>Instalación</dt><dd>Solicitada para revisión</dd></div>}
        {draft.finishing.trim() && <div><dt>Acabados o detalles</dt><dd>{draft.finishing}</dd></div>}
        {draft.calculationMode !== 'unknown' && <div><dt>Estimados*</dt><dd>Normal: {prices.normal == null ? 'pendiente' : formatPrice(prices.normal)} · Instalación: {prices.installation == null ? 'pendiente' : formatPrice(prices.installation)} · Corporativo: {prices.corporate == null ? 'pendiente' : formatPrice(prices.corporate)}</dd></div>}
      </dl>
      <p className="quote-print-disclaimer">* Estimados calculados con tarifas importadas pendientes de validación. Este documento resume una solicitud, no es una proforma y no confirma precio final, disponibilidad, especificaciones ni plazos.</p>
    </article>
  </section>;
}
