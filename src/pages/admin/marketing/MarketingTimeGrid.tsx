import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuAction } from '../../../components/ui/ContextMenu';
import type { MarketingCalendarPost, MarketingCalendarTask } from './MarketingCalendar';
import type { MarketingTaskRange } from './MarketingPlanning';

type Props = {
  view: 'week' | 'day';
  dates: Date[];
  today: string;
  posts: MarketingCalendarPost[];
  tasks: MarketingCalendarTask[];
  campaignNames: ReadonlyMap<string, string>;
  canEdit: boolean;
  onPostSelect: (post: MarketingCalendarPost) => void;
  onTaskSelect: (task: MarketingCalendarTask) => void;
  postActions: (post: MarketingCalendarPost) => ContextMenuAction[];
  taskActions: (task: MarketingCalendarTask) => ContextMenuAction[];
  onCreateRange: (range: MarketingTaskRange) => void;
};

type Selection = { anchor: number; focus: number };
type TimedEntry = {
  key: string;
  kind: 'post' | 'task';
  startMinute: number;
  endMinute: number;
  title: string;
  subline: string;
  timeLabel: string;
  tone: string;
  overdue: boolean;
  lane: number;
  laneCount: number;
  post?: MarketingCalendarPost;
  task?: MarketingCalendarTask;
};
type AllDayEntry = {
  key: string;
  kind: 'post' | 'task';
  title: string;
  subline: string;
  tone: string;
  overdue: boolean;
  post?: MarketingCalendarPost;
  task?: MarketingCalendarTask;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatTime = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const parseTime = (value?: string | null) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};
const addDays = (value: string, days: number) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return dateKey(date);
};
const createRange = (firstMinute: number, lastMinuteExclusive: number, firstDate: string) => {
  // Due dates are inclusive, so store a midnight boundary as 23:59 on the previous date.
  const finalMinute = lastMinuteExclusive > firstMinute && lastMinuteExclusive % 1440 === 0
    ? lastMinuteExclusive - 1
    : lastMinuteExclusive;
  return {
    startDate: addDays(firstDate, Math.floor(firstMinute / 1440)),
    endDate: addDays(firstDate, Math.floor(finalMinute / 1440)),
    startTime: formatTime(firstMinute % 1440),
    endTime: formatTime(finalMinute % 1440),
  };
};
const minutesForDate = (value: string, firstDate: string) => {
  const date = new Date(`${value}T12:00:00`);
  const first = new Date(`${firstDate}T12:00:00`);
  return Math.round((date.getTime() - first.getTime()) / 86_400_000) * 1440;
};
const statusTone = (status = '') => /listo|publicad|complet|terminad/i.test(status) ? 'completed' : /bloque|cancelad/i.test(status) ? 'blocked' : /revisi/i.test(status) ? 'review' : /proceso|diseñ|producc/i.test(status) ? 'working' : 'active';
const overdue = (task: MarketingCalendarTask, today: string) => Boolean(task.due_date && task.due_date.slice(0, 10) < today && !/listo|cancelad/i.test(task.status || ''));

export function MarketingTimeGrid({ view, dates, today, posts, tasks, campaignNames, canEdit, onPostSelect, onTaskSelect, postActions, taskActions, onCreateRange }: Props) {
  const unitMinutes = view === 'day' ? 30 : 60;
  const slotsPerDay = 1440 / unitMinutes;
  const firstDate = dateKey(dates[0]);
  const lastDate = dateKey(dates[dates.length - 1]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [keyboardFocus, setKeyboardFocus] = useState(() => ({ date: firstDate, slot: view === 'day' && firstDate === today ? Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / unitMinutes) : 0 }));
  const selectionRef = useRef<Selection | null>(null);
  const onCreateRangeRef = useRef(onCreateRange);
  onCreateRangeRef.current = onCreateRange;
  const timelineRef = useRef<HTMLDivElement>(null);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }), []);

  const setActiveSelection = (next: Selection | null) => {
    selectionRef.current = next;
    setSelection(next);
  };

  useEffect(() => {
    setKeyboardFocus({ date: firstDate, slot: view === 'day' && firstDate === today ? Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / unitMinutes) : 0 });
  }, [firstDate, today, unitMinutes, view]);

  useEffect(() => {
    if (view !== 'day' || dateKey(dates[0]) !== today || !timelineRef.current) return;
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const slot = timelineRef.current.querySelector<HTMLElement>(`[data-calendar-slot="${Math.floor(currentMinutes / unitMinutes)}"]`);
    if (slot) timelineRef.current.scrollTop = Math.max(0, timelineRef.current.scrollTop + slot.getBoundingClientRect().top - timelineRef.current.getBoundingClientRect().top - 130);
  }, [dates, today, unitMinutes, view]);

  useEffect(() => {
    const updateFromPointer = (event: PointerEvent) => {
      if (!selectionRef.current) return;
      const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.vc-marketing-time-day-column[data-calendar-date]');
      const firstSlot = column?.querySelector<HTMLElement>('[data-calendar-slot]');
      if (!column || !firstSlot) return;
      const slotHeight = firstSlot.getBoundingClientRect().height;
      if (!slotHeight) return;
      const dayOffset = minutesForDate(column.dataset.calendarDate || firstDate, firstDate);
      const slotOffset = Math.min(slotsPerDay - 1, Math.max(0, Math.floor((event.clientY - column.getBoundingClientRect().top) / slotHeight)));
      if (!Number.isFinite(slotOffset)) return;
      const active = selectionRef.current;
      if (active) setActiveSelection({ ...active, focus: dayOffset + slotOffset * unitMinutes });
    };
    const finish = (event: PointerEvent) => {
      updateFromPointer(event);
      const active = selectionRef.current;
      if (active) {
        const first = Math.min(active.anchor, active.focus);
        const last = Math.max(active.anchor, active.focus) + unitMinutes;
        onCreateRangeRef.current(createRange(first, last, firstDate));
      }
      setActiveSelection(null);
    };
    const cancel = () => setActiveSelection(null);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('pointermove', updateFromPointer);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('pointermove', updateFromPointer);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keydown);
    };
  }, [firstDate, slotsPerDay, unitMinutes]);

  const createRangeForSlot = (date: string, slot: number) => {
    const start = minutesForDate(date, firstDate) + slot * unitMinutes;
    onCreateRange(createRange(start, start + unitMinutes, firstDate));
  };

  const getEntries = (date: string) => {
    const allDay: AllDayEntry[] = [];
    const timed: TimedEntry[] = [];
    posts.filter((post) => post.scheduled_date.slice(0, 10) === date).forEach((post) => {
      const minute = parseTime(post.scheduled_time);
      const entry: TimedEntry = { key: `post:${post.id}`, kind: 'post', startMinute: minute ?? 0, endMinute: Math.min(1440, (minute ?? 0) + unitMinutes), title: post.title || 'Publicación sin título', subline: `${post.platform || 'Canal pendiente'} · ${post.status || 'Por iniciar'}`, timeLabel: minute === null ? '' : formatTime(minute), tone: statusTone(post.status), overdue: false, lane: 0, laneCount: 1, post };
      if (minute === null) allDay.push({ key: entry.key, kind: 'post', title: entry.title, subline: entry.subline, tone: entry.tone, overdue: false, post });
      else timed.push(entry);
    });
    tasks.forEach((task) => {
      const startDate = String(task.start_date || task.due_date || '').slice(0, 10);
      const dueDate = String(task.due_date || task.start_date || '').slice(0, 10);
      if (!startDate || !dueDate || date < startDate || date > dueDate) return;
      const startTime = parseTime(task.start_time);
      const endTime = parseTime(task.end_time);
      const campaign = task.campaign_id ? campaignNames.get(task.campaign_id) : '';
      const activityType = task.activity_type === 'Otro' ? task.custom_activity_type || 'Otro' : task.activity_type;
      const state = overdue(task, today);
      const subline = `${activityType}${campaign ? ` · ${campaign}` : ''} · ${task.status || 'Pendiente'}${state ? ' · Atrasada' : ''}`;
      if (startTime === null || endTime === null) {
        allDay.push({ key: `task:${task.id}`, kind: 'task', title: task.title || 'Actividad sin título', subline, tone: statusTone(task.status), overdue: state, task });
        return;
      }
      const firstDay = date === startDate;
      const lastDay = date === dueDate;
      const startMinute = firstDay ? startTime : 0;
      const endMinute = lastDay ? endTime : 1440;
      if (endMinute <= startMinute) return;
      timed.push({
        key: `task:${task.id}:${date}`, kind: 'task', startMinute, endMinute,
        title: task.title || 'Actividad sin título',
        subline,
        timeLabel: `${firstDay ? formatTime(startTime) : '00:00'}–${lastDay ? formatTime(endTime) : '24:00'}`,
        tone: statusTone(task.status), overdue: state, lane: 0, laneCount: 1, task,
      });
    });
    const ordered = timed.sort((a, b) => a.startMinute - b.startMinute || a.title.localeCompare(b.title, 'es'));
    let group: TimedEntry[] = [];
    let groupEnd = -1;
    const assignLanes = () => {
      const laneEnds: number[] = [];
      group.forEach((entry) => {
        let lane = laneEnds.findIndex((end) => end <= entry.startMinute);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = entry.endMinute;
        entry.lane = lane;
      });
      group.forEach((entry) => { entry.laneCount = Math.max(1, laneEnds.length); });
      group = [];
      groupEnd = -1;
    };
    ordered.forEach((entry) => {
      if (group.length && entry.startMinute >= groupEnd) assignLanes();
      group.push(entry);
      groupEnd = Math.max(groupEnd, entry.endMinute);
    });
    if (group.length) assignLanes();
    return { allDay, timed: ordered };
  };

  const activeStart = selection ? Math.min(selection.anchor, selection.focus) : 0;
  const activeEnd = selection ? Math.max(selection.anchor, selection.focus) + unitMinutes : 0;
  const createPostOrTask = (entry: TimedEntry | AllDayEntry) => {
    if (entry.kind === 'post' && entry.post) onPostSelect(entry.post);
    if (entry.kind === 'task' && entry.task) onTaskSelect(entry.task);
  };

  return <section className={`vc-marketing-time-grid is-${view}`} aria-label={view === 'day' ? `Agenda diaria del ${firstDate}` : `Agenda semanal del ${firstDate} al ${lastDate}`}>
    <p className="vc-marketing-selection-hint">{canEdit ? 'Arrastra sobre las horas para crear una actividad con inicio y fin. También puedes usar las flechas y Enter para crear un bloque. Pulsa Escape para cancelar.' : 'Las actividades y publicaciones se muestran según sus fechas y horarios.'}</p>
    <div ref={timelineRef} className="vc-marketing-time-scroll" role="grid" aria-label={view === 'day' ? `Día ${firstDate}; intervalos de 30 minutos` : `Semana ${firstDate} al ${lastDate}; intervalos de una hora`}>
      <div className="vc-marketing-time-head"><div className="vc-marketing-time-gutter" aria-hidden="true">Hora</div>{dates.map((date) => {
        const key = dateKey(date);
        return <div className={`vc-marketing-time-day-heading${key === today ? ' is-today' : ''}`} key={key}><b>{view === 'day' ? new Intl.DateTimeFormat('es-EC', { weekday: 'long' }).format(date) : dayFormat.format(date)}</b><span>{key === today ? 'Hoy' : key}</span></div>;
      })}</div>
      <div className="vc-marketing-all-day-row"><div className="vc-marketing-time-gutter">Todo el día</div>{dates.map((date) => {
        const key = dateKey(date);
        const entries = getEntries(key).allDay;
        return <div className="vc-marketing-all-day-cell" data-calendar-date={key} key={key}>
          {canEdit && <button type="button" className="vc-marketing-all-day-create" onClick={() => onCreateRange({ startDate: key, endDate: key })} aria-label={`Crear actividad sin horario el ${key}`}>+ Actividad</button>}
          {entries.length ? entries.map((entry) => <ContextMenu key={entry.key} displayContents trigger={false} className="vc-marketing-time-event-context" label={`Acciones para ${entry.title}`} actions={entry.kind === 'post' && entry.post ? postActions(entry.post) : entry.task ? taskActions(entry.task) : []}><button type="button" className={`vc-marketing-time-event is-all-day tone-${entry.tone}${entry.overdue ? ' is-overdue' : ''}`} onClick={() => createPostOrTask(entry)}><b>{entry.title}</b><span>{entry.subline}</span></button></ContextMenu>) : <span className="vc-marketing-all-day-empty">—</span>}
        </div>;
      })}</div>
      <div className="vc-marketing-time-body" style={{ '--calendar-slots': slotsPerDay } as React.CSSProperties}>
        <div className="vc-marketing-time-gutter vc-marketing-time-labels">{Array.from({ length: slotsPerDay }, (_, slot) => <span key={slot} className={slot % (60 / unitMinutes) === 0 ? 'is-hour' : ''} style={{ gridRow: slot + 1 }}>{slot % (60 / unitMinutes) === 0 ? `${String(Math.floor(slot * unitMinutes / 60)).padStart(2, '0')}:00` : ''}</span>)}</div>
        {dates.map((date) => {
          const key = dateKey(date);
          const { timed } = getEntries(key);
          const dayStart = minutesForDate(key, firstDate);
          const selectStart = selection ? Math.max(activeStart, dayStart) : 0;
          const selectEnd = selection ? Math.min(activeEnd, dayStart + 1440) : 0;
          const selectionRows = selection && selectEnd > selectStart ? {
            gridRow: `${Math.floor((selectStart - dayStart) / unitMinutes) + 1} / ${Math.max(Math.floor((selectStart - dayStart) / unitMinutes) + 2, Math.ceil((selectEnd - dayStart) / unitMinutes) + 1)}`,
          } : undefined;
          return <div className={`vc-marketing-time-day-column${key === today ? ' is-today' : ''}${selectionRows ? ' has-selection' : ''}`} data-calendar-date={key} key={key}>
            <div className="vc-marketing-time-slot-layer">{Array.from({ length: slotsPerDay }, (_, slot) => <button
              type="button" key={slot} className={`vc-marketing-time-slot${slot % (60 / unitMinutes) === 0 ? ' is-hour' : ''}`}
              data-calendar-slot={slot} data-calendar-date={key}
              tabIndex={keyboardFocus.date === key && keyboardFocus.slot === slot ? 0 : -1}
              aria-label={`${key}, ${formatTime(slot * unitMinutes)} a ${formatTime((slot + 1) * unitMinutes)}`}
              onPointerDown={(event) => {
                if (!canEdit || event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
                event.preventDefault();
                const absolute = dayStart + slot * unitMinutes;
                setActiveSelection({ anchor: absolute, focus: absolute });
              }}
              onKeyDown={(event) => {
                if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                event.preventDefault();
                let dayIndex = dates.findIndex((item) => dateKey(item) === key);
                let nextSlot = slot;
                if (event.key === 'ArrowUp') nextSlot -= 1;
                if (event.key === 'ArrowDown') nextSlot += 1;
                if (event.key === 'ArrowLeft') dayIndex -= 1;
                if (event.key === 'ArrowRight') dayIndex += 1;
                if (nextSlot < 0) { dayIndex -= 1; nextSlot = slotsPerDay - 1; }
                if (nextSlot >= slotsPerDay) { dayIndex += 1; nextSlot = 0; }
                if (dayIndex < 0 || dayIndex >= dates.length) return;
                const nextDate = dateKey(dates[dayIndex]);
                setKeyboardFocus({ date: nextDate, slot: nextSlot });
                requestAnimationFrame(() => timelineRef.current?.querySelector<HTMLElement>(`[data-calendar-date="${nextDate}"][data-calendar-slot="${nextSlot}"]`)?.focus());
              }}
              onClick={(event) => { if (canEdit && event.detail === 0) createRangeForSlot(key, slot); }}
            />)}</div>
            {selectionRows && <div className="vc-marketing-time-selection" style={selectionRows} aria-hidden="true"/>}
            {timed.map((entry) => {
              const rowStart = Math.floor(entry.startMinute / unitMinutes) + 1;
              const rowEnd = Math.max(rowStart + 1, Math.ceil(entry.endMinute / unitMinutes) + 1);
              return <ContextMenu key={entry.key} displayContents trigger={false} className="vc-marketing-time-event-context" label={`Acciones para ${entry.title}`} actions={entry.kind === 'post' && entry.post ? postActions(entry.post) : entry.task ? taskActions(entry.task) : []}>
                <button type="button" className={`vc-marketing-time-event tone-${entry.tone}${entry.overdue ? ' is-overdue' : ''}${entry.kind === 'task' ? ' is-task' : ' is-post'}`} style={{ gridRow: `${rowStart} / ${rowEnd}`, marginLeft: `${entry.lane / entry.laneCount * 100}%`, width: `${100 / entry.laneCount}%` }} onClick={() => createPostOrTask(entry)} title={`${entry.timeLabel} · ${entry.title} · ${entry.subline}`}>
                  <time>{entry.timeLabel}</time><b>{entry.title}</b><span>{entry.subline}</span>
                </button>
              </ContextMenu>;
            })}
          </div>;
        })}
      </div>
    </div>
  </section>;
}
