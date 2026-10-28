import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, createContext } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker, DayButton as DefaultDayButton, WeekNumber as DefaultWeekNumber, type DayButtonProps, type DateRange, type WeekNumberProps } from '@daypicker/react';
import { es } from '@daypicker/react/locale';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import '@daypicker/react/style.css';
import './calendar.css';

export type CalendarMode = 'single' | 'range';
export type CalendarDayMetadata = { badge?: string; price?: string | number; description?: string; unavailable?: boolean; className?: string };
export type CalendarPreset = { label: string; getValue: () => string | { from: string; to: string } };
type SharedProps = {
  label?: string;
  presets?: CalendarPreset[];
  minDate?: string;
  maxDate?: string;
  unavailableDates?: string[];
  isDateUnavailable?: (date: Date) => boolean;
  getDateMetadata?: (date: Date) => CalendarDayMetadata | undefined;
  cellSize?: 'compact' | 'comfortable' | 'large';
  className?: string;
};
type SingleProps = SharedProps & { mode?: 'single'; value?: string; onChange?: (value: string) => void };
type RangeProps = SharedProps & { mode: 'range'; value?: { from?: string; to?: string }; onChange?: (value: { from?: string; to?: string }) => void };
export type CalendarProps = SingleProps | RangeProps;

const pad = (value: number) => String(value).padStart(2, '0');
export function dateToKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
export function dateFromKey(key?: string) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return undefined;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}
const addDays = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12);
const startOfWeek = (date: Date) => addDays(date, -((date.getDay() + 6) % 7));
const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6);
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1, 12);
const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
const defaultDatePresets: CalendarPreset[] = [
  { label: 'Hoy', getValue: () => dateToKey(new Date()) },
  { label: 'Mañana', getValue: () => dateToKey(addDays(new Date(), 1)) },
  { label: 'En 7 días', getValue: () => dateToKey(addDays(new Date(), 7)) },
];
const defaultRangePresets: CalendarPreset[] = [
  { label: 'Esta semana', getValue: () => ({ from: dateToKey(startOfWeek(new Date())), to: dateToKey(endOfWeek(new Date())) }) },
  { label: 'Próximos 7 días', getValue: () => ({ from: dateToKey(new Date()), to: dateToKey(addDays(new Date(), 6)) }) },
  { label: 'Este mes', getValue: () => ({ from: dateToKey(startOfMonth(new Date())), to: dateToKey(endOfMonth(new Date())) }) },
];
const months = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat('es-EC', { month: 'long' }).format(new Date(2026, index, 1, 12)));
const MetadataContext = createContext<CalendarProps['getDateMetadata']>(undefined);
const MonthContext = createContext<Date>(new Date());

function CalendarDayButton(props: DayButtonProps) {
  const getMetadata = useContext(MetadataContext);
  const metadata = getMetadata?.(props.day.date);
  const label = [props['aria-label'], metadata?.description].filter(Boolean).join('. ');
  return <DefaultDayButton {...props} aria-label={label || undefined} data-date-metadata={metadata ? 'true' : undefined} className={`${props.className || ''} ${metadata?.className || ''}`.trim()}>
      {props.children}{metadata?.badge && <small className="ok-calendar-day-badge">{metadata.badge}</small>}{metadata?.price !== undefined && <small className="ok-calendar-day-price">{metadata.price}</small>}
  </DefaultDayButton>;
}
function MonthWeekNumber(props: WeekNumberProps) {
  const displayMonth = useContext(MonthContext);
  const firstInMonth = props.week.days.map(day => day.date).find(date => date.getFullYear() === displayMonth.getFullYear() && date.getMonth() === displayMonth.getMonth());
  const representative = firstInMonth || props.week.days[Math.floor(props.week.days.length / 2)]?.date || displayMonth;
  const first = new Date(representative.getFullYear(), representative.getMonth(), 1, 12);
  const firstRow = addDays(first, -((first.getDay() + 6) % 7));
  const weekStart = props.week.days[0]?.date || representative;
  const distance = Math.round((Date.UTC(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()) - Date.UTC(firstRow.getFullYear(), firstRow.getMonth(), firstRow.getDate())) / 86400000);
  const weekOfMonth = Math.max(1, Math.floor(distance / 7) + 1);
  return <DefaultWeekNumber {...props} aria-label={`Semana ${weekOfMonth} del mes`}>{weekOfMonth}</DefaultWeekNumber>;
}

export function Calendar(props: CalendarProps) {
  const { label = 'Calendario', presets, minDate, maxDate, unavailableDates = [], isDateUnavailable, getDateMetadata, cellSize = 'comfortable', className = '' } = props;
  const isRange = props.mode === 'range';
  const initialDate = isRange ? dateFromKey(props.value?.from) : dateFromKey(props.value);
  const [month, setMonth] = useState(() => startOfMonth(initialDate || new Date()));
  useEffect(() => { if (initialDate) setMonth(startOfMonth(initialDate)); }, [initialDate?.getFullYear(), initialDate?.getMonth()]);
  const selectedSingle = !isRange ? dateFromKey(props.value) : undefined;
  const selectedRange = isRange ? { from: dateFromKey(props.value?.from), to: dateFromKey(props.value?.to) } : undefined;
  const disabled = useMemo(() => {
    const matchers: ((date: Date) => boolean)[] = [];
    if (minDate) { const min = dateFromKey(minDate); if (min) matchers.push(date => date < min); }
    if (maxDate) { const max = dateFromKey(maxDate); if (max) matchers.push(date => date > max); }
    if (unavailableDates.length) { const unavailable = new Set(unavailableDates); matchers.push(date => unavailable.has(dateToKey(date))); }
    if (isDateUnavailable) matchers.push(isDateUnavailable);
    if (getDateMetadata) matchers.push(date => Boolean(getDateMetadata(date)?.unavailable));
    return matchers;
  }, [minDate, maxDate, unavailableDates, isDateUnavailable, getDateMetadata]);
  const activePresets = presets || (isRange ? defaultRangePresets : defaultDatePresets);
  const yearOptions = Array.from({ length: 31 }, (_, index) => month.getFullYear() - 15 + index);
  const choosePreset = (preset: CalendarPreset) => {
    const value = preset.getValue();
    if (typeof value === 'string' && props.mode !== 'range') {
      props.onChange?.(value);
      const date = dateFromKey(value);
      if (date) setMonth(startOfMonth(date));
    } else if (typeof value !== 'string' && props.mode === 'range') {
      props.onChange?.(value);
      const date = dateFromKey(value.from);
      if (date) setMonth(startOfMonth(date));
    }
  };
  const chooseDay = (date: Date | undefined) => {
    if (props.mode === 'range') return;
    if (date) props.onChange?.(dateToKey(date));
  };
  const dayPickerProps = {
    month,
    onMonthChange: setMonth,
    locale: es,
    timeZone: 'America/Guayaquil',
    noonSafe: true,
    weekStartsOn: 1 as const,
    showWeekNumber: true,
    disabled,
    hideNavigation: true,
    components: { DayButton: CalendarDayButton, WeekNumber: MonthWeekNumber },
    'aria-label': label,
    lang: 'es-EC',
  };
  return <MetadataContext.Provider value={getDateMetadata}><MonthContext.Provider value={month}>
    <section className={`ok-calendar ${className}`} aria-label={label} data-cell-size={cellSize}>
      <header className="ok-calendar-header">
        <button className="ok-calendar-nav" type="button" aria-label="Mes anterior" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}><ChevronLeft size={16}/></button>
        <div className="ok-calendar-selectors">
          <label><span className="sr-only">Mes</span><select aria-label="Mes" value={month.getMonth()} onChange={event => setMonth(current => new Date(current.getFullYear(), Number(event.target.value), 1, 12))}>{months.map((name, index) => <option value={index} key={name}>{name}</option>)}</select><ChevronDown size={13}/></label>
          <label><span className="sr-only">Año</span><select aria-label="Año" value={month.getFullYear()} onChange={event => setMonth(current => new Date(Number(event.target.value), current.getMonth(), 1, 12))}>{yearOptions.map(year => <option key={year} value={year}>{year}</option>)}</select><ChevronDown size={13}/></label>
        </div>
        <button className="ok-calendar-nav" type="button" aria-label="Mes siguiente" onClick={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}><ChevronRight size={16}/></button>
      </header>
      {activePresets.length > 0 && <nav className="ok-calendar-presets" aria-label="Fechas rápidas">{activePresets.map(preset => <button key={preset.label} type="button" onClick={() => choosePreset(preset)}>{preset.label}</button>)}</nav>}
      {isRange
        ? <DayPicker {...dayPickerProps} mode="range" selected={selectedRange} onSelect={range => props.onChange?.({ from: range?.from ? dateToKey(range.from) : undefined, to: range?.to ? dateToKey(range.to) : undefined })}/>
        : <DayPicker {...dayPickerProps} mode="single" selected={selectedSingle} onSelect={chooseDay}/>}
    </section>
  </MonthContext.Provider></MetadataContext.Provider>;
}

type PickerProps = Omit<SharedProps, 'label'> & { value: string; onChange: (value: string) => void; label?: string };
function usePicker(open: boolean, setOpen: (open: boolean) => void, root: { current: HTMLDivElement | null }, popover: { current: HTMLDivElement | null }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const handlePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('pointerdown', handlePointer);
    return () => { window.removeEventListener('keydown', handleKey); window.removeEventListener('pointerdown', handlePointer); };
  }, [open, setOpen, root, popover]);
}

type CalendarPopoverPosition = { top: number; left: number; width: number; maxHeight: number; layout: 'anchored' | 'sheet' };
function useCalendarPopoverPosition(open: boolean, trigger: { current: HTMLButtonElement | null }, popover: { current: HTMLDivElement | null }) {
  const [position, setPosition] = useState<CalendarPopoverPosition | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return undefined; }
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = popover.current;
      if (!anchor || !panel) return;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const margin = 12;
      const gap = 8;
      const layout: CalendarPopoverPosition['layout'] = viewportWidth <= 560 ? 'sheet' : 'anchored';
      const width = Math.max(0, Math.min(layout === 'sheet' ? 430 : 390, viewportWidth - margin * 2));
      const maxHeight = Math.max(180, viewportHeight - margin * 2);
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${maxHeight}px`;
      const panelHeight = Math.min(panel.scrollHeight, maxHeight);
      const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
      const belowSpace = viewportHeight - anchor.bottom - gap - margin;
      const aboveSpace = anchor.top - gap - margin;
      const preferredTop = belowSpace >= panelHeight || belowSpace >= aboveSpace
        ? anchor.bottom + gap
        : anchor.top - panelHeight - gap;
      const top = Math.min(Math.max(preferredTop, margin), maxTop);
      const left = layout === 'sheet'
        ? (viewportWidth - width) / 2
        : Math.min(Math.max(anchor.left, margin), Math.max(margin, viewportWidth - width - margin));
      const next = { top, left, width, maxHeight, layout };
      setPosition(previous => previous && previous.top === next.top && previous.left === next.left && previous.width === next.width && previous.maxHeight === next.maxHeight && previous.layout === next.layout ? previous : next);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (trigger.current) observer?.observe(trigger.current);
    if (popover.current) observer?.observe(popover.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [open, trigger, popover]);
  return position;
}

function CalendarPopover({ open, id, label, trigger, popover, children }: {
  open: boolean;
  id: string;
  label: string;
  trigger: { current: HTMLButtonElement | null };
  popover: { current: HTMLDivElement | null };
  children: React.ReactNode;
}) {
  const position = useCalendarPopoverPosition(open, trigger, popover);
  if (!open) return null;
  return createPortal(<>
    <div
      ref={popover}
      id={id}
      className="ok-date-popover"
      data-layout={position?.layout || 'anchored'}
      role="dialog"
      aria-label={label}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        width: position?.width,
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
    >{children}</div>
  </>, document.body);
}
const dateDisplay = (value: string) => {
  const date = dateFromKey(value);
  return date ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeZone: 'America/Guayaquil' }).format(date) : 'Elegir fecha';
};
export function DatePicker({ value, onChange, label = 'Fecha', minDate, maxDate, className = '', presets, unavailableDates, isDateUnavailable, getDateMetadata, cellSize }: PickerProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  usePicker(open, setOpen, root, popover);
  return <div className={`ok-date-picker ${className}`} ref={root}>
    <button ref={trigger} type="button" className="ok-date-trigger" aria-label={`${label}: ${dateDisplay(value)}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} onClick={() => setOpen(current => !current)}><CalendarDays size={15}/><span>{dateDisplay(value)}</span></button>
    <CalendarPopover open={open} id={id} label={label} trigger={trigger} popover={popover}><Calendar value={value} onChange={next => { onChange(next); setOpen(false); }} label={label} minDate={minDate} maxDate={maxDate} presets={presets} unavailableDates={unavailableDates} isDateUnavailable={isDateUnavailable} getDateMetadata={getDateMetadata} cellSize={cellSize}/></CalendarPopover>
  </div>;
}

export function DateTimePicker({ value, onChange, label = 'Fecha y hora', minDate, maxDate, className = '', unavailableDates, isDateUnavailable, getDateMetadata, cellSize }: PickerProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  usePicker(open, setOpen, root, popover);
  const dateValue = value?.slice(0, 10) || '';
  const timeValue = value?.slice(11, 16) || '09:00';
  const display = dateValue ? `${dateDisplay(dateValue)} · ${timeValue}` : 'Elegir fecha y hora';
  const update = (date: string, time: string) => onChange(date ? `${date}T${time || '09:00'}` : '');
  return <div className={`ok-date-picker ${className}`} ref={root}>
    <button ref={trigger} type="button" className="ok-date-trigger" aria-label={`${label}: ${display}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} onClick={() => setOpen(current => !current)}><CalendarDays size={15}/><span>{display}</span></button>
    <CalendarPopover open={open} id={id} label={label} trigger={trigger} popover={popover}><Calendar value={dateValue} onChange={date => update(date, timeValue)} label={label} minDate={minDate} maxDate={maxDate} unavailableDates={unavailableDates} isDateUnavailable={isDateUnavailable} getDateMetadata={getDateMetadata} cellSize={cellSize}/><label className="ok-time-field"><span><Clock3 size={14}/> Hora local</span><input type="time" value={timeValue} onChange={event => update(dateValue, event.target.value)} disabled={!dateValue} aria-label="Hora local"/></label></CalendarPopover>
  </div>;
}
