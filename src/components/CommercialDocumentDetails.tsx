import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, FileText, Image as ImageIcon, MapPin, Package, Wallet } from 'lucide-react';
import { useWorkspace, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { Spinner } from './ui/OperationalKit';
import './commercial-document-details.css';
import './commercial-quote-detail.css';

export type CommercialDocumentKind = 'quote' | 'sale';

type Props = {
  kind: CommercialDocumentKind;
  documentId: string;
  initialDocument?: Record<string, any> | null;
  compact?: boolean;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const valueAsNumber = Number(value);
  return Number.isFinite(valueAsNumber) ? valueAsNumber : null;
};

const formatDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '—';

const formatDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium' }).format(new Date(value))
  : '—';

const quoteTier = (value?: string | null) => ({
  normal: 'Normal', pvp: 'Normal', installation: 'Con instalación', instalacion: 'Con instalación',
  corporate: 'Corporativo', corporativo: 'Corporativo',
} as Record<string, string>)[String(value || '').toLowerCase()] || 'Sin tarifa seleccionada';

const quoteTierKey = (value?: string | null) => ({
  normal: 'normal_total', pvp: 'normal_total', installation: 'installation_total', instalacion: 'installation_total',
  corporate: 'corporate_total', corporativo: 'corporate_total',
} as Record<string, string>)[String(value || '').toLowerCase()] || 'normal_total';

const statusLabel = (value?: string | null) => ({
  draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', expired: 'Vencida', converted: 'Convertida',
  confirmed: 'Confirmada', cancelled: 'Anulada',
} as Record<string, string>)[String(value || '').toLowerCase()] || value || 'Sin estado';

const paymentLabel = (value?: string | null) => ({
  cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro',
} as Record<string, string>)[String(value || '').toLowerCase()] || value || 'Otro';

function relation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function optionalMoney(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = numberOrNull(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function imageFromProduct(product: Record<string, any> | undefined) {
  if (!product) return '';
  const image = typeof product.image === 'string' ? product.image : typeof product.image_url === 'string' ? product.image_url : '';
  if (image) return image;
  const images = Array.isArray(product.images) ? product.images : [];
  const first = images.find((item: any) => typeof item === 'string' && item.trim()) || images.find((item: any) => typeof item?.url === 'string')?.url;
  return typeof first === 'string' ? first : '';
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="commercial-detail-meta"><dt>{label}</dt><dd>{value || '—'}</dd></div>;
}

function ProductImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className={`commercial-detail-image${!src || failed ? ' is-empty' : ''}`}>
    {src && !failed ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)}/> : <><ImageIcon size={20}/><span>Imagen no disponible</span></>}
  </div>;
}

export function CommercialDocumentDetails({ kind, documentId, initialDocument, compact = false }: Props) {
  const { organizationId } = useAuth();
  const { data } = useWorkspace();
  const [document, setDocument] = useState<Record<string, any> | null>(initialDocument || null);
  const [loading, setLoading] = useState(!initialDocument);
  const [error, setError] = useState('');
  const products = useMemo(() => new Map<string, any>((data.catalog || []).map((product: any) => [String(product.id), product])), [data.catalog]);

  useEffect(() => {
    let active = true;
    setDocument(initialDocument || null);
    setError('');
    if (initialDocument) {
      setLoading(false);
      return () => { active = false; };
    }
    if (!supabase || !organizationId || !documentId) {
      setLoading(false);
      setError('No se pudo iniciar la consulta de esta ficha.');
      return () => { active = false; };
    }

    setLoading(true);
    void (async () => {
      try {
        const result = kind === 'quote'
          ? await supabase.from('central_quotes').select('*').eq('organization_id', organizationId).eq('id', documentId).maybeSingle()
          : await supabase.from('sales').select('*,branches(name),customers(full_name,phone),sale_lines(id,sku_snapshot,description_snapshot,quantity,fulfilled_quantity,backordered_quantity,returned_quantity,unit_price,line_total,catalog_product_id,variant_id),sale_payments(id,method,amount,reference,note,created_at),sale_fulfillment_details(installation_required,installation_address,installation_maps_url,installation_latitude,installation_longitude,installation_estimated_at,delivery_due_at)').eq('organization_id', organizationId).eq('id', documentId).maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) throw new Error('No se encontró la ficha o tu perfil no tiene acceso a ella.');
        if (active) setDocument(result.data);
      } catch (cause: any) {
        if (active) setError(cause?.message || 'No se pudieron cargar los detalles del registro.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [kind, documentId, organizationId, initialDocument]);

  const isQuote = kind === 'quote';
  const firstQuoteItem = isQuote && Array.isArray(document?.items) ? document.items[0] : null;
  const embeddedQuoteDetails = firstQuoteItem?.document_details && typeof firstQuoteItem.document_details === 'object' ? firstQuoteItem.document_details : {};
  const quoteDetails = isQuote && document?.document_details && typeof document.document_details === 'object' ? document.document_details : embeddedQuoteDetails;
  const quoteFinancial = quoteDetails.financial && typeof quoteDetails.financial === 'object' ? quoteDetails.financial : {};
  const lineRows = useMemo(() => {
    if (!document) return [];
    const rows = isQuote
      ? (Array.isArray(document.items) ? document.items : []).map((line: any, index: number) => {
        const product = products.get(String(line.product_id));
        const lineTotal = numberOrNull(line.total) ?? numberOrNull(line[quoteTierKey(document.chosen_tier)]);
        const billedQuantity = numberOrNull(line.quantity);
        return {
          key: String(line.id || `${line.product_id || 'quote'}-${index}`),
          title: line.name || line.product_name || product?.name || `Artículo ${index + 1}`,
          description: line.description || line.additional_description || product?.description || '',
          category: line.category || product?.family || (line.custom ? 'Concepto libre' : ''),
          image: (typeof line.image === 'string' && line.image) || imageFromProduct(product),
          sku: line.sku || '',
          quantity: numberOrNull(line.piece_quantity) ?? billedQuantity,
          billedQuantity,
          unit: line.unit || (product?.mode === 'area' ? 'm²' : product?.unit || 'unidad'),
          unitPrice: numberOrNull(line.unit_price) ?? (lineTotal !== null && billedQuantity ? lineTotal / billedQuantity : null),
          lineTotal,
          discount: numberOrNull(line.discount_amount),
          taxAmount: numberOrNull(line.tax_amount),
          shipping: numberOrNull(line.shipping_share),
          measurement: line.width_cm && line.height_cm ? `${line.width_cm} × ${line.height_cm} cm por pieza` : '',
          option: line.option || '',
          estimated: !document.price_confirmed,
          fulfilled: null,
          backordered: null,
          returned: null,
        };
      })
      : (Array.isArray(document.sale_lines) ? document.sale_lines : []).map((line: any, index: number) => {
        const product = products.get(String(line.catalog_product_id));
        const quantity = numberOrNull(line.quantity);
        return {
          key: String(line.id || index),
          title: line.description_snapshot || product?.name || `Artículo ${index + 1}`,
          description: line.description_snapshot || '',
          category: product?.family || '',
          image: imageFromProduct(product),
          sku: line.sku_snapshot || product?.sku || '',
          quantity,
          billedQuantity: quantity,
          unit: product?.unit || 'unidad',
          unitPrice: numberOrNull(line.unit_price),
          lineTotal: numberOrNull(line.line_total),
          measurement: '',
          option: '',
          estimated: false,
          fulfilled: numberOrNull(line.fulfilled_quantity),
          backordered: numberOrNull(line.backordered_quantity),
          returned: numberOrNull(line.returned_quantity),
        };
      });
    return rows;
  }, [document, isQuote, products]);

  const lineSubtotal = lineRows.length && lineRows.every((line: any) => line.lineTotal !== null)
    ? lineRows.reduce((sum: number, line: any) => sum + Number(line.lineTotal || 0), 0)
    : null;
  const quoteTotal = isQuote ? numberOrNull(document?.selected_total) ?? numberOrNull(quoteFinancial.total) ?? lineSubtotal : null;
  const quoteSubtotal = isQuote ? numberOrNull(quoteFinancial.subtotal) ?? lineSubtotal : null;
  const quoteDiscount = isQuote ? numberOrNull(quoteFinancial.discount_amount) : null;
  const quoteShipping = isQuote ? numberOrNull(quoteFinancial.shipping_cost) : null;
  const saleTotal = !isQuote ? numberOrNull(document?.total) : null;
  const saleSubtotal = !isQuote ? numberOrNull(document?.subtotal) ?? lineSubtotal : null;
  const discount = !isQuote ? numberOrNull(document?.discount_total) : null;
  const taxAmount = document ? optionalMoney(document, ['iva_amount', 'iva_total', 'vat_amount', 'vat_total', 'tax_amount', 'tax_total']) ?? (isQuote ? numberOrNull(quoteFinancial.iva_amount) : null) : null;
  const taxRate = document ? optionalMoney(document, ['iva_rate', 'vat_rate', 'tax_rate']) ?? (isQuote ? numberOrNull(quoteFinancial.iva_rate) : null) : null;
  const payments = !isQuote && Array.isArray(document?.sale_payments) ? document.sale_payments : [];
  const paid = payments.reduce((sum: number, payment: any) => sum + (numberOrNull(payment.amount) || 0), 0);
  const balance = saleTotal === null ? null : Math.max(0, saleTotal - paid);
  const fulfillment = !isQuote ? relation(document?.sale_fulfillment_details) : null;
  const customer = !isQuote ? relation(document?.customers) : null;
  const branch = !isQuote ? relation(document?.branches) : null;
  const selectedTierKey = quoteTierKey(document?.chosen_tier);
  const tierTotals = isQuote ? [
    { label: 'Normal', value: numberOrNull(document?.total_normal), active: selectedTierKey === 'normal_total' },
    { label: 'Con instalación', value: numberOrNull(document?.total_installation), active: selectedTierKey === 'installation_total' },
    { label: 'Corporativo', value: numberOrNull(document?.total_corporate), active: selectedTierKey === 'corporate_total' },
  ] : [];

  if (loading) return <div className="commercial-detail-state"><Spinner label="Cargando ficha completa…"/></div>;
  if (error) return <div className="commercial-detail-state is-error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>;
  if (!document) return <div className="commercial-detail-state">No hay información disponible para mostrar.</div>;

  const code = isQuote ? document.quote_code : document.sale_code;
  const customerName = isQuote ? document.customer_name || 'Sin cliente' : customer?.full_name || 'Sin cliente';
  const createdAt = document.created_at;
  const taxLabel = isQuote && quoteDetails.version && !quoteFinancial.iva_applied
    ? 'No aplicado a esta cotización.'
    : taxAmount === null ? 'No se guardó el desglose de IVA en este registro.' : `${taxRate !== null ? `IVA ${taxRate}%` : 'IVA registrado'} · ${formatMoney(taxAmount)}`;

  return <div className={`commercial-detail${compact ? ' is-compact' : ''}`}>
    <section className="commercial-detail-overview" aria-label="Resumen del documento">
      <div className="commercial-detail-overview-top">
        <span className={`commercial-detail-kind ${isQuote ? 'is-quote' : 'is-sale'}`}><FileText size={14}/>{isQuote ? 'Cotización' : 'Venta confirmada'}</span>
        <span className={`commercial-detail-status status-${String(document.status || '').toLowerCase()}`}>{statusLabel(document.status)}</span>
      </div>
      <h3>{code || String(document.id || documentId).slice(0, 10)}</h3>
      <dl className="commercial-detail-meta-grid">
        <Meta label="Cliente" value={customerName}/>
        <Meta label="Fecha" value={formatDateTime(createdAt)}/>
        {!isQuote && <Meta label="Contacto" value={customer?.phone || '—'}/>}
        {!isQuote && <Meta label="Sucursal" value={branch?.name || '—'}/>}
        {isQuote && <Meta label="Contacto" value={document.customer_phone || '—'}/>}
        {isQuote && quoteDetails.customer?.email && <Meta label="Correo" value={quoteDetails.customer.email}/>}
        {isQuote && quoteDetails.customer?.document_reference && <Meta label="Cédula / RUC" value={quoteDetails.customer.document_reference}/>}
        {!isQuote && <Meta label="Tipo de pago" value={paymentLabel(document.payment_method)}/>}
        {isQuote && <Meta label="Tarifa" value={quoteTier(document.chosen_tier)}/>}
        {isQuote && quoteDetails.job_name && <Meta label="Trabajo" value={quoteDetails.job_name}/>}
        {isQuote && quoteDetails.delivery_date && <Meta label="Entrega solicitada" value={formatDate(quoteDetails.delivery_date)}/>}
        {!isQuote && <Meta label="Referencia de cotización" value={document.central_quote_id ? 'Vinculada' : 'Venta directa'}/>}
      </dl>
    </section>

    <section className="commercial-detail-section" aria-labelledby={`commercial-items-${document.id}`}>
      <div className="commercial-detail-section-heading"><div><span className="eyebrow">DESGLOSE COMPLETO</span><h4 id={`commercial-items-${document.id}`}>Productos y servicios</h4></div><span className="commercial-detail-count">{lineRows.length} {lineRows.length === 1 ? 'artículo' : 'artículos'}</span></div>
      {lineRows.length ? <div className="commercial-detail-lines">{lineRows.map((line: any, index: number) => <article className="commercial-detail-line" key={line.key}>
        <ProductImage src={line.image} alt={line.title}/>
        <div className="commercial-detail-line-copy">
          <span className="commercial-detail-line-index">ARTÍCULO {String(index + 1).padStart(2, '0')}{line.sku ? ` · ${line.sku}` : ''}</span>
          <h5>{line.title}</h5>
          {line.description && line.description !== line.title && <p>{line.description}</p>}
          <div className="commercial-detail-line-tags">
            {line.category && <span>{line.category}</span>}
            {line.option && <span>{line.option}</span>}
            {line.measurement && <span>{line.measurement}</span>}
            {line.estimated && <span className="is-estimated">Valor estimado · tarifa sin confirmar</span>}
          </div>
          {!isQuote && <div className="commercial-detail-line-tags is-fulfillment">
            {line.fulfilled !== null && <span>Entregado: {line.fulfilled}</span>}
            {line.backordered !== null && line.backordered > 0 && <span>Pendiente: {line.backordered}</span>}
            {line.returned !== null && line.returned > 0 && <span>Devuelto: {line.returned}</span>}
          </div>}
        </div>
        <div className="commercial-detail-line-values">
          <span>{line.quantity ?? '—'} {line.unit}{line.billedQuantity !== null && line.billedQuantity !== line.quantity ? ` · ${line.billedQuantity} ${line.unit} facturados` : ''}</span>
          <small>Unitario base: {line.unitPrice === null ? '—' : formatMoney(line.unitPrice)}</small>
          {isQuote && line.discount > 0 && <small>Descuento asignado: −{formatMoney(line.discount)}</small>}
          {isQuote && line.taxAmount > 0 && <small>IVA asignado: {formatMoney(line.taxAmount)}</small>}
          {isQuote && line.shipping > 0 && <small>Envío / cargo asignado: {formatMoney(line.shipping)}</small>}
          <strong>{line.lineTotal === null ? 'Por confirmar' : formatMoney(line.lineTotal)}</strong>
        </div>
      </article>)}</div> : <div className="commercial-detail-state"><Package size={17}/>Este registro no contiene líneas de productos.</div>}
    </section>

    <section className="commercial-detail-bottom">
      <div className="commercial-detail-section commercial-detail-totals">
        <div className="commercial-detail-section-heading"><div><span className="eyebrow">VALORES</span><h4>Resumen económico</h4></div></div>
        {isQuote ? <>
          {tierTotals.map((tier) => <div className={`commercial-detail-total-row${tier.active ? ' is-selected' : ''}`} key={tier.label}><span>{tier.label}{tier.active && <em>Seleccionada</em>}</span><b>{tier.value === null ? 'Por confirmar' : formatMoney(tier.value)}</b></div>)}
          {quoteSubtotal !== null && <div className="commercial-detail-total-row"><span>Subtotal de artículos</span><b>{formatMoney(quoteSubtotal)}</b></div>}
          {quoteDiscount !== null && quoteDiscount > 0 && <div className="commercial-detail-total-row"><span>Descuento {quoteFinancial.discount_percent ? `(${quoteFinancial.discount_percent}%)` : ''}</span><b>−{formatMoney(quoteDiscount)}</b></div>}
          {quoteDiscount !== null && quoteDiscount > 0 && quoteFinancial.discount_reason && <p className="commercial-detail-tax-reason">Motivo: {quoteFinancial.discount_reason}</p>}
          <div className="commercial-detail-tax-note"><span>Desglose de IVA</span><b>{taxLabel}</b></div>
          {quoteShipping !== null && quoteShipping > 0 && <div className="commercial-detail-total-row"><span>Envío / otros cargos</span><b>{formatMoney(quoteShipping)}</b></div>}
          <div className="commercial-detail-total-row is-grand"><span>{document.price_confirmed ? 'Total cotizado' : 'Total estimado'}</span><b>{quoteTotal === null ? 'Por confirmar' : formatMoney(quoteTotal)}</b></div>
        </> : <>
          <div className="commercial-detail-total-row"><span>Subtotal de la venta</span><b>{saleSubtotal === null ? '—' : formatMoney(saleSubtotal)}</b></div>
          <div className="commercial-detail-total-row"><span>Descuento registrado</span><b>{discount === null ? '—' : formatMoney(discount)}</b></div>
          <div className="commercial-detail-tax-note"><span>IVA</span><b>{taxLabel}</b></div>
          <div className="commercial-detail-total-row is-grand"><span>Total registrado</span><b>{saleTotal === null ? '—' : formatMoney(saleTotal)}</b></div>
          <div className="commercial-detail-total-row is-balance"><span>Abonado · saldo pendiente</span><b>{formatMoney(paid)} · {balance === null ? '—' : formatMoney(balance)}</b></div>
        </>}
      </div>

      {!isQuote && <div className="commercial-detail-section commercial-detail-payments">
        <div className="commercial-detail-section-heading"><div><span className="eyebrow">COBROS</span><h4>Pagos registrados</h4></div><Wallet size={17}/></div>
        {payments.length ? <ul>{payments.map((payment: any, index: number) => <li key={payment.id || index}><span><b>{paymentLabel(payment.method)}</b><small>{formatDateTime(payment.created_at)}{payment.reference ? ` · ${payment.reference}` : ''}{payment.note ? ` · ${payment.note}` : ''}</small></span><strong>{formatMoney(numberOrNull(payment.amount) || 0)}</strong></li>)}</ul> : <div className="commercial-detail-small-empty">No hay abonos registrados.</div>}
      </div>}
    </section>

    {isQuote && quoteDetails.installation && (quoteDetails.installation.required || quoteDetails.installation.address || quoteDetails.installation.maps_url) && <section className="commercial-detail-section commercial-detail-delivery"><div className="commercial-detail-section-heading"><div><span className="eyebrow">INSTALACIÓN</span><h4>Ubicación y condiciones</h4></div><MapPin size={17}/></div><dl className="commercial-detail-meta-grid"><Meta label="Dirección" value={quoteDetails.installation.address}/><Meta label="Piso / nivel" value={quoteDetails.installation.floor}/><Meta label="Altura" value={quoteDetails.installation.height}/><Meta label="Acceso" value={quoteDetails.installation.access}/></dl>{quoteDetails.installation.maps_url && <a href={quoteDetails.installation.maps_url} target="_blank" rel="noreferrer">Abrir ubicación en Google Maps</a>}</section>}
    {isQuote && quoteDetails.notes && !document.notes && <section className="commercial-detail-section commercial-detail-notes"><div className="commercial-detail-section-heading"><div><span className="eyebrow">NOTAS DE LA PROPUESTA</span><h4>Información adicional</h4></div></div><p>{quoteDetails.notes}</p></section>}

    {fulfillment && (fulfillment.installation_required || fulfillment.delivery_due_at) && <section className="commercial-detail-section commercial-detail-delivery">
      <div className="commercial-detail-section-heading"><div><span className="eyebrow">ENTREGA</span><h4>{fulfillment.installation_required ? 'Instalación y entrega' : 'Fecha de entrega'}</h4></div><CalendarDays size={17}/></div>
      {fulfillment.installation_required && <p><MapPin size={15}/>{fulfillment.installation_address || 'Dirección pendiente'}</p>}
      {fulfillment.delivery_due_at && <p>Entrega prevista: <b>{formatDate(fulfillment.delivery_due_at)}</b></p>}
      {fulfillment.installation_estimated_at && <p>Instalación prevista: <b>{formatDateTime(fulfillment.installation_estimated_at)}</b></p>}
      {(fulfillment.installation_maps_url || (fulfillment.installation_latitude !== null && fulfillment.installation_longitude !== null)) && <a href={fulfillment.installation_maps_url || `https://www.google.com/maps/search/?api=1&query=${fulfillment.installation_latitude},${fulfillment.installation_longitude}`} target="_blank" rel="noreferrer">Abrir ubicación en Maps</a>}
    </section>}

    {isQuote && document.notes && <section className="commercial-detail-section commercial-detail-notes"><div className="commercial-detail-section-heading"><div><span className="eyebrow">NOTAS DE LA PROPUESTA</span><h4>Condiciones y detalles</h4></div></div><p>{document.notes}</p></section>}
    {!isQuote && document.note && <section className="commercial-detail-section commercial-detail-notes"><div className="commercial-detail-section-heading"><div><span className="eyebrow">NOTA DE LA VENTA</span><h4>Observaciones</h4></div></div><p>{document.note}</p></section>}
    {!isQuote && document.urgent_backorder && <div className="commercial-detail-warning" role="status"><AlertCircle size={16}/>La venta tiene un artículo marcado para compra urgente.</div>}
  </div>;
}
