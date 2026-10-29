import { AlertTriangle, CalendarClock, ClipboardList, UserRoundX } from 'lucide-react';
import { Skeleton } from '../../components/ui/Skeleton';

type QueueSummaryProps = {
  total: number;
  unassigned: number;
  overdue: number;
  blocked: number;
  loading: boolean;
};

export function ProductionQueueSummary({ total, unassigned, overdue, blocked, loading }: QueueSummaryProps) {
  const metrics = [
    { label: 'En esta área', value: total, icon: ClipboardList },
    { label: 'Sin responsable', value: unassigned, icon: UserRoundX },
    { label: 'Vencidos', value: overdue, icon: CalendarClock },
    { label: 'Bloqueados', value: blocked, icon: AlertTriangle },
  ];

  return <section className="pj-summary" aria-label="Resumen de trabajos" aria-busy={loading}>
    {metrics.map(({ label, value, icon: Icon }) => <div className="pj-summary-card" key={label}>
      <span className="pj-summary-icon" aria-hidden="true"><Icon size={17}/></span>
      <span className="pj-summary-copy"><span>{label}</span>{loading ? <Skeleton className="pj-summary-skeleton"/> : <strong>{value}</strong>}</span>
    </div>)}
  </section>;
}

type StageProgressProps = {
  completed: number;
  total: number;
  title: string;
};

export function ProductionStageProgress({ completed, total, title }: StageProgressProps) {
  if (total === 0) return null;
  return <div className="pj-progress">
    <div className="pj-progress-label"><span>Avance del recorrido</span><strong>{completed} de {total} etapas</strong></div>
    <progress value={completed} max={total} aria-label={`Avance de ${title}: ${completed} de ${total} etapas`}/>
  </div>;
}

export function ProductionQueueSkeleton() {
  return <div className="pj-list" role="status" aria-label="Cargando tarjetas de trabajos">
    {[0, 1, 2].map((index) => <div className="pj-card pj-card-skeleton" key={index} aria-hidden="true">
      <div className="pj-card-main"><Skeleton className="pj-skeleton-short"/><Skeleton className="pj-skeleton-title"/><Skeleton className="pj-skeleton-meta"/></div>
      <Skeleton className="pj-skeleton-action"/>
    </div>)}
  </div>;
}
