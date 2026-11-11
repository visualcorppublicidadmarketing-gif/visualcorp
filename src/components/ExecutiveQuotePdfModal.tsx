import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Calendar,
  Check,
  Copy,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  Printer,
  Share2,
  User,
  X,
} from 'lucide-react';
import { useWorkspace, formatMoney } from '../app/workspace';
import './executive-quote-pdf.css';

export interface QuoteItem {
  id?: string;
  name?: string;
  title?: string;
  product_name?: string;
  description?: string;
  category?: string;
  width?: number | string;
  height?: number | string;
  width_cm?: number | string;
  height_cm?: number | string;
  area?: number | string;
  area_m2?: number | string;
  unit?: string;
  calcType?: 'm2' | 'unit' | string;
  quantity?: number;
  piece_quantity?: number;
  unit_price?: number;
  price?: number;
  line_total?: number;
  total?: number;
  option?: string;
  taxable?: boolean;
}

export interface QuoteData {
  id?: string;
  quote_code?: string;
  quoteCode?: string;
  code?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  valid_until?: string;
  validUntil?: string;
  advisor_name?: string;
  advisor?: string;
  customer_name?: string;
  customerName?: string;
  customer_document?: string;
  customerDocument?: string;
  customer_phone?: string;
  customerPhone?: string;
  customer_email?: string;
  customerEmail?: string;
  customer_address?: string;
  customerAddress?: string;
  contact_person?: string;
  contactPerson?: string;
  items?: QuoteItem[];
  subtotal_0?: number;
  subtotal_15?: number;
  subtotal?: number;
  discount_amount?: number;
  discount_percent?: number;
  shipping_cost?: number;
  shipping?: number;
  tax_amount?: number;
  iva_amount?: number;
  tax_rate?: number;
  iva_rate?: number;
  tax_applied?: boolean;
  apply_iva?: boolean;
  applyIVA?: boolean;
  total?: number;
  notes?: string;
  chosen_tier?: string;
  [key: string]: any;
}

export interface ExecutiveQuotePdfModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  quote?: QuoteData | null;
  document?: QuoteData | null;
  quoteId?: string;
  variant?: 'quote' | 'pos';
}

/** Formatea fechas con localización de Ecuador (Milagro, Guayas) */
function formatEcuadorDate(dateString?: string | null): string {
  if (!dateString) {
    return new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
  }

  try {
    const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
    const date = isIsoDate ? new Date(`${dateString}T12:00:00`) : new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}

/** Calcula fecha sumando días calendario */
function addCalendarDays(baseDate: string | Date, days: number): string {
  const date = typeof baseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(baseDate)
    ? new Date(`${baseDate}T12:00:00`)
    : new Date(baseDate);
  date.setDate(date.getDate() + days);
  return formatEcuadorDate(date.toISOString());
}

export function ExecutiveQuotePdfModal({
  isOpen,
  open,
  onClose,
  quote,
  document,
  quoteId,
  variant = 'quote',
}: ExecutiveQuotePdfModalProps) {
  const visible = isOpen ?? open ?? false;
  const { data } = useWorkspace();
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // El diálogo nativo mantiene el foco dentro y lo devuelve al control que lo abrió.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!visible || !dialog || dialog.open) return;
    dialog.showModal();
    titleRef.current?.focus();
  }, [visible]);

  const handleClose = useCallback(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
  }, [onClose]);

  // Selección del documento explícito o guardado en el workspace.
  const sourceDoc = quote || document;
  const quoteFromWorkspace = useMemo(() => {
    if (!quoteId || !Array.isArray(data?.quotes)) return null;
    return data.quotes.find((q: any) => q.id === quoteId || q.quote_code === quoteId) || null;
  }, [quoteId, data?.quotes]);

  const activeDoc: QuoteData = useMemo(() => sourceDoc || quoteFromWorkspace || {}, [sourceDoc, quoteFromWorkspace]);

  // Datos fiscales de Visual Corp (configurados en workspace o valores oficiales)
  const corporateSettings = useMemo(() => {
    const s = data?.settings || {};
    return {
      brandName: s.name || 'Visual Corp',
      legalName: s.legalName || s.legal_name || '',
      ruc: s.ruc || '',
      address: s.address || 'Av. Jaime Roldós y General Andrade, Milagro, Ecuador',
      phone: s.contactPhone || '0967872396',
      whatsapp: s.whatsappSecondary || '0997078212',
      email: s.email || '',
      website: s.website || '',
      validityDays: Number(activeDoc.validity_days ?? s.quoteValidityDays) || null,
      deliveryTime: activeDoc.delivery_time || s.deliveryTime || '',
    };
  }, [activeDoc.delivery_time, activeDoc.validity_days, data?.settings]);

  // Normalización de ítems y cálculo según los valores guardados en el documento.
  const normalizedItems = useMemo(() => {
    const rawItems = Array.isArray(activeDoc.items) ? activeDoc.items : [];
    return rawItems.map((item, index) => {
      const name = item.name || item.title || item.product_name || `Ítem ${index + 1}`;
      const description = item.description || item.option || '';
      const category = item.category || '';
      const quantity = Number(item.quantity || item.piece_quantity || 1);

      // Dimensiones y área
      const widthVal = item.width ?? item.width_cm;
      const heightVal = item.height ?? item.height_cm;
      const hasDimensions = Boolean(widthVal && heightVal);
      const dimensionUnit = item.width_cm !== undefined || item.height_cm !== undefined ? 'cm' : 'm';
      const dimensions = hasDimensions ? `${widthVal} × ${heightVal} ${dimensionUnit}` : '—';

      const areaCalculated = hasDimensions && !Number.isNaN(Number(widthVal)) && !Number.isNaN(Number(heightVal))
        ? (Number(widthVal) * Number(heightVal) / (dimensionUnit === 'cm' ? 10000 : 1)).toFixed(2)
        : null;
      const explicitArea = item.area_m2 ?? item.area;
      const area = explicitArea !== undefined && explicitArea !== null
        ? `${explicitArea} m²`
        : areaCalculated ? `${areaCalculated} m²` : '—';

      const unit = item.unit || (item.calcType === 'm2' ? 'm²' : 'u');
      const unitPrice = Number(item.unit_price ?? item.price ?? 0);
      const lineTotal = Number(
        item.line_total ??
          item.total ??
          (item.calcType === 'm2' && areaCalculated
            ? unitPrice * Number(areaCalculated) * quantity
            : unitPrice * quantity)
      );

      return {
        id: item.id || `item-${index + 1}`,
        index: index + 1,
        name,
        description,
        category,
        dimensions,
        area,
        unit,
        quantity,
        unitPrice,
        lineTotal,
        taxable: item.taxable !== false,
      };
    });
  }, [activeDoc.items]);

  // Liquidación Financiera
  const financialSummary = useMemo(() => {
    let itemSubtotal15 = 0;
    let itemSubtotal0 = 0;

    normalizedItems.forEach((item) => {
      if (item.taxable) {
        itemSubtotal15 += item.lineTotal;
      } else {
        itemSubtotal0 += item.lineTotal;
      }
    });

    const hasAmount = (value: unknown) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
    const subtotal15 = Number(activeDoc.subtotal_15 ?? activeDoc.subtotal ?? itemSubtotal15);
    const subtotal0 = Number(activeDoc.subtotal_0 ?? itemSubtotal0);
    const discountAmount = Number(activeDoc.discount_amount || 0);
    const discountPercent = activeDoc.discount_percent || (subtotal15 > 0 && discountAmount > 0 ? Math.round((discountAmount / subtotal15) * 100) : 0);
    const baseImponible = Math.max(0, subtotal15 - discountAmount);
    const providedTax = activeDoc.tax_amount ?? activeDoc.iva_amount ?? activeDoc.tax;
    const taxFlag = activeDoc.tax_applied ?? activeDoc.apply_iva ?? activeDoc.applyIVA;
    const taxApplied = taxFlag == null
      ? hasAmount(providedTax) && Number(providedTax) > 0
      : Boolean(taxFlag);
    const providedTaxRate = activeDoc.tax_rate ?? activeDoc.iva_rate;
    const impliedTaxRate = taxApplied && hasAmount(providedTax) && baseImponible > 0
      ? Number(((Number(providedTax) / baseImponible) * 100).toFixed(2))
      : 0;
    const taxRate = hasAmount(providedTaxRate) ? Number(providedTaxRate) : impliedTaxRate;
    const ivaAmount = taxApplied
      ? hasAmount(providedTax) ? Number(providedTax) : Number((baseImponible * taxRate / 100).toFixed(2))
      : 0;
    const shipping = Number(activeDoc.shipping_cost ?? activeDoc.shipping ?? 0);
    const total = hasAmount(activeDoc.total)
      ? Number(activeDoc.total)
      : Number((baseImponible + subtotal0 + ivaAmount + shipping).toFixed(2));
    const advanceValue = activeDoc.deposit_amount ?? activeDoc.advance_amount;
    const balanceValue = activeDoc.remaining_balance ?? activeDoc.balance_amount;
    const hasPaymentSplit = hasAmount(advanceValue) || hasAmount(balanceValue);
    const advance50 = hasAmount(advanceValue) ? Number(advanceValue) : Number((total * 0.5).toFixed(2));
    const balance50 = hasAmount(balanceValue) ? Number(balanceValue) : Number((total - advance50).toFixed(2));

    return {
      subtotal15,
      subtotal0,
      discountAmount,
      discountPercent,
      baseImponible,
      ivaAmount,
      taxRate,
      taxApplied,
      shipping,
      total,
      advance50,
      balance50,
      hasPaymentSplit,
    };
  }, [normalizedItems, activeDoc]);

  // Metadatos de la cotización
  const quoteCode = activeDoc.quote_code || activeDoc.quoteCode || activeDoc.code || '';
  const quoteCodeLabel = quoteCode || (variant === 'pos' ? 'Vista previa' : 'Sin número');
  const issueDateFormatted = formatEcuadorDate(activeDoc.created_at || activeDoc.createdAt);
  const expirationDateFormatted = activeDoc.valid_until
    ? formatEcuadorDate(activeDoc.valid_until)
    : corporateSettings.validityDays
      ? addCalendarDays(activeDoc.created_at || new Date(), corporateSettings.validityDays)
      : '';
  const advisor = activeDoc.advisor_name || activeDoc.advisor || '';
  const status = activeDoc.status || (variant === 'pos' ? 'Vista previa' : 'Borrador');
  const statusClass = status.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const isPublicQuote = variant === 'quote' && Boolean(activeDoc.id && quoteCode);
  const verificationUrl = `${window.location.origin}/seguimiento/${encodeURIComponent(quoteCode)}`;

  // Acciones: Imprimir / Guardar como PDF
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Acciones: Copiar Enlace Público
  const handleCopyLink = useCallback(async () => {
    try {
      if (!isPublicQuote) return;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(verificationUrl);
      } else {
        const dummy = window.document.createElement('input');
        dummy.value = verificationUrl;
        window.document.body.appendChild(dummy);
        dummy.select();
        window.document.execCommand('copy');
        window.document.body.removeChild(dummy);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('No se pudo copiar el enlace:', err);
    }
  }, [isPublicQuote, verificationUrl]);

  // Acciones: Compartir por WhatsApp
  const handleShareWhatsApp = useCallback(() => {
    const lines = [
      `*PROFORMA EJECUTIVA VISUAL CORP*`,
      `*N°:* ${quoteCode || 'Borrador'}`,
      `*Cliente:* ${activeDoc.customer_name || 'Estimado Cliente'}`,
      `*Fecha de emisión:* ${issueDateFormatted}`,
      ...(corporateSettings.validityDays ? [`*Validez:* ${corporateSettings.validityDays} días`] : []),
      ``,
      `*DETALLE DE ÍTEMS PROPUESTOS:*`,
    ];

    normalizedItems.forEach((item) => {
      const dim = item.dimensions !== '—' ? ` (${item.dimensions})` : '';
      lines.push(
        `${item.index}. *${item.name}*${dim} · Cant: ${item.quantity} ${item.unit} · Subtotal: ${formatMoney(item.lineTotal)}`
      );
    });

    lines.push(``);
    lines.push(financialSummary.taxApplied
      ? `*Subtotal gravado (${financialSummary.taxRate}% IVA):* ${formatMoney(financialSummary.subtotal15)}`
      : `*Subtotal:* ${formatMoney(financialSummary.subtotal15)}`);
    if (financialSummary.subtotal0 > 0) lines.push(`*Subtotal tarifa 0%:* ${formatMoney(financialSummary.subtotal0)}`);
    if (financialSummary.discountAmount > 0) {
      lines.push(`*Descuento comercial (${financialSummary.discountPercent}%):* −${formatMoney(financialSummary.discountAmount)}`);
    }
    lines.push(`*Base Imponible:* ${formatMoney(financialSummary.baseImponible)}`);
    lines.push(financialSummary.taxApplied
      ? `*IVA (${financialSummary.taxRate}%):* ${formatMoney(financialSummary.ivaAmount)}`
      : `*IVA:* No aplicado`);
    if (financialSummary.shipping > 0) {
      lines.push(`*Instalación / Envío:* ${formatMoney(financialSummary.shipping)}`);
    }
    lines.push(`*TOTAL GENERAL:* ${formatMoney(financialSummary.total)} USD`);
    lines.push(``);
    if (financialSummary.hasPaymentSplit) {
      lines.push(`*Condiciones de Pago:*`);
      lines.push(`• Anticipo: ${formatMoney(financialSummary.advance50)} USD`);
      lines.push(`• Saldo: ${formatMoney(financialSummary.balance50)} USD`);
      lines.push(``);
    }
    if (isPublicQuote) {
      lines.push(`*Ver proforma y aprobar en línea:*`);
      lines.push(verificationUrl);
    }
    lines.push(``);
    lines.push(`_Visual Corp · Milagro, Guayas, Ecuador_`);

    const rawPhone = activeDoc.customer_phone ? String(activeDoc.customer_phone).replace(/\D/g, '') : '';
    const phoneParam = rawPhone ? (rawPhone.startsWith('593') ? rawPhone : `593${rawPhone.replace(/^0/, '')}`) : '';
    const waUrl = phoneParam
      ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }, [
    activeDoc.customer_name,
    activeDoc.customer_phone,
    corporateSettings.validityDays,
    financialSummary,
    isPublicQuote,
    issueDateFormatted,
    normalizedItems,
    quoteCode,
    verificationUrl,
  ]);

  if (!visible || !Array.isArray(activeDoc.items) || activeDoc.items.length === 0) return null;

  return (
    <dialog
      ref={dialogRef}
      className="eq-pdf-overlay"
      aria-labelledby="eq-pdf-title"
      onCancel={(event) => { event.preventDefault(); handleClose(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="eq-pdf-modal">
        {/* ====================================================================
            BARRA DE HERRAMIENTAS SUPERIOR (ESTILO MIDDAY / LINEAR)
            ==================================================================== */}
        <header className="eq-pdf-toolbar" aria-label="Acciones del documento">
          <div className="eq-pdf-toolbar-info">
            <span className="eq-pdf-doc-badge">
              <FileText size={14} aria-hidden="true" />
              {quoteCodeLabel}
            </span>
            <span
              className={`eq-pdf-status-badge status-${statusClass}`}
              title={`Estado del documento: ${status}`}
            >
              {status}
            </span>
          </div>

          <div className="eq-pdf-toolbar-actions">
            <button
              type="button"
              className="eq-btn eq-btn-primary"
              onClick={handlePrint}
              title="Abre la ventana de impresión para imprimir directamente en tamaño A4"
            >
              <Printer size={15} aria-hidden="true" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              className="eq-btn eq-btn-secondary"
              onClick={handlePrint}
              title="Exportar como PDF limpio optimizado para envío comercial"
            >
              <Download size={15} aria-hidden="true" />
              <span>Guardar PDF</span>
            </button>

            {variant === 'quote' && <button
              type="button"
              className="eq-btn eq-btn-whatsapp"
              onClick={handleShareWhatsApp}
              title="Compartir resumen estructurado con enlace público por WhatsApp"
            >
              <Share2 size={15} aria-hidden="true" />
              <span>WhatsApp</span>
            </button>}

            {isPublicQuote && <button
              type="button"
              className="eq-btn eq-btn-secondary"
              onClick={handleCopyLink}
              title="Copiar enlace de seguimiento y aprobación para el cliente"
            >
              {copied ? <Check size={14} color="#86efac" /> : <Copy size={14} aria-hidden="true" />}
              <span>{copied ? '¡Copiado!' : 'Copiar enlace'}</span>
            </button>}

            <button
              type="button"
              className="eq-btn-icon-close"
              onClick={handleClose}
              aria-label="Cerrar visor de proforma"
              title="Cerrar (Esc)"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* ====================================================================
            HOJA A4 IMPRESA OFICIAL DE VISUAL CORP
            ==================================================================== */}
        <div className="eq-pdf-sheet-wrapper">
          <article className={`eq-pdf-sheet is-${variant}`} id="printable-quote-sheet">
            <div className="eq-pdf-brand-strip" aria-hidden="true" />

            {/* Cabecera Oficial de Visual Corp */}
            <div className="eq-pdf-header">
              <div className="eq-pdf-brand-col">
                <img className="eq-pdf-wordmark" src="/brand/visualcorp-wordmark.png" alt="Visual Corp · Agencia Creativa" />

                <div className="eq-pdf-fiscal-info">
                  {corporateSettings.legalName && <span><strong>Razón social:</strong> {corporateSettings.legalName}</span>}
                  {(corporateSettings.ruc || corporateSettings.address) && <span>
                    {corporateSettings.ruc && <><strong>RUC:</strong> {corporateSettings.ruc}</>}
                    {corporateSettings.ruc && corporateSettings.address && ' · '}
                    {corporateSettings.address && <><strong>Dirección:</strong> {corporateSettings.address}</>}
                  </span>}
                  {(corporateSettings.phone || corporateSettings.whatsapp) && <span>
                    <strong>Teléfono / WhatsApp:</strong> {corporateSettings.phone} · {corporateSettings.whatsapp}
                  </span>}
                  {(corporateSettings.email || corporateSettings.website) && <span>
                    {corporateSettings.email && <><strong>Email:</strong> {corporateSettings.email}</>}
                    {corporateSettings.email && corporateSettings.website && ' · '}
                    {corporateSettings.website && <><strong>Web:</strong> {corporateSettings.website}</>}
                  </span>}
                </div>
              </div>

              {/* Cuadro Técnico de la Cotización */}
              <div className="eq-pdf-meta-box">
                <div className="eq-pdf-meta-header">
                  <div>
                    <h1 className="eq-pdf-meta-title" id="eq-pdf-title" ref={titleRef} tabIndex={-1}>{variant === 'pos' ? 'Resumen de orden' : 'Proforma ejecutiva'}</h1>
                    <h2 className="eq-pdf-meta-code">{quoteCode || (variant === 'pos' ? 'Vista previa' : '—')}</h2>
                  </div>
                  <span className={`eq-pdf-status-badge status-${statusClass}`}>{status}</span>
                </div>

                <dl className="eq-pdf-meta-grid">
                  <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">
                      <Calendar size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      {variant === 'pos' ? 'Fecha de consulta:' : 'Fecha de emisión:'}
                    </dt>
                    <dd className="eq-pdf-meta-val">{issueDateFormatted}</dd>
                  </div>
                  {variant === 'quote' && (corporateSettings.validityDays || activeDoc.valid_until) && <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">
                      <Calendar size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Validez de oferta:
                    </dt>
                    <dd className="eq-pdf-meta-val">{corporateSettings.validityDays ? `${corporateSettings.validityDays} días` : ''}{corporateSettings.validityDays && expirationDateFormatted ? ' · ' : ''}{expirationDateFormatted}</dd>
                  </div>}
                  <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">
                      <User size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Asesor comercial:
                    </dt>
                    <dd className="eq-pdf-meta-val">{advisor || '—'}</dd>
                  </div>
                  <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">Moneda:</dt>
                    <dd className="eq-pdf-meta-val">Dólares Americanos ($ USD)</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Ficha del Cliente */}
            <section className="eq-pdf-client-card" aria-label="Datos del Cliente">
              <div className="eq-pdf-card-heading">
                <h3 className="eq-pdf-card-title">
                  <Building2 size={13} aria-hidden="true" />
                  Ficha del Cliente / Destinatario Corporativo
                </h3>
                {activeDoc.contact_person && (
                  <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                    <strong>Atención:</strong> {activeDoc.contact_person}
                  </span>
                )}
              </div>

              <dl className="eq-pdf-client-grid">
                <div className="eq-pdf-field">
                  <dt>Cliente / Razón Social</dt>
                  <dd>{activeDoc.customer_name || activeDoc.customerName || (variant === 'pos' ? 'Venta de mostrador' : 'Sin cliente indicado')}</dd>
                </div>
                <div className="eq-pdf-field">
                  <dt>RUC / Cédula</dt>
                  <dd>{activeDoc.customer_document || activeDoc.customerDocument || 'No indicado'}</dd>
                </div>
                <div className="eq-pdf-field">
                  <dt>Teléfono / Celular</dt>
                  <dd>{activeDoc.customer_phone || activeDoc.customerPhone || '—'}</dd>
                </div>
                <div className="eq-pdf-field">
                  <dt>Correo Electrónico</dt>
                  <dd>{activeDoc.customer_email || activeDoc.customerEmail || '—'}</dd>
                </div>
                <div className="eq-pdf-field is-wide">
                  <dt>Dirección de Entrega / Instalación</dt>
                  <dd>{activeDoc.customer_address || activeDoc.customerAddress || '—'}</dd>
                </div>
              </dl>
            </section>

            {/* Tabla Desglosada de Ítems (Nivel POS) */}
            <div className="eq-pdf-table-wrap">
              <table className="eq-pdf-table" aria-label="Detalle de productos y servicios cotizados">
                <thead>
                  <tr>
                    <th className="eq-pdf-col-idx">N°</th>
                    <th>Descripción y acabados</th>
                    <th className="eq-pdf-col-dim">Medidas</th>
                    <th className="eq-pdf-col-area">Área / unidad</th>
                    <th className="eq-pdf-col-qty">Cantidad</th>
                    <th className="eq-pdf-col-price">Precio unitario</th>
                    <th className="eq-pdf-col-subtotal">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {normalizedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="eq-pdf-col-idx">{String(item.index).padStart(2, '0')}</td>
                      <td>
                        <div className="eq-pdf-item-title">{item.name}</div>
                        {item.description && <p className="eq-pdf-item-desc">{item.description}</p>}
                        {item.category && (
                          <div className="eq-pdf-item-badges">
                            <span className="eq-pdf-item-tag">{item.category}</span>
                            {item.unit === 'm²' && <span className="eq-pdf-item-tag">Cálculo por Área</span>}
                          </div>
                        )}
                      </td>
                      <td className="eq-pdf-col-dim">{item.dimensions}</td>
                      <td className="eq-pdf-col-area">{item.area}</td>
                      <td className="eq-pdf-col-qty">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="eq-pdf-col-price">{formatMoney(item.unitPrice)}</td>
                      <td className="eq-pdf-col-subtotal">{formatMoney(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Resumen económico y acceso a la propuesta guardada */}
            <div className={`eq-pdf-bottom-grid${variant === 'pos' || !isPublicQuote ? ' is-full-width' : ''}`}>
              {isPublicQuote && <div className="eq-pdf-banking-block">
                <div className="eq-pdf-portal-card">
                  <ExternalLink size={15} aria-hidden="true" />
                  <div><strong>Consulta y aprobación en línea</strong><a href={verificationUrl} target="_blank" rel="noopener noreferrer">{window.location.host}/seguimiento/{quoteCode}</a></div>
                </div>
              </div>}
              {/* Liquidación con los valores de IVA guardados en el documento */}
              <div className="eq-pdf-financial-card">
                  <h4 className="eq-pdf-fin-title">
                  <DollarSign size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
                   Resumen económico
                </h4>

                <div className="eq-pdf-fin-row">
                  <span>{financialSummary.taxApplied ? `Subtotal gravado (${financialSummary.taxRate}% IVA):` : 'Subtotal:'}</span>
                  <span className="eq-pdf-fin-val">{formatMoney(financialSummary.subtotal15)}</span>
                </div>

                {financialSummary.subtotal0 > 0 && (
                  <div className="eq-pdf-fin-row">
                    <span>Subtotal 0% (Tarifa cero / Exento):</span>
                    <span className="eq-pdf-fin-val">{formatMoney(financialSummary.subtotal0)}</span>
                  </div>
                )}

                {financialSummary.discountAmount > 0 && (
                  <div className="eq-pdf-fin-row is-discount">
                    <span>
                      Descuento comercial {financialSummary.discountPercent ? `(${financialSummary.discountPercent}%)` : ''}:
                    </span>
                    <span className="eq-pdf-fin-val discount-val">
                      −{formatMoney(financialSummary.discountAmount)}
                    </span>
                  </div>
                )}

                <div className="eq-pdf-fin-row is-base">
                  <span>Base Imponible:</span>
                  <span className="eq-pdf-fin-val">{formatMoney(financialSummary.baseImponible)}</span>
                </div>

                <div className="eq-pdf-fin-row">
                  <span>
                    <strong>{financialSummary.taxApplied ? `IVA ${financialSummary.taxRate}%` : 'IVA no aplicado'}</strong>
                  </span>
                  <span className="eq-pdf-fin-val">{financialSummary.taxApplied ? formatMoney(financialSummary.ivaAmount) : 'No aplica'}</span>
                </div>

                {financialSummary.shipping > 0 && (
                  <div className="eq-pdf-fin-row">
                    <span>Instalación en sitio / Transporte:</span>
                    <span className="eq-pdf-fin-val">{formatMoney(financialSummary.shipping)}</span>
                  </div>
                )}

                {/* Total General */}
                <div className="eq-pdf-grand-total">
                  <span className="eq-pdf-grand-label">Total general</span>
                  <span className="eq-pdf-grand-amount">{formatMoney(financialSummary.total)} USD</span>
                </div>

                {variant === 'quote' && financialSummary.hasPaymentSplit && <div className="eq-pdf-payment-split">
                  <div className="eq-pdf-split-box">
                    <span className="eq-pdf-split-label">Anticipo</span>
                    <span className="eq-pdf-split-val">{formatMoney(financialSummary.advance50)}</span>
                  </div>
                  <div className="eq-pdf-split-box">
                    <span className="eq-pdf-split-label">Saldo</span>
                    <span className="eq-pdf-split-val">{formatMoney(financialSummary.balance50)}</span>
                  </div>
                </div>}
              </div>
            </div>

            {/* Términos Comerciales y Garantías */}
            {variant === 'quote' && (corporateSettings.validityDays || activeDoc.valid_until || corporateSettings.deliveryTime || activeDoc.warranty_terms || activeDoc.payment_terms || activeDoc.notes) && <div className="eq-pdf-terms-block">
              <h5 className="eq-pdf-terms-title">Condiciones del pedido</h5>
              <ul className="eq-pdf-terms-list">
                {(corporateSettings.validityDays || activeDoc.valid_until) && <li><strong>Validez:</strong> {corporateSettings.validityDays ? `${corporateSettings.validityDays} días` : ''}{corporateSettings.validityDays && expirationDateFormatted ? ' · ' : ''}{expirationDateFormatted}</li>}
                {corporateSettings.deliveryTime && <li><strong>Tiempo estimado de entrega:</strong> {corporateSettings.deliveryTime}</li>}
                {activeDoc.warranty_terms && <li><strong>Garantía:</strong> {activeDoc.warranty_terms}</li>}
                {activeDoc.payment_terms && <li><strong>Condiciones de pago:</strong> {activeDoc.payment_terms}</li>}
                {activeDoc.notes && (
                  <li><strong>Observación:</strong> {activeDoc.notes}</li>
                )}
              </ul>
            </div>}

            {/* Bloque de Firmas: Cliente y Asesor Comercial */}
            <div className="eq-pdf-signatures">
              <div className="eq-pdf-signature-box">
                <div className="eq-pdf-signature-line" />
                <h5 className="eq-pdf-signature-title">
                  <User size={12} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Aceptado por el Cliente
                </h5>
                <p className="eq-pdf-signature-sub">
                  Firma de Aceptación / Sello de Recepción
                  <br />
                  C.I. / RUC: ______________________
                </p>
              </div>

              <div className="eq-pdf-signature-box">
                <div className="eq-pdf-signature-line" />
                <h5 className="eq-pdf-signature-title">{corporateSettings.legalName || corporateSettings.brandName}</h5>
                <p className="eq-pdf-signature-sub">
                  {advisor}
                  <br />
                  Asesor comercial
                </p>
              </div>
            </div>

            {/* Pie de Página Oficial */}
            <footer className="eq-pdf-footer">
              <span>
                {variant === 'pos' ? 'Vista previa de orden · Confirma la venta desde el POS.' : isPublicQuote ? 'Visual Corp · Proforma comercial' : 'Borrador de proforma · Visual Corp'}
              </span>
              <span>{quoteCode ? `Ref: ${quoteCode}` : variant === 'pos' ? 'Borrador POS' : 'Sin número asignado'}</span>
            </footer>
          </article>
        </div>
      </div>
    </dialog>
  );
}

export default ExecutiveQuotePdfModal;
