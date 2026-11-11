import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BriefcaseBusiness, Boxes, CheckCircle2, ClipboardCheck, Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSun, FileText, MapPin, RefreshCw, Snowflake, Sun, Users, Wallet } from 'lucide-react';
import { formatMoney, useWorkspace } from '../../app/workspace';
import { AppFrame, StatCard } from '../../app/layout';
import { workspaceNavigation, workspaceNavGroups, canViewNavigationItem } from '../../app/navigation';
import { legacyRoleNames } from '../../auth/accessCatalog';
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

const roleCardPriority: Record<string, string[]> = {
  owner: ['sales', 'crm', 'quotes', 'inventory', 'finance', 'cash', 'personnel', 'website', 'marketing'],
  admin: ['sales', 'crm', 'quotes', 'inventory', 'finance', 'cash', 'personnel', 'website', 'marketing'],
  manager: ['crm', 'quotes', 'sales', 'finance', 'cash', 'inventory', 'workshop', 'purchases'],
  advisor: ['quotes', 'crm', 'sales', 'workshop', 'cash'],
  warehouse: ['inventory', 'purchases', 'workshop', 'sales'],
  production: ['workshop', 'inventory', 'purchases', 'sales'],
  marketing: ['marketing', 'website', 'crm', 'quotes'],
  website_admin: ['website', 'marketing', 'crm'],
};

const roleGroupPriority: Record<string, string[]> = {
  owner: ['commercial', 'production', 'team', 'marketing', 'website'],
  admin: ['commercial', 'production', 'team', 'marketing', 'website'],
  manager: ['commercial', 'production', 'team', 'marketing'],
  advisor: ['commercial', 'production'],
  warehouse: ['production', 'commercial'],
  production: ['production', 'commercial'],
  marketing: ['marketing', 'website', 'commercial'],
  website_admin: ['website', 'marketing'],
};

const roleRoutePriority: Record<string, string[]> = {
  owner: ['/operaciones/finanzas', '/operaciones/pos', '/operaciones/crm', '/operaciones/inventario', '/operaciones/compras'],
  admin: ['/operaciones/finanzas', '/operaciones/pos', '/operaciones/crm', '/operaciones/inventario', '/operaciones/compras'],
  manager: ['/operaciones/crm', '/operaciones/finanzas', '/operaciones/pos', '/operaciones/compras', '/operaciones/inventario'],
  advisor: ['/operaciones/crm', '/operaciones/cotizador', '/operaciones/mi-semana', '/operaciones/trabajos/asesoria'],
  warehouse: ['/operaciones/inventario', '/operaciones/compras', '/operaciones/solicitudes-compras', '/operaciones/flujos'],
  production: ['/operaciones/rutas-productos', '/operaciones/coordinacion-trabajos', '/operaciones/kiosk', '/operaciones/flujos'],
  marketing: ['/operaciones/marketing/calendario', '/operaciones/marketing/campanas', '/operaciones/marketing'],
  website_admin: ['/admin/sitio', '/admin/servicios', '/admin/publicaciones'],
};

const weatherDetails = (code: number) => {
  if (code === 0) return { label: 'Despejado', Icon: Sun };
  if (code <= 2) return { label: 'Parcialmente nublado', Icon: CloudSun };
  if (code === 3 || code === 45 || code === 48) return { label: code === 3 ? 'Nublado' : 'Neblina', Icon: Cloud };
  if (code <= 57) return { label: 'Llovizna', Icon: CloudDrizzle };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Lluvia', Icon: CloudRain };
  if (code <= 77) return { label: 'Frío', Icon: Snowflake };
  if (code >= 95) return { label: 'Tormenta', Icon: CloudLightning };
  return { label: 'Nublado', Icon: Cloud };
};

function firstNameFromGoogle(user: any) {
  const identity = user?.identities?.find((item: any) => item.provider === 'google')?.identity_data;
  const name = user?.user_metadata?.given_name || identity?.given_name || user?.user_metadata?.full_name
    || user?.user_metadata?.name || identity?.full_name || identity?.name || user?.email?.split('@')[0] || 'Visual Corp';
  return String(name).trim().split(/\s+/)[0] || 'Visual Corp';
}

function rolePriority(roles: string[], table: Record<string, string[]>) {
  const priority: string[] = [];
  for (const role of roles) for (const item of table[role] || []) if (!priority.includes(item)) priority.push(item);
  return priority;
}

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
  const { user, roles, profiles, hasPermission } = useAuth();
  const { data } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<{ temperature: number; code: number } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const canViewSummary = hasPermission('dashboard', 'view');
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(supabase) && canViewSummary);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const greetingName = firstNameFromGoogle(user);
  const primaryRole = profiles.find((profile: any) => profile.name)?.name
    || roles.map((role: string) => legacyRoleNames[role] || role.replaceAll('_', ' ')).join(' · ')
    || 'Equipo Visual Corp';
  const roleOrder = rolePriority(roles, roleCardPriority);
  const groupOrder = rolePriority(roles, roleGroupPriority);
  const routeOrder = rolePriority(roles, roleRoutePriority);
  const city = String(data?.settings?.location || 'Milagro, Ecuador').split(',')[0].trim() || 'Milagro';
  const availableLinks = useMemo(
    () => workspaceNavigation.filter((item) => item.to !== '/panel' && canViewNavigationItem(item, hasPermission)),
    [hasPermission],
  );
  const visibleGroups = useMemo(() => workspaceNavGroups.flatMap((group) => {
    const items = availableLinks.filter((item) => group.paths.includes(item.to)).sort((a, b) => {
      const ai = routeOrder.indexOf(a.to); const bi = routeOrder.indexOf(b.to);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    });
    return items.length ? [{ ...group, items }] : [];
  }).sort((a, b) => {
    const ai = groupOrder.indexOf(a.id); const bi = groupOrder.indexOf(b.id);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  }), [availableLinks, groupOrder, routeOrder]);
  const visibleMetrics = canViewSummary
    ? metricCards.filter(({ module, to }) => hasPermission(module, 'view') && availableLinks.some((item) => item.to === to)).sort((a, b) => {
      const ai = roleOrder.indexOf(a.module); const bi = roleOrder.indexOf(b.module);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    })
    : [];
  const primaryPath = routeOrder.find((path) => availableLinks.some((link) => link.to === path));
  const primaryAction = availableLinks.find((item) => item.to === primaryPath)
    || availableLinks.find((item) => item.to === '/operaciones/pos')
    || availableLinks[0];
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
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const loadWeather = async () => {
      setWeatherLoading(true);
      setWeather(null);
      try {
        const placeResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=es&format=json`, { signal: controller.signal });
        if (!placeResponse.ok) throw new Error('Location unavailable');
        const places = await placeResponse.json();
        const place = (places.results || []).find((item: any) => item.country_code === 'EC' && /guayas/i.test(`${item.admin1 || ''} ${item.name || ''}`))
          || (places.results || []).find((item: any) => item.country_code === 'EC');
        if (!place) throw new Error('Location unavailable');
        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=America%2FGuayaquil`, { signal: controller.signal });
        if (!weatherResponse.ok) throw new Error('Weather unavailable');
        const result = await weatherResponse.json();
        if (active && Number.isFinite(result.current?.temperature_2m) && Number.isFinite(result.current?.weather_code)) {
          setWeather({ temperature: Math.round(result.current.temperature_2m), code: result.current.weather_code });
        }
      } catch {
        if (active && !controller.signal.aborted) setWeather(null);
      } finally {
        if (active) setWeatherLoading(false);
      }
    };
    void loadWeather();
    const timer = window.setInterval(() => void loadWeather(), 30 * 60 * 1000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [city]);

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
  const currentTime = new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' }).format(now);
  const currentDate = new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Guayaquil' }).format(now);
  const weatherView = weather ? weatherDetails(weather.code) : null;
  const WeatherIcon = weatherView?.Icon || CloudSun;

  return <AppFrame area="operations">
    <div className="unified-dashboard">
      <header className="unified-dashboard-hero">
        <div className="unified-dashboard-hero-copy">
          <div className="unified-dashboard-eyebrow"><span className="unified-dashboard-mark"><ClipboardCheck size={17} aria-hidden="true"/></span><span>INICIO PERSONALIZADO</span></div>
          <h1>Hola, {greetingName}<span className="unified-greeting-dot">.</span></h1>
          <p>Tu espacio está preparado para <strong>{primaryRole}</strong>. Aquí tienes lo importante para empezar bien.</p>
          <div className="unified-dashboard-badges"><span><BriefcaseBusiness size={14} aria-hidden="true"/>Cargo · {primaryRole}</span><span><MapPin size={14} aria-hidden="true"/>{data?.settings?.location || 'Milagro, Ecuador'}</span></div>
        </div>
        <div className="unified-dashboard-hero-side">
          <div className="unified-dashboard-context">
            <div className="unified-clock-card"><span className="unified-context-label">HORA LOCAL</span><strong>{currentTime}</strong><small>{currentDate}</small></div>
            <div className="unified-weather-card" aria-label={weatherView ? `${weatherView.label}, ${weather?.temperature} grados en ${city}` : `Clima de ${city}`}>
              <span className="unified-context-label"><MapPin size={12} aria-hidden="true"/>{city}</span>
              <WeatherIcon size={25} aria-hidden="true"/>
              <strong>{weatherLoading && !weather ? '···' : weather ? `${weather.temperature}°` : '—'}</strong>
              <small>{weatherView?.label || (weatherLoading ? 'Buscando clima' : 'Clima no disponible')}</small>
            </div>
          </div>
          <div className="unified-dashboard-hero-actions">
          {(loading || updatedAt) && <div className="unified-summary-meta" role="status" aria-live="polite"><span className={`status-dot${error ? ' is-warning' : ''}`}/>{loading ? 'Actualizando información…' : error ? `Última consulta: ${updatedAt} · sin actualizar` : `Información actualizada a las ${updatedAt}`}</div>}
          {primaryAction && <Link className="unified-dashboard-action" to={primaryAction.to}>Abrir {primaryAction.label} <ArrowUpRight size={17} aria-hidden="true"/></Link>}
          </div>
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
    <WorkspaceLauncher key={user?.id || 'anonymous'} userId={user?.id || 'anonymous'} groups={visibleGroups} descriptions={descriptions} heading={`Herramientas para ${primaryRole}`}/>
    {hasPermission('crm', 'view') && <section className="panel unified-recent-panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO COMERCIAL</span><h2>Solicitudes recientes</h2></div><Link className="text-link" to="/operaciones/crm">Abrir CRM <ArrowUpRight size={14}/></Link></div><LeadsTable/></section>}
    {hasPermission('team', 'view') && <ChangeLogPanel area="operations" compact/>}
    </div>
  </AppFrame>;
}
