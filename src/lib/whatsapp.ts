const ECUADOR_CODE = '593';

export function normalizeWhatsAppNumber(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(ECUADOR_CODE)) return digits;
  if (digits.startsWith('0')) return `${ECUADOR_CODE}${digits.slice(1)}`;
  if (digits.length === 9) return `${ECUADOR_CODE}${digits}`;
  return digits;
}

export function getQuoteWhatsAppRoutes(settings: Record<string, any> = {}) {
  const configured = Array.isArray(settings.quoteWhatsappRoutes) ? settings.quoteWhatsappRoutes : [];
  const routes = configured
    .filter((route) => route?.active !== false && normalizeWhatsAppNumber(route?.number))
    .map((route, index) => ({
      id: route.id || `route-${index + 1}`,
      label: route.label || 'Ventas',
      number: normalizeWhatsAppNumber(route.number),
      categories: Array.isArray(route.categories) ? route.categories.filter(Boolean) : [],
      priority: Number(route.priority ?? index),
    }))
    .sort((a, b) => a.priority - b.priority);

  if (routes.length) return routes;
  const fallback = normalizeWhatsAppNumber(settings.whatsapp);
  return fallback ? [{ id: 'principal', label: 'Ventas', number: fallback, categories: [], priority: 0 }] : [];
}

export function resolveQuoteWhatsAppRoute(settings: Record<string, any> = {}, items: Array<Record<string, any>> = []) {
  const routes = getQuoteWhatsAppRoutes(settings);
  const searchable = items.map((item) => `${item.category || ''} ${item.name || item.productName || ''}`.toLowerCase()).join(' ');
  return routes.find((route) => route.categories.some((category) => searchable.includes(String(category).toLowerCase())))
    || routes.find((route) => route.categories.length === 0)
    || routes[0]
    || null;
}

const amount = (value) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

export function buildQuoteWhatsAppMessage({ reference, customer, items = [], subtotal, discountAmount, taxRate, taxAmount, shipping, total, notes, settings = {} }: { reference?: string; customer: Record<string, any>; items?: Array<Record<string, any>>; subtotal?: number; discountAmount?: number; taxRate?: number; taxAmount?: number; shipping?: number; total?: number; notes?: string; settings?: Record<string, any> }) {
  const intro = settings.quoteMessageIntro || '¡Hola Visual Corp! He preparado esta solicitud de cotización.';
  const closing = settings.quoteMessageClosing || '¿Podrían confirmar disponibilidad y fecha de entrega?';
  const lines = [intro, '', `*Solicitud:* ${reference || 'Pendiente de registro'}`];
  lines.push(`*Cliente:* ${customer.name}`);
  lines.push(`*WhatsApp:* ${customer.phone}`);
  if (customer.city) lines.push(`*Ciudad / sector:* ${customer.city}`);
  if (customer.email) lines.push(`*Correo:* ${customer.email}`);
  if (customer.company) lines.push(`*Empresa:* ${customer.company}`);
  lines.push('', '*Detalle solicitado:*');
  items.forEach((item, index) => {
    const name = item.name || item.productName || 'Producto';
    const quantity = Number(item.quantity || 1);
    const details = item.pricingDetails || {};
    const quote = item.quoteBreakdown || {};
    lines.push('', `${index + 1}. *Producto:* ${name}`);
    const dimensions = details.dimensions || (details.widthCm && details.heightCm ? `${details.widthCm} × ${details.heightCm} cm` : '');
    if (dimensions) lines.push(`Medidas: ${dimensions}${details.totalArea ? ` (${Number(details.totalArea).toLocaleString('es-EC')} m² total)` : ''}`);
    lines.push(`Cantidad: ${details.pieceQuantity || quantity} ${details.pieceUnit || (quantity === 1 ? 'pieza' : 'piezas')}`);
    const rate = details.rate ?? quote.rate ?? item.price ?? item.unitPrice;
    const rateUnit = details.rateUnit || (quote.mode === 'area' ? 'm²' : 'unidad');
    if (Number.isFinite(Number(rate))) lines.push(`Tarifa: ${details.tierLabel || quote.tier?.label || 'PVP'} (${amount(rate)}/${rateUnit})`);
    if (item.variant) lines.push(`Detalle: ${item.variant}`);
    else if (item.description) lines.push(`Detalle: ${item.description}`);
    if (Number.isFinite(Number(details.material ?? quote.material))) lines.push(`Material impreso: ${amount(details.material ?? quote.material)}`);
    if (Number(details.design ?? quote.design) > 0) lines.push(`Diseño gráfico: ${amount(details.design ?? quote.design)}`);
    const namedExtras = Array.isArray(details.extras) ? details.extras : [];
    if (namedExtras.length) namedExtras.forEach((extra) => lines.push(`${extra.name || 'Extra'}: ${amount(extra.amount ?? extra.price)}`));
    else if (Number(details.extrasTotal ?? quote.extras) > 0) lines.push(`Extras: ${amount(details.extrasTotal ?? quote.extras)}`);
    lines.push(`Subtotal del artículo: ${amount(details.subtotal ?? quote.subtotal ?? item.total ?? item.totalPrice ?? (Number(item.price || item.unitPrice || 0) * quantity))}`);
  });
  lines.push('', `*Subtotal:* ${amount(subtotal)}`);
  if (Number(discountAmount) > 0) lines.push(`*Descuento comercial:* −${amount(discountAmount)}`);
  if (Number(shipping) > 0) lines.push(`*Envío / otros cargos:* ${amount(shipping)}`);
  if (Number(taxRate) > 0) lines.push(`*IVA (${Number(taxRate)}%):* ${amount(taxAmount)}`);
  else lines.push('*IVA:* No aplicado');
  lines.push(`*TOTAL:* ${amount(total)}`);
  if (notes) lines.push('', `*Observaciones:* ${notes}`);
  lines.push('', closing, '', settings.quoteValidityLabel || '_Validez: 15 días laborables._');
  return lines.join('\n');
}

export function buildOperationalQuoteWhatsAppMessage({ advisor, customer, items = [], tierLabel, subtotal, discountAmount, discountPercent, discountReason, taxRate, taxAmount, otherCharges, total, deliveryDate }: {
  advisor: string; customer?: string; items?: Array<Record<string, any>>; tierLabel: string; subtotal: number; discountAmount: number; discountPercent: number; discountReason?: string; taxRate: number; taxAmount: number; otherCharges: number; total: number; deliveryDate?: string;
}) {
  const lines = [`*COTIZACIÓN ${String(advisor || 'VISUAL CORP').toLocaleUpperCase('es')}*`, '', `Cliente: ${customer?.trim() || 'Por definir'}`];
  items.forEach((item, index) => {
    lines.push('', `${index === 0 ? '' : `${index + 1}. `}*Producto:* ${item.name || 'Producto'}`);
    if (item.dimensions) lines.push(`Medidas: ${item.dimensions}${item.areaPerPiece ? ` (${Number(item.areaPerPiece).toLocaleString('es-EC')} m² por pieza${item.totalArea ? ` · ${Number(item.totalArea).toLocaleString('es-EC')} m² total` : ''})` : ''}`);
    lines.push(`Cantidad: ${item.quantity} ${item.quantity === 1 ? item.unit || 'pieza' : item.unit === 'unidad' ? 'unidades' : item.unit || 'piezas'}`);
    lines.push(`Tarifa: ${tierLabel}${item.rate != null ? ` (${amount(item.rate)}/${item.rateUnit || 'unidad'})` : ''}`);
    if (item.option) lines.push(`Acabado / opción: ${item.option}${Number(item.optionAmount) > 0 ? ` (+${amount(item.optionAmount)})` : ''}`);
    if (item.description) lines.push(`Detalle: ${item.description}`);
    if (item.lineTotal != null) lines.push(`*Total del artículo:* ${amount(item.lineTotal)}`);
  });
  lines.push('', `*Subtotal:* ${amount(subtotal)}`);
  if (discountAmount > 0) {
    lines.push(`*Descuento comercial (${discountPercent}%):* −${amount(discountAmount)}`);
    if (discountReason?.trim()) lines.push(`Motivo: ${discountReason.trim()}`);
  }
  if (otherCharges > 0) lines.push(`*Envío / otros cargos:* ${amount(otherCharges)}`);
  if (taxRate > 0) lines.push(`*IVA (${taxRate}%):* ${amount(taxAmount)}`);
  else lines.push('*IVA:* No aplicado');
  lines.push(`*TOTAL:* ${amount(total)}`);
  if (deliveryDate) lines.push('', `Entrega solicitada: ${deliveryDate}`);
  lines.push('', '_Propuesta sujeta a confirmación de disponibilidad y especificaciones._');
  return lines.join('\n');
}

export async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('El navegador no permitió copiar el mensaje.');
}

export function buildPOSWhatsAppMessage({ advisor, customer, branch, reference, items = [], total, quoteFinancial, subtotal, discountAmount = 0, discountPercent = 0, discountReason, taxRate = 0, taxAmount = 0 }: {
  advisor: string; customer?: string; branch?: string; reference?: string; items?: Array<Record<string, any>>; total: number; quoteFinancial?: Record<string, any> | null; subtotal?: number; discountAmount?: number; discountPercent?: number; discountReason?: string; taxRate?: number; taxAmount?: number;
}) {
  const lines = [`*PEDIDO ${String(advisor || 'VISUAL CORP').toLocaleUpperCase('es')}*`, '', `Cliente: ${customer?.trim() || 'Venta de mostrador'}`, `Sucursal: ${branch || 'Por confirmar'}`];
  if (reference) lines.push(`Cotización: ${reference}`);
  lines.push('', '*Productos:*');
  items.forEach((item, index) => {
    lines.push(`${index + 1}. *${item.name || item.description || 'Producto'}*`);
    if (item.dimensions) lines.push(`   Medidas: ${item.dimensions}`);
    const quantityLabel = item.pieceQuantity
      ? `${item.pieceQuantity} ${item.pieceUnit || 'piezas'}${item.totalArea ? ` · ${Number(item.totalArea).toLocaleString('es-EC')} m² total` : ''}`
      : `${item.quantity} ${item.unit || 'unidad(es)'}`;
    lines.push(`   Cantidad: ${quantityLabel} · ${amount(item.lineTotal ?? item.unitPrice * item.quantity)}`);
  });
  if (quoteFinancial && Number.isFinite(Number(quoteFinancial.subtotal))) {
    lines.push('', `*Subtotal:* ${amount(quoteFinancial.subtotal)}`);
    if (Number(quoteFinancial.discount_amount) > 0) lines.push(`*Descuento comercial:* −${amount(quoteFinancial.discount_amount)}`);
    if (Number(quoteFinancial.shipping_cost) > 0) lines.push(`*Envío / otros cargos:* ${amount(quoteFinancial.shipping_cost)}`);
    if (quoteFinancial.iva_applied === true && Number(quoteFinancial.iva_rate) > 0) lines.push(`*IVA (${Number(quoteFinancial.iva_rate)}%):* ${amount(quoteFinancial.iva_amount)}`);
    else lines.push('*IVA:* No aplicado');
  } else if (Number.isFinite(Number(subtotal))) {
    lines.push('', `*Subtotal:* ${amount(subtotal)}`);
    if (Number(discountAmount) > 0) {
      lines.push(`*Descuento comercial (${Number(discountPercent) || 0}%):* −${amount(discountAmount)}`);
      if (discountReason?.trim()) lines.push(`Motivo: ${discountReason.trim()}`);
    }
    if (Number(taxRate) > 0) lines.push(`*IVA (${Number(taxRate)}%):* ${amount(taxAmount)}`);
    else lines.push('*IVA:* No aplicado');
  }
  lines.push(`*TOTAL:* ${amount(total)}`, '', '_Valores según la orden registrada en el POS._');
  return lines.join('\n');
}

export function buildWhatsAppUrl(number, message) {
  const normalized = normalizeWhatsAppNumber(number);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : '';
}
