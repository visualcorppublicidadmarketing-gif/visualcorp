const numeric = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export function getQuoteBasis(product, { quantity = 1, area = 0 } = {}) {
  return product?.mode === 'area' ? Math.max(0, Number(area) || 0) * Math.max(1, Number(quantity) || 1) : Math.max(1, Number(quantity) || 1);
}

function getApplicableTier(product, basis) {
  return [...(product?.tiers || [])]
    .map((tier) => ({ ...tier, min_qty: Number(tier.min_qty) }))
    .filter((tier) => Number.isFinite(tier.min_qty) && tier.min_qty > 0 && tier.min_qty <= basis)
    .sort((a, b) => a.min_qty - b.min_qty)
    .at(-1) || null;
}

function getBaseRate(product, basis) {
  const tier = getApplicableTier(product, basis);
  return numeric(tier?.unit_price) ?? numeric(product?.price);
}

export function calculateQuotePrice(product, tier, basis, optionChoice = '') {
  if (!product || !Number.isFinite(Number(basis)) || Number(basis) <= 0) return null;
  const applicable = getApplicableTier(product, Number(basis));
  const rate = tier === 'instalacion'
    ? numeric(applicable?.install_unit_price) ?? numeric(product.installPrice)
    : tier === 'corporativo'
      ? numeric(applicable?.corporate_unit_price) ?? numeric(product.corporatePrice)
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
