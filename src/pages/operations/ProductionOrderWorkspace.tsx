import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  ClipboardList,
  ExternalLink,
  Factory,
  LoaderCircle,
  Save,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { normalizePersonName } from '../../lib/personName';
import { supabase } from '../../lib/supabaseClient';
import { DatePicker } from '../../components/ui/Calendar';
import {
  type JobStatus,
  type ProductionJob,
  type ProductionStep,
  type StepStatus,
  JOB_STATUS_LABELS,
  STEP_STATUS_LABELS,
  currentStage,
  isDateOverdue,
  stamp,
} from '../../lib/productionHub';
import './production-order-workspace.css';

type OrderDraft = {
  branch: string;
  area: string;
  title: string;
  description: string;
  priority: string;
  due: string;
  sale: string;
  assignedTo: string;
  nextStep: string;
};

type HandoffDraft = {
  assignedTo: string;
  areaId: string;
  due: string;
  description: string;
  nextStep: string;
  note: string;
};

type Props = {
  branches: any[];
  areas: any[];
  sales: any[];
  orders: any[];
  events: any[];
  teamMembers: any[];
  orderForm: OrderDraft;
  setOrderForm: React.Dispatch<React.SetStateAction<OrderDraft>>;
  busy: boolean;
  canManage: boolean;
  hasData: boolean;
  hasMoreOrders: boolean;
  loadingMoreOrders: boolean;
  onLoadMoreOrders: () => void;
  onRetry: () => void;
  onCreate: () => void;
  onStatusChange: (order: any, status: string, note: string) => void;
  onSaveHandoff: (order: any, draft: HandoffDraft) => Promise<unknown>;
  jobs?: ProductionJob[];
  jobSteps?: ProductionStep[];
  onOpenJobDetail?: (jobId: string) => void;
};

const statusLabels: Record<string, string> = {
  queued: 'En cola',
  in_progress: 'En proceso',
  blocked: 'Bloqueada',
  quality_review: 'Control de calidad',
  ready: 'Lista para entrega',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const priorityLabels: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const dayValue = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-CA') : '');

export function ProductionOrderWorkspace({
  branches,
  areas,
  sales,
  orders,
  events,
  teamMembers,
  orderForm,
  setOrderForm,
  busy,
  canManage,
  hasData,
  hasMoreOrders,
  loadingMoreOrders,
  onLoadMoreOrders,
  onRetry,
  onCreate,
  onStatusChange,
  onSaveHandoff,
  jobs = [],
  jobSteps = [],
  onOpenJobDetail,
}: Props) {
  const { organizationId } = useAuth();

  // Estados para Trabajos de Producción vigentes (production_jobs)
  const [jobStatusFilter, setJobStatusFilter] = useState<'all' | 'open' | 'needs_review' | 'blocked' | 'overdue' | 'completed'>('open');
  const [jobBranchFilter, setJobBranchFilter] = useState('');
  const [jobSearch, setJobSearch] = useState('');

  // Estados para Órdenes heredadas (production_orders)
  const [statusFilter, setStatusFilter] = useState('open');
  const [branchFilter, setBranchFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [handoffs, setHandoffs] = useState<Record<string, HandoffDraft>>({});
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [exactOrderCounts, setExactOrderCounts] = useState({
    open: null as number | null,
    overdue: null as number | null,
    blocked: null as number | null,
    ready: null as number | null,
  });
  const [orderCountStatus, setOrderCountStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showLegacyCreate, setShowLegacyCreate] = useState(false);

  const members = teamMembers.filter((member) => member.active);

  // Filtrado de Trabajos de producción vigentes (production_jobs)
  const visibleJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      if (jobBranchFilter && job.branch_id !== jobBranchFilter) return false;
      const overdue = isDateOverdue(job.due_at);
      const stepsForJob = jobSteps.filter((s) => s.job_id === job.id);
      const step = currentStage(stepsForJob);
      const isBlocked = step?.status === 'blocked';

      if (jobStatusFilter === 'open' && ['completed', 'cancelled'].includes(job.status)) return false;
      if (jobStatusFilter === 'needs_review' && job.status !== 'needs_review') return false;
      if (jobStatusFilter === 'blocked' && !isBlocked) return false;
      if (jobStatusFilter === 'overdue' && (!overdue || ['completed', 'cancelled'].includes(job.status))) return false;
      if (jobStatusFilter === 'completed' && job.status !== 'completed') return false;

      if (query) {
        const matchText = `${job.sale_code || ''} ${job.title} ${job.customer_name || ''} ${job.customer_phone || ''} ${step?.title || ''}`.toLowerCase();
        if (!matchText.includes(query)) return false;
      }
      return true;
    });
  }, [jobs, jobSteps, jobStatusFilter, jobBranchFilter, jobSearch]);

  // Conteos rápidos de Trabajos vigentes
  const jobCounts = useMemo(() => {
    const openCount = jobs.filter((j) => !['completed', 'cancelled'].includes(j.status)).length;
    const overdueCount = jobs.filter((j) => isDateOverdue(j.due_at) && !['completed', 'cancelled'].includes(j.status)).length;
    const blockedCount = jobs.filter((j) => {
      const stepsForJob = jobSteps.filter((s) => s.job_id === j.id);
      const step = currentStage(stepsForJob);
      return step?.status === 'blocked' && !['completed', 'cancelled'].includes(j.status);
    }).length;
    const reviewCount = jobs.filter((j) => j.status === 'needs_review').length;
    return { open: openCount, overdue: overdueCount, blocked: blockedCount, review: reviewCount };
  }, [jobs, jobSteps]);

  // Filtrado de Órdenes heredadas (production_orders)
  const openLegacyOrders = useMemo(
    () => orders.filter((order) => !['completed', 'cancelled'].includes(order.status)),
    [orders]
  );
  const hasOpenLegacyOrders = openLegacyOrders.length > 0;

  const visibleOrders = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return orders
      .filter((order) => {
        const closed = ['completed', 'cancelled'].includes(order.status);
        if (statusFilter === 'open' && closed) return false;
        if (statusLabels[statusFilter] && order.status !== statusFilter) return false;
        if (branchFilter && order.branch_id !== branchFilter) return false;
        if (ownerFilter === 'unassigned' && order.assigned_to) return false;
        if (ownerFilter && ownerFilter !== 'unassigned' && order.assigned_to !== ownerFilter) return false;
        if (order.due_at && !closed) {
          const due = new Date(order.due_at);
          if (statusFilter === 'overdue' && due.getTime() >= today.getTime()) return false;
          if (statusFilter === 'today' && (due.getTime() < today.getTime() || due.toDateString() !== today.toDateString())) return false;
        } else if (statusFilter === 'overdue' || statusFilter === 'today') return false;
        return true;
      })
      .sort((a, b) => {
        const overdueA =
          a.due_at && new Date(a.due_at).getTime() < today.getTime() && !['completed', 'cancelled'].includes(a.status)
            ? 1
            : 0;
        const overdueB =
          b.due_at && new Date(b.due_at).getTime() < today.getTime() && !['completed', 'cancelled'].includes(b.status)
            ? 1
            : 0;
        return (
          overdueB - overdueA ||
          (b.priority === 'urgent' ? 1 : 0) - (a.priority === 'urgent' ? 1 : 0) ||
          new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
        );
      });
  }, [orders, statusFilter, branchFilter, ownerFilter]);

  // Consulta de conteos exactos de órdenes heredadas
  useEffect(() => {
    if (!organizationId || !supabase) {
      setOrderCountStatus('error');
      return undefined;
    }
    let current = true;
    setOrderCountStatus('loading');
    const baseCountQuery = () => {
      let query = supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId);
      if (branchFilter) query = query.eq('branch_id', branchFilter);
      if (ownerFilter === 'unassigned') query = query.is('assigned_to', null);
      else if (ownerFilter) query = query.eq('assigned_to', ownerFilter);
      return query;
    };
    const readCount = async (configure: (query: ReturnType<typeof baseCountQuery>) => ReturnType<typeof baseCountQuery>) => {
      const { count, error } = await configure(baseCountQuery());
      if (error) throw error;
      return count ?? 0;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    void Promise.all([
      readCount((query) => query.not('status', 'in', '("completed","cancelled")')),
      readCount((query) => query.not('status', 'in', '("completed","cancelled")').lt('due_at', today.toISOString())),
      readCount((query) => query.eq('status', 'blocked')),
      readCount((query) => query.eq('status', 'ready')),
    ])
      .then(([open, overdue, blocked, ready]) => {
        if (current) {
          setExactOrderCounts({ open, overdue, blocked, ready });
          setOrderCountStatus('ready');
        }
      })
      .catch(() => {
        if (current) {
          setExactOrderCounts({ open: null, overdue: null, blocked: null, ready: null });
          setOrderCountStatus('error');
        }
      });
    return () => {
      current = false;
    };
  }, [organizationId, branchFilter, ownerFilter, orders]);

  const draftFor = (order: any): HandoffDraft =>
    handoffs[order.id] || {
      assignedTo: order.assigned_to || '',
      areaId: order.area_id || '',
      due: dayValue(order.due_at),
      description: order.description || '',
      nextStep: order.next_step || '',
      note: '',
    };

  const updateHandoff = (order: any, patch: Partial<HandoffDraft>) =>
    setHandoffs((current) => ({
      ...current,
      [order.id]: { ...(current[order.id] || draftFor(order)), ...patch },
    }));

  const submitHandoff = async (order: any) => {
    const draft = draftFor(order);
    if (draft.note.trim().length < 3) return;
    const saved = await onSaveHandoff(order, draft);
    if (saved === null) return;
    setHandoffs((current) => {
      const next = { ...current };
      delete next[order.id];
      return next;
    });
  };

  const saleForOrder = (order: any) => sales.find((sale) => sale.id === order.sale_id);
  const ownerName = (id?: string | null) =>
    members.find((member) => member.user_id === id)?.full_name ||
    (id ? 'Responsable con acceso restringido' : 'Sin asignar');
  const eventsForOrder = (orderId: string) =>
    events.filter((event) => event.order_id === orderId).slice(0, 8);

  return (
    <div className="production-workspace">
      {/* =========================================================================
          SECCIÓN 1: TRABAJOS DE PRODUCCIÓN VIGENTES (production_jobs)
          ========================================================================= */}
      <section className="panel production-board" aria-labelledby="production-jobs-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">OPERACIÓN VIGENTE · TRABAJOS DE PRODUCCIÓN</span>
            <h2 id="production-jobs-title">Trabajos de producción</h2>
            <p>
              Seguimiento unificado por etapas técnicas de taller, diseño, acabados y entrega conectado a ventas.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link className="button button-outline" to="/operaciones/coordinacion-trabajos">
              Coordinación <ArrowUpRight size={13} />
            </Link>
            <Link className="button button-outline" to="/operaciones/cartelera-taller">
              Cartelera taller <ArrowUpRight size={13} />
            </Link>
            <Factory size={19} />
          </div>
        </div>

        {/* Filtros rápidos de Trabajos */}
        <div className="production-filters">
          <label>
            Estado
            <select
              value={jobStatusFilter}
              onChange={(e) => setJobStatusFilter(e.target.value as any)}
            >
              <option value="open">En curso</option>
              <option value="overdue">Atrasados</option>
              <option value="blocked">Bloqueados</option>
              <option value="needs_review">Revisión técnica</option>
              <option value="completed">Completados</option>
              <option value="all">Todos los trabajos</option>
            </select>
          </label>
          <label>
            Sucursal
            <select
              value={jobBranchFilter}
              onChange={(e) => setJobBranchFilter(e.target.value)}
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Búsqueda
            <input
              type="search"
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Venta, cliente, título…"
            />
          </label>
        </div>

        {/* Resumen KPI de Trabajos */}
        <div className="production-summary" role="group" aria-label="Resumen rápido de trabajos vigentes">
          <button
            type="button"
            className={jobStatusFilter === 'open' ? 'is-selected' : ''}
            onClick={() => setJobStatusFilter('open')}
          >
            <span>En curso</span>
            <b>{jobCounts.open}</b>
            <small>Trabajos activos</small>
          </button>
          <button
            type="button"
            className={`is-overdue ${jobStatusFilter === 'overdue' ? 'is-selected' : ''}`}
            onClick={() => setJobStatusFilter('overdue')}
          >
            <span>Atrasados</span>
            <b>{jobCounts.overdue}</b>
            <small>Fecha vencida</small>
          </button>
          <button
            type="button"
            className={`is-blocked ${jobStatusFilter === 'blocked' ? 'is-selected' : ''}`}
            onClick={() => setJobStatusFilter('blocked')}
          >
            <span>Bloqueados</span>
            <b>{jobCounts.blocked}</b>
            <small>Atención requerida</small>
          </button>
          <button
            type="button"
            className={jobStatusFilter === 'all' ? 'is-selected' : ''}
            onClick={() => setJobStatusFilter('all')}
          >
            <span>Total cargados</span>
            <b>{jobs.length}</b>
            <small>Historial reciente</small>
          </button>
        </div>

        {/* Listado de Trabajos vigentes */}
        <div className="production-order-list">
          {visibleJobs.map((job) => {
            const stepsForJob = jobSteps.filter((s) => s.job_id === job.id);
            const current = currentStage(stepsForJob);
            const overdue = isDateOverdue(job.due_at) && !['completed', 'cancelled'].includes(job.status);
            const branch = branches.find((b) => b.id === job.branch_id);
            const area = areas.find((a) => a.id === current?.area_id);

            return (
              <article
                id={`op-production-${job.id}`}
                tabIndex={-1}
                key={job.id}
                className={`production-order ${overdue ? 'is-overdue' : ''}`}
              >
                <div className="production-order-heading">
                  <div>
                    <span className="production-order-code">
                      {job.sale_code || `TRAB-${job.id.slice(0, 8).toUpperCase()}`}
                    </span>
                    <h3>{job.title}</h3>
                  </div>
                  <span className={`op-flow-status status-${job.status}`}>
                    {JOB_STATUS_LABELS[job.status as JobStatus] || job.status}
                  </span>
                </div>

                <div className="production-order-facts">
                  <span>{branch?.name || 'Sucursal'}</span>
                  {current && (
                    <span style={{ fontWeight: 650 }}>
                      Etapa: {current.title} ({STEP_STATUS_LABELS[current.status as StepStatus] || current.status})
                    </span>
                  )}
                  {area && <span>Área: {area.name}</span>}
                  {current?.assigned_to && (
                    <span>Responsable: {ownerName(current.assigned_to)}</span>
                  )}
                  <span className={overdue ? 'is-late' : ''}>
                    {overdue ? 'Atrasado · ' : 'Entrega · '}
                    {stamp(job.due_at)}
                  </span>
                  {job.customer_name && <span>Cliente: {job.customer_name}</span>}
                </div>

                {job.customer_phone && (
                  <small className="muted" style={{ display: 'block', margin: '2px 0 6px', fontSize: '11px' }}>
                    Teléfono: {job.customer_phone}
                  </small>
                )}

                <div className="op-flow-actions" style={{ margin: '6px 0 0' }}>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => onOpenJobDetail?.(job.id)}
                  >
                    <ExternalLink size={14} /> Abrir ficha completa
                  </button>
                </div>
              </article>
            );
          })}

          {!visibleJobs.length && (
            <div className="production-empty">
              <b>No hay trabajos de producción vigentes para este filtro.</b>
              <span>Ajusta el estado o la sucursal para consultar otros trabajos.</span>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          SECCIÓN 2: ÓRDENES HEREDADAS EN TRANSICIÓN (production_orders)
          ========================================================================= */}
      <section className="panel production-board" aria-labelledby="production-legacy-title">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">FLUJO EN TRANSICIÓN · ÓRDENES HEREDADAS</span>
            <h2 id="production-legacy-title">Órdenes heredadas en transición</h2>
            <p>
              Órdenes del modelo anterior (production_orders). Sus acciones y consumos operan exclusivamente sobre este modelo para liquidar pendientes sin duplicar datos en Trabajos de Producción.
            </p>
          </div>
          <ClipboardList size={19} />
        </div>

        {!hasData ? (
          <div className="production-empty production-load-error" role="status">
            <b>No pudimos confirmar las órdenes heredadas.</b>
            <span>La carga no terminó correctamente; vuelve a intentarlo para consultar los datos actuales.</span>
            <button className="button button-outline" type="button" onClick={onRetry}>
              Reintentar carga
            </button>
          </div>
        ) : !hasOpenLegacyOrders && statusFilter === 'open' ? (
          <div className="production-empty" style={{ padding: '28px 16px' }}>
            <Check size={24} style={{ margin: '0 auto 8px', color: '#197540' }} />
            <b>No hay órdenes heredadas pendientes; toda la operación nueva corre en Trabajos de Producción.</b>
            <span>
              Si necesitas auditar órdenes cerradas o archivadas, cambia el filtro de estado a "Completadas" o "Todas".
            </span>
            <div style={{ marginTop: '12px' }}>
              <button
                className="button button-outline"
                type="button"
                onClick={() => setStatusFilter('completed')}
              >
                Ver órdenes completadas
              </button>
            </div>
          </div>
        ) : (
          <>
            {hasOpenLegacyOrders && (
              <div
                className="op-flow-alert"
                style={{
                  background: '#fff9e6',
                  color: '#8d5a00',
                  border: '1px solid #f2dfa6',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>
                  Hay <b>{openLegacyOrders.length}</b> {openLegacyOrders.length === 1 ? 'orden heredada abierta' : 'órdenes heredadas abiertas'}. Sus estados y traspasos aplican directamente a <code>production_orders</code>.
                </span>
              </div>
            )}

            {/* Filtros de órdenes heredadas */}
            <div className="production-filters">
              <label>
                Estado
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="open">Abiertas</option>
                  <option value="overdue">Atrasadas</option>
                  <option value="today">Vencen hoy</option>
                  <option value="blocked">Bloqueadas</option>
                  <option value="quality_review">Control de calidad</option>
                  <option value="ready">Listas para entrega</option>
                  <option value="completed">Completadas</option>
                  <option value="all">Todas</option>
                </select>
              </label>
              <label>
                Sucursal
                <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
                  <option value="">Todas las sucursales</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsable
                <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                  <option value="">Todos</option>
                  <option value="unassigned">Sin asignar</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {normalizePersonName(member.full_name) || member.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Resumen KPI de órdenes heredadas */}
            <div className="production-summary" role="group" aria-label="Resumen y filtros rápidos de órdenes heredadas">
              {(
                [
                  { id: 'open', label: 'Abiertas', active: '', description: 'Por completar', zero: 'Sin órdenes activas' },
                  { id: 'overdue', label: 'Atrasadas', active: 'is-overdue', description: 'Plazo vencido', zero: 'Sin plazos vencidos' },
                  { id: 'blocked', label: 'Bloqueadas', active: 'is-blocked', description: 'Requieren atención', zero: 'Sin órdenes bloqueadas' },
                  { id: 'ready', label: 'Listas para entrega', active: 'is-ready', description: 'Control completado', zero: 'Ninguna lista' },
                ] as const
              ).map((metric) => {
                const value = exactOrderCounts[metric.id];
                const ready = orderCountStatus === 'ready' && value !== null;
                const valueLabel = ready ? value.toLocaleString('es-EC') : 'conteo no disponible';
                const helper = !ready
                  ? orderCountStatus === 'loading'
                    ? 'Confirmando el conteo…'
                    : 'Conteo no disponible'
                  : value
                  ? metric.description
                  : metric.zero;
                return (
                  <button
                    key={metric.id}
                    type="button"
                    className={`${ready && value ? metric.active : 'is-clear'} ${
                      statusFilter === metric.id ? 'is-selected' : ''
                    }`}
                    aria-label={`${metric.label}: ${valueLabel}. ${helper}. Filtrar órdenes.`}
                    aria-pressed={statusFilter === metric.id}
                    onClick={() => setStatusFilter(metric.id)}
                  >
                    <span>{metric.label}</span>
                    <b>{ready ? value.toLocaleString('es-EC') : '—'}</b>
                    <small>{helper}</small>
                  </button>
                );
              })}
            </div>

            {/* Listado de órdenes heredadas */}
            <div className="production-order-list">
              {visibleOrders.map((order) => {
                const sale = saleForOrder(order);
                const draft = draftFor(order);
                const timeline = eventsForOrder(order.id);
                const late =
                  order.due_at &&
                  new Date(order.due_at).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime() &&
                  !['completed', 'cancelled'].includes(order.status);

                return (
                  <article
                    id={`op-production-${order.id}`}
                    tabIndex={-1}
                    key={order.id}
                    className={`production-order ${late ? 'is-overdue' : ''}`}
                  >
                    <div className="production-order-heading">
                      <div>
                        <span className="production-order-code">{order.order_code} [Heredada]</span>
                        <h3>{order.title}</h3>
                      </div>
                      <span className={`op-flow-status status-${order.status}`}>
                        {statusLabels[order.status] || order.status}
                      </span>
                    </div>

                    <div className="production-order-facts">
                      <span>{order.branches?.name || branches.find((b) => b.id === order.branch_id)?.name || 'Sucursal'}</span>
                      <span>{order.areas?.name || areas.find((a) => a.id === order.area_id)?.name || 'Área por asignar'}</span>
                      <span className={late ? 'is-late' : ''}>
                        {late ? 'Atrasada · ' : 'Fecha prevista · '}
                        {stamp(order.due_at)}
                      </span>
                      <span className={`production-order-priority priority-${order.priority}`}>
                        Prioridad · {priorityLabels[order.priority] || order.priority}
                      </span>
                    </div>

                    {sale && (
                      <a
                        className="production-order-sale"
                        href={sale.customer_id ? `/operaciones/clientes?cliente=${encodeURIComponent(sale.customer_id)}` : '/operaciones/pos'}
                      >
                        {sale.sale_code} · {sale.customers?.full_name || 'Venta vinculada'} <ArrowUpRight size={13} />
                      </a>
                    )}

                    {order.description && <p className="production-order-description">{order.description}</p>}

                    <div className="production-order-next">
                      <span>Responsable</span>
                      <b>{ownerName(order.assigned_to)}</b>
                      <span>Siguiente paso</span>
                      <b>{order.next_step || 'Pendiente de definir'}</b>
                    </div>

                    {!['completed', 'cancelled'].includes(order.status) && canManage && (
                      <details className="production-handoff">
                        <summary>Registrar traspaso o actualizar la orden heredada</summary>
                        <div className="production-form-grid">
                          <label>
                            Responsable
                            <select
                              value={draft.assignedTo}
                              onChange={(event) => updateHandoff(order, { assignedTo: event.target.value })}
                            >
                              <option value="">Sin asignar</option>
                              {order.assigned_to && !members.some((member) => member.user_id === order.assigned_to) && (
                                <option value={order.assigned_to}>Responsable actual</option>
                              )}
                              {members.map((member) => (
                                <option key={member.user_id} value={member.user_id}>
                                  {normalizePersonName(member.full_name) || member.email}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Área
                            <select
                              value={draft.areaId}
                              onChange={(event) => updateHandoff(order, { areaId: event.target.value })}
                            >
                              <option value="">Por asignar</option>
                              {areas.map((area) => (
                                <option key={area.id} value={area.id}>
                                  {area.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Fecha prevista
                            <DatePicker
                              label="Fecha prevista"
                              value={draft.due}
                              onChange={(val) => updateHandoff(order, { due: val })}
                            />
                          </label>

                          <label>
                            Siguiente paso
                            <input
                              maxLength={500}
                              value={draft.nextStep}
                              onChange={(event) => updateHandoff(order, { nextStep: event.target.value })}
                              placeholder="Acción concreta y quién debe continuar"
                            />
                          </label>
                        </div>

                        <label>
                          Instrucción para el área
                          <textarea
                            rows={2}
                            maxLength={4000}
                            value={draft.description}
                            onChange={(event) => updateHandoff(order, { description: event.target.value })}
                          />
                        </label>

                        <label>
                          Nota del traspaso
                          <input
                            maxLength={700}
                            value={draft.note}
                            onChange={(event) => updateHandoff(order, { note: event.target.value })}
                            placeholder="Qué queda listo o qué bloquea el avance"
                          />
                        </label>

                        <button
                          className="button button-outline"
                          type="button"
                          disabled={busy || draft.note.trim().length < 3}
                          onClick={() => submitHandoff(order)}
                        >
                          <Save size={15} /> Guardar traspaso
                        </button>
                      </details>
                    )}

                    {!['completed', 'cancelled'].includes(order.status) && (
                      <div className="production-status-update">
                        <label>
                          Nota del cambio (mín. 5 caracteres al cerrar o bloquear)
                          <input
                            value={statusNotes[order.id] || ''}
                            maxLength={900}
                            onChange={(event) =>
                              setStatusNotes((current) => ({ ...current, [order.id]: event.target.value }))
                            }
                            placeholder="Obligatoria al bloquear, pasar a calidad o cerrar"
                          />
                        </label>
                        <label>
                          Estado
                          <select
                            value={order.status}
                            disabled={busy || !canManage}
                            onChange={(event) =>
                              onStatusChange(order, event.target.value, statusNotes[order.id] || '')
                            }
                          >
                            {Object.entries(statusLabels)
                              .filter(([value]) => value !== 'cancelled' || canManage)
                              .map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {Boolean(timeline.length) && (
                      <details className="production-history">
                        <summary>Historial de traspasos y estados ({timeline.length})</summary>
                        <ol>
                          {timeline.map((event) => (
                            <li key={event.id}>
                              <b>
                                {event.from_status === event.to_status
                                  ? 'Traspaso actualizado'
                                  : `${statusLabels[event.from_status] || event.from_status || 'Inicio'} → ${
                                      statusLabels[event.to_status] || event.to_status
                                    }`}
                              </b>
                              <span>
                                {stamp(event.created_at)} · {ownerName(event.created_by)}
                              </span>
                              {event.note && <p>{event.note}</p>}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </article>
                );
              })}

              {!visibleOrders.length && hasOpenLegacyOrders && (
                <div className="production-empty">
                  <b>No hay órdenes heredadas para este filtro.</b>
                  <span>Prueba con otro estado o sucursal.</span>
                </div>
              )}

              {hasMoreOrders && (
                <div className="production-order-more">
                  <span>Hay más órdenes además de las {orders.length} recientes cargadas.</span>
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={onLoadMoreOrders}
                    disabled={loadingMoreOrders}
                  >
                    {loadingMoreOrders ? (
                      <>
                        <LoaderCircle className="spin" size={15} /> Cargando…
                      </>
                    ) : (
                      'Cargar otras 100 órdenes'
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* =========================================================================
          FORMULARIO OPCIONAL: CREAR ORDEN HEREDADA (CONTINGENCIA)
          ========================================================================= */}
      {canManage && (
        <details
          className="panel production-create-collapsible"
          open={showLegacyCreate}
          onToggle={(e) => setShowLegacyCreate((e.target as HTMLDetailsElement).open)}
        >
          <summary style={{ cursor: 'pointer', padding: '12px 14px', fontWeight: 650, color: '#555762' }}>
            {showLegacyCreate ? 'Ocultar formulario de orden heredada' : '+ Formulario de contingencia para orden heredada'}
          </summary>
          <div style={{ padding: '0 14px 14px' }}>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: '11px' }}>
              Usa este formulario exclusivamente si requieres crear una orden en el esquema anterior <code>production_orders</code>. Para trabajos comerciales regulares, la venta crea automáticamente Trabajos de Producción.
            </p>
            <label>
              Título del trabajo
              <input
                maxLength={180}
                value={orderForm.title}
                onChange={(event) => setOrderForm({ ...orderForm, title: event.target.value })}
                placeholder="Ej. Rótulo exterior · referencia breve"
              />
            </label>
            <label>
              Venta confirmada
              <select
                value={orderForm.sale}
                onChange={(event) => {
                  const sale = sales.find((row) => row.id === event.target.value);
                  setOrderForm((current) => ({
                    ...current,
                    sale: event.target.value,
                    branch: sale?.branch_id || current.branch,
                  }));
                }}
              >
                <option value="">Trabajo interno sin venta vinculada</option>
                {sales
                  .filter((sale) => sale.status === 'confirmed' && !orders.some((order) => order.sale_id === sale.id))
                  .map((sale) => (
                    <option key={sale.id} value={sale.id}>
                      {sale.sale_code} · {sale.customers?.full_name || 'Cliente'}
                    </option>
                  ))}
              </select>
              <small>Al vincularla, la ficha conserva la referencia comercial para seguir el trabajo hasta producción.</small>
            </label>
            <label>
              Instrucción breve
              <textarea
                maxLength={4000}
                rows={3}
                value={orderForm.description}
                onChange={(event) => setOrderForm({ ...orderForm, description: event.target.value })}
                placeholder="Qué debe fabricarse y qué referencia aprobada debe consultarse"
              />
            </label>
            <div className="production-form-grid">
              <label>
                Sucursal
                <select
                  value={orderForm.branch}
                  onChange={(event) => setOrderForm({ ...orderForm, branch: event.target.value })}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Área
                <select
                  value={orderForm.area}
                  onChange={(event) => setOrderForm({ ...orderForm, area: event.target.value })}
                >
                  <option value="">Por asignar</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prioridad
                <select
                  value={orderForm.priority}
                  onChange={(event) => setOrderForm({ ...orderForm, priority: event.target.value })}
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fecha prevista
                <DatePicker
                  label="Fecha prevista"
                  value={orderForm.due}
                  onChange={(val) => setOrderForm((current) => ({ ...current, due: val }))}
                />
              </label>
              <label>
                Responsable
                <select
                  value={orderForm.assignedTo}
                  onChange={(event) => setOrderForm({ ...orderForm, assignedTo: event.target.value })}
                >
                  <option value="">Sin asignar</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {normalizePersonName(member.full_name) || member.email}
                    </option>
                  ))}
                </select>
                {!members.length && <small>Para asignar personas, el perfil necesita acceso al directorio de equipo.</small>}
              </label>
              <label>
                Siguiente paso
                <input
                  maxLength={500}
                  value={orderForm.nextStep}
                  onChange={(event) => setOrderForm({ ...orderForm, nextStep: event.target.value })}
                  placeholder="Ej. Confirmar medidas con diseño"
                />
              </label>
            </div>
            <button
              className="button button-dark"
              type="button"
              disabled={busy || !canManage || !orderForm.title.trim() || !orderForm.branch}
              onClick={onCreate}
            >
              Crear orden heredada
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
