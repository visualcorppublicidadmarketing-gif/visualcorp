const CSV_COLUMNS = [
  ['id', 'ID'],
  ['title', 'Título'],
  ['description', 'Descripción'],
  ['availability', 'Disponibilidad'],
  ['condition', 'Condición'],
  ['price', 'Precio'],
  ['link', 'Enlace'],
  ['image_link', 'Imagen'],
  ['brand', 'Marca'],
  ['google_product_category', 'Categoría Google'],
  ['fb_product_category', 'Categoría Meta'],
  ['sale_price', 'Precio oferta'],
  ['sale_price_effective_date', 'Vigencia oferta'],
];

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function getCatalogPublicBaseUrl(value) {
  const fallback = typeof window !== 'undefined' ? window.location.origin : '';
  const raw = String(value || fallback).trim();
  return raw.replace(/\/$/, '');
}

export function getCatalogProductUrl(product, publicBaseUrl) {
  return `${getCatalogPublicBaseUrl(publicBaseUrl)}/tienda/${encodeURIComponent(product.id)}`;
}

export function getCatalogImageUrl(product, publicBaseUrl) {
  const image = String(product.image || '').trim();
  if (!image) return '';
  if (/^(https?:|data:|blob:)/i.test(image)) return image;
  const base = getCatalogPublicBaseUrl(publicBaseUrl);
  try {
    const baseUrl = new URL(base);
    const imagePath = image.startsWith('/') ? image : `/${image}`;
    return imagePath.startsWith(baseUrl.pathname.replace(/\/$/, '') + '/')
      ? new URL(imagePath, baseUrl.origin).href
      : new URL(imagePath.replace(/^\/+/, ''), `${base}/`).href;
  } catch {
    return `${base}/${image.replace(/^\/+/, '')}`;
  }
}

export function buildWhatsAppCatalogRow(product, publicBaseUrl, overrides = {}) {
  const price = Number(overrides.price ?? product.price ?? 0);
  const category = overrides.category || product.category || 'General';
  return {
    id: String(product.id || ''),
    title: cleanText(overrides.title || product.name || 'Producto Gigaprint').slice(0, 150),
    description: cleanText(overrides.description || product.description || `Producto personalizado de ${category}.`).slice(0, 5000),
    availability: overrides.availability || 'in stock',
    condition: 'new',
    price: `${price.toFixed(2)} USD`,
    link: getCatalogProductUrl(product, publicBaseUrl),
    image_link: getCatalogImageUrl(product, publicBaseUrl),
    brand: 'Gigaprint',
    google_product_category: overrides.googleCategory || 'Arts & Entertainment > Hobbies & Creative Arts',
    fb_product_category: category,
    sale_price: '',
    sale_price_effective_date: '',
  };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildWhatsAppCatalogCsv(products, publicBaseUrl, overridesById = {}) {
  const header = CSV_COLUMNS.map(([, label]) => label).join(',');
  const rows = products.map((product) => {
    const row = buildWhatsAppCatalogRow(product, publicBaseUrl, overridesById[product.id]);
    return CSV_COLUMNS.map(([key]) => escapeCsv(row[key])).join(',');
  });
  return `\uFEFF${header}\n${rows.join('\n')}\n`;
}

export function downloadWhatsAppCatalogCsv(csv, filename = 'gigaprint-catalogo-whatsapp.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { CSV_COLUMNS };
