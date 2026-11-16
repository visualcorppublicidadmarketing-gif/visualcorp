/**
 * Visual Corp Suite — Production Jobs Page (Fase 2.3)
 *
 * Vista por área operativa (/operaciones/trabajos/:area).
 * Conectada al núcleo centralizado productionHub, Ficha Unificada ProductionJobDetailSheet
 * y sistema multi-vista ProductionQueueViews (7 vistas).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  FolderOpen,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import {
  type AreaCode,
  type AreaSlug,
  type ProductionAreaRow,
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
  emitProductionChanged,
  fetchJobBalanceFlags,
  getProductionViewMode,
  isDateOverdue,
  isStepOpen,
  priorityDetails,
  resolveProductionPermissions,
  safeDate,
  setProductionViewMode,
  stamp,
  todayKey,
  useProductionSync,
} from '../../lib/productionHub';
import { ProductionJobDetailSheet } from './ProductionJobDetailSheet';
import {
  ProductionQueueSkeleton,
  ProductionQueueSummary,
  ProductionSyncNotice,
} from './ProductionQueueComponents';
import {
  ProductionQueueViews,
  type ProductionQueueViewItem,
} from './ProductionQueueViews';
import { ProductionAttention } from './ProductionAttention';

import './production-jobs.css';
import './production-queue-components.css';

interface QueueItem {
  job: ProductionJob;
  step: ProductionStep | null;
  currentStep: ProductionStep | null;
}

export type JobAreaFilter =
  | 'all'
  | 'mine'
  | 'unassigned'
  | 'today'
  | 'overdue'
  | 'blocked';

const FILTERS: { id: JobAreaFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mine', label: 'Para mí' },
  { id: 'unassigned', label: 'Sin asignar' },
  { id: 'today', label: 'Hoy' },
  { id: 'overdue', label: 'Vencidos' },
  { id: 'blocked', label: 'Bloqueados' },
];

const VALID_QUEUE_FILTERS = new Set<JobAreaFilter>([
  'all',
  'mine',
  'unassigned',
  'today',
  'overdue',
  'blocked',
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

const queueDueAt = (item: QueueItem): string | null =>
  item.step?.due_at || item.job.fulfillment_due_at || item.job.due_at || null;

const matchesQueueFilter = (
  item: QueueItem,
  filter: JobAreaFilter,
  areaCode: AreaCode | string | undefined,
  userId: string | undefined
): boolean => {
  const step = item.step || item.currentStep;
  const owner = areaCode === 'ASE' ? item.job.advisor_id : item.step?.assigned_to;

  if (filter === 'mine') return Boolean(userId && owner === userId);
  if (filter === 'unassigned') {
    return Boolean(step && isStepOpen(step.status) && !(areaCode === 'ASE' ? step.assigned_to : owner));
  }
  if (filter === 'today') {
    const due = queueDueAt(item);
    return Boolean(due && dayKey(due) === todayKey());
  }
  if (filter === 'overdue') {
    const due = queueDueAt(item);
    return Boolean(step && isStepOpen(step.status) && isDateOverdue(due));
  }
  if (filter === 'blocked') {
    return (step?.status === 'blocked') || (item.currentStep?.status === 'blocked');
  }
  return true;
};

export function ProductionJobsPage() {
  const { area: areaSlugParam } = useParams<{ area: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const { organizationId, user } = auth;
  const permissions = resolveProductionPermissions(auth);

  const areaConfig = areaSlugParam
    ? PRODUCTION_AREA_CONFIG[areaSlugParam as AreaSlug]
    : undefined;

  // Parámetros URL sincronizados
  const rawFilter = searchParams.get('filter');
  const activeFilter: JobAreaFilter =
    rawFilter && VALID_QUEUE_FILTERS.has(rawFilter as JobAreaFilter)
      ? (rawFilter as JobAreaFilter)
      : 'all';

  const searchQuery = searchParams.get('q') || '';
  const dateParam = searchParams.get('fecha') || undefined;
  const selectedDate = dateParam || todayKey();

  const selectedJobId = searchParams.get('trabajo') || searchParams.get('job') || null;
  const selectedStepId = searchParams.get('paso') || null;

  // Persistencia y modo de vista URL
  const viewModeParam = searchParams.get('view') as ProductionQueueViewMode | null;
  const storageScope = areaConfig ? `area:${areaConfig.slug}` : 'area:unknown';
  const storedViewMode = useMemo(
    () => (areaConfig ? getProductionViewMode(storageScope, 'cards') : 'cards'),
    [areaConfig, storageScope]
  );
  const activeViewMode: ProductionQueueViewMode =
    viewModeParam && VALID_VIEW_MODES.has(viewModeParam)
      ? viewModeParam
      : storedViewMode;

  // Datos en memoria
  const [jobs, setJobs] = useState<ProductionJob[]>([]);
  const [steps, setSteps] = useState<ProductionStep[]>([]);
  const [areas, setAreas] = useState<ProductionAreaRow[]>([]);
  const [balanceFlags, setBalanceFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [queueLimit, setQueueLimit] = useState(150);

  // Carga centralizada de trabajos y etapas
  const loadData = useCallback(async () => {
    if (!organizationId || !supabase || !areaConfig) return;
    setLoading(true);
    setLoadError('');

    try {
      const client = supabase;

      // 1. Catálogo de áreas
      const areaResult = await client
        .from('areas')
        .select('id, code, name')
        .eq('organization_id', organizationId);

      if (areaResult.error) throw areaResult.error;
      const availableAreas = (areaResult.data || []) as ProductionAreaRow[];
      setAreas(availableAreas);

      let loadedJobs: ProductionJob[] = [];
      let targetSteps: ProductionStep[] = [];

      if (areaConfig.code === 'ASE') {
        let query = client
          .from('production_jobs')
          .select('*')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(queueLimit);

        if (permissions.isOnlySalesViewer && user?.id) {
          query = query.eq('advisor_id', user.id);
        }
        const result = await query;
        if (result.error) throw result.error;
        loadedJobs = (result.data || []) as ProductionJob[];
      } else {
        const matchingAreaId = availableAreas.find((r) => r.code === areaConfig.code)?.id;
        if (matchingAreaId) {
          const stepResult = await client
            .from('production_job_steps')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('area_id', matchingAreaId)
            .order('updated_at', { ascending: false })
            .limit(queueLimit);

          if (stepResult.error) throw stepResult.error;
          targetSteps = (stepResult.data || []) as ProductionStep[];

          const jobIds = [...new Set(targetSteps.map((s) => s.job_id))];
          if (jobIds.length) {
            const jobResult = await client
              .from('production_jobs')
              .select('*')
              .eq('organization_id', organizationId)
              .in('id', jobIds);

            if (jobResult.error) throw jobResult.error;
            loadedJobs = (jobResult.data || []) as ProductionJob[];
          }
        }
      }

      // Soporte para deep-link si el trabajo no estaba entre los más recientes
      if (selectedJobId && !loadedJobs.some((j) => j.id === selectedJobId)) {
        const linkedJobResult = await client
          .from('production_jobs')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('id', selectedJobId)
          .maybeSingle();

        if (linkedJobResult.data) {
          loadedJobs.push(linkedJobResult.data as ProductionJob);
        }
      }

      // Pasos globales de los trabajos cargados
      const jobIds = [...new Set(loadedJobs.map((j) => j.id))];
      let loadedSteps: ProductionStep[] = [];

      if (jobIds.length) {
        const [stepsRes, balances] = await Promise.all([
          client
            .from('production_job_steps')
            .select('*')
            .eq('organization_id', organizationId)
            .in('job_id', jobIds)
            .order('step_order', { ascending: true })
            .limit(1000),
          fetchJobBalanceFlags(organizationId, jobIds),
        ]);

        if (stepsRes.error) throw stepsRes.error;
        loadedSteps = (stepsRes.data || []) as ProductionStep[];
        setBalanceFlags(balances.flags);
      } else {
        setBalanceFlags({});
      }

      setJobs(loadedJobs);
      setSteps(loadedSteps);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'No pudimos cargar los trabajos de esta área.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    organizationId,
    areaConfig,
    queueLimit,
    permissions.isOnlySalesViewer,
    user?.id,
    selectedJobId,
  ]);

  // Sincronización explícita y detección de datos desactualizados
  const { refreshing, isStale, triggerRefresh } = useProductionSync({
    onRefresh: loadData,
    staleAfterMs: 120000,
  });

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Actualizadores de URL y filtros
  const handleFilterChange = (filterId: JobAreaFilter) => {
    const next = new URLSearchParams(searchParams);
    if (filterId === 'all') next.delete('filter');
    else next.set('filter', filterId);
    setSearchParams(next);
  };

  const handleSearchChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (!val.trim()) next.delete('q');
    else next.set('q', val);
    setSearchParams(next);
  };

  const handleViewModeChange = (mode: ProductionQueueViewMode) => {
    if (areaConfig) {
      setProductionViewMode(`area:${areaConfig.slug}`, mode);
    }
    const next = new URLSearchParams(searchParams);
    next.set('view', mode);
    setSearchParams(next);
  };

  const handleSelectDate = (dateKey: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('fecha', dateKey);
    setSearchParams(next);
  };

  const openJob = (item: QueueItem) => {
    const next = new URLSearchParams(searchParams);
    next.set('trabajo', item.job.id);
    if (item.step) next.set('paso', item.step.id);
    else next.delete('paso');
    setSearchParams(next);
  };

  const closeJob = () => {
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

  // Construcción de ítems de cola
  const queueRows = useMemo<QueueItem[]>(() => {
    if (!areaConfig) return [];
    const stepsByJob = new Map<string, ProductionStep[]>();
    for (const s of steps) {
      stepsByJob.set(s.job_id, [...(stepsByJob.get(s.job_id) || []), s]);
    }

    if (areaConfig.code === 'ASE') {
      return jobs.map((job) => ({
        job,
        step: null,
        currentStep: currentStage(stepsByJob.get(job.id) || []),
      }));
    }

    const areaId = areas.find((a) => a.code === areaConfig.code)?.id;
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    return steps
      .filter((s) => s.area_id === areaId)
      .flatMap((step) => {
        const job = jobById.get(step.job_id);
        return job
          ? [
              {
                job,
                step,
                currentStep: currentStage(stepsByJob.get(job.id) || []),
              },
            ]
          : [];
      });
  }, [areaConfig, jobs, steps, areas]);

  // Conteo de filtros
  const filterCounts = useMemo<Record<JobAreaFilter, number>>(() => {
    const counts: Record<JobAreaFilter, number> = {
      all: 0,
      mine: 0,
      unassigned: 0,
      today: 0,
      overdue: 0,
      blocked: 0,
    };
    for (const item of queueRows) {
      for (const filter of FILTERS) {
        if (matchesQueueFilter(item, filter.id, areaConfig?.code, user?.id)) {
          counts[filter.id] += 1;
        }
      }
    }
    return counts;
  }, [queueRows, areaConfig?.code, user?.id]);

  // Avance de etapas por trabajo
  const stageProgressMap = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    for (const step of steps) {
      if (step.status === 'cancelled') continue;
      const current = map.get(step.job_id) || { completed: 0, total: 0 };
      current.total += 1;
      if (step.status === 'completed') current.completed += 1;
      map.set(step.job_id, current);
    }
    return map;
  }, [steps]);

  // Filtrado y ordenamiento de ítems visibles
  const visibleItems = useMemo(() => {
    return queueRows
      .filter((item) => {
        if (!matchesQueueFilter(item, activeFilter, areaConfig?.code, user?.id)) {
          return false;
        }
        const needle = searchQuery.trim().toLocaleLowerCase('es');
        if (!needle) return true;
        const searchTarget = `${item.job.sale_code || ''} ${item.job.customer_name || ''} ${item.job.title} ${item.step?.title || ''}`.toLocaleLowerCase('es');
        return searchTarget.includes(needle);
      })
      .sort((a, b) => {
        const aScore = priorityDetails(a);
        const bScore = priorityDetails(b);
        return (
          bScore.score - aScore.score ||
          (safeDate(queueDueAt(a))?.getTime() || Infinity) -
            (safeDate(queueDueAt(b))?.getTime() || Infinity)
        );
      });
  }, [queueRows, activeFilter, searchQuery, areaConfig?.code, user?.id]);

  // Acción rápida en paso (tomar, recibir, iniciar, terminar, reanudar)
  const handleStepAction = async (
    viewItem: ProductionQueueViewItem<QueueItem>,
    actionKey?: string
  ) => {
    if (!supabase || !areaConfig || !permissions.canActInArea(areaConfig.code)) {
      openJob(viewItem.original);
      return;
    }

    const item = viewItem.original;
    const targetStep = item.step || item.currentStep;
    if (!targetStep) return;

    setBusyStepId(viewItem.id);
    try {
      if (actionKey === 'take') {
        const { error } = await supabase.rpc('transition_production_job_step', {
          p_step_id: targetStep.id,
          p_action: 'take',
          p_note: '',
          p_assigned_to: user?.id || null,
        });
        if (error) throw error;
      } else if (actionKey === 'receive') {
        const { error } = await supabase.rpc('receive_production_job_step', {
          p_step_id: targetStep.id,
          p_note: '',
        });
        if (error) throw error;
      } else if (actionKey === 'start') {
        if (targetStep.handoff_status === 'pending') {
          const { error: recvErr } = await supabase.rpc('receive_production_job_step', {
            p_step_id: targetStep.id,
            p_note: '',
          });
          if (recvErr) throw recvErr;
        }
        const { error } = await supabase.rpc('transition_production_job_step', {
          p_step_id: targetStep.id,
          p_action: 'start',
          p_note: '',
          p_assigned_to: null,
        });
        if (error) throw error;
      } else if (actionKey === 'complete') {
        if (item.job.approval_required && targetStep.step_key === 'design') {
          openJob(item);
          return;
        }
        const { error } = await supabase.rpc('transition_production_job_step', {
          p_step_id: targetStep.id,
          p_action: 'complete',
          p_note: '',
          p_assigned_to: null,
        });
        if (error) throw error;
      } else if (actionKey === 'unblock') {
        const { error } = await supabase.rpc('transition_production_job_step', {
          p_step_id: targetStep.id,
          p_action: 'unblock',
          p_note: '',
          p_assigned_to: null,
        });
        if (error) throw error;
      } else {
        openJob(item);
        return;
      }

      emitProductionChanged();
      await triggerRefresh();
    } catch (err) {
      // Si falla la acción rápida o requiere notas/evidencias, abrir la ficha completa
      openJob(item);
    } finally {
      setBusyStepId(null);
    }
  };

  // Mapeo enriquecido para las 7 vistas
  const queueViewItems = useMemo<ProductionQueueViewItem<QueueItem>[]>(() => {
    if (!areaConfig) return [];
    return visibleItems.map((item) => {
      const shownStep = item.step || item.currentStep;
      const status = (shownStep?.status || item.job.status || 'waiting') as StepStatus;
      const owner = areaConfig.code === 'ASE' ? item.job.advisor_id : item.step?.assigned_to;
      const dueAt = queueDueAt(item);
      const isOverdue = isDateOverdue(dueAt);
      const priority = priorityDetails(item);
      const progress = stageProgressMap.get(item.job.id);
      const isBalanceDue = balanceFlags[item.job.id] ?? false;

      let actionLabel: string | undefined;
      if (permissions.canActInArea(areaConfig.code) && isStepOpen(status)) {
        if (status === 'ready') {
          actionLabel = shownStep?.handoff_status === 'pending' ? 'Recibir etapa' : 'Iniciar etapa';
        } else if (status === 'in_progress') {
          actionLabel = 'Completar etapa';
        } else if (status === 'blocked') {
          actionLabel = 'Reanudar';
        }
      }

      return {
        id: `${item.job.id}-${item.step?.id || 'area'}`,
        title: item.step ? `${item.step.title} · ${item.job.title}` : item.job.title,
        code: item.job.sale_code || 'TRABAJO',
        customer: item.job.customer_name || 'Cliente por consultar',
        dueAt,
        dueKey: dayKey(dueAt),
        status,
        statusLabel: STEP_STATUS_LABELS[status] || status,
        ownerLabel:
          owner === user?.id ? 'A mi cargo' : owner ? 'Asignado' : 'Sin responsable',
        overdue: isOverdue,
        original: item,
        stageName: shownStep?.title || item.job.title,
        areaName: areaConfig.areaName,
        balanceDue: isBalanceDue,
        priorityScore: priority.score,
        priorityReason: priority.reason,
        progressCompleted: progress?.completed,
        progressTotal: progress?.total,
        canAct: permissions.canActInArea(areaConfig.code) && isStepOpen(status),
        actionLabel,
      };
    });
  }, [
    visibleItems,
    areaConfig,
    user?.id,
    stageProgressMap,
    balanceFlags,
    permissions,
  ]);

  // Validaciones de ruta y permisos
  if (!areaConfig) {
    return <Navigate to="/operaciones/trabajos/asesoria" replace />;
  }

  const hasAreaAccess =
    areaConfig.code === 'ASE'
      ? permissions.canViewSales || permissions.canViewWorkshop
      : permissions.canViewWorkshop;

  if (!hasAreaAccess) {
    return (
      <AppFrame area="operations">
        <PageHeading
          eyebrow="OPERACIONES · TRABAJOS"
          title="Sin acceso a esta área"
          description="Pide a un responsable que revise los permisos de tu perfil."
        />
      </AppFrame>
    );
  }

  const AreaIcon = areaConfig.icon;

  return (
    <AppFrame area="operations">
      <main className="production-jobs">
        <PageHeading
          eyebrow="OPERACIONES · TRABAJOS"
          title={areaConfig.title}
          description={areaConfig.intro}
          action={
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <ProductionAttention />
              <Link className="button button-outline" to="/operaciones/cartelera-taller">
                <MapPin size={15} /> Cartelera & Mapa
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

        {/* Navegación declarativa entre áreas según permisos del usuario */}
        <nav className="pj-area-nav" aria-label="Áreas de trabajo">
          {PRODUCTION_AREA_LIST.filter((entry) =>
            entry.code === 'ASE'
              ? permissions.canViewSales || permissions.canViewWorkshop
              : permissions.canViewWorkshop
          ).map((entry) => {
            const NavIcon = entry.icon;
            const isCurrent = entry.slug === areaConfig.slug;
            return (
              <Link
                key={entry.slug}
                to={`/operaciones/trabajos/${entry.slug}`}
                aria-current={isCurrent ? 'page' : undefined}
              >
                <NavIcon size={15} />
                {entry.title}
              </Link>
            );
          })}
        </nav>

        {/* Resumen numérico accesible */}
        <ProductionQueueSummary
          total={filterCounts.all}
          unassigned={filterCounts.unassigned}
          overdue={filterCounts.overdue}
          blocked={filterCounts.blocked}
          loading={loading}
          totalLabel={`En ${areaConfig.title}`}
        />

        {/* Aviso de datos desactualizados si aplica */}
        <ProductionSyncNotice
          isStale={isStale}
          refreshing={refreshing}
          onRefresh={() => void triggerRefresh()}
        />

        {/* Barra de herramientas: Filtros y Búsqueda */}
        <div className="pj-toolbar">
          <div className="pj-filter" role="group" aria-label="Filtrar trabajos">
            {FILTERS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={activeFilter === entry.id}
                onClick={() => handleFilterChange(entry.id)}
              >
                {entry.label}
                {!loading && (
                  <span
                    className="pj-filter-count"
                    aria-label={`${filterCounts[entry.id]} trabajos`}
                  >
                    {filterCounts[entry.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <label className="pj-search">
            <span>Buscar trabajo</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cliente, venta o producto"
            />
          </label>
        </div>

        {/* Contador de estado */}
        <div className="pj-count" role="status" aria-live="polite">
          {loading
            ? 'Cargando trabajos…'
            : `${visibleItems.length} ${
                visibleItems.length === 1 ? 'trabajo visible' : 'trabajos visibles'
              }`}
        </div>

        {/* Errores de carga */}
        {loadError && (
          <div className="pj-error" role="alert">
            No pudimos consultar las órdenes actuales. {loadError}{' '}
            <button
              className="button button-outline"
              type="button"
              onClick={() => void triggerRefresh()}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Estado vacío */}
        {!loading && !loadError && !visibleItems.length && (
          <div className="pj-empty">
            <AreaIcon size={24} />
            <b>
              {queueRows.length
                ? 'No hay trabajos para este filtro'
                : `No hay trabajos asignados a ${areaConfig.title}`}
            </b>
            <p>
              {queueRows.length
                ? 'Cambia el filtro o busca por cliente, venta o producto.'
                : 'Los nuevos trabajos aparecerán aquí al confirmar una venta con una ruta de producción configurada.'}
            </p>
            {queueRows.length > 0 && (activeFilter !== 'all' || searchQuery) && (
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  handleFilterChange('all');
                  handleSearchChange('');
                }}
              >
                Mostrar todos
              </button>
            )}
          </div>
        )}

        {/* Esqueletos durante carga inicial */}
        {loading && !loadError && <ProductionQueueSkeleton />}

        {/* 7 Vistas unificadas de cola de producción */}
        {!loading && !loadError && visibleItems.length > 0 && (
          <ProductionQueueViews
            areaSlug={areaConfig.slug}
            areaName={areaConfig.title}
            items={queueViewItems}
            today={todayKey()}
            loading={loading || refreshing}
            mode={activeViewMode}
            onModeChange={handleViewModeChange}
            storageScope={storageScope}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
            onOpen={(item) => openJob(item.original)}
            onOpenItem={(item) => openJob(item.original)}
            onStepAction={handleStepAction}
            busyId={busyStepId}
          />
        )}

        {/* Paginación / Cargar más */}
        {!loading && !loadError && queueRows.length >= queueLimit && (
          <div className="pj-count" style={{ marginTop: '16px' }}>
            <span>Se muestran los {queueLimit} trabajos más recientes de esta área.</span>{' '}
            <button
              className="button button-outline"
              type="button"
              onClick={() => setQueueLimit((value) => value + 150)}
            >
              Cargar más
            </button>
          </div>
        )}

        {/* Ficha Unificada de Trabajo de Producción (Fase 2.1) */}
        <ProductionJobDetailSheet
          open={Boolean(selectedJobId)}
          jobId={selectedJobId}
          stepId={selectedStepId}
          contextAreaCode={areaConfig.code}
          onClose={closeJob}
          onChanged={triggerRefresh}
          onSelectStep={chooseStep}
        />
      </main>
    </AppFrame>
  );
}
