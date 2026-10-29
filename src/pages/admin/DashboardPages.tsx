import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Boxes, CheckCircle2, ClipboardCheck, FileText, RefreshCw, Users, Wallet } from 'lucide-react';
import { formatMoney } from '../../app/workspace';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { workspaceNavigation, workspaceNavGroups, canViewNavigationItem } from '../../app/navigation';
import { ChangeLogPanel } from '../../components/ChangeLog';
import { AnimatedList, SpotlightLayer, clearSpotlight, updateSpotlight } from '../../components/ui/MagicComponents';
import { LeadsTable } from './CRMPage';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';

const metricCards = [
  { module: 'sales', to: '/operaciones/pos', key: 'sales_today_total', label: 'Ventas de hoy', note: 'Total confirmado hoy', icon: Wallet, tone: 'blue', money: true },
  { module: 'crm', to: '/operaciones/crm', key: 'open_leads', label: 'Solicitudes abiertas', note: 'Seguimiento comercial', icon: Users, tone: 'violet' },
  { module: 'quotes', to: '/operaciones/cotizador', key: 'quotes_this_month', label: 'Cotizaciones del mes', note: 'Propuestas compartidas', icon: FileText, tone: 'amber' },
  { module: 'inventory', to: '/operaciones/inventario', key: 'inventory_items', label: 'Artículos inventariados', noteKey: 'inventory_low_stock', icon: Boxes, tone: 'rose' },
];

const descriptions: Record<string, string> = {
  '/operaciones/pos': 'Registra ventas y administra la caja.',
  '/operaciones/finanzas': 'Consulta ventas y pagos registrados.',
  '/operaciones/cotizador': 'Prepara propuestas con el catálogo compartido.',
  '/operaciones/crm': 'Da seguimiento a solicitudes y oportunidades.',
  '/operaciones/clientes': 'Consulta el directorio y las fichas de clientes.',
  '/operaciones/flujos': 'Coordina caja, producción, traslados y entregas.',
  '/operaciones/inventario': 'Revisa existencias, movimientos y reposición.',
  '/operaciones/compras': 'Organiza compras y registra recepciones.',
  '/operaciones/equipos': 'Consulta equipos y maquinaria por área.',
  '/operaciones/catalogo': 'Gestiona artículos y tarifas del catálogo.',
  '/operaciones/marketing': 'Organiza campañas y calendario.',
  '/admin/sitio': 'Edita el contenido principal del sitio.',
  '/admin/servicios': 'Mantén la información de servicios.',
  '/admin/tienda': 'Administra productos de la tienda web.',
  '/admin/blog': 'Gestiona artículos del blog.',
  '/admin/publicaciones': 'Administra publicaciones del sitio.',
  '/admin/portafolio': 'Actualiza proyectos del portafolio.',
  '/admin/contacto': 'Edita la información y canales de contacto.',
  '/operaciones/personal': 'Consulta y administra fichas de personal.',
  '/operaciones/equipo': 'Configura usuarios, perfiles y permisos.',
  '/operaciones/cambios': 'Revisa novedades compartidas del equipo.',
  '/admin/respaldo': 'Consulta respaldos y procedencia de datos.',
};

function metricValue(summary: any, key: string, loading: boolean, error: string) {
  if (loading) return '…';
  if (error) return '—';
  return summary?.[key] ?? '—';
}

export function UnifiedHome() {
  const { hasPermission } = useAuth();
  const canViewSummary = hasPermission('dashboard', 'view');
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(supabase) && canViewSummary);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const availableLinks = useMemo(
    () => workspaceNavigation.filter((item) => item.to !== '/panel' && canViewNavigationItem(item, hasPermission)),
    [hasPermission],
  );
  const visibleGroups = useMemo(() => workspaceNavGroups.flatMap((group) => {
    const items = availableLinks.filter((item) => group.paths.includes(item.to));
    return items.length ? [{ ...group, items }] : [];
  }), [availableLinks]);
  const visibleMetrics = canViewSummary
    ? metricCards.filter(({ module, to }) => hasPermission(module, 'view') && availableLinks.some((item) => item.to === to))
    : [];
  const primaryAction = availableLinks.find((item) => item.to === '/operaciones/pos') || availableLinks[0];
  const priorityDataComplete = (!hasPermission('crm', 'view') || typeof summary?.open_leads === 'number')
    && (!hasPermission('inventory', 'view') || typeof summary?.inventory_low_stock === 'number');
  const priorities = useMemo(() => {
    const items: { key: string; to: string; icon: typeof Users; title: string; detail: string; count: number }[] = [];
    const openLeads = summary?.open_leads;
    const lowStock = summary?.inventory_low_stock;
    if (hasPermission('crm', 'view') && typeof openLeads === 'number' && openLeads > 0) {
      items.push({
        key: 'crm',
        to: '/operaciones/crm',
        icon: Users,
        title: `${openLeads} ${openLeads === 1 ? 'solicitud necesita' : 'solicitudes necesitan'} seguimiento`,
        detail: 'Revisa su etapa y define el siguiente contacto.',
        count: openLeads,
      });
    }
    if (hasPermission('inventory', 'view') && typeof lowStock === 'number' && lowStock > 0) {
      items.push({
        key: 'inventory',
        to: '/operaciones/inventario',
        icon: ClipboardCheck,
        title: `${lowStock} ${lowStock === 1 ? 'artículo requiere' : 'artículos requieren'} revisión de existencias`,
        detail: 'Confirma el conteo físico antes de iniciar una reposición.',
        count: lowStock,
      });
    }
    return items;
  }, [hasPermission, summary]);

  useEffect(() => {
    if (!canViewSummary) { setLoading(false); setError(''); setSummary(null); return undefined; }
    if (!supabase) { setLoading(false); setError('No hay conexión con la base compartida.'); return undefined; }
    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: queryError } = await supabase.rpc('get_visualcorp_operations_summary');
        if (!active) return;
        if (queryError) setError('No se pudo actualizar el resumen. Comprueba la conexión e inténtalo de nuevo.');
        else setSummary(data);
      } catch {
        if (active) setError('No se pudo actualizar el resumen. Comprueba la conexión e inténtalo de nuevo.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [canViewSummary, refreshKey]);

  const updatedAt = summary?.as_of && Number.isFinite(Date.parse(summary.as_of))
    ? new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' }).format(new Date(summary.as_of))
    : '';

  return <AppFrame area="operations">
    <PageHeading eyebrow="PANEL DE TRABAJO" title="Todo el equipo, en un solo lugar." description="Revisa lo que requiere atención y abre tus herramientas de trabajo." action={primaryAction && <Link className="button button-dark vc-shimmer-button" to={primaryAction.to}>Abrir {primaryAction.label} <ArrowUpRight size={16}/></Link>}/>
    {(loading || updatedAt) && <div className="unified-summary-meta" role="status" aria-live="polite"><span className={`status-dot${error ? ' is-warning' : ''}`}/>{loading ? 'Actualizando información…' : `Información actualizada a las ${updatedAt}`}</div>}
    {error && <div className="unified-summary-error" role="alert"><span>{error}</span><button type="button" className="button button-outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={14}/> {loading ? 'Actualizando…' : 'Reintentar'}</button></div>}
    {visibleMetrics.length > 0 && <div className="stat-grid unified-stat-grid">{visibleMetrics.map(({ module, to, key, label, note, noteKey, icon, tone, money }) => {
      const value = metricValue(summary, key, loading, error);
      const displayValue = loading ? <Skeleton className="dashboard-metric-skeleton"/> : money && typeof value === 'number' ? formatMoney(value) : value;
      const detail = noteKey && !loading && !error && summary?.[noteKey] != null
        ? `${summary[noteKey]} en nivel mínimo`
        : note;
      return <Link key={module} className="unified-metric-link" to={to}><StatCard label={label} value={displayValue} icon={icon} note={detail} tone={tone}/><span className="unified-metric-open" aria-hidden="true"><ArrowUpRight size={16}/></span><span className="sr-only">Abrir módulo: {label}</span></Link>;
    })}</div>}
    {canViewSummary && (hasPermission('crm', 'view') || hasPermission('inventory', 'view')) ? <section className="panel unified-priority-panel" aria-labelledby="unified-priority-heading">
      <div className="panel-heading"><div><span className="eyebrow">SIGUIENTE PASO</span><h2 id="unified-priority-heading">Pendientes que puedes atender</h2></div>{loading ? <span className="unified-priority-state">Actualizando</span> : error ? <span className="unified-priority-state">Sin actualizar</span> : priorities.length ? <span className="unified-priority-state has-items">{priorities.length} {priorities.length === 1 ? 'pendiente' : 'pendientes'}</span> : priorityDataComplete ? <span className="unified-priority-state is-clear"><CheckCircle2 size={15}/> Sin alertas</span> : <span className="unified-priority-state">Sin datos</span>}</div>
      {error ? <p className="unified-priority-empty">No se muestran pendientes hasta confirmar que la información está actualizada.</p> : loading ? <div className="unified-priority-loading" role="status"><span className="sr-only">Consultando los registros autorizados para tu perfil</span><Skeleton className="dashboard-priority-skeleton"/><Skeleton className="dashboard-priority-skeleton is-short"/></div> : priorities.length ? <div className="unified-priority-list">{priorities.map(({ key, to, icon: Icon, title, detail, count }) => <Link className="unified-priority-item" to={to} key={key}><span className={`unified-priority-icon ${key}`}><Icon size={18}/></span><span className="unified-priority-copy"><b>{title}</b><small>{detail}</small></span><span className="unified-priority-count">{count}</span><ArrowUpRight size={16} aria-hidden="true"/></Link>)}</div> : priorityDataComplete ? <p className="unified-priority-empty">No se detectan pendientes en los módulos visibles para tu perfil.</p> : <p className="unified-priority-empty">No se recibieron datos suficientes para confirmar si hay pendientes.</p>}
    </section> : null}
    <section className="panel unified-launcher-panel">
      <div className="panel-heading"><div><span className="eyebrow">TUS HERRAMIENTAS</span><h2>¿Qué necesitas hacer?</h2></div><ClipboardCheck size={19}/></div>
      {visibleGroups.length
        ? <div className="unified-module-groups">{visibleGroups.map(({ id, label, icon: GroupIcon, items }) => <section className="unified-module-group" key={id} aria-labelledby={`unified-module-group-${id}`}>
          <header className="unified-module-group-heading"><span className="unified-module-group-icon"><GroupIcon size={16} aria-hidden="true"/></span><h3 id={`unified-module-group-${id}`}>{label}</h3><span className="unified-module-group-count"><span aria-hidden="true">{items.length}</span><span className="sr-only">{items.length} {items.length === 1 ? 'módulo visible' : 'módulos visibles'}</span></span></header>
          <AnimatedList className="operations-launcher vc-bento-grid">{items.map(({ to, label: itemLabel, icon: Icon }) => <Link to={to} key={to} className="operation-card vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/><span className="operation-icon"><Icon size={20}/></span><span className="operation-copy"><b>{itemLabel}</b><small>{descriptions[to] || 'Abre este módulo para consultar sus registros.'}</small></span><ArrowUpRight size={17}/></Link>)}</AnimatedList>
        </section>)}</div>
        : <p className="unified-empty">No hay módulos visibles para este perfil. Solicita al propietario revisar tus permisos.</p>}
    </section>
    {hasPermission('crm', 'view') && <section className="panel unified-recent-panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO COMERCIAL</span><h2>Solicitudes recientes</h2></div><Link className="text-link" to="/operaciones/crm">Abrir CRM <ArrowUpRight size={14}/></Link></div><LeadsTable/></section>}
    {hasPermission('team', 'view') && <ChangeLogPanel area="operations" compact/>}
  </AppFrame>;
}
