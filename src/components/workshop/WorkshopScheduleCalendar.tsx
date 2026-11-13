import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { Calendar, dateFromKey, dateToKey } from '../ui/Calendar';
import { getWorkshopTodayKey, type WorkshopScheduleEvent } from './workshopTypes';
import './workshop-schedule-calendar.css';

export interface WorkshopScheduleCalendarProps {
  events: readonly WorkshopScheduleEvent[];
  selectedDate?: string;
  selectedJobId?: string | null;
  onSelectDate?: (date: string) => void;
  onSelectEvent?: (event: WorkshopScheduleEvent) => void;
  onShowOnMap?: (jobId: string) => void;
  onRequestLocationEdit?: (jobId: string) => void;
  className?: string;
}

const eventKindLabels: Record<WorkshopScheduleEvent['kind'], string> = {
  production: 'Producción', installation: 'Instalación', delivery: 'Entrega', deadline: 'Fecha de trabajo',
};

export function WorkshopScheduleCalendar({
  events,
  selectedDate,
  selectedJobId,
  onSelectDate,
  onSelectEvent,
  onShowOnMap,
  onRequestLocationEdit,
  className = '',
}: WorkshopScheduleCalendarProps) {
  const [internalDate, setInternalDate] = useState(getWorkshopTodayKey);
  const activeDate = selectedDate || internalDate;
  const eventsByDate = useMemo(() => {
    const result = new Map<string, WorkshopScheduleEvent[]>();
    events.forEach((event) => result.set(event.date, [...(result.get(event.date) || []), event]));
    return result;
  }, [events]);
  const activeEvents = eventsByDate.get(activeDate) || [];
  const metadata = useCallback((date: Date) => {
    const dateEvents = eventsByDate.get(dateToKey(date));
    if (!dateEvents?.length) return undefined;
    const count = dateEvents.length;
    const titles = dateEvents.map((event) => `${eventKindLabels[event.kind]}: ${event.code}`).join(', ');
    return {
      badge: count > 99 ? '99+' : String(count),
      description: `${count} ${count === 1 ? 'evento' : 'eventos'}: ${titles}`,
    };
  }, [eventsByDate]);
  const chooseDate = (next: string) => {
    setInternalDate(next);
    onSelectDate?.(next);
  };
  const formattedDate = useMemo(() => {
    const date = dateFromKey(activeDate);
    return date
      ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'full' }).format(date)
      : 'Fecha seleccionada';
  }, [activeDate]);

  return (
    <section className={`vc-workshop-calendar ${className}`} aria-label="Calendario de trabajos">
      <div className="vc-workshop-calendar-grid">
        <Calendar
          value={activeDate}
          onChange={chooseDate}
          label="Fechas de producción, entrega e instalación"
          getDateMetadata={metadata}
          cellSize="comfortable"
        />

        <section className="vc-workshop-agenda" aria-labelledby="vc-workshop-agenda-title">
          <header className="vc-workshop-agenda-head">
            <div>
              <span className="vc-workshop-agenda-kicker"><CalendarDays size={14} /> Agenda del día</span>
              <h2 id="vc-workshop-agenda-title" aria-live="polite">{formattedDate}</h2>
            </div>
            <span className="vc-workshop-agenda-count" aria-label={`${activeEvents.length} eventos`}>
              {activeEvents.length}
            </span>
          </header>

          {activeEvents.length === 0 ? (
            <p className="vc-workshop-agenda-empty">No hay trabajos programados para esta fecha.</p>
          ) : (
            <ul className="vc-workshop-agenda-list">
              {activeEvents.map((event) => (
                <li key={event.id}>
                  <article className={`vc-workshop-event ${selectedJobId === event.jobId ? 'is-selected' : ''}`} data-kind={event.kind}>
                    <div className="vc-workshop-event-time">{event.time || 'Hora pendiente'}</div>
                    <div className="vc-workshop-event-main">
                      <span className="vc-workshop-event-kind">{eventKindLabels[event.kind]}</span>
                      {onSelectEvent ? (
                        <button type="button" className="vc-workshop-event-title" onClick={() => onSelectEvent(event)}>
                          {event.code} · {event.title}
                        </button>
                      ) : (
                        <h3 className="vc-workshop-event-title">{event.code} · {event.title}</h3>
                      )}
                      <span className="vc-workshop-event-client">{event.clientName}</span>
                      <span className="vc-workshop-event-meta">{event.areaLabel} · {event.status.replaceAll('_', ' ')}</span>
                      {event.address && <span className="vc-workshop-event-address"><MapPin size={13} /> {event.address}</span>}
                      {event.kind === 'installation' && !event.hasMapLocation && <span className="vc-workshop-event-location-pending">Pin de mapa pendiente</span>}
                    </div>
                    {event.hasMapLocation && onShowOnMap && (
                      <button
                        className="vc-workshop-event-map"
                        type="button"
                        aria-label={`Ver ubicación de ${event.code} en el mapa`}
                        onClick={() => onShowOnMap(event.jobId)}
                      >
                        <MapPin size={16} />
                      </button>
                    )}
                    {event.kind === 'installation' && !event.hasMapLocation && onRequestLocationEdit && (
                      <button
                        className="vc-workshop-event-map"
                        type="button"
                        aria-label={`Agregar ubicación para ${event.code}`}
                        onClick={() => onRequestLocationEdit(event.jobId)}
                      >
                        <MapPin size={16} />
                      </button>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
