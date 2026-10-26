import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search, X } from 'lucide-react';
import type { AppNavLink } from '../app/navigation';

type Props = { items: AppNavLink[] };

export function AdminCommandPalette({ items }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    if (!term) return items;
    return items.filter((item) => `${item.label} ${item.to}`.toLocaleLowerCase('es').includes(term));
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  const goToActive = () => {
    const item = results[activeIndex];
    if (!item) return;
    navigate(item.to);
    close();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      goToActive();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="admin-command-trigger"
      aria-label="Buscar páginas del panel"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      onClick={() => setOpen(true)}
    >
      <Search size={15}/><span>Buscar en el panel</span><kbd>Ctrl / ⌘ K</kbd>
    </button>
    {open && <div className="admin-command-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="admin-command-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-command-title">
        <h2 id="admin-command-title" className="admin-command-title">Buscar en Visual Corp Suite</h2>
        <div className="admin-command-search"><Search size={18}/><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} onKeyDown={handleInputKeyDown} placeholder="Busca una sección…" role="combobox" aria-expanded="true" aria-controls="admin-command-results" aria-activedescendant={results[activeIndex] ? `admin-command-option-${activeIndex}` : undefined}/><button type="button" aria-label="Cerrar búsqueda" onClick={close}><X size={17}/></button></div>
        <div className="admin-command-results" id="admin-command-results" role="listbox" aria-label="Páginas disponibles">
          {results.length ? results.map(({ to, label, icon: Icon }, index) => <button id={`admin-command-option-${index}`} key={to} type="button" role="option" aria-selected={index === activeIndex} className={`admin-command-option${index === activeIndex ? ' active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => { navigate(to); close(); }}>
            <span className="admin-command-option-icon"><Icon size={16}/></span><span className="admin-command-option-label"><b>{label}</b><small>{to}</small></span>{index === activeIndex && <span className="admin-command-enter">Ir <CornerDownLeft size={13}/></span>}
          </button>) : <p className="admin-command-empty">No encontré una sección con “{query}”.</p>}
        </div>
        <footer className="admin-command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> cerrar</span></footer>
      </section>
    </div>}
  </>;
}
