import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

const menuSelector = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
const nativeContextSelector = 'input, textarea, select, [contenteditable="true"], [data-native-context-menu], .vc-context-menu, .vc-context-anchor';

function isHTMLElement(value: EventTarget | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

type ContextSubmenuProps = {
  action: ContextMenuAction;
  submenuKey: string;
  contextMenuId: string;
  themeClassName: string;
  isOpen: boolean;
  onOpenChange: (key: string, open: boolean) => void;
  cancelClose: () => void;
  scheduleClose: (key: string) => void;
  renderActions: (items: ContextMenuAction[], path: string) => React.ReactNode;
};

function ContextSubmenu({ action, submenuKey, contextMenuId, themeClassName, isOpen, onOpenChange, cancelClose, scheduleClose, renderActions }: ContextSubmenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; side: 'left' | 'right' } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !panelRef.current) return undefined;
    const updatePlacement = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      const size = panel.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const spaceRight = window.innerWidth - anchor.right - margin;
      const spaceLeft = anchor.left - margin;
      const side = spaceRight >= size.width + gap || spaceRight >= spaceLeft ? 'right' : 'left';
      const requestedLeft = side === 'right' ? anchor.right + gap : anchor.left - size.width - gap;
      const requestedTop = anchor.top - 4;
      const left = Math.max(margin, Math.min(requestedLeft, window.innerWidth - size.width - margin));
      const top = Math.max(margin, Math.min(requestedTop, window.innerHeight - size.height - margin));
      setPlacement({ left, top, side });
      if (document.activeElement === trigger) panel.querySelector<HTMLElement>(menuSelector)?.focus();
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    document.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      document.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isOpen]);

  const panel = isOpen && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      className={`vc-context-menu vc-context-submenu-panel ${themeClassName}`.trim()}
      role="menu"
      aria-label={action.label}
      data-vc-context-menu={contextMenuId}
      data-vc-context-submenu-panel="true"
      data-vc-submenu-key={submenuKey}
      data-side={placement?.side || 'right'}
      style={{ left: placement?.left ?? -10000, top: placement?.top ?? -10000, visibility: placement ? 'visible' : 'hidden' }}
      onPointerEnter={cancelClose}
      onPointerLeave={() => scheduleClose(submenuKey)}
      onFocus={cancelClose}
    >
      {renderActions(action.children || [], submenuKey)}
    </div>,
    document.body,
  ) : null;

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="vc-context-submenu-trigger"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-label={`${action.label}, submenú`}
      disabled={action.disabled}
      data-vc-context-menu={contextMenuId}
      data-vc-submenu-trigger={submenuKey}
      onClick={(event) => {
        if (isOpen) { onOpenChange(submenuKey, false); return; }
        if (event.detail === 0) setPlacement(null);
        onOpenChange(submenuKey, true);
      }}
      onPointerEnter={(event) => {
        cancelClose();
        if (event.pointerType !== 'touch' && !action.disabled) onOpenChange(submenuKey, true);
      }}
      onPointerLeave={isOpen ? () => scheduleClose(submenuKey) : undefined}
    >
      {action.icon && <span className="vc-context-action-icon" aria-hidden="true">{action.icon}</span>}
      <span className="vc-context-action-label">{action.label}</span>
      <ChevronRight size={13} aria-hidden="true"/>
    </button>
    {panel}
  </>;
}

/** Shared accessible action menu. Right click is an enhancement; visible triggers remain available on touch. */
export function ContextMenu({ actions, label = 'Más opciones', children, className = '', scope = 'element', trigger = true, displayContents = false }: ContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [revision, setRevision] = useState(0);
  const [activeSubmenuKeys, setActiveSubmenuKeys] = useState<string[]>([]);
  const contextMenuId = useId().replace(/:/g, '');
  const themeClassName = className.split(/\s+/).filter((name) => name === 'vc-context-public-site' || name === 'vc-marketing-context-menu').join(' ');
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const submenuCloseTimerRef = useRef<number | null>(null);
  const longPressRef = useRef<{ x: number; y: number; target: HTMLElement } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const cancelSubmenuClose = () => {
    if (submenuCloseTimerRef.current !== null) window.clearTimeout(submenuCloseTimerRef.current);
    submenuCloseTimerRef.current = null;
  };

  const openSubmenu = (key: string) => {
    const ancestors = key.split('.').reduce<string[]>((path, part) => [...path, path.length ? `${path[path.length - 1]}.${part}` : part], []);
    setActiveSubmenuKeys(ancestors);
  };

  const closeSubmenu = (key: string) => {
    setActiveSubmenuKeys((current) => current.filter((active) => active !== key && !active.startsWith(`${key}.`)));
  };

  const scheduleSubmenuClose = (key: string) => {
    cancelSubmenuClose();
    submenuCloseTimerRef.current = window.setTimeout(() => closeSubmenu(key), 160);
  };

  const show = (x: number, y: number, focusReturn?: HTMLElement | null) => {
    focusReturnRef.current = focusReturn || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    cancelSubmenuClose();
    setPosition({ x, y });
    setActiveSubmenuKeys([]);
    setOpen(true);
    setRevision((current) => current + 1);
  };

  const close = (restoreFocus = true) => {
    cancelSubmenuClose();
    setOpen(false);
    setActiveSubmenuKeys([]);
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

  const renderActions = (items: ContextMenuAction[], path = 'root') => items.map((action, index) => {
    const key = `${path}.${index}`;
    const groupLabel = action.group && (index === 0 || items[index - 1]?.group !== action.group)
      ? <div className="vc-context-group-label" role="presentation">{action.group}</div>
      : null;

    if (action.kind === 'separator') return <React.Fragment key={key}>{groupLabel}<div className="vc-context-separator" role="separator"/></React.Fragment>;
    if (action.kind === 'label') return <React.Fragment key={key}>{groupLabel}<div className="vc-context-group-label" role="presentation">{action.label}</div></React.Fragment>;
    if (action.children?.length) return <React.Fragment key={key}>{groupLabel}<ContextSubmenu action={action} submenuKey={key} contextMenuId={contextMenuId} themeClassName={themeClassName} isOpen={activeSubmenuKeys.includes(key)} onOpenChange={(submenuKey, shouldOpen) => shouldOpen ? openSubmenu(submenuKey) : closeSubmenu(submenuKey)} cancelClose={cancelSubmenuClose} scheduleClose={scheduleSubmenuClose} renderActions={renderActions}/></React.Fragment>;

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
      const ownedMenus = [...document.querySelectorAll<HTMLElement>('[data-vc-context-menu]')]
        .filter((menu) => menu.dataset.vcContextMenu === contextMenuId);
      if (event.composedPath().some((target) => target instanceof HTMLElement && target.dataset.vcContextMenu === contextMenuId)) return;
      // Native scrollbar presses can be reported against the document instead of
      // the scroll container. Keep the menu open when the pointer is still over it.
      for (const menu of ownedMenus) {
        const rect = menu.getBoundingClientRect();
        if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
      }
      close(false);
    };
    const keydown = (event: KeyboardEvent) => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeSubmenu = active?.closest<HTMLElement>('[data-vc-context-submenu-panel="true"]');
      if (event.key === 'Escape') {
        if (activeSubmenu?.dataset.vcContextMenu === contextMenuId) {
          const key = activeSubmenu.dataset.vcSubmenuKey;
          const submenuTrigger = [...document.querySelectorAll<HTMLElement>('[data-vc-submenu-trigger]')]
            .find((item) => item.dataset.vcContextMenu === contextMenuId && item.dataset.vcSubmenuTrigger === key);
          if (submenuTrigger) { event.preventDefault(); closeSubmenu(key || ''); submenuTrigger.focus(); return; }
        }
        event.preventDefault(); close(); return;
      }
      const activeMenu = activeSubmenu?.dataset.vcContextMenu === contextMenuId ? activeSubmenu : menuRef.current;
      const items = [...(activeMenu?.querySelectorAll<HTMLElement>(`${menuSelector}:not([aria-disabled="true"]):not(:disabled)`) || [])];
      const activeIndex = items.indexOf(active as HTMLElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!items.length) return;
        event.preventDefault();
        const next = activeIndex < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (activeIndex + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items[next]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); (event.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
      } else if (event.key === 'ArrowRight' && active?.matches('[data-vc-submenu-trigger]')) {
        event.preventDefault(); active.click();
      } else if (event.key === 'ArrowLeft' && activeSubmenu?.dataset.vcContextMenu === contextMenuId) {
        const key = activeSubmenu.dataset.vcSubmenuKey;
        const submenuTrigger = [...document.querySelectorAll<HTMLElement>('[data-vc-submenu-trigger]')]
          .find((item) => item.dataset.vcContextMenu === contextMenuId && item.dataset.vcSubmenuTrigger === key);
        if (submenuTrigger) { event.preventDefault(); closeSubmenu(key || ''); submenuTrigger.focus(); }
      } else if (event.key === 'Tab') close(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', keydown);
    // The menu is portaled and positioned in viewport coordinates. Focusing its
    // first item with the browser default can scroll the underlying calendar to
    // the portal's document position in dense/scrollable views.
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>(menuSelector)?.focus({ preventScroll: true }));
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
    const updatePlacement = () => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      setPosition((current) => {
        const x = Math.max(margin, Math.min(current.x, viewportWidth - rect.width - margin));
        const spaceBelow = viewportHeight - current.y - margin;
        const spaceAbove = current.y - margin;
        // Keep the menu next to its pointer/trigger. When it cannot fit below,
        // flip it above instead of pinning it to the viewport's bottom edge.
        const y = rect.height <= spaceBelow
          ? current.y
          : rect.height <= spaceAbove
            ? current.y - rect.height
            : spaceBelow >= spaceAbove
              ? margin
              : Math.max(margin, viewportHeight - rect.height - margin);
        return { x, y };
      });
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [open, revision]);

  const menu = open && <div ref={menuRef} data-vc-context-menu={contextMenuId} className={`vc-context-menu ${themeClassName}`.trim()} role="menu" aria-label={label} aria-orientation="vertical" style={{ left: position.x, top: position.y }} onContextMenu={(event) => event.preventDefault()}>{renderActions(actions)}</div>;
  const floatingMenu = menu && typeof document !== 'undefined' ? createPortal(menu, document.body) : menu;
  if (scope === 'document') return <>{floatingMenu}</>;

  return <div ref={rootRef} className={`vc-context-anchor ${displayContents ? 'vc-context-contents' : ''} ${className}`} onContextMenu={handleContextMenu} onKeyDown={handleKeyboardOpen} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress}>
    {children}
    {trigger && <button ref={triggerRef} type="button" className="vc-context-trigger" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); show(rect.right, rect.bottom, event.currentTarget); }}><MoreHorizontal size={16}/></button>}
    {floatingMenu}
  </div>;
}
