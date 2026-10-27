import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import './context-menu.css';

export type ContextMenuAction = {
  label: string;
  kind?: 'item' | 'separator' | 'label' | 'checkbox' | 'radio';
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  group?: string;
  radioGroup?: string;
  children?: ContextMenuAction[];
};

type ContextMenuProps = {
  actions: ContextMenuAction[];
  label?: string;
  children?: React.ReactNode;
  className?: string;
  scope?: 'element' | 'document';
  trigger?: boolean;
  displayContents?: boolean;
};

const menuSelector = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], .vc-context-submenu > summary';
const nativeContextSelector = 'input, textarea, select, [contenteditable="true"], [data-native-context-menu], .vc-context-menu, .vc-context-anchor';

function isHTMLElement(value: EventTarget | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

/** Shared accessible action menu. Right click is an enhancement; visible triggers remain available on touch. */
export function ContextMenu({ actions, label = 'Más opciones', children, className = '', scope = 'element', trigger = true, displayContents = false }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [revision, setRevision] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const longPressRef = useRef<{ x: number; y: number; target: HTMLElement } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const show = (x: number, y: number, focusReturn?: HTMLElement | null) => {
    focusReturnRef.current = focusReturn || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPosition({ x: Math.max(8, Math.min(x, window.innerWidth - 230)), y: Math.max(8, Math.min(y, window.innerHeight - 260)) });
    setOpen(true);
    setRevision((current) => current + 1);
  };

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => (triggerRef.current || focusReturnRef.current)?.focus?.());
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressRef.current = null;
  };

  const isInsideNativeTarget = (target: EventTarget | null) => isHTMLElement(target) && Boolean(target.closest(nativeContextSelector));

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    show(event.clientX, event.clientY, document.activeElement instanceof HTMLElement ? document.activeElement : null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch' || isInsideNativeTarget(event.target)) return;
    cancelLongPress();
    const target = isHTMLElement(event.target) ? event.target : event.currentTarget;
    longPressRef.current = { x: event.clientX, y: event.clientY, target };
    longPressTimerRef.current = window.setTimeout(() => {
      const press = longPressRef.current;
      if (!press) return;
      show(press.x, press.y, document.activeElement instanceof HTMLElement ? document.activeElement : null);
      longPressRef.current = null;
      longPressTimerRef.current = null;
    }, 560);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (longPressRef.current && Math.hypot(event.clientX - longPressRef.current.x, event.clientY - longPressRef.current.y) > 10) cancelLongPress();
  };

  const handleKeyboardOpen = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    show(rect.left, rect.bottom, event.currentTarget);
  };

  const selectAction = (action: ContextMenuAction) => {
    if (action.disabled) return;
    if (action.kind === 'checkbox' || (action.kind !== 'radio' && action.checked !== undefined)) {
      action.onCheckedChange?.(!action.checked);
      setRevision((current) => current + 1);
      return;
    }
    action.onSelect();
    close();
  };

  const renderActions = (items: ContextMenuAction[]) => items.map((action, index) => {
    const key = `${action.kind || 'item'}-${action.label}-${index}`;
    const groupLabel = action.group && (index === 0 || items[index - 1]?.group !== action.group)
      ? <div className="vc-context-group-label" role="presentation">{action.group}</div>
      : null;

    if (action.kind === 'separator') return <React.Fragment key={key}>{groupLabel}<div className="vc-context-separator" role="separator"/></React.Fragment>;
    if (action.kind === 'label') return <React.Fragment key={key}>{groupLabel}<div className="vc-context-group-label" role="presentation">{action.label}</div></React.Fragment>;
    if (action.children?.length) return <React.Fragment key={key}>{groupLabel}<details className="vc-context-submenu">
      <summary role="menuitem" aria-haspopup="menu" aria-label={`${action.label}, submenú`}><span className="vc-context-action-icon">{action.icon}</span><span className="vc-context-action-label">{action.label}</span><ChevronRight size={13}/></summary>
      <div className="vc-context-submenu-panel" role="menu" aria-label={action.label}>{renderActions(action.children)}</div>
    </details></React.Fragment>;

    const role = action.kind === 'radio' ? 'menuitemradio' : action.kind === 'checkbox' || action.checked !== undefined ? 'menuitemcheckbox' : 'menuitem';
    return <React.Fragment key={key}>{groupLabel}<button type="button" role={role} aria-checked={role === 'menuitem' ? undefined : Boolean(action.checked)} disabled={action.disabled} className={action.destructive ? 'is-destructive' : ''} onClick={() => selectAction(action)}>
      {action.icon && <span className="vc-context-action-icon" aria-hidden="true">{action.icon}</span>}
      <span className="vc-context-action-label">{action.label}</span>
      {action.shortcut && <kbd>{action.shortcut}</kbd>}
      {(role === 'menuitemcheckbox' || role === 'menuitemradio') && <span className="vc-context-check" aria-hidden="true">{action.checked ? '✓' : ''}</span>}
    </button></React.Fragment>;
  });

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      const menu = menuRef.current;
      if (menu && (event.composedPath().includes(menu) || (event.target instanceof Node && menu.contains(event.target)))) return;
      // Native scrollbar presses can be reported against the document instead of
      // the scroll container. Keep the menu open when the pointer is still over it.
      if (menu) {
        const rect = menu.getBoundingClientRect();
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
      }
      close(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(`${menuSelector}:not([aria-disabled="true"]):not(:disabled)`) || [])]
        .filter((item) => !item.closest('details:not([open])'));
      const active = items.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[(active + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); (event.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
      } else if (event.key === 'ArrowRight' && document.activeElement instanceof HTMLElement && document.activeElement.matches('.vc-context-submenu > summary')) {
        event.preventDefault(); const submenu = document.activeElement.parentElement as HTMLDetailsElement; submenu.open = true; submenu.querySelector<HTMLElement>(menuSelector)?.focus();
      } else if (event.key === 'ArrowLeft' && document.activeElement instanceof HTMLElement) {
        const submenu = document.activeElement.closest('details[open]') as HTMLDetailsElement | null;
        if (submenu) { event.preventDefault(); submenu.open = false; submenu.querySelector('summary')?.focus(); }
      } else if (event.key === 'Tab') close(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', keydown);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>(menuSelector)?.focus());
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', keydown);
    };
  }, [open]);

  useEffect(() => {
    if (scope !== 'document' || !actions.length) return undefined;
    const context = (event: MouseEvent) => {
      if (event.defaultPrevented || isInsideNativeTarget(event.target)) return;
      event.preventDefault(); show(event.clientX, event.clientY, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) || event.defaultPrevented || isInsideNativeTarget(event.target)) return;
      if (!isHTMLElement(event.target) || event.target === document.body) return;
      event.preventDefault(); const rect = event.target.getBoundingClientRect(); show(rect.left, rect.bottom, event.target);
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || isInsideNativeTarget(event.target)) return;
      cancelLongPress();
      const target = isHTMLElement(event.target) ? event.target : document.body;
      longPressRef.current = { x: event.clientX, y: event.clientY, target };
      longPressTimerRef.current = window.setTimeout(() => {
        const press = longPressRef.current;
        if (press) show(press.x, press.y, document.activeElement instanceof HTMLElement ? document.activeElement : null);
        longPressRef.current = null; longPressTimerRef.current = null;
      }, 560);
    };
    const pointerMove = (event: PointerEvent) => { if (longPressRef.current && Math.hypot(event.clientX - longPressRef.current.x, event.clientY - longPressRef.current.y) > 10) cancelLongPress(); };
    const pointerUp = () => cancelLongPress();
    window.addEventListener('contextmenu', context);
    window.addEventListener('keydown', keydown);
    window.addEventListener('pointerdown', pointerDown, { passive: true });
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('pointerup', pointerUp, { passive: true });
    window.addEventListener('pointercancel', pointerUp, { passive: true });
    return () => {
      cancelLongPress();
      window.removeEventListener('contextmenu', context);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
    };
  }, [scope, actions]);

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setPosition((current) => ({ x: Math.max(8, Math.min(current.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(current.y, window.innerHeight - rect.height - 8)) }));
  }, [open, revision]);

  const menu = open && <div ref={menuRef} className={`vc-context-menu ${className}`.trim()} role="menu" aria-label={label} aria-orientation="vertical" style={{ left: position.x, top: position.y }} onContextMenu={(event) => event.preventDefault()}>{renderActions(actions)}</div>;
  const floatingMenu = menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu;
  if (scope === 'document') return <>{floatingMenu}</>;

  return <div ref={rootRef} className={`vc-context-anchor ${displayContents ? 'vc-context-contents' : ''} ${className}`} onContextMenu={handleContextMenu} onKeyDown={handleKeyboardOpen} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress}>
    {children}
    {trigger && <button ref={triggerRef} type="button" className="vc-context-trigger" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); show(rect.right, rect.bottom, event.currentTarget); }}><MoreHorizontal size={16}/></button>}
    {floatingMenu}
  </div>;
}
