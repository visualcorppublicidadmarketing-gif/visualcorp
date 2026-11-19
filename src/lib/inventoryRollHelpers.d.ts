export type RollFamily = 'lona' | 'vinil' | 'papel' | 'otro';
export type RollHealthTier = 'exhausted' | 'critical' | 'warning' | 'medium' | 'healthy';

export const MAX_PLOTTER_WIDTH_CM: number;
export const LOW_ROLL_PERCENT: number;
export const MEDIUM_ROLL_PERCENT: number;
export const HEALTHY_ROLL_PERCENT: number;

export function roundMetric(value: number, digits?: number): number;

export function computeRollMetrics(input: {
  remaining_m?: number | string | null;
  remaining_percent?: number | string | null;
  standard_length_m?: number | string | null;
  nominal_width_cm?: number | string | null;
}): {
  remainingM: number;
  nominalM: number | null;
  percent: number | null;
  widthCm: number | null;
  areaM2: number | null;
  nominalAreaM2: number | null;
  widthRatioToMaxPlotter: number | null;
};

export function resolveRollHealthTier(input: {
  status?: string | null;
  remainingM: number;
  percent: number | null;
}): RollHealthTier;

export function resolveRollHealthLabel(tier: RollHealthTier, rollState?: 'bodega' | 'machine' | string): string;

export function inferRollFamily(family?: string | null, materialName?: string): RollFamily;

export function resolveRollFamilyMeta(
  family?: string | null,
  materialName?: string
): {
  id: RollFamily;
  label: string;
  shortTag: string;
  textureLabel: string;
  className: string;
};

export function computeMetersForPercent(standardLengthM: number | null | undefined, percent: number): number | null;

export function computeMeterStepTarget(
  currentRemainingM: number,
  deltaM: number,
  standardLengthM?: number | null
): number;

export function isRollRpcMissingError(error: unknown): boolean;

export function buildRollConfigAuditReason(
  previous: {
    roll_tag?: string | null;
    material_family?: string | null;
    standard_length_m?: number | null;
    location_code?: string | null;
    notes?: string | null;
  },
  next: {
    roll_tag?: string | null;
    material_family?: string | null;
    standard_length_m?: number | null;
    location_code?: string | null;
    notes?: string | null;
  }
): string;
