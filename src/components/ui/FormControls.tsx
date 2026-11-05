import React, { useId, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import './form-controls.css';

export type FloatInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  size?: 'sm' | 'md' | 'lg';
};

export function FloatInput({
  label,
  error,
  hint,
  icon,
  clearable = false,
  onClear,
  id,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  required,
  disabled,
  className = '',
  size = 'md',
  ...rest
}: FloatInputProps) {
  const generatedId = useId();
  const inputId = id || `float-input-${generatedId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const isControlled = value !== undefined;
  const hasValue = isControlled
    ? Boolean(value !== '' && value !== null)
    : Boolean(inputRef.current?.value);

  const isFloating = isFocused || hasValue;

  return (
    <div
      className={`vc-float-control vc-control-${size} ${isFloating ? 'is-floating' : ''} ${
        isFocused ? 'is-focused' : ''
      } ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
    >
      <div className="vc-float-field-box">
        {icon && <span className="vc-float-icon" aria-hidden="true">{icon}</span>}
        <input
          {...rest}
          ref={inputRef}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={onChange}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          className="vc-float-input"
        />
        <label htmlFor={inputId} className="vc-float-label">
          {label}
          {required && <span className="vc-float-required" aria-hidden="true"> *</span>}
        </label>
        {clearable && hasValue && !disabled && (
          <button
            type="button"
            className="vc-float-clear-btn"
            aria-label="Limpiar campo"
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.value = '';
                const ev = new Event('input', { bubbles: true });
                inputRef.current.dispatchEvent(ev);
              }
              onClear?.();
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            key="error"
            id={errorId}
            role="alert"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="vc-float-feedback is-error"
          >
            <AlertCircle size={13} aria-hidden="true" />
            <span>{error}</span>
          </motion.div>
        ) : hint ? (
          <span key="hint" id={hintId} className="vc-float-feedback is-hint">
            {hint}
          </span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export type FloatTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
  maxChars?: number;
};

export function FloatTextarea({
  label,
  error,
  hint,
  maxChars,
  id,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  required,
  disabled,
  rows = 3,
  className = '',
  ...rest
}: FloatTextareaProps) {
  const generatedId = useId();
  const textareaId = id || `float-textarea-${generatedId}`;
  const errorId = `${textareaId}-error`;
  const hintId = `${textareaId}-hint`;
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduceMotion = useReducedMotion();

  const isControlled = value !== undefined;
  const currentVal = isControlled ? String(value || '') : textareaRef.current?.value || '';
  const hasValue = Boolean(currentVal.length > 0);
  const isFloating = isFocused || hasValue;

  return (
    <div
      className={`vc-float-control vc-control-textarea ${isFloating ? 'is-floating' : ''} ${
        isFocused ? 'is-focused' : ''
      } ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
    >
      <div className="vc-float-field-box">
        <textarea
          {...rest}
          ref={textareaRef}
          id={textareaId}
          rows={rows}
          value={value}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          maxLength={maxChars}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          onChange={onChange}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          className="vc-float-textarea"
        />
        <label htmlFor={textareaId} className="vc-float-label">
          {label}
          {required && <span className="vc-float-required" aria-hidden="true"> *</span>}
        </label>
      </div>

      <div className="vc-float-meta-row">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key="error"
              id={errorId}
              role="alert"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="vc-float-feedback is-error"
            >
              <AlertCircle size={13} aria-hidden="true" />
              <span>{error}</span>
            </motion.div>
          ) : hint ? (
            <span key="hint" id={hintId} className="vc-float-feedback is-hint">
              {hint}
            </span>
          ) : <span />}
        </AnimatePresence>

        {maxChars && (
          <span className="vc-float-counter">
            {currentVal.length}/{maxChars}
          </span>
        )}
      </div>
    </div>
  );
}

export type FeedbackAlertProps = {
  type: 'error' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
};

export function FeedbackAlert({
  type,
  children,
  action,
  className = '',
  onDismiss,
}: FeedbackAlertProps) {
  const Icon =
    type === 'success'
      ? CheckCircle2
      : type === 'error'
      ? AlertCircle
      : AlertCircle;

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`vc-feedback-alert is-${type} ${className}`}
    >
      <Icon size={16} className="vc-alert-icon" aria-hidden="true" />
      <div className="vc-alert-content">{children}</div>
      {action && <div className="vc-alert-action">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="vc-alert-close"
          aria-label="Cerrar notificación"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
