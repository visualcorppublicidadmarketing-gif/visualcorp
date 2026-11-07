import { calculateQuotePrice, getQuoteBasis } from './quotePricing';

export type POSPriceTier = 'pvp' | 'instalacion' | 'corporativo';

export interface POSLineCalculationInput {
  product: Record<string, any>;
  mode: 'quantity' | 'area';
  quantity: number;
  widthCm?: number;
  heightCm?: number;
  tier: POSPriceTier;
  optionChoice?: string;
  customUnitPrice?: number | null;
  lineDiscountPercent?: number;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

export function calculatePOSLine(input: POSLineCalculationInput) {
  const { product, mode, quantity, tier, optionChoice = '' } = input;
  if (!product || !Number.isSafeInteger(quantity) || quantity < 1) return null;

  const areaPerPiece = mode === 'area'
    ? roundQuantity((Number(input.widthCm) * Number(input.heightCm)) / 10000)
    : 0;
  if (mode === 'area' && (!Number.isFinite(areaPerPiece) || areaPerPiece <= 0)) return null;

  const basis = getQuoteBasis(
    { ...product, mode: mode === 'area' ? 'area' : 'quantity' },
    { quantity, area: areaPerPiece },
  );

  const billedQuantity = mode === 'area' ? roundQuantity(areaPerPiece * quantity) : quantity;
  if (billedQuantity <= 0) return null;

  let rawTotal: number | null = null;
  let catalogUnitPrice: number | null = null;

  if (!product.isCustomArea) {
    rawTotal = calculateQuotePrice(product, tier, basis, optionChoice);
    if (rawTotal !== null && Number.isFinite(rawTotal) && rawTotal > 0) {
      catalogUnitPrice = Number((rawTotal / billedQuantity).toFixed(8));
    }
  }

  const hasCustomPrice = Number.isFinite(Number(input.customUnitPrice)) && Number(input.customUnitPrice) > 0;
  let unitPrice: number;
  let customUnitPriceApplied = false;

  if (hasCustomPrice) {
    unitPrice = Number(input.customUnitPrice);
    customUnitPriceApplied = true;
  } else if (product.isCustomArea === true) {
    return null;
  } else {
    if (rawTotal === null || !Number.isFinite(rawTotal) || rawTotal <= 0 || catalogUnitPrice === null) return null;
    unitPrice = catalogUnitPrice;
    customUnitPriceApplied = false;
  }

  const discountPercent = Math.min(100, Math.max(0, Number(input.lineDiscountPercent) || 0));
  const effectiveUnitPrice = discountPercent > 0
    ? Number((unitPrice * (1 - discountPercent / 100)).toFixed(8))
    : unitPrice;

  const total = roundMoney(billedQuantity * effectiveUnitPrice);
  if (total < 0) return null;

  return {
    quantity,
    areaPerPiece,
    areaTotal: mode === 'area' ? billedQuantity : 0,
    basis,
    billedQuantity,
    unit: mode === 'area' ? 'm²' : product.unit || 'unidad',
    unitPrice: effectiveUnitPrice,
    baseUnitPrice: unitPrice,
    catalogUnitPrice: catalogUnitPrice ?? unitPrice,
    customUnitPriceApplied,
    lineDiscountPercent: discountPercent,
    total,
  };
}

export function formatPOSLineDescription(line: {
  name: string;
  mode: 'quantity' | 'area';
  quantity: number;
  unit: string;
  unitPrice: number;
  pricingTierLabel?: string;
  widthCm?: number;
  heightCm?: number;
  areaPerPiece?: number;
  areaTotal?: number;
  optionChoice?: string;
  lineDiscountPercent?: number;
  customUnitPriceApplied?: boolean;
}) {
  const details = line.mode === 'area'
    ? `${line.widthCm} × ${line.heightCm} cm · ${line.quantity} ${line.quantity === 1 ? 'pieza' : 'piezas'} · ${line.areaPerPiece} m² c/u · ${line.areaTotal} m² facturados`
    : `${line.quantity} ${line.quantity === 1 ? line.unit : `${line.unit}s`}`;
  const tier = line.pricingTierLabel ? ` · ${line.pricingTierLabel}` : '';
  const option = line.optionChoice ? ` · ${line.optionChoice}` : '';
  const customTag = line.customUnitPriceApplied ? ' · Precio acordado' : '';
  const discountTag = line.lineDiscountPercent && line.lineDiscountPercent > 0 ? ` · Desc. ${line.lineDiscountPercent}%` : '';
  return `${line.name} · ${details}${tier}${option}${customTag}${discountTag} · ${line.unit} ${line.unitPrice.toFixed(4)}`;
}
