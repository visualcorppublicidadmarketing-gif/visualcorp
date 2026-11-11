import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, CircleHelp, ClipboardList, Layers3, ListFilter, RefreshCw, Route, Search, Settings2, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { buildFamilyWorkflowSuggestions, type FamilyWorkflowSuggestion } from '../../lib/productWorkflowRoutes';
import './product-workflow-routes.css';

type WorkflowStep = { key?: string; area?: string; title?: string; depends_on?: string[] };
type WorkflowTemplate = { code: string; name: string; steps: WorkflowStep[]; required_fields: string[] };
type ProductRoute = { id: string; catalog_product_id: string; workflow_code: string; active: boolean };
type RouteFilter = 'all' | 'configured' | 'unassigned';

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const productFamily = (product: any) => String(product.family || product.category || 'General').trim() || 'General';
const fieldLabels: Record<string, string> = {
  width_cm: 'Ancho (cm)', height_cm: 'Alto (cm)', material: 'Material o soporte',
  installation_address: 'Dirección de instalación',
};

export function ProductWorkflowRoutesPage() {
  const { organizationId, hasPermission } = useAuth();
  const { data } = useWorkspace();
  const canManage = hasPermission('sales', 'edit') && hasPermission('workshop', 'edit');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [areaNames, setAreaNames] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<ProductRoute[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [routeFilter, setRouteFilter] = useState<RouteFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkWorkflow, setBulkWorkflow] = useState('');

  const refresh = useCallback(async () => {
    if (!organizationId || !supabase) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [templateResult, routeResult, areaResult] = await Promise.all([
        supabase.from('production_workflow_templates').select('code,name,steps,required_fields').eq('organization_id', organizationId).eq('active', true).order('name'),
        supabase.from('catalog_product_workflow_routes').select('id,catalog_product_id,workflow_code,active').eq('organization_id', organizationId).order('catalog_product_id'),
        supabase.from('areas').select('code,name').eq('organization_id', organizationId).eq('active', true),
      ]);
      if (templateResult.error) throw templateResult.error;
      if (routeResult.error) throw routeResult.error;
      const nextRoutes = (routeResult.data || []) as ProductRoute[];
      setTemplates((templateResult.data || []) as WorkflowTemplate[]);
      setRoutes(nextRoutes);
      if (!areaResult.error) setAreaNames(Object.fromEntries((areaResult.data || []).map((area: any) => [area.code, area.name])));
      setDrafts(Object.fromEntries(nextRoutes.map((route) => [route.catalog_product_id, route.active ? route.workflow_code : ''])));
    } catch (cause: any) { setError(cause?.message || 'No se pudieron cargar las rutas de producción.'); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const products = useMemo(() => [...(data.catalog || [])].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'es')), [data.catalog]);
  const routeByProduct = useMemo(() => new Map(routes.map((route) => [route.catalog_product_id, route])), [routes]);
  const families = useMemo(() => [...new Set(products.map(productFamily))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const activeWorkflowCodes = useMemo(() => new Set(templates.map((template) => template.code)), [templates]);
  const familySuggestions = useMemo(() => buildFamilyWorkflowSuggestions(products, routes, { activeWorkflowCodes }), [products, routes, activeWorkflowCodes]);
  const templateByCode = useMemo(() => new Map(templates.map((template) => [template.code, template])), [templates]);
  const configuredCount = products.filter((product: any) => routeByProduct.get(product.id)?.active).length;
  const unassignedCount = Math.max(products.length - configuredCount, 0);
  const dirtyCount = products.filter((product: any) => (drafts[product.id] ?? (routeByProduct.get(product.id)?.active ? routeByProduct.get(product.id)?.workflow_code : '')) !== (routeByProduct.get(product.id)?.active ? routeByProduct.get(product.id)?.workflow_code : '')).length;

  const visibleProducts = useMemo(() => {
    const needle = normalize(query);
    return products.filter((product: any) => {
      const current = routeByProduct.get(product.id);
      const matchesQuery = !needle || normalize(`${product.name} ${product.sku || ''} ${product.family || product.category || ''} ${product.description || ''}`).includes(needle);
      const matchesFamily = familyFilter === 'all' || productFamily(product) === familyFilter;
      const matchesRoute = routeFilter === 'all' || (routeFilter === 'configured' ? Boolean(current?.active) : !current?.active);
      return matchesQuery && matchesFamily && matchesRoute;
    });
  }, [products, query, familyFilter, routeFilter, routeByProduct]);

  const visibleIds = visibleProducts.map((product: any) => String(product.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedProducts = products.filter((product: any) => selectedIds.has(String(product.id)));
  const actionableFamilySuggestions = useMemo(() => [...familySuggestions.values()].flatMap((suggestion) => {
    const unassignedCount = products.filter((product: any) => productFamily(product) === suggestion.family && !routeByProduct.get(String(product.id))?.active).length;
    return unassignedCount > 0 ? [{ ...suggestion, unassigned_count: unassignedCount }] : [];
  }).sort((a, b) => b.unassigned_count - a.unassigned_count || a.family.localeCompare(b.family, 'es')), [familySuggestions, products, routeByProduct]);

  const prepareFamilySuggestion = (suggestion: FamilyWorkflowSuggestion) => {
    const unassigned = products.filter((product: any) =>
      productFamily(product) === suggestion.family && !routeByProduct.get(String(product.id))?.active,
    );
    if (!unassigned.length) {
      setNotice(`La familia ${suggestion.family} ya tiene una ruta explícita en todos sus productos.`);
      return;
    }
    const ids = unassigned.map((product: any) => String(product.id));
    setDrafts((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, suggestion.workflow_code])) }));
    setSelectedIds(new Set(ids));
    setBulkWorkflow(suggestion.workflow_code);
    setFamilyFilter(suggestion.family);
    setRouteFilter('unassigned');
    setQuery('');
    setNotice(`Preparé la sugerencia “${templateByCode.get(suggestion.workflow_code)?.name || suggestion.workflow_code}” para ${ids.length} productos sin ruta de ${suggestion.family}. Revisa la lista antes de aplicarla.`);
  };

  const toggleVisibleSelection = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const save = async (productId: string) => {
    if (!supabase || !organizationId || !canManage) return;
    const workflow = drafts[productId] || '';
    setSavingId(productId); setError(''); setNotice('');
    try {
      if (workflow) {
        const { error: saveError } = await supabase.from('catalog_product_workflow_routes').upsert({ organization_id: organizationId, catalog_product_id: productId, workflow_code: workflow, active: true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,catalog_product_id' });
        if (saveError) throw saveError;
      } else {
        const existing = routeByProduct.get(productId);
        if (existing?.active) {
          const { error: saveError } = await supabase.from('catalog_product_workflow_routes').update({ active: false, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('organization_id', organizationId);
          if (saveError) throw saveError;
        }
      }
      await refresh();
      setNotice(`Ruta de ${products.find((product: any) => product.id === productId)?.name || 'producto'} guardada. Se sugerirá en las ventas nuevas.`);
    } catch (cause: any) { setError(cause?.message || 'No se pudo guardar la ruta. Tus cambios siguen seleccionados; puedes reintentar.'); }
    finally { setSavingId(''); }
  };

  const saveSelection = async () => {
    if (!supabase || !organizationId || !canManage || !selectedProducts.length) return;
    const timestamp = new Date().toISOString();
    const ids = selectedProducts.map((product: any) => String(product.id));
    const selectedRouteName = templates.find((template) => template.code === bulkWorkflow)?.name;
    setSavingId('bulk'); setError(''); setNotice('');
    try {
      if (bulkWorkflow) {
        const { error: saveError } = await supabase.from('catalog_product_workflow_routes').upsert(ids.map((productId) => ({ organization_id: organizationId, catalog_product_id: productId, workflow_code: bulkWorkflow, active: true, updated_at: timestamp })), { onConflict: 'organization_id,catalog_product_id' });
        if (saveError) throw saveError;
      } else {
        const { error: saveError } = await supabase.from('catalog_product_workflow_routes').update({ active: false, updated_at: timestamp }).eq('organization_id', organizationId).in('catalog_product_id', ids);
        if (saveError) throw saveError;
      }
      await refresh();
      setNotice(bulkWorkflow ? `Ruta “${selectedRouteName || bulkWorkflow}” aplicada a ${ids.length} productos.` : `Ruta predeterminada quitada de ${ids.length} productos.`);
      setSelectedIds(new Set()); setBulkWorkflow('');
    } catch (cause: any) { setError(cause?.message || 'No se pudieron actualizar todos los productos seleccionados. Puedes reintentar.'); }
    finally { setSavingId(''); }
  };

  return <AppFrame area="operations">
    <PageHeading eyebrow="PRODUCCIÓN · CONFIGURACIÓN" title="Rutas por producto" description="Elige el flujo de taller que se recomendará al crear una venta. Puedes actualizar productos juntos y ajustar cada caso por separado." action={<div className="pwr-heading-actions"><Link className="button button-outline" to="/operaciones/flujos"><Settings2 size={15}/> Gestionar flujos</Link><Link className="button button-outline" to="/operaciones/mi-semana"><ArrowLeft size={15}/> Mi semana</Link></div>} />

    <section className="pwr-overview" aria-label="Resumen de asignación de rutas">
      <div className="pwr-overview-copy"><span className="pwr-overview-mark"><Route size={19}/></span><div><h2>Un recorrido claro desde el primer pedido</h2><p>Las rutas ayudan a coordinar ventas con el taller. La recomendación se puede ajustar al revisar cada pedido.</p></div></div>
      <dl className="pwr-metrics">
        <div><dt>Productos</dt><dd>{products.length}</dd></div>
        <div className="is-configured"><dt>Con ruta</dt><dd>{configuredCount}</dd></div>
        <div className="is-pending"><dt>Por definir</dt><dd>{unassignedCount}</dd></div>
        <div><dt>Flujos activos</dt><dd>{templates.length}</dd></div>
      </dl>
    </section>

    {!canManage && <p className="pwr-alert" role="status"><CircleHelp size={17}/> Tienes acceso de consulta. Para editar rutas se requieren permisos de ventas y taller.</p>}
    {error && <p className="pwr-alert" role="alert">{error}<button type="button" className="button button-outline" onClick={() => void refresh()}>Reintentar</button></p>}
    {notice && <p className="pwr-notice" role="status"><Check size={16}/>{notice}</p>}

    <section className="panel pwr-panel" aria-labelledby="pwr-list-title">
      <header className="pwr-panel-heading"><div><span className="pwr-section-icon"><Layers3 size={17}/></span><div><h2 id="pwr-list-title">Configura el recorrido de cada producto</h2><p>Sin una ruta asignada, producción definirá las etapas durante la revisión del pedido.</p></div></div><button type="button" className="button button-outline" onClick={() => void refresh()} disabled={loading || savingId !== ''}><RefreshCw size={15} className={loading ? 'pwr-spin' : ''}/> Actualizar</button></header>

      {templates.length === 0 && !loading && <div className="pwr-flows-warning"><div><strong>Aún no hay flujos disponibles</strong><p>Activa o crea los flujos del taller antes de asignarlos a productos.</p></div><Link className="button button-dark" to="/operaciones/flujos">Abrir flujos y producción</Link></div>}

      <div className="pwr-toolbar">
        <label className="pwr-search"><Search size={17}/><span className="pwr-sr-only">Buscar productos</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, código o familia"/>{query && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery('')}><X size={15}/></button>}</label>
        <label className="pwr-family"><span className="pwr-sr-only">Filtrar por familia</span><select value={familyFilter} onChange={(event) => setFamilyFilter(event.target.value)}><option value="all">Todas las familias</option>{families.map((family) => <option key={family} value={family}>{family}</option>)}</select></label>
      </div>

      <div className="pwr-filter-row" role="group" aria-label="Filtrar por asignación de ruta">
        <span className="pwr-filter-caption"><ListFilter size={15}/> Mostrar</span>
        <button type="button" className={routeFilter === 'all' ? 'is-selected' : ''} aria-pressed={routeFilter === 'all'} onClick={() => setRouteFilter('all')}>Todos <span>{products.length}</span></button>
        <button type="button" className={routeFilter === 'configured' ? 'is-selected' : ''} aria-pressed={routeFilter === 'configured'} onClick={() => setRouteFilter('configured')}>Con ruta <span>{configuredCount}</span></button>
        <button type="button" className={routeFilter === 'unassigned' ? 'is-selected' : ''} aria-pressed={routeFilter === 'unassigned'} onClick={() => setRouteFilter('unassigned')}>Por definir <span>{unassignedCount}</span></button>
        <span className="pwr-result-count">{visibleProducts.length} {visibleProducts.length === 1 ? 'producto' : 'productos'}</span>
      </div>

      {actionableFamilySuggestions.length > 0 && <section className="pwr-suggestions" aria-labelledby="pwr-suggestions-title">
        <div className="pwr-suggestions-heading"><span className="pwr-suggestion-icon"><Sparkles size={16}/></span><div><h3 id="pwr-suggestions-title">Atajos basados en rutas ya confirmadas</h3><p>Solo aparecen familias con al menos 3 productos enrutados y 80% o más de coincidencia. Revisa los productos antes de guardar.</p></div></div>
        <div className="pwr-suggestion-list">
          {actionableFamilySuggestions.map((suggestion) => <article className="pwr-suggestion" key={suggestion.family}>
            <div className="pwr-suggestion-copy"><strong>{suggestion.family}</strong><span>{templateByCode.get(suggestion.workflow_code)?.name || suggestion.workflow_code}</span><small>{suggestion.matching_count} de {suggestion.assigned_count} rutas coinciden · {Math.round(suggestion.confidence * 100)}% · {suggestion.unassigned_count} por completar</small></div>
            <button type="button" className="button button-outline" disabled={!canManage || loading || savingId !== ''} onClick={() => prepareFamilySuggestion(suggestion)}><ClipboardList size={14}/> Revisar sugerencia <ArrowRight size={14}/></button>
          </article>)}
        </div>
      </section>}
      {!loading && actionableFamilySuggestions.length === 0 && <p className="pwr-suggestion-empty"><CircleHelp size={15}/><span>Aún no hay sugerencias por familia: se habilitan al tener 3 rutas explícitas y al menos 80% de coincidencia. Puedes asignar una ruta desde cada selector.</span></p>}

      {selectedIds.size > 0 && <section className="pwr-bulk" aria-label="Asignación en lote"><div className="pwr-bulk-copy"><span className="pwr-bulk-count">{selectedIds.size}</span><div><strong>Productos seleccionados</strong><button type="button" className="pwr-text-action" onClick={() => setSelectedIds(new Set())}>Limpiar selección</button></div></div><label><span className="pwr-sr-only">Ruta para los productos seleccionados</span><select value={bulkWorkflow} onChange={(event) => setBulkWorkflow(event.target.value)} disabled={!canManage || savingId !== ''}><option value="">Sin ruta predeterminada</option>{templates.map((template) => <option key={template.code} value={template.code}>{template.name}</option>)}</select></label><button type="button" className="button button-dark" disabled={!canManage || !templates.length || savingId !== ''} onClick={() => void saveSelection()}>{savingId === 'bulk' ? 'Aplicando…' : 'Aplicar a selección'}</button></section>}

      {loading ? <div className="pwr-loading" role="status"><span/><span/><span/>Cargando productos y rutas…</div> : !products.length ? <div className="pwr-empty"><span className="pwr-empty-icon"><Layers3 size={22}/></span><h3>No hay productos disponibles</h3><p>Cuando el catálogo tenga productos activos, podrás definir aquí sus rutas recomendadas.</p></div> : !visibleProducts.length ? <div className="pwr-empty"><span className="pwr-empty-icon"><Search size={22}/></span><h3>No hay coincidencias</h3><p>Prueba con otro término o quita los filtros para ver todos los productos.</p><button type="button" className="button button-outline" onClick={() => { setQuery(''); setFamilyFilter('all'); setRouteFilter('all'); }}>Limpiar filtros</button></div> : <div className="pwr-list" aria-label="Productos y rutas">
        <div className="pwr-list-top"><label className="pwr-select-visible"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Seleccionar todos los productos visibles"/><span>Seleccionar visibles</span></label><span>Ruta recomendada</span><span>Estado</span><span className="pwr-sr-only">Acciones</span></div>
        {visibleProducts.map((product: any) => {
          const current = routeByProduct.get(product.id);
          const savedWorkflow = current?.active ? current.workflow_code : '';
          const selected = drafts[product.id] ?? savedWorkflow;
          const dirty = selected !== savedWorkflow;
          const routeName = templates.find((template) => template.code === savedWorkflow)?.name || savedWorkflow;
          const selectedTemplate = templateByCode.get(selected);
          const selectedSteps = Array.isArray(selectedTemplate?.steps) ? selectedTemplate.steps : [];
          const rowSaving = savingId === product.id || savingId === 'bulk';
          return <article className={`pwr-item${dirty ? ' is-dirty' : ''}`} key={product.id}>
            <div className="pwr-product-cell"><label className="pwr-checkbox"><input type="checkbox" checked={selectedIds.has(String(product.id))} onChange={(event) => setSelectedIds((value) => { const next = new Set(value); event.target.checked ? next.add(String(product.id)) : next.delete(String(product.id)); return next; })} aria-label={`Seleccionar ${product.name}`}/></label><span className="pwr-product-icon"><Route size={16}/></span><div className="pwr-product-name"><strong>{product.name}</strong><span>{product.family || product.category || 'Producto del catálogo'}{product.sku ? ` · ${product.sku}` : ''}</span></div></div>
            <label className="pwr-route-select"><span className="pwr-sr-only">Ruta recomendada para {product.name}</span><select value={selected} disabled={!canManage || rowSaving || !templates.length} onChange={(event) => setDrafts((value) => ({ ...value, [product.id]: event.target.value }))}><option value="">Sin ruta predeterminada</option>{templates.map((template) => <option key={template.code} value={template.code}>{template.name}</option>)}</select></label>
            <div className="pwr-status-cell">{dirty ? <span className="pwr-status is-pending"><span/>Cambios sin guardar</span> : savedWorkflow ? <span className="pwr-status is-configured"><CheckCheck size={14}/>{routeName}</span> : <span className="pwr-status is-unassigned"><CircleHelp size={14}/>Se define al revisar</span>}</div>
            <div className="pwr-row-actions"><button type="button" className="button button-dark" disabled={!canManage || !dirty || rowSaving} title={!dirty ? 'No hay cambios pendientes' : undefined} onClick={() => void save(String(product.id))}>{savingId === product.id ? 'Guardando…' : 'Guardar ruta'}</button></div>
            {selectedTemplate && <details className="pwr-route-details">
              <summary><ClipboardList size={14}/><span>Ver etapas de <b>{selectedTemplate.name}</b></span><span className="pwr-route-step-count">{selectedSteps.length} {selectedSteps.length === 1 ? 'etapa' : 'etapas'}</span></summary>
              {selectedSteps.length > 0 ? <ol className="pwr-route-steps">{selectedSteps.map((step, index) => {
                const dependencyNames = (step.depends_on || []).map((key) => selectedSteps.find((candidate) => candidate.key === key)?.title || key);
                return <li key={step.key || `${step.area || 'step'}-${index}`}><span className="pwr-step-index">{index + 1}</span><div><strong>{step.title || 'Etapa sin título'}</strong><small>{step.area ? areaNames[step.area] || `Área ${step.area}` : 'Área pendiente'}</small>{dependencyNames.length > 0 && <small className="pwr-step-dependency">Después de {dependencyNames.join(', ')}</small>}</div></li>;
              })}</ol> : <p className="pwr-route-no-steps">{selectedTemplate.code === 'none' ? 'Este producto sigue una ruta directa y no crea etapas de producción.' : 'La ruta enviará el trabajo a revisión para que el equipo defina los pasos necesarios.'}</p>}
              {selectedTemplate.required_fields?.length > 0 && <div className="pwr-route-requirements"><strong>Datos requeridos antes de activar</strong><div>{selectedTemplate.required_fields.map((field) => <span key={field}>{fieldLabels[field] || field.replaceAll('_', ' ')}</span>)}</div></div>}
            </details>}
          </article>;
        })}
      </div>}

      {dirtyCount > 0 && <p className="pwr-unsaved-note"><span/>Hay {dirtyCount} {dirtyCount === 1 ? 'cambio' : 'cambios'} seleccionado{dirtyCount === 1 ? '' : 's'} sin guardar.</p>}
      <footer className="pwr-footnote"><span className="pwr-footnote-icon"><CheckCheck size={15}/></span><p>Las rutas se sugieren en <strong>ventas nuevas</strong>. Cambiarlas aquí no modifica pedidos que ya están en producción.</p></footer>
    </section>
  </AppFrame>;
}

export default ProductWorkflowRoutesPage;
