import React from 'react';
import NumberFlow, { type Format } from '@number-flow/react';
import { useReducedMotion } from 'motion/react';

export type RollLiveMetricProps = {
  value: number | null | undefined;
  decimals?: number;
  minDecimals?: number;
  suffix?: string;
  prefix?: string;
  format?: 'decimal' | 'percent' | 'integer';
  className?: string;
  fallback?: string;
  willChange?: boolean;
};

/**
 * Animated tabular metric powered by @number-flow/react with automatic
 * reduced-motion and non-finite fallback handling.
 */
export function RollLiveMetric({
  value,
  decimals = 2,
  minDecimals = 0,
  suffix = '',
  prefix = '',
  format = 'decimal',
  className = '',
  fallback = '—',
  willChange = false,
}: RollLiveMetricProps) {
  const reducedMotion = useReducedMotion();

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={`roll-live-metric is-fallback ${className}`}>{fallback}</span>;
  }

  const maxDigits = format === 'integer' ? 0 : Math.max(0, decimals);
  const minDigits = format === 'integer' ? 0 : Math.min(maxDigits, Math.max(0, minDecimals));

  const numberFormat: Format = {
    style: 'decimal',
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  };

  return (
    <NumberFlow
      value={value}
      locales="es-EC"
      format={numberFormat}
      prefix={prefix}
      suffix={suffix}
      animated={!reducedMotion}
      willChange={willChange && !reducedMotion}
      className={`roll-live-metric ${className}`}
    />
  );
}
