import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { formatMoney } from '../../../app/workspace';
import { rankPOSProducts, type POSSearchProduct } from '../../../lib/posProductSearch';
import { AdvisorProductFavoriteButton } from '../../../components/AdvisorProductFavoriteButton';

export function POSProductSearch<T extends POSSearchProduct>({
  products, query, onQueryChange, onChoose, onEnter, selectedId, disabled, family, onFamilyChange, families,
  codesByProduct, stockByProduct, renderImage, favoriteIds = new Set<string>(), onToggleFavorite,
}: {
  products: T[]; query: string; onQueryChange: (value: string) => void; onChoose: (product: T) => void;
  onEnter: (query: string, highlighted?: T) => void; selectedId: string; disabled: boolean;
  family: string; onFamilyChange: (value: string) => void; families: string[];
  codesByProduct: Record<string, string[]>; stockByProduct: Record<string, string>;
  renderImage: (product: T) => React.ReactNode;
  favoriteIds?: Set<string>; onToggleFavorite?: (productId: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const filtered = useMemo(() => rankPOSProducts(products.filter((product) => (family === 'Todas' || product.family === family) && (!favoritesOnly || favoriteIds.has(product.id))), query, codesByProduct)
    .sort((a, b) => query.trim() ? 0 : Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.name.localeCompare(b.name, 'es')),
  [products, family, query, codesByProduct, favoritesOnly, favoriteIds]);
  const visible = filtered.slice(0, 24);
  useEffect(() => setActiveIndex(-1), [query, family]);
  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visible.length) return;
      setActiveIndex((index) => event.key === 'ArrowDown' ? (index + 1) % visible.length : (index <= 0 ? visible.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!query.trim() && activeIndex < 0) return;
      onEnter(query, activeIndex >= 0 ? visible[activeIndex] : visible[0]);
    } else if (event.key === 'Escape') {
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };
  return <div className="pos-product-browser">
    <label htmlFor="pos-product-search-input">Buscar o escanear SKU</label>
    <div className="search-input"><Search size={15}/><input
      id="pos-product-search-input" ref={inputRef} role="combobox" aria-autocomplete="list"
      aria-expanded={visible.length > 0} aria-controls={`${listId}-results`}
      aria-activedescendant={activeIndex >= 0 && visible[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
      value={query} onChange={(event) => onQueryChange(event.target.value)} onFocus={(event) => event.currentTarget.select()}
      onKeyDown={handleKeyDown} disabled={disabled} placeholder={disabled ? 'Cargando sucursal…' : 'Nombre o código PI001 · Enter'}
    /></div>
    {onToggleFavorite && <button type="button" className={`pos-favorites-filter${favoritesOnly ? ' active' : ''}`} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setActiveIndex(-1); }}><Star size={13} aria-hidden="true"/> Mis productos estrella <span>{favoriteIds.size}</span></button>}
    <label>Familia<select value={family} onChange={(event) => onFamilyChange(event.target.value)}><option>Todas</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label>
    <small className="pos-scan-hint">Escribe para filtrar. Usa ↑ ↓ y Enter para elegir; el lector de SKU también funciona con Enter.</small>
    <div className="pos-catalog-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'producto' : 'productos'} encontrados{filtered.length > 24 ? ' · mostrando los primeros 24' : ''}</div>
    {visible.length > 0 ? <div id={`${listId}-results`} className="pos-product-grid" role="listbox" aria-label="Productos encontrados">
      {visible.map((product, index) => <div key={product.id} id={`${listId}-option-${index}`} role="option" aria-selected={activeIndex === index}
        className={`pos-product-tile${selectedId === product.id ? ' selected' : ''}${activeIndex === index ? ' is-keyboard-active' : ''}`}
        onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(product)}>
        {renderImage(product)}<span className="pos-product-tile-copy"><b>{product.name}</b><small>{product.sku || product.id}{product.family ? ` · ${product.family}` : ''} · {product.unit || 'unidad'}</small><small>{stockByProduct[product.id] || 'Existencia sin confirmar'}</small><strong>{product.confirmed || product.published ? formatMoney(product.price) : 'Precio por confirmar'}</strong></span>
      </div>)}
    </div> : <div id={`${listId}-results`} className="pos-catalog-empty" role="status"><Search size={19}/><b>{favoritesOnly && favoriteIds.size === 0 ? 'Aún no tienes estrellas' : products.length ? 'No encontramos productos' : 'No hay artículos en esta modalidad'}</b><span>{favoritesOnly && favoriteIds.size === 0 ? 'Selecciona un producto y márcalo con la estrella.' : products.length ? 'Prueba otras palabras o cambia la familia.' : 'Pide a administración que complete el catálogo.'}</span></div>}
  </div>;
}
