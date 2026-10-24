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
  const rawTotal = calculateQuotePrice(product, tier, basis, optionChoice);
  if (rawTotal === null || !Number.isFinite(rawTotal) || rawTotal <= 0) return null;

  const billedQuantity = mode === 'area' ? roundQuantity(areaPerPiece * quantity) : quantity;
  if (billedQuantity <= 0) return null;
  const unitPrice = Number((rawTotal / billedQuantity).toFixed(8));
  const total = roundMoney(billedQuantity * unitPrice);
  if (total <= 0) return null;

  return {
    quantity,
    areaPerPiece,
    areaTotal: mode === 'area' ? billedQuantity : 0,
    basis,
    billedQuantity,
    unit: mode === 'area' ? 'm²' : product.unit || 'unidad',
    unitPrice,
    total,
  };
}

export function formatPOSLineDescription(line: {
  name: string;
  mode: 'quantity' | 'area';
  quantity: number;
  unit: string;
  unitPrice: number;
  pricingTierLabel: string;
  widthCm?: number;
  heightCm?: number;
  areaPerPiece?: number;
  areaTotal?: number;
  optionChoice?: string;
}) {
  const details = line.mode === 'area'
    ? `${line.widthCm} × ${line.heightCm} cm · ${line.quantity} ${line.quantity === 1 ? 'pieza' : 'piezas'} · ${line.areaPerPiece} m² c/u · ${line.areaTotal} m² facturados`
    : `${line.quantity} ${line.quantity === 1 ? line.unit : `${line.unit}s`}`;
  const option = line.optionChoice ? ` · ${line.optionChoice}` : '';
  return `${line.name} · ${details} · ${line.pricingTierLabel}${option} · ${line.unit} ${line.unitPrice.toFixed(6)}`;
}
