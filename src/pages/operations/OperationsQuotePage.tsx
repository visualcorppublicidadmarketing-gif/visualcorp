import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleHelp, ClipboardList, Copy, FileText, MapPin, Plus, Printer, Trash2 } from 'lucide-react';
import { useWorkspace, formatMoney } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { AppFrame, PageHeading } from '../../app/layout';
import { EmptyState } from '../../components/feedback';
import { QuoteCustomerPicker } from '../../components/QuoteCustomerPicker';
import { QuoteProductPicker } from '../../components/QuoteProductPicker';
import { calculateQuotePrice, getQuoteBasis, quoteTiers } from '../../lib/quotePricing';
import { supabase } from '../../lib/supabaseClient';
import { CommercialDocumentDetails } from '../../components/CommercialDocumentDetails';
import { Sheet } from '../../components/ui/OperationalKit';
import './operations-quote.css';

const MAX_QUOTE_ITEMS = 40;
const newLineId = () => globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createLine = () => ({ id: newLineId(), productId: '', quantity: '1', widthCm: '100', heightCm: '100', option: '', concept: '' });
const tierAliases = { pvp: 'normal', instalacion: 'installation', corporativo: 'corporate' };

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function isMapsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'maps.google.com' || url.hostname.endsWith('.google.com') || url.hostname === 'goo.gl' || url.hostname.endsWith('.goo.gl'));
  } catch {
    return false;
  }
}

export function OperationsQuotePage() {
  const { data, flash } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const canSearchCustomers = hasPermission('crm', 'view');
  const canViewQuotes = hasPermission('quotes', 'view');
  const canEditQuotes = hasPermission('quotes', 'edit');
  const [lines, setLines] = useState([createLine()]);
  const [priceTier, setPriceTier] = useState('pvp');
  const [customer, setCustomer] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [phone, setPhone] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [installMapUrl, setInstallMapUrl] = useState('');
  const [installFloor, setInstallFloor] = useState('');
  const [installHeight, setInstallHeight] = useState('');
  const [installAccess, setInstallAccess] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [centralQuotes, setCentralQuotes] = useState<any[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  useEffect(() => {
    if (!supabase || !organizationId || !canViewQuotes) return;
    let active = true;
    supabase.from('central_quotes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100).then(({ data: rows, error }) => {
      if (!active) return;
      if (error) setQuoteError(error.message);
      else setCentralQuotes(rows || []);
    });
    return () => { active = false; };
  }, [organizationId, canViewQuotes]);

  const configuredLines = useMemo(() => lines.map((line) => {
    const product = data.catalog.find((item) => item.id === line.productId);
    const width = Number(line.widthCm);
    const height = Number(line.heightCm);
    const pieceQuantity = Number(line.quantity);
    const hasValidSize = product?.mode !== 'area' || (width > 0 && height > 0);
    const hasValidQuantity = Number.isInteger(pieceQuantity) && pieceQuantity > 0;
    const area = product?.mode === 'area' && hasValidSize ? (width * height) / 10000 : 0;
    const basis = getQuoteBasis(product, { quantity: pieceQuantity, area });
    const totals = Object.fromEntries(quoteTiers.map((tier) => [tier.id, product && hasValidSize && hasValidQuantity ? calculateQuotePrice(product, tier.id, basis, line.option) : null]));
    return { ...line, product, width, height, pieceQuantity, hasValidSize, hasValidQuantity, basis, area, totals };
  }), [lines, data.catalog]);

  const tierTotals = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => {
    const complete = configuredLines.length > 0 && configuredLines.every((line) => line.product && line.hasValidSize && line.hasValidQuantity && line.totals[tier.id] !== null);
    return [tier.id, complete ? configuredLines.reduce((sum, line) => sum + line.totals[tier.id], 0) : null];
  })), [configuredLines]);
  const allItemsSelected = configuredLines.every((line) => line.product && line.hasValidSize && line.hasValidQuantity);
  const pricesConfirmed = configuredLines.every((line) => line.product?.confirmed || line.product?.published === true);
  const selectedTotal = tierTotals[priceTier];
  const quoteCanSave = canEditQuotes && allItemsSelected && selectedTotal !== null && !saving && (!installMapUrl || isMapsUrl(installMapUrl)) && (priceTier !== 'instalacion' || installAddress.trim()) && proposalNotes.length <= 1200;

  const moveLine = (lineId, direction) => setLines((current) => {
    const index = current.findIndex((line) => line.id === lineId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return current;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered;
  });

  const duplicateLine = (line) => setLines((current) => current.length >= MAX_QUOTE_ITEMS ? current : [...current, { ...line, id: newLineId() }]);

  const updateLine = (lineId, changes) => setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...changes } : line));
  const resetForm = () => {
    setLines([createLine()]); setPriceTier('pvp'); setCustomer(''); setCustomerId(''); setPhone('');
    setInstallAddress(''); setInstallMapUrl(''); setInstallFloor(''); setInstallHeight(''); setInstallAccess(''); setProposalNotes('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!quoteCanSave || !supabase || !organizationId) return;
    setSaving(true); setQuoteError('');
    try {
      const chosen = tierAliases[priceTier] || 'normal';
      const itemPayload = configuredLines.map((line) => ({
        product_id: line.product.id,
        name: line.concept.trim() || line.product.name,
        category: line.product.family,
        quantity: line.basis,
        piece_quantity: line.pieceQuantity,
        unit: line.product.mode === 'area' ? 'm²' : line.product.unit || 'unidad',
        total: pricesConfirmed ? line.totals[priceTier] : null,
        normal_total: line.totals.pvp,
        installation_total: line.totals.instalacion,
        corporate_total: line.totals.corporativo,
        price_tier: priceTier,
        option: line.option || null,
        width_cm: line.product.mode === 'area' ? line.width : null,
        height_cm: line.product.mode === 'area' ? line.height : null,
        image: line.product.image || null,
      }));
      const notes = [...(priceTier === 'instalacion' ? [
        `Ubicación de instalación: ${installAddress.trim()}`,
        installMapUrl.trim() ? `Google Maps: ${installMapUrl.trim()}` : installAddress.trim() ? `Búsqueda Google Maps: ${mapsUrl(installAddress.trim())}` : '',
        installFloor.trim() ? `Piso / nivel: ${installFloor.trim()}` : '',
        installHeight.trim() ? `Altura aproximada: ${installHeight.trim()}` : '',
        installAccess.trim() ? `Acceso: ${installAccess.trim()}` : '',
      ] : []), proposalNotes.trim() ? `Notas de la propuesta: ${proposalNotes.trim()}` : ''].filter(Boolean).join('\n');
      const payloadBytes = new TextEncoder().encode(JSON.stringify(itemPayload)).length;
      if (payloadBytes > 45000) throw new Error('La propuesta supera el tamaño permitido. Reduce la cantidad de artículos o acorta sus conceptos.');
      if (notes.length > 2000) throw new Error('Las notas y los datos de instalación superan el límite permitido. Acórtalos antes de guardar.');
      const { data: result, error } = await supabase.rpc('create_central_quote', {
        p_customer_id: customerId || null,
        p_customer_name: customer.trim(),
        p_customer_phone: phone.trim(),
        p_items: itemPayload,
        p_normal: tierTotals.pvp,
        p_installation: tierTotals.instalacion,
        p_corporate: tierTotals.corporativo,
        p_chosen: chosen,
        p_selected: pricesConfirmed ? selectedTotal : null,
        p_confirmed: pricesConfirmed,
        p_notes: notes,
      });
      if (error) throw error;
      const { data: rows, error: readError } = await supabase.from('central_quotes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100);
      if (readError) throw readError;
      setCentralQuotes(rows || []);
      resetForm();
      flash(`Cotización ${result.quote_code} guardada con ${itemPayload.length} ${itemPayload.length === 1 ? 'artículo' : 'artículos'}.`);
    } catch (error: any) {
      setQuoteError(error.message || 'No se pudo sincronizar la cotización.');
    } finally { setSaving(false); }
  };

  return <AppFrame area="operations">
    <PageHeading eyebrow="COTIZADOR" title="Prepara una propuesta completa." description="Añade productos, configura cada artículo y compara el total normal, con instalación y corporativo desde el catálogo vigente."/>
    <div className="operations-quote-layout">
      <form className="panel form-panel operations-quote-form" onSubmit={save}>
        <div className="panel-heading"><div><span className="eyebrow">NUEVA PROPUESTA</span><h2>Artículos de la cotización</h2><p className="operations-quote-intro">Cada renglón conserva sus propias medidas, cantidad y opción de catálogo.</p></div><span className="operations-quote-count">{lines.length} / {MAX_QUOTE_ITEMS} artículos</span></div>
        <div className="operations-quote-lines">
          {configuredLines.map((line, index) => <section className="operations-quote-line" key={line.id} aria-labelledby={`operations-quote-line-${line.id}`}>
            <div className="operations-quote-line-heading"><div><span>ARTÍCULO {String(index + 1).padStart(2, '0')}</span><h3 id={`operations-quote-line-${line.id}`}>{line.concept.trim() || line.product?.name || `Artículo ${index + 1}`}</h3></div><div className="operations-quote-line-actions"><button className="operations-quote-icon-button" type="button" disabled={index === 0} onClick={() => moveLine(line.id, -1)} aria-label={`Mover artículo ${index + 1} arriba`} title="Mover arriba"><ArrowUp size={15}/></button><button className="operations-quote-icon-button" type="button" disabled={index === lines.length - 1} onClick={() => moveLine(line.id, 1)} aria-label={`Mover artículo ${index + 1} abajo`} title="Mover abajo"><ArrowDown size={15}/></button><button className="operations-quote-icon-button" type="button" disabled={lines.length >= MAX_QUOTE_ITEMS} onClick={() => duplicateLine(line)} aria-label={`Duplicar artículo ${index + 1}`} title="Duplicar"><Copy size={15}/></button>{lines.length > 1 && <button className="operations-quote-remove" type="button" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} aria-label={`Quitar artículo ${index + 1}`}><Trash2 size={15}/><span>Quitar</span></button>}</div></div>
            <QuoteProductPicker idPrefix={`operations-quote-product-${line.id}`} products={data.catalog} selected={line.product} onSelect={(product) => updateLine(line.id, { productId: product?.id || '', option: '' })}/>
            {line.product && <>
              {line.product.mode === 'area' && <div className="operations-quote-fields"><label>Ancho por pieza (cm)<input required min="1" step="any" type="number" value={line.widthCm} onChange={(event) => updateLine(line.id, { widthCm: event.target.value })}/></label><label>Alto por pieza (cm)<input required min="1" step="any" type="number" value={line.heightCm} onChange={(event) => updateLine(line.id, { heightCm: event.target.value })}/></label><div className="operations-quote-area"><span>Área total</span><b>{line.area && line.pieceQuantity ? `${(line.area * line.pieceQuantity).toFixed(2)} m²` : 'Completa las medidas'}</b><small>{line.area ? `${line.area.toFixed(2)} m² × ${line.pieceQuantity} ${line.pieceQuantity === 1 ? 'pieza' : 'piezas'}` : ''}</small></div></div>}
              <div className="operations-quote-fields operations-quote-item-details"><label>{line.product.mode === 'area' ? 'Número de piezas' : `Cantidad (${line.product.unit || 'unidades'})`}<input required min="1" step="1" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })}/></label><label>Concepto para esta línea (opcional)<input maxLength={160} value={line.concept} onChange={(event) => updateLine(line.id, { concept: event.target.value })} placeholder={line.product.name}/></label></div>
              {line.product.optionPrices?.length > 0 && <label className="operations-quote-option">Opción del catálogo<select value={line.option} onChange={(event) => updateLine(line.id, { option: event.target.value })}><option value="">Usar tarifa base del producto</option>{line.product.optionPrices.map((option, optionIndex) => <option key={`${option.label}-${optionIndex}`} value={option.label}>{option.label} · {formatMoney(option.price)}</option>)}</select></label>}
              <div className="operations-quote-line-total"><span>Artículo · {line.product.mode === 'area' ? `${line.basis.toFixed(2)} m²` : `${line.pieceQuantity} ${line.product.unit || 'unidades'}`}</span><b>{line.totals[priceTier] === null ? 'Tarifa no disponible' : formatMoney(line.totals[priceTier])}</b></div>
              {!line.product.confirmed && line.product.published !== true && <p className="operations-quote-pending" role="status"><CircleHelp size={14}/> Precio del catálogo pendiente de validación.</p>}
            </>}
          </section>)}
        </div>
        <button className="button button-outline operations-quote-add" disabled={lines.length >= MAX_QUOTE_ITEMS} type="button" onClick={() => setLines((current) => [...current, createLine()])}><Plus size={16}/> Añadir artículo</button>
        {lines.length >= MAX_QUOTE_ITEMS && <p className="operations-quote-limit-hint" role="status">Límite de {MAX_QUOTE_ITEMS} artículos por propuesta alcanzado.</p>}
        <section className="operations-quote-tier-section" aria-labelledby="operations-quote-tiers-title"><div className="operations-quote-section-heading"><div><span className="eyebrow">COMPARACIÓN DE PRECIOS</span><h3 id="operations-quote-tiers-title">Elige la tarifa de la propuesta</h3></div><span>El total suma todos los artículos</span></div><div className="operations-quote-tiers">{quoteTiers.map((tier) => <button key={tier.id} className={`operations-quote-tier${priceTier === tier.id ? ' active' : ''}${tierTotals[tier.id] === null ? ' unavailable' : ''}`} type="button" aria-pressed={priceTier === tier.id} onClick={() => setPriceTier(tier.id)}><span>{tier.label}{priceTier === tier.id && <Check size={14}/>}</span><b>{tierTotals[tier.id] === null ? 'Completa los artículos' : formatMoney(tierTotals[tier.id])}</b><small>{tier.description}</small></button>)}</div></section>

        {priceTier === 'instalacion' && <section className="operations-quote-install" aria-labelledby="operations-quote-install-title"><div className="operations-quote-section-heading"><div><span className="eyebrow"><MapPin size={13}/> DATOS PARA INSTALACIÓN</span><h3 id="operations-quote-install-title">Ubicación del trabajo</h3></div></div><label>Dirección o lugar de instalación<input required maxLength={300} value={installAddress} onChange={(event) => setInstallAddress(event.target.value)} placeholder="Sector, calle, edificio o referencia"/></label><div className="operations-quote-fields"><label>Enlace exacto de Google Maps (opcional)<input type="url" maxLength={800} value={installMapUrl} onChange={(event) => setInstallMapUrl(event.target.value)} placeholder="Pega el enlace para fijar el punto" aria-invalid={Boolean(installMapUrl && !isMapsUrl(installMapUrl))}/>{installMapUrl && !isMapsUrl(installMapUrl) && <small className="operations-quote-error-hint">Usa un enlace seguro de Google Maps.</small>}</label><label>Piso o nivel<input maxLength={60} value={installFloor} onChange={(event) => setInstallFloor(event.target.value)} placeholder="Ej. planta baja, piso 2"/></label><label>Altura aproximada<input maxLength={60} value={installHeight} onChange={(event) => setInstallHeight(event.target.value)} placeholder="Ej. 4 m"/></label><label>Acceso y condiciones<input maxLength={280} value={installAccess} onChange={(event) => setInstallAccess(event.target.value)} placeholder="Escalera, acceso, horario…"/></label></div>{installAddress.trim() && <a className="operations-quote-map-link" href={mapsUrl(installAddress.trim())} target="_blank" rel="noreferrer"><MapPin size={14}/> Buscar dirección en Google Maps <ArrowRight size={14}/></a>}</section>}

        <section className="operations-quote-customer"><div className="divider-label">DATOS DEL CLIENTE · OPCIONAL</div><div className="quote-customer-fields"><QuoteCustomerPicker customers={canSearchCustomers ? data.customers || [] : []} customerId={customerId} value={customer} onNameChange={(value) => { setCustomer(value); setCustomerId(''); setPhone(''); }} onSelect={(selectedCustomer) => { setCustomerId(selectedCustomer?.id || ''); if (selectedCustomer) { setCustomer(selectedCustomer.name); setPhone(selectedCustomer.phone || ''); } }}/><label>Teléfono de contacto<input value={phone} readOnly={Boolean(customerId)} onChange={(event) => setPhone(event.target.value)} placeholder="09…"/></label></div></section>
        <label className="operations-quote-notes">Notas internas para el equipo<textarea rows={3} maxLength={1200} value={proposalNotes} onChange={(event) => setProposalNotes(event.target.value)} placeholder="Acabados por confirmar, archivos pendientes, fecha solicitada…"/><small>{proposalNotes.length} / 1200 · Se guarda en la cotización central y no aparece al imprimir.</small></label>
        <div className="operations-quote-selected-total"><span>TOTAL SELECCIONADO · {quoteTiers.find((tier) => tier.id === priceTier)?.label}</span><b>{selectedTotal === null ? 'Completa los artículos' : pricesConfirmed ? formatMoney(selectedTotal) : `${formatMoney(selectedTotal)} · pendiente de validar`}</b><small>Los precios son referencias del catálogo; confirma disponibilidad y condiciones antes de cerrar con el cliente.</small></div>
        {quoteError && <div className="op-flow-alert error" role="alert">{quoteError}</div>}
        {canViewQuotes && !canEditQuotes && <p className="muted" role="status">Tu perfil puede consultar cotizaciones, pero no guardar nuevas propuestas.</p>}
        <button className="button button-dark form-submit operations-quote-submit" disabled={!quoteCanSave} type="submit">{saving ? 'Guardando propuesta…' : `Guardar cotización · ${lines.length} ${lines.length === 1 ? 'artículo' : 'artículos'}`} <Check size={16}/></button>
      </form>

      <aside className="operations-quote-summary"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">VISTA PREVIA</span><h2>Resumen de la propuesta</h2></div><ClipboardList size={18}/></div><ol className="operations-quote-summary-lines">{configuredLines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{line.concept.trim() || line.product?.name || 'Selecciona un producto'}</b><small>{line.product ? `${line.product.family} · ${line.product.mode === 'area' ? `${line.pieceQuantity} × ${line.width} × ${line.height} cm` : `${line.pieceQuantity} ${line.product.unit || 'unidades'}`}${line.option ? ` · ${line.option}` : ''}` : 'Elige una referencia del catálogo'}</small></div><strong>{line.product && line.totals[priceTier] !== null ? formatMoney(line.totals[priceTier]) : '—'}</strong></li>)}</ol><div className="operations-quote-summary-total"><span>{quoteTiers.find((tier) => tier.id === priceTier)?.label} · {lines.length} {lines.length === 1 ? 'artículo' : 'artículos'}</span><b>{selectedTotal === null ? '—' : formatMoney(selectedTotal)}</b></div>{priceTier === 'instalacion' && installAddress.trim() && <div className="operations-quote-summary-location"><MapPin size={15}/><span><b>{installAddress}</b><small>{[installFloor, installHeight && `Altura ${installHeight}`, installMapUrl && 'Pin de Maps añadido'].filter(Boolean).join(' · ')}</small></span></div>}<button className="button button-outline operations-quote-print-button" type="button" onClick={() => window.print()}><Printer size={16}/> Imprimir propuesta</button></section></aside>
    </div>
    <section className="panel operations-quote-history"><div className="panel-heading"><div><span className="eyebrow">HISTORIAL COMPARTIDO</span><h2>Propuestas recientes</h2></div><span className="muted-count">{centralQuotes.length} registradas</span></div><div className="activity-list">{centralQuotes.slice(0, 30).map((quote) => <article className="sale-activity" key={quote.id}><button className="sale-row operations-quote-detail-trigger" type="button" onClick={() => setSelectedQuote(quote)} aria-label={`Abrir ficha completa de ${quote.quote_code}`}><span className="sale-icon"><FileText size={17}/></span><span><b>{quote.quote_code} · {quote.customer_name || 'Sin cliente'}</b><small>{Array.isArray(quote.items) ? quote.items.map((item) => item.name || item.product_name || 'Artículo').join(', ') : ''} · {new Date(quote.created_at).toLocaleDateString('es-EC')}</small></span><strong>{quote.selected_total === null ? 'Por validar' : formatMoney(quote.selected_total)}</strong></button><div className="sale-payment-summary"><span>Estado: <b>{quote.status}</b></span><span>Tarifa: <b>{quote.price_confirmed ? 'Confirmada' : 'Por confirmar'}</b></span><button className="operations-quote-detail-link" type="button" onClick={() => setSelectedQuote(quote)}>Ver desglose <span aria-hidden="true">↗</span></button></div></article>)}{!centralQuotes.length && <EmptyState icon={FileText} title="Aún no hay cotizaciones" text="Las propuestas guardadas se sincronizan con el equipo y el POS."/>}</div></section>
    <Sheet open={Boolean(selectedQuote)} onOpenChange={(open) => { if (!open) setSelectedQuote(null); }} title={selectedQuote ? `Ficha · ${selectedQuote.quote_code}` : 'Ficha de cotización'} description="Productos, cantidades, imágenes y valores guardados en esta propuesta.">{selectedQuote && <CommercialDocumentDetails kind="quote" documentId={selectedQuote.id} initialDocument={selectedQuote}/>}</Sheet>
    <div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Propuestas sincronizadas</b><p>Los artículos, sus opciones y las tres tarifas quedan guardados en la cotización central para que el POS y el equipo compartan la misma información.</p></div></div>
    <section className="operations-quote-print-sheet" aria-hidden="true"><header><h1>Visual Corp</h1><p>Propuesta de cotización</p></header><h2>{customer.trim() || 'Cliente'}</h2>{phone.trim() && <p>Contacto: {phone}</p>}<table><thead><tr><th>Artículo</th><th>Detalle</th><th>Cantidad</th><th>Valor referencial</th></tr></thead><tbody>{configuredLines.map((line, index) => <tr key={line.id}><td>{line.concept.trim() || line.product?.name || `Artículo ${index + 1}`}</td><td>{line.product ? `${line.product.family}${line.option ? ` · ${line.option}` : ''}` : 'Producto pendiente'}{line.product?.mode === 'area' ? ` · ${line.width} × ${line.height} cm` : ''}</td><td>{line.pieceQuantity} {line.product?.mode === 'area' ? 'piezas' : line.product?.unit || 'unidades'}</td><td>{line.totals[priceTier] === null ? 'Por cotizar' : formatMoney(line.totals[priceTier])}</td></tr>)}</tbody></table><h3>{quoteTiers.find((tier) => tier.id === priceTier)?.label}: {selectedTotal === null ? 'Por cotizar' : formatMoney(selectedTotal)}</h3>{priceTier === 'instalacion' && <section><h3>Datos de instalación</h3><p>{installAddress}</p><p>{installFloor && `Nivel: ${installFloor} · `}{installHeight && `Altura: ${installHeight}`}</p>{installMapUrl && <p>Google Maps: {installMapUrl}</p>}<p>{installAccess}</p></section>}<p className="operations-quote-print-disclaimer">Valores referenciales sujetos a confirmación de disponibilidad, especificaciones y condiciones con el equipo de Visual Corp.</p></section>
  </AppFrame>;
}

export default OperationsQuotePage;
