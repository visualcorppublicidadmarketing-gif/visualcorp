import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Boxes, BriefcaseBusiness, ChartNoAxesCombined, ChevronRight, FileText, Image, Megaphone, Settings2, ShoppingBag, Users, Wallet } from 'lucide-react';
import { formatDate, formatMoney, useWorkspace } from '../../app/workspace';
import { AppFrame, PageHeading, StatCard, operationsLinks } from '../../app/layout';
import { ChangeLogPanel } from '../../components/ChangeLog';
import { AnimatedList, NumberTicker, SpotlightLayer, clearSpotlight, updateSpotlight } from '../../components/ui/MagicComponents';
import { EmptyState, StageBadge } from '../../components/feedback';
import { LeadsTable } from './CRMPage';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const operationDescriptions: Record<string, string> = {
  '/operaciones/pos': 'Registra ventas y administra la caja.',
  '/operaciones/flujos': 'Sigue caja, producción y entregas.',
  '/operaciones/cambios': 'Consulta las novedades del equipo.',
  '/operaciones/cotizador': 'Prepara propuestas con el catálogo vigente.',
  '/operaciones/inventario': 'Revisa existencias, reservas y reposición.',
  '/operaciones/compras': 'Organiza compras y abastecimiento.',
  '/operaciones/crm': 'Da seguimiento a solicitudes y oportunidades.',
  '/operaciones/clientes': 'Consulta la ficha de cada cliente.',
  '/operaciones/marketing': 'Prepara campañas y su calendario.',
  '/operaciones/equipo': 'Administra integrantes y permisos.',
  '/operaciones/catalogo': 'Gestiona artículos y tarifas del catálogo.',
};

export function AdminHome() {
  const { data } = useWorkspace();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canViewLeads = hasPermission('crm', 'view');
  const canViewQuotes = hasPermission('quotes', 'view');
  const canViewCatalog = hasPermission('catalog_admin', 'view');
  const canViewMarketing = hasPermission('marketing', 'view');
  const pendingRates = canViewCatalog ? data.catalog.filter((item) => !item.confirmed).length : null;
  const quickActions = [
    { to: '/admin/sitio', label: 'Actualizar el sitio', detail: 'Mensajes, servicios y contacto', icon: Image, module: 'website' },
    { to: '/operaciones/catalogo', label: 'Revisar el catálogo', detail: `${pendingRates ?? 0} tarifas por validar`, icon: ShoppingBag, module: 'catalog_admin' },
    { to: '/admin/marketing', label: 'Preparar una campaña', detail: 'Planificar sin publicar', icon: Megaphone, module: 'marketing' },
    { to: '/operaciones', label: 'Ir a operaciones', detail: 'Ventas, cotizaciones e inventario', icon: ChartNoAxesCombined, module: 'dashboard' },
  ].filter((action) => hasPermission(action.module, 'view'));

  return <AppFrame area="admin">
    <PageHeading eyebrow="CENTRO DE CONTROL" title="Tu empresa, en un solo lugar." description="Administra la experiencia pública y revisa la actividad que llega desde el sitio." action={<Link className="button button-dark vc-shimmer-button" to="/">Ver sitio público <ArrowUpRight size={16}/></Link>}/>
    <div className="stat-grid">
      <StatCard label="Solicitudes nuevas" value={canViewLeads ? data.leads.filter((item) => item.stage === 'Nuevo').length : 'Sin permiso'} icon={Users} note={canViewLeads ? `${data.leads.length} en total` : 'Permiso CRM requerido'} tone="violet"/>
      <StatCard label="Cotizaciones" value={canViewQuotes ? data.quotes.length : 'Sin permiso'} icon={FileText} note={canViewQuotes ? 'Registradas localmente' : 'Permiso de cotizaciones requerido'} tone="blue"/>
      <StatCard label="Tarifas pendientes" value={pendingRates ?? 'Sin permiso'} icon={BadgeCheck} note={canViewCatalog ? 'Validación requerida' : 'Permiso de catálogo requerido'} tone="amber"/>
      <StatCard label="Campañas" value={canViewMarketing ? data.campaigns.length : 'Sin permiso'} icon={Megaphone} note={canViewMarketing ? 'Borradores de marketing' : 'Permiso de marketing requerido'} tone="rose"/>
    </div>
    <div className="dashboard-grid vc-bento-dashboard">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">VISTA GENERAL</span><h2>Actividad reciente</h2></div><Link to="/admin/solicitudes" className="text-link">Abrir CRM <ArrowUpRight size={14}/></Link></div>
        {!canViewLeads
          ? <EmptyState icon={Users} title="Vista de solicitudes restringida" text="Este perfil no tiene permiso para consultar el CRM."/>
          : data.leads.length === 0
          ? <EmptyState icon={Users} title="Aún no hay solicitudes" text="Cuando alguien escriba desde la página pública, la solicitud aparecerá aquí." action={<Link className="button button-outline" to="/">Abrir el sitio público <ArrowUpRight size={15}/></Link>}/>
          : <AnimatedList className="activity-list" itemClassName="vc-activity-entry">{data.leads.slice(0, 5).map((lead) => <div className="activity-row" key={lead.id}><span className="activity-avatar">{lead.name?.slice(0, 1) || 'C'}</span><span><b>{lead.name}</b><small>{lead.service || 'Consulta general'} · {formatDate(lead.createdAt)}</small></span><StageBadge stage={lead.stage}/></div>)}</AnimatedList>}
      </section>
      <section className="panel quick-panel">
        <div className="panel-heading"><div><span className="eyebrow">ACCESOS RÁPIDOS</span><h2>¿Qué quieres gestionar?</h2></div><BriefcaseBusiness size={19}/></div>
        <AnimatedList className="quick-links vc-bento-links" itemClassName="vc-quick-entry">{quickActions.map(({ to, label, detail, icon: Icon }) => <Link to={to} key={to} className="vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/><Icon/><span><b>{label}</b><small>{detail}</small></span><ChevronRight/></Link>)}</AnimatedList>
      </section>
    </div>
    <ChangeLogPanel area="admin" compact/>
    <div className="notice-box"><span><Settings2 size={17}/></span><div><b>Espacios sincronizados</b><p>Las novedades publicadas desde administración aparecen también en operaciones y se actualizan desde la base central.</p></div><button onClick={() => navigate('/admin/sitio')}>Revisar <ChevronRight size={15}/></button></div>
  </AppFrame>;
}

export function OperationsHome() {
  const { hasPermission } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); setError('No hay conexión con la base compartida.'); return; }
    let active = true;
    supabase.rpc('get_visualcorp_operations_summary').then(({ data: result, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message); else setSummary(result);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const metric = (key: string) => loading ? '…' : error ? '—' : summary?.[key] == null ? 'Sin permiso' : summary[key];
  const count = (key: string, module: string): React.ReactNode => {
    if (!hasPermission(module, 'view')) return 'Sin permiso';
    const value = metric(key);
    return typeof value === 'number' ? <NumberTicker value={value}/> : value;
  };
  const rawSales = metric('sales_today_total');
  const salesValue = !hasPermission('sales', 'view') ? 'Sin permiso' : typeof rawSales === 'number' ? formatMoney(rawSales) : Number.isFinite(Number(rawSales)) && rawSales !== '' ? formatMoney(Number(rawSales)) : rawSales;
  const salesCount = hasPermission('sales', 'view') ? metric('sales_today_count') : 'Sin permiso';
  const visibleOperations = operationsLinks.slice(1).filter(({ module }) => hasPermission(module, 'view'));

  return <AppFrame area="operations">
    <PageHeading eyebrow="OPERACIONES · PANEL PRINCIPAL" title="Buenos días, equipo." description="Indicadores compartidos y actualizados desde los registros operativos." action={<Link to="/operaciones/pos" className="button button-dark vc-shimmer-button">Abrir POS <ArrowUpRight size={16}/></Link>}/>
    {error && <p className="access-error" role="status">No se pudo actualizar el resumen: {error}</p>}
    <div className="stat-grid">
      <StatCard label="Ventas de hoy" value={salesValue} icon={Wallet} note={hasPermission('sales', 'view') ? `${String(salesCount)} ventas confirmadas` : 'Permiso de ventas requerido'} tone="blue"/>
      <StatCard label="Solicitudes abiertas" value={count('open_leads', 'crm')} icon={Users} note={hasPermission('crm', 'view') ? 'Seguimiento del CRM' : 'Permiso CRM requerido'} tone="violet"/>
      <StatCard label="Cotizaciones del mes" value={count('quotes_this_month', 'quotes')} icon={FileText} note={hasPermission('quotes', 'view') ? 'Registradas en la base compartida' : 'Permiso de cotizaciones requerido'} tone="amber"/>
      <StatCard label="Artículos inventariados" value={count('inventory_items', 'inventory')} icon={Boxes} note={hasPermission('inventory', 'view') ? `${String(count('inventory_low_stock', 'inventory'))} en nivel mínimo` : 'Permiso de inventario requerido'} tone="rose"/>
    </div>
    <ChangeLogPanel area="operations" compact/>
    <AnimatedList className="operations-launcher vc-bento-grid">{visibleOperations.map(({ to, label, icon: Icon }) => <Link to={to} key={to} className="operation-card vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/><span className={`operation-icon operation-${operationsLinks.findIndex((item) => item.to === to) - 1}`}><Icon size={20}/></span><span><b>{label}</b><small>{operationDescriptions[to] || 'Abre el espacio para revisar sus detalles.'}</small></span><ChevronRight size={17}/></Link>)}</AnimatedList>
    {hasPermission('crm', 'view') && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2>Solicitudes recientes</h2></div><Link className="text-link" to="/operaciones/crm">Ver CRM <ArrowUpRight size={14}/></Link></div><LeadsTable/></section>}
  </AppFrame>;
}
