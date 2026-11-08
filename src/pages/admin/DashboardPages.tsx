import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Boxes, CheckCircle2, ClipboardCheck, FileText, RefreshCw, Users, Wallet } from 'lucide-react';
import { formatMoney } from '../../app/workspace';
import { AppFrame, StatCard } from '../../app/layout';
import { workspaceNavigation, workspaceNavGroups, canViewNavigationItem } from '../../app/navigation';
import { ChangeLogPanel } from '../../components/ChangeLog';
import { WorkspaceLauncher } from '../../components/workspace';
import { LeadsTable } from './CRMPage';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';
import './unified-home.css';

const metricCards = [
  { module: 'sales', to: '/operaciones/pos', key: 'sales_today_total', label: 'Ventas de hoy', note: 'Total confirmado hoy', icon: Wallet, tone: 'blue', money: true },
  { module: 'crm', to: '/operaciones/crm', key: 'open_leads', label: 'Solicitudes abiertas', note: 'Seguimiento comercial', icon: Users, tone: 'violet' },
  { module: 'quotes', to: '/operaciones/cotizador', key: 'quotes_this_month', label: 'Cotizaciones del mes', note: 'Propuestas compartidas', icon: FileText, tone: 'amber' },
  { module: 'inventory', to: '/operaciones/inventario', key: 'inventory_items', label: 'Artículos inventariados', noteKey: 'inventory_low_stock', icon: Boxes, tone: 'rose' },
];

const descriptions: Record<string, string> = {
  '/operaciones/pos': 'Registra ventas y administra la caja.',
  '/operaciones/mi-semana': 'Revisa tus resultados comerciales de la semana.',
  '/operaciones/rutas-productos': 'Consulta las etapas de trabajo de cada producto.',
  '/operaciones/trabajos/asesoria': 'Da seguimiento a los trabajos del área comercial.',
  '/operaciones/cajas-abiertas': 'Revisa los turnos de caja abiertos.',
  '/operaciones/kiosk': 'Accede a las tareas desde la terminal del taller.',
  '/operaciones/coordinacion-trabajos': 'Organiza responsables, fechas y avances de producción.',
  '/operaciones/trabajos/diseno': 'Consulta los trabajos pendientes de diseño.',
  '/operaciones/trabajos/impresion': 'Consulta la cola de impresión y sus avances.',
  '/operaciones/trabajos/sublimacion': 'Consulta los trabajos del área de sublimación.',
  '/operaciones/trabajos/laser': 'Consulta los trabajos de corte láser.',
  '/operaciones/trabajos/taller': 'Revisa las tareas y entregables del taller.',
  '/operaciones/finanzas': 'Consulta ventas y pagos registrados.',
  '/operaciones/cotizador': 'Prepara propuestas con el catálogo compartido.',
  '/operaciones/crm': 'Da seguimiento a solicitudes y oportunidades.',
  '/operaciones/clientes': 'Consulta el directorio y las fichas 360° de clientes.',
  '/operaciones/automatizaciones': 'Configura reglas de trabajo y alertas de materiales.',
  '/operaciones/archivos': 'Encuentra diseños, bocetos y evidencias de entrega.',
  '/seguimiento': 'Consulta el avance de pedidos y la aprobación de diseños.',
  '/operaciones/flujos': 'Coordina caja, producción, traslados y entregas.',
  '/operaciones/inventario': 'Revisa existencias, movimientos y reposición.',
  '/operaciones/compras': 'Organiza compras y registra recepciones.',
  '/operaciones/equipos': 'Consulta equipos y maquinaria por área.',
  '/operaciones/catalogo': 'Gestiona artículos y tarifas del catálogo.',
  '/operaciones/equipo/horarios': 'Administra horarios laborales, excepciones y turnos de limpieza.',
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
  const { user, hasPermission } = useAuth();
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
    <div className="unified-dashboard">
      <header className="unified-dashboard-hero">
        <div className="unified-dashboard-hero-copy">
          <div className="unified-dashboard-eyebrow"><span className="unified-dashboard-mark"><ClipboardCheck size={17} aria-hidden="true"/></span><span>PANEL DE TRABAJO</span></div>
          <h1>Todo el equipo, en un solo lugar.</h1>
          <p>Revisa lo que requiere atención y abre tus herramientas de trabajo.</p>
        </div>
        <div className="unified-dashboard-hero-actions">
          {(loading || updatedAt) && <div className="unified-summary-meta" role="status" aria-live="polite"><span className={`status-dot${error ? ' is-warning' : ''}`}/>{loading ? 'Actualizando información…' : error ? `Última consulta: ${updatedAt} · sin actualizar` : `Información actualizada a las ${updatedAt}`}</div>}
          {primaryAction && <Link className="unified-dashboard-action" to={primaryAction.to}>Abrir {primaryAction.label} <ArrowUpRight size={17} aria-hidden="true"/></Link>}
        </div>
      </header>
    {error && <div className="unified-summary-error" role="alert"><span>{error}</span><button type="button" className="button button-outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={14}/> {loading ? 'Actualizando…' : 'Reintentar'}</button></div>}
    {visibleMetrics.length > 0 && <section className="unified-overview" aria-label="Resumen operativo"><div className="unified-overview-heading"><span className="eyebrow">RESUMEN OPERATIVO</span><button type="button" className="unified-refresh" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RefreshCw size={14} aria-hidden="true"/>{loading ? 'Actualizando…' : 'Actualizar resumen'}</button></div><div className="stat-grid unified-stat-grid">{visibleMetrics.map(({ module, to, key, label, note, noteKey, icon, tone, money }) => {
      const value = metricValue(summary, key, loading, error);
      const displayValue = loading ? <Skeleton className="dashboard-metric-skeleton"/> : money && typeof value === 'number' ? formatMoney(value) : value;
      const detail = noteKey && !loading && !error && summary?.[noteKey] != null
        ? `${summary[noteKey]} en nivel mínimo`
        : note;
      return <Link key={module} className="unified-metric-link" to={to}><StatCard label={label} value={displayValue} icon={icon} note={detail} tone={tone}/><span className="unified-metric-open" aria-hidden="true"><ArrowUpRight size={16}/></span><span className="sr-only">Abrir módulo: {label}</span></Link>;
    })}</div></section>}
    {canViewSummary && (hasPermission('crm', 'view') || hasPermission('inventory', 'view')) ? <section className="panel unified-priority-panel" aria-labelledby="unified-priority-heading">
      <div className="panel-heading"><div><span className="eyebrow">SIGUIENTE PASO</span><h2 id="unified-priority-heading">Pendientes que puedes atender</h2></div>{loading ? <span className="unified-priority-state">Actualizando</span> : error ? <span className="unified-priority-state">Sin actualizar</span> : priorities.length ? <span className="unified-priority-state has-items">{priorities.length} {priorities.length === 1 ? 'pendiente' : 'pendientes'}</span> : priorityDataComplete ? <span className="unified-priority-state is-clear"><CheckCircle2 size={15}/> Sin alertas</span> : <span className="unified-priority-state">Sin datos</span>}</div>
      {error ? <p className="unified-priority-empty">No se muestran pendientes hasta confirmar que la información está actualizada.</p> : loading ? <div className="unified-priority-loading" role="status"><span className="sr-only">Consultando los registros autorizados para tu perfil</span><Skeleton className="dashboard-priority-skeleton"/><Skeleton className="dashboard-priority-skeleton is-short"/></div> : priorities.length ? <div className="unified-priority-list">{priorities.map(({ key, to, icon: Icon, title, detail, count }) => <Link className="unified-priority-item" to={to} key={key}><span className={`unified-priority-icon ${key}`}><Icon size={18}/></span><span className="unified-priority-copy"><b>{title}</b><small>{detail}</small></span><span className="unified-priority-count">{count}</span><ArrowUpRight size={16} aria-hidden="true"/></Link>)}</div> : priorityDataComplete ? <p className="unified-priority-empty">No se detectan pendientes en los módulos visibles para tu perfil.</p> : <p className="unified-priority-empty">No se recibieron datos suficientes para confirmar si hay pendientes.</p>}
    </section> : null}
    <WorkspaceLauncher key={user?.id || 'anonymous'} userId={user?.id || 'anonymous'} groups={visibleGroups} descriptions={descriptions}/>
    {hasPermission('crm', 'view') && <section className="panel unified-recent-panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO COMERCIAL</span><h2>Solicitudes recientes</h2></div><Link className="text-link" to="/operaciones/crm">Abrir CRM <ArrowUpRight size={14}/></Link></div><LeadsTable/></section>}
    {hasPermission('team', 'view') && <ChangeLogPanel area="operations" compact/>}
    </div>
  </AppFrame>;
}
