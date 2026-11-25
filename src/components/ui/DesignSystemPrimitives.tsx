import React, { lazy, Suspense, useEffect, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LiquidGlassProps } from 'simple-liquid-glass';

const LazyLiquidGlass = lazy(async () => {
  const { LiquidGlass } = await import('simple-liquid-glass');
  return { default: LiquidGlass };
});

function useReducedTransparency() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-transparency: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const updatePreference = () => setReduced(query.matches);
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  return reduced;
}

type UiLiquidGlassAccentProps = Pick<LiquidGlassProps, 'className' | 'style'>;

/** Decorative refractive layer, lazy-loaded and omitted when reduced transparency is requested. */
export function UiLiquidGlassAccent({ className = '', style }: UiLiquidGlassAccentProps) {
  const reducedTransparency = useReducedTransparency();

  if (reducedTransparency) return null;

  return (
    <Suspense fallback={null}>
      <LazyLiquidGlass
        aria-hidden="true"
        className={`vc-ui-liquid-glass-accent${className ? ` ${className}` : ''}`}
        effectMode="auto"
        renderer="svg"
        material="subtle"
        quality="low"
        radius={24}
        blur={1}
        saturation={115}
        glassColor="rgba(255,255,255,0.045)"
        borderColor="rgba(255,255,255,0.32)"
        style={style}
      />
    </Suspense>
  );
}

export type UiButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: UiButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function UiButton({ variant = 'primary', size = 'md', loading = false, type = 'button', className = '', disabled, children, ...props }: UiButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`vc-ui-button is-${variant} is-${size}${className ? ` ${className}` : ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="vc-ui-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export type UiSurfaceVariant = 'plain' | 'raised' | 'subtle' | 'glass';
type SurfaceTag = 'section' | 'div' | 'article' | 'aside';

export interface UiSurfaceProps extends HTMLAttributes<HTMLElement> {
  variant?: UiSurfaceVariant;
  as?: SurfaceTag;
}

export function UiSurface({ variant = 'plain', as: Tag = 'section', className = '', ...props }: UiSurfaceProps) {
  return <Tag {...props} className={`vc-ui-surface is-${variant}${className ? ` ${className}` : ''}`} />;
}

export function AuroraField({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`vc-ui-surface is-glass vc-aurora-field${className ? ` ${className}` : ''}`}>{children}</div>;
}

export type UiBadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export function UiBadge({ tone = 'neutral', className = '', children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: UiBadgeTone }) {
  return <span {...props} className={`vc-ui-badge is-${tone}${className ? ` ${className}` : ''}`}>{children}</span>;
}

export interface UiTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
}

export function UiTextField({ label, hint, error, id, required, className = '', ...props }: UiTextFieldProps) {
  const generatedId = useId();
  const inputId = id || `vc-field-${generatedId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`vc-ui-field${error ? ' has-error' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={inputId}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input {...props} id={inputId} required={required} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy} />
      {hint && <small id={hintId} className="vc-ui-field-hint">{hint}</small>}
      {error && <small id={errorId} className="vc-ui-field-error" role="alert">{error}</small>}
    </div>
  );
}

export function UiNotice({ tone = 'info', icon, title, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Exclude<UiBadgeTone, 'neutral'>; icon?: ReactNode; title?: string }) {
  const role = tone === 'danger' ? 'alert' : 'status';
  return (
    <div {...props} className={`vc-ui-notice is-${tone}${className ? ` ${className}` : ''}`} role={role}>
      {icon && <span className="vc-ui-notice-icon" aria-hidden="true">{icon}</span>}
      <div className="vc-ui-notice-copy">{title && <strong>{title}</strong>}<div>{children}</div></div>
    </div>
  );
}
