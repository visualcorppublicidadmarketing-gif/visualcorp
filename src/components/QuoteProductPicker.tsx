import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Shapes, X } from 'lucide-react';
import './quote-product-picker.css';

type Product = {
  id: string;
  name: string;
  family: string;
  description?: string;
  image?: string;
  unit?: string;
  mode?: string;
  confirmed?: boolean;
};

type Props = {
  products: Product[];
  selected: Product | undefined;
  onSelect: (product: Product | null) => void;
  idPrefix?: string;
};

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function QuoteProductPicker({ products, selected, onSelect, idPrefix }: Props) {
  const generatedId = useId().replace(/:/g, '');
  const pickerId = idPrefix || `quote-product-${generatedId}`;
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const families = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => counts.set(product.family || 'General', (counts.get(product.family || 'General') || 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  }, [products]);
  const results = useMemo(() => {
    const normalizedQuery = normalize(query);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return products.map((product, originalIndex) => {
      const searchable = normalize(`${product.name} ${product.family} ${product.description || ''} ${product.id}`);
      const words = tokens.map((token) => ({
        token,
        rank: normalize(product.name) === token ? 0 : normalize(product.name).startsWith(token) ? 1 : normalize(product.family).startsWith(token) ? 2 : searchable.includes(token) ? 3 : 99,
      }));
      const matches = tokens.length === 0 || words.every((word) => word.rank < 99);
      const familyMatches = !family || (product.family || 'General') === family;
      return { product, originalIndex, matches: matches && familyMatches, rank: words.reduce((sum, word) => sum + word.rank, 0) };
    }).filter((entry) => entry.matches)
      .sort((a, b) => a.rank - b.rank || a.originalIndex - b.originalIndex)
      .map((entry) => entry.product);
  }, [products, query, family]);
  const visible = results.slice(0, showAll ? results.length : 8);
  const activeProductId = visible[activeIndex]?.id;

  useEffect(() => {
    if (open && activeProductId) document.getElementById(`${pickerId}-option-${activeProductId}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeProductId, open, pickerId]);

  const choose = (product: Product | null) => {
    onSelect(product);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    setShowAll(false);
    if (!product) requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current < 0 ? 0 : current + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current < 0 ? Math.max(visible.length - 1, 0) : Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && visible[activeIndex]) {
      event.preventDefault();
      choose(visible[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return <div className="quote-product-picker">
    <label htmlFor={`${pickerId}-search`}>Busca un producto</label>
    {selected ? <div className="quote-product-chosen">
      {selected.image && <img src={selected.image} alt="" loading="lazy"/>}
      <span><b>{selected.name}</b><small>{selected.family} · {selected.mode === 'area' ? 'Se calcula por área' : selected.unit || 'unidad'} · {selected.confirmed ? 'Tarifa confirmada' : 'Tarifa por validar'}</small></span>
      <button type="button" onClick={() => choose(null)} aria-label="Cambiar producto">Cambiar</button>
    </div> : <div className="quote-product-search-shell">
      <div className="quote-product-search-box">
        <Search size={17} aria-hidden="true"/>
        <input ref={inputRef} id={`${pickerId}-search`} role="combobox" aria-expanded={open} aria-controls={`${pickerId}-results`} aria-activedescendant={open && activeIndex >= 0 && visible[activeIndex] ? `${pickerId}-option-${visible[activeIndex].id}` : undefined} aria-autocomplete="list" autoComplete="off" value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setShowAll(false); setOpen(true); }} onKeyDown={handleKeyDown} onBlur={(event) => { if (!event.currentTarget.parentElement?.parentElement?.contains(event.relatedTarget as Node | null)) setOpen(false); }} placeholder="Ej. lona premium, camiseta, impresión…"/>
        {query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setQuery(''); setActiveIndex(-1); setShowAll(false); inputRef.current?.focus(); }}><X size={15}/></button>}
        <ChevronDown size={15} aria-hidden="true"/>
      </div>
      <small className="quote-product-hint">Busca por nombre, familia o descripción. No necesitas escribir el nombre completo.</small>
      {open && <div className="quote-product-results">
        <div className="quote-product-results-top"><span>{results.length} {results.length === 1 ? 'resultado' : 'resultados'}</span><span>{products.length} productos en catálogo</span></div>
        <div className="quote-family-filters" aria-label="Filtrar por familia">
          <button type="button" className={!family ? 'active' : ''} onPointerDown={(event) => event.preventDefault()} onClick={() => { setFamily(''); setActiveIndex(-1); }}>Todas</button>
          {families.slice(0, 5).map(([name]) => <button type="button" key={name} className={family === name ? 'active' : ''} onPointerDown={(event) => event.preventDefault()} onClick={() => { setFamily(family === name ? '' : name); setActiveIndex(-1); }}>{name}</button>)}
          {families.length > 5 && <details className="quote-more-families"><summary aria-label="Ver más familias"><Shapes size={14}/></summary><div>{families.slice(5).map(([name, count]) => <button type="button" key={name} className={family === name ? 'active' : ''} onPointerDown={(event) => event.preventDefault()} onClick={() => { setFamily(family === name ? '' : name); setActiveIndex(-1); }}>{name}<small>{count}</small></button>)}</div></details>}
        </div>
        <div className="quote-product-options" id={`${pickerId}-results`} role="listbox" aria-label="Productos del catálogo">
          {visible.map((product, index) => <button id={`${pickerId}-option-${product.id}`} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : ''} key={product.id} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(product)}>
            {product.image ? <img src={product.image} alt="" loading="lazy"/> : <span className="quote-product-placeholder"><Shapes size={17}/></span>}
            <span className="quote-product-option-copy"><b>{product.name}</b><small>{product.family} · {product.mode === 'area' ? 'Por área' : product.unit || 'unidad'}</small></span>
            <span className={`quote-product-status ${product.confirmed ? 'confirmed' : ''}`}>{product.confirmed ? <><Check size={12}/> Tarifa lista</> : 'Por validar'}</span>
          </button>)}
          {results.length === 0 && <p className="quote-product-empty">No encontramos ese producto. Prueba con menos palabras o elige otra familia.</p>}
          {results.length > visible.length && <button type="button" className="quote-product-more" onPointerDown={(event) => event.preventDefault()} onClick={() => setShowAll(true)}>Ver más resultados ({results.length - visible.length})</button>}
        </div>
      </div>}
    </div>}
  </div>;
}
