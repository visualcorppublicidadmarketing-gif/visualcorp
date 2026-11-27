import type { PublicServiceId } from './content';

export type StorefrontProductGroup =
  | 'Textil'
  | 'Gran formato'
  | 'Rótulos y materiales'
  | 'Imprenta'
  | 'Displays y eventos'
  | 'Promocionales'
  | 'Otros productos';

export type StorefrontServiceId = PublicServiceId | '';

/** Visible catalog fields used by storefront discovery and filtering. */
export type StorefrontProductRecord = {
  id?: string | null;
  sku?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  features?: readonly string[] | null;
};

export type StorefrontCatalogItem = StorefrontProductRecord & {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category_id?: string | null;
  calc_type?: string | null;
  image?: string | null;
  images?: string[] | null;
  featured?: boolean;
  sort_order?: number | null;
  custom_options?: { quantity_pricing?: { legacy_skus?: string[]; legacy_ids?: string[] } };
  price_scales?: unknown;
  quantityTiers?: string[];
  sourceIds?: string[];
  sourceSkus?: string[];
};

export type ConsolidatedStorefrontCatalogItem = StorefrontCatalogItem & {
  quantityTiers?: string[];
  sourceIds?: string[];
  sourceSkus?: string[];
};

export const STOREFRONT_SEARCH_PARAM = 'buscar';
export const STOREFRONT_FAMILY_PARAM = 'familia';
export const STOREFRONT_SKU_PARAM = 'sku';
export const STOREFRONT_SORT_PARAM = 'orden';

/**
 * Columns explicitly exposed by `public.public_catalog_products`.
 * Pricing columns (`price`, `price_inst`, `price_corp`, `price_scales`) and internal
 * `custom_options` are excluded from the public storefront view by design.
 */
export const PUBLIC_CATALOG_SELECT_COLUMNS =
  'id,sku,name,slug,description,type,category_id,category,calc_type,featured,sort_order,image,images,features';

export type StorefrontSortOrder = 'relevance' | 'az' | 'za';

const storefrontSortOrders = new Set<StorefrontSortOrder>(['relevance', 'az', 'za']);

export function getStorefrontSortOrder(searchParams: URLSearchParams): StorefrontSortOrder {
  const value = searchParams.get(STOREFRONT_SORT_PARAM);
  return value && storefrontSortOrders.has(value as StorefrontSortOrder)
    ? value as StorefrontSortOrder
    : 'relevance';
}

export function withStorefrontSortOrder(searchParams: URLSearchParams, value: StorefrontSortOrder) {
  const next = new URLSearchParams(searchParams);
  next.set(STOREFRONT_SORT_PARAM, value);
  return next;
}

export function getStorefrontSearchQuery(searchParams: URLSearchParams) {
  return searchParams.get(STOREFRONT_SEARCH_PARAM) || '';
}

export function withStorefrontSearchQuery(searchParams: URLSearchParams, value: string) {
  const next = new URLSearchParams(searchParams);
  if (value.trim()) next.set(STOREFRONT_SEARCH_PARAM, value);
  else next.delete(STOREFRONT_SEARCH_PARAM);
  return next;
}

export function clearStorefrontSearchAndFamily(searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams);
  next.delete(STOREFRONT_SEARCH_PARAM);
  next.delete(STOREFRONT_FAMILY_PARAM);
  return next;
}

export function clearStorefrontCatalogState(searchParams: URLSearchParams) {
  const next = clearStorefrontSearchAndFamily(searchParams);
  next.delete(STOREFRONT_SORT_PARAM);
  return next;
}

export function reconcileStorefrontSelection(
  products: readonly StorefrontCatalogItem[],
  selectedIds: readonly string[],
  selectedTiers: Readonly<Record<string, string>>,
) {
  const uniqueSelectedIds = [...new Set(selectedIds)];
  const productByAnyId = new Map<string, StorefrontCatalogItem>();
  products.forEach((product) => {
    productByAnyId.set(product.id, product);
    product.sourceIds?.forEach((sourceId) => productByAnyId.set(sourceId, product));
  });

  const ids = [...new Set(uniqueSelectedIds.flatMap((id) => {
    const product = productByAnyId.get(id);
    return product ? [product.id] : [];
  }))];
  const quantityTiers: Record<string, string> = {};
  Object.entries(selectedTiers).forEach(([id, tier]) => {
    const product = productByAnyId.get(id);
    if (product?.quantityTiers?.includes(tier)) quantityTiers[product.id] = tier;
  });

  return {
    ids,
    quantityTiers,
    removedCount: uniqueSelectedIds.filter((id) => !productByAnyId.has(id)).length,
  };
}

export function buildStorefrontQuoteUrl(
  items: readonly StorefrontCatalogItem[],
  selectedTiers: Readonly<Record<string, string>>,
  labelsById: Readonly<Record<string, string>>,
  multiProductServiceLabel: string,
  quantityTier = '',
) {
  const params = new URLSearchParams();
  const itemServiceIds = items.map((product) => getStorefrontServiceId(getStorefrontProductGroup(product)));
  const serviceIds = [...new Set(itemServiceIds.filter(Boolean))];
  if (items.length === 1 && itemServiceIds[0]) params.set('servicio', itemServiceIds[0]);
  else if (items.length > 1) {
    const oneSharedService = itemServiceIds.every(Boolean) && serviceIds.length === 1;
    params.set('servicio', oneSharedService ? serviceIds[0] : multiProductServiceLabel);
  }

  items.forEach((product, index) => {
    params.append('producto', labelsById[product.id] || product.name);
    params.append(STOREFRONT_SKU_PARAM, product.sku || '');
    params.append('familia', itemServiceIds[index]);
  });
  if (items.length === 1) {
    const tier = quantityTier || selectedTiers[items[0].id] || '';
    if (tier) params.set('cantidad', tier);
  } else if (items.length > 1) {
    items.forEach((product) => params.append('cantidad', selectedTiers[product.id] || ''));
  }

  return `/cotizador?${params.toString()}`;
}

export function normalizeStorefrontSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

export function getStorefrontProductNameKey(name: string) {
  return normalizeStorefrontSearch(name).replace(/[^a-z0-9]+/g, ' ').trim();
}

function numericProductVariantLabel(product: StorefrontCatalogItem) {
  const categoryText = normalizeStorefrontSearch(product.category || '');
  if (categoryText === 'radiografia alta densidad') return `Radiografía Alta Densidad · Pliego ${product.name.trim()}`;
  if (categoryText === 'boutique manija baja densidad') return `Boutique Manija Baja Densidad · Tamaño ${product.name.trim()}`;
  return '';
}

/**
 * Keeps quantity tiers as one product in every public catalog surface.
 * Size/pliego variants in the two named families remain separate products.
 */
export function consolidateStorefrontQuantityTiers<T extends StorefrontCatalogItem>(rows: readonly T[]) {
  const tierGroups = new Map<string, T[]>();
  const products: Array<T & ConsolidatedStorefrontCatalogItem> = [];

  rows.forEach((product) => {
    const volume = product.custom_options?.quantity_pricing;
    if (volume) {
      const scales = Array.isArray(product.price_scales) ? product.price_scales : [];
      products.push({
        ...product,
        sourceIds: volume.legacy_ids,
        sourceSkus: volume.legacy_skus,
        quantityTiers: scales.flatMap((scale) => scale && Number.isSafeInteger(scale.qty) && Number.isSafeInteger(scale.max_qty)
          ? [scale.qty === scale.max_qty ? String(scale.qty) : `${scale.qty} - ${scale.max_qty}`] : []),
      });
      return;
    }
    const calcType = product.calc_type?.trim().toLocaleLowerCase('es');
    const isTier = calcType === 'scale'
      && /^[\d\s.,–-]+$/.test(product.name.trim())
      && !numericProductVariantLabel(product);
    if (!isTier) {
      const variantLabel = numericProductVariantLabel(product);
      products.push({ ...product, ...(variantLabel ? { name: variantLabel } : {}) });
      return;
    }

    const baseSlug = product.slug.replace(/-\d+(?:-\d+)?$/, '');
    const key = `${product.category_id || ''}:${baseSlug || product.slug}`;
    tierGroups.set(key, [...(tierGroups.get(key) || []), product]);
  });

  tierGroups.forEach((tiers) => {
    const first = tiers[0];
    const baseSlug = first.slug.replace(/-\d+(?:-\d+)?$/, '');
    const descriptionTitle = (first.description || '').split(/[.!?]\s/)[0]?.trim().replace(/[.!?]+$/, '');
    const title = descriptionTitle && descriptionTitle.length <= 72
      ? descriptionTitle
      : first.category || descriptionTitle || 'Producto personalizado';
    products.push({
      ...first,
      slug: baseSlug || first.slug,
      name: title,
      sourceIds: tiers.map((tier) => tier.id),
      sourceSkus: [...new Set(tiers.map((tier) => tier.sku?.trim()).filter((sku): sku is string => Boolean(sku)))],
      quantityTiers: [...new Set(tiers.map((tier) => tier.name.trim()).filter(Boolean))],
      sort_order: Math.min(...tiers.map((tier) => tier.sort_order ?? Number.MAX_SAFE_INTEGER)),
      featured: tiers.some((tier) => Boolean(tier.featured)),
      images: [...new Set(tiers.flatMap((tier) => tier.images || []).filter((image): image is string => typeof image === 'string' && Boolean(image)))],
      features: [...new Set(tiers.flatMap((tier) => tier.features || []).filter((feature): feature is string => typeof feature === 'string' && Boolean(feature.trim())))],
    });
  });

  return products.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'es'));
}

export function getStorefrontProductGroup(product: StorefrontProductRecord): StorefrontProductGroup {
  const categoryText = normalizeStorefrontSearch(product.category || '');
  const nameText = normalizeStorefrontSearch(product.name);
  const identityText = `${nameText} ${categoryText}`;

  if (/fundas? .*camiseta/.test(categoryText)) return 'Promocionales';
  if (/sustrato.*rigid/.test(categoryText)) return 'Rótulos y materiales';
  if (/displays? importados/.test(categoryText)) return 'Displays y eventos';
  if (/impresiones|campana lonas?/.test(categoryText) || categoryText === 'gran formato') return 'Gran formato';
  if (/ropa y textiles|textil|camiseta|polo|uniforme|sublim|\bdtf\b|body recien|almohad|campana camisetas?|polo bordado/.test(categoryText)) return 'Textil';
  if (/fundas? promocionales?|souvenirs?|campana promo|bolso|mochila|boutique/.test(categoryText)) return 'Promocionales';
  if (/imprenta|credenciales?|radiografia alta densidad/.test(categoryText)) return 'Imprenta';

  // Primero se identifica el producto; palabras como lona y vinil suelen nombrar materiales.
  if (/banner x|roll.?up|pop.?up|banner arana|banner en a|porta.?banner|stand publicitario|photocall|display|exhibidor|menudero|circulo led|pancarta|banderola|pendon|totem/.test(nameText)) return 'Displays y eventos';
  if (/rotulo|letrero|senal|placa|corporeo|acrilico|sustrato|alucobond|cintra|foamboard|corte|grabado/.test(nameText)) return 'Rótulos y materiales';
  if (/ropa y textiles|camiseta|polo|uniforme|sublim|\bdtf\b|body recien|almohad/.test(identityText)) return 'Textil';
  if (/imprenta|impresion|tarjeta|volante|papeleria|credencial|factura|carpeta|afiche|triptico|diptico|etiqueta|calendario|radiografia/.test(identityText)) return 'Imprenta';
  if (/promo|souvenir|jarro|taza|funda|bolso|mochila|regalo|llavero|mouse.?pad|tomatodo|gorra|boligrafo|lapiz ecologico|pin publicitario|porta taza|sello personalizado/.test(identityText)) return 'Promocionales';
  if (/gran formato|lona|vinil|gigantografia|microperforado|backlight|valla/.test(identityText)) return 'Gran formato';
  return 'Otros productos';
}

/** Maps storefront groups to service IDs that are published in the public quote configurator. */
export function getStorefrontServiceId(group: StorefrontProductGroup): StorefrontServiceId {
  const serviceByGroup: Record<StorefrontProductGroup, StorefrontServiceId> = {
    'Gran formato': 'gran-formato',
    'Rótulos y materiales': 'rotulos',
    'Imprenta': 'impresion',
    'Textil': 'textil',
    'Displays y eventos': 'eventos',
    'Promocionales': 'textil',
    'Otros productos': '',
  };
  return serviceByGroup[group];
}

export function getStorefrontProductSearchText(product: StorefrontProductRecord) {
  return [
    product.name,
    product.sku || product.id || '',
    product.description || '',
    product.category || '',
    ...(product.features || []),
  ].join(' ');
}
