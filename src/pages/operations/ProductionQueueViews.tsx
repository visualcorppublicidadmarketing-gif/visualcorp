import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { CalendarCheck2, CalendarClock, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, CircleAlert, CircleDashed, Columns3, LayoutGrid, List, X } from 'lucide-react';
import { ToggleGroup } from '../../components/ui/OperationalKit';
import './production-queue-views.css';

export type ProductionQueueViewItem<T> = {
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
};

type ViewMode = 'summary' | 'month' | 'week' | 'cards' | 'list' | 'kanban';
type Props<T> = {
  areaSlug: string;
  areaName: string;
  items: ProductionQueueViewItem<T>[];
  today: string;
  renderCard: (item: ProductionQueueViewItem<T>, compact?: boolean) => ReactNode;
  onOpen: (item: ProductionQueueViewItem<T>) => void;
};

const TIME_ZONE = 'America/Guayaquil';
const MODES: { id: ViewMode; label: string; icon: typeof CalendarDays }[] = [
  { id: 'summary', label: 'Resumen', icon: CalendarCheck2 },
  { id: 'month', label: 'Mes', icon: CalendarDays },
  { id: 'week', label: 'Semana', icon: CalendarRange },
  { id: 'cards', label: 'Tarjetas', icon: LayoutGrid },
  { id: 'list', label: 'Tabla', icon: List },
  { id: 'kanban', label: 'Kanban', icon: Columns3 },
];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS_COLUMNS: { status: string; title: string }[] = [
  { status: 'waiting', title: 'En espera' },
  { status: 'ready', title: 'Lista para iniciar' },
  { status: 'in_progress', title: 'En proceso' },
  { status: 'blocked', title: 'Bloqueados' },
  { status: 'completed', title: 'Terminados' },
  { status: 'cancelled', title: 'Cancelados' },
];

const keyForDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(value).reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result; }, {});
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
const formatMonth = (key: string) => new Intl.DateTimeFormat('es-EC', {
  timeZone: 'UTC', month: 'long', year: 'numeric',
}).format(dateFromKey(key));
const formatDay = (key: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('es-EC', { ...options, timeZone: 'UTC' }).format(dateFromKey(key));
const formatLongDay = (key: string) => new Intl.DateTimeFormat('es-EC', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(dateFromKey(key));
const formatTime = (value: string) => new Intl.DateTimeFormat('es-EC', {
  timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit',
}).format(new Date(value));
const validMode = (value: string | null): value is ViewMode => MODES.some((mode) => mode.id === value);
const moveSpotlight = (event: ReactPointerEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
};

export function ProductionQueueViews<T>({ areaSlug, areaName, items, today, renderCard, onOpen }: Props<T>) {
  const [mode, setMode] = useState<ViewMode>('cards');
  const [anchorDay, setAnchorDay] = useState(() => keyForDate(new Date()));
  const [selectedDay, setSelectedDay] = useState('');

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(`visualcorp:production-view:${areaSlug}`); } catch { /* Storage may be disabled. */ }
    setMode(validMode(saved) ? saved : 'cards');
    setAnchorDay(keyForDate(new Date()));
    setSelectedDay('');
  }, [areaSlug]);

  const setView = (next: ViewMode) => {
    setMode(next);
    try { window.localStorage.setItem(`visualcorp:production-view:${areaSlug}`, next); } catch { /* The view still works without persistence. */ }
  };
  const monthStart = `${anchorDay.slice(0, 7)}-01`;
  const monthGridStart = addDays(monthStart, -((dateFromKey(monthStart).getUTCDay() + 6) % 7));
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)), [monthGridStart]);
  const weekStart = mondayOf(anchorDay);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
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
  const selectedItems = selectedDay ? itemsByDate.get(selectedDay) || [] : [];
  const calendarDays = mode === 'month' ? monthDays.filter((key) => key.slice(0, 7) === anchorDay.slice(0, 7)) : weekDays;
  const periodItems = useMemo(() => calendarDays.flatMap((key) => itemsByDate.get(key) || []), [calendarDays, itemsByDate]);
  const scheduledCount = items.filter((item) => item.dueKey).length;
  const overdueCount = items.filter((item) => item.overdue).length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const dateRangeLabel = mode === 'month'
    ? formatMonth(anchorDay)
    : `${formatDay(weekStart)} – ${formatDay(weekDays[6], { day: 'numeric', month: 'short', year: weekDays[6].slice(0, 4) !== weekStart.slice(0, 4) ? 'numeric' : undefined })}`;

  const moveAnchor = (amount: number) => {
    setAnchorDay((current) => mode === 'month' ? addMonths(current, amount) : addDays(current, amount * 7));
    setSelectedDay('');
  };
  const showMoreDateItems = (key: string) => setSelectedDay(key);
  const dateEvents = (key: string, limit: number) => {
    const dayItems = itemsByDate.get(key) || [];
    return <>
      <div className="pj-calendar-events">
        {dayItems.slice(0, limit).map((item) => <button className="pj-calendar-event" data-state={item.status} key={item.id} title={`${item.code} · ${item.title} · ${item.customer}`} type="button" onClick={() => onOpen(item)}>
          <span className="pj-calendar-event-code">{item.code}</span><span className="pj-calendar-event-title">{item.title}</span>
        </button>)}
        {dayItems.length > limit && <button className="pj-calendar-more" type="button" onClick={() => showMoreDateItems(key)}>+{dayItems.length - limit} más</button>}
      </div>
    </>;
  };

  return <section className="pj-queue-views" aria-label={`Vistas de trabajo de ${areaName}`}>
    <section className="pj-view-overview" aria-label="Resumen de la cola filtrada">
      <div className="pj-view-overview-heading"><span>RESUMEN DE ESTA VISTA</span><b>{items.length} {items.length === 1 ? 'trabajo' : 'trabajos'}</b><small>Los indicadores responden al filtro actual.</small></div>
      <div className="pj-view-stats">
        <article className="pj-view-stat" onPointerMove={moveSpotlight}><span><CalendarCheck2 size={15}/>Programados</span><b>{scheduledCount}</b></article>
        <article className="pj-view-stat" onPointerMove={moveSpotlight}><span><CircleDashed size={15}/>Sin fecha</span><b>{undatedItems.length}</b></article>
        <article className="pj-view-stat is-overdue" onPointerMove={moveSpotlight}><span><CalendarClock size={15}/>Vencidos</span><b>{overdueCount}</b></article>
        <article className="pj-view-stat is-blocked" onPointerMove={moveSpotlight}><span><CircleAlert size={15}/>Bloqueados</span><b>{blockedCount}</b></article>
      </div>
    </section>
    <div className="pj-view-toolbar">
      <div className="pj-view-switcher">
        <ToggleGroup label="Cambiar vista de trabajos" value={mode} onValueChange={(value) => { if (validMode(value)) setView(value); }} options={MODES.map(({ id, label, icon: ModeIcon }) => ({ value: id, label: <><ModeIcon size={14}/><span>{label}</span></> }))}/>
      </div>
      {(mode === 'month' || mode === 'week') && <div className="pj-view-navigation" aria-label={`Navegación del calendario por ${mode === 'month' ? 'mes' : 'semana'}`}>
        <button type="button" className="pj-view-nav-button" aria-label={mode === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => moveAnchor(-1)}><ChevronLeft size={16}/></button>
        <b aria-live="polite">{dateRangeLabel}</b>
        <button type="button" className="pj-view-nav-button" aria-label={mode === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => moveAnchor(1)}><ChevronRight size={16}/></button>
        <button type="button" className="pj-view-today" onClick={() => { setAnchorDay(today); setSelectedDay(''); }}>Hoy</button>
      </div>}
    </div>

    {(mode === 'month' || mode === 'week') && <>
      <div className="pj-calendar-legend" aria-live="polite"><span>{periodItems.length} en este periodo</span><span>{undatedItems.length} sin fecha</span><span>{overdueCount} vencidos</span></div>
      {periodItems.length === 0 && <p className="pj-period-empty">No hay trabajos programados para este {mode === 'month' ? 'mes' : 'semana'}. Los trabajos sin fecha siguen disponibles abajo.</p>}
      <div className="pj-calendar-scroll" tabIndex={0} aria-label={`Calendario de ${areaName}`}>
        <div className={`pj-calendar-grid pj-calendar-grid--${mode}`}>
          <div className="pj-calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="pj-calendar-days">
            {(mode === 'month' ? monthDays : weekDays).map((key) => {
              const count = itemsByDate.get(key)?.length || 0;
              const isOutside = mode === 'month' && key.slice(0, 7) !== anchorDay.slice(0, 7);
              return <article className={`pj-calendar-day${isOutside ? ' is-outside' : ''}${key === today ? ' is-today' : ''}${key === selectedDay ? ' is-selected' : ''}`} key={key} onPointerMove={moveSpotlight}>
                <div className="pj-calendar-day-head">
                  {mode === 'week' && <span className="pj-calendar-weekday">{WEEKDAYS[(dateFromKey(key).getUTCDay() + 6) % 7]}</span>}
                  <button type="button" className="pj-calendar-date" aria-pressed={selectedDay === key} aria-label={`Ver trabajos del ${formatLongDay(key)}`} onClick={() => setSelectedDay((current) => current === key ? '' : key)}>{Number(key.slice(-2))}</button>
                  {count > 0 && <span className="pj-calendar-count" aria-label={`${count} trabajos`}>{count}</span>}
                </div>
                {dateEvents(key, mode === 'month' ? 2 : 4)}
              </article>;
            })}
          </div>
        </div>
      </div>
      <div className="pj-calendar-agenda" aria-label={`Agenda móvil de ${areaName}`}>
        {calendarDays.filter((key) => (itemsByDate.get(key)?.length || 0) > 0 || key === today).map((key) => {
          const dayItems = itemsByDate.get(key) || [];
          return <article className={`pj-agenda-day${key === today ? ' is-today' : ''}`} key={key}>
            <button type="button" className="pj-agenda-day-heading" aria-pressed={selectedDay === key} onClick={() => setSelectedDay((current) => current === key ? '' : key)}>
              <span><b>{formatDay(key, { weekday: 'long', day: 'numeric', month: 'long' })}</b>{key === today && <small>Hoy</small>}</span><span className="pj-agenda-day-count">{dayItems.length}</span>
            </button>
            {dayItems.length ? <div className="pj-agenda-items">{dayItems.map((item) => <button className="pj-agenda-item" data-state={item.status} data-overdue={item.overdue || undefined} key={item.id} type="button" onClick={() => onOpen(item)}>
              <span className="pj-agenda-item-copy"><b>{item.title}</b><small>{item.code} · {item.customer}</small></span><span className="pj-agenda-item-meta">{item.dueAt ? formatTime(item.dueAt) : item.statusLabel}<ChevronRight size={14}/></span>
            </button>)}</div> : <p className="pj-agenda-day-empty">No hay trabajos programados para este día.</p>}
          </article>;
        })}
        {calendarDays.every((key) => (itemsByDate.get(key)?.length || 0) === 0) && <p className="pj-period-empty">No hay trabajos programados en este periodo.</p>}
      </div>
      {selectedDay && <section className="pj-calendar-selection" aria-live="polite">
        <div className="pj-calendar-selection-head"><div><span className="pj-calendar-eyebrow">DÍA SELECCIONADO</span><h3>{formatLongDay(selectedDay)}</h3></div><button type="button" aria-label="Cerrar trabajos del día" onClick={() => setSelectedDay('')}><X size={15}/></button></div>
        {selectedItems.length ? <div className="pj-calendar-selection-items">{selectedItems.map((item) => <div key={item.id}>{renderCard(item, true)}</div>)}</div> : <p>No hay trabajos con fecha para este día.</p>}
      </section>}
    </>}

    {mode === 'summary' && <section className="pj-list" aria-label={`Resumen de trabajos de ${areaName}`}>
      {items.slice(0, 12).map((item) => <div key={item.id}>{renderCard(item, true)}</div>)}
      {items.length > 12 && <p className="pj-period-empty">Mostrando los primeros 12 trabajos del filtro. Cambia a Tabla para recorrer el resto.</p>}
      {!items.length && <p className="pj-period-empty">No hay trabajos que requieran seguimiento en esta selección.</p>}
    </section>}

    {mode === 'cards' && <section className="pj-list" aria-label={`Trabajos de ${areaName} en tarjetas`}>{items.map((item) => <div key={item.id}>{renderCard(item)}</div>)}</section>}

    {mode === 'list' && <section className="pj-list-view" aria-label={`Trabajos de ${areaName} en lista`}>
      <div className="pj-table-scroll"><table className="pj-jobs-table"><thead><tr><th>Trabajo</th><th>Estado</th><th>Responsable</th><th>Fecha límite</th><th><span className="sr-only">Abrir</span></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}>
        <td><span className="pj-list-view-work"><b>{item.code}</b><strong>{item.title}</strong><small>{item.customer}</small></span></td>
        <td><span className="pj-status" data-state={item.status}>{item.statusLabel}</span></td>
        <td className="pj-list-view-owner">{item.ownerLabel}</td>
        <td className={item.overdue ? 'is-late' : ''}>{item.dueKey ? <>{formatDay(item.dueKey, { weekday: 'short', day: 'numeric', month: 'short' })}{item.dueAt && <> · {formatTime(item.dueAt)}</>}</> : 'Sin fecha'}</td>
        <td className="pj-list-view-arrow"><button type="button" className="pj-table-open" aria-label={`Abrir ${item.code}: ${item.title}`} onClick={() => onOpen(item)}><ChevronRight size={15}/></button></td>
      </tr>)}
      </tbody></table></div>
    </section>}

    {mode === 'kanban' && <div className="pj-kanban-scroll" tabIndex={0} aria-label={`Tablero kanban de ${areaName}`}>
      <section className="pj-kanban" aria-label={`Trabajos de ${areaName} agrupados por etapa`}>
        {STATUS_COLUMNS.map((column) => {
          const columnItems = items.filter((item) => item.status === column.status);
          return <section className="pj-kanban-column" data-state={column.status} key={column.status} aria-label={`${column.title}: ${columnItems.length}`}>
            <header><h3>{column.title}</h3><span>{columnItems.length}</span></header>
            <div className="pj-kanban-column-items">{columnItems.map((item) => <div key={item.id}>{renderCard(item, true)}</div>)}{columnItems.length === 0 && <p className="pj-kanban-empty">Sin trabajos en esta etapa.</p>}</div>
          </section>;
        })}
      </section>
    </div>}

    {(mode === 'month' || mode === 'week') && undatedItems.length > 0 && <details className="pj-undated" open>
      <summary><span>Sin fecha programada</span><b>{undatedItems.length}</b></summary>
      <p>Estos trabajos siguen visibles aquí hasta que se defina una fecha para su etapa o entrega.</p>
      <div className="pj-calendar-selection-items">{undatedItems.map((item) => <div key={item.id}>{renderCard(item, true)}</div>)}</div>
    </details>}
  </section>;
}
