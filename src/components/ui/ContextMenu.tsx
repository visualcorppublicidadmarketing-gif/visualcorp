import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import './context-menu.css';

export type ContextMenuAction = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
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
    setPosition({ x: Math.min(x, window.innerWidth - 230), y: Math.min(y, window.innerHeight - 260) });
    setOpen(true);
  };

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
      {actions.map((action) => <button type="button" role="menuitem" key={action.label} disabled={action.disabled} className={action.destructive ? 'is-destructive' : ''} onClick={() => { setOpen(false); action.onSelect(); }}>
        {action.icon && <span aria-hidden="true">{action.icon}</span>}{action.label}
      </button>)}
    </div>}
  </div>;
}
