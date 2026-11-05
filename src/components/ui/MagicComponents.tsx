import React, { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  type TargetAndTransition,
} from 'motion/react';
import { ArrowRight } from 'lucide-react';
import './magic-components.css';

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

  const content = (copy: boolean) => (
    <span className="vc-marquee-group" aria-hidden={copy || undefined}>
      {items.map((item, index) => (
        <React.Fragment key={`${copy ? 'copy-' : ''}${index}`}>
          <span className="vc-marquee-item">{item}</span>
          <span className="vc-marquee-separator" aria-hidden="true">
            ✳
          </span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div
      className={`vc-marquee ${reduceMotion ? 'is-static' : ''} ${className}`}
      role="group"
      aria-label={label}
      style={{ '--marquee-duration': `${Math.max(12, duration)}s` } as React.CSSProperties}
    >
      <span className="vc-sr-only">
        {label}: {items.join(', ')}
      </span>
      <div className="vc-marquee-track" aria-hidden="true">
        {content(false)}
        {!reduceMotion && content(true)}
      </div>
    </div>
  );
}

type AnimatedListProps = {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
  stagger?: number;
};

export function AnimatedList({
  children,
  className = '',
  itemClassName = '',
  stagger = 0.065,
}: AnimatedListProps) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const reduceMotion = useReducedMotion();
  const listVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: reduceMotion ? 0 : stagger,
        delayChildren: reduceMotion ? 0 : 0.04,
      },
    },
  };
  const itemVariants = reduceMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.36, ease: 'easeOut' as const } },
      };

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      variants={listVariants}
    >
      {items.map((child, index) => (
        <motion.div
          className={`vc-stagger-item ${itemClassName}`}
          key={isValidElement(child) && child.key ? child.key : index}
          variants={itemVariants}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
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

  return (
    <span className={`vc-number-ticker ${className}`}>
      <span className="vc-sr-only">{formatted}</span>
      <span ref={ref} aria-hidden="true">
        0
      </span>
    </span>
  );
}

export type BorderBeamProps = {
  label?: string;
  size?: number;
  duration?: number;
  anchor?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
};

export function BorderBeam({
  label = 'Alerta de reposición',
  size = 200,
  duration = 6.5,
  anchor = 90,
  borderWidth = 1.5,
  colorFrom = '#a51091',
  colorTo = '#62d9ef',
  className = '',
}: BorderBeamProps) {
  const reduceMotion = useReducedMotion();
  return (
    <span
      className={`vc-border-beam${reduceMotion ? ' is-static' : ''} ${className}`}
      aria-hidden="true"
      data-label={label}
      style={
        {
          '--border-beam-size': `${size}px`,
          '--border-beam-duration': `${duration}s`,
          '--border-beam-anchor': `${anchor}%`,
          '--border-beam-width': `${borderWidth}px`,
          '--border-beam-from': colorFrom,
          '--border-beam-to': colorTo,
        } as React.CSSProperties
      }
    />
  );
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const reduceMotion = useReducedMotion();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });
  return (
    <motion.div
      className="vc-scroll-progress"
      style={{ scaleX: reduceMotion ? scrollYProgress : smoothProgress }}
      aria-hidden="true"
    />
  );
}

/* =========================================================================
   NUEVOS COMPONENTES MAGIC UI & OTROS PATRONES DE INTERFAZ
   ========================================================================= */

/**
 * BlurFade (Magic UI)
 * Entrada con desvanecimiento y desenfoque gradual, con soporte para viewport y accesibilidad.
 */
export type BlurFadeProps = {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  yOffset?: number;
  inView?: boolean;
  inViewMargin?: string;
  blur?: string;
};

export function BlurFade({
  children,
  className = '',
  duration = 0.38,
  delay = 0,
  yOffset = 8,
  inView = false,
  inViewMargin = '-40px',
  blur = '6px',
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: inViewMargin as any });
  const reduceMotion = useReducedMotion();

  const shouldAnimate = !inView || isInView;

  const defaultVariants = {
    hidden: { y: yOffset, opacity: 0, filter: `blur(${blur})` },
    visible: { y: 0, opacity: 1, filter: 'blur(0px)' },
  };

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={shouldAnimate ? 'visible' : 'hidden'}
      exit="hidden"
      variants={defaultVariants}
      transition={{
        delay: 0.04 + delay,
        duration,
        ease: 'easeOut',
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * AnimatedShinyText (Magic UI)
 * Texto con brillo holográfico/degradado en movimiento para insignias, anuncios y títulos.
 */
export type AnimatedShinyTextProps = {
  children: React.ReactNode;
  className?: string;
  shimmerWidth?: number;
};

export function AnimatedShinyText({
  children,
  className = '',
  shimmerWidth = 100,
}: AnimatedShinyTextProps) {
  const reduceMotion = useReducedMotion();
  return (
    <span
      className={`vc-shiny-text ${reduceMotion ? 'is-static' : ''} ${className}`}
      style={{ '--shimmer-width': `${shimmerWidth}px` } as React.CSSProperties}
    >
      {children}
    </span>
  );
}

/**
 * PulsingBeacon / Ripple (Magic UI)
 * Indicador de actividad o estado en vivo con ondas concéntricas animadas.
 */
export type PulsingBeaconProps = {
  color?: string;
  size?: number;
  numRipples?: number;
  duration?: number;
  className?: string;
  label?: string;
};

export function PulsingBeacon({
  color = '#793fa0',
  size = 10,
  numRipples = 3,
  duration = 2.4,
  className = '',
  label,
}: PulsingBeaconProps) {
  const reduceMotion = useReducedMotion();
  return (
    <span
      className={`vc-pulsing-beacon ${reduceMotion ? 'is-static' : ''} ${className}`}
      role={label ? 'status' : undefined}
      aria-label={label}
      style={
        {
          '--beacon-size': `${size}px`,
          '--beacon-color': color,
          '--beacon-duration': `${duration}s`,
        } as React.CSSProperties
      }
    >
      <span className="vc-beacon-core" />
      {!reduceMotion &&
        Array.from({ length: numRipples }).map((_, index) => (
          <span
            key={index}
            className="vc-beacon-ripple"
            style={{ animationDelay: `${(index * duration) / numRipples}s` }}
          />
        ))}
      {label && <span className="vc-sr-only">{label}</span>}
    </span>
  );
}

/**
 * WordRotate (Magic UI)
 * Rota dinámicamente un conjunto de palabras con animación vertical suave.
 */
export type WordRotateProps = {
  words: string[];
  duration?: number;
  framerProps?: TargetAndTransition;
  className?: string;
};

export function WordRotate({
  words,
  duration = 2600,
  className = '',
}: WordRotateProps) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion || words.length <= 1) return undefined;
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, duration);
    return () => clearInterval(interval);
  }, [words, duration, reduceMotion]);

  if (reduceMotion || words.length === 0) {
    return <span className={`vc-word-rotate ${className}`}>{words[0]}</span>;
  }

  return (
    <span className={`vc-word-rotate-container ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
          className="vc-word-rotate-word"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * BentoGrid & BentoCard (Magic UI)
 * Tarjetas de información y navegación estilo Bento con foco de luz (Spotlight) y CTA animado.
 */
export type BentoGridProps = {
  children: React.ReactNode;
  className?: string;
};

export function BentoGrid({ children, className = '' }: BentoGridProps) {
  return <div className={`vc-bento-container ${className}`}>{children}</div>;
}

export type BentoCardProps = {
  name: string;
  className?: string;
  background?: React.ReactNode;
  Icon?: React.ComponentType<{ size?: number; className?: string }>;
  description: string;
  href?: string;
  cta?: string;
  spotlight?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
};

export function BentoCard({
  name,
  className = '',
  background,
  Icon,
  description,
  href,
  cta = 'Explorar',
  spotlight = true,
  children,
  onClick,
}: BentoCardProps) {
  const Content = (
    <>
      {spotlight && <SpotlightLayer />}
      {background && <div className="vc-bento-background">{background}</div>}
      <div className="vc-bento-content">
        {Icon && (
          <span className="vc-bento-icon-box">
            <Icon size={20} className="vc-bento-icon" />
          </span>
        )}
        <h3 className="vc-bento-title">{name}</h3>
        <p className="vc-bento-desc">{description}</p>
        {children}
      </div>
      {(href || onClick) && (
        <div className="vc-bento-footer">
          <span className="vc-bento-cta">
            <span>{cta}</span>
            <ArrowRight size={14} className="vc-bento-arrow" />
          </span>
        </div>
      )}
    </>
  );

  const baseClass = `vc-bento-card vc-magic-card ${className}`;

  if (href) {
    return (
      <a
        href={href}
        className={baseClass}
        onPointerMove={spotlight ? updateSpotlight : undefined}
        onPointerLeave={spotlight ? clearSpotlight : undefined}
      >
        {Content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClass} is-button`}
        onPointerMove={spotlight ? updateSpotlight : undefined}
        onPointerLeave={spotlight ? clearSpotlight : undefined}
      >
        {Content}
      </button>
    );
  }

  return (
    <article
      className={baseClass}
      onPointerMove={spotlight ? updateSpotlight : undefined}
      onPointerLeave={spotlight ? clearSpotlight : undefined}
    >
      {Content}
    </article>
  );
}

/**
 * DotPattern (Magic UI / Aceternity)
 * Patrón vectorial de puntos personalizable con máscara radial sutil para fondos de héroes y tarjetas.
 */
export type DotPatternProps = {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
  glow?: boolean;
};

export function DotPattern({
  width = 18,
  height = 18,
  x = 0,
  y = 0,
  cx = 1,
  cy = 1,
  cr = 1,
  className = '',
  glow = false,
}: DotPatternProps) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={`vc-dot-pattern ${glow ? 'has-glow' : ''} ${className}`}
      width="100%"
      height="100%"
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <circle id="pattern-circle" cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * GridPattern (Magic UI / Aceternity)
 * Patrón vectorial de cuadrícula isométrica o arquitectónica con desvanecimiento radial.
 */
export type GridPatternProps = {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: string;
  className?: string;
};

export function GridPattern({
  width = 36,
  height = 36,
  x = -1,
  y = -1,
  strokeDasharray = '0',
  className = '',
}: GridPatternProps) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={`vc-grid-pattern ${className}`}
      width="100%"
      height="100%"
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            stroke="currentColor"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * InteractiveHoverButton (Magic UI)
 * Botón interactivo con punto de expansión magnético y flecha de acción fluida.
 */
export type InteractiveHoverButtonProps = {
  text: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
};

export function InteractiveHoverButton({
  text,
  className = '',
  onClick,
  disabled = false,
  type = 'button',
  icon,
}: InteractiveHoverButtonProps) {
  const reduceMotion = useReducedMotion();
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`vc-interactive-hover-btn ${reduceMotion ? 'is-static' : ''} ${className}`}
    >
      <span className="vc-btn-dot" aria-hidden="true" />
      <span className="vc-btn-text-content">
        <span>{text}</span>
        <span className="vc-btn-arrow" aria-hidden="true">
          {icon || <ArrowRight size={15} />}
        </span>
      </span>
    </button>
  );
}
