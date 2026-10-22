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

export function getQuoteWhatsAppRoutes(settings = {}) {
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

export function resolveQuoteWhatsAppRoute(settings = {}, items = []) {
  const routes = getQuoteWhatsAppRoutes(settings);
  const searchable = items.map((item) => `${item.category || ''} ${item.name || item.productName || ''}`.toLowerCase()).join(' ');
  return routes.find((route) => route.categories.some((category) => searchable.includes(String(category).toLowerCase())))
    || routes.find((route) => route.categories.length === 0)
    || routes[0]
    || null;
}

const amount = (value) => `$${Number(value || 0).toFixed(2)}`;

export function buildQuoteWhatsAppMessage({ reference, customer, items = [], subtotal, taxRate, taxAmount, total, notes, settings = {} }) {
  const intro = settings.quoteMessageIntro || '¡Hola Gigaprint! Acabo de generar una solicitud de cotización.';
  const closing = settings.quoteMessageClosing || '¿Podrían confirmar disponibilidad, precio final y tiempo de entrega?';
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
    lines.push(`${index + 1}. *${name}* × ${quantity}`);
    if (item.variant) lines.push(`   • ${item.variant}`);
    else if (item.description) lines.push(`   • ${item.description}`);
    lines.push(`   • Estimado: ${amount(item.total ?? item.totalPrice ?? (Number(item.price || item.unitPrice || 0) * quantity))}`);
  });
  lines.push('', `*Subtotal:* ${amount(subtotal)}`);
  lines.push(`*IVA (${Number(taxRate || 0)}%):* ${amount(taxAmount)}`);
  lines.push(`*Total estimado:* ${amount(total)}`);
  if (notes) lines.push('', `*Observaciones:* ${notes}`);
  lines.push('', closing, '', '_Valor referencial sujeto a revisión técnica y arte final._');
  return lines.join('\n');
}

export function buildWhatsAppUrl(number, message) {
  const normalized = normalizeWhatsAppNumber(number);
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(message)}` : '';
}
