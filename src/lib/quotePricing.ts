const numeric = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export function getQuoteBasis(product, { quantity = 1, area = 0 } = {}) {
  return product?.mode === 'area' ? Math.max(0, Number(area) || 0) * Math.max(1, Number(quantity) || 1) : Math.max(1, Number(quantity) || 1);
}

function getBaseRate(product, basis) {
  const tiers = [...(product?.tiers || [])]
    .map((tier) => ({ ...tier, min_qty: Number(tier.min_qty), unit_price: numeric(tier.unit_price) }))
    .filter((tier) => tier.min_qty > 0 && tier.unit_price !== null)
    .sort((a, b) => a.min_qty - b.min_qty);
  if (!tiers.length) return numeric(product?.price);
  if (basis < tiers[0].min_qty) return numeric(product?.price);
  return tiers.filter((tier) => basis >= tier.min_qty).at(-1)?.unit_price ?? numeric(product?.price);
}

export function calculateQuotePrice(product, tier, basis, optionChoice = '') {
  if (!product || !Number.isFinite(Number(basis)) || Number(basis) <= 0) return null;
  const rate = tier === 'instalacion'
    ? numeric(product.installPrice)
    : tier === 'corporativo'
      ? numeric(product.corporatePrice)
      : optionChoice
        ? numeric(product.optionPrices?.find((option) => option.label === optionChoice)?.price)
        : getBaseRate(product, Number(basis));
  if (rate === null) return null;
  const total = product.priceBasis === 'total' ? rate : rate * Number(basis);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export const quoteTiers = [
  { id: 'pvp', label: 'Normal', description: 'Tarifa estándar de mostrador' },
  { id: 'instalacion', label: 'Con instalación', description: 'Producción más instalación' },
  { id: 'corporativo', label: 'Corporativo', description: 'Tarifa especial para empresas' },
];
