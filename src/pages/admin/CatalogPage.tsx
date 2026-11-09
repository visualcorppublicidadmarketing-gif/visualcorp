import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronLeft,
  CircleHelp,
  FileText,
  Grid2X2,
  Layers3,
  List,
  PackageSearch,
  Plus,
  ScanLine,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { formatMoney, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { NumberTicker } from '../../components/ui/MagicComponents';
import { supabase } from '../../lib/supabaseClient';
import { StandardCustomProducts } from './StandardCustomProducts';
import { CatalogProductCode, CatalogProductDetailDialog } from './CatalogProductDetailDialog';
import './catalog-page.css';

type PriceTierDraft = { min_qty: string; normal: string; installation: string; corporate: string };
type PricingDraft = { normal: string; installation: string; corporate: string; tiers: PriceTierDraft[] };
type CatalogView = 'table' | 'cards' | 'list';

const catalogViewOptions: Array<{ id: CatalogView; label: string; Icon: typeof Table2 }> = [
  { id: 'table', label: 'Tabla', Icon: Table2 },
  { id: 'cards', label: 'Tarjetas', Icon: Grid2X2 },
  { id: 'list', label: 'Lista', Icon: List },
];

function makePricingDraft(item: any): PricingDraft {
  return {
    normal: item.price == null ? '' : String(item.price),
    installation: item.installPrice == null ? '' : String(item.installPrice),
    corporate: item.corporatePrice == null ? '' : String(item.corporatePrice),
    tiers: (item.tiers || []).map((tier: any) => ({
      min_qty: String(tier.min_qty ?? tier.qty ?? ''),
      normal: tier.unit_price == null ? '' : String(tier.unit_price),
      installation: tier.install_unit_price == null ? '' : String(tier.install_unit_price),
      corporate: tier.corporate_unit_price == null ? '' : String(tier.corporate_unit_price),
    })),
  };
}

function amount(value: string, required = false) {
  if (!value.trim()) return required ? NaN : null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : NaN;
}

export function CatalogPricingEditor({ item, editable, onSave }: { item: any; editable: boolean; onSave: (draft: PricingDraft) => Promise<boolean> }) {
  const signature = JSON.stringify(makePricingDraft(item));
  const [draft, setDraft] = useState(() => makePricingDraft(item));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(makePricingDraft(item)); setError(''); }, [item.id, signature]);

  const unit = item.mode === 'area' || item.calc_type === 'm2' ? 'm²' : (item.unit || 'unidad');
  const normalizedTiers = draft.tiers.map((tier) => ({
    qty: amount(tier.min_qty, true),
    pvp: amount(tier.normal),
    price_inst: amount(tier.installation),
    price_corp: amount(tier.corporate),
  }));
  const quantities = normalizedTiers.map((tier) => tier.qty);
  const invalidTier = normalizedTiers.some((tier) => !Number.isFinite(tier.qty) || tier.qty! <= 0 || [tier.pvp, tier.price_inst, tier.price_corp].some((price) => Number.isNaN(price)))
    || new Set(quantities).size !== quantities.length;
  const validBase = Number.isFinite(amount(draft.normal, true)) && !Number.isNaN(amount(draft.installation)) && !Number.isNaN(amount(draft.corporate));
  const dirty = signature !== JSON.stringify(draft);

  const setRate = (field: 'normal' | 'installation' | 'corporate', value: string) => { setDraft((current) => ({ ...current, [field]: value })); setSaved(false); setError(''); };
  const setTier = (index: number, field: keyof PriceTierDraft, value: string) => setDraft((current) => ({ ...current, tiers: current.tiers.map((tier, row) => row === index ? { ...tier, [field]: value } : tier) }));
  const addTier = () => {
    const last = Math.max(0, ...draft.tiers.map((tier) => Number(tier.min_qty) || 0));
    setDraft((current) => ({ ...current, tiers: [...current.tiers, { min_qty: String(last + 1), normal: '', installation: '', corporate: '' }] }));
    setSaved(false); setError('');
  };
  const save = async () => {
    if (!validBase || invalidTier) { setError(invalidTier ? 'Revisa los umbrales: deben ser mayores que cero, únicos y con tarifas válidas.' : 'El precio normal debe ser mayor o igual que cero; los otros pueden quedar vacíos.'); return; }
    setSaving(true); setError('');
    try { const ok = await onSave(draft); if (ok) setSaved(true); }
    catch (saveError: any) { setError(saveError?.message || 'No se pudo guardar la lista de precios.'); }
    finally { setSaving(false); }
  };

  const input = (label: string, value: string, onChange: (value: string) => void) => <label className="catalog-rate-field"><span>{label}</span><span className="catalog-rate-input"><span>$</span><input aria-label={`${label} · ${item.name}`} type="number" min="0" step="0.0001" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Sin tarifa" disabled={!editable} /></span></label>;

  return <div className="catalog-pricing-editor">
    <div className="catalog-product-prices">
      {input(`Normal / ${unit}`, draft.normal, (value) => setRate('normal', value))}
      {input(`Con instalación / ${unit}`, draft.installation, (value) => setRate('installation', value))}
      {input(`Corporativo / ${unit}`, draft.corporate, (value) => setRate('corporate', value))}
    </div>
    {editable && <div className="catalog-pricing-actions">
      <details className="catalog-tier-editor"><summary><SlidersHorizontal size={14}/>{draft.tiers.length ? `Editar escalas (${draft.tiers.length})` : `Añadir escalas por ${unit}`}</summary>
        <div className="catalog-tier-help">Define desde qué cantidad o medida aplica cada tarifa. En productos por área, el umbral se mide en m² totales. Deja una tarifa de escala vacía para heredar el precio base de esa modalidad.</div>
        <div className="catalog-tier-table-wrap"><table className="catalog-tier-table"><thead><tr><th>Desde ({unit})</th><th>Normal</th><th>Con instalación</th><th>Corporativo</th><th><span className="sr-only">Quitar escala</span></th></tr></thead><tbody>
          {draft.tiers.map((tier, index) => <tr key={`${item.id}-tier-${index}`}>
            <td><input aria-label={`Cantidad mínima de escala ${index + 1} para ${item.name}`} type="number" min="0.0001" step="any" value={tier.min_qty} onChange={(event) => setTier(index, 'min_qty', event.target.value)} /></td>
            <td><input aria-label={`Precio normal desde ${tier.min_qty} ${unit} para ${item.name}`} type="number" min="0" step="0.0001" value={tier.normal} onChange={(event) => setTier(index, 'normal', event.target.value)} placeholder="Base" /></td>
            <td><input aria-label={`Precio con instalación desde ${tier.min_qty} ${unit} para ${item.name}`} type="number" min="0" step="0.0001" value={tier.installation} onChange={(event) => setTier(index, 'installation', event.target.value)} placeholder="Base" /></td>
            <td><input aria-label={`Precio corporativo desde ${tier.min_qty} ${unit} para ${item.name}`} type="number" min="0" step="0.0001" value={tier.corporate} onChange={(event) => setTier(index, 'corporate', event.target.value)} placeholder="Base" /></td>
            <td><button className="catalog-tier-remove" type="button" aria-label={`Eliminar escala ${index + 1} para ${item.name}`} onClick={() => setDraft((current) => ({ ...current, tiers: current.tiers.filter((_, row) => row !== index) }))}><Trash2 size={14}/></button></td>
          </tr>)}
          {!draft.tiers.length && <tr><td colSpan={5} className="catalog-tier-empty">Todavía no hay escalas. Agrega una para configurar descuentos o modalidades por volumen/medida.</td></tr>}
        </tbody></table></div>
        <button className="catalog-tier-add" type="button" onClick={addTier}><Plus size={14}/> Añadir escala</button>
      </details>
      <button className="rate-save" type="button" disabled={!dirty || !validBase || invalidTier || saving} onClick={save} title="Guardar las tres tarifas y sus escalas">{saving ? 'Guardando…' : saved ? <><Check size={14}/> Guardado</> : <><Check size={14}/> Guardar tarifas</>}</button>
    </div>}
    {!editable && <p className="catalog-rate-inheritance">Las escalas aplican al umbral correspondiente; una celda vacía hereda la tarifa base de su modalidad.</p>}
    {error && <p className="catalog-rate-feedback error" role="alert">{error}</p>}
    {saved && <p className="catalog-rate-feedback success" role="status">Tarifas y escalas guardadas. El catálogo y el cotizador ya usan estos valores.</p>}
  </div>;
}

export function CatalogPage() {
  const { data, update, setData } = useWorkspace();
  const { organizationId, hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('name');
  const [groupByFamily, setGroupByFamily] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [skuStatus, setSkuStatus] = useState<'hidden' | 'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [legacySkuCount, setLegacySkuCount] = useState(0);
  const [skuStatusMessage, setSkuStatusMessage] = useState('');
  const [standardProductsRevision, setStandardProductsRevision] = useState(0);
  const [view, setView] = useState<CatalogView>(() => {
    try { const saved = window.localStorage.getItem('visualcorp.catalog.view.v1'); return catalogViewOptions.some((option) => option.id === saved) ? saved as CatalogView : 'table'; }
    catch { return 'table'; }
  });
  const canEditPrices = hasPermission('catalog_admin', 'edit_prices');
  const canEditProducts = hasPermission('catalog_admin', 'edit');

  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId || !canEditProducts) {
      setSkuStatus('hidden');
      return () => { active = false; };
    }
    setSkuStatus('loading');
    void supabase.from('catalog_products').select('id,sku').eq('organization_id', organizationId).then(({ data: rows, error }) => {
      if (!active) return;
      if (error) {
        setSkuStatusMessage('No se pudo comprobar el estado de los códigos del catálogo.');
        setSkuStatus('error');
        return;
      }
      setLegacySkuCount((rows || []).filter((row) => !/^[A-Z]{2}\d{3,}$/.test(String(row.sku || ''))).length);
      setSkuStatus('ready');
    });
    return () => { active = false; };
  }, [organizationId, canEditProducts]);

  const families = useMemo(() => [...new Set<string>(data.catalog.map((item) => item.family?.trim() || 'General'))].sort((a, b) => a.localeCompare(b, 'es')), [data.catalog]);

  // Information cards for category-first view
  const categoryCards = useMemo(() => {
    return families.map((fam) => {
      const items = data.catalog.filter((item) => (item.family?.trim() || 'General') === fam);
      const sampleItem = items.find((i) => i.image) || items[0];
      const prices = items.map((i) => Number(i.price)).filter((p) => Number.isFinite(p) && p > 0);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const hasArea = items.some((i) => i.mode === 'area' || i.calc_type === 'm2');
      return {
        family: fam,
        count: items.length,
        image: sampleItem?.image || '',
        minPrice,
        unit: hasArea ? 'm²' : (items[0]?.unit || 'u.'),
      };
    });
  }, [data.catalog, families]);

  // Determine if we are in category drilldown, active search, or showing all
  const isSearchActive = search.trim().length > 0;
  const isViewingCategory = selectedFamily !== null;
  const showCategoryGrid = !isSearchActive && !isViewingCategory;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    const matches = data.catalog.filter((item) => {
      const itemFamily = item.family?.trim() || 'General';
      if (selectedFamily && selectedFamily !== 'Todas' && itemFamily !== selectedFamily) {
        return false;
      }
      if (!query) return true;
      return `${item.name} ${item.family} ${item.description || ''} ${item.unit || ''} ${item.sku || item.id || ''}`.toLocaleLowerCase('es').includes(query);
    });

    return matches.sort((a, b) => {
      if (sortBy === 'family') return (a.family || 'General').localeCompare(b.family || 'General', 'es') || a.name.localeCompare(b.name, 'es');
      if (sortBy === 'price-low' || sortBy === 'price-high') {
        const delta = Number(a.price || 0) - Number(b.price || 0);
        return sortBy === 'price-low' ? delta || a.name.localeCompare(b.name, 'es') : -delta || a.name.localeCompare(b.name, 'es');
      }
      return a.name.localeCompare(b.name, 'es');
    });
  }, [data.catalog, search, selectedFamily, sortBy]);

  const grouped = useMemo<Array<[string, any[]]>>(() => {
    if (!groupByFamily) return [['Resultados del catálogo', filtered]];
    const groups = new Map<string, any[]>();
    for (const item of filtered) { const family = item.family?.trim() || 'General'; groups.set(family, [...(groups.get(family) || []), item]); }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [filtered, groupByFamily]);

  const setCatalogView = (next: CatalogView) => { setView(next); try { window.localStorage.setItem('visualcorp.catalog.view.v1', next); } catch { /* Storage can be unavailable in private browsing. */ } };

  const assignShortProductCodes = async () => {
    if (!supabase || !organizationId || !canEditProducts || skuStatus === 'saving') return;
    setSkuStatus('saving');
    setSkuStatusMessage('');
    try {
      const { data: changedCount, error: assignError } = await supabase.rpc('assign_catalog_product_skus');
      if (assignError) throw assignError;
      const { data: rows, error: readError } = await supabase.from('catalog_products').select('id,sku').eq('organization_id', organizationId);
      if (readError) throw readError;
      const skuById = new Map((rows || []).map((row) => [row.id, row.sku]));
      setData((current) => ({ ...current, catalog: current.catalog.map((item) => ({ ...item, sku: skuById.get(item.id) || item.sku })) }));
      setLegacySkuCount((rows || []).filter((row) => !/^[A-Z]{2}\d{3,}$/.test(String(row.sku || ''))).length);
      setStandardProductsRevision((revision) => revision + 1);
      setSkuStatusMessage(`${Number(changedCount) || 0} códigos asignados. El ID interno de cada producto se conservó.`);
      setSkuStatus('ready');
    } catch (error: any) {
      setSkuStatusMessage(error?.message || 'No se pudieron asignar los códigos.');
      setSkuStatus('error');
    }
  };

  const savePricing = async (item: any, draft: PricingDraft) => {
    if (!canEditPrices) throw new Error('Tu perfil no puede editar precios del catálogo.');
    if (!supabase || !organizationId) throw new Error('No hay conexión con el catálogo compartido.');
    const price = amount(draft.normal, true);
    const installPrice = amount(draft.installation);
    const corporatePrice = amount(draft.corporate);
    if (!Number.isFinite(price) || Number.isNaN(installPrice) || Number.isNaN(corporatePrice)) return false;

    const originalScales: any[] = Array.isArray(item.priceScales) ? item.priceScales : [];
    const tierRows = draft.tiers.map((tier) => {
      const qty = amount(tier.min_qty, true)!;
      const old = originalScales.find((scale) => scale.option == null && Number(scale.qty) === qty) || {};
      const pvp = amount(tier.normal);
      const price_inst = amount(tier.installation);
      const price_corp = amount(tier.corporate);
      const next = { ...old, qty, pvp, price_inst, price_corp };
      if (Object.prototype.hasOwnProperty.call(old, 'price') && old.option == null) next.price = pvp;
      return next;
    }).sort((a, b) => a.qty - b.qty);
    const preservedScales = originalScales.filter((scale) => scale.qty == null || scale.option != null);
    const priceScales = [...tierRows, ...preservedScales];
    const { data: savedRow, error } = await supabase.from('catalog_products').update({ price, price_inst: installPrice, price_corp: corporatePrice, price_scales: priceScales, updated_at: new Date().toISOString() }).eq('id', item.id).eq('organization_id', organizationId).select('id').maybeSingle();
    if (error) throw new Error(`No se guardó la tarifa: ${error.message}`);
    if (!savedRow) throw new Error('La base de datos no aceptó el cambio. Comprueba que tu perfil tenga permiso para editar precios.');

    update('catalog', item.id, {
      price, installPrice, corporatePrice, priceScales,
      tiers: tierRows.map((tier) => ({ min_qty: tier.qty, unit_price: tier.pvp, install_unit_price: tier.price_inst, corporate_unit_price: tier.price_corp })),
      confirmed: true,
    });
    return true;
  };

  return <AppFrame area="operations">
    <div className="catalog-page">
      <PageHeading
        eyebrow="CATÁLOGO DE OPERACIONES"
        title="Catálogo de productos y tarifas"
        description="Navega por categorías para gestionar productos, tarifas base (Normal, Instalación, Corporativo) y escalas por cantidad o medida."
        action={<span className="rate-pending"><BadgeCheck size={15}/> {data.catalog.length} productos en catálogo</span>}
      />

      {skuStatus !== 'hidden' && <section className={`catalog-sku-panel panel${legacySkuCount ? ' has-pending' : ''}`} aria-label="Códigos de identificación del catálogo">
        <span className="catalog-sku-panel-icon"><ScanLine size={18}/></span>
        <div className="catalog-sku-panel-copy">
          <b>{skuStatus === 'loading' ? 'Comprobando códigos del catálogo…' : skuStatus === 'saving' ? 'Asignando códigos cortos…' : legacySkuCount ? `${legacySkuCount} productos necesitan un código corto` : 'Códigos de producto listos para buscar y escanear'}</b>
          <span>PI = importados · PS = estándar · PF = físicos · SV = servicios. El código de barras Code 128 se genera automáticamente desde el SKU vigente y se actualiza si cambia.</span>
          {skuStatusMessage && <small className={skuStatus === 'error' ? 'is-error' : 'is-success'} role={skuStatus === 'error' ? 'alert' : 'status'}>{skuStatusMessage}</small>}
        </div>
        {legacySkuCount > 0 && <button className="button button-outline catalog-sku-assign" type="button" disabled={skuStatus === 'saving' || skuStatus === 'loading'} onClick={() => void assignShortProductCodes()}><ScanLine size={15}/> Asignar códigos a {legacySkuCount}</button>}
      </section>}

      <StandardCustomProducts key={standardProductsRevision} editable={canEditProducts} editablePrices={canEditPrices} />

      <section className="catalog-overview" aria-label="Resumen del catálogo">
        <article className="panel"><span><Layers3 size={17}/></span><div><small>FAMILIAS DISPONIBLES</small><b><NumberTicker value={families.length}/></b><small>Categorías organizadas</small></div></article>
        <article className="panel"><span><Grid2X2 size={17}/></span><div><small>{isViewingCategory ? `PRODUCTOS EN ${selectedFamily?.toUpperCase()}` : 'PRODUCTOS REGISTRADOS'}</small><b><NumberTicker value={showCategoryGrid ? data.catalog.length : filtered.length}/></b><small>{showCategoryGrid ? 'Total en 29 familias' : `${filtered.length} de ${data.catalog.length}`}</small></div></article>
        <article className="panel"><span><BadgeCheck size={17}/></span><div><small>MODALIDADES DE TARIFA</small><b>3</b><small>Normal · Instalación · Corporativo</small></div></article>
      </section>

      {/* Main Exploration Section */}
      <section className="catalog-browser panel" aria-label="Exploración por categorías y búsqueda">
        <div className="catalog-toolbar">
          <label className="search-box">
            <Search size={17}/>
            <input
              aria-label="Buscar en el catálogo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={selectedFamily ? `Buscar en ${selectedFamily} o escribe para filtrar…` : "Buscar producto por nombre, SKU, familia o descripción…"}
            />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><X size={16}/></button>}
          </label>
          <div className="catalog-toolbar-actions">
            {!showCategoryGrid && (
              <button
                type="button"
                className="catalog-back-to-categories"
                onClick={() => { setSelectedFamily(null); setSearch(''); }}
              >
                <Layers3 size={14}/> Todas las categorías
              </button>
            )}
            <span><SlidersHorizontal size={14}/>{showCategoryGrid ? `${families.length} categorías` : `${filtered.length} productos`}</span>
          </div>
        </div>

        {/* Category Pills Quick Strip (shown when inside a category or searching) */}
        {!showCategoryGrid && (
          <div className="catalog-family-chips-scroll" role="group" aria-label="Cambiar de categoría">
            <button
              type="button"
              className={selectedFamily === null ? 'active' : ''}
              onClick={() => setSelectedFamily(null)}
            >
              Ver todas <i>{data.catalog.length}</i>
            </button>
            {families.map((fam) => (
              <button
                type="button"
                key={fam}
                className={selectedFamily === fam ? 'active' : ''}
                onClick={() => setSelectedFamily(fam)}
              >
                {fam}
                <i>{data.catalog.filter((i) => (i.family?.trim() || 'General') === fam).length}</i>
              </button>
            ))}
          </div>
        )}

        {/* View Tools & Sorting (visible when viewing products) */}
        {!showCategoryGrid && (
          <div className="catalog-view-tools">
            <label className="catalog-sort">
              Ordenar por
              <select aria-label="Ordenar productos" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="name">Nombre A–Z</option>
                <option value="family">Familia y nombre</option>
                <option value="price-low">Precio: menor primero</option>
                <option value="price-high">Precio: mayor primero</option>
              </select>
            </label>
            <div className="catalog-view-switch" role="group" aria-label="Modo de visualización">
              {catalogViewOptions.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-label={`Vista ${label.toLocaleLowerCase('es')}`}
                  aria-pressed={view === id}
                  className={view === id ? 'active' : ''}
                  onClick={() => setCatalogView(id)}
                >
                  <Icon size={14}/>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <button
              className={`catalog-group-toggle${groupByFamily ? ' active' : ''}`}
              type="button"
              aria-pressed={groupByFamily}
              onClick={() => setGroupByFamily((current) => !current)}
            >
              <Layers3 size={14}/>
              {groupByFamily ? 'Agrupado por familia' : 'Sin agrupar'}
            </button>
          </div>
        )}
      </section>

      {/* 1. CATEGORY GRID VIEW (Default / Category-First Landing) */}
      {showCategoryGrid && (
        <section className="catalog-categories-section" aria-label="Selecciona una categoría">
          <div className="catalog-categories-heading">
            <div className="catalog-categories-heading-copy">
              <span className="eyebrow">NAVEGACIÓN POR CATEGORÍA</span>
              <h3>Explora los productos por familia</h3>
              <p>Selecciona una categoría para ver y editar sus productos y tarifas sin sobrecargar la pantalla.</p>
            </div>
            <button
              type="button"
              className="button button-outline catalog-view-all-btn"
              onClick={() => setSelectedFamily('Todas')}
            >
              <Grid2X2 size={14}/> Ver catálogo completo ({data.catalog.length})
            </button>
          </div>

          <div className="catalog-categories-grid">
            {categoryCards.map((cat) => (
              <button
                key={cat.family}
                type="button"
                className="catalog-category-card"
                onClick={() => setSelectedFamily(cat.family)}
              >
                <div className="catalog-category-thumb">
                  {cat.image ? (
                    <img src={cat.image} alt={cat.family} loading="lazy" />
                  ) : (
                    <Layers3 size={24}/>
                  )}
                </div>
                <div className="catalog-category-info">
                  <div className="catalog-category-name-row">
                    <b>{cat.family}</b>
                    <ArrowRight size={14} className="catalog-category-arrow"/>
                  </div>
                  <div className="catalog-category-meta">
                    <span className="catalog-category-badge">{cat.count} {cat.count === 1 ? 'producto' : 'productos'}</span>
                    {cat.minPrice > 0 && (
                      <span className="catalog-category-price">Desde {formatMoney(cat.minPrice)}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2. CATEGORY DRILLDOWN / SEARCH RESULTS VIEW */}
      {!showCategoryGrid && (
        <>
          {selectedFamily && selectedFamily !== 'Todas' && (
            <div className="catalog-active-family-header">
              <button
                type="button"
                className="catalog-back-button"
                onClick={() => { setSelectedFamily(null); setSearch(''); }}
              >
                <ChevronLeft size={16}/> Volver a categorías
              </button>
              <div className="catalog-active-family-title">
                <span className="catalog-family-icon"><Layers3 size={18}/></span>
                <div>
                  <h2>{selectedFamily}</h2>
                  <small>{filtered.length} {filtered.length === 1 ? 'producto disponible en esta categoría' : 'productos disponibles en esta categoría'}</small>
                </div>
              </div>
            </div>
          )}

          {grouped.length ? grouped.map(([family, items]) => (
            <section className={`panel catalog-family catalog-view-${view}`} key={family}>
              {(groupByFamily || selectedFamily === null || selectedFamily === 'Todas') && (
                <header>
                  <div>
                    <span className="catalog-family-icon"><Layers3 size={17}/></span>
                    <span>
                      <h2>{family}</h2>
                      <small>{items.length} {items.length === 1 ? 'producto' : 'productos'}</small>
                    </span>
                  </div>
                </header>
              )}
              <div className="catalog-products">
                {items.map((item) => (
                  <article className="catalog-product-card" key={item.id}>
                    <div className="catalog-product-identity">
                      <img src={item.image} alt={`Referencia de ${item.name}`} loading="lazy"/>
                      <div className="catalog-product-title-block">
                        <b>{item.name}</b>
                        <small>
                          {item.mode === 'area' ? 'Tarifa por m²' : `Tarifa por ${item.unit || 'unidad'}`}
                          {item.description ? ` · ${item.description}` : ''}
                        </small>
                        <span className="catalog-product-row-actions">
                          <CatalogProductCode value={item.sku || item.id} showBarcode barcodeValue={item.sku || ''}/>
                          <button
                            className="catalog-product-details-button"
                            type="button"
                            onClick={() => setSelectedProduct(item)}
                          >
                            <FileText size={13}/> Ver ficha
                          </button>
                        </span>
                      </div>
                    </div>
                    <CatalogPricingEditor item={item} editable={canEditPrices} onSave={(draft) => savePricing(item, draft)}/>
                  </article>
                ))}
              </div>
            </section>
          )) : (
            <section className="panel catalog-no-results">
              <Search size={23}/>
              <b>No hay productos que coincidan</b>
              <span>{search ? `No encontramos coincidencias para "${search}". Prueba otro término o regresa a las categorías.` : 'Esta categoría no tiene productos disponibles actualmente.'}</span>
              <button
                className="button button-outline"
                type="button"
                onClick={() => { setSearch(''); setSelectedFamily(null); }}
              >
                Volver a todas las categorías
              </button>
            </section>
          )}
        </>
      )}

      <div className="notice-box">
        <span><CircleHelp size={17}/></span>
        <div>
          <b>Cómo editar tarifas y modalidades</b>
          <p>Escribe el precio base normal, con instalación o corporativo y pulsa “Guardar tarifas”. En “Editar escalas” añade umbrales de cantidad o m²; deja en blanco una modalidad de la escala para que herede el precio base. Ningún cambio afecta al cotizador hasta que guardes.</p>
        </div>
      </div>

      <CatalogProductDetailDialog product={selectedProduct} onClose={() => setSelectedProduct(null)}/>
    </div>
  </AppFrame>;
}
