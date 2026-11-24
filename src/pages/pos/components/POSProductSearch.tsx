import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Boxes, CheckCircle2, Link2, Plus, Search, Star, TriangleAlert, X } from 'lucide-react';
import { formatMoney } from '../../../app/workspace';
import { rankPOSProducts, type POSSearchProduct } from '../../../lib/posProductSearch';
import { Kbd } from '../../../components/ui/OperationalKit';

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
  emptyStateTitle, emptyStateDescription, emptyStateAction, resultNoun = 'producto', showInventoryFilters = true,
  inputRef, contextKey,
}: {
  products: T[]; query: string; onQueryChange: (value: string) => void; onChoose: (product: T) => void;
  onEnter: (query: string, highlighted?: T) => void; selectedId: string; disabled: boolean;
  family: string; onFamilyChange: (value: string) => void; families: string[];
  codesByProduct: Record<string, string[]>; stockByProduct: Record<string, string>;
  stockMetaByProduct?: Record<string, POSStockSemanticMeta>;
  renderImage: (product: T) => React.ReactNode;
  favoriteIds?: Set<string>; onToggleFavorite?: (productId: string) => void;
  onQuickAdd?: (product: T) => void;
  emptyStateTitle?: string; emptyStateDescription?: string; emptyStateAction?: React.ReactNode;
  resultNoun?: string; showInventoryFilters?: boolean;
  contextKey: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const listId = useId();
  const inputId = `${listId}-search`;
  const hintId = `${listId}-hint`;
  const countId = `${listId}-count`;
  const localInputRef = useRef<HTMLInputElement>(null);
  const resolvedInputRef = (inputRef as React.RefObject<HTMLInputElement>) || localInputRef;
  const [activeIndex, setActiveIndex] = useState(-1);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'linked'>('all');
  const [filterContextKey, setFilterContextKey] = useState(contextKey);
  const filtersMatchContext = filterContextKey === contextKey;
  const effectiveFavoritesOnly = filtersMatchContext && favoritesOnly;
  const effectiveStockFilter = filtersMatchContext ? stockFilter : 'all';

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
  const favoriteCount = useMemo(() => products.reduce((count, product) => count + Number(favoriteIds.has(product.id)), 0), [products, favoriteIds]);

  const filtered = useMemo(() => rankPOSProducts(
    products.filter((product) => {
      if (family !== 'Todas' && product.family !== family) return false;
      if (effectiveFavoritesOnly && !favoriteIds.has(product.id)) return false;
      if (showInventoryFilters && effectiveStockFilter === 'available' && stockMetaByProduct[product.id]?.tone !== 'available') return false;
      if (showInventoryFilters && effectiveStockFilter === 'linked' && !stockMetaByProduct[product.id]?.linked) return false;
      return true;
    }),
    query,
    codesByProduct,
  ).sort((a, b) => {
    const favoriteRank = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id));
    return favoriteRank || (query.trim() ? 0 : a.name.localeCompare(b.name, 'es'));
  }),
  [products, family, query, codesByProduct, effectiveFavoritesOnly, favoriteIds, effectiveStockFilter, stockMetaByProduct, showInventoryFilters]);

  const visible = filtered.slice(0, 24);
  useEffect(() => {
    setFilterContextKey(contextKey);
    setFavoritesOnly(false);
    setStockFilter('all');
    setActiveIndex(-1);
  }, [contextKey]);
  useEffect(() => setActiveIndex(-1), [query, family, effectiveStockFilter, effectiveFavoritesOnly]);
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
      resolvedInputRef.current?.blur();
    }
  };

  return <div className="pos-product-browser">
    <label htmlFor={inputId}>
      <span>Buscar o escanear SKU</span>
      {!disabled && <span className="pos-search-kbd-hint" title="Atajo para buscar producto"><Kbd>F2</Kbd></span>}
    </label>
    <div className="search-input">
      <Search size={15}/>
      <input
        id={inputId} data-pos-product-search-input="true" ref={resolvedInputRef} type="text" role="searchbox" aria-describedby={`${hintId} ${countId}`}
        value={query} onChange={(event) => onQueryChange(event.target.value)} onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleKeyDown} disabled={disabled} placeholder={disabled ? 'Cargando sucursal…' : 'Nombre, descripción, código PI001 o SKU de inventario · Enter'}
      />
      {query && <button type="button" className="pos-search-clear-btn" aria-label="Limpiar búsqueda de producto" onClick={() => { onQueryChange(''); resolvedInputRef.current?.focus(); }}><X size={14}/></button>}
    </div>

    <div className="pos-filter-pills-row" role="group" aria-label={showInventoryFilters ? 'Filtros rápidos de catálogo e inventario' : 'Filtros rápidos de catálogo'}>
      {onToggleFavorite && <button type="button" className={`pos-favorites-filter${effectiveFavoritesOnly ? ' active' : ''}`} aria-pressed={effectiveFavoritesOnly} onClick={() => { setFilterContextKey(contextKey); setFavoritesOnly(!effectiveFavoritesOnly); setActiveIndex(-1); }}>
        <Star size={13} aria-hidden="true"/> Mis favoritos <span>{favoriteCount}</span>
      </button>}
      {showInventoryFilters&&<>
      <button type="button" className={`pos-stock-filter-pill${effectiveStockFilter === 'all' ? ' active' : ''}`} aria-pressed={effectiveStockFilter === 'all'} onClick={() => { setFilterContextKey(contextKey); setStockFilter('all'); }}>
        <Boxes size={12} aria-hidden="true"/> Todos <span>{products.length}</span>
      </button>
      <button type="button" className={`pos-stock-filter-pill is-available${effectiveStockFilter === 'available' ? ' active' : ''}`} aria-pressed={effectiveStockFilter === 'available'} onClick={() => { setFilterContextKey(contextKey); setStockFilter(effectiveStockFilter === 'available' ? 'all' : 'available'); }}>
        <CheckCircle2 size={12} aria-hidden="true"/> En stock <span>{stockCounts.available}</span>
      </button>
      <button type="button" className={`pos-stock-filter-pill is-linked${effectiveStockFilter === 'linked' ? ' active' : ''}`} aria-pressed={effectiveStockFilter === 'linked'} onClick={() => { setFilterContextKey(contextKey); setStockFilter(effectiveStockFilter === 'linked' ? 'all' : 'linked'); }}>
        <Link2 size={12} aria-hidden="true"/> Con vínculo <span>{stockCounts.linked}</span>
      </button>
      </>}
    </div>

    <label>Familia<select value={family} onChange={(event) => onFamilyChange(event.target.value)}><option>Todas</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label>

    {families.length > 1 && <div className="pos-family-chips" role="group" aria-label="Familias frecuentes">
      <button type="button" className={`pos-family-chip${family === 'Todas' ? ' is-active' : ''}`} onClick={() => onFamilyChange('Todas')}>Todas</button>
      {families.slice(0, 7).map((item) => <button key={item} type="button" className={`pos-family-chip${family === item ? ' is-active' : ''}`} onClick={() => onFamilyChange(family === item ? 'Todas' : item)}>{item}</button>)}
    </div>}

    <small id={hintId} className="pos-scan-hint">Escribe para filtrar. Usa ↑ ↓ y Enter para elegir; el lector de SKU también funciona con Enter.</small>
    <div id={countId} className="pos-catalog-count" aria-live="polite">
      <span>{filtered.length} {resultNoun}{filtered.length === 1 ? '' : 's'} encontrados{filtered.length > 24 ? ' · mostrando los primeros 24' : ''}</span>
      {(family !== 'Todas' || effectiveFavoritesOnly || effectiveStockFilter !== 'all' || query.trim()) && <button type="button" className="pos-reset-filters-btn" onClick={() => { onFamilyChange('Todas'); setFilterContextKey(contextKey); setFavoritesOnly(false); setStockFilter('all'); onQueryChange(''); }}>Restablecer filtros</button>}
    </div>

    {visible.length > 0 ? <div id={`${listId}-results`} className="pos-product-grid" role="list" aria-label={resultNoun === 'servicio' ? 'Servicios encontrados' : 'Productos encontrados'}>
      {visible.map((product, index) => {
        const meta = stockMetaByProduct[product.id];
        const tone = meta?.tone || 'unlinked';
        const stockLabel = meta?.label || stockByProduct[product.id] || 'Existencia sin confirmar';
        const hasConfirmedPrice = Boolean(product.confirmed || product.published);
        const isStarred = favoriteIds.has(product.id);
        return <article key={product.id} id={`${listId}-option-${index}`} role="listitem"
          className={`pos-product-tile${selectedId === product.id ? ' selected' : ''}${activeIndex === index ? ' is-keyboard-active' : ''} tone-${tone}`}
        >
          <button type="button" className="pos-product-tile-main" onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(product)}>
          <span className="pos-product-tile-visual-wrap">
            {renderImage(product)}
          </span>
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
          </span>
          </button>
          {onToggleFavorite && <button
            type="button"
            className={`pos-tile-star-btn${isStarred ? ' is-starred' : ''}`}
            aria-label={isStarred ? `Quitar ${product.name} de mis favoritos` : `Marcar ${product.name} como favorito`}
            aria-pressed={isStarred}
            title={isStarred ? 'Quitar de favoritos' : 'Guardar en favoritos'}
            onClick={() => onToggleFavorite(product.id)}
          >
            <Star size={12} fill={isStarred ? 'currentColor' : 'none'}/>
          </button>}
          <div className="pos-product-tile-footer">
            <strong>{hasConfirmedPrice ? formatMoney(product.price) : 'Precio por confirmar'}</strong>
            {onQuickAdd && hasConfirmedPrice && <button
                type="button"
                className="pos-tile-quick-add"
                title={`Agregar 1 ${product.unit || 'unidad'} de ${product.name} al carrito`}
                aria-label={`Agregar rápido ${product.name}`}
                onClick={() => onQuickAdd(product)}
              >
                <Plus size={12}/> Agregar
              </button>}
          </div>
        </article>;
      })}
    </div> : <div id={`${listId}-results`} className="pos-catalog-empty" role="status"><Search size={19}/><b>{favoritesOnly && products.length > 0 && favoriteCount === 0 ? 'Aún no tienes favoritos en esta modalidad' : products.length ? `No encontramos ${resultNoun}${resultNoun.endsWith('s') ? '' : 's'}` : emptyStateTitle || 'No hay artículos en esta modalidad'}</b><span>{favoritesOnly && products.length > 0 && favoriteCount === 0 ? 'Marca con la estrella los productos o servicios que usas con frecuencia.' : products.length ? `Prueba otras palabras o limpia la búsqueda de ${resultNoun}${resultNoun.endsWith('s') ? '' : 's'}.` : emptyStateDescription || 'Pide a administración que complete el catálogo.'}</span>{!products.length&&emptyStateAction}</div>}
    <span className="sr-only" aria-live="polite" aria-atomic="true">{activeIndex >= 0 && visible[activeIndex] ? `${visible[activeIndex].name}, opción ${activeIndex + 1} de ${visible.length}. Presiona Enter para elegir.` : ''}</span>
  </div>;
}
