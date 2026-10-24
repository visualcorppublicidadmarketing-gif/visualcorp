import { useEffect } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

type NumberTickerProps = { value: number; className?: string };

export function NumberTicker({ value, className }: NumberTickerProps) {
  const reducedMotion = useReducedMotion();
  const source = useMotionValue(0);
  const spring = useSpring(source, { damping: 28, stiffness: 120, mass: 0.45 });
  const formatted = useTransform(spring, (current) => Math.round(current).toLocaleString('es-EC'));

  useEffect(() => {
    source.set(reducedMotion ? value : Math.max(0, value));
  }, [reducedMotion, source, value]);

  return reducedMotion
    ? <span className={className}>{value.toLocaleString('es-EC')}</span>
    : <motion.span className={className}>{formatted}</motion.span>;
}
