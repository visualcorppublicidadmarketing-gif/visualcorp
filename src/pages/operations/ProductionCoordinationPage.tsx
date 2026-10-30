import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Clock3, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState } from '../../components/feedback';
import { supabase } from '../../lib/supabaseClient';
import './production-coordination.css';

type Job = {
  id: string; sale_id: string; sale_code: string | null; title: string; workflow_code: string;
  status: string; due_at: string | null; updated_at: string; advisor_id: string | null;
  fulfillment_status: string | null; fulfillment_due_at: string | null; approval_required: boolean;
  artwork_review_status: string | null; can_open_detail: boolean;
  lot_summary: null | { unit: string; total: number; in_production: number; quality_check: number; ready_for_delivery: number; scheduled: number; delivered: number; installed: number };
};
type Step = {
  id: string; job_id: string; step_order: number; title: string; status: string;
  due_at: string | null; assigned: boolean; handoff_status: string | null;
  area_id: string; area_code: string; area_name: string; readiness_reasons: Array<{ code: string; message: string }> | null;
};
type LegacyOrder = {
  id: string; order_code: string; title: string; next_step: string | null;
  priority: string; due_at: string | null; status: string; assigned: boolean;
  area_id: string | null; area_code: string | null; area_name: string | null; can_open_detail: boolean;
};
type JobItem = { job: Job; steps: Step[]; current: Step | null };
type Filter = 'all' | 'attention' | 'blocked' | 'quality' | 'delivery';
const PAGE_SIZE = 50;
const AREA_SLUG: Record<string, string> = { ASE: 'asesoria', DIS: 'diseno', IMP: 'impresion', SUB: 'sublimacion', LAS: 'laser', TAL: 'taller' };
const AREA_NAMES: Record<string, string> = { ASE: 'Asesoría', DIS: 'Diseño', IMP: 'Impresión', SUB: 'Sublimación', LAS: 'Corte láser', TAL: 'Taller' };
const localDay = (value: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
};
const dateLabel = (value: string | null) => value
  ? Number.isNaN(new Date(value).getTime()) ? 'Fecha no válida' : new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Fecha pendiente';
const isLate = (value: string | null) => Boolean(value && localDay(value) < localDay(new Date().toISOString()));
const active = (step: Step) => ['ready', 'in_progress', 'blocked'].includes(step.status);

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todos los trabajos' }, { key: 'attention', label: 'Requieren atención' },
  { key: 'blocked', label: 'Bloqueados' }, { key: 'quality', label: 'Calidad' }, { key: 'delivery', label: 'Entrega' },
];

export function ProductionCoordinationPage() {
  const { organizationId, hasPermission } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [legacyOrders, setLegacyOrders] = useState<LegacyOrder[]>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const canView = hasPermission('sales', 'view') || hasPermission('workshop', 'view');

  const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
    if (!supabase || !organizationId || !canView) return;
    replace ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const from = nextPage * PAGE_SIZE;
      const boardResult = await supabase.rpc('list_production_coordination_jobs', { p_organization_id: organizationId, p_limit: PAGE_SIZE, p_offset: from });
      if (boardResult.error) throw boardResult.error;
      const board = (boardResult.data || { total: 0, items: [] }) as { total: number; items: Array<{ source: string; job?: Job; steps?: Step[]; order?: LegacyOrder }> };
      const pageJobs = board.items.filter((item) => item.source === 'job' && item.job).map((item) => item.job!) as Job[];
      const pageSteps = board.items.filter((item) => item.source === 'job').flatMap((item) => item.steps || []) as Step[];
      const pageLegacy = board.items.filter((item) => item.source === 'legacy' && item.order).map((item) => item.order!) as LegacyOrder[];
      setJobs((current) => replace ? pageJobs : [...current, ...pageJobs]);
      setLegacyOrders((current) => replace ? pageLegacy : [...current, ...pageLegacy]);
      setSteps((current) => replace ? pageSteps : [...current, ...pageSteps]);
      setCount(board.total || 0);
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar la coordinación de trabajos.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [canView, organizationId]);

  useEffect(() => { void loadPage(0, true); }, [loadPage]);

  const items = useMemo<JobItem[]>(() => jobs.map((job) => {
    const jobSteps = steps.filter((step) => step.job_id === job.id).sort((a, b) => a.step_order - b.step_order);
    const current = jobSteps.find(active) || jobSteps.find((step) => step.status === 'waiting') || null;
    return { job, steps: jobSteps, current };
  }), [jobs, steps]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es');
    return items.filter(({ job, current }) => {
      if (areaFilter !== 'all' && current?.area_code !== areaFilter) return false;
      if (filter === 'attention' && !(current?.status === 'blocked' || isLate(current?.due_at || job.due_at) || current?.status === 'ready' && !current.assigned || job.approval_required && job.artwork_review_status !== 'approved')) return false;
      if (filter === 'blocked' && current?.status !== 'blocked') return false;
      if (filter === 'quality' && job.fulfillment_status !== 'quality_check' && !(Number(job.lot_summary?.quality_check) > 0)) return false;
      if (filter === 'delivery' && !['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') && !(Number(job.lot_summary?.ready_for_delivery) > 0 || Number(job.lot_summary?.scheduled) > 0)) return false;
      if (needle && !`${job.sale_code || ''} ${job.title} ${current?.area_name || ''} ${current?.title || ''}`.toLocaleLowerCase('es').includes(needle)) return false;
      return true;
    });
  }, [areaFilter, filter, items, query]);
  const visibleLegacy = useMemo(() => legacyOrders.filter((order) => {
    if (areaFilter !== 'all' && order.area_code !== areaFilter) return false;
    if (filter === 'blocked' && order.status !== 'blocked') return false;
    if (filter === 'quality' && order.status !== 'quality_review') return false;
    if (filter === 'delivery' && order.status !== 'ready') return false;
    if (filter === 'attention' && order.status !== 'blocked' && !isLate(order.due_at) && !(order.status === 'queued' && !order.assigned)) return false;
    const needle = query.trim().toLocaleLowerCase('es');
    return !needle || `${order.order_code} ${order.title} ${order.next_step || ''} ${order.area_name || ''}`.toLocaleLowerCase('es').includes(needle);
  }), [areaFilter, filter, legacyOrders, query]);
  const attentionCount = items.filter(({ job, current }) => current?.status === 'blocked' || isLate(current?.due_at || job.due_at) || current?.status === 'ready' && !current.assigned || job.approval_required && job.artwork_review_status !== 'approved').length + legacyOrders.filter((order) => order.status === 'blocked' || isLate(order.due_at) || order.status === 'queued' && !order.assigned).length;
  const blockedCount = items.filter(({ current }) => current?.status === 'blocked').length + legacyOrders.filter((order) => order.status === 'blocked').length;
  const qualityCount = items.filter(({ job }) => job.fulfillment_status === 'quality_check' || Number(job.lot_summary?.quality_check) > 0).length + legacyOrders.filter((order) => order.status === 'quality_review').length;
  const deliveryCount = items.filter(({ job }) => ['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') || Number(job.lot_summary?.ready_for_delivery) > 0 || Number(job.lot_summary?.scheduled) > 0).length + legacyOrders.filter((order) => order.status === 'ready').length;
  const filterCount = (key: Filter) => key === 'attention' ? attentionCount : key === 'blocked' ? blockedCount : key === 'quality' ? qualityCount : key === 'delivery' ? deliveryCount : count;

  if (!canView) return <AppFrame area="operations"><main className="pc-page"><EmptyState icon={ClipboardList} title="Acceso restringido" text="Tu perfil no tiene acceso a la coordinación de trabajos."/></main></AppFrame>;

  return <AppFrame area="operations"><main className="pc-page">
    <PageHeading eyebrow="OPERACIONES · PRODUCCIÓN" title="Coordinación de trabajos" description="Vista compartida de Diseño, Asesoría, Impresión, Sublimación, Corte láser y Taller. Abre cada ficha para asignar, recibir, revisar calidad o registrar avances." action={<button className="button button-outline" type="button" onClick={() => void loadPage(0, true)} disabled={loading}><RefreshCw size={15}/> Actualizar</button>}/>
    <section className="pc-summary" aria-label="Resumen del trabajo cargado">
      <div><span><ClipboardList size={15}/> En curso</span><b>{count}</b></div>
      <div data-tone="amber"><span><AlertTriangle size={15}/> Atención</span><b>{attentionCount}</b></div>
      <div data-tone="violet"><span><ShieldCheck size={15}/> Calidad</span><b>{qualityCount}</b></div>
      <div data-tone="green"><span><CheckCircle2 size={15}/> Listos para entrega</span><b>{deliveryCount}</b></div>
    </section>
    <p className="pc-summary-note">Los indicadores de atención, calidad y entrega corresponden a los trabajos ya cargados; usa «Cargar más» para ampliar el recorrido.</p>
    <section className="pc-controls" aria-label="Filtros de trabajos">
      <label className="pc-search"><Search size={15}/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar referencia, artículo o etapa" aria-label="Buscar trabajo"/></label>
      <label className="pc-area-filter">Área<select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">Todas las áreas</option>{Object.entries(AREA_NAMES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
    </section>
    <div className="pc-filter-row" role="group" aria-label="Estado de trabajos">{FILTERS.map((item) => <button type="button" key={item.key} className={filter === item.key ? 'is-active' : ''} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}<span>{filterCount(item.key)}</span></button>)}</div>
    {error && <div className="pc-error" role="alert">{error}<button type="button" className="button button-outline" onClick={() => void loadPage(0, true)}>Reintentar</button></div>}
    {loading ? <div className="pc-empty" role="status">Cargando trabajos…</div> : visible.length || visibleLegacy.length ? <section className="pc-list" aria-label="Trabajos activos">
      {visible.map(({ job, steps: jobSteps, current }) => {
        const areaName = current?.area_name || AREA_NAMES[current?.area_code || 'ASE'] || 'Asesoría';
        const areaSlug = AREA_SLUG[current?.area_code || 'ASE'];
        const deadline = current?.due_at || job.due_at;
        const owner = current?.assigned ? 'Responsable asignado' : null;
        return <article className="pc-order" key={job.id}>
          <div className="pc-order-main"><div className="pc-order-title"><span>{job.sale_code || 'Pedido activo'}</span><h2>{job.title}</h2></div><span className={`pc-status${current?.status === 'blocked' ? ' is-blocked' : ''}`}>{current?.status === 'blocked' ? 'Bloqueado' : current?.status === 'in_progress' ? 'En proceso' : current?.status === 'ready' ? 'Lista para iniciar' : current?.status === 'waiting' ? 'En espera' : 'Revisar ficha'}</span></div>
          <div className="pc-order-facts"><div><small>Área y siguiente paso</small><b>{areaName} · {current?.title || 'Definir ruta'}</b>{current?.readiness_reasons?.length ? <span>{current.readiness_reasons[0].message}</span> : null}</div><div><small>Responsable</small><b>{owner || 'Sin asignar'}</b></div><div className={isLate(deadline) ? 'is-late' : ''}><small>Fecha límite</small><b><CalendarClock size={14}/>{dateLabel(deadline)}</b></div><div><small>Avance</small><b><Clock3 size={14}/>{jobSteps.filter((step) => step.status === 'completed').length} de {jobSteps.length} etapas</b></div></div>
          <div className="pc-order-bottom"><span>{job.lot_summary ? `${Number(job.lot_summary.in_production || 0).toLocaleString('es-EC')} ${job.lot_summary.unit} en producción · ${Number(job.lot_summary.quality_check || 0).toLocaleString('es-EC')} ${job.lot_summary.unit} en calidad · ${Number(job.lot_summary.delivered || 0).toLocaleString('es-EC')} ${job.lot_summary.unit} entregados` : job.approval_required && job.artwork_review_status !== 'approved' ? 'Arte pendiente de revisión' : job.fulfillment_status === 'quality_check' ? 'Calidad pendiente' : job.fulfillment_status === 'ready_for_delivery' || job.fulfillment_status === 'scheduled' ? 'Entrega pendiente' : 'Flujo activo'}{job.fulfillment_due_at ? ` · ${dateLabel(job.fulfillment_due_at)}` : ''}</span>{job.can_open_detail && areaSlug ? <Link className="button button-outline" to={`/operaciones/trabajos/${areaSlug}?job=${encodeURIComponent(job.id)}`}>Abrir ficha <ArrowRight size={14}/></Link> : <span>Ficha reservada a su responsable o al área</span>}</div>
        </article>;
      })}
      {visibleLegacy.map((order) => <article className="pc-order pc-order-legacy" key={`legacy-${order.id}`}>
        <div className="pc-order-main"><div className="pc-order-title"><span>Orden interna · {order.order_code}</span><h2>{order.title}</h2></div><span className={`pc-status${order.status === 'blocked' ? ' is-blocked' : ''}`}>{order.status === 'blocked' ? 'Bloqueada' : order.status === 'in_progress' ? 'En proceso' : order.status === 'ready' ? 'Lista para iniciar' : 'En curso'}</span></div>
        <div className="pc-order-facts"><div><small>Área y siguiente paso</small><b>{order.area_name || 'Sin área'} · {order.next_step || 'Continuar orden'}</b></div><div><small>Responsable</small><b>{order.assigned ? 'Responsable asignado' : 'Sin asignar'}</b></div><div className={isLate(order.due_at) ? 'is-late' : ''}><small>Fecha límite</small><b><CalendarClock size={14}/>{dateLabel(order.due_at)}</b></div><div><small>Prioridad</small><b>{order.priority || 'Normal'}</b></div></div>
        <div className="pc-order-bottom"><span>Registro heredado de órdenes internas</span>{order.can_open_detail && <Link className="button button-outline" to="/operaciones/flujos">Abrir flujos <ArrowRight size={14}/></Link>}</div>
      </article>)}
      {!visible.length && !visibleLegacy.length && <div className="pc-empty">No hay coincidencias entre los trabajos cargados. Amplía la lista para buscar en más registros.</div>}
    </section> : <div className="pc-empty">No hay trabajos activos para mostrar.</div>}
    {jobs.length + legacyOrders.length < count && <div className="pc-more"><button className="button button-outline" type="button" disabled={loadingMore} onClick={() => void loadPage(page + 1, false)}>{loadingMore ? 'Cargando…' : 'Cargar más trabajos'} <ArrowRight size={14}/></button><span>{jobs.length + legacyOrders.length} de {count}</span></div>}
  </main></AppFrame>;
}
