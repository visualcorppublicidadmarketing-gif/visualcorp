export type EyeletStyle = 'none' | 'small' | 'large';
export type DesignService = 'ready' | 'adaptation' | 'from_scratch' | 'custom';

export type CommercialFinishingValue = {
  eyeletType: EyeletStyle;
  eyeletCount: number | string;
  eyeletUnitPriceSnapshot?: number;
  designService: DesignService;
  designLabel: string;
  designAmount: number | string;
  designAmountSnapshot?: number;
};

export type CommercialFinishingPrices = {
  eyeletSmallPrice?: number;
  eyeletLargePrice?: number;
  designAdaptationPrice?: number;
  designFromScratchPrice?: number;
};

export type CommercialFinishingSnapshot = CommercialFinishingValue & {
  eyelet_total_count: number;
  eyelet_unit_price: number;
  eyelet_total: number;
  design_label: string;
  design_total: number;
  total: number;
};

export const emptyCommercialFinishing: CommercialFinishingValue = {
  eyeletType: 'none',
  eyeletCount: 4,
  designService: 'ready',
  designLabel: '',
  designAmount: '',
};

const validEyeletStyles = new Set<EyeletStyle>(['none', 'small', 'large']);
const validDesignServices = new Set<DesignService>(['ready', 'adaptation', 'from_scratch', 'custom']);
const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

export function sanitizeCommercialFinishing(value: unknown): CommercialFinishingValue {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawEyeletType = source.eyeletType ?? source.eyelet_type;
  const rawDesignService = source.designService ?? source.design_service;
  const eyeletType = validEyeletStyles.has(rawEyeletType as EyeletStyle) ? rawEyeletType as EyeletStyle : 'none';
  const designService = validDesignServices.has(rawDesignService as DesignService) ? rawDesignService as DesignService : 'ready';
  const eyeletCountValue = Number(source.eyeletCount ?? source.eyelet_count ?? source.eyeletsPerPiece ?? source.eyelets_per_piece ?? 4);
  const designAmountValue = source.designAmount ?? source.design_amount ?? source.design_total ?? '';
  const eyeletPriceSnapshotValue = source.eyeletUnitPriceSnapshot ?? source.eyeletUnitPrice ?? source.eyelet_unit_price;
  const designAmountSnapshotValue = source.designAmountSnapshot ?? source.design_unit_amount ?? source.design_total;
  return {
    eyeletType,
    eyeletCount: Number.isFinite(eyeletCountValue) ? Math.max(0, Math.min(1000, Math.round(eyeletCountValue))) : 4,
    ...(Number.isFinite(Number(eyeletPriceSnapshotValue)) ? { eyeletUnitPriceSnapshot: Math.max(0, Number(eyeletPriceSnapshotValue)) } : {}),
    designService,
    designLabel: String(source.designLabel ?? source.design_label ?? '').slice(0, 120),
    designAmount: designAmountValue === '' || designAmountValue === null ? '' : Math.max(0, Number(designAmountValue) || 0),
    ...(Number.isFinite(Number(designAmountSnapshotValue)) ? { designAmountSnapshot: Math.max(0, Number(designAmountSnapshotValue)) } : {}),
  };
}

export function calculateCommercialFinishing(
  value: unknown,
  quantity: number,
  prices: CommercialFinishingPrices = {},
) {
  const finishing = sanitizeCommercialFinishing(value);
  const pieceCount = Number.isFinite(Number(quantity)) ? Math.max(0, Number(quantity)) : 0;
  const configuredEyeletPrice = finishing.eyeletType === 'small' ? prices.eyeletSmallPrice : prices.eyeletLargePrice;
  const eyeletUnitPrice = finishing.eyeletType === 'none'
    ? 0
    : finishing.eyeletUnitPriceSnapshot ?? Math.max(0, Number.isFinite(Number(configuredEyeletPrice)) ? Number(configuredEyeletPrice) : finishing.eyeletType === 'small' ? 0.3 : 0.5);
  const eyeletsPerPiece = finishing.eyeletType === 'none' ? 0 : Number(finishing.eyeletCount) || 0;
  const eyeletTotalCount = eyeletsPerPiece * pieceCount;
  const eyeletTotal = roundMoney(eyeletTotalCount * eyeletUnitPrice);
  const enteredDesignAmount = Number(finishing.designAmount);
  const designTotal = finishing.designService === 'adaptation'
    ? finishing.designAmountSnapshot ?? Math.max(0, Number.isFinite(Number(prices.designAdaptationPrice)) ? Number(prices.designAdaptationPrice) : 5)
    : finishing.designService === 'from_scratch'
      ? finishing.designAmountSnapshot ?? Math.max(0, Number.isFinite(Number(prices.designFromScratchPrice)) ? Number(prices.designFromScratchPrice) : 15)
      : finishing.designService === 'custom'
        ? Number.isFinite(enteredDesignAmount) ? Math.max(0, enteredDesignAmount) : 0
        : 0;
  const designLabel = finishing.designService === 'ready'
    ? 'Archivo listo'
    : finishing.designService === 'adaptation'
      ? 'Adaptación de arte'
      : finishing.designService === 'from_scratch'
        ? 'Diseño desde cero'
        : finishing.designLabel.trim() || 'Diseño personalizado';
  const summary: string[] = [];
  if (eyeletTotalCount > 0) {
    const eyeletLabel = finishing.eyeletType === 'small' ? 'Ojal pequeño' : 'Ojal grande';
    summary.push(`${eyeletLabel}: ${eyeletsPerPiece} por pieza × ${pieceCount} = ${eyeletTotalCount} · ${formatAmount(eyeletUnitPrice)} c/u · ${formatAmount(eyeletTotal)}`);
  }
  summary.push(`${designLabel}${finishing.designService === 'custom' ? ' · concepto libre' : ''} · ${designTotal > 0 ? formatAmount(designTotal) : 'sin costo'} por línea`);
  return {
    ...finishing,
    eyeletUnitPrice,
    eyeletsPerPiece,
    eyeletTotalCount,
    eyeletTotal,
    designLabel,
    designTotal: roundMoney(designTotal),
    total: roundMoney(eyeletTotal + designTotal),
    summary,
    valid: finishing.designService !== 'custom'
      || (Boolean(finishing.designLabel.trim()) && finishing.designAmount !== '' && Number.isFinite(enteredDesignAmount) && enteredDesignAmount >= 0),
  };
}

export function snapshotCommercialFinishing(
  value: unknown,
  quantity: number,
  prices: CommercialFinishingPrices = {},
): CommercialFinishingSnapshot {
  const finishing = calculateCommercialFinishing(value, quantity, prices);
  return {
    ...sanitizeCommercialFinishing(value),
    eyeletUnitPriceSnapshot: finishing.eyeletType === 'none' ? undefined : finishing.eyeletUnitPrice,
    designAmountSnapshot: finishing.designService === 'adaptation' || finishing.designService === 'from_scratch'
      ? finishing.designTotal
      : undefined,
    eyelet_total_count: finishing.eyeletTotalCount,
    eyelet_unit_price: finishing.eyeletUnitPrice,
    eyelet_total: finishing.eyeletTotal,
    design_label: finishing.designLabel,
    design_total: finishing.designTotal,
    total: finishing.total,
  };
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(amount);
}
