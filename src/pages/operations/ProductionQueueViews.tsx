import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Columns3, LayoutGrid, List, X } from 'lucide-react';
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

type ViewMode = 'month' | 'week' | 'cards' | 'list' | 'kanban';
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
  { id: 'month', label: 'Mes', icon: CalendarDays },
  { id: 'week', label: 'Semana', icon: CalendarRange },
  { id: 'cards', label: 'Tarjetas', icon: LayoutGrid },
  { id: 'list', label: 'Lista', icon: List },
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
    <div className="pj-view-toolbar">
      <div className="pj-view-switcher" role="group" aria-label="Cambiar vista de trabajos">
        {MODES.map(({ id, label, icon: ModeIcon }) => <button type="button" key={id} aria-pressed={mode === id} onClick={() => setView(id)}><ModeIcon size={14}/><span>{label}</span></button>)}
      </div>
      {(mode === 'month' || mode === 'week') && <div className="pj-view-navigation" aria-label={`Navegación del calendario por ${mode === 'month' ? 'mes' : 'semana'}`}>
        <button type="button" className="pj-view-nav-button" aria-label={mode === 'month' ? 'Mes anterior' : 'Semana anterior'} onClick={() => moveAnchor(-1)}><ChevronLeft size={16}/></button>
        <b aria-live="polite">{dateRangeLabel}</b>
        <button type="button" className="pj-view-nav-button" aria-label={mode === 'month' ? 'Mes siguiente' : 'Semana siguiente'} onClick={() => moveAnchor(1)}><ChevronRight size={16}/></button>
        <button type="button" className="pj-view-today" onClick={() => { setAnchorDay(today); setSelectedDay(''); }}>Hoy</button>
      </div>}
    </div>

    {(mode === 'month' || mode === 'week') && <>
      <div className="pj-calendar-legend" aria-live="polite"><span>{items.filter((item) => item.dueKey).length} con fecha</span><span>{undatedItems.length} sin fecha</span><span>{items.filter((item) => item.overdue).length} vencidos</span></div>
      <div className="pj-calendar-scroll" tabIndex={0} aria-label={`Calendario de ${areaName}`}>
        <div className={`pj-calendar-grid pj-calendar-grid--${mode}`}>
          <div className="pj-calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="pj-calendar-days">
            {(mode === 'month' ? monthDays : weekDays).map((key) => {
              const count = itemsByDate.get(key)?.length || 0;
              const isOutside = mode === 'month' && key.slice(0, 7) !== anchorDay.slice(0, 7);
              return <article className={`pj-calendar-day${isOutside ? ' is-outside' : ''}${key === today ? ' is-today' : ''}${key === selectedDay ? ' is-selected' : ''}`} key={key}>
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
      {selectedDay && <section className="pj-calendar-selection" aria-live="polite">
        <div className="pj-calendar-selection-head"><div><span className="pj-calendar-eyebrow">DÍA SELECCIONADO</span><h3>{formatLongDay(selectedDay)}</h3></div><button type="button" aria-label="Cerrar trabajos del día" onClick={() => setSelectedDay('')}><X size={15}/></button></div>
        {selectedItems.length ? <div className="pj-calendar-selection-items">{selectedItems.map((item) => <div key={item.id}>{renderCard(item, true)}</div>)}</div> : <p>No hay trabajos con fecha para este día.</p>}
      </section>}
    </>}

    {mode === 'cards' && <section className="pj-list" aria-label={`Trabajos de ${areaName} en tarjetas`}>{items.map((item) => <div key={item.id}>{renderCard(item)}</div>)}</section>}

    {mode === 'list' && <section className="pj-list-view" aria-label={`Trabajos de ${areaName} en lista`}>
      <div className="pj-list-view-head" aria-hidden="true"><span>Trabajo</span><span>Estado</span><span>Responsable</span><span>Fecha límite</span><span/></div>
      {items.map((item) => <button type="button" className="pj-list-view-row" key={item.id} onClick={() => onOpen(item)}>
        <span className="pj-list-view-work"><b>{item.code}</b><strong>{item.title}</strong><small>{item.customer}</small></span>
        <span><span className="pj-status" data-state={item.status}>{item.statusLabel}</span></span>
        <span className="pj-list-view-owner">{item.ownerLabel}</span>
        <span className={item.overdue ? 'is-late' : ''}>{item.dueKey ? <>{formatDay(item.dueKey, { weekday: 'short', day: 'numeric', month: 'short' })}{item.dueAt && <> · {formatTime(item.dueAt)}</>}</> : 'Sin fecha'}</span>
        <span className="pj-list-view-arrow"><ChevronRight size={15}/></span>
      </button>)}
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
