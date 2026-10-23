export type PricingMode = 'area' | 'quantity';
type RateTier = { min_qty: number; unit_price: number; label?: string };
export type QuoteProduct = {
  source_key: string;
  name: string;
  family: string;
  mode: 'area' | 'quantity' | 'fixed';
  unit: string;
  price: number | null;
  install_price: number | null;
  corporate_price: number | null;
  price_basis: 'unit' | 'total';
  confirmed: boolean;
  tiers: RateTier[];
};

export async function loadQuoteProducts(): Promise<QuoteProduct[]> {
  const source = await import('../../data/visualcorpCatalog.json');
  return (source.default.products as QuoteProduct[]).filter((product) => product.mode !== 'fixed');
}

export function calculateScenario(product: QuoteProduct, scenario: 'normal' | 'installation' | 'corporate', basis: number) {
  if (!Number.isFinite(basis) || basis <= 0) return null;
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
