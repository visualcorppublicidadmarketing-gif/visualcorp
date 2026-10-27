import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleHelp, Printer, Ruler, Sparkles, Wrench } from 'lucide-react';
import './quote-calculator.css';
import { calculateScenario, loadQuoteProducts, type PricingMode, type QuoteProduct } from './pricing';
import { multiProductQuoteService } from '../content';

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
  requestedProducts?: string[];
  requestedQuantityRanges?: string[];
  pricingMode?: PricingMode;
  pricePreview?: { normal: number | null; installation: number | null; corporate: number | null };
  priceStatus?: 'pending-validation';
};

type Props = {
  services: QuoteService[];
  initialService?: string;
  initialProducts?: string[];
  initialQuantityRanges?: string[];
  onChange: (quote: QuoteDraft) => void;
};

const quantityFromRange = (range: string) => {
  const first = range.match(/[\d]+(?:[.,][\d]+)?/)?.[0];
  return first ? Math.max(1, Math.floor(Number(first.replace(',', '.')) || 1)) : 1;
};

const quantityRangesSummary = (products: string[], ranges: string[]) => products.map((product, index) => {
  const range = ranges[index]?.trim();
  if (!range) return '';
  const cleanRange = range.replace(/(\d+)\.0\b/g, '$1');
  return `${product}: ${cleanRange} ${cleanRange === '1' ? 'unidad' : 'unidades'}`;
}).filter(Boolean).join(' · ');

const initialDraft = (service = '', products: string[] = [], quantityRanges: string[] = []): QuoteDraft => ({
  service,
  project: products.length === 1 ? products[0] : products.length > 1 ? 'Cotización de varios productos' : '',
  calculationMode: 'unknown',
  measurementUnit: 'cm',
  width: 100,
  height: 100,
  area: 0,
  quantity: quantityRanges.find(Boolean) ? quantityFromRange(quantityRanges.find(Boolean) || '') : 1,
  designSupport: 'unknown',
  installation: false,
  finishing: '',
  requestedProducts: products,
  requestedQuantityRanges: quantityRanges,
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

export function QuoteConfigurator({ services, initialService = '', initialProducts = [], initialQuantityRanges = [], onChange }: Props) {
  const initialProductsKey = initialProducts.join('\u001f');
  const initialQuantityRangesKey = initialQuantityRanges.join('\u001f');
  const requestedRanges = initialQuantityRangesKey ? initialQuantityRangesKey.split('\u001f') : [];
  const [draft, setDraft] = useState<QuoteDraft>(() => initialDraft(initialService, initialProducts, requestedRanges));
  const [productId, setProductId] = useState('');
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [productLoadError, setProductLoadError] = useState(false);
  const [productLoadAttempt, setProductLoadAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setProductLoadError(false);
    loadQuoteProducts().then((rows) => { if (active) setProducts(rows); }).catch(() => {
      if (active) { setProducts([]); setProductLoadError(true); }
    });
    return () => { active = false; };
  }, [productLoadAttempt]);
  const pricingMode: PricingMode = draft.calculationMode === 'area' ? 'area' : 'quantity';
  const modeProducts = products.filter((product) => product.mode === pricingMode || (pricingMode === 'quantity' && product.mode === 'fixed'));
  const selectedProduct = modeProducts.find((product) => product.source_key === productId) || modeProducts[0];
  const activeProduct = draft.calculationMode === 'unknown' ? undefined : selectedProduct;
  const selectedService = services.find((service) => service.name === draft.service || service.id === draft.service);
  const serviceSummary = selectedService?.name || (draft.service === multiProductQuoteService ? multiProductQuoteService : 'Por seleccionar');
  const quantitySummary = quantityRangesSummary(draft.requestedProducts || [], draft.requestedQuantityRanges || []);
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
    requestedProducts: initialProductsKey ? initialProductsKey.split('\u001f') : draft.requestedProducts,
    requestedQuantityRanges: initialQuantityRangesKey ? requestedRanges : draft.requestedQuantityRanges,
    pricingMode: activeProduct?.mode === 'area' ? 'area' as const : activeProduct ? 'quantity' as const : undefined,
    pricePreview: activeProduct ? prices : undefined,
    priceStatus: activeProduct ? 'pending-validation' as const : undefined,
    width: draft.calculationMode === 'area' ? draft.width : 0,
    height: draft.calculationMode === 'area' ? draft.height : 0,
    area: draft.calculationMode === 'area' ? (draft.measurementUnit === 'cm' ? draft.width * draft.height / 10000 : draft.width * draft.height) : 0,
    quantity: draft.calculationMode === 'unknown' ? 0 : draft.quantity,
  }), [draft, selectedService, activeProduct, initialProductsKey, initialQuantityRangesKey]);
  const area = draft.calculationMode === 'area'
    ? (draft.measurementUnit === 'cm' ? draft.width * draft.height / 10000 : draft.width * draft.height)
    : 0;

  useEffect(() => onChange(normalizedDraft), [normalizedDraft, onChange]);
  useEffect(() => {
    if (!initialService) return;
    const match = services.find((service) => service.name === initialService || service.id === initialService);
    if (match) setDraft((current) => ({ ...current, service: match.name }));
  }, [initialService, services]);
  useEffect(() => {
    const requested = initialProductsKey ? initialProductsKey.split('\u001f') : [];
    if (!requested.length || !products.length) return;
    const ranges = initialQuantityRangesKey ? requestedRanges : [];
    const firstRange = ranges.find(Boolean) || '';
    setDraft((current) => ({ ...current, project: current.project || (requested.length === 1 ? requested[0] : 'Cotización de varios productos'), requestedProducts: requested, requestedQuantityRanges: ranges, quantity: firstRange ? quantityFromRange(firstRange) : current.quantity }));
    if (requested.length !== 1) return;
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
    const target = normalize(requested[0]);
    const match = products.find((product) => normalize(product.name) === target || normalize(product.source_key) === target);
    if (!match || match.mode === 'fixed') return;
    setProductId(match.source_key);
    setDraft((current) => ({ ...current, calculationMode: match.mode === 'area' ? 'area' : 'units', requestedProducts: requested }));
  }, [products, initialProductsKey, initialQuantityRangesKey]);

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
        <p>Cuéntanos qué necesitas y qué información tienes. Si aún no conoces las medidas o la cantidad, el equipo te ayudará a definirlas.</p>
      </div>
      {productLoadError && <div className="quote-data-warning" role="alert"><span>No se cargó la matriz de tarifas. Puedes enviar tu solicitud, pero los estimados no aparecerán hasta que la calculadora esté disponible.</span><button type="button" onClick={() => setProductLoadAttempt((attempt) => attempt + 1)}>Reintentar</button></div>}

      <div className="quote-builder-fields">
        <section className="quote-step" aria-labelledby="quote-step-project">
          <div className="quote-step-heading"><span aria-hidden="true">01</span><div><h3 id="quote-step-project">El proyecto</h3><p>Una descripción breve ayuda a orientar la conversación.</p></div></div>
          <div className="quote-step-fields quote-project-fields">
            <label>Familia de servicio
              <select id="quote-service-family" required value={draft.service} onChange={(event) => update('service', event.target.value)}>
                <option value="">Selecciona una familia</option>
                {(draft.requestedProducts?.length || 0) > 1 && <option value={multiProductQuoteService}>{multiProductQuoteService}</option>}
                {services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
              </select>
            </label>
            <label>¿Qué pieza o proyecto necesitas?<span> (requerido)</span>
              <input id="quote-project-name" required value={draft.project} onChange={(event) => update('project', event.target.value)} placeholder="Ej. letrero para la fachada" maxLength={120}/>
            </label>
          </div>
        </section>

        <section className="quote-step" aria-labelledby="quote-step-production">
          <div className="quote-step-heading"><span aria-hidden="true">02</span><div><h3 id="quote-step-production">Medidas y cantidad</h3><p>Puedes cambiar esta opción en cualquier momento.</p></div></div>
          <fieldset className="quote-builder-mode" aria-describedby="quote-mode-help">
            <legend>¿Qué información tienes?</legend>
            <p id="quote-mode-help">Elige una opción; si no tienes los datos, continúa y los revisaremos contigo.</p>
            <div className="quote-mode-options">
              <label className={`quote-mode-option${draft.calculationMode === 'area' ? ' active' : ''}`}>
                <input type="radio" name="quote-calculation-mode" value="area" checked={draft.calculationMode === 'area'} onChange={() => update('calculationMode', 'area')}/>
                <Ruler size={17} aria-hidden="true"/><span><b>Medidas</b><small>Tengo ancho y alto</small></span>
              </label>
              <label className={`quote-mode-option${draft.calculationMode === 'units' ? ' active' : ''}`}>
                <input type="radio" name="quote-calculation-mode" value="units" checked={draft.calculationMode === 'units'} onChange={() => update('calculationMode', 'units')}/>
                <span className="quote-unit-icon" aria-hidden="true">×</span><span><b>Cantidad</b><small>Sé cuántas piezas necesito</small></span>
              </label>
              <label className={`quote-mode-option${draft.calculationMode === 'unknown' ? ' active' : ''}`}>
                <input type="radio" name="quote-calculation-mode" value="unknown" checked={draft.calculationMode === 'unknown'} onChange={() => update('calculationMode', 'unknown')}/>
                <CircleHelp size={17} aria-hidden="true"/><span><b>Aún no sé</b><small>Necesito orientación</small></span>
              </label>
            </div>
          </fieldset>

          {draft.calculationMode === 'area' && <div className="quote-dimension-block">
            <div className="quote-unit-toggle" role="group" aria-label="Unidad de medida">
              <button type="button" aria-pressed={draft.measurementUnit === 'cm'} className={draft.measurementUnit === 'cm' ? 'active' : ''} onClick={() => update('measurementUnit', 'cm')}>cm</button>
              <button type="button" aria-pressed={draft.measurementUnit === 'm'} className={draft.measurementUnit === 'm' ? 'active' : ''} onClick={() => update('measurementUnit', 'm')}>m</button>
            </div>
            <div className="quote-field-pair">
              <label>Ancho ({draft.measurementUnit})<input type="number" inputMode="decimal" min={0.01} step="any" value={draft.width} onChange={(event) => update('width', Math.max(0.01, Number(event.target.value) || 0.01))}/></label>
              <label>Alto ({draft.measurementUnit})<input type="number" inputMode="decimal" min={0.01} step="any" value={draft.height} onChange={(event) => update('height', Math.max(0.01, Number(event.target.value) || 0.01))}/></label>
            </div>
            <p className="quote-area-readout">Área referencial por pieza <b>{area.toFixed(2)} m²</b></p>
          </div>}

          {draft.calculationMode !== 'unknown' && <div className="quote-step-fields quote-production-fields">
            <label>Producto o material
              <select value={selectedProduct?.source_key || ''} onChange={(event) => setProductId(event.target.value)} disabled={!modeProducts.length}>
                {modeProducts.map((product) => <option key={product.source_key} value={product.source_key}>{product.name}</option>)}
              </select>
              {!modeProducts.length && products.length > 0 && <small className="quote-field-note">No hay un producto cargado para esta modalidad. Puedes solicitar que el equipo revise tu caso.</small>}
            </label>
            <label>Cantidad de piezas
              <input type="number" inputMode="numeric" min={1} step={1} value={draft.quantity} onChange={(event) => update('quantity', Math.max(1, Math.floor(Number(event.target.value) || 1)))}/>
            </label>
          </div>}
        </section>

        <section className="quote-step" aria-labelledby="quote-step-preparation">
          <div className="quote-step-heading"><span aria-hidden="true">03</span><div><h3 id="quote-step-preparation">Diseño y acabados</h3><p>Cuéntanos qué está listo y qué apoyo deseas consultar.</p></div></div>
          <div className="quote-step-fields quote-preparation-fields">
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
        </section>
      </div>
    </div>

    <aside className="quote-builder-summary">
      <div className="quote-summary-icon"><Sparkles size={20}/></div>
      <span className="site-eyebrow"><i/> RESUMEN DE TU PROYECTO</span>
      <h3>{draft.project.trim() || 'Tu proyecto'}</h3>
      <dl>
        <div><dt>Servicio</dt><dd>{serviceSummary}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Producto</dt><dd>{selectedProduct?.name || 'Por seleccionar'}</dd></div>}
        {(draft.requestedProducts?.length || 0) > 0 && (draft.requestedProducts?.length || 0) > 1 || (draft.requestedProducts?.length || 0) > 0 && draft.calculationMode === 'unknown' ? <div><dt>Productos de la tienda</dt><dd>{draft.requestedProducts?.join(' · ')}</dd></div> : null}
        {quantitySummary && <div><dt>Cantidades elegidas</dt><dd>{quantitySummary}</dd></div>}
        <div><dt>Producción</dt><dd>{draft.calculationMode === 'area' ? `${draft.width} × ${draft.height} ${draft.measurementUnit} · ${area.toFixed(2)} m² por pieza` : draft.calculationMode === 'units' ? 'Por unidades' : 'Por definir con el equipo'}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Cantidad</dt><dd>{draft.quantity} {draft.quantity === 1 ? 'pieza' : 'piezas'}</dd></div>}
        <div><dt>Diseño</dt><dd>{designLabels[draft.designSupport]}</dd></div>
        {draft.installation && <div><dt>Instalación</dt><dd>Solicitada para revisión</dd></div>}
        {draft.finishing.trim() && <div><dt>Acabados</dt><dd>{draft.finishing}</dd></div>}
      </dl>
      {draft.calculationMode !== 'unknown' && <div className="quote-price-comparison" aria-live="polite">
        <div className="quote-price-comparison-heading"><span className="site-eyebrow"><i/> REFERENCIAS DE TARIFA</span><small>Base: {draft.calculationMode === 'area' ? `${productBasis.toFixed(2)} m²` : `${draft.quantity} ${draft.quantity === 1 ? 'unidad' : 'unidades'}`}</small></div>
        {([
          ['normal', 'Normal', prices.normal],
          ['installation', 'Con instalación', prices.installation],
          ['corporate', 'Corporativo', prices.corporate],
        ] as const).map(([key, label, price]) => <div className="quote-price-option" key={key}><span>{label}</span><b>{price == null ? 'Tarifa pendiente' : <>{formatPrice(price)}<small>* estimado</small></>}</b></div>)}
        <p>* Valores referenciales calculados con la matriz cargada; Visual Corp debe confirmar su vigencia antes de aceptar el pedido. Los escenarios sin tarifa específica quedan pendientes.</p>
      </div>}
      <div className="quote-summary-price"><CircleHelp size={17}/><span><b>Estimado sujeto a validación</b><small>Estos valores son referenciales y no constituyen una oferta final ni confirman disponibilidad.</small></span></div>
      <a className="quote-continue-button" href="#formulario-cotizacion"><span><b>Continuar con mis datos</b><small>El equipo revisará tu solicitud y te responderá.</small></span><ArrowRight size={17} aria-hidden="true"/></a>
      <button type="button" className="quote-print-button" onClick={printSummary}><Printer size={16}/> Imprimir resumen</button>
    </aside>

    <article className="quote-print-sheet" aria-hidden="true">
      <img src="/brand/visualcorp-wordmark.png" alt="Visual Corp"/>
      <p className="quote-print-kicker">SOLICITUD DE COTIZACIÓN</p>
      <h1>{draft.project.trim() || 'Proyecto por definir'}</h1>
      <p>Resumen para revisar con el equipo de Visual Corp · {new Date().toLocaleDateString('es-EC')}</p>
      <dl>
        <div><dt>Servicio</dt><dd>{serviceSummary}</dd></div>
        {draft.calculationMode !== 'unknown' && <div><dt>Producto</dt><dd>{selectedProduct?.name || 'Por seleccionar'}</dd></div>}
        {(draft.requestedProducts?.length || 0) > 0 && (draft.requestedProducts?.length || 0) > 1 || (draft.requestedProducts?.length || 0) > 0 && draft.calculationMode === 'unknown' ? <div><dt>Productos de la tienda</dt><dd>{draft.requestedProducts?.join(' · ')}</dd></div> : null}
        {quantitySummary && <div><dt>Cantidades elegidas</dt><dd>{quantitySummary}</dd></div>}
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
