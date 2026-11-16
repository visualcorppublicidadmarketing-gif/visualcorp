import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Columns3,
  LayoutGrid,
  List as ListIcon,
  Table as TableIcon,
  X,
  Clock3,
  UserRound,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  Layers,
} from 'lucide-react';
import { ToggleGroup } from '../../components/ui/OperationalKit';
import {
  KANBAN_STATUS_COLUMNS,
  getProductionViewMode,
  setProductionViewMode,
  priorityDetails,
  safeDate,
  todayKey,
  stamp,
  type ProductionQueueViewMode,
  type StepStatus,
} from '../../lib/productionHub';
import { ProductionStageProgress, ProductionQueueSkeleton } from './ProductionQueueComponents';
import './production-queue-views.css';

export type ProductionQueueViewItem<T = unknown> = {
  id: string;
  title: string;
  code: string;
  customer: string;
  dueAt: string | null;
  dueKey: string;
  status: string;
  statusLabel: string;
  ownerLabel: string;
  overdue: boolean;
  original: T;

  // Campos opcionales de enriquecimiento para vistas consolidadas (tabla, lista, kanban, tarjetas):
  stageName?: string;
  areaName?: string;
  balanceDue?: boolean;
  balanceWarning?: boolean;
  priorityScore?: number;
  priorityReason?: string;
  progressCompleted?: number;
  progressTotal?: number;
  canAct?: boolean;
  actionLabel?: string;
  secondaryActionLabel?: string;
};

export type ProductionQueueViewsProps<T = unknown> = {
  areaSlug?: string;
  areaName: string;
  items: ProductionQueueViewItem<T>[];
  today?: string;
  renderCard?: (item: ProductionQueueViewItem<T>, compact?: boolean) => ReactNode;
  onOpen?: (item: ProductionQueueViewItem<T>) => void;
  onOpenItem?: (item: ProductionQueueViewItem<T>) => void;
  onStepAction?: (item: ProductionQueueViewItem<T>, actionKey?: string) => void;
  busyId?: string | null;
  canAct?: boolean | ((item: ProductionQueueViewItem<T>) => boolean);
  loading?: boolean;

  // Persistencia de modo de vista (controlada o local)
  mode?: ProductionQueueViewMode;
  onModeChange?: (mode: ProductionQueueViewMode) => void;
  storageScope?: string;

  // Sincronización de fecha de agenda (mes y semana)
  selectedDate?: string;
  onSelectDate?: (dateKey: string) => void;
};

export type Props<T = unknown> = ProductionQueueViewsProps<T>;

const TIME_ZONE = 'America/Guayaquil';

const MODES: { id: ProductionQueueViewMode; label: string; icon: typeof CalendarDays }[] = [
  { id: 'summary', label: 'Resumen', icon: CalendarCheck2 },
  { id: 'cards', label: 'Tarjetas', icon: LayoutGrid },
  { id: 'list', label: 'Lista', icon: ListIcon },
  { id: 'table', label: 'Tabla', icon: TableIcon },
  { id: 'kanban', label: 'Kanban', icon: Columns3 },
  { id: 'month', label: 'Mes', icon: CalendarDays },
  { id: 'week', label: 'Semana', icon: CalendarRange },
];

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const keyForDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(value)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateFromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

const addDays = (key: string, amount: number) => {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return keyForDate(date);
};

const addMonths = (key: string, amount: number) => {
  const date = dateFromKey(key);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return keyForDate(date);
};

const mondayOf = (key: string) => {
  const weekday = dateFromKey(key).getUTCDay();
  return addDays(key, -((weekday + 6) % 7));
};

const formatMonth = (key: string) =>
  new Intl.DateTimeFormat('es-EC', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(dateFromKey(key));

const formatDay = (
  key: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
) =>
  new Intl.DateTimeFormat('es-EC', { ...options, timeZone: 'UTC' }).format(
    dateFromKey(key)
  );

const formatLongDay = (key: string) =>
  new Intl.DateTimeFormat('es-EC', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateFromKey(key));

const formatTime = (value: string) => {
  const date = safeDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const validMode = (value: string | null): value is ProductionQueueViewMode =>
  MODES.some((mode) => mode.id === value);

const moveSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
};

function extractStageName<T>(item: ProductionQueueViewItem<T>): string {
  if (item.stageName) return item.stageName;
  const original = item.original as Record<string, unknown> | null;
  if (!original) return item.statusLabel || 'Por iniciar';
  const step = original.step as { title?: string } | undefined;
  if (step?.title) return step.title;
  const currentStep = original.currentStep as { title?: string } | undefined;
  if (currentStep?.title) return currentStep.title;
  const current = original.current as { title?: string } | undefined;
  if (current?.title) return current.title;
  const order = original.order as { next_step?: string } | undefined;
  if (order?.next_step) return order.next_step;
  const job = original.job as { workflow_code?: string } | undefined;
  if (job?.workflow_code === 'none') return 'Entrega directa';
  return item.statusLabel || 'Por iniciar';
}

function extractAreaName<T>(item: ProductionQueueViewItem<T>, fallbackAreaName: string): string {
  if (item.areaName) return item.areaName;
  const original = item.original as Record<string, unknown> | null;
  if (!original) return fallbackAreaName;
  const step = original.step as { area?: { name?: string }; area_name?: string } | undefined;
  if (step?.area?.name) return step.area.name;
  if (step?.area_name) return step.area_name;
  const current = original.current as { area_name?: string } | undefined;
  if (current?.area_name) return current.area_name;
  const order = original.order as { area_name?: string } | undefined;
  if (order?.area_name) return order.area_name;
  return fallbackAreaName;
}

function extractBalanceStatus<T>(item: ProductionQueueViewItem<T>): {
  balanceDue: boolean;
  label: string;
  warning: boolean;
} {
  if (typeof item.balanceDue === 'boolean') {
    return {
      balanceDue: item.balanceDue,
      label: item.balanceDue ? 'Saldo pendiente' : 'Al día',
      warning: item.balanceDue,
    };
  }
  const original = item.original as Record<string, unknown> | null;
  const job = original?.job as { balance_due?: boolean } | undefined;
  if (job?.balance_due !== undefined) {
    const isDue = Boolean(job.balance_due);
    return {
      balanceDue: isDue,
      label: isDue ? 'Saldo pendiente' : 'Al día',
      warning: isDue,
    };
  }
  const order = original?.order as { balance_due?: boolean } | undefined;
  if (order?.balance_due !== undefined) {
    const isDue = Boolean(order.balance_due);
    return {
      balanceDue: isDue,
      label: isDue ? 'Saldo pendiente' : 'Al día',
      warning: isDue,
    };
  }
  if (item.balanceWarning) {
    return {
      balanceDue: false,
      label: 'Por verificar',
      warning: true,
    };
  }
  return {
    balanceDue: false,
    label: 'Al día',
    warning: false,
  };
}

function extractPriority<T>(item: ProductionQueueViewItem<T>): { score: number; reason: string } {
  if (typeof item.priorityScore === 'number') {
    return {
      score: item.priorityScore,
      reason: item.priorityReason || 'Prioridad heurística operativa',
    };
  }
  if (item.original && typeof item.original === 'object') {
    return priorityDetails(item.original as Record<string, unknown>);
  }
  return { score: 0, reason: 'Sin acción pendiente' };
}

function extractProgress<T>(item: ProductionQueueViewItem<T>): { completed: number; total: number } | null {
  if (typeof item.progressTotal === 'number' && item.progressTotal > 0) {
    return {
      completed: item.progressCompleted || 0,
      total: item.progressTotal,
    };
  }
  const original = item.original as Record<string, unknown> | null;
  const steps = original?.steps as Array<{ status: string }> | undefined;
  if (Array.isArray(steps) && steps.length > 0) {
    const completed = steps.filter((s) => s.status === 'completed').length;
    return { completed, total: steps.length };
  }
  return null;
}

function isItemActionable<T>(
  item: ProductionQueueViewItem<T>,
  canActProp?: boolean | ((item: ProductionQueueViewItem<T>) => boolean)
): boolean {
  if (typeof item.canAct === 'boolean') return item.canAct;
  if (typeof canActProp === 'function') return canActProp(item);
  if (typeof canActProp === 'boolean') return canActProp;
  return true;
}

function DefaultQueueCard<T>({
  item,
  compact = false,
  areaName,
  onOpen,
  onStepAction,
  busyId,
  canAct,
  onPointerMove,
}: {
  item: ProductionQueueViewItem<T>;
  compact?: boolean;
  areaName: string;
  onOpen: (item: ProductionQueueViewItem<T>) => void;
  onStepAction?: (item: ProductionQueueViewItem<T>, actionKey?: string) => void;
  busyId?: string | null;
  canAct?: boolean | ((item: ProductionQueueViewItem<T>) => boolean);
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const priority = extractPriority(item);
  const progress = extractProgress(item);
  const stage = extractStageName(item);
  const area = extractAreaName(item, areaName);
  const balance = extractBalanceStatus(item);
  const isBusy = busyId === item.id;
  const canActItem = isItemActionable(item, canAct);

  const nextActionKey =
    item.status === 'ready'
      ? 'start'
      : item.status === 'in_progress'
      ? 'complete'
      : item.status === 'blocked'
      ? 'unblock'
      : undefined;

  const nextActionLabel =
    item.actionLabel ||
    (item.status === 'ready'
      ? 'Iniciar etapa'
      : item.status === 'in_progress'
      ? 'Completar etapa'
      : item.status === 'blocked'
      ? 'Reanudar'
      : null);

  return (
    <article
      className={`pj-card${item.overdue ? ' is-overdue' : ''}${compact ? ' pj-card--compact' : ''}`}
      data-state={item.status}
      onPointerMove={onPointerMove}
    >
      <div className="pj-card-main">
        <div className="pj-card-top">
          <span className="pj-card-code">{item.code}</span>
          <span className="pj-status" data-state={item.status}>
            {item.status === 'blocked' ? (
              <CircleAlert size={12} />
            ) : item.status === 'completed' ? (
              <CheckCircle2 size={12} />
            ) : (
              <Clock3 size={12} />
            )}{' '}
            {item.statusLabel}
          </span>
          {priority.score > 0 && (
            <span
              className="pj-priority"
              title="Referencia técnica de cola operativa (no representa cotización comercial ni margen)"
              aria-label={`Prioridad operativa heurística ${priority.score}: ${priority.reason}`}
            >
              Prioridad {priority.score} · {priority.reason}
            </span>
          )}
        </div>
        <h2>{item.title}</h2>
        <div className="pj-card-meta">
          <span>
            <UserRound size={13} />
            {item.customer}
          </span>
          <span>
            <CalendarClock size={13} />
            {item.overdue ? (
              <b className="is-late">
                Vencido · {item.dueAt ? stamp(item.dueAt) : 'Sin fecha'}
              </b>
            ) : item.dueAt ? (
              stamp(item.dueAt)
            ) : (
              'Sin fecha programada'
            )}
          </span>
          <span>
            <Building2 size={13} />
            {area}
          </span>
          <span>
            <Layers size={13} />
            {stage}
          </span>
          <span>{item.ownerLabel}</span>
          {balance.balanceDue && (
            <span className="pj-balance-badge is-due">
              <AlertTriangle size={11} /> Saldo pendiente
            </span>
          )}
        </div>
        {!compact && progress && (
          <ProductionStageProgress
            completed={progress.completed}
            total={progress.total}
            title={item.title}
          />
        )}
      </div>
      <div className="pj-card-footer">
        {onStepAction && canActItem && nextActionLabel && nextActionKey && (
          <button
            type="button"
            className="button button-outline pj-card-quick-action"
            disabled={isBusy}
            onClick={(e) => {
              e.stopPropagation();
              onStepAction(item, nextActionKey);
            }}
          >
            {isBusy ? <Loader2 size={13} className="pj-spin" /> : nextActionLabel}
          </button>
        )}
        <button
          type="button"
          className="pj-card-action"
          onClick={() => onOpen(item)}
          aria-label={`Abrir ficha de ${item.title}`}
        >
          Ver ficha <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

export function ProductionQueueViews<T>({
  areaSlug,
  areaName,
  items,
  today = todayKey(),
  renderCard,
  onOpen,
  onOpenItem,
  onStepAction,
  busyId,
  canAct,
  loading = false,
  mode: controlledMode,
  onModeChange,
  storageScope,
  selectedDate: controlledSelectedDate,
  onSelectDate,
}: ProductionQueueViewsProps<T>) {
  const effectiveScope = storageScope || (areaSlug ? `area:${areaSlug}` : 'coordinacion');
  const fallbackSlug = areaSlug || '';

  const resolveInitialMode = (): ProductionQueueViewMode => {
    const fromScope = getProductionViewMode(effectiveScope, 'cards');
    if (fromScope !== 'cards') return fromScope;
    if (fallbackSlug && fallbackSlug !== effectiveScope) {
      const fromSlug = getProductionViewMode(fallbackSlug, 'cards');
      if (fromSlug !== 'cards') {
        setProductionViewMode(effectiveScope, fromSlug);
        return fromSlug;
      }
    }
    return fromScope;
  };

  const [internalMode, setInternalMode] = useState<ProductionQueueViewMode>(() =>
    controlledMode || resolveInitialMode()
  );
  const [anchorDay, setAnchorDay] = useState(() => keyForDate(new Date()));
  const [internalSelectedDay, setInternalSelectedDay] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  useEffect(() => {
    if (controlledMode) return;
    setInternalMode(resolveInitialMode());
  }, [effectiveScope, fallbackSlug, controlledMode]);

  const activeMode: ProductionQueueViewMode = controlledMode || internalMode;
  const activeSelectedDay =
    controlledSelectedDate !== undefined ? controlledSelectedDate : internalSelectedDay;

  const handleSelectDay = (key: string) => {
    const nextKey = activeSelectedDay === key ? '' : key;
    if (onSelectDate) {
      onSelectDate(nextKey);
    } else {
      setInternalSelectedDay(nextKey);
    }
  };

  const handleOpen = (item: ProductionQueueViewItem<T>) => {
    if (onOpenItem) {
      onOpenItem(item);
    } else if (onOpen) {
      onOpen(item);
    }
  };

  const setView = (next: ProductionQueueViewMode) => {
    if (!controlledMode) {
      setInternalMode(next);
    }
    setProductionViewMode(effectiveScope, next);
    if (fallbackSlug && fallbackSlug !== effectiveScope) {
      setProductionViewMode(fallbackSlug, next);
    }
    onModeChange?.(next);
  };

  const monthStart = `${anchorDay.slice(0, 7)}-01`;
  const monthGridStart = addDays(monthStart, -((dateFromKey(monthStart).getUTCDay() + 6) % 7));
  const monthDays = useMemo(
    () => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)),
    [monthGridStart]
  );
  const weekStart = mondayOf(anchorDay);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart]
  );

  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, ProductionQueueViewItem<T>[]>();
    for (const item of items) {
      if (!item.dueKey) continue;
      const current = grouped.get(item.dueKey) || [];
      current.push(item);
      grouped.set(item.dueKey, current);
    }
    return grouped;
  }, [items]);

  const undatedItems = useMemo(() => items.filter((item) => !item.dueKey), [items]);
  const selectedItems = activeSelectedDay ? itemsByDate.get(activeSelectedDay) || [] : [];
  const calendarDays =
    activeMode === 'month'
      ? monthDays.filter((key) => key.slice(0, 7) === anchorDay.slice(0, 7))
      : weekDays;
  const periodItems = useMemo(
    () => calendarDays.flatMap((key) => itemsByDate.get(key) || []),
    [calendarDays, itemsByDate]
  );

  const scheduledCount = items.filter((item) => item.dueKey).length;
  const overdueCount = items.filter((item) => item.overdue).length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;

  const dateRangeLabel =
    activeMode === 'month'
      ? formatMonth(anchorDay)
      : `${formatDay(weekStart)} – ${formatDay(weekDays[6], {
          day: 'numeric',
          month: 'short',
          year: weekDays[6].slice(0, 4) !== weekStart.slice(0, 4) ? 'numeric' : undefined,
        })}`;

  const moveAnchor = (amount: number) => {
    setAnchorDay((current) =>
      activeMode === 'month' ? addMonths(current, amount) : addDays(current, amount * 7)
    );
    if (!controlledSelectedDate) {
      setInternalSelectedDay('');
    }
  };

  const renderCardItem = (item: ProductionQueueViewItem<T>, compact = false) => {
    if (renderCard) {
      return renderCard(item, compact);
    }
    return (
      <DefaultQueueCard
        item={item}
        compact={compact}
        areaName={areaName}
        onOpen={handleOpen}
        onStepAction={onStepAction}
        busyId={busyId}
        canAct={canAct}
        onPointerMove={moveSpotlight}
      />
    );
  };

  const dateEvents = (key: string, limit: number) => {
    const dayItems = itemsByDate.get(key) || [];
    return (
      <div className="pj-calendar-events">
        {dayItems.slice(0, limit).map((item) => (
          <button
            className="pj-calendar-event"
            data-state={item.status}
            data-overdue={item.overdue || undefined}
            key={item.id}
            title={`${item.code} · ${item.title} · ${item.customer}`}
            type="button"
            onClick={() => handleOpen(item)}
          >
            <span className="pj-calendar-event-code">{item.code}</span>
            <span className="pj-calendar-event-title">{item.title}</span>
          </button>
        ))}
        {dayItems.length > limit && (
          <button
            className="pj-calendar-more"
            type="button"
            onClick={() => handleSelectDay(key)}
          >
            +{dayItems.length - limit} más
          </button>
        )}
      </div>
    );
  };

  const visibleSummaryItems = summaryExpanded ? items : items.slice(0, 12);

  return (
    <section className="pj-queue-views" aria-label={`Vistas de trabajo de ${areaName}`}>
      <section
        className="pj-view-overview"
        aria-label="Resumen de la cola filtrada"
        aria-busy={loading}
      >
        <div className="pj-view-overview-heading">
          <span>RESUMEN DE ESTA VISTA</span>
          <b>
            {items.length} {items.length === 1 ? 'trabajo' : 'trabajos'}
          </b>
          <small>Los indicadores responden al filtro actual.</small>
        </div>
        <div className="pj-view-stats">
          <article className="pj-view-stat" onPointerMove={moveSpotlight}>
            <span>
              <CalendarCheck2 size={15} />
              Programados
            </span>
            <b>{scheduledCount}</b>
          </article>
          <article className="pj-view-stat" onPointerMove={moveSpotlight}>
            <span>
              <CircleDashed size={15} />
              Sin fecha
            </span>
            <b>{undatedItems.length}</b>
          </article>
          <article className="pj-view-stat is-overdue" onPointerMove={moveSpotlight}>
            <span>
              <CalendarClock size={15} />
              Vencidos
            </span>
            <b>{overdueCount}</b>
          </article>
          <article className="pj-view-stat is-blocked" onPointerMove={moveSpotlight}>
            <span>
              <CircleAlert size={15} />
              Bloqueados
            </span>
            <b>{blockedCount}</b>
          </article>
        </div>
      </section>

      <div className="pj-view-toolbar">
        <div className="pj-view-switcher">
          <ToggleGroup
            label="Cambiar vista de trabajos"
            value={activeMode}
            onValueChange={(value) => {
              if (validMode(value)) setView(value);
            }}
            options={MODES.map(({ id, label, icon: ModeIcon }) => ({
              value: id,
              label: (
                <>
                  <ModeIcon size={14} />
                  <span>{label}</span>
                </>
              ),
            }))}
          />
        </div>
        {(activeMode === 'month' || activeMode === 'week') && (
          <div
            className="pj-view-navigation"
            aria-label={`Navegación del calendario por ${
              activeMode === 'month' ? 'mes' : 'semana'
            }`}
          >
            <button
              type="button"
              className="pj-view-nav-button"
              aria-label={activeMode === 'month' ? 'Mes anterior' : 'Semana anterior'}
              onClick={() => moveAnchor(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <b aria-live="polite">{dateRangeLabel}</b>
            <button
              type="button"
              className="pj-view-nav-button"
              aria-label={activeMode === 'month' ? 'Mes siguiente' : 'Semana siguiente'}
              onClick={() => moveAnchor(1)}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              className="pj-view-today"
              onClick={() => {
                setAnchorDay(today);
                if (!controlledSelectedDate) setInternalSelectedDay('');
              }}
            >
              Hoy
            </button>
          </div>
        )}
      </div>

      {loading && <ProductionQueueSkeleton />}

      {!loading && (
        <>
          {/* 1. MODO RESUMEN (summary): Muestra resumen operativo + TODOS los trabajos filtrados sin truncar silenciosamente */}
          {activeMode === 'summary' && (
            <div className="pj-summary-view" aria-label={`Resumen de trabajos de ${areaName}`}>
              <section className="pj-list">
                {visibleSummaryItems.map((item) => (
                  <div key={item.id}>{renderCardItem(item, true)}</div>
                ))}
              </section>

              {items.length > 12 && (
                <div className="pj-summary-pagination">
                  <span>
                    Mostrando{' '}
                    <b>
                      {visibleSummaryItems.length} de {items.length}
                    </b>{' '}
                    trabajos filtrados.
                  </span>
                  <button
                    type="button"
                    className="button button-outline pj-summary-expand"
                    onClick={() => setSummaryExpanded((expanded) => !expanded)}
                  >
                    {summaryExpanded
                      ? 'Mostrar primeros 12 trabajos'
                      : `Mostrar todos (${items.length})`}
                  </button>
                </div>
              )}

              {!items.length && (
                <p className="pj-period-empty" role="status">
                  No hay trabajos que requieran seguimiento en esta selección.
                </p>
              )}
            </div>
          )}

          {/* 2. MODO TARJETAS (cards): Tarjetas detalladas con prioridad heurística, motivo y progreso */}
          {activeMode === 'cards' && (
            <section className="pj-list" aria-label={`Trabajos de ${areaName} en tarjetas`}>
              {items.map((item) => (
                <div key={item.id}>{renderCardItem(item, false)}</div>
              ))}
              {!items.length && (
                <p className="pj-period-empty" role="status">
                  No hay trabajos que coincidan con la selección actual.
                </p>
              )}
            </section>
          )}

          {/* 3. MODO LISTA (list): Lista compacta de alta legibilidad en formato filas escaneables */}
          {activeMode === 'list' && (
            <section className="pj-list-view" aria-label={`Trabajos de ${areaName} en lista`}>
              <div className="pj-list-view-head" role="row">
                <span>Trabajo</span>
                <span>Cliente / Área</span>
                <span>Estado</span>
                <span>Responsable</span>
                <span>Fecha límite</span>
                <span className="sr-only">Acciones</span>
              </div>
              <div className="pj-list-view-body">
                {items.map((item) => (
                  <article
                    className="pj-list-view-row"
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpen(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpen(item);
                      }
                    }}
                    aria-label={`Abrir ${item.code}: ${item.title}`}
                  >
                    <div className="pj-list-view-work">
                      <b>{item.code}</b>
                      <strong>{item.title}</strong>
                      <small>{extractStageName(item)}</small>
                    </div>
                    <div className="pj-list-view-client">
                      <span>{item.customer}</span>
                      <small>{extractAreaName(item, areaName)}</small>
                    </div>
                    <span className="pj-status" data-state={item.status}>
                      {item.statusLabel}
                    </span>
                    <span className="pj-list-view-owner">{item.ownerLabel}</span>
                    <span className={`pj-list-view-due${item.overdue ? ' is-late' : ''}`}>
                      {item.dueKey ? (
                        <>
                          {formatDay(item.dueKey, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}
                          {item.dueAt && <> · {formatTime(item.dueAt)}</>}
                        </>
                      ) : (
                        'Sin fecha'
                      )}
                    </span>
                    <div className="pj-list-view-arrow">
                      <button
                        type="button"
                        className="pj-table-open"
                        aria-label={`Abrir ${item.code}: ${item.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpen(item);
                        }}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </article>
                ))}
                {!items.length && (
                  <p className="pj-period-empty" role="status">
                    No hay trabajos en lista para mostrar.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* 4. MODO TABLA (table): Tabla completa con columnas reales envuelta en .table-wrap */}
          {activeMode === 'table' && (
            <div
              className="table-wrap pj-table-scroll"
              tabIndex={0}
              aria-label={`Tabla de trabajos de ${areaName}`}
            >
              <table className="pj-jobs-table">
                <thead>
                  <tr>
                    <th scope="col">Trabajo</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Etapa</th>
                    <th scope="col">Área</th>
                    <th scope="col">Responsable</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Entrega</th>
                    <th scope="col">Saldo</th>
                    <th scope="col" className="pj-th-actions">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const stage = extractStageName(item);
                    const area = extractAreaName(item, areaName);
                    const balance = extractBalanceStatus(item);
                    const isBusy = busyId === item.id;
                    const canActItem = isItemActionable(item, canAct);
                    const nextActionKey =
                      item.status === 'ready'
                        ? 'start'
                        : item.status === 'in_progress'
                        ? 'complete'
                        : item.status === 'blocked'
                        ? 'unblock'
                        : undefined;

                    return (
                      <tr key={item.id} onClick={() => handleOpen(item)}>
                        <td>
                          <span className="pj-list-view-work">
                            <b>{item.code}</b>
                            <strong>{item.title}</strong>
                          </span>
                        </td>
                        <td>
                          <span className="pj-table-customer" title={item.customer}>
                            {item.customer}
                          </span>
                        </td>
                        <td>
                          <span className="pj-table-stage" title={stage}>
                            {stage}
                          </span>
                        </td>
                        <td>
                          <span className="pj-table-area">{area}</span>
                        </td>
                        <td className="pj-list-view-owner">
                          <span>{item.ownerLabel}</span>
                        </td>
                        <td>
                          <span className="pj-status" data-state={item.status}>
                            {item.statusLabel}
                          </span>
                        </td>
                        <td className={item.overdue ? 'is-late' : ''}>
                          {item.dueKey ? (
                            <>
                              <b>{formatDay(item.dueKey, { day: 'numeric', month: 'short' })}</b>
                              {item.dueAt && <small> · {formatTime(item.dueAt)}</small>}
                            </>
                          ) : (
                            <span className="pj-muted-text">Sin fecha</span>
                          )}
                        </td>
                        <td>
                          {balance.balanceDue ? (
                            <span
                              className="pj-balance-badge is-due"
                              title="Saldo pendiente de cobro en ventas/caja"
                            >
                              <AlertTriangle size={11} /> Pendiente
                            </span>
                          ) : balance.warning ? (
                            <span className="pj-balance-badge is-warn" title="Saldo por verificar">
                              Por verificar
                            </span>
                          ) : (
                            <span className="pj-balance-badge is-ok">Al día</span>
                          )}
                        </td>
                        <td
                          className="pj-table-actions-cell"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="pj-table-action-group">
                            {onStepAction && canActItem && nextActionKey && (
                              <button
                                type="button"
                                className="pj-btn-action"
                                disabled={isBusy}
                                onClick={() => onStepAction(item, nextActionKey)}
                                title={
                                  nextActionKey === 'start'
                                    ? 'Iniciar etapa'
                                    : nextActionKey === 'complete'
                                    ? 'Completar etapa'
                                    : 'Reanudar'
                                }
                              >
                                {isBusy ? (
                                  <Loader2 size={13} className="pj-spin" />
                                ) : nextActionKey === 'start' ? (
                                  'Iniciar'
                                ) : nextActionKey === 'complete' ? (
                                  'Completar'
                                ) : (
                                  'Reanudar'
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              className="pj-table-open"
                              aria-label={`Abrir ${item.code}: ${item.title}`}
                              onClick={() => handleOpen(item)}
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={9} className="pj-empty-cell" role="status">
                        No hay trabajos que coincidan con la selección actual.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. MODO KANBAN (kanban): Usa exactamente KANBAN_STATUS_COLUMNS (6 columnas reales) */}
          {activeMode === 'kanban' && (
            <div
              className="pj-kanban-scroll"
              tabIndex={0}
              aria-label={`Tablero kanban de ${areaName}`}
            >
              <section
                className="pj-kanban"
                aria-label={`Trabajos de ${areaName} agrupados por etapa`}
              >
                {KANBAN_STATUS_COLUMNS.map((column) => {
                  const columnItems = items.filter((item) => item.status === column.key);
                  return (
                    <section
                      className="pj-kanban-column"
                      data-state={column.key}
                      key={column.key}
                      aria-label={`${column.label}: ${columnItems.length}`}
                    >
                      <header>
                        <h3>{column.label}</h3>
                        <span title={`${columnItems.length} trabajos`}>{columnItems.length}</span>
                      </header>
                      <small className="pj-kanban-col-desc">{column.description}</small>
                      <div className="pj-kanban-column-items">
                        {columnItems.map((item) => (
                          <div key={item.id}>{renderCardItem(item, true)}</div>
                        ))}
                        {columnItems.length === 0 && (
                          <p className="pj-kanban-empty">Sin trabajos en esta etapa.</p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </section>
            </div>
          )}

          {/* 6 y 7. MODOS AGENDA (month & week): Calendario de agenda sincronizado con selección y bandeja sin fecha */}
          {(activeMode === 'month' || activeMode === 'week') && (
            <>
              <div className="pj-calendar-legend" aria-live="polite">
                <span>{periodItems.length} en este periodo</span>
                <span>{undatedItems.length} sin fecha</span>
                <span>{overdueCount} vencidos</span>
              </div>
              {periodItems.length === 0 && (
                <p className="pj-period-empty">
                  No hay trabajos programados para este{' '}
                  {activeMode === 'month' ? 'mes' : 'semana'}. Los trabajos sin fecha siguen
                  disponibles abajo.
                </p>
              )}
              <div
                className="pj-calendar-scroll"
                tabIndex={0}
                aria-label={`Calendario de ${areaName}`}
              >
                <div className={`pj-calendar-grid pj-calendar-grid--${activeMode}`}>
                  <div className="pj-calendar-weekdays">
                    {WEEKDAYS.map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="pj-calendar-days">
                    {(activeMode === 'month' ? monthDays : weekDays).map((key) => {
                      const count = itemsByDate.get(key)?.length || 0;
                      const isOutside =
                        activeMode === 'month' && key.slice(0, 7) !== anchorDay.slice(0, 7);
                      const isDaySelected = key === activeSelectedDay;
                      return (
                        <article
                          className={`pj-calendar-day${isOutside ? ' is-outside' : ''}${
                            key === today ? ' is-today' : ''
                          }${isDaySelected ? ' is-selected' : ''}`}
                          key={key}
                          onPointerMove={moveSpotlight}
                        >
                          <div className="pj-calendar-day-head">
                            {activeMode === 'week' && (
                              <span className="pj-calendar-weekday">
                                {WEEKDAYS[(dateFromKey(key).getUTCDay() + 6) % 7]}
                              </span>
                            )}
                            <button
                              type="button"
                              className="pj-calendar-date"
                              aria-pressed={isDaySelected}
                              aria-label={`Ver trabajos del ${formatLongDay(key)}`}
                              onClick={() => handleSelectDay(key)}
                            >
                              {Number(key.slice(-2))}
                            </button>
                            {count > 0 && (
                              <span
                                className="pj-calendar-count"
                                aria-label={`${count} trabajos`}
                              >
                                {count}
                              </span>
                            )}
                          </div>
                          {dateEvents(key, activeMode === 'month' ? 2 : 4)}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Versión móvil de agenda */}
              <div className="pj-calendar-agenda" aria-label={`Agenda móvil de ${areaName}`}>
                {calendarDays
                  .filter((key) => (itemsByDate.get(key)?.length || 0) > 0 || key === today)
                  .map((key) => {
                    const dayItems = itemsByDate.get(key) || [];
                    const isDaySelected = key === activeSelectedDay;
                    return (
                      <article
                        className={`pj-agenda-day${key === today ? ' is-today' : ''}`}
                        key={key}
                      >
                        <button
                          type="button"
                          className="pj-agenda-day-heading"
                          aria-pressed={isDaySelected}
                          onClick={() => handleSelectDay(key)}
                        >
                          <span>
                            <b>
                              {formatDay(key, {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                              })}
                            </b>
                            {key === today && <small>Hoy</small>}
                          </span>
                          <span className="pj-agenda-day-count">{dayItems.length}</span>
                        </button>
                        {dayItems.length ? (
                          <div className="pj-agenda-items">
                            {dayItems.map((item) => (
                              <button
                                className="pj-agenda-item"
                                data-state={item.status}
                                data-overdue={item.overdue || undefined}
                                key={item.id}
                                type="button"
                                onClick={() => handleOpen(item)}
                              >
                                <span className="pj-agenda-item-copy">
                                  <b>{item.title}</b>
                                  <small>
                                    {item.code} · {item.customer}
                                  </small>
                                </span>
                                <span className="pj-agenda-item-meta">
                                  {item.dueAt ? formatTime(item.dueAt) : item.statusLabel}
                                  <ChevronRight size={14} />
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="pj-agenda-day-empty">
                            No hay trabajos programados para este día.
                          </p>
                        )}
                      </article>
                    );
                  })}
                {calendarDays.every((key) => (itemsByDate.get(key)?.length || 0) === 0) && (
                  <p className="pj-period-empty">No hay trabajos programados en este periodo.</p>
                )}
              </div>

              {/* Ficha desplegable de día seleccionado */}
              {activeSelectedDay && (
                <section className="pj-calendar-selection" aria-live="polite">
                  <div className="pj-calendar-selection-head">
                    <div>
                      <span className="pj-calendar-eyebrow">DÍA SELECCIONADO</span>
                      <h3>{formatLongDay(activeSelectedDay)}</h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Cerrar trabajos del día"
                      onClick={() => handleSelectDay(activeSelectedDay)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  {selectedItems.length ? (
                    <div className="pj-calendar-selection-items">
                      {selectedItems.map((item) => (
                        <div key={item.id}>{renderCardItem(item, true)}</div>
                      ))}
                    </div>
                  ) : (
                    <p>No hay trabajos con fecha para este día.</p>
                  )}
                </section>
              )}

              {/* Bandeja de trabajos sin fecha programada */}
              {undatedItems.length > 0 && (
                <details className="pj-undated" open>
                  <summary>
                    <span>Sin fecha programada</span>
                    <b>{undatedItems.length}</b>
                  </summary>
                  <p>
                    Estos trabajos siguen visibles aquí hasta que se defina una fecha para su
                    etapa o entrega.
                  </p>
                  <div className="pj-calendar-selection-items">
                    {undatedItems.map((item) => (
                      <div key={item.id}>{renderCardItem(item, true)}</div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
