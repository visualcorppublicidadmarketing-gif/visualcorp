/**
 * Visual Corp Suite — Utilidad de Tarifas Escalonadas por Volumen
 * Inspirado en Medusa `pricing-models/price-list.ts` adaptado a la industria
 * gráfica, rotulación, corte láser e impresión de gran formato en Milagro, Ecuador.
 */

export interface VolumeTierRule {
  minUnitsOrArea: number;
  maxUnitsOrArea?: number;
  discountPercent: number; // Ej. 10 para 10%
  tierLabel: string; // Ej. 'Escala 6-15 m² (-10%)'
}

/**
 * Escalas estándar por defecto de Visual Corp:
 * - 1 a 5 m² (o unidades): 0% descuento ('Tarifa Estándar')
 * - 6 a 15 m²: 10% descuento ('Escala 6-15 m² (-10%)')
 * - 16 a 30 m²: 18% descuento ('Escala Mayorista 16-30 m² (-18%)')
 * - > 30 m²: 25% descuento ('Escala Industrial >30 m² (-25%)')
 */
export const DEFAULT_VOLUME_TIERS: VolumeTierRule[] = [
  {
    minUnitsOrArea: 1,
    maxUnitsOrArea: 5,
    discountPercent: 0,
    tierLabel: 'Tarifa Estándar',
  },
  {
    minUnitsOrArea: 6,
    maxUnitsOrArea: 15,
    discountPercent: 10,
    tierLabel: 'Escala 6-15 m² (-10%)',
  },
  {
    minUnitsOrArea: 16,
    maxUnitsOrArea: 30,
    discountPercent: 18,
    tierLabel: 'Escala Mayorista 16-30 m² (-18%)',
  },
  {
    minUnitsOrArea: 31,
    discountPercent: 25,
    tierLabel: 'Escala Industrial >30 m² (-25%)',
  },
];

export interface TieredPriceCalculationResult {
  originalUnitPrice: number;
  effectiveUnitPrice: number;
  discountPercent: number;
  savingsPerUnit: number;
  totalSavings: number;
  subtotal: number;
  tierLabel: string;
  isTierApplied: boolean;
}

/**
 * Encuentra la regla de escala aplicable para una cantidad o área determinada.
 * Si la cantidad cae entre límites (ej. 5.5 m²), asigna la escala correspondiente
 * sin huecos basándose en umbrales ordenados.
 */
export function findApplicableTier(
  quantityOrArea: number,
  tiers: VolumeTierRule[] = DEFAULT_VOLUME_TIERS
): VolumeTierRule {
  const qty = Math.max(0, Number(quantityOrArea) || 0);
  const sorted = [...tiers].sort((a, b) => a.minUnitsOrArea - b.minUnitsOrArea);

  if (sorted.length === 0) {
    return {
      minUnitsOrArea: 1,
      discountPercent: 0,
      tierLabel: 'Tarifa Estándar',
    };
  }

  // Si la cantidad es menor al umbral de la segunda regla, aplica la primera regla
  if (sorted.length > 1 && qty < sorted[1].minUnitsOrArea) {
    return sorted[0];
  }

  // Búsqueda en orden descendente para capturar la escala más alta cumplida
  for (let i = sorted.length - 1; i >= 0; i--) {
    const tier = sorted[i];
    if (qty >= tier.minUnitsOrArea) {
      if (tier.maxUnitsOrArea === undefined || qty <= tier.maxUnitsOrArea) {
        return tier;
      }
      // Si la cantidad supera el maxUnitsOrArea pero es el nivel más alto registrado
      if (i === sorted.length - 1) {
        return tier;
      }
    }
  }

  return sorted[0];
}

/**
 * Redondeo financiero estándar a 2 decimales en USD
 */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Formatea un valor numérico a moneda USD con formato local ecuatoriano
 */
export function formatUSD(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString('es-EC', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Calcula el precio escalonado por volumen basado en precio unitario base,
 * cantidad o área métrica, y reglas de volumen.
 */
export function calculateTieredPrice(
  basePrice: number,
  quantityOrArea: number,
  customTiers?: VolumeTierRule[]
): TieredPriceCalculationResult {
  const validBase = Math.max(0, Number(basePrice) || 0);
  const validQty = Math.max(0, Number(quantityOrArea) || 0);
  const tiers = customTiers && customTiers.length > 0 ? customTiers : DEFAULT_VOLUME_TIERS;

  const matchedTier = findApplicableTier(validQty, tiers);
  const discountPercent = Math.min(100, Math.max(0, matchedTier.discountPercent));

  const effectiveUnitPrice = discountPercent > 0
    ? roundCurrency(validBase * (1 - discountPercent / 100))
    : validBase;

  const savingsPerUnit = roundCurrency(Math.max(0, validBase - effectiveUnitPrice));
  const subtotal = roundCurrency(effectiveUnitPrice * validQty);
  const standardSubtotal = roundCurrency(validBase * validQty);
  const totalSavings = roundCurrency(Math.max(0, standardSubtotal - subtotal));
  const isTierApplied = discountPercent > 0 && validQty > 0;

  return {
    originalUnitPrice: validBase,
    effectiveUnitPrice,
    discountPercent,
    savingsPerUnit,
    totalSavings,
    subtotal,
    tierLabel: matchedTier.tierLabel,
    isTierApplied,
  };
}

export interface VolumeTierBreakdownItem {
  rule: VolumeTierRule;
  minUnitsOrArea: number;
  maxUnitsOrArea?: number;
  discountPercent: number;
  tierLabel: string;
  effectiveUnitPrice: number;
  savingsPerUnit: number;
  sampleQuantity: number;
  sampleSubtotal: number;
  isCurrentTier: boolean;
}

/**
 * Obtiene el desglose completo de todas las escalas para mostrar en tooltips,
 * modales o tarjetas de ayuda de cotización en el ERP/POS.
 */
export function getVolumeTierBreakdown(
  basePrice: number,
  currentQuantityOrArea: number = 1,
  customTiers?: VolumeTierRule[]
): VolumeTierBreakdownItem[] {
  const tiers = customTiers && customTiers.length > 0 ? customTiers : DEFAULT_VOLUME_TIERS;
  const validBase = Math.max(0, Number(basePrice) || 0);
  const currentTier = findApplicableTier(currentQuantityOrArea, tiers);

  return tiers.map((tier) => {
    const discount = Math.min(100, Math.max(0, tier.discountPercent));
    const effectiveUnitPrice = discount > 0
      ? roundCurrency(validBase * (1 - discount / 100))
      : validBase;
    const savingsPerUnit = roundCurrency(Math.max(0, validBase - effectiveUnitPrice));

    // Muestra cantidad representativa para cálculo de ejemplo
    const sampleQuantity = tier.minUnitsOrArea;
    const sampleSubtotal = roundCurrency(effectiveUnitPrice * sampleQuantity);
    const isCurrentTier = tier.tierLabel === currentTier.tierLabel &&
      tier.minUnitsOrArea === currentTier.minUnitsOrArea;

    return {
      rule: tier,
      minUnitsOrArea: tier.minUnitsOrArea,
      maxUnitsOrArea: tier.maxUnitsOrArea,
      discountPercent: discount,
      tierLabel: tier.tierLabel,
      effectiveUnitPrice,
      savingsPerUnit,
      sampleQuantity,
      sampleSubtotal,
      isCurrentTier,
    };
  });
}

export interface NextVolumeTierRecommendation {
  currentTier: VolumeTierRule;
  nextTier: VolumeTierRule | null;
  unitsNeeded: number;
  additionalDiscountPercent: number;
  potentialEffectiveUnitPrice: number;
  potentialTotalWithNextTier: number;
  potentialSavings: number;
  recommendationMessage: string | null;
}

/**
 * Sugerencia inteligente para avisar al asesor de ventas si al cliente
 * le faltan pocas unidades o metros para saltar al siguiente escalón de ahorro.
 */
export function getNextVolumeTierRecommendation(
  basePrice: number,
  currentQuantityOrArea: number,
  customTiers?: VolumeTierRule[]
): NextVolumeTierRecommendation | null {
  const tiers = [...(customTiers && customTiers.length > 0 ? customTiers : DEFAULT_VOLUME_TIERS)]
    .sort((a, b) => a.minUnitsOrArea - b.minUnitsOrArea);
  const validQty = Math.max(0, Number(currentQuantityOrArea) || 0);
  const validBase = Math.max(0, Number(basePrice) || 0);

  const currentTier = findApplicableTier(validQty, tiers);
  const currentIndex = tiers.findIndex(
    (t) => t.minUnitsOrArea === currentTier.minUnitsOrArea && t.tierLabel === currentTier.tierLabel
  );

  if (currentIndex === -1 || currentIndex >= tiers.length - 1) {
    return null; // Ya está en la escala máxima
  }

  const nextTier = tiers[currentIndex + 1];
  const unitsNeeded = roundCurrency(Math.max(0, nextTier.minUnitsOrArea - validQty));

  if (unitsNeeded <= 0) {
    return null;
  }

  const additionalDiscountPercent = Math.max(0, nextTier.discountPercent - currentTier.discountPercent);
  const potentialEffectiveUnitPrice = roundCurrency(validBase * (1 - nextTier.discountPercent / 100));
  const potentialTotalWithNextTier = roundCurrency(potentialEffectiveUnitPrice * nextTier.minUnitsOrArea);
  const standardTotalForNextTier = roundCurrency(validBase * nextTier.minUnitsOrArea);
  const potentialSavings = roundCurrency(standardTotalForNextTier - potentialTotalWithNextTier);

  const isMetric = nextTier.tierLabel.toLowerCase().includes('m²');
  const unitWord = isMetric ? 'm²' : 'unidades';

  const recommendationMessage = `Añade ${unitsNeeded} ${unitWord} más para acceder a la "${nextTier.tierLabel}" con ${nextTier.discountPercent}% de descuento y ahorrar ${formatUSD(potentialSavings)}.`;

  return {
    currentTier,
    nextTier,
    unitsNeeded,
    additionalDiscountPercent,
    potentialEffectiveUnitPrice,
    potentialTotalWithNextTier,
    potentialSavings,
    recommendationMessage,
  };
}
