import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import './context-menu.css';

export type ContextMenuAction = {
  label: string;
  kind?: 'item' | 'separator' | 'label';
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  group?: string;
  children?: ContextMenuAction[];
};

/** Small accessible action menu available by right click and by the touch-friendly button. */
export function ContextMenu({ actions, label = 'Más opciones', children, className = '' }: {
  actions: ContextMenuAction[]; label?: string; children: React.ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const show = (x: number, y: number) => {
    setPosition({ x: Math.max(8, Math.min(x, window.innerWidth - 230)), y: Math.max(8, Math.min(y, window.innerHeight - 360)) });
    setOpen(true);
  };

  const renderActions = (items: ContextMenuAction[]) => items.map((action, index) => <React.Fragment key={`${action.kind || 'item'}-${action.label}-${index}`}>
    {action.group && (index === 0 || items[index - 1]?.group !== action.group) && <div className="vc-context-group-label" role="presentation">{action.group}</div>}
    {action.kind === 'separator' ? <div className="vc-context-separator" role="separator"/> : action.kind === 'label' ? <div className="vc-context-group-label" role="presentation">{action.label}</div> : action.children?.length ? <details className="vc-context-submenu"><summary>{action.icon && <span aria-hidden="true">{action.icon}</span>}{action.label}<kbd>›</kbd></summary><div role="menu">{renderActions(action.children)}</div></details> : <button type="button" role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={action.checked} disabled={action.disabled} className={action.destructive ? 'is-destructive' : ''} onClick={() => { if (action.checked !== undefined) action.onCheckedChange?.(!action.checked); else action.onSelect(); if (action.checked === undefined) setOpen(false); }}>
      {action.icon && <span aria-hidden="true">{action.icon}</span>}{action.label}{action.shortcut && <kbd>{action.shortcut}</kbd>}
    </button>}
  </React.Fragment>);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const enabled = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
        const active = enabled.indexOf(document.activeElement as HTMLButtonElement);
        enabled[(active + (event.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]?.focus();
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const enabled = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
        (event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1])?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, [open]);

  return <div ref={rootRef} className={`vc-context-anchor ${className}`} onContextMenu={(event) => { event.preventDefault(); show(event.clientX, event.clientY); }}>
    {children}
    <button type="button" className="vc-context-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); show(rect.right, rect.bottom); }}><MoreHorizontal size={16}/></button>
    {open && <div ref={menuRef} className="vc-context-menu" role="menu" style={{ left: position.x, top: position.y }}>
      {renderActions(actions)}
    </div>}
  </div>;
}
