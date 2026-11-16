/**
 * Visual Corp Suite — Production Coordination Page (Fase 2.3)
 *
 * Centro de coordinación de producción (/operaciones/coordinacion-trabajos).
 * Vista unificada de Diseño, Asesoría, Impresión, Sublimación, Corte láser y Taller.
 * Integrada con ProductionJobDetailSheet (apertura in-situ sin pérdida de contexto),
 * sistema de 7 vistas (ProductionQueueViews), sincronización con useProductionSync,
 * convivencia con órdenes heredadas y Chatter 360°.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FolderOpen,
  Layers,
  MapPin,
  MessageSquare,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState } from '../../components/feedback';
import { ChatterDrawer360 } from '../../components/ui/ChatterDrawer360';
import { supabase } from '../../lib/supabaseClient';
import {
  type AreaCode,
  type CoordinationListItem,
  type LegacyProductionOrder,
  type ProductionJob,
  type ProductionQueueViewMode,
  type ProductionStep,
  type StepStatus,
  AREA_CODE_TO_SLUG,
  PRODUCTION_AREA_CONFIG,
  PRODUCTION_AREA_LIST,
  STEP_STATUS_LABELS,
  currentStage,
  dayKey,
  fetchJobBalanceFlags,
  getGlobalProductionUiPrefs,
  getProductionViewMode,
  isDateOverdue,
  isStepOpen,
  priorityDetails,
  resolveProductionPermissions,
  safeDate,
  setGlobalProductionUiPrefs,
  setProductionViewMode,
  stamp,
  todayKey,
  useProductionSync,
} from '../../lib/productionHub';
import { ProductionJobDetailSheet } from './ProductionJobDetailSheet';
import {
  ProductionQueueSkeleton,
  ProductionSyncNotice,
} from './ProductionQueueComponents';
import {
  ProductionQueueViews,
  type ProductionQueueViewItem,
} from './ProductionQueueViews';
import { ProductionAttention } from './ProductionAttention';

import './production-coordination.css';

type CoordinationFilter =
  | 'all'
  | 'attention'
  | 'blocked'
  | 'quality'
  | 'delivery'
  | 'balance';

const FILTERS: Array<{ key: CoordinationFilter; label: string }> = [
  { key: 'all', label: 'Todos los trabajos' },
  { key: 'attention', label: 'Requieren atención' },
  { key: 'blocked', label: 'Bloqueados' },
  { key: 'quality', label: 'Calidad' },
  { key: 'delivery', label: 'Entrega' },
  { key: 'balance', label: 'Saldo pendiente' },
];

const VALID_COORDINATION_FILTERS = new Set<CoordinationFilter>([
  'all',
  'attention',
  'blocked',
  'quality',
  'delivery',
  'balance',
]);

const VALID_VIEW_MODES = new Set<ProductionQueueViewMode>([
  'summary',
  'cards',
  'list',
  'table',
  'kanban',
  'month',
  'week',
]);

const PAGE_SIZE = 50;

export function ProductionCoordinationPage() {
  const auth = useAuth();
  const { organizationId } = auth;
  const permissions = resolveProductionPermissions(auth);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Permiso de acceso
  const canView = permissions.canViewSales || permissions.canViewWorkshop;

  // Parámetros de URL
  const rawFilter = searchParams.get('filter');
  const activeFilter: CoordinationFilter =
    rawFilter && VALID_COORDINATION_FILTERS.has(rawFilter as CoordinationFilter)
      ? (rawFilter as CoordinationFilter)
      : 'all';

  const areaFilter = searchParams.get('area') || 'all';
  const searchQuery = searchParams.get('q') || '';
  const dateParam = searchParams.get('fecha') || undefined;
  const selectedDate = dateParam || todayKey();

  const selectedJobId = searchParams.get('trabajo') || searchParams.get('job') || null;
  const selectedStepId = searchParams.get('paso') || null;

  // Persistencia de modo de vista
  const viewParam = searchParams.get('view') as ProductionQueueViewMode | null;
  const storedMode = useMemo(() => getProductionViewMode('coordinacion', 'cards'), []);
  const activeViewMode: ProductionQueueViewMode =
    viewParam && VALID_VIEW_MODES.has(viewParam) ? viewParam : storedMode;

  // Estados de datos
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [legacyOrders, setLegacyOrders] = useState<LegacyProductionOrder[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [balanceFlags, setBalanceFlags] = useState<Record<string, boolean>>({});

  // Chatter Drawer
  const [chatterTarget, setChatterTarget] = useState<{
    recordId: string;
    recordTitle: string;
    recordSubtitle: string;
    recordStage: string;
  } | null>(null);

  // Carga de página con paginación
  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!supabase || !organizationId || !canView) return;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError('');

      try {
        const from = nextPage * PAGE_SIZE;
        const boardResult = await supabase.rpc('list_production_coordination_jobs', {
          p_organization_id: organizationId,
          p_limit: PAGE_SIZE,
          p_offset: from,
        });

        if (boardResult.error) throw boardResult.error;

        const board = (boardResult.data || { total: 0, items: [] }) as {
          total: number;
          items: Array<{
            source: 'job' | 'legacy';
            job?: ProductionJob;
            steps?: ProductionStep[];
            order?: LegacyProductionOrder;
          }>;
        };

        const pageJobs = board.items
          .filter((item) => item.source === 'job' && item.job)
          .map((item) => item.job!) as ProductionJob[];

        const pageSteps = board.items
          .filter((item) => item.source === 'job')
          .flatMap((item) => item.steps || []) as ProductionStep[];

        const pageLegacy = board.items
          .filter((item) => item.source === 'legacy' && item.order)
          .map((item) => item.order!) as LegacyProductionOrder[];

        // Carga de saldos
        let newFlags: Record<string, boolean> = {};
        if (pageJobs.length) {
          const balanceRes = await fetchJobBalanceFlags(
            organizationId,
            pageJobs.map((j) => j.id)
          );
          newFlags = balanceRes.flags;
          setBalanceUnavailable(balanceRes.unavailable);
        }

        const enrichedJobs = pageJobs.map((job) => ({
          ...job,
          balance_due: Boolean(newFlags[job.id]),
        }));

        setJobs((current) => (replace ? enrichedJobs : [...current, ...enrichedJobs]));
        setSteps((current) => (replace ? pageSteps : [...current, ...pageSteps]));
        setLegacyOrders((current) =>
          replace ? pageLegacy : [...current, ...pageLegacy]
        );
        setBalanceFlags((current) =>
          replace ? newFlags : { ...current, ...newFlags }
        );
        setTotalCount(board.total || 0);
        setPage(nextPage);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo cargar la coordinación de trabajos.'
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [canView, organizationId]
  );

  // useProductionSync para revalidación automática
  const { refreshing, isStale, triggerRefresh } = useProductionSync({
    onRefresh: () => loadPage(0, true),
    staleAfterMs: 120000,
  });

  useEffect(() => {
    void loadPage(0, true);
  }, [loadPage]);

  // Manejadores de URL y filtros
  const handleFilterChange = (filterKey: CoordinationFilter) => {
    const next = new URLSearchParams(searchParams);
    if (filterKey === 'all') next.delete('filter');
    else next.set('filter', filterKey);
    setSearchParams(next);
  };

  const handleAreaFilterChange = (code: string) => {
    const next = new URLSearchParams(searchParams);
    if (code === 'all') next.delete('area');
    else next.set('area', code);
    setSearchParams(next);
  };

  const handleSearchChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (!val.trim()) next.delete('q');
    else next.set('q', val);
    setSearchParams(next);
  };

  const handleViewModeChange = (mode: ProductionQueueViewMode) => {
    setProductionViewMode('coordinacion', mode);
    const next = new URLSearchParams(searchParams);
    next.set('view', mode);
    setSearchParams(next);
  };

  const handleSelectDate = (dateKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('fecha', dateKey);
    setSearchParams(next);
  };

  // Abrir Ficha Unificada in-situ
  const handleOpenItem = (viewItem: ProductionQueueViewItem<CoordinationListItem>) => {
    const item = viewItem.original;
    if (item.source === 'legacy') {
      if (item.order?.can_open_detail) {
        navigate('/operaciones/flujos?tab=production');
      }
      return;
    }
    if (!item.job) return;

    const next = new URLSearchParams(searchParams);
    next.set('trabajo', item.job.id);
    if (item.currentStep) {
      next.set('paso', item.currentStep.id);
    } else {
      next.delete('paso');
    }
    setSearchParams(next);
  };

  const closeJobDetail = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('trabajo');
    next.delete('job');
    next.delete('paso');
    setSearchParams(next);
  };

  const chooseStep = (stepId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('paso', stepId);
    setSearchParams(next);
  };

  // Construcción de ítems consolidados de trabajos modernos
  const jobItems = useMemo<CoordinationListItem[]>(() => {
    return jobs.map((job) => {
      const jobSteps = steps
        .filter((step) => step.job_id === job.id)
        .sort((a, b) => a.step_order - b.step_order);
      const current = currentStage(jobSteps);
      return {
        source: 'job',
        job,
        steps: jobSteps,
        currentStep: current,
      };
    });
  }, [jobs, steps]);

  // Filtrado de trabajos modernos
  const visibleJobs = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase('es');
    return jobItems.filter(({ job, currentStep }) => {
      if (!job) return false;
      const stepAreaCode =
        (currentStep?.area as { code?: string } | undefined)?.code ||
        currentStep?.area_code ||
        'ASE';

      if (areaFilter !== 'all' && stepAreaCode !== areaFilter) {
        return false;
      }

      const dueAt = currentStep?.due_at || job.fulfillment_due_at || job.due_at;
      const isLate = isDateOverdue(dueAt);

      if (activeFilter === 'attention') {
        const requiresAttention =
          currentStep?.status === 'blocked' ||
          isLate ||
          (currentStep?.status === 'ready' && !currentStep.assigned_to) ||
          (job.approval_required && job.artwork_review_status !== 'approved');
        if (!requiresAttention) return false;
      } else if (activeFilter === 'blocked') {
        if (currentStep?.status !== 'blocked') return false;
      } else if (activeFilter === 'quality') {
        const isQuality =
          job.fulfillment_status === 'quality_check' ||
          Number(job.lot_summary?.quality_check) > 0;
        if (!isQuality) return false;
      } else if (activeFilter === 'delivery') {
        const isDelivery =
          ['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') ||
          Number(job.lot_summary?.ready_for_delivery) > 0 ||
          Number(job.lot_summary?.scheduled) > 0;
        if (!isDelivery) return false;
      } else if (activeFilter === 'balance') {
        if (!job.balance_due) return false;
      }

      if (needle) {
        const searchStr = `${job.sale_code || ''} ${job.title} ${currentStep?.title || ''}`.toLocaleLowerCase('es');
        if (!searchStr.includes(needle)) return false;
      }

      return true;
    });
  }, [areaFilter, activeFilter, jobItems, searchQuery]);

  // Filtrado de órdenes heredadas
  const visibleLegacy = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase('es');
    return legacyOrders.filter((order) => {
      if (areaFilter !== 'all' && order.area_code !== areaFilter) return false;

      const isLate = isDateOverdue(order.due_at);

      if (activeFilter === 'blocked' && order.status !== 'blocked') return false;
      if (activeFilter === 'quality' && order.status !== 'quality_review') return false;
      if (activeFilter === 'delivery' && order.status !== 'ready') return false;
      if (
        activeFilter === 'attention' &&
        order.status !== 'blocked' &&
        !isLate &&
        !(order.status === 'queued' && !order.assigned)
      ) {
        return false;
      }
      if (activeFilter === 'balance') {
        return false;
      }

      if (needle) {
        const searchStr = `${order.order_code} ${order.title} ${order.next_step || ''} ${order.area_name || ''}`.toLocaleLowerCase('es');
        if (!searchStr.includes(needle)) return false;
      }

      return true;
    });
  }, [areaFilter, activeFilter, legacyOrders, searchQuery]);

  // Mapeo unificado a ProductionQueueViewItem para las 7 vistas
  const queueViewItems = useMemo<ProductionQueueViewItem<CoordinationListItem>[]>(() => {
    const mappedJobs: ProductionQueueViewItem<CoordinationListItem>[] = visibleJobs.map(
      (item) => {
        const job = item.job!;
        const current = item.currentStep;
        const dueAt = current?.due_at || job.fulfillment_due_at || job.due_at;
        const status =
          (current?.status as StepStatus) ||
          (['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '')
            ? 'completed'
            : job.status === 'completed'
            ? 'completed'
            : 'waiting');

        const stepAreaCode =
          ((current?.area as { code?: string } | undefined)?.code ||
            current?.area_code ||
            'ASE') as AreaCode;
        const areaConfig =
          PRODUCTION_AREA_CONFIG[AREA_CODE_TO_SLUG[stepAreaCode] || 'asesoria'];

        const priority = priorityDetails({
          step: current,
          job,
        });

        const completedSteps = (item.steps || []).filter(
          (s) => s.status === 'completed'
        ).length;
        const totalSteps = item.steps?.length || 0;

        return {
          id: job.id,
          title: job.title,
          code: job.sale_code || 'PEDIDO',
          customer: job.customer_name || 'Cliente por consultar',
          dueAt,
          dueKey: dayKey(dueAt),
          status,
          statusLabel: STEP_STATUS_LABELS[status] || status,
          ownerLabel: current?.assigned_to
            ? current.assigned_to === auth.user?.id
              ? 'A mi cargo'
              : 'Asignado'
            : 'Sin responsable',
          overdue: isDateOverdue(dueAt),
          original: item,
          stageName: current?.title || job.title,
          areaName: areaConfig?.title || 'Coordinación',
          balanceDue: Boolean(job.balance_due),
          priorityScore: priority.score,
          priorityReason: priority.reason,
          progressCompleted: completedSteps,
          progressTotal: totalSteps,
          canAct: true,
          actionLabel: 'Ver ficha',
        };
      }
    );

    const mappedLegacy: ProductionQueueViewItem<CoordinationListItem>[] = visibleLegacy.map(
      (order) => {
        const status: StepStatus =
          order.status === 'queued'
            ? 'ready'
            : order.status === 'quality_review'
            ? 'in_progress'
            : order.status === 'blocked'
            ? 'blocked'
            : order.status === 'completed'
            ? 'completed'
            : 'waiting';

        return {
          id: `legacy-${order.id}`,
          title: `[Heredada] ${order.title}`,
          code: order.order_code,
          customer: order.area_name || 'Orden interna',
          dueAt: order.due_at,
          dueKey: dayKey(order.due_at),
          status,
          statusLabel:
            order.status === 'blocked'
              ? 'Bloqueada'
              : order.status === 'quality_review'
              ? 'Control de calidad'
              : order.status === 'ready'
              ? 'Lista para iniciar'
              : order.status === 'queued'
              ? 'En espera'
              : order.status,
          ownerLabel: order.assigned ? 'Asignado' : 'Sin responsable',
          overdue: isDateOverdue(order.due_at),
          original: {
            source: 'legacy' as const,
            order,
          },
          stageName: order.next_step || 'Flujo legado',
          areaName: order.area_name || 'Taller',
          balanceDue: false,
          priorityScore: 20,
          priorityReason: 'Orden heredada en transición',
          canAct: Boolean(order.can_open_detail),
          actionLabel: 'Abrir en flujos',
        };
      }
    );

    return [...mappedJobs, ...mappedLegacy];
  }, [visibleJobs, visibleLegacy, auth.user?.id]);

  // Tarjetas personalizadas con Chatter 360 e Ir al área
  const renderQueueCard = (
    viewItem: ProductionQueueViewItem<CoordinationListItem>,
    compact = false
  ) => {
    const item = viewItem.original;

    if (item.source === 'legacy' && item.order) {
      const order = item.order;
      return (
        <article className="pc-order pc-order-legacy">
          <div className="pc-order-main">
            <div className="pc-order-title">
              <span className="pc-badge-legacy">Orden heredada · {order.order_code}</span>
              <h2>{order.title}</h2>
            </div>
            <span className="pc-status">{viewItem.statusLabel}</span>
          </div>
          <div className="pc-order-bottom">
            <span>
              {viewItem.ownerLabel} · {stamp(order.due_at)}
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button button-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setChatterTarget({
                    recordId: order.order_code,
                    recordTitle: order.title,
                    recordSubtitle: `Orden interna · ${order.area_name || 'Taller'}`,
                    recordStage: viewItem.statusLabel,
                  });
                }}
              >
                <MessageSquare size={14} /> Chatter 360°
              </button>
              {order.can_open_detail && (
                <Link
                  className="button button-outline"
                  to="/operaciones/flujos?tab=production"
                >
                  Abrir flujos (heredado) <ExternalLink size={14} />
                </Link>
              )}
            </div>
          </div>
        </article>
      );
    }

    const job = item.job!;
    const current = item.currentStep;
    const canOpen = permissions.canOpenDetail;
    const statusClass = current?.status === 'blocked' ? ' is-blocked' : '';
    const code = job.sale_code || job.id.slice(0, 8);
    const stepAreaCode =
      ((current?.area as { code?: string } | undefined)?.code ||
        current?.area_code ||
        'ASE') as AreaCode;
    const areaSlug = AREA_CODE_TO_SLUG[stepAreaCode] || 'asesoria';

    return (
      <article className={`pc-order${compact ? ' is-compact' : ''}`}>
        <div className="pc-order-main">
          <div className="pc-order-title">
            <span>{job.sale_code || 'Pedido activo'}</span>
            <h2>{job.title}</h2>
          </div>
          <span className={`pc-status${statusClass}`}>{viewItem.statusLabel}</span>
        </div>
        <div className="pc-order-facts">
          <div>
            <small>Área y siguiente paso</small>
            <b>
              {current?.area_name || stepAreaCode} · {current?.title || 'Revisar entrega'}
            </b>
            {current?.readiness_reasons?.[0] && (
              <span>{current.readiness_reasons[0].message}</span>
            )}
          </div>
          <div>
            <small>Responsable</small>
            <b>{viewItem.ownerLabel}</b>
          </div>
          <div className={viewItem.overdue ? 'is-late' : ''}>
            <small>Fecha límite</small>
            <b>
              <CalendarClock size={14} />
              {stamp(viewItem.dueAt)}
            </b>
          </div>
          <div>
            <small>Avance</small>
            <b>
              <Clock3 size={14} />
              {viewItem.progressCompleted} de {viewItem.progressTotal} etapas
            </b>
          </div>
        </div>
        <div className="pc-order-bottom">
          <span>
            {job.fulfillment_status === 'quality_check'
              ? 'Calidad pendiente'
              : ['ready_for_delivery', 'scheduled'].includes(
                  job.fulfillment_status || ''
                )
              ? 'Pendiente de entrega / retiro'
              : job.approval_required && job.artwork_review_status !== 'approved'
              ? 'Arte pendiente de revisión'
              : 'Flujo activo'}
            {job.balance_due ? ' · ⚠ Saldo pendiente' : ''}
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button button-outline"
              onClick={(e) => {
                e.stopPropagation();
                setChatterTarget({
                  recordId: code,
                  recordTitle: job.title,
                  recordSubtitle: `${current?.area_name || stepAreaCode} · ${code}`,
                  recordStage: viewItem.statusLabel,
                });
              }}
            >
              <MessageSquare size={14} /> Chatter 360°
            </button>
            <Link
              className="button button-outline"
              to={`/seguimiento/${encodeURIComponent(code)}`}
              onClick={(e) => e.stopPropagation()}
            >
              Portal cliente
            </Link>
            {/* Acción secundaria: Ir al área */}
            <Link
              className="button button-outline"
              to={`/operaciones/trabajos/${areaSlug}?trabajo=${encodeURIComponent(
                job.id
              )}${current ? `&paso=${encodeURIComponent(current.id)}` : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              Ir al área <ArrowRight size={14} />
            </Link>
            {/* Acción primaria: Ver ficha in-situ */}
            {canOpen ? (
              <button
                type="button"
                className="button button-dark"
                onClick={() => handleOpenItem(viewItem)}
              >
                Ver ficha <ArrowRight size={14} />
              </button>
            ) : (
              <span>Ficha reservada</span>
            )}
          </div>
        </div>
      </article>
    );
  };

  // Conteos de resumen
  const attentionCount =
    jobItems.filter(({ job, currentStep }) => {
      if (!job) return false;
      const dueAt = currentStep?.due_at || job.fulfillment_due_at || job.due_at;
      return (
        currentStep?.status === 'blocked' ||
        isDateOverdue(dueAt) ||
        (currentStep?.status === 'ready' && !currentStep.assigned_to) ||
        (job.approval_required && job.artwork_review_status !== 'approved')
      );
    }).length +
    legacyOrders.filter(
      (order) =>
        order.status === 'blocked' ||
        isDateOverdue(order.due_at) ||
        (order.status === 'queued' && !order.assigned)
    ).length;

  const qualityCount =
    jobItems.filter(
      ({ job }) =>
        job &&
        (job.fulfillment_status === 'quality_check' ||
          Number(job.lot_summary?.quality_check) > 0)
    ).length +
    legacyOrders.filter((order) => order.status === 'quality_review').length;

  const deliveryCount =
    jobItems.filter(
      ({ job }) =>
        job &&
        (['ready_for_delivery', 'scheduled'].includes(job.fulfillment_status || '') ||
          Number(job.lot_summary?.ready_for_delivery) > 0 ||
          Number(job.lot_summary?.scheduled) > 0)
    ).length +
    legacyOrders.filter((order) => order.status === 'ready').length;

  const blockedCount =
    jobItems.filter(({ currentStep }) => currentStep?.status === 'blocked').length +
    legacyOrders.filter((order) => order.status === 'blocked').length;

  const balanceCount = jobItems.filter(({ job }) => job?.balance_due).length;

  const filterCount = (key: CoordinationFilter) => {
    if (key === 'attention') return attentionCount;
    if (key === 'blocked') return blockedCount;
    if (key === 'quality') return qualityCount;
    if (key === 'delivery') return deliveryCount;
    if (key === 'balance') return balanceCount;
    return totalCount;
  };

  if (!canView) {
    return (
      <AppFrame area="operations">
        <main className="pc-page">
          <EmptyState
            icon={ClipboardList}
            title="Acceso restringido"
            text="Tu perfil no tiene acceso a la coordinación de trabajos."
          />
        </main>
      </AppFrame>
    );
  }

  // Área de contexto del trabajo seleccionado en el Sheet
  const selectedJobObj = jobs.find((j) => j.id === selectedJobId) || null;
  const selectedJobSteps = steps.filter((s) => s.job_id === selectedJobId);
  const selectedCurrentStep = currentStage(selectedJobSteps);
  const selectedAreaCode =
    ((selectedCurrentStep?.area as { code?: string } | undefined)?.code ||
      selectedCurrentStep?.area_code ||
      null) as AreaCode | null;

  return (
    <AppFrame area="operations">
      <main className="pc-page">
        <PageHeading
          eyebrow="OPERACIONES · PRODUCCIÓN"
          title="Coordinación de trabajos"
          description="Vista compartida de Diseño, Asesoría, Impresión, Sublimación, Corte láser y Taller. Abre cada ficha para asignar, recibir, revisar calidad o registrar avances sin salir del tablero."
          action={
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <ProductionAttention />
              <Link className="button button-dark" to="/operaciones/cartelera-taller">
                <MapPin size={15} /> Cartelera & Mapa
              </Link>
              <Link className="button button-outline" to="/operaciones/kiosk">
                <Printer size={15} /> Terminal Kiosk Taller
              </Link>
              <Link className="button button-outline" to="/operaciones/automatizaciones">
                <Sparkles size={15} /> Autopilot
              </Link>
              <Link className="button button-outline" to="/operaciones/archivos">
                <FolderOpen size={15} /> Vault de artes
              </Link>
              <Link className="button button-outline" to="/seguimiento">
                <ShieldCheck size={15} /> Portal aprobación
              </Link>
              <button
                className="button button-outline"
                type="button"
                onClick={() => void triggerRefresh()}
                disabled={loading || refreshing}
              >
                <RefreshCw
                  size={15}
                  className={loading || refreshing ? 'animate-spin' : ''}
                />
                {refreshing ? 'Actualizando…' : 'Actualizar'}
              </button>
            </div>
          }
        />

        {/* Resumen métrico superior */}
        <section className="pc-summary" aria-label="Resumen del trabajo cargado">
          <div>
            <span>
              <ClipboardList size={15} /> En curso
            </span>
            <b>{totalCount}</b>
          </div>
          <div data-tone="amber">
            <span>
              <AlertTriangle size={15} /> Atención
            </span>
            <b>{attentionCount}</b>
          </div>
          <div data-tone="violet">
            <span>
              <ShieldCheck size={15} /> Calidad
            </span>
            <b>{qualityCount}</b>
          </div>
          <div data-tone="green">
            <span>
              <CheckCircle2 size={15} /> Listos para entrega
            </span>
            <b>{deliveryCount}</b>
          </div>
        </section>

        {/* Notificación de datos desactualizados */}
        <ProductionSyncNotice
          isStale={isStale}
          refreshing={refreshing}
          onRefresh={() => void triggerRefresh()}
        />

        {/* Barra de Controles: Búsqueda y Filtro de Área */}
        <section className="pc-controls" aria-label="Filtros de trabajos">
          <label className="pc-search">
            <Search size={15} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar referencia, artículo, cliente o etapa"
              aria-label="Buscar trabajo"
            />
          </label>
          <label className="pc-area-filter">
            Área
            <select
              value={areaFilter}
              onChange={(e) => handleAreaFilterChange(e.target.value)}
            >
              <option value="all">Todas las áreas</option>
              {PRODUCTION_AREA_LIST.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Pestañas de estado operativo */}
        <div className="pc-filter-row" role="group" aria-label="Estado de trabajos">
          {FILTERS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={activeFilter === item.key ? 'is-active' : ''}
              aria-pressed={activeFilter === item.key}
              onClick={() => handleFilterChange(item.key)}
            >
              {item.label}
              <span>{filterCount(item.key)}</span>
            </button>
          ))}
        </div>

        {/* Sección de aviso para órdenes heredadas si existen en la vista */}
        {visibleLegacy.length > 0 && (
          <aside
            className="pc-legacy-notice"
            role="note"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              color: '#1d4ed8',
              fontSize: '13px',
              margin: '12px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={16} aria-hidden="true" />
              <span>
                Convivencia operativa: {visibleLegacy.length}{' '}
                {visibleLegacy.length === 1 ? 'orden heredada' : 'órdenes heredadas'} en
                transición desde el sistema de flujos anterior.
              </span>
            </div>
            <Link
              className="button button-outline"
              style={{ fontSize: '12px', padding: '4px 10px', height: 'auto', whiteSpace: 'nowrap' }}
              to="/operaciones/flujos?tab=production"
            >
              Ver en flujos <ExternalLink size={13} />
            </Link>
          </aside>
        )}

        {/* Advertencias y errores */}
        {error && (
          <div className="pc-error" role="alert">
            {error}
            <button
              type="button"
              className="button button-outline"
              onClick={() => void triggerRefresh()}
            >
              Reintentar
            </button>
          </div>
        )}

        {balanceUnavailable && (
          <div className="pc-balance-warning" role="status">
            <AlertTriangle size={15} /> Los trabajos están cargados, pero no se pudo
            verificar el saldo de algunos pedidos. Actualiza la vista para reintentar.
          </div>
        )}

        {/* 7 Vistas unificadas de cola de producción */}
        {loading && !queueViewItems.length ? (
          <ProductionQueueSkeleton />
        ) : queueViewItems.length > 0 ? (
          <ProductionQueueViews
            areaSlug="coordinacion"
            areaName="Coordinación de trabajos"
            items={queueViewItems}
            today={todayKey()}
            loading={loading || refreshing}
            mode={activeViewMode}
            onModeChange={handleViewModeChange}
            storageScope="coordinacion"
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onOpenItem={handleOpenItem}
            onOpen={handleOpenItem}
            renderCard={renderQueueCard}
          />
        ) : (
          <div className="pc-empty">
            No hay coincidencias entre los trabajos cargados para los filtros seleccionados.
          </div>
        )}

        {/* Botón Cargar Más */}
        {jobs.length + legacyOrders.length < totalCount && (
          <div className="pc-more">
            <button
              className="button button-outline"
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage(page + 1, false)}
            >
              {loadingMore ? 'Cargando…' : 'Cargar más trabajos'}{' '}
              <ArrowRight size={14} />
            </button>
            <span>
              {jobs.length + legacyOrders.length} de {totalCount}
            </span>
          </div>
        )}

        {/* Ficha Unificada de Trabajo de Producción in-situ (Fase 2.1) */}
        <ProductionJobDetailSheet
          open={Boolean(selectedJobId)}
          jobId={selectedJobId}
          stepId={selectedStepId}
          contextAreaCode={selectedAreaCode}
          onClose={closeJobDetail}
          onChanged={async () => {
            await triggerRefresh();
          }}
          onSelectStep={chooseStep}
        />

        {/* Drawer Chatter 360 */}
        {chatterTarget && (
          <ChatterDrawer360
            open={Boolean(chatterTarget)}
            onClose={() => setChatterTarget(null)}
            recordType="job"
            recordId={chatterTarget.recordId}
            recordTitle={chatterTarget.recordTitle}
            recordSubtitle={chatterTarget.recordSubtitle}
            recordStage={chatterTarget.recordStage}
          />
        )}
      </main>
    </AppFrame>
  );
}
