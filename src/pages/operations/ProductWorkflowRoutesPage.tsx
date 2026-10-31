import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, RefreshCw, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppFrame, PageHeading } from '../../app/layout';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import './commercial-controls.css';

type WorkflowTemplate = { code: string; name: string };
type ProductRoute = { id: string; catalog_product_id: string; workflow_code: string; active: boolean };

export function ProductWorkflowRoutesPage() {
  const { organizationId, hasPermission } = useAuth();
  const { data } = useWorkspace();
  const canManage = hasPermission('sales', 'edit') && hasPermission('workshop', 'edit');
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [routes, setRoutes] = useState<ProductRoute[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!organizationId || !supabase) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [templateResult, routeResult] = await Promise.all([
        supabase.from('production_workflow_templates').select('code,name').eq('organization_id', organizationId).eq('active', true).order('name'),
        supabase.from('catalog_product_workflow_routes').select('id,catalog_product_id,workflow_code,active').eq('organization_id', organizationId).order('catalog_product_id'),
      ]);
      if (templateResult.error) throw templateResult.error;
      if (routeResult.error) throw routeResult.error;
      const nextRoutes = (routeResult.data || []) as ProductRoute[];
      setTemplates((templateResult.data || []) as WorkflowTemplate[]);
      setRoutes(nextRoutes);
      setDrafts(Object.fromEntries(nextRoutes.map((route) => [route.catalog_product_id, route.active ? route.workflow_code : ''])));
    } catch (cause: any) { setError(cause?.message || 'No se pudieron cargar las rutas de producción.'); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const products = useMemo(() => [...(data.catalog || [])].sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), 'es')), [data.catalog]);

  const save = async (productId: string) => {
    if (!supabase || !organizationId || !canManage) return;
    const workflow = drafts[productId] || '';
    setSavingId(productId); setError(''); setNotice('');
    try {
      if (workflow) {
        const { error: saveError } = await supabase.from('catalog_product_workflow_routes').upsert({ organization_id: organizationId, catalog_product_id: productId, workflow_code: workflow, active: true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,catalog_product_id' });
        if (saveError) throw saveError;
      } else {
        const existing = routes.find((route) => route.catalog_product_id === productId);
        if (existing?.active) {
          const { error: saveError } = await supabase.from('catalog_product_workflow_routes').update({ active: false, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('organization_id', organizationId);
          if (saveError) throw saveError;
        }
      }
      await refresh();
      setNotice(`Ruta de ${products.find((product: any) => product.id === productId)?.name || 'producto'} guardada. Las nuevas ventas usarán esta recomendación.`);
    } catch (cause: any) { setError(cause?.message || 'No se pudo guardar la ruta. Tus cambios siguen seleccionados; puedes reintentar.'); }
    finally { setSavingId(''); }
  };

  const routeByProduct = new Map(routes.map((route) => [route.catalog_product_id, route]));
  return <AppFrame area="operations">
    <PageHeading eyebrow="PRODUCCIÓN · CONFIGURACIÓN" title="Rutas por producto" description="Define qué áreas de trabajo se sugieren al vender cada producto. Esta configuración aplica a ventas nuevas; no cambia órdenes que ya están en curso." action={<Link className="button button-outline" to="/operaciones/mi-semana"><ArrowLeft size={15}/> Mi semana</Link>} />
    {!canManage && <p className="pwr-alert" role="status">Tienes acceso de consulta. Para modificar rutas se requieren permisos de edición de ventas y taller.</p>}
    {error && <p className="pwr-alert" role="alert">{error} <button type="button" className="button button-outline" onClick={() => void refresh()}>Reintentar</button></p>}
    {notice && <p className="pwr-notice" role="status"><Check size={16}/>{notice}</p>}
    <section className="panel pwr-panel">
      <div className="panel-heading"><div><span className="eyebrow">CATÁLOGO Y RECORRIDOS</span><h2>Ruta sugerida para cada producto</h2><p>Si eliges “Sin ruta predeterminada”, el equipo definirá el recorrido al revisar el pedido.</p></div><button type="button" className="button button-outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15}/> Actualizar</button></div>
      {loading ? <p className="pwr-empty" role="status">Cargando productos y rutas…</p> : !products.length ? <p className="pwr-empty">No hay productos activos disponibles en el catálogo.</p> : <div className="pwr-table-wrap"><table><thead><tr><th>Producto o servicio</th><th>Ruta predeterminada</th><th>Estado actual</th><th>Acción</th></tr></thead><tbody>{products.map((product: any) => {
        const current = routeByProduct.get(product.id);
        const selected = drafts[product.id] ?? (current?.active ? current.workflow_code : '');
        const dirty = selected !== (current?.active ? current.workflow_code : '');
        return <tr key={product.id}><th scope="row"><span className="pwr-product"><Workflow size={16}/><span>{product.name}<small>{product.family || product.category || 'Producto del catálogo'}</small></span></span></th><td><select aria-label={`Ruta predeterminada para ${product.name}`} value={selected} disabled={!canManage || savingId === product.id} onChange={(event) => setDrafts((value) => ({ ...value, [product.id]: event.target.value }))}><option value="">Sin ruta predeterminada</option>{templates.map((template) => <option key={template.code} value={template.code}>{template.name}</option>)}</select></td><td><span className={`pwr-status${current?.active ? ' active' : ''}`}>{current?.active ? templates.find((template) => template.code === current.workflow_code)?.name || current.workflow_code : 'Definir en revisión'}</span></td><td><button type="button" className="button button-dark" disabled={!canManage || !dirty || savingId === product.id} onClick={() => void save(product.id)}>{savingId === product.id ? 'Guardando…' : 'Guardar'}</button></td></tr>;
      })}</tbody></table></div>}
      {templates.length === 0 && !loading && <p className="pwr-empty">No hay flujos activos configurados. Activa o crea flujos desde Flujos y producción antes de asignarlos.</p>}
    </section>
  </AppFrame>;
}

export default ProductWorkflowRoutesPage;
