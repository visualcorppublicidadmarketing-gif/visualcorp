import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Plus, Sun, Moon } from 'lucide-react';
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
  onPostSchedule?: (post: MarketingCalendarPost, date: string, time?: string) => void;
  onTaskSchedule?: (task: MarketingCalendarTask, date: string, startTime?: string, endTime?: string) => void;
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

export function MarketingTimeGrid({
  view,
  dates,
  today,
  posts,
  tasks,
  campaignNames,
  canEdit,
  onPostSelect,
  onTaskSelect,
  postActions,
  taskActions,
  onCreateRange,
  onPostSchedule,
  onTaskSchedule,
}: Props) {
  const unitMinutes = view === 'day' ? 30 : 60;
  const firstDate = dateKey(dates[0]);
  const lastDate = dateKey(dates[dates.length - 1]);
  const [timeRangeMode, setTimeRangeMode] = useState<'work' | 'all'>('work');
  const [draggingItem, setDraggingItem] = useState<{ kind: 'post' | 'task'; id: string; title: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ date: string; slot?: number } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [nowMinute, setNowMinute] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  const selectionRef = useRef<Selection | null>(null);
  const onCreateRangeRef = useRef(onCreateRange);
  onCreateRangeRef.current = onCreateRange;
  const timelineRef = useRef<HTMLDivElement>(null);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }), []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMinute(new Date().getHours() * 60 + new Date().getMinutes());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Compute adaptive visible hours
  const earliestMinute = useMemo(() => {
    if (timeRangeMode === 'all') return 0;
    let min = 7 * 60; // 07:00
    posts.forEach((p) => {
      const m = parseTime(p.scheduled_time);
      if (m !== null && m < min) min = Math.floor(m / 60) * 60;
    });
    tasks.forEach((t) => {
      const m = parseTime(t.start_time);
      if (m !== null && m < min) min = Math.floor(m / 60) * 60;
    });
    return Math.max(0, min);
  }, [posts, tasks, timeRangeMode]);

  const latestMinute = useMemo(() => {
    if (timeRangeMode === 'all') return 1440;
    let max = 21 * 60; // 21:00
    posts.forEach((p) => {
      const m = parseTime(p.scheduled_time);
      if (m !== null && m > max) max = Math.ceil((m + unitMinutes) / 60) * 60;
    });
    tasks.forEach((t) => {
      const m = parseTime(t.end_time || t.start_time);
      if (m !== null && m > max) max = Math.ceil(m / 60) * 60;
    });
    return Math.min(1440, Math.max(max, earliestMinute + 8 * 60));
  }, [earliestMinute, posts, tasks, timeRangeMode, unitMinutes]);

  const startSlot = Math.floor(earliestMinute / unitMinutes);
  const endSlot = Math.ceil(latestMinute / unitMinutes);
  const visibleSlotCount = Math.max(1, endSlot - startSlot);

  const [keyboardFocus, setKeyboardFocus] = useState(() => ({
    date: firstDate,
    slot: view === 'day' && firstDate === today
      ? Math.max(0, Math.min(visibleSlotCount - 1, Math.floor((new Date().getHours() * 60 + new Date().getMinutes() - earliestMinute) / unitMinutes)))
      : 0,
  }));

  const setActiveSelection = (next: Selection | null) => {
    selectionRef.current = next;
    setSelection(next);
  };

  useEffect(() => {
    setKeyboardFocus({
      date: firstDate,
      slot: view === 'day' && firstDate === today
        ? Math.max(0, Math.min(visibleSlotCount - 1, Math.floor((new Date().getHours() * 60 + new Date().getMinutes() - earliestMinute) / unitMinutes)))
        : 0,
    });
  }, [earliestMinute, firstDate, today, unitMinutes, view, visibleSlotCount]);

  useEffect(() => {
    if (view !== 'day' || dateKey(dates[0]) !== today || !timelineRef.current) return;
    const currentM = new Date().getHours() * 60 + new Date().getMinutes();
    const currentSlot = Math.floor((currentM - earliestMinute) / unitMinutes);
    const slot = timelineRef.current.querySelector<HTMLElement>(`[data-calendar-slot="${currentSlot}"]`);
    if (slot) {
      timelineRef.current.scrollTop = Math.max(0, timelineRef.current.scrollTop + slot.getBoundingClientRect().top - timelineRef.current.getBoundingClientRect().top - 120);
    }
  }, [dates, earliestMinute, today, unitMinutes, view]);

  // Pointer selection drag for creating ranges
  useEffect(() => {
    const updateFromPointer = (event: PointerEvent) => {
      if (!selectionRef.current) return;
      const column = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.vc-marketing-time-day-column[data-calendar-date]');
      const firstSlotEl = column?.querySelector<HTMLElement>('[data-calendar-slot]');
      if (!column || !firstSlotEl) return;
      const slotHeight = firstSlotEl.getBoundingClientRect().height;
      if (!slotHeight) return;
      const dayOffset = minutesForDate(column.dataset.calendarDate || firstDate, firstDate);
      const slotOffset = Math.min(visibleSlotCount - 1, Math.max(0, Math.floor((event.clientY - column.getBoundingClientRect().top) / slotHeight)));
      if (!Number.isFinite(slotOffset)) return;
      const active = selectionRef.current;
      if (active) setActiveSelection({ ...active, focus: dayOffset + earliestMinute + slotOffset * unitMinutes });
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
  }, [earliestMinute, firstDate, unitMinutes, visibleSlotCount]);

  const createRangeForSlot = (date: string, relativeSlot: number) => {
    const start = minutesForDate(date, firstDate) + earliestMinute + relativeSlot * unitMinutes;
    onCreateRange(createRange(start, start + unitMinutes, firstDate));
  };

  const getEntries = (date: string) => {
    const allDay: AllDayEntry[] = [];
    const timed: TimedEntry[] = [];

    posts.filter((post) => post.scheduled_date.slice(0, 10) === date).forEach((post) => {
      const minute = parseTime(post.scheduled_time);
      const entry: TimedEntry = {
        key: `post:${post.id}`,
        kind: 'post',
        startMinute: minute ?? 0,
        endMinute: Math.min(1440, (minute ?? 0) + unitMinutes),
        title: post.title || 'Publicación sin título',
        subline: `${post.platform || 'Canal pendiente'} · ${post.status || 'Por iniciar'}`,
        timeLabel: minute === null ? '' : formatTime(minute),
        tone: statusTone(post.status),
        overdue: false,
        lane: 0,
        laneCount: 1,
        post,
      };
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
        key: `task:${task.id}:${date}`,
        kind: 'task',
        startMinute,
        endMinute,
        title: task.title || 'Actividad sin título',
        subline,
        timeLabel: `${firstDay ? formatTime(startTime) : '00:00'}–${lastDay ? formatTime(endTime) : '24:00'}`,
        tone: statusTone(task.status),
        overdue: state,
        lane: 0,
        laneCount: 1,
        task,
      });
    });

    // Exact non-greedy lane packing
    const ordered = timed.sort((a, b) => a.startMinute - b.startMinute || a.title.localeCompare(b.title, 'es'));
    let group: TimedEntry[] = [];
    let groupEnd = -1;

    const assignLanes = () => {
      const laneEnds: number[] = [];
      group.forEach((entry) => {
        let lane = laneEnds.findIndex((end) => end <= entry.startMinute);
        if (lane < 0) {
          lane = laneEnds.length;
          laneEnds.push(entry.endMinute);
        } else {
          laneEnds[lane] = entry.endMinute;
        }
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

  const handleDragStart = (e: React.DragEvent, kind: 'post' | 'task', id: string, title: string) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.setData('application/json', JSON.stringify({ kind, id }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggingItem({ kind, id, title });
  };

  const handleAllDayDrop = (e: React.DragEvent, date: string) => {
    if (!canEdit || !draggingItem) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggingItem.kind === 'post') {
      const post = posts.find((p) => p.id === draggingItem.id);
      if (post) onPostSchedule?.(post, date, '');
    } else if (draggingItem.kind === 'task') {
      const task = tasks.find((t) => t.id === draggingItem.id);
      if (task) onTaskSchedule?.(task, date, '', '');
    }
    setDraggingItem(null);
    setDragOverTarget(null);
  };

  const handleSlotDrop = (e: React.DragEvent, date: string, absoluteMinute: number) => {
    if (!canEdit || !draggingItem) return;
    e.preventDefault();
    e.stopPropagation();
    const time = formatTime(absoluteMinute);
    if (draggingItem.kind === 'post') {
      const post = posts.find((p) => p.id === draggingItem.id);
      if (post) onPostSchedule?.(post, date, time);
    } else if (draggingItem.kind === 'task') {
      const task = tasks.find((t) => t.id === draggingItem.id);
      if (task) {
        const endTime = formatTime(Math.min(1440, absoluteMinute + unitMinutes));
        onTaskSchedule?.(task, date, time, endTime);
      }
    }
    setDraggingItem(null);
    setDragOverTarget(null);
  };

  const isCurrentTimeInRange = nowMinute >= earliestMinute && nowMinute <= latestMinute;
  const nowPercent = isCurrentTimeInRange ? ((nowMinute - earliestMinute) / (latestMinute - earliestMinute)) * 100 : null;

  return (
    <section className={`vc-marketing-time-grid is-${view}`} aria-label={view === 'day' ? `Agenda diaria del ${firstDate}` : `Agenda semanal del ${firstDate} al ${lastDate}`}>
      <div className="vc-marketing-time-toolbar-strip">
        <p className="vc-marketing-selection-hint">
          {canEdit
            ? '💡 Arrastra cualquier tarjeta a la hora o día deseado. También puedes arrastrar sobre horas vacías para crear una nueva actividad.'
            : 'Las actividades y publicaciones se organizan según sus horarios y fechas.'}
        </p>
        <div className="vc-marketing-time-range-toggle">
          <button
            type="button"
            className={timeRangeMode === 'work' ? 'is-active' : ''}
            onClick={() => setTimeRangeMode('work')}
            title="Mostrar horario productivo (07:00 a 21:00)"
          >
            <Sun size={13} />
            <span>07:00 – 21:00</span>
          </button>
          <button
            type="button"
            className={timeRangeMode === 'all' ? 'is-active' : ''}
            onClick={() => setTimeRangeMode('all')}
            title="Mostrar 24 horas completas"
          >
            <Moon size={13} />
            <span>24 Horas</span>
          </button>
        </div>
      </div>

      <div ref={timelineRef} className="vc-marketing-time-scroll" role="grid" aria-label={view === 'day' ? `Día ${firstDate}; intervalos de 30 minutos` : `Semana ${firstDate} al ${lastDate}; 7 días completos`}>
        {/* Head with day titles */}
        <div className="vc-marketing-time-head">
          <div className="vc-marketing-time-gutter" aria-hidden="true">Hora</div>
          {dates.map((date) => {
            const key = dateKey(date);
            return (
              <div className={`vc-marketing-time-day-heading${key === today ? ' is-today' : ''}`} key={key}>
                <b>{view === 'day' ? new Intl.DateTimeFormat('es-EC', { weekday: 'long' }).format(date) : dayFormat.format(date)}</b>
                <span>{key === today ? 'Hoy' : key}</span>
              </div>
            );
          })}
        </div>

        {/* All-day row */}
        <div className="vc-marketing-all-day-row">
          <div className="vc-marketing-time-gutter">Todo el día</div>
          {dates.map((date) => {
            const key = dateKey(date);
            const entries = getEntries(key).allDay;
            const isDropTarget = dragOverTarget?.date === key && dragOverTarget?.slot === undefined;

            return (
              <div
                className={`vc-marketing-all-day-cell${isDropTarget ? ' is-drop-target' : ''}`}
                data-calendar-date={key}
                key={key}
                onDragOver={(e) => {
                  if (!canEdit || !draggingItem) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverTarget?.date !== key || dragOverTarget?.slot !== undefined) {
                    setDragOverTarget({ date: key });
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOverTarget?.date === key && dragOverTarget?.slot === undefined) setDragOverTarget(null);
                  }
                }}
                onDrop={(e) => handleAllDayDrop(e, key)}
              >
                {canEdit && (
                  <button type="button" className="vc-marketing-all-day-create" onClick={() => onCreateRange({ startDate: key, endDate: key })} aria-label={`Crear actividad sin horario el ${key}`}>
                    + Actividad
                  </button>
                )}
                {isDropTarget && (
                  <div className="vc-marketing-drop-cue">Mover a Todo el día</div>
                )}
                {entries.length ? (
                  entries.map((entry) => (
                    <ContextMenu key={entry.key} displayContents trigger={false} className="vc-marketing-time-event-context" label={`Acciones para ${entry.title}`} actions={entry.kind === 'post' && entry.post ? postActions(entry.post) : entry.task ? taskActions(entry.task) : []}>
                      <button
                        type="button"
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, entry.kind, entry.post?.id || entry.task?.id || '', entry.title)}
                        onDragEnd={() => { setDraggingItem(null); setDragOverTarget(null); }}
                        className={`vc-marketing-time-event is-all-day tone-${entry.tone}${entry.overdue ? ' is-overdue' : ''}${draggingItem?.id === (entry.post?.id || entry.task?.id) ? ' is-dragging' : ''}`}
                        onClick={() => createPostOrTask(entry)}
                      >
                        <b>{entry.title}</b>
                        <span>{entry.subline}</span>
                        {view === 'day' && canEdit && entry.kind === 'post' && entry.post && (
                          <div className="vc-marketing-day-quick-times" onClick={(e) => e.stopPropagation()}>
                            <span className="vc-marketing-quick-time-label">Fijar hora:</span>
                            {['09:00', '11:30', '15:00', '17:30'].map((time) => (
                              <button
                                key={time}
                                type="button"
                                className="vc-marketing-quick-time-btn"
                                onClick={() => onPostSchedule?.(entry.post!, key, time)}
                                title={`Asignar ${time}`}
                              >
                                {time}
                              </button>
                            ))}
                          </div>
                        )}
                      </button>
                    </ContextMenu>
                  ))
                ) : (
                  <span className="vc-marketing-all-day-empty">—</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Time body grid */}
        <div className="vc-marketing-time-body" style={{ '--calendar-slots': visibleSlotCount } as React.CSSProperties}>
          {/* Time hour labels on the left gutter */}
          <div className="vc-marketing-time-gutter vc-marketing-time-labels">
            {Array.from({ length: visibleSlotCount }, (_, i) => {
              const currentSlot = startSlot + i;
              const slotMin = currentSlot * unitMinutes;
              const isHour = slotMin % 60 === 0;
              return (
                <span key={currentSlot} className={isHour ? 'is-hour' : ''} style={{ gridRow: i + 1 }}>
                  {isHour ? formatTime(slotMin) : ''}
                </span>
              );
            })}
          </div>

          {/* Day columns */}
          {dates.map((date) => {
            const key = dateKey(date);
            const { timed } = getEntries(key);
            const dayStart = minutesForDate(key, firstDate);
            const selectStart = selection ? Math.max(activeStart, dayStart + earliestMinute) : 0;
            const selectEnd = selection ? Math.min(activeEnd, dayStart + latestMinute) : 0;
            const selectionRows = selection && selectEnd > selectStart ? {
              gridRow: `${Math.floor((selectStart - (dayStart + earliestMinute)) / unitMinutes) + 1} / ${Math.max(Math.floor((selectStart - (dayStart + earliestMinute)) / unitMinutes) + 2, Math.ceil((selectEnd - (dayStart + earliestMinute)) / unitMinutes) + 1)}`,
            } : undefined;

            return (
              <div className={`vc-marketing-time-day-column${key === today ? ' is-today' : ''}${selectionRows ? ' has-selection' : ''}`} data-calendar-date={key} key={key}>
                {/* Live now line */}
                {key === today && nowPercent !== null && (
                  <div className="vc-marketing-time-now-line" style={{ top: `${nowPercent}%` }}>
                    <span className="vc-marketing-time-now-badge">{formatTime(nowMinute)}</span>
                  </div>
                )}

                {/* Slot layer */}
                <div className="vc-marketing-time-slot-layer">
                  {Array.from({ length: visibleSlotCount }, (_, i) => {
                    const currentSlot = startSlot + i;
                    const slotMin = currentSlot * unitMinutes;
                    const isDropTarget = dragOverTarget?.date === key && dragOverTarget?.slot === currentSlot;

                    return (
                      <button
                        type="button"
                        key={currentSlot}
                        className={`vc-marketing-time-slot${slotMin % 60 === 0 ? ' is-hour' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
                        data-calendar-slot={i}
                        data-calendar-date={key}
                        tabIndex={keyboardFocus.date === key && keyboardFocus.slot === i ? 0 : -1}
                        aria-label={`${key}, ${formatTime(slotMin)} a ${formatTime(slotMin + unitMinutes)}`}
                        onPointerDown={(event) => {
                          if (!canEdit || event.pointerType !== 'mouse' || !event.isPrimary || event.button !== 0) return;
                          event.preventDefault();
                          const absolute = dayStart + slotMin;
                          setActiveSelection({ anchor: absolute, focus: absolute });
                        }}
                        onKeyDown={(event) => {
                          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                          event.preventDefault();
                          let dayIndex = dates.findIndex((item) => dateKey(item) === key);
                          let nextSlot = i;
                          if (event.key === 'ArrowUp') nextSlot -= 1;
                          if (event.key === 'ArrowDown') nextSlot += 1;
                          if (event.key === 'ArrowLeft') dayIndex -= 1;
                          if (event.key === 'ArrowRight') dayIndex += 1;
                          if (nextSlot < 0) { dayIndex -= 1; nextSlot = visibleSlotCount - 1; }
                          if (nextSlot >= visibleSlotCount) { dayIndex += 1; nextSlot = 0; }
                          if (dayIndex < 0 || dayIndex >= dates.length) return;
                          const nextDate = dateKey(dates[dayIndex]);
                          setKeyboardFocus({ date: nextDate, slot: nextSlot });
                          requestAnimationFrame(() => timelineRef.current?.querySelector<HTMLElement>(`[data-calendar-date="${nextDate}"][data-calendar-slot="${nextSlot}"]`)?.focus());
                        }}
                        onClick={(event) => { if (canEdit && event.detail === 0) createRangeForSlot(key, i); }}
                        onDragOver={(e) => {
                          if (!canEdit || !draggingItem) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverTarget?.date !== key || dragOverTarget?.slot !== currentSlot) {
                            setDragOverTarget({ date: key, slot: currentSlot });
                          }
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            if (dragOverTarget?.date === key && dragOverTarget?.slot === currentSlot) {
                              setDragOverTarget(null);
                            }
                          }
                        }}
                        onDrop={(e) => handleSlotDrop(e, key, slotMin)}
                      >
                        {isDropTarget && (
                          <span className="vc-marketing-slot-drop-label">
                            {formatTime(slotMin)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {selectionRows && <div className="vc-marketing-time-selection" style={selectionRows} aria-hidden="true" />}

                {/* Timed events positioned with rowStart and rowEnd */}
                {timed.map((entry) => {
                  if (entry.endMinute <= earliestMinute || entry.startMinute >= latestMinute) return null;
                  const clampedStart = Math.max(earliestMinute, entry.startMinute);
                  const clampedEnd = Math.min(latestMinute, entry.endMinute);
                  const rowStart = Math.floor((clampedStart - earliestMinute) / unitMinutes) + 1;
                  const rowEnd = Math.max(rowStart + 1, Math.ceil((clampedEnd - earliestMinute) / unitMinutes) + 1);

                  return (
                    <ContextMenu
                      key={entry.key}
                      displayContents
                      trigger={false}
                      className="vc-marketing-time-event-context"
                      label={`Acciones para ${entry.title}`}
                      actions={entry.kind === 'post' && entry.post ? postActions(entry.post) : entry.task ? taskActions(entry.task) : []}
                    >
                      <button
                        type="button"
                        draggable={canEdit}
                        onDragStart={(e) => handleDragStart(e, entry.kind, entry.post?.id || entry.task?.id || '', entry.title)}
                        onDragEnd={() => { setDraggingItem(null); setDragOverTarget(null); }}
                        className={`vc-marketing-time-event tone-${entry.tone}${entry.overdue ? ' is-overdue' : ''}${entry.kind === 'task' ? ' is-task' : ' is-post'}${draggingItem?.id === (entry.post?.id || entry.task?.id) ? ' is-dragging' : ''}`}
                        style={{
                          gridRow: `${rowStart} / ${rowEnd}`,
                          gridColumn: 1,
                          marginLeft: `calc(${(entry.lane / entry.laneCount) * 100}% + 2px)`,
                          width: `calc(${100 / entry.laneCount}% - 4px)`,
                          boxSizing: 'border-box',
                        }}
                        onClick={() => createPostOrTask(entry)}
                        title={`${entry.timeLabel} · ${entry.title} · ${entry.subline} (Arrastra a otra hora o día)`}
                      >
                        <time>{entry.timeLabel}</time>
                        <b>{entry.title}</b>
                        <span>{entry.subline}</span>
                      </button>
                    </ContextMenu>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
