import React, { Children, isValidElement, useEffect, useMemo, useRef } from 'react';
import { motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'motion/react';

type PointerSurface = React.PointerEvent<HTMLElement>;

export function updateSpotlight(event: PointerSurface) {
  if (event.pointerType !== 'mouse') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--vc-spot-x', `${event.clientX - bounds.left}px`);
  event.currentTarget.style.setProperty('--vc-spot-y', `${event.clientY - bounds.top}px`);
}

export function clearSpotlight(event: PointerSurface) {
  event.currentTarget.style.removeProperty('--vc-spot-x');
  event.currentTarget.style.removeProperty('--vc-spot-y');
}

export function SpotlightLayer() {
  return <span className="vc-magic-spotlight" aria-hidden="true" />;
}

type MarqueeProps = {
  items: string[];
  className?: string;
  label: string;
  duration?: number;
};

/** Continuous, pausable strip for short non-interactive labels or logos. */
export function Marquee({ items, className = '', label, duration = 32 }: MarqueeProps) {
  const reduceMotion = useReducedMotion();
  if (!items.length) return null;

  const content = (copy: boolean) => <span className="vc-marquee-group" aria-hidden={copy || undefined}>
    {items.map((item, index) => <React.Fragment key={`${copy ? 'copy-' : ''}${index}`}>
      <span className="vc-marquee-item">{item}</span>
      <span className="vc-marquee-separator" aria-hidden="true">✳</span>
    </React.Fragment>)}
  </span>;

  return <div className={`vc-marquee ${reduceMotion ? 'is-static' : ''} ${className}`} role="group" aria-label={label} style={{ '--marquee-duration': `${Math.max(12, duration)}s` } as React.CSSProperties}>
    <span className="vc-sr-only">{label}: {items.join(', ')}</span>
    <div className="vc-marquee-track" aria-hidden="true">{content(false)}{!reduceMotion && content(true)}</div>
  </div>;
}

type AnimatedListProps = {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
  stagger?: number;
};

export function AnimatedList({ children, className = '', itemClassName = '', stagger = 0.065 }: AnimatedListProps) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const reduceMotion = useReducedMotion();
  const listVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: reduceMotion ? 0 : stagger, delayChildren: reduceMotion ? 0 : 0.04 } },
  };
  const itemVariants = reduceMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.36, ease: 'easeOut' as const } } };

  return <motion.div className={className} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.12 }} variants={listVariants}>
    {items.map((child, index) => <motion.div className={`vc-stagger-item ${itemClassName}`} key={isValidElement(child) && child.key ? child.key : index} variants={itemVariants}>{child}</motion.div>)}
  </motion.div>;
}

type NumberTickerProps = { value: number; locale?: string; className?: string };

export function NumberTicker({ value, locale = 'es-EC', className = '' }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px' });
  const reduceMotion = useReducedMotion();
  const valueMotion = useMotionValue(0);
  const spring = useSpring(valueMotion, { stiffness: 115, damping: 28, mass: 0.7 });
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const formatted = formatter.format(Number.isFinite(value) ? value : 0);

  useMotionValueEvent(spring, 'change', (latest) => {
    if (reduceMotion || !ref.current) return;
    ref.current.textContent = formatter.format(Math.round(latest));
  });

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      if (ref.current) ref.current.textContent = formatted;
      return;
    }
    valueMotion.set(Number.isFinite(value) ? value : 0);
  }, [formatted, inView, reduceMotion, value, valueMotion]);

  return <span className={`vc-number-ticker ${className}`}>
    <span className="vc-sr-only">{formatted}</span>
    <span ref={ref} aria-hidden="true">0</span>
  </span>;
}

export function BorderBeam({ label = 'Alerta de reposición' }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  return <span className={`vc-border-beam${reduceMotion ? ' is-static' : ''}`} aria-hidden="true" data-label={label} />;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });
  return <motion.div className="vc-scroll-progress" style={{ scaleX: reduceMotion ? scrollYProgress : smoothProgress }} aria-hidden="true" />;
}
