import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleHelp, ClipboardList, Copy, FileText, MapPin, Plus, Printer, ReceiptText, Trash2 } from 'lucide-react';
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
import { CommercialAssetsEditor } from '../../components/commercial/CommercialAssetsEditor';
import { GoogleMapsPreview } from '../../components/commercial/GoogleMapsPreview';
import { RichTextEditor } from '../../components/studio/RichTextEditor';
import { DatePicker } from '../../components/ui/Calendar';
import { persistCommercialAssets, type CommercialAssetDraft } from '../../lib/commercialAssets';
import './operations-quote.css';

const MAX_QUOTE_ITEMS = 40;
const newLineId = () => globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createLine = (custom = false) => ({ id: newLineId(), productId: '', quantity: '1', widthCm: '100', heightCm: '100', option: '', concept: '', additionalDescription: '', additionalDescriptionHtml: '<p></p>', custom, customUnit: 'unidad', customUnitPrice: '' });
const tierAliases = { pvp: 'normal', instalacion: 'installation', corporativo: 'corporate' };
const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function distributeMoney(total: number, weights: number[]) {
  const cents = Math.round(total * 100);
  const weightTotal = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!weights.length) return [];
  const raw = weights.map((weight) => weightTotal > 0 ? cents * Math.max(0, weight) / weightTotal : cents / weights.length);
  const allocated = raw.map(Math.floor);
  let remaining = cents - allocated.reduce((sum, value) => sum + value, 0);
  const remainderOrder = raw.map((value, index) => ({ index, fraction: value - allocated[index] })).sort((left, right) => right.fraction - left.fraction);
  for (let index = 0; index < remaining; index += 1) allocated[remainderOrder[index % remainderOrder.length].index] += 1;
  return allocated.map((value) => value / 100);
}

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
  const canDeleteQuotes = hasPermission('quotes', 'delete_records');
  const canViewSales = hasPermission('sales', 'view');
  const canDeleteSales = hasPermission('sales', 'delete_records');
  const [lines, setLines] = useState([createLine()]);
  const [priceTier, setPriceTier] = useState('pvp');
  const [customer, setCustomer] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [phone, setPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [jobName, setJobName] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [applyIVA, setApplyIVA] = useState(false);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [discountReason, setDiscountReason] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [installAddress, setInstallAddress] = useState('');
  const [installMapUrl, setInstallMapUrl] = useState('');
  const [installFloor, setInstallFloor] = useState('');
  const [installHeight, setInstallHeight] = useState('');
  const [installAccess, setInstallAccess] = useState('');
  const [proposalNotes, setProposalNotes] = useState('');
  const [clientBriefHtml, setClientBriefHtml] = useState('<p></p>');
  const [documentAssets, setDocumentAssets] = useState<CommercialAssetDraft[]>([]);
  const [centralQuotes, setCentralQuotes] = useState<any[]>([]);
  const [centralSales, setCentralSales] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null);
  const [removingDocumentId, setRemovingDocumentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  useEffect(() => {
    if (!supabase || !organizationId || (!canViewQuotes && !canViewSales)) {
      setCentralQuotes([]);
      setCentralSales([]);
      return;
    }
    let active = true;
    const quoteRequest = canViewQuotes
      ? supabase.from('central_quotes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null });
    const saleRequest = canViewSales
      ? supabase.from('sales').select('id,sale_code,status,total,created_at,branch_id,customer_id,customers(full_name),central_quote_id').eq('organization_id', organizationId).eq('status', 'confirmed').order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null });
    Promise.all([
      quoteRequest,
      saleRequest,
      supabase.from('commercial_history_exclusions').select('document_kind,document_id').eq('organization_id', organizationId),
    ]).then(([quoteResult, saleResult, exclusionsResult]) => {
      if (!active) return;
      const error = quoteResult.error || saleResult.error || exclusionsResult.error;
      if (error) { setQuoteError(error.message); return; }
      const excluded = new Set((exclusionsResult.data || []).map((entry) => `${entry.document_kind}:${entry.document_id}`));
      setCentralQuotes((quoteResult.data || []).filter((entry) => !excluded.has(`quote:${entry.id}`)));
      setCentralSales((saleResult.data || []).filter((entry) => !excluded.has(`sale:${entry.id}`)));
      setQuoteError('');
    });
    return () => { active = false; };
  }, [organizationId, canViewQuotes, canViewSales]);

  const historyItems = useMemo(() => [
    ...centralQuotes.map((document) => ({ ...document, documentKind: 'quote' as const, documentCode: document.quote_code, customerLabel: document.customer_name || 'Sin cliente', amount: document.selected_total, date: document.created_at })),
    ...centralSales.map((document) => ({ ...document, documentKind: 'sale' as const, documentCode: document.sale_code, customerLabel: document.customers?.full_name || 'Sin cliente', amount: document.total, date: document.created_at })),
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()), [centralQuotes, centralSales]);

  const removeFromHistory = async (document: any) => {
    if (!supabase || !organizationId || removingDocumentId) return;
    const isSale = document.documentKind === 'sale';
    const allowed = isSale ? canDeleteSales : canDeleteQuotes;
    if (!allowed) return;
    const subject = isSale ? 'venta' : 'cotización';
    const confirmed = window.confirm(
      `¿Quitar ${subject} ${document.documentCode} del historial del Cotizador?\n\n` +
      (isSale
        ? 'La venta, pagos, devoluciones y movimientos de caja o inventario se conservarán para la auditoría.'
        : 'La cotización y su desglose se conservarán en el sistema; solo dejará de aparecer aquí.')
    );
    if (!confirmed) return;
    setRemovingDocumentId(document.id);
    setQuoteError('');
    try {
      const { error } = await supabase.rpc('remove_commercial_history_entry', {
        p_kind: document.documentKind,
        p_document_id: document.id,
      });
      if (error) throw error;
      if (isSale) setCentralSales((rows) => rows.filter((row) => row.id !== document.id));
      else setCentralQuotes((rows) => rows.filter((row) => row.id !== document.id));
      if (selectedDocument?.id === document.id && selectedDocument?.documentKind === document.documentKind) setSelectedDocument(null);
      flash(`${isSale ? 'Venta' : 'Cotización'} ${document.documentCode} retirada del historial.`);
    } catch (error: any) {
      setQuoteError(error.message || `No se pudo retirar ${subject} del historial.`);
    } finally { setRemovingDocumentId(''); }
  };

  const configuredLines = useMemo(() => lines.map((line) => {
    const product = data.catalog.find((item) => item.id === line.productId);
    const width = Number(line.widthCm);
    const height = Number(line.heightCm);
    const pieceQuantity = Number(line.quantity);
    const hasValidSize = line.custom || product?.mode !== 'area' || (width > 0 && height > 0);
    const hasValidQuantity = Number.isInteger(pieceQuantity) && pieceQuantity > 0;
    const area = !line.custom && product?.mode === 'area' && hasValidSize ? (width * height) / 10000 : 0;
    const basis = line.custom ? pieceQuantity : getQuoteBasis(product, { quantity: pieceQuantity, area });
    const customPrice = Number(line.customUnitPrice);
    const totals = Object.fromEntries(quoteTiers.map((tier) => [tier.id, line.custom
      ? Number.isFinite(customPrice) && customPrice > 0 && hasValidQuantity ? roundMoney(customPrice * pieceQuantity) : null
      : product && hasValidSize && hasValidQuantity ? calculateQuotePrice(product, tier.id, basis, line.option) : null]));
    return { ...line, product, width, height, pieceQuantity, hasValidSize, hasValidQuantity, basis, area, totals, unit: line.custom ? line.customUnit || 'unidad' : product?.mode === 'area' ? 'm²' : product?.unit || 'unidad', title: line.custom ? line.concept.trim() : line.concept.trim() || product?.name || '' };
  }), [lines, data.catalog]);

  const rawTierTotals = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => {
    const complete = configuredLines.length > 0 && configuredLines.every((line) => (line.custom ? line.title : line.product) && line.hasValidSize && line.hasValidQuantity && line.totals[tier.id] !== null);
    return [tier.id, complete ? roundMoney(configuredLines.reduce((sum, line) => sum + line.totals[tier.id], 0)) : null];
  })), [configuredLines]);
  const discountRate = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const taxRate = applyIVA ? Number(data.calculatorSettings?.taxRate ?? 15) : 0;
  const extraCost = Math.max(0, Number(shippingCost) || 0);
  const tierFinancials = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => {
    const subtotal = rawTierTotals[tier.id];
    if (subtotal === null) return [tier.id, null];
    const discount = roundMoney(subtotal * discountRate / 100);
    const taxable = roundMoney(subtotal - discount);
    const tax = roundMoney(taxable * taxRate / 100);
    return [tier.id, { subtotal, discount, discountPercent: discountRate, taxRate, tax, shipping: roundMoney(extraCost), total: roundMoney(taxable + tax + extraCost) }];
  })), [rawTierTotals, discountRate, taxRate, extraCost]);
  const tierTotals = useMemo(() => Object.fromEntries(quoteTiers.map((tier) => [tier.id, tierFinancials[tier.id]?.total ?? null])), [tierFinancials]);
  const allItemsSelected = configuredLines.every((line) => (line.custom ? line.title : line.product) && line.hasValidSize && line.hasValidQuantity && (!line.custom || Number(line.customUnitPrice) > 0));
  const pricesConfirmed = configuredLines.every((line) => line.custom || line.product?.confirmed || line.product?.published === true);
  const selectedTotal = tierTotals[priceTier];
  const selectedFinancials = tierFinancials[priceTier];
  const quoteCanSave = canEditQuotes && allItemsSelected && selectedTotal !== null && !saving && (!installMapUrl || isMapsUrl(installMapUrl)) && (priceTier !== 'instalacion' || installAddress.trim()) && proposalNotes.length <= 1200 && discountReason.length <= 300 && (discountRate === 0 || discountReason.trim());

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
    setLines([createLine()]); setPriceTier('pvp'); setCustomer(''); setCustomerId(''); setPhone(''); setCustomerEmail(''); setCustomerDocument(''); setJobName(''); setDeliveryDate(''); setApplyIVA(false); setDiscountPercent('0'); setDiscountReason(''); setShippingCost('0');
    setInstallAddress(''); setInstallMapUrl(''); setInstallFloor(''); setInstallHeight(''); setInstallAccess(''); setProposalNotes(''); setClientBriefHtml('<p></p>'); documentAssets.forEach((asset) => asset.previewUrl && URL.revokeObjectURL(asset.previewUrl)); setDocumentAssets([]);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!quoteCanSave || !supabase || !organizationId) return;
    setSaving(true); setQuoteError('');
    try {
      const chosen = tierAliases[priceTier] || 'normal';
      const chosenFinancials = selectedFinancials;
      const chosenLineTotals = distributeMoney(chosenFinancials.total, configuredLines.map((line) => line.totals[priceTier] || 0));
      const chosenDiscounts = distributeMoney(chosenFinancials.discount, configuredLines.map((line) => line.totals[priceTier] || 0));
      const chosenTaxes = distributeMoney(chosenFinancials.tax, configuredLines.map((line, index) => Math.max(0, (line.totals[priceTier] || 0) - (chosenDiscounts[index] || 0))));
      const chosenShipping = distributeMoney(chosenFinancials.shipping, configuredLines.map((line) => line.totals[priceTier] || 0));
      const itemPayload = configuredLines.map((line, index) => ({
        product_id: line.custom ? null : line.product.id,
        name: line.title,
        description: line.additionalDescription.trim(),
        description_html: line.additionalDescriptionHtml || '<p></p>',
        category: line.custom ? 'Concepto libre' : line.product.family,
        quantity: line.basis,
        piece_quantity: line.pieceQuantity,
        unit: line.unit,
        unit_price: line.totals[priceTier] === null ? null : roundMoney(line.totals[priceTier] / line.basis),
        total: pricesConfirmed ? chosenLineTotals[index] : null,
        subtotal: line.totals[priceTier],
        discount_amount: chosenDiscounts[index],
        tax_rate: taxRate,
        tax_amount: chosenTaxes[index],
        shipping_share: chosenShipping[index],
        normal_total: line.totals.pvp,
        installation_total: line.totals.instalacion,
        corporate_total: line.totals.corporativo,
        price_tier: priceTier,
        option: line.option || null,
        width_cm: line.custom || line.product.mode !== 'area' ? null : line.width,
        height_cm: line.custom || line.product.mode !== 'area' ? null : line.height,
        sku: line.custom ? '' : line.product.sku || '',
        image: line.custom ? null : line.product.image || null,
        custom: line.custom,
      }));
      const documentDetails = {
        version: 1,
        customer: { name: customer.trim(), phone: phone.trim(), email: customerEmail.trim(), document_reference: customerDocument.trim(), customer_id: customerId || null },
        job_name: jobName.trim(),
        delivery_date: deliveryDate || null,
        financial: { chosen_tier: chosen, subtotal: chosenFinancials.subtotal, discount_percent: chosenFinancials.discountPercent, discount_amount: chosenFinancials.discount, discount_reason: discountReason.trim(), iva_applied: applyIVA, iva_rate: taxRate, iva_amount: chosenFinancials.tax, shipping_cost: chosenFinancials.shipping, total: chosenFinancials.total, tiers: tierFinancials },
        installation: { required: priceTier === 'instalacion', address: installAddress.trim(), maps_url: installMapUrl.trim(), floor: installFloor.trim(), height: installHeight.trim(), access: installAccess.trim() },
        notes: proposalNotes.trim(),
      };
      const itemsWithDocumentDetails = itemPayload.map((item, index) => index === 0 ? { ...item, document_details: documentDetails } : item);
      const notes = proposalNotes.trim();
      const payloadBytes = new TextEncoder().encode(JSON.stringify(itemsWithDocumentDetails)).length;
      if (payloadBytes > 45000) throw new Error('La propuesta supera el tamaño permitido. Reduce la cantidad de artículos o acorta sus conceptos.');
      if (notes.length > 1200 || new TextEncoder().encode(JSON.stringify(documentDetails)).length > 16000) throw new Error('Los detalles de la propuesta superan el tamaño permitido. Acorta las notas o descripciones.');
      const { data: result, error } = await supabase.rpc('create_central_quote', {
        p_customer_id: customerId || null,
        p_customer_name: customer.trim(),
        p_customer_phone: phone.trim(),
        p_items: itemsWithDocumentDetails,
        p_normal: tierTotals.pvp,
        p_installation: tierTotals.instalacion,
        p_corporate: tierTotals.corporativo,
        p_chosen: chosen,
        p_selected: pricesConfirmed ? selectedTotal : null,
        p_confirmed: pricesConfirmed,
        p_notes: notes,
        p_client_brief_html: clientBriefHtml,
      });
      if (error) throw error;
      if (documentAssets.length) await persistCommercialAssets({ organizationId, documentId: result.id, kind: 'quote', assets: documentAssets });
      const [{ data: rows, error: readError }, { data: exclusions, error: exclusionsError }] = await Promise.all([
        supabase.from('central_quotes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100),
        supabase.from('commercial_history_exclusions').select('document_kind,document_id').eq('organization_id', organizationId),
      ]);
      if (readError) throw readError;
      if (exclusionsError) throw exclusionsError;
      const excluded = new Set((exclusions || []).map((entry) => `${entry.document_kind}:${entry.document_id}`));
      setCentralQuotes((rows || []).filter((entry) => !excluded.has(`quote:${entry.id}`)));
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
            <div className="operations-quote-line-heading"><div><span>{line.custom ? 'CONCEPTO LIBRE' : `ARTÍCULO ${String(index + 1).padStart(2, '0')}`}</span><h3 id={`operations-quote-line-${line.id}`}>{line.title || line.product?.name || `Artículo ${index + 1}`}</h3></div><div className="operations-quote-line-actions"><button className="operations-quote-icon-button" type="button" disabled={index === 0} onClick={() => moveLine(line.id, -1)} aria-label={`Mover artículo ${index + 1} arriba`} title="Mover arriba"><ArrowUp size={15}/></button><button className="operations-quote-icon-button" type="button" disabled={index === lines.length - 1} onClick={() => moveLine(line.id, 1)} aria-label={`Mover artículo ${index + 1} abajo`} title="Mover abajo"><ArrowDown size={15}/></button><button className="operations-quote-icon-button" type="button" disabled={lines.length >= MAX_QUOTE_ITEMS} onClick={() => duplicateLine(line)} aria-label={`Duplicar artículo ${index + 1}`} title="Duplicar"><Copy size={15}/></button>{lines.length > 1 && <button className="operations-quote-remove" type="button" onClick={() => setLines((current) => current.filter((entry) => entry.id !== line.id))} aria-label={`Quitar artículo ${index + 1}`}><Trash2 size={15}/><span>Quitar</span></button>}</div></div>
            {line.custom ? <div className="operations-quote-fields"><label>Concepto o producto<input required maxLength={160} value={line.concept} onChange={(event) => updateLine(line.id, { concept: event.target.value })} placeholder="Describe el producto o servicio"/></label><label>Precio por unidad<input required min="0.01" step="0.01" type="number" value={line.customUnitPrice} onChange={(event) => updateLine(line.id, { customUnitPrice: event.target.value })}/></label><label>Cantidad<input required min="1" step="1" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })}/></label><label>Unidad<input maxLength={40} value={line.customUnit} onChange={(event) => updateLine(line.id, { customUnit: event.target.value })} placeholder="unidad, hora, servicio…"/></label><label className="operations-quote-line-description">Descripción adicional<textarea rows={2} maxLength={500} value={line.additionalDescription} onChange={(event) => updateLine(line.id, { additionalDescription: event.target.value })} placeholder="Acabado, material, alcance u otra especificación"/></label></div> : <>
              <QuoteProductPicker idPrefix={`operations-quote-product-${line.id}`} products={data.catalog} selected={line.product} onSelect={(product) => updateLine(line.id, { productId: product?.id || '', option: '' })}/>
              {line.product && <>
                {line.product.mode === 'area' && <div className="operations-quote-fields"><label>Ancho por pieza (cm)<input required min="1" step="any" type="number" value={line.widthCm} onChange={(event) => updateLine(line.id, { widthCm: event.target.value })}/></label><label>Alto por pieza (cm)<input required min="1" step="any" type="number" value={line.heightCm} onChange={(event) => updateLine(line.id, { heightCm: event.target.value })}/></label><div className="operations-quote-area"><span>Área total</span><b>{line.area && line.pieceQuantity ? `${(line.area * line.pieceQuantity).toFixed(2)} m²` : 'Completa las medidas'}</b><small>{line.area ? `${line.area.toFixed(2)} m² × ${line.pieceQuantity} ${line.pieceQuantity === 1 ? 'pieza' : 'piezas'}` : ''}</small></div></div>}
                <div className="operations-quote-fields operations-quote-item-details"><label>{line.product.mode === 'area' ? 'Número de piezas' : `Cantidad (${line.product.unit || 'unidades'})`}<input required min="1" step="1" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })}/></label><label>Concepto para esta línea (opcional)<input maxLength={160} value={line.concept} onChange={(event) => updateLine(line.id, { concept: event.target.value })} placeholder={line.product.name}/></label></div>
                {line.product.optionPrices?.length > 0 && <label className="operations-quote-option">Opción del catálogo<select value={line.option} onChange={(event) => updateLine(line.id, { option: event.target.value })}><option value="">Usar tarifa base del producto</option>{line.product.optionPrices.map((option, optionIndex) => <option key={`${option.label}-${optionIndex}`} value={option.label}>{option.label} · {formatMoney(option.price)}</option>)}</select></label>}
                <label className="operations-quote-line-description">Descripción adicional<textarea rows={2} maxLength={500} value={line.additionalDescription} onChange={(event) => updateLine(line.id, { additionalDescription: event.target.value })} placeholder="Acabado, material, alcance u otra especificación"/></label>
                <div className="operations-quote-line-total"><span>Artículo · {line.product.mode === 'area' ? `${line.basis.toFixed(2)} m²` : `${line.pieceQuantity} ${line.unit}`}</span><b>{line.totals[priceTier] === null ? 'Tarifa no disponible' : formatMoney(line.totals[priceTier])}</b></div>
                {!line.product.confirmed && line.product.published !== true && <p className="operations-quote-pending" role="status"><CircleHelp size={14}/> Precio del catálogo pendiente de validación.</p>}
              </>}
            </>}
          </section>)}
        </div>
        <button className="button button-outline operations-quote-add" disabled={lines.length >= MAX_QUOTE_ITEMS} type="button" onClick={() => setLines((current) => [...current, createLine()])}><Plus size={16}/> Añadir artículo</button>
        <button className="button button-outline operations-quote-add" disabled={lines.length >= MAX_QUOTE_ITEMS} type="button" onClick={() => setLines((current) => [...current, createLine(true)])}><Plus size={16}/> Añadir concepto libre</button>
        {lines.length >= MAX_QUOTE_ITEMS && <p className="operations-quote-limit-hint" role="status">Límite de {MAX_QUOTE_ITEMS} artículos por propuesta alcanzado.</p>}
        <section className="operations-quote-tier-section" aria-labelledby="operations-quote-tiers-title"><div className="operations-quote-section-heading"><div><span className="eyebrow">COMPARACIÓN DE PRECIOS</span><h3 id="operations-quote-tiers-title">Elige la tarifa de la propuesta</h3></div><span>Incluye descuento, IVA y otros cargos aplicables</span></div><div className="operations-quote-tiers">{quoteTiers.map((tier) => <button key={tier.id} className={`operations-quote-tier${priceTier === tier.id ? ' active' : ''}${tierTotals[tier.id] === null ? ' unavailable' : ''}`} type="button" aria-pressed={priceTier === tier.id} onClick={() => setPriceTier(tier.id)}><span>{tier.label}{priceTier === tier.id && <Check size={14}/>}</span><b>{tierTotals[tier.id] === null ? 'Completa los artículos' : formatMoney(tierTotals[tier.id])}</b><small>{tier.description} · {applyIVA ? `IVA ${taxRate}% incluido` : 'sin IVA'}</small></button>)}</div></section>

        <details className="operations-quote-financial-editor"><summary>Descuento, IVA y otros cargos</summary><div className="operations-quote-fields"><label>Descuento (%)<input min="0" max="100" step="0.01" type="number" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)}/></label><label>Otros cargos / envío<input min="0" step="0.01" type="number" value={shippingCost} onChange={(event) => setShippingCost(event.target.value)}/></label>{Number(discountPercent) > 0 && <label className="operations-quote-wide">Motivo del descuento<input required maxLength={300} value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="Motivo para dejarlo registrado"/></label>}<label className="operations-quote-iva-toggle"><input type="checkbox" checked={applyIVA} onChange={(event) => setApplyIVA(event.target.checked)}/><span>Aplicar IVA ({Number(data.calculatorSettings?.taxRate ?? 15)}%)</span></label></div><div className="operations-quote-financial-summary"><span>Subtotal <b>{selectedFinancials ? formatMoney(selectedFinancials.subtotal) : '—'}</b></span><span>Descuento <b>{selectedFinancials ? `−${formatMoney(selectedFinancials.discount)}` : '—'}</b></span><span>IVA ({taxRate}%) <b>{selectedFinancials ? formatMoney(selectedFinancials.tax) : '—'}</b></span><span>Envío / otros cargos <b>{selectedFinancials ? formatMoney(selectedFinancials.shipping) : '—'}</b></span></div></details>

        {priceTier === 'instalacion' && <section className="operations-quote-install" aria-labelledby="operations-quote-install-title"><div className="operations-quote-section-heading"><div><span className="eyebrow"><MapPin size={13}/> DATOS PARA INSTALACIÓN</span><h3 id="operations-quote-install-title">Ubicación del trabajo</h3></div></div><label>Dirección o lugar de instalación<input required maxLength={300} value={installAddress} onChange={(event) => setInstallAddress(event.target.value)} placeholder="Sector, calle, edificio o referencia"/></label><div className="operations-quote-fields"><label>Enlace exacto de Google Maps (opcional)<input type="url" maxLength={800} value={installMapUrl} onChange={(event) => setInstallMapUrl(event.target.value)} placeholder="Pega el enlace para fijar el punto" aria-invalid={Boolean(installMapUrl && !isMapsUrl(installMapUrl))}/>{installMapUrl && !isMapsUrl(installMapUrl) && <small className="operations-quote-error-hint">Usa un enlace seguro de Google Maps.</small>}</label><label>Piso o nivel<input maxLength={60} value={installFloor} onChange={(event) => setInstallFloor(event.target.value)} placeholder="Ej. planta baja, piso 2"/></label><label>Altura aproximada<input maxLength={60} value={installHeight} onChange={(event) => setInstallHeight(event.target.value)} placeholder="Ej. 4 m"/></label><label>Acceso y condiciones<input maxLength={280} value={installAccess} onChange={(event) => setInstallAccess(event.target.value)} placeholder="Escalera, acceso, horario…"/></label></div><GoogleMapsPreview url={installMapUrl} address={installAddress}/>{installAddress.trim() && <a className="operations-quote-map-link" href={mapsUrl(installAddress.trim())} target="_blank" rel="noreferrer"><MapPin size={14}/> Buscar dirección en Google Maps <ArrowRight size={14}/></a>}</section>}
        <section className="operations-quote-install"><div className="operations-quote-section-heading"><div><span className="eyebrow">DESCRIPCIÓN DEL TRABAJO</span><h3>Indicaciones y objetivo para el cliente</h3></div></div><RichTextEditor label="Descripción enriquecida" value={clientBriefHtml} onChange={setClientBriefHtml} placeholder="Describe el trabajo, materiales, estilo o indicaciones…" minHeight={180}/></section>
        <CommercialAssetsEditor value={documentAssets} onChange={setDocumentAssets}/>

        <section className="operations-quote-customer"><div className="divider-label">DATOS DEL CLIENTE Y DEL TRABAJO · OPCIONAL</div><div className="quote-customer-fields"><QuoteCustomerPicker customers={canSearchCustomers ? data.customers || [] : []} customerId={customerId} value={customer} onNameChange={(value) => { setCustomer(value); setCustomerId(''); setPhone(''); setCustomerEmail(''); setCustomerDocument(''); }} onSelect={(selectedCustomer) => { setCustomerId(selectedCustomer?.id || ''); if (selectedCustomer) { setCustomer(selectedCustomer.name); setPhone(selectedCustomer.phone || ''); setCustomerEmail(selectedCustomer.email || ''); setCustomerDocument(selectedCustomer.documentReference || ''); } }}/><label>Teléfono<input value={phone} readOnly={Boolean(customerId)} onChange={(event) => setPhone(event.target.value)} placeholder="09…"/></label><label>Correo electrónico<input type="email" value={customerEmail} readOnly={Boolean(customerId)} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="correo@ejemplo.com"/></label><label>Cédula o RUC<input value={customerDocument} readOnly={Boolean(customerId)} onChange={(event) => setCustomerDocument(event.target.value)} placeholder="Documento del cliente"/></label><label>Nombre del trabajo<input maxLength={160} value={jobName} onChange={(event) => setJobName(event.target.value)} placeholder="Referencia para la producción"/></label><div className="operations-quote-date-field"><span>Fecha de entrega solicitada</span><DatePicker className="operations-quote-date-picker" label="Fecha de entrega solicitada" value={deliveryDate} onChange={setDeliveryDate} cellSize="compact"/></div></div></section>
        <label className="operations-quote-notes">Notas internas para el equipo<textarea rows={3} maxLength={1200} value={proposalNotes} onChange={(event) => setProposalNotes(event.target.value)} placeholder="Acabados por confirmar, archivos pendientes, fecha solicitada…"/><small>{proposalNotes.length} / 1200 · Se guarda en la cotización central y no aparece al imprimir.</small></label>
        <div className="operations-quote-selected-total"><span>TOTAL SELECCIONADO · {quoteTiers.find((tier) => tier.id === priceTier)?.label}</span><div className="operations-quote-total-breakdown"><span>Subtotal <b>{selectedFinancials ? formatMoney(selectedFinancials.subtotal) : '—'}</b></span>{selectedFinancials?.discount > 0 && <span>Descuento <b>−{formatMoney(selectedFinancials.discount)}</b></span>}{applyIVA && <span>IVA ({taxRate}%) <b>{selectedFinancials ? formatMoney(selectedFinancials.tax) : '—'}</b></span>}{extraCost > 0 && <span>Otros cargos <b>{formatMoney(extraCost)}</b></span>}</div><b>{selectedTotal === null ? 'Completa los artículos' : pricesConfirmed ? formatMoney(selectedTotal) : `${formatMoney(selectedTotal)} · pendiente de validar`}</b><small>Los valores de producto siguen el catálogo; el desglose de impuestos, descuentos y cargos queda guardado en la propuesta.</small></div>
        {quoteError && <div className="op-flow-alert error" role="alert">{quoteError}</div>}
        {canViewQuotes && !canEditQuotes && <p className="muted" role="status">Tu perfil puede consultar cotizaciones, pero no guardar nuevas propuestas.</p>}
        <button className="button button-dark form-submit operations-quote-submit" disabled={!quoteCanSave} type="submit">{saving ? 'Guardando propuesta…' : `Guardar cotización · ${lines.length} ${lines.length === 1 ? 'artículo' : 'artículos'}`} <Check size={16}/></button>
      </form>

      <aside className="operations-quote-summary"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">VISTA PREVIA</span><h2>Resumen de la propuesta</h2></div><ClipboardList size={18}/></div><ol className="operations-quote-summary-lines">{configuredLines.map((line, index) => <li key={line.id}><span>{String(index + 1).padStart(2, '0')}</span><div><b>{line.title || 'Selecciona una referencia'}</b><small>{line.custom ? `${line.pieceQuantity} ${line.unit}` : line.product ? `${line.product.family} · ${line.product.mode === 'area' ? `${line.pieceQuantity} × ${line.width} × ${line.height} cm` : `${line.pieceQuantity} ${line.unit}`}${line.option ? ` · ${line.option}` : ''}` : 'Elige una referencia del catálogo'}{line.additionalDescription ? ` · ${line.additionalDescription}` : ''}</small></div><strong>{line.custom || line.product ? line.totals[priceTier] === null ? '—' : formatMoney(line.totals[priceTier]) : '—'}</strong></li>)}</ol><div className="operations-quote-summary-total"><span>{quoteTiers.find((tier) => tier.id === priceTier)?.label} · {lines.length} {lines.length === 1 ? 'artículo' : 'artículos'}</span><b>{selectedTotal === null ? '—' : formatMoney(selectedTotal)}</b></div>{priceTier === 'instalacion' && installAddress.trim() && <div className="operations-quote-summary-location"><MapPin size={15}/><span><b>{installAddress}</b><small>{[installFloor, installHeight && `Altura ${installHeight}`, installMapUrl && 'Pin de Maps añadido'].filter(Boolean).join(' · ')}</small></span></div>}<button className="button button-outline operations-quote-print-button" type="button" onClick={() => window.print()}><Printer size={16}/> Imprimir propuesta</button></section></aside>
    </div>
    <section className="panel operations-quote-history"><div className="panel-heading"><div><span className="eyebrow">HISTORIAL COMPARTIDO</span><h2>Cotizaciones y ventas realizadas</h2></div><span className="muted-count">{historyItems.length} registradas</span></div>{quoteError && <div className="op-flow-alert error" role="alert">{quoteError}</div>}<div className="activity-list">{historyItems.slice(0, 60).map((document) => {
      const isSale = document.documentKind === 'sale';
      const canRemove = isSale ? canDeleteSales : canDeleteQuotes;
      return <article className={`sale-activity operations-quote-history-item${isSale ? ' is-sale' : ''}`} key={`${document.documentKind}:${document.id}`}>
        <button className="sale-row operations-quote-detail-trigger" type="button" onClick={() => setSelectedDocument(document)} aria-label={`Abrir desglose de ${isSale ? 'venta' : 'cotización'} ${document.documentCode}`}><span className="sale-icon">{isSale ? <ReceiptText size={17}/> : <FileText size={17}/>}</span><span><b>{document.documentCode} · {document.customerLabel}</b><small>{isSale ? (document.central_quote_id ? 'Venta realizada · vinculada a cotización' : 'Venta realizada') : Array.isArray(document.items) ? document.items.map((item) => item.name || item.product_name || 'Artículo').join(', ') : 'Cotización'} · {new Date(document.date).toLocaleDateString('es-EC')}</small></span><strong>{document.amount === null ? 'Por validar' : formatMoney(document.amount)}</strong></button>
        <div className="sale-payment-summary"><span>Estado: <b>{isSale ? 'Realizada' : document.status}</b></span>{!isSale && <span>Tarifa: <b>{document.price_confirmed ? 'Confirmada' : 'Por confirmar'}</b></span>}<button className="operations-quote-detail-link" type="button" onClick={() => setSelectedDocument(document)}>Ver desglose <span aria-hidden="true">↗</span></button>{canRemove && <button className="operations-quote-delete-link" type="button" disabled={removingDocumentId === document.id} onClick={() => void removeFromHistory(document)} aria-label={`Quitar ${document.documentCode} del historial`}><Trash2 size={13}/>{removingDocumentId === document.id ? 'Quitando…' : 'Quitar del historial'}</button>}</div>
      </article>;
    })}{!historyItems.length && <EmptyState icon={FileText} title="Aún no hay cotizaciones o ventas" text="Las cotizaciones guardadas y las ventas confirmadas aparecerán en este historial."/>}</div></section>
    <Sheet open={Boolean(selectedDocument)} onOpenChange={(open) => { if (!open) setSelectedDocument(null); }} title={selectedDocument ? `Ficha · ${selectedDocument.documentKind === 'sale' ? selectedDocument.sale_code : selectedDocument.quote_code}` : 'Ficha comercial'} description={selectedDocument?.documentKind === 'sale' ? 'Artículos vendidos, pagos registrados, entrega y valores de la venta.' : 'Productos, cantidades, imágenes y valores guardados en esta propuesta.'}>{selectedDocument && <CommercialDocumentDetails kind={selectedDocument.documentKind} documentId={selectedDocument.id} initialDocument={selectedDocument.documentKind === 'sale' ? null : selectedDocument}/>}</Sheet>
    <div className="notice-box"><span><CircleHelp size={17}/></span><div><b>Propuestas sincronizadas</b><p>Los artículos, sus opciones y las tres tarifas quedan guardados en la cotización central para que el POS y el equipo compartan la misma información.</p></div></div>
     <section className="operations-quote-print-sheet" aria-hidden="true"><header><h1>Visual Corp</h1><p>Propuesta de cotización</p></header><h2>{customer.trim() || 'Cliente'}</h2>{jobName.trim() && <p>Trabajo: {jobName}</p>}{[phone, customerEmail, customerDocument].filter(Boolean).length > 0 && <p>{[phone && `Contacto: ${phone}`, customerEmail && `Correo: ${customerEmail}`, customerDocument && `Cédula / RUC: ${customerDocument}`].filter(Boolean).join(' · ')}</p>}<table><thead><tr><th>Artículo</th><th>Detalle</th><th>Cantidad</th><th>Valor referencial</th></tr></thead><tbody>{configuredLines.map((line, index) => <tr key={line.id}><td>{line.title || `Artículo ${index + 1}`}</td><td>{line.custom ? 'Concepto libre' : line.product ? `${line.product.family}${line.option ? ` · ${line.option}` : ''}` : 'Producto pendiente'}{line.product?.mode === 'area' ? ` · ${line.width} × ${line.height} cm por pieza` : ''}{line.additionalDescription ? ` · ${line.additionalDescription}` : ''}</td><td>{line.pieceQuantity} {line.unit}</td><td>{line.totals[priceTier] === null ? 'Por cotizar' : formatMoney(line.totals[priceTier])}</td></tr>)}</tbody></table><p>Subtotal: {selectedFinancials ? formatMoney(selectedFinancials.subtotal) : 'Por confirmar'}</p>{selectedFinancials?.discount > 0 && <p>Descuento ({selectedFinancials.discountPercent}%): −{formatMoney(selectedFinancials.discount)} · {discountReason}</p>}<p>IVA ({taxRate}%): {selectedFinancials ? formatMoney(selectedFinancials.tax) : 'Por confirmar'}</p>{selectedFinancials?.shipping > 0 && <p>Envío / otros cargos: {formatMoney(selectedFinancials.shipping)}</p>}<h3>{quoteTiers.find((tier) => tier.id === priceTier)?.label}: {selectedTotal === null ? 'Por cotizar' : formatMoney(selectedTotal)}</h3>{deliveryDate && <p>Fecha de entrega solicitada: {deliveryDate}</p>}{priceTier === 'instalacion' && <section><h3>Datos de instalación</h3><p>{installAddress}</p><p>{installFloor && `Nivel: ${installFloor} · `}{installHeight && `Altura: ${installHeight}`}</p>{installMapUrl && <p>Google Maps: {installMapUrl}</p>}<p>{installAccess}</p></section>}<p className="operations-quote-print-disclaimer">Valores referenciales sujetos a confirmación de disponibilidad, especificaciones y condiciones con el equipo de Visual Corp.</p></section>
  </AppFrame>;
}

export default OperationsQuotePage;
