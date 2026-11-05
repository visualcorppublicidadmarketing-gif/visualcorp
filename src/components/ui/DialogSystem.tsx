import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Info,
  LoaderCircle,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { BorderBeam, clearSpotlight, SpotlightLayer, updateSpotlight } from './MagicComponents';
import './dialog-system.css';

export type DialogSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export type DialogSide = 'center' | 'top' | 'right' | 'left' | 'bottom';
export type DialogTone = 'default' | 'brand' | 'info' | 'success' | 'warning' | 'danger';
export type DialogBackdrop = 'blur' | 'opaque' | 'dim';

export interface DialogKeyValueItem {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: 'default' | 'highlight' | 'danger' | 'success';
}

export interface DialogStepItem {
  label: React.ReactNode;
  status?: 'pending' | 'active' | 'done';
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  showToneIcon?: boolean;
  media?: React.ReactNode;
  headerActions?: React.ReactNode;
  steps?: DialogStepItem[];
  children?: React.ReactNode;
  footer?: React.ReactNode;
  footerHint?: React.ReactNode;
  size?: DialogSize;
  side?: DialogSide;
  tone?: DialogTone;
  backdrop?: DialogBackdrop;
  magicBorder?: boolean;
  spotlight?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  hideCloseButton?: boolean;
  busy?: boolean;
  role?: 'dialog' | 'alertdialog';
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  overlayClassName?: string;
}

export interface AlertDialogConfirmPayload {
  reason: string;
  confirmedKeyword: string;
  checked: boolean;
}

export interface AlertDialogProps extends Omit<DialogProps, 'role' | 'children'> {
  children?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  hideCancel?: boolean;
  destructive?: boolean;
  consequences?: React.ReactNode[];
  consequencesTitle?: React.ReactNode;
  summaryItems?: DialogKeyValueItem[];
  callout?: React.ReactNode;
  calloutTone?: Exclude<DialogTone, 'default'>;
  confirmationKeyword?: string;
  confirmationLabel?: React.ReactNode;
  requireReason?: boolean;
  reasonRequired?: boolean;
  reasonLabel?: React.ReactNode;
  reasonPlaceholder?: string;
  reasonDefaultValue?: string;
  reasonMinLength?: number;
  checkboxLabel?: React.ReactNode;
  requireCheckbox?: boolean;
  closeOnConfirm?: boolean;
  secondaryAction?: {
    label: React.ReactNode;
    onClick: () => void;
    variant?: 'outline' | 'ghost';
  };
  onConfirm?: (payload: AlertDialogConfirmPayload) => void | boolean | Promise<void | boolean>;
  onCancel?: () => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

let activeBodyLocks = 0;
let savedBodyOverflow = '';

function lockBodyScroll() {
  if (typeof document === 'undefined') return () => {};
  if (activeBodyLocks === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeBodyLocks += 1;
  return () => {
    activeBodyLocks = Math.max(0, activeBodyLocks - 1);
    if (activeBodyLocks === 0 && typeof document !== 'undefined') {
      document.body.style.overflow = savedBodyOverflow;
    }
  };
}

function getToneIcon(tone: DialogTone, destructive?: boolean) {
  if (destructive || tone === 'danger') return <ShieldAlert size={20} />;
  if (tone === 'warning') return <AlertTriangle size={20} />;
  if (tone === 'success') return <CheckCircle2 size={20} />;
  if (tone === 'info') return <Info size={20} />;
  if (tone === 'brand') return <Sparkles size={20} />;
  return <ShieldCheck size={20} />;
}

function getDefaultEyebrow(tone: DialogTone, role: 'dialog' | 'alertdialog') {
  if (role !== 'alertdialog') return undefined;
  switch (tone) {
    case 'danger':
      return 'CONFIRMACIÓN CRÍTICA';
    case 'warning':
      return 'PRECAUCIÓN OPERATIVA';
    case 'success':
      return 'OPERACIÓN VERIFICADA';
    case 'info':
      return 'AVISO DEL SISTEMA';
    case 'brand':
      return 'VISUAL CORP SUITE';
    default:
      return 'CONFIRMACIÓN';
  }
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  badge,
  icon,
  showToneIcon = false,
  media,
  headerActions,
  steps,
  children,
  footer,
  footerHint,
  size = 'md',
  side = 'center',
  tone = 'default',
  backdrop = 'blur',
  magicBorder = false,
  spotlight = false,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  hideCloseButton = false,
  busy = false,
  role = 'dialog',
  initialFocusRef,
  className = '',
  overlayClassName = '',
}: DialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const [nudged, setNudged] = useState(false);
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'light';
    const html = document.documentElement;
    if (html.dataset.vcTheme === 'light' || html.dataset.vcTheme === 'dark') return html.dataset.vcTheme;
    if (document.querySelector('.public-site')) {
      return html.dataset.publicTheme === 'light' ? 'light' : 'dark';
    }
    return html.dataset.theme === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const html = document.documentElement;
    const syncTheme = () => {
      if (html.dataset.vcTheme === 'light' || html.dataset.vcTheme === 'dark') {
        setActiveTheme(html.dataset.vcTheme);
        return;
      }
      if (document.querySelector('.public-site')) {
        setActiveTheme(html.dataset.publicTheme === 'light' ? 'light' : 'dark');
        return;
      }
      setActiveTheme(html.dataset.theme === 'dark' ? 'dark' : 'light');
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme', 'data-public-theme', 'data-vc-theme'] });
    return () => observer.disconnect();
  }, [open]);

  const triggerNudge = useCallback(() => {
    setNudged(false);
    window.requestAnimationFrame(() => setNudged(true));
  }, []);

  useEffect(() => {
    if (!nudged) return;
    const timer = window.setTimeout(() => setNudged(false), 280);
    return () => window.clearTimeout(timer);
  }, [nudged]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const unlockScroll = lockBodyScroll();
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInitialElement = () => {
      if (initialFocusRef?.current && !initialFocusRef.current.hasAttribute('disabled')) {
        initialFocusRef.current.focus({ preventScroll: true });
        return;
      }
      const root = dialogRef.current;
      if (!root) return;
      const autoFocusNode = root.querySelector<HTMLElement>('[data-autofocus]:not(:disabled), [autofocus]:not(:disabled)');
      if (autoFocusNode) {
        autoFocusNode.focus({ preventScroll: true });
        return;
      }
      const bodyControl = root.querySelector<HTMLElement>(
        `.vc-dialog-body ${FOCUSABLE_SELECTOR.split(', ').join(', .vc-dialog-body ')}`
      );
      if (bodyControl && bodyControl.offsetParent !== null) {
        bodyControl.focus({ preventScroll: true });
        return;
      }
      const anyControl = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].find(
        (node) => node.offsetParent !== null
      );
      if (anyControl) {
        anyControl.focus({ preventScroll: true });
      } else {
        root.focus({ preventScroll: true });
      }
    };

    const rafId = window.requestAnimationFrame(focusInitialElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (closeOnEscape && !busy) {
          onOpenChangeRef.current(false);
        } else {
          triggerNudge();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (node) => node.offsetParent !== null && !node.hasAttribute('disabled')
      );
      if (!nodes.length) {
        event.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
      unlockScroll();
      if (previousActive && document.contains(previousActive)) {
        previousActive.focus({ preventScroll: true });
      }
    };
  }, [open, closeOnEscape, busy, initialFocusRef, triggerNudge]);

  if (!open || typeof document === 'undefined') return null;

  const resolvedIcon = icon ?? (showToneIcon || role === 'alertdialog' ? getToneIcon(tone) : null);
  const resolvedEyebrow = eyebrow ?? getDefaultEyebrow(tone, role);

  const node = (
    <div
      className={`vc-dialog-overlay ok-overlay theme-${activeTheme} backdrop-${backdrop} side-${side} ${overlayClassName}`}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (closeOnOverlayClick && !busy) {
          onOpenChangeRef.current(false);
        } else {
          triggerNudge();
        }
      }}
    >
      <section
        ref={dialogRef}
        className={`vc-dialog ok-dialog theme-${activeTheme} size-${size} side-${side} tone-${tone} ${nudged ? 'is-nudged' : ''} ${className}`}
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onPointerMove={spotlight ? updateSpotlight : undefined}
        onPointerLeave={spotlight ? clearSpotlight : undefined}
      >
        {magicBorder && <BorderBeam />}
        {spotlight && <SpotlightLayer />}
        <div className="vc-dialog-ambient" aria-hidden="true" />
        {media && <div className="vc-dialog-media">{media}</div>}
        <header className="vc-dialog-header">
          <div className="vc-dialog-header-main">
            {resolvedIcon && (
              <span className="vc-dialog-icon-badge" aria-hidden="true">
                {resolvedIcon}
              </span>
            )}
            <div className="vc-dialog-heading-copy">
              {(resolvedEyebrow || badge) && (
                <div className="vc-dialog-eyebrow-row">
                  {resolvedEyebrow && <span className="vc-dialog-eyebrow">{resolvedEyebrow}</span>}
                  {badge && <span className="vc-dialog-badge">{badge}</span>}
                </div>
              )}
              <h2 id={`${id}-title`} className="vc-dialog-title">
                {title}
              </h2>
              {description && (
                <p id={`${id}-description`} className="vc-dialog-description">
                  {description}
                </p>
              )}
            </div>
          </div>
          {(!hideCloseButton || headerActions) && (
            <div className="vc-dialog-header-actions">
              {headerActions}
              {!hideCloseButton && (
                <button
                  type="button"
                  className="vc-dialog-close"
                  aria-label="Cerrar ventana"
                  disabled={busy}
                  onClick={() => onOpenChangeRef.current(false)}
                >
                  <X size={17} />
                </button>
              )}
            </div>
          )}
        </header>
        {steps && steps.length > 0 && <DialogStepIndicator steps={steps} />}
        {children !== undefined && children !== null && (
          <div className="vc-dialog-body ok-dialog-content">{children}</div>
        )}
        {footer && (
          <footer className="vc-dialog-footer">
            {footerHint ? (
              <span className="vc-dialog-footer-hint">{footerHint}</span>
            ) : (
              <span className="vc-dialog-footer-hint" aria-hidden="true">
                <kbd>Esc</kbd> para cerrar
              </span>
            )}
            <div className="vc-dialog-footer-actions">{footer}</div>
          </footer>
        )}
      </section>
    </div>
  );

  return createPortal(node, document.body);
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  eyebrow,
  badge,
  icon,
  children,
  footer,
  size = 'sm',
  side = 'center',
  tone,
  destructive = false,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  hideCancel = false,
  consequences,
  consequencesTitle = 'Alcance y garantías de esta acción',
  summaryItems,
  callout,
  calloutTone,
  confirmationKeyword,
  confirmationLabel,
  requireReason = false,
  reasonRequired = true,
  reasonLabel = 'Motivo o nota de auditoría',
  reasonPlaceholder = 'Describe el motivo para el registro interno…',
  reasonDefaultValue = '',
  reasonMinLength = 3,
  checkboxLabel,
  requireCheckbox = false,
  closeOnConfirm = true,
  closeOnOverlayClick = false,
  magicBorder = false,
  secondaryAction,
  onConfirm,
  onCancel,
  busy: externalBusy = false,
  ...rest
}: AlertDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [typedKeyword, setTypedKeyword] = useState('');
  const [reason, setReason] = useState(reasonDefaultValue);
  const [checked, setChecked] = useState(false);
  const [internalBusy, setInternalBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const resolvedTone: DialogTone = tone ?? (destructive ? 'danger' : 'warning');
  const isBusy = externalBusy || internalBusy;

  useEffect(() => {
    if (open) {
      setTypedKeyword('');
      setReason(reasonDefaultValue);
      setChecked(false);
      setErrorMessage('');
      setInternalBusy(false);
    }
  }, [open, reasonDefaultValue]);

  const keywordMatches = useMemo(() => {
    if (!confirmationKeyword) return true;
    return typedKeyword.trim().toLocaleUpperCase('es') === confirmationKeyword.trim().toLocaleUpperCase('es');
  }, [confirmationKeyword, typedKeyword]);

  const reasonValid = useMemo(() => {
    if (!requireReason || !reasonRequired) return true;
    return reason.trim().length >= reasonMinLength;
  }, [requireReason, reasonRequired, reason, reasonMinLength]);

  const checkboxValid = !checkboxLabel || !requireCheckbox || checked;
  const canConfirm = keywordMatches && reasonValid && checkboxValid && !isBusy;

  const handleCancel = () => {
    if (isBusy) return;
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canConfirm) return;
    setErrorMessage('');
    if (!onConfirm) {
      if (closeOnConfirm) onOpenChange(false);
      return;
    }
    try {
      setInternalBusy(true);
      const result = await onConfirm({
        reason: reason.trim(),
        confirmedKeyword: typedKeyword.trim(),
        checked,
      });
      setInternalBusy(false);
      if (result !== false && closeOnConfirm) {
        onOpenChange(false);
      }
    } catch (error) {
      setInternalBusy(false);
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.');
    }
  };

  const confirmVariant =
    resolvedTone === 'danger'
      ? 'danger'
      : resolvedTone === 'warning'
      ? 'warning'
      : resolvedTone === 'success'
      ? 'success'
      : resolvedTone === 'info'
      ? 'info'
      : 'primary';

  const hasInteractiveLock = Boolean(confirmationKeyword || requireReason);

  return (
    <Dialog
      {...rest}
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
        else onOpenChange(true);
      }}
      role="alertdialog"
      title={title}
      description={description}
      eyebrow={eyebrow}
      badge={badge}
      icon={icon ?? getToneIcon(resolvedTone, destructive)}
      size={size}
      side={side}
      tone={resolvedTone}
      magicBorder={magicBorder}
      closeOnOverlayClick={closeOnOverlayClick}
      busy={isBusy}
      initialFocusRef={
        hasInteractiveLock
          ? (inputRef as React.RefObject<HTMLElement | null>)
          : resolvedTone === 'danger' || destructive
          ? (cancelBtnRef as React.RefObject<HTMLElement | null>)
          : undefined
      }
      footer={
        footer || (
          <>
            {!hideCancel && (
              <button
                ref={cancelBtnRef}
                type="button"
                className="vc-dlg-btn variant-outline"
                disabled={isBusy}
                onClick={handleCancel}
              >
                {cancelLabel}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                className={`vc-dlg-btn variant-${secondaryAction.variant || 'ghost'}`}
                disabled={isBusy}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </button>
            )}
            <button
              type="button"
              className={`vc-dlg-btn variant-${confirmVariant}`}
              disabled={!canConfirm}
              onClick={() => void handleConfirm()}
            >
              {isBusy ? (
                <>
                  <LoaderCircle size={16} className="vc-spin" /> Procesando…
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </>
        )
      }
    >
      {summaryItems && summaryItems.length > 0 && <DialogKeyValueList items={summaryItems} />}
      {consequences && consequences.length > 0 && (
        <DialogConsequenceList title={consequencesTitle} items={consequences} tone={resolvedTone} />
      )}
      {callout && <DialogCallout tone={calloutTone || (resolvedTone === 'default' ? 'info' : resolvedTone)}>{callout}</DialogCallout>}
      {children}
      {requireReason && (
        <label className="vc-dialog-field">
          <span>
            {reasonLabel}
            {reasonRequired && <small>Obligatorio (mín. {reasonMinLength} caracteres)</small>}
          </span>
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={2}
            value={reason}
            disabled={isBusy}
            placeholder={reasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      {confirmationKeyword && (
        <label className="vc-dialog-field">
          <span>
            {confirmationLabel || 'Escribe la clave de seguridad para habilitar la confirmación:'}
            <code>{confirmationKeyword}</code>
          </span>
          <input
            ref={!requireReason ? (inputRef as React.RefObject<HTMLInputElement>) : undefined}
            type="text"
            value={typedKeyword}
            disabled={isBusy}
            autoComplete="off"
            placeholder={`Escribe ${confirmationKeyword}`}
            onChange={(event) => setTypedKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canConfirm) {
                event.preventDefault();
                void handleConfirm();
              }
            }}
          />
        </label>
      )}
      {checkboxLabel && (
        <label className="vc-dialog-checkbox">
          <input
            type="checkbox"
            checked={checked}
            disabled={isBusy}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>{checkboxLabel}</span>
        </label>
      )}
      {errorMessage && (
        <DialogCallout tone="danger" role="alert">
          {errorMessage}
        </DialogCallout>
      )}
    </Dialog>
  );
}

/* ==========================================================================
   Subcomponentes y Complementos para todos los casos de uso
   ========================================================================== */

export function DialogMedia({
  src,
  alt,
  badge,
  children,
}: {
  src?: string;
  alt?: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="vc-dialog-media">
      {src ? <img src={src} alt={alt || ''} loading="lazy" /> : children}
      {badge && <span className="vc-dialog-media-badge">{badge}</span>}
    </div>
  );
}

export function DialogSection({
  title,
  description,
  icon,
  action,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`vc-dialog-section ${className}`}>
      {(title || description || action) && (
        <div className="vc-dialog-section-head">
          <div>
            {title && (
              <h3>
                {icon}
                {title}
              </h3>
            )}
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function DialogKeyValueList({ items }: { items: DialogKeyValueItem[] }) {
  if (!items.length) return null;
  return (
    <dl className="vc-dialog-kv-list">
      {items.map((item, index) => (
        <div key={index} className={`vc-dialog-kv-item ${item.tone ? `tone-${item.tone}` : ''}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DialogConsequenceList({
  title = 'Alcance y garantías',
  items,
  tone = 'warning',
}: {
  title?: React.ReactNode;
  items: React.ReactNode[];
  tone?: DialogTone;
}) {
  if (!items.length) return null;
  return (
    <div className="vc-dialog-consequences">
      {title && (
        <span className="vc-dialog-consequences-title">
          <Lock size={13} />
          {title}
        </span>
      )}
      <ul>
        {items.map((item, index) => (
          <li key={index}>
            {tone === 'danger' ? <AlertCircle size={15} /> : <Check size={15} />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DialogCallout({
  tone = 'info',
  role,
  children,
}: {
  tone?: Exclude<DialogTone, 'default'>;
  role?: 'status' | 'alert';
  children: React.ReactNode;
}) {
  const icon =
    tone === 'danger' ? (
      <AlertCircle size={17} />
    ) : tone === 'warning' ? (
      <AlertTriangle size={17} />
    ) : tone === 'success' ? (
      <CheckCircle2 size={17} />
    ) : tone === 'brand' ? (
      <Sparkles size={17} />
    ) : (
      <Info size={17} />
    );
  return (
    <div className={`vc-dialog-callout tone-${tone}`} role={role || (tone === 'danger' ? 'alert' : 'status')}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

export function DialogStepIndicator({ steps }: { steps: DialogStepItem[] }) {
  return (
    <nav className="vc-dialog-steps" aria-label="Progreso del asistente">
      {steps.map((step, index) => {
        const status = step.status || 'pending';
        return (
          <React.Fragment key={index}>
            {index > 0 && <span className="vc-dialog-step-divider" aria-hidden="true" />}
            <span
              className={`vc-dialog-step ${status === 'active' ? 'is-active' : status === 'done' ? 'is-done' : ''}`}
              aria-current={status === 'active' ? 'step' : undefined}
            >
              <span className="vc-dialog-step-index">
                {status === 'done' ? <Check size={12} /> : index + 1}
              </span>
              <span>{step.label}</span>
            </span>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* ==========================================================================
   Global Provider & Imperative Hooks (useConfirm, useAlert, usePrompt)
   Reemplaza window.confirm / window.alert / window.prompt con WAI-ARIA + Magic UI
   ========================================================================== */

export interface ConfirmOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: DialogTone;
  destructive?: boolean;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  consequences?: React.ReactNode[];
  consequencesTitle?: React.ReactNode;
  summaryItems?: DialogKeyValueItem[];
  callout?: React.ReactNode;
  confirmationKeyword?: string;
  confirmationLabel?: React.ReactNode;
  checkboxLabel?: React.ReactNode;
  requireCheckbox?: boolean;
  size?: DialogSize;
}

export interface AlertOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: DialogTone;
  confirmLabel?: React.ReactNode;
  consequences?: React.ReactNode[];
  summaryItems?: DialogKeyValueItem[];
  callout?: React.ReactNode;
  size?: DialogSize;
}

export interface PromptOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  tone?: DialogTone;
  label?: React.ReactNode;
  placeholder?: string;
  defaultValue?: string;
  minLength?: number;
  required?: boolean;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  consequences?: React.ReactNode[];
  summaryItems?: DialogKeyValueItem[];
}

type QueueEntry =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

interface DialogSystemContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogSystemContext = createContext<DialogSystemContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const active = queue[0] || null;

  const shiftQueue = useCallback(() => {
    setQueue((current) => current.slice(1));
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setQueue((current) => [...current, { kind: 'confirm', options, resolve }]);
    });
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setQueue((current) => [...current, { kind: 'alert', options, resolve }]);
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setQueue((current) => [...current, { kind: 'prompt', options, resolve }]);
    });
  }, []);

  const contextValue = useMemo(() => ({ confirm, alert, prompt }), [confirm, alert, prompt]);

  return (
    <DialogSystemContext.Provider value={contextValue}>
      {children}
      {active?.kind === 'confirm' && (
        <AlertDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              active.resolve(false);
              shiftQueue();
            }
          }}
          title={active.options.title}
          description={active.options.description}
          eyebrow={active.options.eyebrow}
          badge={active.options.badge}
          tone={active.options.tone ?? (active.options.destructive ? 'danger' : 'warning')}
          destructive={active.options.destructive}
          confirmLabel={active.options.confirmLabel ?? 'Confirmar'}
          cancelLabel={active.options.cancelLabel ?? 'Cancelar'}
          consequences={active.options.consequences}
          consequencesTitle={active.options.consequencesTitle}
          summaryItems={active.options.summaryItems}
          callout={active.options.callout}
          confirmationKeyword={active.options.confirmationKeyword}
          confirmationLabel={active.options.confirmationLabel}
          checkboxLabel={active.options.checkboxLabel}
          requireCheckbox={active.options.requireCheckbox}
          size={active.options.size ?? 'sm'}
          closeOnConfirm={false}
          onConfirm={() => {
            active.resolve(true);
            shiftQueue();
          }}
        />
      )}
      {active?.kind === 'alert' && (
        <AlertDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              active.resolve();
              shiftQueue();
            }
          }}
          title={active.options.title}
          description={active.options.description}
          eyebrow={active.options.eyebrow}
          badge={active.options.badge}
          tone={active.options.tone ?? 'info'}
          hideCancel={true}
          confirmLabel={active.options.confirmLabel ?? 'Entendido'}
          consequences={active.options.consequences}
          summaryItems={active.options.summaryItems}
          callout={active.options.callout}
          size={active.options.size ?? 'sm'}
          closeOnConfirm={false}
          onConfirm={() => {
            active.resolve();
            shiftQueue();
          }}
        />
      )}
      {active?.kind === 'prompt' && (
        <AlertDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              active.resolve(null);
              shiftQueue();
            }
          }}
          title={active.options.title}
          description={active.options.description}
          eyebrow={active.options.eyebrow ?? 'REGISTRO CON AUDITORÍA'}
          tone={active.options.tone ?? 'brand'}
          confirmLabel={active.options.confirmLabel ?? 'Guardar y continuar'}
          cancelLabel={active.options.cancelLabel ?? 'Cancelar'}
          consequences={active.options.consequences}
          summaryItems={active.options.summaryItems}
          requireReason={true}
          reasonRequired={active.options.required ?? true}
          reasonLabel={active.options.label ?? 'Detalle o motivo'}
          reasonPlaceholder={active.options.placeholder ?? 'Escribe el detalle requerido…'}
          reasonDefaultValue={active.options.defaultValue ?? ''}
          reasonMinLength={active.options.minLength ?? 3}
          closeOnConfirm={false}
          onConfirm={({ reason }) => {
            active.resolve(reason);
            shiftQueue();
          }}
        />
      )}
    </DialogSystemContext.Provider>
  );
}

export function useDialogSystem(): DialogSystemContextValue {
  const context = useContext(DialogSystemContext);
  if (!context) {
    return {
      confirm: async () => {
        console.error('[DialogSystem] Falta DialogProvider; se canceló la acción para evitar un diálogo nativo del navegador.');
        return false;
      },
      alert: async () => {
        console.error('[DialogSystem] Falta DialogProvider; no se pudo mostrar el aviso.');
      },
      prompt: async () => {
        console.error('[DialogSystem] Falta DialogProvider; se canceló la solicitud de texto.');
        return null;
      },
    };
  }
  return context;
}

export function useConfirm() {
  return useDialogSystem().confirm;
}

export function useAlert() {
  return useDialogSystem().alert;
}

export function usePrompt() {
  return useDialogSystem().prompt;
}

/* ==========================================================================
   Galería interactiva de demostración del Sistema de Alertas y Diálogo
   Disponible en Respaldo y migración (/admin/respaldo) y Novedades
   ========================================================================== */

export function DialogSystemShowcase({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirm = useConfirm();
  const alert = useAlert();
  const prompt = usePrompt();
  const [lastResult, setLastResult] = useState<string>('Selecciona un complemento para probar su comportamiento en vivo.');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const testDestructiveConfirm = async () => {
    const accepted = await confirm({
      eyebrow: 'SEGURIDAD DE INVENTARIO',
      title: '¿Archivar ubicación de bodega EST-A1?',
      description: 'La ubicación dejará de aparecer como destino en recepciones y traslados nuevos.',
      tone: 'danger',
      destructive: true,
      confirmLabel: 'Sí, archivar ubicación',
      cancelLabel: 'Conservar activa',
      summaryItems: [
        { label: 'Código', value: 'EST-A1 · Estante de viniles' },
        { label: 'Sucursal', value: 'Visual Corp Matriz' },
        { label: 'Stock actual', value: '0 unidades', tone: 'success' },
      ],
      consequences: [
        'Se conserva íntegro el historial de movimientos, conteos y compras.',
        'Un administrador puede reactivar la ubicación en cualquier momento.',
      ],
    });
    setLastResult(
      accepted
        ? 'Confirmación destructiva aceptada con foco inicial seguro en Cancelar.'
        : 'Acción cancelada de forma segura (foco restaurado al botón de origen).'
    );
  };

  const testKeywordLock = async () => {
    const accepted = await confirm({
      eyebrow: 'BLOQUEO CON CLAVE DE SEGURIDAD',
      title: 'Retirar perfil operativo del equipo',
      description: 'Esta variante exige escribir una clave exacta antes de habilitar el botón de confirmación.',
      tone: 'danger',
      destructive: true,
      confirmationKeyword: 'CONFIRMAR',
      confirmationLabel: 'Escribe CONFIRMAR para desbloquear:',
      checkboxLabel: 'Comprendo que el historial de ventas y producción se conserva.',
      requireCheckbox: true,
      confirmLabel: 'Retirar acceso',
      consequences: [
        'La cuenta Google del colaborador no se elimina.',
        'Las órdenes de venta, caja y producción mantienen su autoría histórica.',
      ],
    });
    setLastResult(
      accepted
        ? 'Confirmación con palabra clave y casilla de verificación completada.'
        : 'Operación protegida cancelada sin cambios.'
    );
  };

  const testAuditPrompt = async () => {
    const reason = await prompt({
      eyebrow: 'AUDITORÍA DE OPERACIONES',
      title: 'Registrar motivo de ajuste o anulación',
      description: 'El complemento PromptDialog solicita un motivo trazable antes de ejecutar cambios sensibles.',
      tone: 'warning',
      label: 'Motivo de auditoría',
      placeholder: 'Ej. Diferencia detectada durante el arqueo de turno…',
      minLength: 5,
      confirmLabel: 'Registrar con motivo',
      summaryItems: [
        { label: 'Módulo', value: 'Caja y POS' },
        { label: 'Registro', value: 'Auditoría obligatoria', tone: 'highlight' },
      ],
    });
    setLastResult(
      reason
        ? `Motivo capturado con validación: “${reason}”.`
        : 'Captura de motivo cancelada por el usuario.'
    );
  };

  const testSystemAlert = async () => {
    await alert({
      eyebrow: 'AVISO OPERATIVO',
      title: 'Sincronización protegida con idempotencia',
      description: 'Las órdenes en espera y ventas del POS guardan una clave única antes de enviarse al servidor.',
      tone: 'success',
      badge: 'Verificado',
      summaryItems: [
        { label: 'Protección', value: 'Idempotencia activa', tone: 'success' },
        { label: 'Accesibilidad', value: 'WAI-ARIA APG AlertDialog' },
      ],
      callout: 'Puedes cerrar este aviso con Enter, Espacio o la tecla Escape.',
      confirmLabel: 'Entendido',
    });
    setLastResult('Aviso informativo mostrado y confirmado.');
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        eyebrow="MIGRACIÓN PENDIENTE · SISTEMA DE ALERTAS Y DIÁLOGO"
        badge="Magic UI + WAI-ARIA"
        title="Catálogo interactivo de Dialog y AlertDialog"
        description="Explora y prueba todos los complementos preparados para confirmaciones críticas, formularios con pasos, paneles laterales y avisos con auditoría."
        size="lg"
        tone="brand"
        magicBorder={true}
        showToneIcon={true}
        footer={
          <button type="button" className="vc-dlg-btn variant-primary" onClick={() => onOpenChange(false)}>
            <Check size={16} /> Listo
          </button>
        }
      >
        <DialogCallout tone="brand">{lastResult}</DialogCallout>
        <div className="vc-dialog-showcase-grid">
          <article className="vc-dialog-showcase-card">
            <div>
              <b>
                <Trash2 size={16} /> AlertDialog destructivo
              </b>
              <p>Rol alertdialog, bloqueo de clic exterior, lista de garantías y foco inicial en Cancelar.</p>
            </div>
            <button type="button" className="vc-dlg-btn variant-danger" onClick={() => void testDestructiveConfirm()}>
              Probar confirmación crítica
            </button>
          </article>
          <article className="vc-dialog-showcase-card">
            <div>
              <b>
                <Lock size={16} /> Candado por palabra clave
              </b>
              <p>Exige escribir una palabra exacta y marcar la casilla antes de habilitar la acción.</p>
            </div>
            <button type="button" className="vc-dlg-btn variant-outline" onClick={() => void testKeywordLock()}>
              Probar clave de seguridad
            </button>
          </article>
          <article className="vc-dialog-showcase-card">
            <div>
              <b>
                <AlertTriangle size={16} /> Prompt de auditoría
              </b>
              <p>Solicita y valida un motivo obligatorio antes de confirmar anulaciones o ajustes.</p>
            </div>
            <button type="button" className="vc-dlg-btn variant-warning" onClick={() => void testAuditPrompt()}>
              Probar captura de motivo
            </button>
          </article>
          <article className="vc-dialog-showcase-card">
            <div>
              <b>
                <CheckCircle2 size={16} /> Aviso de estado (Alert)
              </b>
              <p>Notificación modal con resumen clave-valor, insignia semántica y cierre por teclado.</p>
            </div>
            <button type="button" className="vc-dlg-btn variant-success" onClick={() => void testSystemAlert()}>
              Probar aviso verificable
            </button>
          </article>
          <article className="vc-dialog-showcase-card">
            <div>
              <b>
                <Sparkles size={16} /> Asistente multipaso (Wizard)
              </b>
              <p>Dialog con indicador de progreso por etapas (DialogStepIndicator) y secciones.</p>
            </div>
            <button
              type="button"
              className="vc-dlg-btn variant-outline"
              onClick={() => {
                setWizardStep(0);
                setWizardOpen(true);
              }}
            >
              Abrir asistente por pasos
            </button>
          </article>
          <article className="vc-dialog-showcase-card">
            <div>
              <b>
                <Info size={16} /> Panel lateral (Sheet)
              </b>
              <p>Variante acoplada al borde derecho para fichas detalladas sin perder el contexto.</p>
            </div>
            <button type="button" className="vc-dlg-btn variant-outline" onClick={() => setSheetOpen(true)}>
              Abrir hoja lateral
            </button>
          </article>
        </div>
      </Dialog>

      <Dialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        eyebrow="COMPLEMENTO MULTIPASO"
        title="Asistente de verificación operativa"
        description="Usa DialogStepIndicator y DialogSection para guiar procesos de varias etapas."
        size="md"
        tone="info"
        magicBorder={true}
        steps={[
          { label: '1. Alcance', status: wizardStep === 0 ? 'active' : 'done' },
          { label: '2. Garantías', status: wizardStep === 1 ? 'active' : wizardStep > 1 ? 'done' : 'pending' },
          { label: '3. Confirmación', status: wizardStep === 2 ? 'active' : 'pending' },
        ]}
        footer={
          <>
            <button
              type="button"
              className="vc-dlg-btn variant-outline"
              onClick={() => (wizardStep > 0 ? setWizardStep((s) => s - 1) : setWizardOpen(false))}
            >
              {wizardStep > 0 ? 'Anterior' : 'Cancelar'}
            </button>
            <button
              type="button"
              className="vc-dlg-btn variant-primary"
              onClick={() => {
                if (wizardStep < 2) setWizardStep((s) => s + 1);
                else {
                  setWizardOpen(false);
                  setLastResult('Recorrido multipaso completado correctamente.');
                }
              }}
            >
              {wizardStep < 2 ? 'Siguiente paso' : 'Finalizar recorrido'}
            </button>
          </>
        }
      >
        <DialogSection
          title={
            wizardStep === 0
              ? 'Verificación de sucursal y ubicación'
              : wizardStep === 1
              ? 'Revisión de garantías de historial'
              : 'Listo para aplicar'
          }
          description="Cada etapa conserva el foco dentro del modal y soporta navegación por teclado."
        >
          <DialogKeyValueList
            items={[
              { label: 'Etapa actual', value: `Paso ${wizardStep + 1} de 3`, tone: 'highlight' },
              { label: 'Movimiento reducido', value: 'Respetado automáticamente' },
              { label: 'Portal DOM', value: 'document.body (sin recortes CSS)' },
            ]}
          />
        </DialogSection>
      </Dialog>

      <Dialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        side="right"
        eyebrow="VISTA LATERAL (SHEET)"
        title="Ficha rápida de inspección"
        description="Ideal para revisar detalles extensos, bitácoras o especificaciones técnicas sin salir de la tabla activa."
        tone="brand"
        footer={
          <button type="button" className="vc-dlg-btn variant-outline" onClick={() => setSheetOpen(false)}>
            Cerrar panel lateral
          </button>
        }
      >
        <DialogSection title="Componentes incluidos en el sistema" description="Preparados para todos los módulos de Visual Corp Suite.">
          <DialogConsequenceList
            title="Complementos listos para usar"
            tone="success"
            items={[
              'Dialog & AlertDialog con portales y trampa de foco WAI-ARIA.',
              'Hooks imperativos useConfirm, useAlert y usePrompt con cola de ejecución.',
              'DialogKeyValueList, DialogConsequenceList, DialogCallout, DialogSection y DialogStepIndicator.',
              'Integración con BorderBeam y SpotlightLayer de Magic UI.',
            ]}
          />
        </DialogSection>
      </Dialog>
    </>
  );
}
