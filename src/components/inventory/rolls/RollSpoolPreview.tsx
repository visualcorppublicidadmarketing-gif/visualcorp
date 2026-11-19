import React, { useId } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  MAX_PLOTTER_WIDTH_CM,
  resolveRollFamilyMeta,
  resolveRollHealthTier,
  type RollHealthTier,
} from '../../../lib/inventoryRollHelpers.mjs';

export type RollSpoolPreviewProps = {
  materialName: string;
  materialFamily?: string | null;
  remainingM: number;
  standardLengthM?: number | null;
  percent: number | null;
  widthCm?: number | null;
  isActiveOnMachine?: boolean;
  status?: string | null;
  size?: 'compact' | 'featured' | 'reception';
  showWidthBar?: boolean;
  className?: string;
};

const TIER_COLORS: Record<RollHealthTier, { start: string; end: string; glow: string; ring: string }> = {
  healthy: {
    start: '#34d399',
    end: '#0d9488',
    glow: 'rgba(16, 185, 129, 0.36)',
    ring: 'rgba(13, 148, 136, 0.28)',
  },
  medium: {
    start: '#38bdf8',
    end: '#0284c7',
    glow: 'rgba(6, 156, 219, 0.34)',
    ring: 'rgba(6, 156, 219, 0.28)',
  },
  warning: {
    start: '#fbbf24',
    end: '#d97706',
    glow: 'rgba(245, 158, 11, 0.36)',
    ring: 'rgba(217, 119, 6, 0.32)',
  },
  critical: {
    start: '#fb7185',
    end: '#dc2626',
    glow: 'rgba(220, 38, 38, 0.45)',
    ring: 'rgba(220, 38, 38, 0.36)',
  },
  exhausted: {
    start: '#cbd5e1',
    end: '#94a3b8',
    glow: 'rgba(148, 163, 184, 0.14)',
    ring: 'rgba(148, 163, 184, 0.22)',
  },
};

const FAMILY_ACCENTS: Record<string, string> = {
  lona: '#f59e0b',
  vinil: '#069cdb',
  papel: '#a51091',
  otro: '#7e1977',
};

/**
 * Parametric live spool preview (cross-section + volumetric wrap rings + width bar).
 * Shows real fill radius above a 7.6 cm (3") cardboard core and respects reduced motion.
 */
export function RollSpoolPreview({
  materialName,
  materialFamily,
  remainingM,
  standardLengthM,
  percent,
  widthCm,
  isActiveOnMachine = false,
  status,
  size = 'compact',
  showWidthBar = true,
  className = '',
}: RollSpoolPreviewProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reducedMotion = useReducedMotion();

  const tier = resolveRollHealthTier({ status, remainingM, percent });
  const familyMeta = resolveRollFamilyMeta(materialFamily, materialName);
  const palette = TIER_COLORS[tier];
  const familyTint = FAMILY_ACCENTS[familyMeta.id] || FAMILY_ACCENTS.otro;

  // Inner cardboard core radius = 17, outer material max radius = 43.
  const coreRadius = 17;
  const maxOuterRadius = 43;
  const effectiveRatio =
    tier === 'exhausted'
      ? 0
      : percent !== null
        ? Math.max(0.08, Math.min(1, percent / 100))
        : remainingM > 0
          ? 0.56
          : 0;

  // Area-proportional radius feels faithful to real wound material thickness.
  const outerRadius =
    effectiveRatio <= 0
      ? coreRadius
      : Number(
          Math.sqrt(coreRadius ** 2 + effectiveRatio * (maxOuterRadius ** 2 - coreRadius ** 2)).toFixed(2)
        );

  const ringCount = effectiveRatio <= 0 ? 0 : Math.max(1, Math.round(effectiveRatio * 4));
  const ringRadii = Array.from({ length: ringCount }, (_, index) => {
    const step = (outerRadius - coreRadius) / (ringCount + 1);
    return Number((coreRadius + step * (index + 1)).toFixed(2));
  });

  const widthRatio =
    widthCm && widthCm > 0 ? Math.max(0.14, Math.min(1, widthCm / MAX_PLOTTER_WIDTH_CM)) : null;

  const isSpinning = Boolean(isActiveOnMachine && remainingM > 0 && !reducedMotion && tier !== 'exhausted');
  const formattedMeters = Number(remainingM || 0).toFixed(remainingM >= 10 ? 1 : 2);
  const ariaValueText =
    percent !== null
      ? `${formattedMeters} metros restantes (${Math.round(percent)}%) de ${materialName}`
      : `${formattedMeters} metros restantes de ${materialName}`;

  const gradId = `spool-grad-${uid}`;
  const coreId = `spool-core-${uid}`;
  const sheenId = `spool-sheen-${uid}`;
  const patternId = `spool-tex-${uid}`;

  return (
    <div
      className={`roll-spool roll-spool--${size} ${familyMeta.className} is-tier-${tier} ${isSpinning ? 'is-spinning' : ''} ${className}`}
      style={
        {
          '--spool-glow': palette.glow,
          '--spool-ring': palette.ring,
          '--spool-family-accent': familyTint,
        } as React.CSSProperties
      }
    >
      <div
        className="roll-spool__dial"
        role={percent !== null ? 'progressbar' : 'img'}
        aria-label={ariaValueText}
        {...(percent !== null
          ? {
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': Math.round(percent),
              'aria-valuetext': ariaValueText,
            }
          : {})}
      >
        <svg
          className="roll-spool__svg"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <radialGradient id={gradId} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor={palette.start} />
              <stop offset="100%" stopColor={palette.end} />
            </radialGradient>

            <radialGradient id={coreId} cx="42%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#e5c89f" />
              <stop offset="72%" stopColor="#b99062" />
              <stop offset="100%" stopColor="#8d6840" />
            </radialGradient>

            <linearGradient id={sheenId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.44)" />
              <stop offset="48%" stopColor="rgba(255,255,255,0.06)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.16)" />
            </linearGradient>

            {familyMeta.id === 'lona' && (
              <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse">
                <path
                  d="M0 3H6M3 0V6"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="0.65"
                />
              </pattern>
            )}
          </defs>

          {/* Outer reference guide showing 100% factory roll footprint */}
          <circle
            cx="50"
            cy="50"
            r={maxOuterRadius}
            className="roll-spool__footprint"
          />

          {/* Wound material body */}
          {effectiveRatio > 0 && (
            <g className="roll-spool__material-group">
              <circle
                cx="50"
                cy="50"
                r={outerRadius}
                fill={`url(#${gradId})`}
                className="roll-spool__material-fill"
              />
              {familyMeta.id === 'lona' && (
                <circle
                  cx="50"
                  cy="50"
                  r={outerRadius}
                  fill={`url(#${patternId})`}
                />
              )}
              <circle
                cx="50"
                cy="50"
                r={outerRadius}
                fill={`url(#${sheenId})`}
              />

              {/* Concentric wrap lines */}
              {ringRadii.map((r) => (
                <circle
                  key={r}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="0.7"
                />
              ))}

              {/* Subtle material family edge band */}
              <circle
                cx="50"
                cy="50"
                r={outerRadius}
                fill="none"
                stroke={familyTint}
                strokeOpacity="0.48"
                strokeWidth="1.4"
              />
            </g>
          )}

          {/* 3-inch (7.6 cm) cardboard core + spinning hub markers */}
          <g className="roll-spool__hub">
            <circle cx="50" cy="50" r={coreRadius} fill={`url(#${coreId})`} />
            <circle
              cx="50"
              cy="50"
              r={coreRadius - 2.4}
              fill="none"
              stroke="rgba(78, 52, 27, 0.35)"
              strokeWidth="1"
            />
            <circle cx="50" cy="50" r="8.2" className="roll-spool__bore" />

            {/* Hub rotation notches for live motion cue */}
            <line x1="50" y1="35.5" x2="50" y2="40" className="roll-spool__notch" />
            <line x1="50" y1="60" x2="50" y2="64.5" className="roll-spool__notch" />
            <line x1="35.5" y1="50" x2="40" y2="50" className="roll-spool__notch" />
            <line x1="60" y1="50" x2="64.5" y2="50" className="roll-spool__notch" />
          </g>
        </svg>

        <span className="roll-spool__family-pill" title={familyMeta.textureLabel}>
          {familyMeta.shortTag}
        </span>
      </div>

      {showWidthBar && (
        <div className="roll-spool__width-gauge" aria-hidden="true">
          <div className="roll-spool__width-track">
            <span
              className="roll-spool__width-fill"
              style={{ width: `${Math.round((widthRatio ?? 0.4) * 100)}%` }}
            />
          </div>
          <span className="roll-spool__width-label">
            {widthCm ? `${Math.round(widthCm)} cm` : 'Ancho std'}
            {standardLengthM ? ` · ${Math.round(standardLengthM)}m` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
