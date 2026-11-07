import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Boxes, CheckCircle2, Link2, Plus, Search, Star, TriangleAlert, X } from 'lucide-react';
import { formatMoney } from '../../../app/workspace';
import { rankPOSProducts, type POSSearchProduct } from '../../../lib/posProductSearch';

export type POSStockSemanticMeta = {
  tone: 'available' | 'low' | 'shortage' | 'unlinked';
  label: string;
  shortLabel?: string;
  availableQuantity?: number | null;
  unit?: string;
  locationCode?: string;
  linked?: boolean;
};

export function POSProductSearch<T extends POSSearchProduct>({
  products, query, onQueryChange, onChoose, onEnter, selectedId, disabled, family, onFamilyChange, families,
  codesByProduct, stockByProduct, stockMetaByProduct = {}, renderImage, favoriteIds = new Set<string>(), onToggleFavorite, onQuickAdd,
}: {
  products: T[]; query: string; onQueryChange: (value: string) => void; onChoose: (product: T) => void;
  onEnter: (query: string, highlighted?: T) => void; selectedId: string; disabled: boolean;
  family: string; onFamilyChange: (value: string) => void; families: string[];
  codesByProduct: Record<string, string[]>; stockByProduct: Record<string, string>;
  stockMetaByProduct?: Record<string, POSStockSemanticMeta>;
  renderImage: (product: T) => React.ReactNode;
  favoriteIds?: Set<string>; onToggleFavorite?: (productId: string) => void;
  onQuickAdd?: (product: T) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'linked'>('all');

  const stockCounts = useMemo(() => {
    let available = 0;
    let linked = 0;
    for (const product of products) {
      const meta = stockMetaByProduct[product.id];
      if (meta?.tone === 'available') available += 1;
      if (meta?.linked) linked += 1;
    }
    return { available, linked };
  }, [products, stockMetaByProduct]);

  const filtered = useMemo(() => rankPOSProducts(
    products.filter((product) => {
      if (family !== 'Todas' && product.family !== family) return false;
      if (favoritesOnly && !favoriteIds.has(product.id)) return false;
      if (stockFilter === 'available' && stockMetaByProduct[product.id]?.tone !== 'available') return false;
      if (stockFilter === 'linked' && !stockMetaByProduct[product.id]?.linked) return false;
      return true;
    }),
    query,
    codesByProduct,
  ).sort((a, b) => query.trim() ? 0 : Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id)) || a.name.localeCompare(b.name, 'es')),
  [products, family, query, codesByProduct, favoritesOnly, favoriteIds, stockFilter, stockMetaByProduct]);

  const visible = filtered.slice(0, 24);
  useEffect(() => setActiveIndex(-1), [query, family, stockFilter, favoritesOnly]);
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
    <div className="search-input">
      <Search size={15}/>
      <input
        id="pos-product-search-input" ref={inputRef} role="combobox" aria-autocomplete="list"
        aria-expanded={visible.length > 0} aria-controls={`${listId}-results`}
        aria-activedescendant={activeIndex >= 0 && visible[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
        value={query} onChange={(event) => onQueryChange(event.target.value)} onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleKeyDown} disabled={disabled} placeholder={disabled ? 'Cargando sucursal…' : 'Nombre, código PI001 o SKU de inventario · Enter'}
      />
      {query && <button type="button" className="pos-search-clear-btn" aria-label="Limpiar búsqueda de producto" onClick={() => { onQueryChange(''); inputRef.current?.focus(); }}><X size={14}/></button>}
    </div>

    <div className="pos-filter-pills-row" role="group" aria-label="Filtros rápidos de catálogo e inventario">
      {onToggleFavorite && <button type="button" className={`pos-favorites-filter${favoritesOnly ? ' active' : ''}`} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setActiveIndex(-1); }}>
        <Star size={13} aria-hidden="true"/> Mis productos estrella <span>{favoriteIds.size}</span>
      </button>}
      <button type="button" className={`pos-stock-filter-pill${stockFilter === 'all' ? ' active' : ''}`} aria-pressed={stockFilter === 'all'} onClick={() => setStockFilter('all')}>
        <Boxes size={12} aria-hidden="true"/> Todos <span>{products.length}</span>
      </button>
      <button type="button" className={`pos-stock-filter-pill is-available${stockFilter === 'available' ? ' active' : ''}`} aria-pressed={stockFilter === 'available'} onClick={() => setStockFilter((curr) => curr === 'available' ? 'all' : 'available')}>
        <CheckCircle2 size={12} aria-hidden="true"/> En stock <span>{stockCounts.available}</span>
      </button>
      <button type="button" className={`pos-stock-filter-pill is-linked${stockFilter === 'linked' ? ' active' : ''}`} aria-pressed={stockFilter === 'linked'} onClick={() => setStockFilter((curr) => curr === 'linked' ? 'all' : 'linked')}>
        <Link2 size={12} aria-hidden="true"/> Con vínculo <span>{stockCounts.linked}</span>
      </button>
    </div>

    <label>Familia<select value={family} onChange={(event) => onFamilyChange(event.target.value)}><option>Todas</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label>

    {families.length > 1 && <div className="pos-family-chips" role="group" aria-label="Familias frecuentes">
      <button type="button" className={`pos-family-chip${family === 'Todas' ? ' is-active' : ''}`} onClick={() => onFamilyChange('Todas')}>Todas</button>
      {families.slice(0, 7).map((item) => <button key={item} type="button" className={`pos-family-chip${family === item ? ' is-active' : ''}`} onClick={() => onFamilyChange(family === item ? 'Todas' : item)}>{item}</button>)}
    </div>}

    <small className="pos-scan-hint">Escribe para filtrar. Usa ↑ ↓ y Enter para elegir; el lector de SKU también funciona con Enter.</small>
    <div className="pos-catalog-count" aria-live="polite">
      <span>{filtered.length} {filtered.length === 1 ? 'producto' : 'productos'} encontrados{filtered.length > 24 ? ' · mostrando los primeros 24' : ''}</span>
      {(family !== 'Todas' || favoritesOnly || stockFilter !== 'all' || query.trim()) && <button type="button" className="pos-reset-filters-btn" onClick={() => { onFamilyChange('Todas'); setFavoritesOnly(false); setStockFilter('all'); onQueryChange(''); }}>Restablecer filtros</button>}
    </div>

    {visible.length > 0 ? <div id={`${listId}-results`} className="pos-product-grid" role="listbox" aria-label="Productos encontrados">
      {visible.map((product, index) => {
        const meta = stockMetaByProduct[product.id];
        const tone = meta?.tone || 'unlinked';
        const stockLabel = meta?.label || stockByProduct[product.id] || 'Existencia sin confirmar';
        const hasConfirmedPrice = Boolean(product.confirmed || product.published);
        const isStarred = favoriteIds.has(product.id);
        return <div key={product.id} id={`${listId}-option-${index}`} role="option" aria-selected={activeIndex === index}
          className={`pos-product-tile${selectedId === product.id ? ' selected' : ''}${activeIndex === index ? ' is-keyboard-active' : ''} tone-${tone}`}
          onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(product)}>
          <div className="pos-product-tile-visual-wrap">
            {renderImage(product)}
            {onToggleFavorite && <button
              type="button"
              className={`pos-tile-star-btn${isStarred ? ' is-starred' : ''}`}
              aria-label={isStarred ? `Quitar ${product.name} de productos estrella` : `Marcar ${product.name} como producto estrella`}
              title={isStarred ? 'Producto estrella' : 'Guardar en favoritos'}
              onClick={(event) => { event.stopPropagation(); onToggleFavorite(product.id); }}
            >
              <Star size={12} fill={isStarred ? 'currentColor' : 'none'}/>
            </button>}
          </div>
          <span className="pos-product-tile-copy">
            <b>{product.name}</b>
            <small className="pos-product-tile-meta">
              <span className="pos-sku-chip">{product.sku || product.id}</span>
              {product.family ? ` · ${product.family}` : ''} · {product.unit || 'unidad'}
              {meta?.locationCode ? ` · Ubic. ${meta.locationCode}` : ''}
            </small>
            <small className={`pos-stock-pill is-${tone}`}>
              {tone === 'available' ? <CheckCircle2 size={11} aria-hidden="true"/> : tone === 'low' || tone === 'shortage' ? <TriangleAlert size={11} aria-hidden="true"/> : <Boxes size={11} aria-hidden="true"/>}
              <span>{stockLabel}</span>
            </small>
            <span className="pos-product-tile-footer">
              <strong>{hasConfirmedPrice ? formatMoney(product.price) : 'Precio por confirmar'}</strong>
              {onQuickAdd && hasConfirmedPrice && <button
                type="button"
                className="pos-tile-quick-add"
                title={`Agregar 1 ${product.unit || 'unidad'} de ${product.name} al carrito`}
                aria-label={`Agregar rápido ${product.name}`}
                onClick={(event) => { event.stopPropagation(); onQuickAdd(product); }}
              >
                <Plus size={12}/> Agregar
              </button>}
            </span>
          </span>
        </div>;
      })}
    </div> : <div id={`${listId}-results`} className="pos-catalog-empty" role="status"><Search size={19}/><b>{favoritesOnly && favoriteIds.size === 0 ? 'Aún no tienes estrellas' : products.length ? 'No encontramos productos' : 'No hay artículos en esta modalidad'}</b><span>{favoritesOnly && favoriteIds.size === 0 ? 'Selecciona un producto y márcalo con la estrella.' : products.length ? 'Prueba otras palabras, cambia la familia o limpia los filtros de stock.' : 'Pide a administración que complete el catálogo.'}</span></div>}
  </div>;
}
