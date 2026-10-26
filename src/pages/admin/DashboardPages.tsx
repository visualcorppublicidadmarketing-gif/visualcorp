import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Boxes, FileText, Globe2, Users, Wallet } from 'lucide-react';
import { formatMoney } from '../../app/workspace';
import { AppFrame, PageHeading, StatCard } from '../../app/layout';
import { workspaceNavigation, canViewNavigationItem } from '../../app/navigation';
import { ChangeLogPanel } from '../../components/ChangeLog';
import { AnimatedList, SpotlightLayer, clearSpotlight, updateSpotlight } from '../../components/ui/MagicComponents';
import { LeadsTable } from './CRMPage';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const metricCards = [
  { module: 'sales', key: 'sales_today_total', label: 'Ventas de hoy', note: 'Total confirmado hoy', icon: Wallet, tone: 'blue', money: true },
  { module: 'crm', key: 'open_leads', label: 'Solicitudes abiertas', note: 'Seguimiento comercial', icon: Users, tone: 'violet' },
  { module: 'quotes', key: 'quotes_this_month', label: 'Cotizaciones del mes', note: 'Propuestas compartidas', icon: FileText, tone: 'amber' },
  { module: 'inventory', key: 'inventory_items', label: 'Artículos inventariados', noteKey: 'inventory_low_stock', icon: Boxes, tone: 'rose' },
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
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const availableLinks = useMemo(
    () => workspaceNavigation.filter((item) => item.to !== '/panel' && canViewNavigationItem(item, hasPermission)),
    [hasPermission],
  );
  const visibleMetrics = metricCards.filter(({ module }) => hasPermission(module, 'view'));

  useEffect(() => {
    if (!supabase) { setLoading(false); setError('No hay conexión con la base compartida.'); return undefined; }
    let active = true;
    supabase.rpc('get_visualcorp_operations_summary').then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setSummary(data);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return <AppFrame area="operations">
    <PageHeading eyebrow="PANEL DE TRABAJO" title="Todo el equipo, en un solo lugar." description="Accede a tus tareas y herramientas según los permisos de tu perfil." action={<Link className="button button-dark vc-shimmer-button" to="/">Ver sitio público <ArrowUpRight size={16}/></Link>}/>
    {error && <p className="access-error" role="status">No se pudo actualizar el resumen compartido: {error}</p>}
    {visibleMetrics.length > 0 && <div className="stat-grid unified-stat-grid">{visibleMetrics.map(({ module, key, label, note, noteKey, icon, tone, money }) => {
      const value = metricValue(summary, key, loading, error);
      const displayValue = money && typeof value === 'number' ? formatMoney(value) : value;
      const detail = noteKey && !loading && !error && summary?.[noteKey] != null
        ? `${summary[noteKey]} en nivel mínimo`
        : note;
      return <StatCard key={module} label={label} value={displayValue} icon={icon} note={detail} tone={tone}/>;
    })}</div>}
    <section className="panel unified-launcher-panel">
      <div className="panel-heading"><div><span className="eyebrow">TUS HERRAMIENTAS</span><h2>¿Qué necesitas hacer?</h2></div><Globe2 size={19}/></div>
      {availableLinks.length
        ? <AnimatedList className="operations-launcher vc-bento-grid">{availableLinks.map(({ to, label, icon: Icon }) => <Link to={to} key={to} className="operation-card vc-magic-card" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}><SpotlightLayer/><span className="operation-icon"><Icon size={20}/></span><span><b>{label}</b><small>{descriptions[to] || 'Abre este módulo para consultar sus registros.'}</small></span><ArrowUpRight size={17}/></Link>)}</AnimatedList>
        : <p className="unified-empty">No hay módulos visibles para este perfil. Solicita al propietario revisar tus permisos.</p>}
    </section>
    {hasPermission('crm', 'view') && <section className="panel unified-recent-panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO COMERCIAL</span><h2>Solicitudes recientes</h2></div><Link className="text-link" to="/operaciones/crm">Abrir CRM <ArrowUpRight size={14}/></Link></div><LeadsTable/></section>}
    {hasPermission('team', 'view') && <ChangeLogPanel area="operations" compact/>}
  </AppFrame>;
}
