import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, FileText, MapPin, RotateCcw } from 'lucide-react';
import { Calendar, dateFromKey, dateToKey } from '../ui/Calendar';
import { getWorkshopTodayKey, type WorkshopScheduleEvent, type WorkshopScheduleEventKind } from './workshopTypes';
import './workshop-schedule-calendar.css';

export interface WorkshopScheduleCalendarProps {
  events: readonly WorkshopScheduleEvent[];
  selectedDate?: string;
  selectedJobId?: string | null;
  onSelectDate?: (date: string) => void;
  onSelectEvent?: (event: WorkshopScheduleEvent) => void;
  onShowOnMap?: (jobId: string) => void;
  onRequestLocationEdit?: (jobId: string) => void;
  onViewDetail?: (jobId: string) => void;
  className?: string;
}

const eventKindLabels: Record<WorkshopScheduleEventKind | 'stage', string> = {
  production: 'Producción',
  stage: 'Etapa de producción',
  installation: 'Instalación',
  delivery: 'Entrega',
  deadline: 'Fecha de trabajo',
};

export function WorkshopScheduleCalendar({
  events,
  selectedDate,
  selectedJobId,
  onSelectDate,
  onSelectEvent,
  onShowOnMap,
  onRequestLocationEdit,
  onViewDetail,
  className = '',
}: WorkshopScheduleCalendarProps) {
  const [internalDate, setInternalDate] = useState(getWorkshopTodayKey);
  const activeDate = selectedDate !== undefined ? selectedDate : internalDate;

  const eventsByDate = useMemo(() => {
    const result = new Map<string, WorkshopScheduleEvent[]>();
    events.forEach((event) => {
      if (!event.date) return;
      result.set(event.date, [...(result.get(event.date) || []), event]);
    });
    return result;
  }, [events]);

  const activeEvents = useMemo(() => {
    if (activeDate) {
      return eventsByDate.get(activeDate) || [];
    }
    // Si no hay fecha activa seleccionada, muestra los eventos ordenados por fecha
    return [...events].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }, [activeDate, events, eventsByDate]);

  const metadata = useCallback((date: Date) => {
    const dateEvents = eventsByDate.get(dateToKey(date));
    if (!dateEvents?.length) return undefined;
    const count = dateEvents.length;
    const titles = dateEvents.map((event) => `${eventKindLabels[event.kind] || 'Evento'}: ${event.code}`).join(', ');
    return {
      badge: count > 99 ? '99+' : String(count),
      description: `${count} ${count === 1 ? 'evento' : 'eventos'}: ${titles}`,
    };
  }, [eventsByDate]);

  const chooseDate = (next: string) => {
    setInternalDate(next);
    onSelectDate?.(next);
  };

  const handleSelectToday = () => {
    const today = getWorkshopTodayKey();
    chooseDate(today);
  };

  const handleClearDate = () => {
    chooseDate('');
  };

  const formattedDate = useMemo(() => {
    if (!activeDate) return 'Todos los eventos programados';
    const date = dateFromKey(activeDate);
    return date
      ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'full' }).format(date)
      : 'Fecha seleccionada';
  }, [activeDate]);

  return (
    <section className={`vc-workshop-calendar ${className}`} aria-label="Calendario y agenda de trabajos">
      <div className="vc-workshop-calendar-grid">
        <div className="vc-workshop-calendar-panel">
          <Calendar
            value={activeDate}
            onChange={chooseDate}
            label="Fechas de producción, entrega e instalación"
            getDateMetadata={metadata}
            cellSize="comfortable"
          />
          <div className="vc-workshop-cal-quick-actions" role="group" aria-label="Acciones de fecha">
            <button
              type="button"
              className="vc-workshop-quick-btn"
              onClick={handleSelectToday}
              title="Ir a la fecha de hoy"
            >
              Hoy
            </button>
            {activeDate && (
              <button
                type="button"
                className="vc-workshop-quick-btn"
                onClick={handleClearDate}
                title="Ver todos los eventos sin filtro de día"
              >
                <RotateCcw size={12} aria-hidden="true" />
                Limpiar fecha
              </button>
            )}
          </div>
        </div>

        <section className="vc-workshop-agenda" aria-labelledby="vc-workshop-agenda-title">
          <header className="vc-workshop-agenda-head">
            <div>
              <span className="vc-workshop-agenda-kicker">
                <CalendarDays size={14} aria-hidden="true" />
                {activeDate ? 'Agenda del día' : 'Programación general'}
              </span>
              <h2 id="vc-workshop-agenda-title" aria-live="polite">{formattedDate}</h2>
            </div>
            <div className="vc-workshop-agenda-meta-group">
              <span className="vc-workshop-agenda-count" aria-label={`${activeEvents.length} eventos`}>
                {activeEvents.length}
              </span>
            </div>
          </header>

          {activeEvents.length === 0 ? (
            <p className="vc-workshop-agenda-empty">
              {activeDate
                ? 'No hay trabajos ni entregas programadas para esta fecha.'
                : 'No hay eventos registrados en el rango actual.'}
            </p>
          ) : (
            <ul className="vc-workshop-agenda-list">
              {activeEvents.map((event) => (
                <li key={event.id}>
                  <article
                    className={`vc-workshop-event ${selectedJobId === event.jobId ? 'is-selected' : ''}`}
                    data-kind={event.kind}
                  >
                    <div className="vc-workshop-event-time">
                      <span>{event.time || 'Hora pendiente'}</span>
                      {!activeDate && event.date && (
                        <span className="vc-workshop-event-date-pill">{event.date}</span>
                      )}
                    </div>
                    <div className="vc-workshop-event-main">
                      <span className="vc-workshop-event-kind">
                        {eventKindLabels[event.kind] || 'Producción'}
                      </span>
                      {onSelectEvent ? (
                        <button type="button" className="vc-workshop-event-title" onClick={() => onSelectEvent(event)}>
                          {event.code} · {event.title}
                        </button>
                      ) : (
                        <h3 className="vc-workshop-event-title">{event.code} · {event.title}</h3>
                      )}
                      <span className="vc-workshop-event-client">{event.clientName}</span>
                      <span className="vc-workshop-event-meta">{event.areaLabel} · {event.status.replaceAll('_', ' ')}</span>
                      {event.address && (
                        <span className="vc-workshop-event-address">
                          <MapPin size={13} aria-hidden="true" /> {event.address}
                        </span>
                      )}
                      {event.kind === 'installation' && !event.hasMapLocation && (
                        <span className="vc-workshop-event-location-pending">Pin de mapa pendiente</span>
                      )}
                    </div>
                    <div className="vc-workshop-event-actions">
                      {onViewDetail && (
                        <button
                          type="button"
                          className="vc-workshop-event-action-btn is-detail"
                          onClick={() => onViewDetail(event.jobId)}
                          title={`Ver ficha técnica de ${event.code}`}
                        >
                          <FileText size={13} aria-hidden="true" />
                          <span>Ver ficha</span>
                        </button>
                      )}
                      {event.hasMapLocation && onShowOnMap && (
                        <button
                          className="vc-workshop-event-map"
                          type="button"
                          aria-label={`Ver ubicación de ${event.code} en el mapa`}
                          onClick={() => onShowOnMap(event.jobId)}
                          title="Ver en el mapa"
                        >
                          <MapPin size={16} aria-hidden="true" />
                        </button>
                      )}
                      {event.kind === 'installation' && !event.hasMapLocation && onRequestLocationEdit && (
                        <button
                          className="vc-workshop-event-map is-add"
                          type="button"
                          aria-label={`Registrar ubicación para ${event.code}`}
                          onClick={() => onRequestLocationEdit(event.jobId)}
                          title="Registrar ubicación en mapa"
                        >
                          <MapPin size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
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
