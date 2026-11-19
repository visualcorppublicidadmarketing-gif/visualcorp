export const MAX_PLOTTER_WIDTH_CM = 320;
export const LOW_ROLL_PERCENT = 20;
export const MEDIUM_ROLL_PERCENT = 35;
export const HEALTHY_ROLL_PERCENT = 65;

export const VALID_ROLL_FAMILIES = new Set(['lona', 'vinil', 'papel', 'otro']);

const FAMILY_META = {
  lona: {
    id: 'lona',
    label: 'Lona',
    shortTag: 'LONA',
    textureLabel: 'Trama tejida gran formato',
    className: 'is-family-lona',
  },
  vinil: {
    id: 'vinil',
    label: 'Vinil',
    shortTag: 'VINIL',
    textureLabel: 'Película adhesiva satinada',
    className: 'is-family-vinil',
  },
  papel: {
    id: 'papel',
    label: 'Papel',
    shortTag: 'PAPEL',
    textureLabel: 'Sublimación / papel técnico',
    className: 'is-family-papel',
  },
  otro: {
    id: 'otro',
    label: 'Otro',
    shortTag: 'OTRO',
    textureLabel: 'Sustrato especial',
    className: 'is-family-otro',
  },
};

function toPositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function toNonNegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export function roundMetric(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

/**
 * Computes consistent remaining meters, fill percentage, usable area (m²),
 * and width proportion relative to a 320 cm grand-format plotter.
 */
export function computeRollMetrics({
  remaining_m,
  remaining_percent,
  standard_length_m,
  nominal_width_cm,
}) {
  const nominalM = toPositiveNumber(standard_length_m);
  const widthCm = toPositiveNumber(nominal_width_cm);

  let remainingM = toNonNegativeNumber(remaining_m);
  const rawPercent = toNonNegativeNumber(remaining_percent);

  if (remainingM === null) {
    if (nominalM !== null && rawPercent !== null) {
      remainingM = roundMetric((nominalM * Math.min(100, rawPercent)) / 100, 3);
    } else {
      remainingM = 0;
    }
  } else {
    remainingM = roundMetric(remainingM, 3);
  }

  let percent = null;
  if (nominalM !== null) {
    percent = Math.max(0, Math.min(100, roundMetric((remainingM / nominalM) * 100, 2)));
  } else if (rawPercent !== null && remainingM > 0) {
    percent = Math.max(0, Math.min(100, roundMetric(rawPercent, 2)));
  }

  const areaM2 = widthCm !== null ? roundMetric((widthCm / 100) * remainingM, 2) : null;
  const nominalAreaM2 =
    widthCm !== null && nominalM !== null ? roundMetric((widthCm / 100) * nominalM, 2) : null;
  const widthRatioToMaxPlotter =
    widthCm !== null ? Math.max(0.12, Math.min(1, widthCm / MAX_PLOTTER_WIDTH_CM)) : null;

  return {
    remainingM,
    nominalM,
    percent,
    widthCm,
    areaM2,
    nominalAreaM2,
    widthRatioToMaxPlotter,
  };
}

/**
 * Maps remaining roll balance into 5 clear visual health tiers without relying solely on color.
 */
export function resolveRollHealthTier({ status, remainingM, percent }) {
  const safeRemaining = Number(remainingM || 0);
  if (status === 'agotado' || safeRemaining <= 0) {
    return 'exhausted';
  }
  if (percent === null || percent === undefined || !Number.isFinite(Number(percent))) {
    return 'medium';
  }
  const pct = Number(percent);
  if (pct <= 0) return 'exhausted';
  if (pct <= LOW_ROLL_PERCENT) return 'critical';
  if (pct <= MEDIUM_ROLL_PERCENT) return 'warning';
  if (pct <= HEALTHY_ROLL_PERCENT) return 'medium';
  return 'healthy';
}

export function resolveRollHealthLabel(tier, rollState = 'bodega') {
  switch (tier) {
    case 'exhausted':
      return 'Agotado';
    case 'critical':
      return 'Crítico';
    case 'warning':
      return 'Bajo mínimo';
    case 'medium':
      return rollState === 'machine' ? 'En producción' : 'En uso parcial';
    case 'healthy':
    default:
      return rollState === 'machine' ? 'Óptimo en plotter' : 'Disponible';
  }
}

export function inferRollFamily(family, materialName = '') {
  const normalized = String(family || '').trim().toLowerCase();
  if (VALID_ROLL_FAMILIES.has(normalized)) {
    return normalized;
  }
  const name = String(materialName || '').toLowerCase();
  if (/lona|banner|mesh|blackout|front|backlit/.test(name)) return 'lona';
  if (/vinil|adhesiv|microperfor|arenad|esmeril|sticker|reflect/.test(name)) return 'vinil';
  if (/papel|sublim|bond|fotog/.test(name)) return 'papel';
  return 'otro';
}

export function resolveRollFamilyMeta(family, materialName = '') {
  const key = inferRollFamily(family, materialName);
  return FAMILY_META[key] || FAMILY_META.otro;
}

export function computeMetersForPercent(standardLengthM, percent) {
  const nominal = toPositiveNumber(standardLengthM);
  if (nominal === null) return null;
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return roundMetric((nominal * clamped) / 100, 3);
}

export function computeMeterStepTarget(currentRemainingM, deltaM, standardLengthM = null) {
  const current = Math.max(0, Number(currentRemainingM) || 0);
  const delta = Number(deltaM) || 0;
  const nominal = toPositiveNumber(standardLengthM);
  let target = roundMetric(Math.max(0, current + delta), 3);
  if (nominal !== null) {
    target = Math.min(nominal, target);
  }
  return target;
}

export function isRollRpcMissingError(error) {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const message = String(error.message || error.details || error || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    message.includes('could not find the function') ||
    message.includes('update_inventory_roll_config') && message.includes('does not exist')
  );
}

export function buildRollConfigAuditReason(previous, next) {
  const changes = [];
  if (String(previous.roll_tag || '').trim() !== String(next.roll_tag || '').trim()) {
    changes.push('lote/etiqueta');
  }
  if (String(previous.material_family || '').trim() !== String(next.material_family || '').trim()) {
    changes.push('familia');
  }
  const prevLen = toPositiveNumber(previous.standard_length_m);
  const nextLen = toPositiveNumber(next.standard_length_m);
  if (prevLen !== nextLen) {
    changes.push('largo nominal');
  }
  if (String(previous.location_code || '').trim() !== String(next.location_code || '').trim()) {
    changes.push('ubicación');
  }
  if (String(previous.notes || '').trim() !== String(next.notes || '').trim()) {
    changes.push('notas');
  }
  if (!changes.length) {
    return 'Actualización de configuración del rollo';
  }
  return `Configuración actualizada (${changes.join(', ')})`;
}
