import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Check, Image, Search, ShoppingBag, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { SiteAdminNav } from './SiteAdminNav';

type StoreProduct = { id: string; name: string; description: string; category: string | null; sort_order: number; image: string | null; is_published: boolean };
type StoreOverride = { product_id: string; display_name: string | null; display_description: string | null; display_category: string | null; display_image_url: string | null; sort_order: number | null };
type ProductDraft = { name: string; description: string; category: string; image: string; order: string };
const toDraft = (product: StoreProduct): ProductDraft => ({ name: product.name || '', description: product.description || '', category: product.category || '', image: product.image || '', order: String(product.sort_order ?? 0) });

export function StorefrontAdminPage() {
  const { organizationId, user, hasPermission } = useAuth();
  const canEdit = hasPermission('catalog_admin', 'edit');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = products.find((product) => product.id === selectedId) || null;
  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) { setLoading(false); setError('No hay una sesión conectada a la organización.'); return; }
    setLoading(true); setError('');
    try {
      const [{ data: productRows, error: productsError }, { data: overrideRows, error: overridesError }] = await Promise.all([
        supabase.from('public_catalog_products').select('id,name,description,category,sort_order,image,is_published').order('sort_order').limit(500),
        supabase.from('website_product_overrides').select('product_id,display_name,display_description,display_category,display_image_url,sort_order').eq('organization_id', organizationId),
      ]);
      if (productsError) throw productsError;
      if (overridesError) throw overridesError;
      const overrides = new Map<string, StoreOverride>((overrideRows || []).map((row: StoreOverride) => [row.product_id, row]));
      const merged = ((productRows || []) as StoreProduct[]).map((product) => {
        const override = overrides.get(product.id);
        return { ...product, name: override?.display_name || product.name, description: override?.display_description || product.description, category: override?.display_category || product.category, image: override?.display_image_url || product.image, sort_order: override?.sort_order ?? product.sort_order };
      });
      setProducts(merged);
      setSelectedId((current) => merged.some((product) => product.id === current) ? current : merged[0]?.id || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo público.'); }
    finally { setLoading(false); }
  }, [organizationId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setDraft(selected ? toDraft(selected) : null); setNotice(''); }, [selectedId, selected?.name, selected?.description, selected?.category, selected?.image, selected?.sort_order]);
  const filtered = useMemo(() => products.filter((product) => `${product.name} ${product.category || ''}`.toLocaleLowerCase('es').includes(term.trim().toLocaleLowerCase('es'))), [products, term]);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase || !organizationId || !selected || !draft || !canEdit || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const order = Number(draft.order);
      if (!Number.isInteger(order) || order < 0) throw new Error('El orden debe ser un número entero igual o mayor que cero.');
      const values = { organization_id: organizationId, product_id: selected.id, display_name: draft.name.trim() || null, display_description: draft.description.trim() || null, display_category: draft.category.trim() || null, display_image_url: draft.image.trim() || null, sort_order: order, updated_by: user?.id || null, updated_at: new Date().toISOString() };
      const { error: saveError } = await supabase.from('website_product_overrides').upsert(values, { onConflict: 'organization_id,product_id' });
      if (saveError) throw saveError;
      setProducts((current) => current.map((product) => product.id === selected.id ? { ...product, name: values.display_name || selected.name, description: values.display_description || selected.description, category: values.display_category || selected.category, image: values.display_image_url || selected.image, sort_order: order } : product));
      setNotice('Presentación guardada. Las tarifas y datos de cálculo no se modificaron.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la presentación del producto.'); }
    finally { setSaving(false); }
  };
  return <AppFrame area="admin"><PageHeading eyebrow="EDITOR DEL SITIO" title="Tienda" description="Ajusta cómo se presentan los productos en la tienda pública. Las tarifas se administran por separado." action={<Link className="button button-outline" to="/tienda" target="_blank" rel="noreferrer">Abrir tienda pública <ArrowUpRight size={16}/></Link>}/>
    <SiteAdminNav active="/admin/tienda"/>
    {notice && <div className="site-content-notice" role="status"><Check size={15}/>{notice}</div>}
    {error && <div className="op-flow-alert error" role="alert">{error}</div>}
    {!canEdit && <div className="notice-box"><span><ShoppingBag size={17}/></span><div><b>Catálogo en modo de consulta</b><p>Tu perfil puede revisar los productos publicados, pero no tiene el permiso independiente de edición del catálogo.</p></div></div>}
    <div className="store-admin-grid">
      <section className="panel store-admin-list"><div className="panel-heading"><div><span className="eyebrow">PRODUCTOS PÚBLICOS</span><h2>Catálogo visible</h2></div><span className="muted-count">{products.length}</span></div>
        <label className="search-box"><Search size={16}/><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar producto o categoría"/></label>
        {loading ? <div className="empty-state">Cargando tienda…</div> : filtered.length ? <div className="store-admin-items">{filtered.map((product) => <button type="button" key={product.id} onClick={() => setSelectedId(product.id)} className={`store-admin-item${selectedId === product.id ? ' is-selected' : ''}`}><span className="store-admin-thumb">{product.image ? <img src={product.image} alt="" loading="lazy"/> : <Image size={18}/>}</span><span><b>{product.name}</b><small>{product.category || 'Sin categoría'}</small></span></button>)}</div> : <div className="empty-state">No hay productos publicados que coincidan.</div>}
      </section>
      <form className="panel form-panel store-admin-editor" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">PRESENTACIÓN EN LA WEB</span><h2>{selected?.name || 'Selecciona un producto'}</h2></div><ShoppingBag size={19}/></div>
        {!selected || !draft ? <div className="empty-state">Selecciona un producto para editar su presentación.</div> : <>
          <label>Nombre visible<input disabled={!canEdit} maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>
          <label>Descripción<textarea disabled={!canEdit} rows={4} maxLength={700} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
          <label>Categoría visible<input disabled={!canEdit} maxLength={90} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}/></label>
          <label>Imagen (URL)<input disabled={!canEdit} type="url" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} placeholder="https://…"/></label>
          {draft.image && <div className="store-admin-preview"><img src={draft.image} alt={`Vista previa: ${draft.name || selected.name}`} onError={(event) => { event.currentTarget.dataset.failed = 'true'; }}/></div>}
          <label>Orden de aparición<input disabled={!canEdit} type="number" min="0" step="1" value={draft.order} onChange={(event) => setDraft({ ...draft, order: event.target.value })}/></label>
          <p className="field-hint">La tienda consume el catálogo público sincronizado. Esta pantalla solo cambia nombre, descripción, categoría, imagen y orden; no permite crear productos ni alterar precios.</p>
          <button className="button button-dark" type="submit" disabled={!canEdit || saving}><Save size={16}/>{saving ? 'Guardando…' : 'Guardar presentación'}</button>
        </>}
      </form>
    </div>
  </AppFrame>;
}
