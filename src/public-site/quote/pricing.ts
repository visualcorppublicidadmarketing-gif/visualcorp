import { supabase, supabaseConfigured } from '../../lib/supabaseClient';
import { consolidateStorefrontQuantityTiers, type ConsolidatedStorefrontCatalogItem, type StorefrontCatalogItem } from '../storefrontCatalog';
import { getStorefrontQuotePriceBasis } from './storefrontQuoteAliases';

export type PricingMode = 'area' | 'quantity';
type RateTier = { min_qty: number; unit_price: number; label?: string };
export type QuoteProduct = {
  source_key: string;
  sku?: string;
  source_skus?: string[];
  name: string;
  family: string;
  search_text?: string;
  mode: 'area' | 'quantity' | 'fixed';
  unit: string;
  price: number | null;
  install_price: number | null;
  corporate_price: number | null;
  price_basis: 'unit' | 'total' | 'unknown';
  confirmed: boolean;
  tiers: RateTier[];
  quantity_tiers?: string[];
};

type PublicQuoteCatalogRow = StorefrontCatalogItem & {
  calc_type: string;
  price: number | string | null;
  price_inst: number | string | null;
  price_corp: number | string | null;
  price_scales: unknown;
  currency: string | null;
  is_published: boolean;
};

function finiteAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function mapLiveQuoteProduct(row: PublicQuoteCatalogRow & ConsolidatedStorefrontCatalogItem): QuoteProduct | null {
  const calcType = row.calc_type?.trim().toLocaleLowerCase('es');
  if (!row.id || !row.name?.trim() || !['m2', 'unit', 'scale'].includes(calcType)) return null;

  const mode = calcType === 'm2' ? 'area' : 'quantity';
  const sourceSkus = row.sourceSkus?.length ? row.sourceSkus : row.sku ? [row.sku] : [];
  const isQuantityTierGroup = Boolean(row.sourceIds?.length);
  const priceBasis = isQuantityTierGroup
    ? 'unknown'
    : calcType === 'scale'
    ? getStorefrontQuotePriceBasis(row.sku) || 'unknown'
    : 'unit';
  const currencySupported = row.currency?.trim().toLocaleUpperCase('es') === 'USD';
  const canPrice = currencySupported && priceBasis !== 'unknown';
  const scales = Array.isArray(row.price_scales) ? row.price_scales : [];
  const tiers = canPrice && calcType === 'scale'
    ? scales.flatMap((scale) => {
      if (!scale || typeof scale !== 'object') return [];
      const entry = scale as { qty?: unknown; option?: unknown; pvp?: unknown; price?: unknown };
      if (entry.option != null) return [];
      const minQty = finiteAmount(entry.qty);
      const unitPrice = finiteAmount(entry.pvp ?? entry.price);
      return minQty != null && minQty > 0 && unitPrice != null
        ? [{ min_qty: minQty, unit_price: unitPrice, label: String(minQty) }]
        : [];
    })
    : [];

  return {
    source_key: row.id,
    sku: row.sku || undefined,
    source_skus: sourceSkus,
    name: row.name.trim(),
    family: row.category?.trim() || 'General',
    search_text: [row.name, row.category, row.description, ...(row.features || []), ...sourceSkus].filter(Boolean).join(' '),
    mode,
    unit: mode === 'area' ? 'm²' : 'unidad',
    price: canPrice ? finiteAmount(row.price) : null,
    install_price: canPrice ? finiteAmount(row.price_inst) : null,
    corporate_price: canPrice ? finiteAmount(row.price_corp) : null,
    price_basis: priceBasis,
    confirmed: false,
    tiers,
    quantity_tiers: row.quantityTiers,
  };
}

export async function loadQuoteProducts(): Promise<QuoteProduct[]> {
  if (!supabaseConfigured || !supabase) throw new Error('The live quote catalog is not configured.');

  const pageSize = 500;
  const rows: PublicQuoteCatalogRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('public_quote_catalog_products')
      .select('id,sku,name,slug,description,type,category_id,category,calc_type,price,price_inst,price_corp,price_scales,features,currency,is_published,featured,sort_order')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const pageRows = (data || []) as PublicQuoteCatalogRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return consolidateStorefrontQuantityTiers(rows).flatMap((row) => {
    const product = mapLiveQuoteProduct(row);
    return product ? [product] : [];
  });
}

export function calculateScenario(product: QuoteProduct, scenario: 'normal' | 'installation' | 'corporate', basis: number) {
  if (!Number.isFinite(basis) || basis <= 0 || product.price_basis === 'unknown') return null;
  const scenarioRate = scenario === 'installation' ? product.install_price
    : scenario === 'corporate' ? product.corporate_price : null;
  if (scenario !== 'normal' && scenarioRate == null) return null;
  const tier = [...(product.tiers || [])]
    .filter((item) => Number.isFinite(item.min_qty) && item.min_qty <= basis)
    .sort((a, b) => a.min_qty - b.min_qty)
    .at(-1);
  const rate = scenario === 'normal' ? (tier?.unit_price ?? product.price) : scenarioRate;
  if (rate == null || !Number.isFinite(rate)) return null;
  const total = product.price_basis === 'total' ? rate : rate * basis;
  return Number.isFinite(total) ? total : null;
}
