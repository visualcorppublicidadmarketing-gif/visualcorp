import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BriefcaseBusiness, Boxes, CheckCircle2, ClipboardCheck, Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSun, FileText, LayoutGrid, MapPin, RefreshCw, Snowflake, Sun, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import { formatMoney, useWorkspace } from '../../app/workspace';
import { AppFrame } from '../../app/layout';
import { workspaceNavigation, workspaceNavGroups, canViewNavigationItem } from '../../app/navigation';
import { legacyRoleNames } from '../../auth/accessCatalog';
import { ChangeLogPanel } from '../../components/ChangeLog';
import { WorkspaceLauncher } from '../../components/workspace';
import { AnimatedList, clearSpotlight, NumberTicker, SpotlightLayer, updateSpotlight } from '../../components/ui/MagicComponents';
import { LeadsTable } from './CRMPage';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { Skeleton } from '../../components/ui/Skeleton';
import './unified-home.css';

const metricCards = [
  { module: 'sales', to: '/operaciones/pos', key: 'sales_today_total', label: 'Ventas de hoy', scope: 'HOY', noteKey: 'sales_today_count', note: 'ventas confirmadas', icon: Wallet, tone: 'blue', money: true },
  { module: 'crm', to: '/operaciones/crm', key: 'open_leads', label: 'Solicitudes abiertas', scope: 'SEGUIMIENTO', note: 'Pendientes de atención comercial', icon: Users, tone: 'violet' },
  { module: 'quotes', to: '/operaciones/cotizador', key: 'quotes_this_month', label: 'Cotizaciones del mes', scope: 'MES ACTUAL', note: 'Propuestas creadas este mes', icon: FileText, tone: 'amber' },
  { module: 'inventory', to: '/operaciones/inventario', key: 'inventory_items', label: 'Artículos activos', scope: 'INVENTARIO', noteKey: 'inventory_low_stock', note: 'en nivel mínimo', icon: Boxes, tone: 'rose' },
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

function weatherCityFromLocation(location: string) {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  const countryIndex = parts.findIndex((part) => /ecuador/i.test(part));
  if (countryIndex > 0) return parts[countryIndex - 1];
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'Milagro';
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

type TrendPoint = { key: string; shortLabel: string; fullLabel: string; value: number };
type MetricTrend = { points: TrendPoint[]; currentWeek: number; previousWeek: number; changePercent: number | null };

const guayaquilDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
});
const trendShortDateFormatter = new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', weekday: 'short' });
const trendFullDateFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long',
});

function guayaquilDateKey(date: Date) {
  const parts = Object.fromEntries(guayaquilDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(key: string, amount: number) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dailyMetricTrend(rows: Array<{ created_at: string; total?: number | string }>, kind: 'sales' | 'quotes', todayKey = guayaquilDateKey(new Date())): MetricTrend {
  const keys = Array.from({ length: 14 }, (_, index) => shiftDateKey(todayKey, index - 13));
  const totals = new Map(keys.map((key) => [key, 0]));

  for (const row of rows) {
    const createdAt = Date.parse(row.created_at);
    if (!Number.isFinite(createdAt)) continue;
    const key = guayaquilDateKey(new Date(createdAt));
    if (!totals.has(key)) continue;
    const value = kind === 'sales' ? Number(row.total) : 1;
    if (Number.isFinite(value)) totals.set(key, (totals.get(key) || 0) + value);
  }

  const points = keys.map((key) => {
    const atNoonUtc = new Date(`${key}T12:00:00Z`);
    return {
      key,
      shortLabel: trendShortDateFormatter.format(atNoonUtc).replace(/\.$/, ''),
      fullLabel: trendFullDateFormatter.format(atNoonUtc),
      value: totals.get(key) || 0,
    };
  });
  const previousWeek = points.slice(0, 7).reduce((sum, point) => sum + point.value, 0);
  const currentWeek = points.slice(7).reduce((sum, point) => sum + point.value, 0);
  const changePercent = previousWeek > 0 ? Math.round(((currentWeek - previousWeek) / previousWeek) * 100) : null;
  return { points, currentWeek, previousWeek, changePercent };
}

function metricTrendLabel(trend: MetricTrend) {
  if (trend.changePercent === null) return trend.currentWeek > 0 ? 'Actividad reciente' : 'Sin movimientos';
  return `${trend.changePercent > 0 ? '+' : ''}${trend.changePercent}% vs. semana previa`;
}

function metricTrendAccessibleLabel(trend: MetricTrend, isMoney: boolean) {
  const current = isMoney ? formatMoney(trend.currentWeek) : String(trend.currentWeek);
  const previous = isMoney ? formatMoney(trend.previousWeek) : String(trend.previousWeek);
  return `Últimos siete días: ${current}; siete días anteriores: ${previous}. ${metricTrendLabel(trend)}.`;
}

function metricValue(summary: any, key: string) {
  return summary?.[key] ?? '—';
}

export function UnifiedHome() {
  const { user, roles, profiles, organizationId, hasPermission } = useAuth();
  const { data } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<{ temperature: number; code: number } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const canViewSummary = hasPermission('dashboard', 'view');
  const [summary, setSummary] = useState<any>(null);
  const [metricTrends, setMetricTrends] = useState<Partial<Record<'sales_today_total' | 'quotes_this_month', MetricTrend>>>({});
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
  const city = weatherCityFromLocation(String(data?.settings?.location || 'Milagro, Ecuador'));
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
  const workspaceToolCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);
  const visibleMetrics = canViewSummary
    ? metricCards.filter(({ module, to }) => hasPermission(module, 'view') && availableLinks.some((item) => item.to === to)).sort((a, b) => {
      const ai = roleOrder.indexOf(a.module); const bi = roleOrder.indexOf(b.module);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    })
    : [];
  const canViewSalesTrend = visibleMetrics.some(({ key }) => key === 'sales_today_total');
  const canViewQuotesTrend = visibleMetrics.some(({ key }) => key === 'quotes_this_month');
  const quickLinks = visibleGroups.flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label }))).slice(0, 4);
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

  useEffect(() => {
    if (!supabase || !organizationId || (!canViewSalesTrend && !canViewQuotesTrend)) {
      setMetricTrends({});
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setMetricTrends({});
    const todayKey = guayaquilDateKey(new Date());
    const from = `${shiftDateKey(todayKey, -13)}T00:00:00-05:00`;
    const to = `${shiftDateKey(todayKey, 1)}T00:00:00-05:00`;

    void (async () => {
      const salesQuery = canViewSalesTrend
        ? supabase.from('sales').select('created_at,total', { count: 'exact' })
          .eq('organization_id', organizationId).eq('status', 'confirmed')
          .gte('created_at', from).lt('created_at', to).order('created_at', { ascending: true })
          .limit(1000).abortSignal(controller.signal)
        : Promise.resolve(null);
      const quotesQuery = canViewQuotesTrend
        ? supabase.from('central_quotes').select('created_at', { count: 'exact' })
          .eq('organization_id', organizationId).gte('created_at', from).lt('created_at', to)
          .order('created_at', { ascending: true }).limit(1000).abortSignal(controller.signal)
        : Promise.resolve(null);

      const [salesResult, quotesResult] = await Promise.all([salesQuery, quotesQuery]);
      if (!active) return;

      const nextTrends: Partial<Record<'sales_today_total' | 'quotes_this_month', MetricTrend>> = {};
      if (salesResult && !salesResult.error && salesResult.data
        && (salesResult.count === null || salesResult.count <= salesResult.data.length)
        && (salesResult.count !== null || salesResult.data.length < 1000)) {
        nextTrends.sales_today_total = dailyMetricTrend(salesResult.data, 'sales', todayKey);
      }
      if (quotesResult && !quotesResult.error && quotesResult.data
        && (quotesResult.count === null || quotesResult.count <= quotesResult.data.length)
        && (quotesResult.count !== null || quotesResult.data.length < 1000)) {
        nextTrends.quotes_this_month = dailyMetricTrend(quotesResult.data, 'quotes', todayKey);
      }
      setMetricTrends(nextTrends);
    })().catch(() => {
      if (active) setMetricTrends({});
    });

    return () => { active = false; controller.abort(); };
  }, [canViewSalesTrend, canViewQuotesTrend, organizationId, refreshKey]);

  const updatedAt = summary?.as_of && Number.isFinite(Date.parse(summary.as_of))
    ? new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' }).format(new Date(summary.as_of))
    : '';
  const currentTime = new Intl.DateTimeFormat('es-EC', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Guayaquil' }).format(now).replace(/\s/g, '\u00a0');
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
          <a className="unified-dashboard-action" href="#dashboard-shortcuts">Ver accesos directos <ArrowUpRight size={17} aria-hidden="true"/></a>
          </div>
        </div>
      </header>
    {quickLinks.length > 0 && <section className="dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-heading" id="dashboard-shortcuts">
      <div className="dashboard-section-heading"><div><span className="eyebrow">ACCESOS CLAVE · {primaryRole}</span><h2 id="dashboard-shortcuts-heading">Tus herramientas para empezar</h2><p>Atajos según tu perfil y permisos; las demás herramientas siguen disponibles más abajo.</p></div><span className="dashboard-shortcut-count">{quickLinks.length} de {workspaceToolCount} herramientas</span></div>
      <AnimatedList className={`dashboard-shortcut-grid${quickLinks.length === 4 ? ' has-four-shortcuts' : ''}`} itemClassName="dashboard-shortcut-item" stagger={0.055}>
        {quickLinks.map(({ to, label, icon: Icon, groupLabel }, index) => <Link key={to} className={`dashboard-shortcut vc-magic-card${index === 0 ? ' is-featured' : ''}`} to={to} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
          <SpotlightLayer/>
          {index === 0 && <span className="dashboard-shortcut-art" aria-hidden="true"><span className="dashboard-shortcut-art-back"/><span className="dashboard-shortcut-art-orbit"/><span className="dashboard-shortcut-art-front"><Icon size={46}/></span></span>}
          <span className="dashboard-shortcut-top">{index !== 0 && <span className="dashboard-shortcut-icon"><Icon size={19} aria-hidden="true"/></span>}<span className="dashboard-shortcut-area">{groupLabel}</span><ArrowUpRight className="dashboard-shortcut-open" size={17} aria-hidden="true"/></span>
          <strong>{label}</strong><small>{descriptions[to] || 'Consulta y gestiona los registros de este módulo.'}</small>
          <span className="dashboard-shortcut-cta">Abrir herramienta <ArrowUpRight size={14} aria-hidden="true"/></span>
        </Link>)}
        <a className="dashboard-shortcut dashboard-shortcut-explore vc-magic-card" href="#dashboard-all-tools" onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight}>
          <SpotlightLayer/>
          <span className="dashboard-shortcut-top"><span className="dashboard-shortcut-icon"><LayoutGrid size={19} aria-hidden="true"/></span><span className="dashboard-shortcut-area">TU ESPACIO</span><ArrowUpRight className="dashboard-shortcut-open" size={17} aria-hidden="true"/></span>
          <strong>Explora tus herramientas</strong><small>Busca por área, filtra opciones y guarda tus favoritas.</small>
          <span className="dashboard-shortcut-cta">Ver todas las áreas <ArrowUpRight size={14} aria-hidden="true"/></span>
        </a>
      </AnimatedList>
    </section>}
    {error && <div className="unified-summary-error" role="alert"><span>{error}</span><button type="button" className="button button-outline" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={14}/> {loading ? 'Actualizando…' : 'Reintentar'}</button></div>}
    {visibleMetrics.length > 0 && <section className="unified-overview" aria-label={`Indicadores disponibles para ${primaryRole}`}><div className="unified-overview-heading"><div><span className="eyebrow">INDICADORES DISPONIBLES</span><p>Datos reales, organizados por periodo y permisos de tu perfil.</p></div><button type="button" className="unified-refresh" onClick={() => setRefreshKey(value => value + 1)} disabled={loading}><RefreshCw size={14} aria-hidden="true"/>{loading ? 'Actualizando…' : 'Actualizar resumen'}</button></div><div className="stat-grid unified-stat-grid">{visibleMetrics.map(({ module, to, key, label, scope, note, noteKey, icon: Icon, tone, money }) => {
      const value = metricValue(summary, key);
      const trend = key === 'sales_today_total' || key === 'quotes_this_month' ? metricTrends[key] : undefined;
      const initialLoading = loading && !summary;
      const displayValue = initialLoading
        ? <Skeleton className="dashboard-metric-skeleton"/>
        : money && typeof value === 'number'
          ? formatMoney(value)
          : typeof value === 'number' ? <NumberTicker value={value}/> : value;
      const noteValue = noteKey ? summary?.[noteKey] : null;
      const detail = error
        ? 'Dato anterior · sin actualizar'
        : typeof noteValue === 'number' && noteKey === 'sales_today_count'
          ? `${noteValue} ${noteValue === 1 ? 'venta confirmada' : 'ventas confirmadas'} hoy`
          : typeof noteValue === 'number' && noteKey === 'inventory_low_stock'
            ? `${noteValue} ${noteValue === 1 ? 'artículo en' : 'artículos en'} nivel mínimo`
            : note;
      const trendMax = trend ? Math.max(0, ...trend.points.map((point) => point.value)) : 0;
      const trendAccessibleLabel = trend ? metricTrendAccessibleLabel(trend, Boolean(money)) : '';
      return <Link key={module} className={`unified-metric-link vc-magic-card metric-${tone}`} to={to} onPointerMove={updateSpotlight} onPointerLeave={clearSpotlight} aria-label={`${label}: ${typeof value === 'number' ? value : value}. ${detail}. ${trendAccessibleLabel} Abrir módulo`}>
        <SpotlightLayer/>
        <span className={`dashboard-metric-icon tone-${tone}`}><Icon size={19} aria-hidden="true"/></span><span className="dashboard-metric-scope">{error ? 'SIN ACTUALIZAR' : scope}</span><span className="unified-metric-open" aria-hidden="true"><ArrowUpRight size={16}/></span>
        <strong className="dashboard-metric-value">{displayValue}</strong><span className="dashboard-metric-label">{label}</span><small className="dashboard-metric-note">{detail}</small>
        {trend && <span className="dashboard-metric-trend">
          <span className="dashboard-metric-trend-heading"><span>{money ? 'VENTAS' : 'COTIZACIONES'} · 14 DÍAS</span><strong>{trend.changePercent !== null && trend.changePercent !== 0 && (trend.changePercent > 0 ? <TrendingUp size={12} aria-hidden="true"/> : <TrendingDown size={12} aria-hidden="true"/>)}{metricTrendLabel(trend)}</strong></span>
          <span className="dashboard-metric-trend-bars" aria-hidden="true">{trend.points.map((point, index) => {
            const height = trendMax > 0 ? Math.max(8, Math.round((point.value / trendMax) * 100)) : 5;
            const valueLabel = money ? formatMoney(point.value) : `${point.value} ${point.value === 1 ? 'cotización' : 'cotizaciones'}`;
            return <span key={point.key} className={index === trend.points.length - 1 ? 'is-today' : ''} style={{ height: `${height}%` }} title={`${point.fullLabel}: ${valueLabel}`}/>;
          })}</span>
          <span className="dashboard-metric-trend-axis" aria-hidden="true"><span>Hace 13 días</span><span>Hoy</span></span>
        </span>}
      </Link>;
    })}</div></section>}
    {canViewSummary && (hasPermission('crm', 'view') || hasPermission('inventory', 'view')) ? <section className="panel unified-priority-panel" aria-labelledby="unified-priority-heading">
      <div className="panel-heading"><div><span className="eyebrow">SIGUIENTE PASO</span><h2 id="unified-priority-heading">Pendientes que puedes atender</h2></div>{loading ? <span className="unified-priority-state">Actualizando</span> : error ? <span className="unified-priority-state">Sin actualizar</span> : priorities.length ? <span className="unified-priority-state has-items">{priorities.length} {priorities.length === 1 ? 'pendiente' : 'pendientes'}</span> : priorityDataComplete ? <span className="unified-priority-state is-clear"><CheckCircle2 size={15}/> Sin alertas</span> : <span className="unified-priority-state">Sin datos</span>}</div>
      {error ? <p className="unified-priority-empty">No se muestran pendientes hasta confirmar que la información está actualizada.</p> : loading ? <div className="unified-priority-loading" role="status"><span className="sr-only">Consultando los registros autorizados para tu perfil</span><Skeleton className="dashboard-priority-skeleton"/><Skeleton className="dashboard-priority-skeleton is-short"/></div> : priorities.length ? <div className="unified-priority-list">{priorities.map(({ key, to, icon: Icon, title, detail, count }) => <Link className="unified-priority-item" to={to} key={key}><span className={`unified-priority-icon ${key}`}><Icon size={18}/></span><span className="unified-priority-copy"><b>{title}</b><small>{detail}</small></span><span className="unified-priority-count">{count}</span><ArrowUpRight size={16} aria-hidden="true"/></Link>)}</div> : priorityDataComplete ? <p className="unified-priority-empty">No se detectan pendientes en los módulos visibles para tu perfil.</p> : <p className="unified-priority-empty">No se recibieron datos suficientes para confirmar si hay pendientes.</p>}
    </section> : null}
    <div id="dashboard-all-tools" className="dashboard-all-tools"><WorkspaceLauncher key={user?.id || 'anonymous'} userId={user?.id || 'anonymous'} groups={visibleGroups} descriptions={descriptions} heading={`Herramientas para ${primaryRole}`}/></div>
    {hasPermission('crm', 'view') && <section className="panel unified-recent-panel"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO COMERCIAL</span><h2>Solicitudes recientes</h2></div><Link className="text-link" to="/operaciones/crm">Abrir CRM <ArrowUpRight size={14}/></Link></div><LeadsTable/></section>}
    {hasPermission('team', 'view') && <ChangeLogPanel area="operations" compact/>}
    </div>
  </AppFrame>;
}
