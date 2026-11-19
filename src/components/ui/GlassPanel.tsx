import React, {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ElementType,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import {
  SpotlightLayer,
  clearSpotlight,
  updateSpotlight,
} from './MagicComponents';
import './glass-panel.css';

export type GlassVariant = 'card' | 'veil' | 'frosted' | 'pill' | 'accent';
export type GlassRadius = 'sm' | 'md' | 'lg' | 'xl' | 'pill';
export type GlassPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type GlassGlow = 'brand' | 'cyan' | 'magenta' | 'none';

export type GlassSurfaceOwnProps<T extends ElementType = 'div'> = {
  /** HTML tag or custom component (`div`, `section`, `article`, `button`, `form`, `a`, `Link`, etc.) */
  as?: T;
  /** Optical glass material preset */
  variant?: GlassVariant;
  /** Border radius token */
  radius?: GlassRadius;
  /** Internal padding token */
  padding?: GlassPadding;
  /** Internal ambient edge refraction tint */
  glow?: GlassGlow;
  /** Enables hover lift and subtle border brightening for interactive surfaces */
  interactive?: boolean;
  /** Renders the animated refractive sheen sweep across the crystal */
  sheen?: boolean;
  /** Tracks mouse coordinates for radial cursor spotlight refraction */
  spotlight?: boolean;
  /** Forces dark optical glassmorphism even inside light theme containers */
  forceDark?: boolean;
  className?: string;
  children?: ReactNode;
};

export type GlassSurfaceProps<T extends ElementType = 'div'> = GlassSurfaceOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof GlassSurfaceOwnProps<T>>;

/**
 * GlassSurface / GlassCard
 * Polymorphic rounded optical glassmorphism primitive (`backdrop-filter: blur(24px) saturate(150%)`)
 * without any chalky white rim. Can be rendered as a card, section, form, button, link, or badge.
 */
export function GlassSurface<T extends ElementType = 'div'>({
  as,
  variant = 'card',
  radius = 'xl',
  padding = 'lg',
  glow = 'brand',
  interactive = false,
  sheen = false,
  spotlight = false,
  forceDark = false,
  className = '',
  children,
  onPointerMove,
  onPointerLeave,
  ...rest
}: GlassSurfaceProps<T>) {
  const Component = (as || 'div') as ElementType;

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (spotlight) updateSpotlight(event);
    if (typeof onPointerMove === 'function') {
      (onPointerMove as (e: React.PointerEvent<HTMLElement>) => void)(event);
    }
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    if (spotlight) clearSpotlight(event);
    if (typeof onPointerLeave === 'function') {
      (onPointerLeave as (e: React.PointerEvent<HTMLElement>) => void)(event);
    }
  };

  const classes = [
    'vc-glass-surface',
    `is-variant-${variant}`,
    `is-radius-${radius}`,
    `is-pad-${padding}`,
    `is-glow-${glow}`,
    interactive ? 'is-interactive' : '',
    spotlight ? 'vc-magic-card' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component
      className={classes}
      data-force-dark={forceDark ? 'true' : undefined}
      onPointerMove={spotlight || onPointerMove ? handlePointerMove : undefined}
      onPointerLeave={spotlight || onPointerLeave ? handlePointerLeave : undefined}
      {...rest}
    >
      {sheen && <span className="vc-glass-sheen" aria-hidden="true" />}
      {spotlight && <SpotlightLayer />}
      {children}
    </Component>
  );
}

/** Semantic alias for card containers */
export const GlassCard = GlassSurface;

/**
 * GlassPill
 * Recessed translucent capsule badge with optional glowing dot or icon (like `01 · IDENTIDAD Y DISEÑO`).
 */
export interface GlassPillProps extends HTMLAttributes<HTMLSpanElement> {
  dot?: boolean;
  dotColor?: 'cyan' | 'magenta' | 'brand';
  icon?: ReactNode;
  forceDark?: boolean;
}

export function GlassPill({
  dot = false,
  dotColor = 'cyan',
  icon,
  forceDark = false,
  className = '',
  children,
  ...props
}: GlassPillProps) {
  return (
    <span
      className={`vc-glass-pill${className ? ` ${className}` : ''}`}
      data-force-dark={forceDark ? 'true' : undefined}
      {...props}
    >
      {dot && <span className={`vc-glass-pill-dot is-${dotColor}`} aria-hidden="true" />}
      {icon && <span className="vc-glass-pill-icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

/**
 * GlassButton
 * Optical glassmorphism button or router link with `glass`, `primary`, `accent`, or `ghost` tones.
 */
export type GlassButtonTone = 'glass' | 'primary' | 'accent' | 'ghost';
export type GlassButtonSize = 'sm' | 'md' | 'lg';

type GlassButtonBaseProps = {
  tone?: GlassButtonTone;
  size?: GlassButtonSize;
  radius?: 'pill' | 'lg' | 'md';
  sheen?: boolean;
  forceDark?: boolean;
  className?: string;
  children: ReactNode;
};

export type GlassButtonProps =
  | (GlassButtonBaseProps &
      ButtonHTMLAttributes<HTMLButtonElement> & {
        to?: undefined;
        href?: undefined;
      })
  | (GlassButtonBaseProps &
      Omit<LinkProps, 'className'> & {
        to: LinkProps['to'];
        href?: undefined;
      })
  | (GlassButtonBaseProps &
       React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
        to?: undefined;
      });

export function GlassButton(props: GlassButtonProps) {
  const {
    tone = 'glass',
    size = 'md',
    radius = 'pill',
    sheen = false,
    forceDark = false,
    className = '',
    children,
    ...rest
  } = props;

  const classes = [
    'vc-glass-btn',
    `is-tone-${tone}`,
    `is-size-${size}`,
    `is-radius-${radius}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      {sheen && <span className="vc-glass-sheen" aria-hidden="true" />}
      {children}
    </>
  );

  if ('to' in props && props.to !== undefined) {
    const { to, ...linkRest } = rest as Omit<LinkProps, 'className' | 'to'> & { to?: LinkProps['to'] };
    return (
      <Link
        to={props.to}
        className={classes}
        data-force-dark={forceDark ? 'true' : undefined}
        {...linkRest}
      >
        {inner}
      </Link>
    );
  }

  if ('href' in props && typeof props.href === 'string') {
    const anchorRest = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        href={props.href}
        className={classes}
        data-force-dark={forceDark ? 'true' : undefined}
        {...anchorRest}
      >
        {inner}
      </a>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      type={buttonRest.type || 'button'}
      className={classes}
      data-force-dark={forceDark ? 'true' : undefined}
      {...buttonRest}
    >
      {inner}
    </button>
  );
}

/**
 * GlassFormField
 * Rounded glassmorphic input or textarea field with accessible label, hint, and error message.
 */
type BaseGlassFieldProps = {
  label?: string;
  hint?: string;
  error?: string;
  icon?: ReactNode;
  forceDark?: boolean;
  containerClassName?: string;
};

export type GlassInputFieldProps = BaseGlassFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    multiline?: false;
  };

export type GlassTextareaFieldProps = BaseGlassFieldProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multiline: true;
  };

export type GlassFormFieldProps = GlassInputFieldProps | GlassTextareaFieldProps;

export const GlassFormField = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  GlassFormFieldProps
>(function GlassFormField(props, ref) {
  const {
    label,
    hint,
    error,
    icon,
    forceDark = false,
    containerClassName = '',
    className = '',
    id,
    required,
    multiline,
    ...rest
  } = props;

  const generatedId = useId();
  const fieldId = id || `vc-glass-field-${generatedId}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [rest['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className={`vc-glass-field${error ? ' has-error' : ''}${containerClassName ? ` ${containerClassName}` : ''}`}
      data-force-dark={forceDark ? 'true' : undefined}
    >
      {label && (
        <label htmlFor={fieldId} className="vc-glass-field-label">
          <span>{label}</span>
          {required && <span className="vc-glass-field-req" aria-hidden="true"> *</span>}
        </label>
      )}
      <div className={`vc-glass-field-control${icon ? ' has-icon' : ''}`}>
        {icon && <span className="vc-glass-field-icon" aria-hidden="true">{icon}</span>}
        {multiline ? (
          <textarea
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
            ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
            id={fieldId}
            required={required}
            aria-invalid={error ? true : rest['aria-invalid']}
            aria-describedby={describedBy}
            data-force-dark={forceDark ? 'true' : undefined}
            className={`vc-glass-input is-textarea${className ? ` ${className}` : ''}`}
          />
        ) : (
          <input
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
            ref={ref as React.ForwardedRef<HTMLInputElement>}
            id={fieldId}
            required={required}
            aria-invalid={error ? true : rest['aria-invalid']}
            aria-describedby={describedBy}
            data-force-dark={forceDark ? 'true' : undefined}
            className={`vc-glass-input${className ? ` ${className}` : ''}`}
          />
        )}
      </div>
      {hint && (
        <small id={hintId} className="vc-glass-field-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={errorId} className="vc-glass-field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
});
