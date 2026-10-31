import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Clock3, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState } from '../../components/feedback';
import { supabase } from '../../lib/supabaseClient';
import { ProductionQueueViews, type ProductionQueueViewItem } from './ProductionQueueViews';
import './production-coordination.css';

type Job = {
  id: string; sale_id: string; sale_code: string | null; title: string; workflow_code: string;
  status: string; due_at: string | null; updated_at: string; advisor_id: string | null;
  fulfillment_status: string | null; fulfillment_due_at: string | null; approval_required: boolean;
  artwork_review_status: string | null; can_open_detail: boolean;
  lot_summary: null | { unit: string; total: number; in_production: number; quality_check: number; ready_for_delivery: number; scheduled: number; delivered: number; installed: number };
  balance_due?: boolean;
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
type Filter = 'all' | 'attention' | 'blocked' | 'quality' | 'delivery' | 'balance';
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
  { key: 'balance', label: 'Saldo pendiente' },
];

export function ProductionCoordinationPage() {
  const { organizationId, hasPermission } = useAuth();
  const navigate = useNavigate();
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
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
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
      const balanceResult = pageJobs.length ? await supabase.rpc('list_production_job_balance_flags', { p_organization_id: organizationId, p_job_ids: pageJobs.map((job) => job.id) }) : { data: [], error: null };
      setBalanceUnavailable(Boolean(balanceResult.error));
      const balanceFlags = new Set<string>(((balanceResult.data || []) as Array<{ job_id: string; balance_due: boolean }>).filter((entry) => entry.balance_due).map((entry) => entry.job_id));
      const enrichedJobs = pageJobs.map((job) => ({ ...job, balance_due: balanceFlags.has(job.id) }));
      setJobs((current) => replace ? enrichedJobs : [...current, ...enrichedJobs]);
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
      if (filter === 'balance' && !job.balance_due) return false;
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
  type QueueOriginal = { kind: 'job'; job: Job; steps: Step[]; current: Step | null } | { kind: 'legacy'; order: LegacyOrder };
  const viewItems = useMemo<ProductionQueueViewItem<QueueOriginal>[]>(() => [
    ...visible.map(({ job, steps: jobSteps, current }) => {
      const dueAt = current?.due_at || job.fulfillment_due_at || job.due_at;
      const status = current?.status || (job.fulfillment_status === 'ready_for_delivery' || job.fulfillment_status === 'scheduled' ? 'completed' : job.status === 'completed' ? 'completed' : 'waiting');
      const statusLabel = status === 'blocked' ? 'Bloqueado' : status === 'in_progress' ? 'En proceso' : status === 'ready' ? 'Lista para iniciar' : status === 'completed' ? 'Entrega / producción terminada' : status === 'waiting' ? 'En espera' : status;
      return { id: job.id, title: job.title, code: job.sale_code || 'Pedido', customer: AREA_NAMES[current?.area_code || 'ASE'] || 'Producción', dueAt, dueKey: localDay(dueAt), status, statusLabel, ownerLabel: current?.assigned ? 'Asignado' : 'Sin asignar', overdue: isLate(dueAt), original: { kind: 'job' as const, job, steps: jobSteps, current } };
    }),
    ...visibleLegacy.map((order) => ({ id: `legacy-${order.id}`, title: order.title, code: order.order_code, customer: order.area_name || 'Orden interna', dueAt: order.due_at, dueKey: localDay(order.due_at), status: order.status === 'queued' ? 'ready' : order.status === 'quality_review' ? 'in_progress' : order.status, statusLabel: order.status === 'blocked' ? 'Bloqueada' : order.status === 'quality_review' ? 'Control de calidad' : order.status === 'ready' ? 'Lista para iniciar' : order.status === 'queued' ? 'En espera' : order.status, ownerLabel: order.assigned ? 'Asignado' : 'Sin asignar', overdue: isLate(order.due_at), original: { kind: 'legacy' as const, order } })),
  ], [visible, visibleLegacy]);
  const openQueueItem = (item: ProductionQueueViewItem<QueueOriginal>) => {
    if (item.original.kind === 'legacy') { if (item.original.order.can_open_detail) navigate('/operaciones/flujos'); return; }
    const { job, current } = item.original;
    if (!job.can_open_detail) return;
    const slug = AREA_SLUG[current?.area_code || 'ASE'] || 'asesoria';
    navigate(`/operaciones/trabajos/${slug}?job=${encodeURIComponent(job.id)}`);
  };
  const renderQueueCard = (item: ProductionQueueViewItem<QueueOriginal>, compact = false) => {
    if (item.original.kind === 'legacy') return <article className="pc-order pc-order-legacy"><div className="pc-order-main"><div className="pc-order-title"><span>Orden interna · {item.code}</span><h2>{item.title}</h2></div><span className="pc-status">{item.statusLabel}</span></div><div className="pc-order-bottom"><span>{item.ownerLabel} · {dateLabel(item.dueAt)}</span>{item.original.order.can_open_detail && <Link className="button button-outline" to="/operaciones/flujos">Abrir flujos <ArrowRight size={14}/></Link>}</div></article>;
    const { job, steps: jobSteps, current } = item.original;
    const canOpen = job.can_open_detail;
    const statusClass = current?.status === 'blocked' ? ' is-blocked' : '';
    return <article className={`pc-order${compact ? ' is-compact' : ''}`}><div className="pc-order-main"><div className="pc-order-title"><span>{job.sale_code || 'Pedido activo'}</span><h2>{job.title}</h2></div><span className={`pc-status${statusClass}`}>{item.statusLabel}</span></div><div className="pc-order-facts"><div><small>Área y siguiente paso</small><b>{current?.area_name || AREA_NAMES[current?.area_code || 'ASE']} · {current?.title || 'Revisar entrega'}</b>{current?.readiness_reasons?.[0] && <span>{current.readiness_reasons[0].message}</span>}</div><div><small>Responsable</small><b>{item.ownerLabel}</b></div><div className={item.overdue ? 'is-late' : ''}><small>Fecha límite</small><b><CalendarClock size={14}/>{dateLabel(item.dueAt)}</b></div><div><small>Avance</small><b><Clock3 size={14}/>{jobSteps.filter((step) => step.status === 'completed').length} de {jobSteps.length} etapas</b></div></div><div className="pc-order-bottom"><span>{job.fulfillment_status === 'quality_check' ? 'Calidad pendiente' : ['ready_for_delivery','scheduled'].includes(job.fulfillment_status || '') ? 'Pendiente de retiro / entrega' : job.approval_required && job.artwork_review_status !== 'approved' ? 'Arte pendiente de revisión' : 'Flujo activo'}{job.balance_due ? ' · ⚠ saldo pendiente' : ''}</span>{canOpen ? <Link className="button button-outline" to={`/operaciones/trabajos/${AREA_SLUG[current?.area_code || 'ASE'] || 'asesoria'}?job=${encodeURIComponent(job.id)}`}>Abrir ficha <ArrowRight size={14}/></Link> : <span>Ficha reservada</span>}</div></article>;
  };
  const attentionCount = items.filter(({ job, current }) => current?.status === 'blocked' || isLate(current?.due_at || job.due_at) || current?.status === 'ready' && !current.assigned || job.approval_required && job.artwork_review_status !== 'approved').length + legacyOrders.filter((order) => order.status === 'blocked' || isLate(order.due_at) || order.status === 'queued' && !order.assigned).length;
  const blockedCount = items.filter(({ current }) => current?.status === 'blocked').length + legacyOrders.filter((order) => order.status === 'blocked').length;
  const qualityCount = items.filter(({ job }) => job.fulfillment_status === 'quality_check' || Number(job.lot_summary?.quality_check) > 0).length + legacyOrders.filter((order) => order.status === 'quality_review').length;
  const deliveryCount = items.filter(({ job }) => ['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') || Number(job.lot_summary?.ready_for_delivery) > 0 || Number(job.lot_summary?.scheduled) > 0).length + legacyOrders.filter((order) => order.status === 'ready').length;
  const balanceCount = items.filter(({ job }) => job.balance_due).length;
  const filterCount = (key: Filter) => key === 'attention' ? attentionCount : key === 'blocked' ? blockedCount : key === 'quality' ? qualityCount : key === 'delivery' ? deliveryCount : key === 'balance' ? balanceCount : count;

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
    {balanceUnavailable && <div className="pc-balance-warning" role="status"><AlertTriangle size={15}/> Los trabajos están cargados, pero no se pudo verificar el saldo de algunos pedidos. Actualiza la vista para reintentar.</div>}
    {loading ? <div className="pc-empty" role="status">Cargando trabajos…</div> : viewItems.length ? <ProductionQueueViews areaSlug="coordinacion" areaName="Coordinación de trabajos" items={viewItems} today={localDay(new Date().toISOString())} renderCard={renderQueueCard} onOpen={openQueueItem}/> : <div className="pc-empty">No hay coincidencias entre los trabajos cargados.</div>}
    {jobs.length + legacyOrders.length < count && <div className="pc-more"><button className="button button-outline" type="button" disabled={loadingMore} onClick={() => void loadPage(page + 1, false)}>{loadingMore ? 'Cargando…' : 'Cargar más trabajos'} <ArrowRight size={14}/></button><span>{jobs.length + legacyOrders.length} de {count}</span></div>}
  </main></AppFrame>;
}
