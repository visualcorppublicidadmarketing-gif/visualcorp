import { AlertTriangle, CalendarClock, ClipboardList, RefreshCw, UserRoundX } from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';

export interface ProductionQueueSummaryProps {
  total: number;
  unassigned: number;
  overdue: number;
  blocked: number;
  loading: boolean;
  totalLabel?: string;
}

export function ProductionQueueSummary({
  total,
  unassigned,
  overdue,
  blocked,
  loading,
  totalLabel = 'En esta área',
}: ProductionQueueSummaryProps) {
  const metrics = [
    { label: totalLabel, value: total, icon: ClipboardList },
    { label: 'Sin responsable', value: unassigned, icon: UserRoundX },
    { label: 'Vencidos', value: overdue, icon: CalendarClock },
    { label: 'Bloqueados', value: blocked, icon: AlertTriangle },
  ];

  return (
    <section
      className="pj-summary"
      role="region"
      aria-label="Resumen de trabajos"
      aria-busy={loading}
    >
      {metrics.map(({ label, value, icon: Icon }) => (
        <div className="pj-summary-card" key={label}>
          <span className="pj-summary-icon" aria-hidden="true">
            <Icon size={17} />
          </span>
          <span className="pj-summary-copy">
            <span>{label}</span>
            {loading ? (
              <Skeleton className="pj-summary-skeleton" />
            ) : (
              <strong>{value}</strong>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

export interface ProductionStageProgressProps {
  completed: number;
  total: number;
  title: string;
}

export function ProductionStageProgress({
  completed,
  total,
  title,
}: ProductionStageProgressProps) {
  if (total === 0) return null;
  return (
    <div className="pj-progress">
      <div className="pj-progress-label">
        <span>Avance del recorrido</span>
        <strong>
          {completed} de {total} etapas
        </strong>
      </div>
      <progress
        value={completed}
        max={total}
        aria-label={`Avance de ${title}: ${completed} de ${total} etapas`}
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
      />
    </div>
  );
}

export function ProductionQueueSkeleton() {
  return (
    <div
      className="pj-list"
      role="status"
      aria-live="polite"
      aria-label="Cargando tarjetas de trabajos"
    >
      {[0, 1, 2].map((index) => (
        <div className="pj-card pj-card-skeleton" key={index} aria-hidden="true">
          <div className="pj-card-main">
            <Skeleton className="pj-skeleton-short" />
            <Skeleton className="pj-skeleton-title" />
            <Skeleton className="pj-skeleton-meta" />
          </div>
          <Skeleton className="pj-skeleton-action" />
        </div>
      ))}
    </div>
  );
}

export interface ProductionSyncNoticeProps {
  isStale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  className?: string;
}

export function ProductionSyncNotice({
  isStale,
  refreshing,
  onRefresh,
  className = '',
}: ProductionSyncNoticeProps) {
  if (!isStale) return null;
  return (
    <div
      className={`pj-stale-notice ${className}`}
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 14px',
        borderRadius: '10px',
        background: 'rgba(234, 88, 12, 0.1)',
        border: '1px solid rgba(234, 88, 12, 0.3)',
        color: '#c2410c',
        fontSize: '13px',
        margin: '10px 0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Los datos pueden estar desactualizados debido a inactividad o cambios en segundo plano.</span>
      </div>
      <button
        type="button"
        className="button button-outline"
        style={{ fontSize: '12px', padding: '4px 10px', height: 'auto', whiteSpace: 'nowrap' }}
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
        {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
      </button>
    </div>
  );
}
