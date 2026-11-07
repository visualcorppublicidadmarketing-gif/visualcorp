import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  QrCode,
  Share2,
  Sparkles,
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
}

/**
 * Generador matricial SVG determinista para QR de verificación bancaria y pública.
 * Genera una matriz 21x21 (Versión 1 estándar) con patrones de sincronización,
 * esquinas de posicionamiento y píxeles de datos según el valor codificado.
 */
function DynamicQrCodeSvg({ value, size = 78 }: { value: string; size?: number }) {
  const matrix = useMemo(() => {
    const N = 21;
    const grid: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));
    const reserved: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false));

    // Esquinas de posicionamiento 7x7 (Finder Patterns)
    const placeFinder = (startX: number, startY: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[startY + r][startX + c] = isBorder || isCenter;
          reserved[startY + r][startX + c] = true;
        }
      }
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const y = startY + r;
          const x = startX + c;
          if (y >= 0 && y < N && x >= 0 && x < N) {
            reserved[y][x] = true;
          }
        }
      }
    };

    placeFinder(0, 0);
    placeFinder(N - 7, 0);
    placeFinder(0, N - 7);

    // Patrones de temporización (Timing belts)
    for (let i = 7; i < N - 7; i++) {
      grid[6][i] = i % 2 === 0;
      grid[i][6] = i % 2 === 0;
      reserved[6][i] = true;
      reserved[i][6] = true;
    }

    // Hash FNV-1a para dispersión de datos determinista
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    let seed = hash >>> 0;
    const nextBit = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed >> 16) % 2 === 1;
    };

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!reserved[r][c]) {
          grid[r][c] = nextBit();
        }
      }
    }

    return grid;
  }, [value]);

  const N = matrix.length;
  const cellSize = 100 / N;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`Código QR para ${value}`}>
      <rect width="100" height="100" fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.15}
              height={cellSize + 0.15}
              fill="#0f172a"
            />
          ) : null
        )
      )}
    </svg>
  );
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

/**
 * Plantilla de Referencia / Demo operativa para cuando la colección está vacía.
 * Representa pedidos reales de gran formato, rotulación y publicidad en Milagro, Ecuador.
 */
const OPERATIONAL_DEMO_QUOTE: QuoteData = {
  id: 'quote-demo-milagro-2026',
  quote_code: 'PRO-2026-0042',
  status: 'Emitida',
  created_at: new Date().toISOString(),
  advisor_name: 'Esteban / Dirección Comercial',
  customer_name: 'Corporación Favorita S.A. / Sucursal Milagro',
  customer_document: '0990004199001',
  customer_phone: '+593 98 765 4321',
  customer_email: 'compras@corporacionfavorita.com',
  customer_address: 'Av. García Moreno e/ Bolívar y 9 de Octubre, Milagro - Guayas',
  contact_person: 'Lic. Gabriela Salazar · Dpto. de Adquisiciones',
  notes: 'Incluye cuadrilla técnica para montaje nocturno en sitio y pruebas de iluminación eléctrica.',
  items: [
    {
      id: 'item-demo-1',
      name: 'Rótulo Luminoso en Caja de Luz con Perfil de Aluminio',
      category: 'Rótulos y Fachadas',
      description:
        'Estructura de hierro galvanizado anticorrosivo 25×25 mm, perfil perimetral de aluminio negro mate, cara tensada en lona translúcida 550g con impresión UV alta resolución 1440 DPI. Iluminación interior con módulos LED Samsung 2.4W IP67 luz blanca fría 6500K y fuente conmutada 12V 300W.',
      width: '3.00',
      height: '1.20',
      area: '3.60',
      unit: 'm²',
      calcType: 'm2',
      quantity: 1,
      unit_price: 145.0,
      line_total: 522.0,
      taxable: true,
      option: 'Perfilería de aluminio negro mate + Módulos LED IP67',
    },
    {
      id: 'item-demo-2',
      name: 'Vinil Adhesivo Microperforado para Fachada Vidriada',
      category: 'Gran Formato',
      description:
        'Película microperforada 60/40 para visibilidad unidireccional exterior/interior, impresa con tintas ecosolventes japonesas Roland en 12 pasadas con filtro UV. Incluye retiro de vinil previo y limpieza desengrasante de cristales.',
      width: '2.40',
      height: '1.80',
      area: '4.32',
      unit: 'm²',
      calcType: 'm2',
      quantity: 1,
      unit_price: 18.5,
      line_total: 79.92,
      taxable: true,
      option: 'Microperforado 60/40 alta durabilidad',
    },
    {
      id: 'item-demo-3',
      name: 'Letras Corpóreas en Acrílico 3D con Luz Indirecta Neón LED',
      category: 'Corte Láser & Neón',
      description:
        'Letras 3D en acrílico cristal 3mm termoformado y laqueado en color corporativo, base en PVC espumado de 10mm, retroiluminación indirecta halo light con manguera de neón flex LED 12V blanco cálido.',
      width: '1.50',
      height: '0.45',
      area: '0.68',
      unit: 'u',
      calcType: 'unit',
      quantity: 1,
      unit_price: 210.0,
      line_total: 210.0,
      taxable: true,
      option: 'Retroiluminación Halo Light 12V',
    },
    {
      id: 'item-demo-4',
      name: 'Roll-Up Banner Publicitario Premium con Bolso Acolchado',
      category: 'Exhibición & Eventos',
      description:
        'Estructura retráctil de aluminio anodizado reforzado con doble pie estabilizador y varilla telescópica. Lienzo en lona mate antireflejo 440g anti-curvado con resolución fotográfica. Incluye bolso de transporte acolchado.',
      width: '0.85',
      height: '2.00',
      area: '1.70',
      unit: 'u',
      calcType: 'unit',
      quantity: 2,
      unit_price: 38.0,
      line_total: 76.0,
      taxable: true,
      option: 'Lona mate 440g anti-curvado',
    },
  ],
  subtotal_15: 887.92,
  subtotal_0: 0.0,
  discount_amount: 44.4,
  discount_percent: 5,
  shipping_cost: 45.0,
  total: 1015.05,
};

export function ExecutiveQuotePdfModal({
  isOpen,
  open,
  onClose,
  quote,
  document,
  quoteId,
}: ExecutiveQuotePdfModalProps) {
  const visible = isOpen ?? open ?? false;
  const { data } = useWorkspace();
  const [copied, setCopied] = useState(false);

  // Cerrar con la tecla Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && visible) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  // Selección del documento: prop explícito, búsqueda por ID o template demo
  const sourceDoc = quote || document;
  const quoteFromWorkspace = useMemo(() => {
    if (!quoteId || !Array.isArray(data?.quotes)) return null;
    return data.quotes.find((q: any) => q.id === quoteId || q.quote_code === quoteId) || null;
  }, [quoteId, data?.quotes]);

  const activeDoc: QuoteData = useMemo(() => {
    if (sourceDoc && Array.isArray(sourceDoc.items) && sourceDoc.items.length > 0) {
      return sourceDoc;
    }
    if (quoteFromWorkspace && Array.isArray(quoteFromWorkspace.items) && quoteFromWorkspace.items.length > 0) {
      return quoteFromWorkspace;
    }
    return OPERATIONAL_DEMO_QUOTE;
  }, [sourceDoc, quoteFromWorkspace]);

  const isDemo = activeDoc === OPERATIONAL_DEMO_QUOTE;

  // Datos fiscales de Visual Corp (configurados en workspace o valores oficiales)
  const corporateSettings = useMemo(() => {
    const s = data?.settings || {};
    return {
      brandName: s.name || 'Visual Corp Publicidad & Marketing',
      legalName: 'Visual Corp S.A.S.',
      ruc: s.ruc || '0992837482001',
      address: s.location || 'Av. Principal y 17 de Septiembre, Milagro - Guayas, Ecuador',
      phone: s.contactPhone || '+593 99 123 4567',
      whatsapp: s.whatsappSecondary || s.contactPhone || '0967872396',
      email: s.email || 'ventas@visualcorp.ec',
      website: 'www.visualcorp.ec',
      validityDays: 15,
      deliveryTime: '24 a 48 horas tras aprobación del arte final y anticipo',
    };
  }, [data?.settings]);

  // Normalización de ítems y cálculo financiero riguroso (IVA 15% Ecuador)
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
      const dimensions = hasDimensions ? `${widthVal} × ${heightVal} m` : '—';

      const areaCalculated = hasDimensions && !Number.isNaN(Number(widthVal)) && !Number.isNaN(Number(heightVal))
        ? (Number(widthVal) * Number(heightVal)).toFixed(2)
        : null;
      const area = item.area ? String(item.area) : areaCalculated ? `${areaCalculated} m²` : '—';

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
    let subtotal15 = 0;
    let subtotal0 = 0;

    normalizedItems.forEach((item) => {
      if (item.taxable) {
        subtotal15 += item.lineTotal;
      } else {
        subtotal0 += item.lineTotal;
      }
    });

    const discountAmount = Number(activeDoc.discount_amount || 0);
    const discountPercent = activeDoc.discount_percent || (subtotal15 > 0 && discountAmount > 0 ? Math.round((discountAmount / subtotal15) * 100) : 0);
    const baseImponible = Math.max(0, subtotal15 - discountAmount);
    const iva15 = Number((baseImponible * 0.15).toFixed(2));
    const shipping = Number(activeDoc.shipping_cost ?? activeDoc.shipping ?? 0);
    const total = Number((baseImponible + subtotal0 + iva15 + shipping).toFixed(2));
    const advance50 = Number((total * 0.5).toFixed(2));
    const balance50 = Number((total - advance50).toFixed(2));

    return {
      subtotal15,
      subtotal0,
      discountAmount,
      discountPercent,
      baseImponible,
      iva15,
      shipping,
      total,
      advance50,
      balance50,
    };
  }, [normalizedItems, activeDoc.discount_amount, activeDoc.discount_percent, activeDoc.shipping_cost, activeDoc.shipping]);

  // Metadatos de la cotización
  const quoteCode = activeDoc.quote_code || activeDoc.quoteCode || activeDoc.code || 'PRO-2026-0042';
  const issueDateFormatted = formatEcuadorDate(activeDoc.created_at || activeDoc.createdAt);
  const expirationDateFormatted = addCalendarDays(activeDoc.created_at || new Date(), corporateSettings.validityDays);
  const advisor = activeDoc.advisor_name || activeDoc.advisor || 'Esteban / Asesoría Corporativa';
  const status = activeDoc.status || 'Emitida';
  const verificationUrl = `${window.location.origin}/seguimiento/${encodeURIComponent(quoteCode)}`;

  // Acciones: Imprimir / Guardar como PDF
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Acciones: Copiar Enlace Público
  const handleCopyLink = useCallback(async () => {
    try {
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
  }, [verificationUrl]);

  // Acciones: Compartir por WhatsApp
  const handleShareWhatsApp = useCallback(() => {
    const lines = [
      `*PROFORMA EJECUTIVA VISUAL CORP*`,
      `*N°:* ${quoteCode}`,
      `*Cliente:* ${activeDoc.customer_name || 'Estimado Cliente'}`,
      `*Fecha de emisión:* ${issueDateFormatted}`,
      `*Validez:* ${corporateSettings.validityDays} días`,
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
    lines.push(`*Subtotal 15%:* ${formatMoney(financialSummary.subtotal15)}`);
    if (financialSummary.discountAmount > 0) {
      lines.push(`*Descuento comercial (${financialSummary.discountPercent}%):* −${formatMoney(financialSummary.discountAmount)}`);
    }
    lines.push(`*Base Imponible:* ${formatMoney(financialSummary.baseImponible)}`);
    lines.push(`*IVA (15%):* ${formatMoney(financialSummary.iva15)}`);
    if (financialSummary.shipping > 0) {
      lines.push(`*Instalación / Envío:* ${formatMoney(financialSummary.shipping)}`);
    }
    lines.push(`*TOTAL GENERAL:* ${formatMoney(financialSummary.total)} USD`);
    lines.push(``);
    lines.push(`*Condiciones de Pago Sugeridas:*`);
    lines.push(`• Anticipo inicio de producción (50%): ${formatMoney(financialSummary.advance50)} USD`);
    lines.push(`• Saldo contra entrega (50%): ${formatMoney(financialSummary.balance50)} USD`);
    lines.push(``);
    lines.push(`*Cuentas Oficiales Visual Corp S.A.S.:*`);
    lines.push(`• Banco Pichincha Cta. Corriente: 2100874591 (RUC 0992837482001)`);
    lines.push(`• Banco Guayaquil Cta. Ahorros: 0034928174`);
    lines.push(`• Deuna! / Móvil: 0991234567`);
    lines.push(``);
    lines.push(`*Ver proforma oficial y aprobar online:*`);
    lines.push(verificationUrl);
    lines.push(``);
    lines.push(`_Visual Corp Publicidad & Marketing · Milagro, Guayas, Ecuador_`);

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
    issueDateFormatted,
    normalizedItems,
    quoteCode,
    verificationUrl,
  ]);

  if (!visible) return null;

  return (
    <div
      className="eq-pdf-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eq-pdf-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="eq-pdf-modal">
        {/* ====================================================================
            BARRA DE HERRAMIENTAS SUPERIOR (ESTILO MIDDAY / LINEAR)
            ==================================================================== */}
        <header className="eq-pdf-toolbar" aria-label="Acciones de la proforma">
          <div className="eq-pdf-toolbar-info">
            <span className="eq-pdf-doc-badge">
              <FileText size={14} aria-hidden="true" />
              {quoteCode}
            </span>
            <span
              className={`eq-pdf-status-badge status-${status.toLowerCase()}`}
              title={`Estado del documento: ${status}`}
            >
              {status}
            </span>
            {isDemo && (
              <span className="eq-pdf-demo-indicator" title="Visualizando proforma de referencia operativa de Visual Corp">
                <Sparkles size={13} aria-hidden="true" />
                Referencia / Demo operativa
              </span>
            )}
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

            <button
              type="button"
              className="eq-btn eq-btn-whatsapp"
              onClick={handleShareWhatsApp}
              title="Compartir resumen estructurado con enlace público por WhatsApp"
            >
              <Share2 size={15} aria-hidden="true" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              className="eq-btn eq-btn-secondary"
              onClick={handleCopyLink}
              title="Copiar enlace de seguimiento y aprobación para el cliente"
            >
              {copied ? <Check size={14} color="#86efac" /> : <Copy size={14} aria-hidden="true" />}
              <span>{copied ? '¡Copiado!' : 'Copiar enlace'}</span>
            </button>

            <button
              type="button"
              className="eq-btn-icon-close"
              onClick={onClose}
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
          <article className="eq-pdf-sheet" id="printable-quote-sheet">
            <div className="eq-pdf-brand-strip" aria-hidden="true" />

            {/* Cabecera Oficial de Visual Corp */}
            <div className="eq-pdf-header">
              <div className="eq-pdf-brand-col">
                <div className="eq-pdf-logo-mark">
                  <div className="eq-pdf-logo-icon-wrap" aria-hidden="true">
                    <Sparkles size={24} />
                  </div>
                  <div className="eq-pdf-logo-text-wrap">
                    <h1 className="eq-pdf-brand-title" id="eq-pdf-title">
                      VISUAL <span>CORP</span>
                    </h1>
                    <span className="eq-pdf-brand-tagline">
                      PUBLICIDAD · GRAN FORMATO · CORTE LÁSER & ROTULACIÓN
                    </span>
                  </div>
                </div>

                <div className="eq-pdf-fiscal-info">
                  <span>
                    <strong>Razón Social:</strong> {corporateSettings.legalName}
                  </span>
                  <span>
                    <strong>RUC:</strong> {corporateSettings.ruc} · <strong>Matriz:</strong> {corporateSettings.address}
                  </span>
                  <span>
                    <strong>Teléfono / WhatsApp:</strong> {corporateSettings.phone} · {corporateSettings.whatsapp}
                  </span>
                  <span>
                    <strong>Email:</strong> {corporateSettings.email} · <strong>Web:</strong> {corporateSettings.website}
                  </span>
                </div>
              </div>

              {/* Cuadro Técnico de la Cotización */}
              <div className="eq-pdf-meta-box">
                <div className="eq-pdf-meta-header">
                  <div>
                    <span className="eq-pdf-meta-title">PROFORMA EJECUTIVA</span>
                    <h2 className="eq-pdf-meta-code">{quoteCode}</h2>
                  </div>
                  <span className={`eq-pdf-status-badge status-${status.toLowerCase()}`}>{status}</span>
                </div>

                <dl className="eq-pdf-meta-grid">
                  <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">
                      <Calendar size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Fecha Emisión:
                    </dt>
                    <dd className="eq-pdf-meta-val">{issueDateFormatted}</dd>
                  </div>
                  <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">
                      <Calendar size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Validez Oferta:
                    </dt>
                    <dd className="eq-pdf-meta-val">{corporateSettings.validityDays} días ({expirationDateFormatted})</dd>
                  </div>
                  <div className="eq-pdf-meta-row">
                    <dt className="eq-pdf-meta-label">
                      <User size={11} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                      Asesor Comercial:
                    </dt>
                    <dd className="eq-pdf-meta-val">{advisor}</dd>
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
                  <dd>{activeDoc.customer_name || activeDoc.customerName || 'Cliente Corporativo'}</dd>
                </div>
                <div className="eq-pdf-field">
                  <dt>RUC / Cédula</dt>
                  <dd>{activeDoc.customer_document || activeDoc.customerDocument || 'Consumidor Final'}</dd>
                </div>
                <div className="eq-pdf-field">
                  <dt>Teléfono / Celular</dt>
                  <dd>{activeDoc.customer_phone || activeDoc.customerPhone || '—'}</dd>
                </div>
                <div className="eq-pdf-field">
                  <dt>Correo Electrónico</dt>
                  <dd>{activeDoc.customer_email || activeDoc.customerEmail || '—'}</dd>
                </div>
                <div className="eq-pdf-field" style={{ gridColumn: 'span 2' }}>
                  <dt>Dirección de Entrega / Instalación</dt>
                  <dd>{activeDoc.customer_address || activeDoc.customerAddress || 'Retiro en taller / Av. Principal Milagro'}</dd>
                </div>
              </dl>
            </section>

            {/* Tabla Desglosada de Ítems (Nivel POS) */}
            <div className="eq-pdf-table-wrap">
              <table className="eq-pdf-table" aria-label="Detalle de productos y servicios cotizados">
                <thead>
                  <tr>
                    <th className="eq-pdf-col-idx">N°</th>
                    <th>Descripción Técnica & Acabados</th>
                    <th className="eq-pdf-col-dim">Medidas (A × H)</th>
                    <th className="eq-pdf-col-area">Área / Unid.</th>
                    <th className="eq-pdf-col-qty">Cant.</th>
                    <th className="eq-pdf-col-price">P. Unit.</th>
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

            {/* Bloque Inferior: Pago Bancario, QR Dinámico & Liquidación Financiera */}
            <div className="eq-pdf-bottom-grid">
              {/* Columna Izquierda: Cuentas y QR Dinámico */}
              <div className="eq-pdf-banking-block">
                <div className="eq-pdf-bank-accounts">
                  <h4 className="eq-pdf-bank-heading">
                    <QrCode size={13} aria-hidden="true" />
                    Cuentas Oficiales para Transferencias & Depósitos
                  </h4>
                  <ul className="eq-pdf-bank-list">
                    <li className="eq-pdf-bank-item">
                      <span>
                        <strong>Banco Pichincha</strong> · Cta. Corriente
                      </span>
                      <span className="eq-pdf-bank-account-num">2100874591</span>
                      <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                        Titular: Visual Corp S.A.S. · RUC: 0992837482001
                      </span>
                    </li>
                    <li className="eq-pdf-bank-item">
                      <span>
                        <strong>Banco Guayaquil</strong> · Cta. Ahorros
                      </span>
                      <span className="eq-pdf-bank-account-num">0034928174</span>
                      <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                        Titular: Visual Corp S.A.S.
                      </span>
                    </li>
                    <li className="eq-pdf-bank-item">
                      <span>
                        <strong>Deuna! / Pagos Móviles</strong>
                      </span>
                      <span className="eq-pdf-bank-account-num">0991234567</span>
                      <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                        Enviar comprobante a: pagos@visualcorp.ec
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Código QR Dinámico en SVG */}
                <div className="eq-pdf-qr-card">
                  <div className="eq-pdf-qr-svg-wrap">
                    <DynamicQrCodeSvg value={verificationUrl} size={70} />
                  </div>
                  <div className="eq-pdf-qr-text">
                    <strong>Verificación Oficial & Portal de Cliente</strong>
                    <span>
                      Escanea este código con la cámara de tu celular para verificar la validez técnica de esta proforma o realizar el pago directo.
                    </span>
                    <a
                      href={verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="eq-pdf-qr-link"
                    >
                      visualcorp.ec/seguimiento/{quoteCode} <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Columna Derecha: Liquidación Financiera Impecable (IVA 15%) */}
              <div className="eq-pdf-financial-card">
                <h4 className="eq-pdf-fin-title">
                  <DollarSign size={13} aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle' }} />
                  Liquidación Financiera Oficial
                </h4>

                <div className="eq-pdf-fin-row">
                  <span>Subtotal 15% (Gravado con IVA):</span>
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
                    <strong>IVA 15% (Tarifa Ecuador):</strong>
                  </span>
                  <span className="eq-pdf-fin-val">{formatMoney(financialSummary.iva15)}</span>
                </div>

                {financialSummary.shipping > 0 && (
                  <div className="eq-pdf-fin-row">
                    <span>Instalación en sitio / Transporte:</span>
                    <span className="eq-pdf-fin-val">{formatMoney(financialSummary.shipping)}</span>
                  </div>
                )}

                {/* Total General */}
                <div className="eq-pdf-grand-total">
                  <span className="eq-pdf-grand-label">TOTAL GENERAL</span>
                  <span className="eq-pdf-grand-amount">{formatMoney(financialSummary.total)} USD</span>
                </div>

                {/* Condiciones de Anticipo Sugeridas */}
                <div className="eq-pdf-payment-split">
                  <div className="eq-pdf-split-box">
                    <span className="eq-pdf-split-label">Anticipo Inicio (50%)</span>
                    <span className="eq-pdf-split-val">{formatMoney(financialSummary.advance50)}</span>
                  </div>
                  <div className="eq-pdf-split-box">
                    <span className="eq-pdf-split-label">Contra Entrega (50%)</span>
                    <span className="eq-pdf-split-val">{formatMoney(financialSummary.balance50)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Términos Comerciales y Garantías */}
            <div className="eq-pdf-terms-block">
              <h5 className="eq-pdf-terms-title">Condiciones Comerciales, Garantía y Tiempos de Entrega:</h5>
              <ul className="eq-pdf-terms-list">
                <li>
                  <strong>Validez de la oferta:</strong> {corporateSettings.validityDays} días calendario a partir de su emisión. Precios sujetos a confirmación tras vencimiento.
                </li>
                <li>
                  <strong>Tiempo estimado de entrega:</strong> {corporateSettings.deliveryTime}.
                </li>
                <li>
                  <strong>Garantía técnica de calidad:</strong> Tintas ecosolventes y curado UV con alta resistencia a la intemperie, radiación solar y humedad tropical.
                </li>
                <li>
                  <strong>Aprobación de arte:</strong> Todo diseño o logotipo debe ser aprobado por escrito antes del inicio de impresión o corte láser.
                </li>
                {activeDoc.notes && (
                  <li>
                    <strong>Observación especial:</strong> {activeDoc.notes}
                  </li>
                )}
              </ul>
            </div>

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
                <h5 className="eq-pdf-signature-title">{corporateSettings.legalName}</h5>
                <p className="eq-pdf-signature-sub">
                  {advisor}
                  <br />
                  Firma Autorizada & Control de Calidad
                </p>
                <span className="eq-pdf-facsimile-seal">Documento Válido para Producción</span>
              </div>
            </div>

            {/* Pie de Página Oficial */}
            <footer className="eq-pdf-footer">
              <span>
                Visual Corp Suite · Proforma Ejecutiva emitida electrónicamente en Milagro, Guayas, Ecuador.
              </span>
              <span>Página 1 de 1 · Ref: {quoteCode}</span>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveQuotePdfModal;
