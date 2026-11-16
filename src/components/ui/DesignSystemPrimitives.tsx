import React, { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

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
