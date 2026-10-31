import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, CopyPlus, Pencil, X, Check, Eye, CircleDot, Filter, GripVertical, ListFilter, Megaphone, Film, Image as ImageIcon, CheckCircle2, Circle } from 'lucide-react';
import { ContextMenu, type ContextMenuAction } from '../../../components/ui/ContextMenu';
import { Badge } from '../../../components/ui/OperationalKit';
import { DatePicker } from '../../../components/ui/Calendar';
import { MarketingPostArtwork, type MarketingArtworkAsset } from './MarketingPostArtwork';
import { getMarketingCalendarColor, getMarketingTags } from './marketingColors';
import { addMarketingDays, isTerminalMarketingStatus, marketingDateKey, marketingWeekStart } from './marketingScheduleRules';
import { isPublication } from './marketingWorkflow';
import './marketing-calendar.css';
import './marketing-calendar-enhanced.css';
import './marketing-kanban.css';
import './marketing-table.css';
import './marketing-interface-polish.css';

export type MarketingCalendarPost = {
  id: string; title: string; status: string; scheduled_date: string; scheduled_time?: string;
  source_id?: string; platform?: string; format?: string; owner?: string; content_line?: string; next_action?: string; tags?: string[]; calendar_color?: string;
  design_ready?: boolean; video_ready?: boolean; canvas_width?: number | null; canvas_height?: number | null;
  art_status?: string; video_status?: string;
  record_kind?: string;
};

type Props = {
  posts: MarketingCalendarPost[];
  organizationId: string;
  artworkByPost: ReadonlyMap<string, MarketingArtworkAsset>;
  onArtworkSaved: () => void;
  canEdit: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onToggle: (postId: string) => void;
  onSelect: (post: MarketingCalendarPost) => void;
  onCreate: (date: string) => void;
  onReschedule: (post: MarketingCalendarPost, date: string) => void;
  onStatusChange: (post: MarketingCalendarPost, status: string) => void;
  onReadinessChange: (post: MarketingCalendarPost, field: 'design_ready' | 'video_ready', checked: boolean) => void;
  onDuplicate: (post: MarketingCalendarPost) => void;
  onDelete: (post: MarketingCalendarPost) => void;
};

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthLabel = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' });
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const publicationStatuses = ['Por iniciar', 'Planificada', 'En diseño', 'En producción', 'En revisión', 'Aprobada', 'Programada', 'Publicada', 'Completada', 'Terminada', 'Bloqueada', 'Cancelada'];
const statusClass = (post: MarketingCalendarPost) => {
  const status = String(post.status || 'Por iniciar');
  if (/publicad/i.test(status)) return 'published';
  if (/complet|terminad|finalizad/i.test(status)) return 'completed';
  if (/cancelad|anulad|archivad/i.test(status)) return 'cancelled';
  if (/bloque/i.test(status)) return 'blocked';
  if (/revisi/i.test(status)) return 'review';
  if (/aprobad|programad/i.test(status)) return 'approved';
  if (/diseñ|producc/i.test(status)) return 'working';
  return 'active';
};
const matchesStateFilter = (post: MarketingCalendarPost, filter: string) => {
  const status = String(post.status || 'Por iniciar');
  if (filter === 'pending') return !isTerminalMarketingStatus(status);
  if (filter === 'published') return /publicad/i.test(status);
  if (filter === 'finished') return /complet|terminad|finalizad/i.test(status);
  if (filter === 'work') return /diseñ|producc/i.test(status);
  if (filter === 'review') return /revisi|aprobad|programad/i.test(status);
  if (filter === 'blocked') return /bloque|cancelad|anulad|archivad/i.test(status);
  return true;
};
const kanbanLanes = [
  { key: 'planned', label: 'Por iniciar', status: 'Por iniciar', matches: /^por iniciar$/i },
  { key: 'planning', label: 'Planificada', status: 'Planificada', matches: /^planificada$/i },
  { key: 'design', label: 'En diseño', status: 'En diseño', matches: /^en diseño$/i },
  { key: 'production', label: 'En producción', status: 'En producción', matches: /^en producción$/i },
  { key: 'review', label: 'En revisión', status: 'En revisión', matches: /revisi/i },
  { key: 'approved', label: 'Aprobada', status: 'Aprobada', matches: /^aprobada?$/i },
  { key: 'scheduled', label: 'Programada', status: 'Programada', matches: /^programada?$/i },
  { key: 'blocked', label: 'Bloqueada', status: 'Bloqueada', matches: /bloque/i },
  { key: 'published', label: 'Publicada', status: 'Publicada', matches: /publicad/i },
  { key: 'completed', label: 'Terminada', status: 'Completada', matches: /complet|terminad|finalizad/i },
  { key: 'cancelled', label: 'Cancelada', status: 'Cancelada', matches: /cancelad|anulad|archivad/i },
];
const dateFromKey = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};
const laneForStatus = (status: string) => kanbanLanes.find((lane) => lane.matches.test(status))?.key || `custom:${status || 'Por iniciar'}`;
const shiftDate = (source: string, days: number) => {
  const [year, month, day] = source.slice(0, 10).split('-').map(Number);
  const shifted = new Date(year, month - 1, day + days, 12);
  return dateKey(shifted);
};
const weekOfMonth = (date: Date) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Math.floor((monday.getTime() - first.getTime()) / 604800000) + 1;
};

export function MarketingReadinessIndicators({ post, compact = false, onChange, disabled = false }: { post: MarketingCalendarPost; compact?: boolean; onChange?: (field: 'design_ready' | 'video_ready', checked: boolean) => void; disabled?: boolean }) {
  if (!isPublication(post)) return null;
  const items = [
    { label: 'Diseño', ready: post.art_status==='Sí'||(!post.art_status&&post.design_ready===true), notApplicable:post.art_status==='No aplica', field: 'design_ready' as const, Icon: ImageIcon },
    { label: 'Vídeo', ready: post.video_status==='Sí'||(!post.video_status&&post.video_ready===true), notApplicable:post.video_status==='No aplica', field: 'video_ready' as const, Icon: Film },
  ];
  return <span className={`vc-marketing-readiness-indicators${compact ? ' is-compact' : ''}`} role="group" aria-label="Checklist de producción">
    {items.map(({ label, ready, field, Icon, notApplicable }) => {
      const content = <>{ready ? <CheckCircle2 size={compact ? 12 : 13}/> : <Circle size={compact ? 12 : 13}/>}<Icon size={compact ? 11 : 12}/><span>{compact ? label.slice(0, 1) : label}</span><b>{compact ? '' : notApplicable ? 'No aplica' : ready ? 'Listo' : 'Pendiente'}</b></>;
      const accessibleLabel = `${label} ${notApplicable?'no aplica':ready ? 'listo' : 'pendiente'}`;
      return onChange
        ? <button key={label} type="button" className={`vc-marketing-readiness-item${ready ? ' is-ready' : ''}`} title={`${accessibleLabel}. ${notApplicable?'Cambia la aplicabilidad desde la ficha.':`Clic para ${ready ? 'marcar pendiente' : 'marcar listo'}.`}`} aria-label={accessibleLabel} aria-pressed={ready} disabled={disabled||notApplicable} onClick={() => onChange(field, !ready)}>{content}</button>
        : <span key={label} className={`vc-marketing-readiness-item${ready ? ' is-ready' : ''}`} title={accessibleLabel} aria-label={accessibleLabel}>{content}</span>;
    })}
  </span>;
}

type MarketingCalendarView = 'month' | 'week' | 'kanban' | 'table';
type MarketingStateFilter = 'all' | 'pending' | 'work' | 'review' | 'published' | 'finished' | 'blocked';
type MarketingCalendarPreferences = {
  view: MarketingCalendarView;
  anchor: string;
  followCurrentWeek: boolean;
  channelFilter: string;
  ownerFilter: string;
  kanbanStateFilter: MarketingStateFilter;
};

const MARKETING_CALENDAR_VIEW_KEY = 'visualcorp:marketing-calendar:v1:';
const isCalendarView = (value: unknown): value is MarketingCalendarView => value === 'month' || value === 'week' || value === 'kanban' || value === 'table';
const isDateKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function readCalendarPreferences(organizationId: string): MarketingCalendarPreferences | null {
  try {
    const saved = window.localStorage.getItem(`${MARKETING_CALENDAR_VIEW_KEY}${organizationId}`);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<MarketingCalendarPreferences>;
    return {
      view: isCalendarView(parsed.view) ? parsed.view : 'month',
      anchor: isDateKey(parsed.anchor) ? parsed.anchor : marketingDateKey(),
      followCurrentWeek: parsed.followCurrentWeek !== false,
      channelFilter: typeof parsed.channelFilter === 'string' ? parsed.channelFilter : 'Todos los canales',
      ownerFilter: typeof parsed.ownerFilter === 'string' ? parsed.ownerFilter : 'Todos los responsables',
      kanbanStateFilter: ['pending', 'work', 'review', 'published', 'finished', 'blocked'].includes(String(parsed.kanbanStateFilter)) ? parsed.kanbanStateFilter as MarketingStateFilter : 'all',
    };
  } catch {
    return null;
  }
}

export function MarketingCalendar({ posts, organizationId, artworkByPost, onArtworkSaved, canEdit, canDelete, selectedIds, onToggle, onSelect, onCreate, onReschedule, onStatusChange, onReadinessChange, onDuplicate, onDelete }: Props) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<MarketingCalendarView>('month');
  const [todayKey, setTodayKey] = useState(() => marketingDateKey());
  const [followCurrentWeek, setFollowCurrentWeek] = useState(true);
  const [channelFilter, setChannelFilter] = useState('Todos los canales');
  const [ownerFilter, setOwnerFilter] = useState('Todos los responsables');
  const [kanbanStateFilter, setKanbanStateFilter] = useState<MarketingStateFilter>('all');
  const [showEmptyKanbanLanes, setShowEmptyKanbanLanes] = useState(false);
  const [restoredPreferencesFor, setRestoredPreferencesFor] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggingKanban, setDraggingKanban] = useState<string | null>(null);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const weekGridRef = useRef<HTMLDivElement>(null);
  const [weekScrollPosition, setWeekScrollPosition] = useState({ start: 1, end: 7 });

  useEffect(() => {
    if (!organizationId) {
      setRestoredPreferencesFor('');
      return;
    }
    const preferences = readCalendarPreferences(organizationId);
    if (preferences) {
      setView(preferences.view);
      setAnchor(dateFromKey(preferences.anchor));
      setFollowCurrentWeek(preferences.followCurrentWeek);
      setChannelFilter(preferences.channelFilter);
      setOwnerFilter(preferences.ownerFilter);
      setKanbanStateFilter(preferences.kanbanStateFilter);
    } else {
      setView('month');
      setAnchor(dateFromKey(marketingDateKey()));
      setFollowCurrentWeek(true);
      setChannelFilter('Todos los canales');
      setOwnerFilter('Todos los responsables');
      setKanbanStateFilter('all');
    }
    setRestoredPreferencesFor(organizationId);
  }, [organizationId]);
  useEffect(() => {
    if (channelFilter !== 'Todos los canales' && channelFilter !== 'Canal pendiente' && !posts.some((post) => post.platform === channelFilter)) {
      setChannelFilter('Todos los canales');
    }
    if (ownerFilter !== 'Todos los responsables' && ownerFilter !== 'Sin asignar' && !posts.some((post) => post.owner === ownerFilter)) {
      setOwnerFilter('Todos los responsables');
    }
  }, [channelFilter, ownerFilter, posts]);
  useEffect(() => {
    if (!organizationId || restoredPreferencesFor !== organizationId) return;
    try {
      const preferences: MarketingCalendarPreferences = {
        view,
        anchor: dateKey(anchor),
        followCurrentWeek,
        channelFilter,
        ownerFilter,
        kanbanStateFilter,
      };
      window.localStorage.setItem(`${MARKETING_CALENDAR_VIEW_KEY}${organizationId}`, JSON.stringify(preferences));
    } catch {
      // Calendar preferences are optional when browser storage is unavailable.
    }
  }, [anchor, channelFilter, followCurrentWeek, kanbanStateFilter, organizationId, ownerFilter, restoredPreferencesFor, view]);
  useEffect(() => {
    const interval = window.setInterval(() => setTodayKey(marketingDateKey()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if ((view !== 'kanban' && view !== 'table') || !followCurrentWeek) return;
    const currentWeek = marketingWeekStart(todayKey);
    if (marketingWeekStart(dateKey(anchor)) !== currentWeek) setAnchor(dateFromKey(todayKey));
  }, [anchor, followCurrentWeek, todayKey, view]);
  const cells = useMemo(() => {
    if (view !== 'month') {
      const start = new Date(anchor); start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [anchor, view]);
  const postsInPeriod = useMemo(() => {
    const start = dateKey(cells[0]);
    const end = view === 'month'
      ? dateKey(cells[cells.length - 1])
      : view === 'kanban' || view === 'table'
        ? addMarketingDays(dateKey(cells[6]), 1)
        : dateKey(cells[6]);
    return posts.filter((post) => {
      const scheduledDate = String(post.scheduled_date || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) && scheduledDate >= start && scheduledDate <= end;
    });
  }, [cells, posts, view]);
  const filteredPeriodPosts = useMemo(() => postsInPeriod.filter((post) => {
    const matchesChannel = channelFilter === 'Todos los canales' || (channelFilter === 'Canal pendiente' ? !post.platform : post.platform === channelFilter);
    const matchesOwner = ownerFilter === 'Todos los responsables' || (ownerFilter === 'Sin asignar' ? !post.owner : post.owner === ownerFilter);
    return matchesChannel && matchesOwner && matchesStateFilter(post, kanbanStateFilter);
  }), [channelFilter, kanbanStateFilter, ownerFilter, postsInPeriod]);
  const byDate = useMemo(() => {
    const result = new Map<string, MarketingCalendarPost[]>();
    filteredPeriodPosts.forEach((post) => {
      const key = post.scheduled_date.slice(0, 10);
      result.set(key, [...(result.get(key) || []), post].sort((a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '')));
    });
    return result;
  }, [filteredPeriodPosts]);
  const undated = posts.filter((post) => !/^\d{4}-\d{2}-\d{2}/.test(post.scheduled_date || '')
    && (channelFilter === 'Todos los canales' || (channelFilter === 'Canal pendiente' ? !post.platform : post.platform === channelFilter))
    && (ownerFilter === 'Todos los responsables' || (ownerFilter === 'Sin asignar' ? !post.owner : post.owner === ownerFilter))
    && matchesStateFilter(post, kanbanStateFilter));
  const weekStartKey = dateKey(cells[0]);
  const weekEndKey = dateKey(cells[6]);
  const nextMondayKey = addMarketingDays(weekEndKey, 1);
  const isCurrentWeek = weekStartKey === marketingWeekStart(todayKey);


  const weekPosts = posts.filter((post) => {
    const scheduledDate = String(post.scheduled_date || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) && scheduledDate >= weekStartKey && scheduledDate <= nextMondayKey;
  });
  const kanbanChannels = [...new Set(posts.map((post) => post.platform).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const kanbanOwners = [...new Set(posts.map((post) => post.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const kanbanPosts = weekPosts.filter((post) => {
    const matchesChannel = channelFilter === 'Todos los canales' || (channelFilter === 'Canal pendiente' ? !post.platform : post.platform === channelFilter);
    const matchesOwner = ownerFilter === 'Todos los responsables' || (ownerFilter === 'Sin asignar' ? !post.owner : post.owner === ownerFilter);
    return matchesChannel && matchesOwner && matchesStateFilter(post, kanbanStateFilter);
  });
  const tablePosts = [...kanbanPosts].sort((a, b) =>
    String(a.scheduled_date || '').localeCompare(String(b.scheduled_date || ''))
    || String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || ''))
    || String(a.title || '').localeCompare(String(b.title || ''), 'es'),
  );
  const customKanbanStatuses = [...new Set(kanbanPosts.map((post) => String(post.status || 'Por iniciar')))]
    .filter((status) => !kanbanLanes.some((lane) => lane.matches.test(status)))
    .sort((a, b) => a.localeCompare(b, 'es'));
  const kanbanColumns = [
    ...kanbanLanes,
    ...customKanbanStatuses.map((status) => ({ key: `custom:${status}`, label: status, status, matches: new RegExp(`^${status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })),
  ];
  const today = todayKey;
  const move = (amount: number) => {
    setFollowCurrentWeek(false);
    setAnchor((current) => view === 'month' ? new Date(current.getFullYear(), current.getMonth() + amount, 1, 12) : new Date(current.getFullYear(), current.getMonth(), current.getDate() + amount * 7, 12));
  };
  const openTableView = () => {
    if (view === 'month') {
      setAnchor(dateFromKey(todayKey));
      setFollowCurrentWeek(true);
    }
    setView('table');
    setExpandedDate(null);
  };
  const contextualActions = (post: MarketingCalendarPost): ContextMenuAction[] => [
    { label: 'Editar ficha', group: 'Publicación', icon: <Pencil size={14}/>, onSelect: () => onSelect(post), disabled: !canEdit },
    { label: 'Cambiar etapa', group: 'Publicación', icon: <CircleDot size={14}/>, disabled: !canEdit, onSelect: () => {}, children: [...new Set([...publicationStatuses, post.status].filter(Boolean))].map((status) => ({ label: status, kind: 'radio' as const, radioGroup: `marketing-status-${post.id}`, checked: status === post.status, onSelect: () => onStatusChange(post, status) })) },
    { label: post.design_ready ? 'Diseño listo' : 'Marcar diseño listo', group: 'Producción', icon: <ImageIcon size={14}/>, kind: 'checkbox', checked: post.design_ready === true, onSelect: () => {}, onCheckedChange: (checked) => onReadinessChange(post, 'design_ready', checked), disabled: !canEdit },
    { label: post.video_ready ? 'Vídeo listo' : 'Marcar vídeo listo', group: 'Producción', icon: <Film size={14}/>, kind: 'checkbox', checked: post.video_ready === true, onSelect: () => {}, onCheckedChange: (checked) => onReadinessChange(post, 'video_ready', checked), disabled: !canEdit },
    { label: 'Duplicar como borrador', group: 'Publicación', icon: <CopyPlus size={14}/>, onSelect: () => onDuplicate(post), disabled: !canEdit },
    ...(canEdit || canDelete ? [{ label: selectedIds.has(post.id) ? 'Quitar de seleccionadas' : 'Seleccionar publicación', group: 'Publicación', icon: <Check size={14}/>, kind: 'checkbox' as const, checked: selectedIds.has(post.id), onSelect: () => {}, onCheckedChange: () => onToggle(post.id), disabled: !(canEdit || canDelete) }] : []),
    { label: 'Ver agenda de esta fecha', group: 'Calendario', icon: <CalendarDays size={14}/>, onSelect: () => setExpandedDate(post.scheduled_date.slice(0, 10)) },
    { label: 'Reprogramar', group: 'Calendario', icon: <CalendarDays size={14}/>, disabled: !canEdit || !post.scheduled_date, onSelect: () => {}, children: [
      { label: 'Un día después', onSelect: () => onReschedule(post, shiftDate(post.scheduled_date, 1)) },
      { label: 'Una semana después', onSelect: () => onReschedule(post, shiftDate(post.scheduled_date, 7)) },
      { label: 'Un día antes', onSelect: () => onReschedule(post, shiftDate(post.scheduled_date, -1)) },
    ] },
    { kind: 'separator', label: '', onSelect: () => {} },
    { label: 'Eliminar publicación', group: 'Acción crítica', icon: <Trash2 size={14}/>, onSelect: () => onDelete(post), destructive: true, disabled: !canDelete },
  ];
  const dayActions = (date: string): ContextMenuAction[] => [
    { kind: 'label', label: `Calendario · ${date}`, onSelect: () => {} },
    { label: 'Crear publicación en esta fecha', icon: <Plus size={14}/>, onSelect: () => onCreate(date), disabled: !canEdit },
    { label: 'Abrir agenda del día', icon: <Eye size={14}/>, onSelect: () => setExpandedDate(date) },
    { label: 'Ver esta semana', icon: <CalendarDays size={14}/>, onSelect: () => { const [year, month, day] = date.split('-').map(Number); setAnchor(new Date(year, month - 1, day, 12)); setView('week'); setExpandedDate(date); } },
  ];
  const calendarActions: ContextMenuAction[] = [
    { kind: 'label', label: 'Calendario editorial', onSelect: () => {} },
    { label: 'Ir a hoy', icon: <CalendarDays size={14}/>, onSelect: () => { setAnchor(new Date()); setExpandedDate(null); } },
    { label: 'Publicación para esta fecha', icon: <Plus size={14}/>, onSelect: () => onCreate(dateKey(anchor)), disabled: !canEdit },
    { label: 'Vista del calendario', icon: <CalendarDays size={14}/>, onSelect: () => {}, children: [
      { label: 'Mes', kind: 'radio', checked: view === 'month', onSelect: () => { setView('month'); setExpandedDate(null); } },
      { label: 'Semana', kind: 'radio', checked: view === 'week', onSelect: () => { setView('week'); setExpandedDate(null); } },
      { label: 'Kanban semanal', kind: 'radio', checked: view === 'kanban', onSelect: () => { if (view === 'month') { setAnchor(dateFromKey(todayKey)); setFollowCurrentWeek(true); } setView('kanban'); setExpandedDate(null); } },
      { label: 'Tabla semanal', kind: 'radio', checked: view === 'table', onSelect: openTableView },
    ] },
    { label: 'Anterior', onSelect: () => move(-1) },
    { label: 'Siguiente', onSelect: () => move(1) },
  ];
  const weekRange = `${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(cells[0])} – ${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short' }).format(cells[6])} ${cells[6].getFullYear()}`;
  const monthHeading = monthLabel.format(anchor).replace(/^./, (letter) => letter.toLocaleUpperCase('es'));
  const updateWeekScrollPosition = () => {
    const grid = weekGridRef.current;
    if (!grid) return;
    const firstDay = grid.querySelector<HTMLElement>('.vc-marketing-calendar-day');
    if (!firstDay) return;
    const dayWidth = firstDay.getBoundingClientRect().width;
    const start = Math.min(7, Math.max(1, Math.floor(grid.scrollLeft / dayWidth) + 1));
    const end = Math.min(7, Math.max(start, Math.ceil((grid.scrollLeft + grid.clientWidth) / dayWidth)));
    setWeekScrollPosition({ start, end });
  };
  const scrollWeekByDay = (direction: number) => {
    const grid = weekGridRef.current;
    const firstDay = grid?.querySelector<HTMLElement>('.vc-marketing-calendar-day');
    if (!grid || !firstDay) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    grid.scrollBy({ left: direction * firstDay.getBoundingClientRect().width, behavior });
  };
  useEffect(() => {
    if (view !== 'week' || !weekGridRef.current) return;
    const grid = weekGridRef.current;
    grid.scrollLeft = 0;
    updateWeekScrollPosition();
    const observer = new ResizeObserver(updateWeekScrollPosition);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [view, cells]);
  return <section className={`vc-marketing-calendar is-${view}`} aria-label={`Calendario editorial en vista ${view}`}>
    <header className="vc-marketing-calendar-head">
      <div><span className="eyebrow">PLANIFICACIÓN EDITORIAL</span><h2>{view === 'month' ? monthHeading : `${view === 'kanban' ? 'Kanban semanal' : view === 'table' ? 'Tabla semanal' : isCurrentWeek ? 'Semana actual' : 'Semana'} · ${weekRange}`}</h2><p>{view === 'kanban' ? 'Organiza las publicaciones por etapa. La semana incluye el lunes siguiente para recibir pendientes del fin de semana.' : view === 'table' ? 'Revisa en filas la semana seleccionada y el lunes siguiente. La tabla y Kanban comparten periodo y filtros.' : view === 'week' ? 'Cada día muestra sus publicaciones. Arrastra o elige una imagen, o pégala con Ctrl+V en la tarjeta.' : 'Arrastra una publicación a otra fecha para reprogramarla. Abre ⋯ para ver sus acciones.'}</p></div>
      <div className="vc-marketing-calendar-toolbar"><div className="vc-marketing-calendar-view"><button type="button" className={view==='month'?'active':''} aria-pressed={view==='month'} onClick={()=>{setView('month');setExpandedDate(null);}}>Mes</button><button type="button" className={view==='week'?'active':''} aria-pressed={view==='week'} onClick={()=>{setView('week');setExpandedDate(null);}}>Semana</button><button type="button" className={view==='kanban'?'active':''} aria-pressed={view==='kanban'} onClick={()=>{if(view==='month'){setAnchor(dateFromKey(todayKey));setFollowCurrentWeek(true);}setView('kanban');setExpandedDate(null);}}>Kanban</button><button type="button" className={view==='table'?'active':''} aria-pressed={view==='table'} onClick={openTableView}>Tabla</button></div><div className="vc-marketing-calendar-controls"><DatePicker label="Ir a fecha" value={dateKey(anchor)} onChange={(value)=>{if(!value)return;const [year,month,day]=value.split('-').map(Number);setFollowCurrentWeek(false);setAnchor(new Date(year,month-1,day,12));setExpandedDate(null);}}/><button className="button button-outline" type="button" onClick={()=>{setAnchor(dateFromKey(todayKey));setFollowCurrentWeek(true);setExpandedDate(null);}}>Hoy</button><button className="icon-button" type="button" aria-label="Anterior" onClick={()=>move(-1)}><ChevronLeft size={17}/></button><button className="icon-button" type="button" aria-label="Siguiente" onClick={()=>move(1)}><ChevronRight size={17}/></button><ContextMenu className="vc-calendar-toolbar-context vc-marketing-context-menu" label="Acciones del calendario" actions={calendarActions}><span aria-hidden="true"/></ContextMenu></div></div>
    </header>
    <div className="vc-marketing-kanban-filters" aria-label={`Filtros de publicaciones · ${view === 'month' ? 'mes' : view === 'week' ? 'semana' : 'semana actual'}`}>
      <label><Filter size={14}/><span>Canal</span><select aria-label="Filtrar por canal" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option>Todos los canales</option>{kanbanChannels.map((channel) => <option key={channel}>{channel}</option>)}<option>Canal pendiente</option></select></label>
      <label><span>Responsable</span><select aria-label="Filtrar por responsable" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option>Todos los responsables</option>{kanbanOwners.map((owner) => <option key={owner}>{owner}</option>)}<option>Sin asignar</option></select></label>
      <label><ListFilter size={14}/><span>Estado</span><select aria-label="Filtrar por estado de entrega" value={kanbanStateFilter} onChange={(event) => setKanbanStateFilter(event.target.value as MarketingStateFilter)}><option value="all">Todos los estados</option><option value="pending">Pendientes</option><option value="work">En diseño o producción</option><option value="review">En revisión o aprobadas</option><option value="published">Publicadas</option><option value="finished">Terminadas</option><option value="blocked">Bloqueadas o canceladas</option></select></label>
      <span className="vc-marketing-kanban-result-count" aria-live="polite">{view === 'kanban' || view === 'table' ? kanbanPosts.length : filteredPeriodPosts.length} de {postsInPeriod.length} fichas{view === 'kanban' || view === 'table' ? ` · ${weekStartKey} a ${nextMondayKey}` : ''}</span>
      {(channelFilter !== 'Todos los canales' || ownerFilter !== 'Todos los responsables' || kanbanStateFilter !== 'all') && <button type="button" className="vc-marketing-filter-clear" onClick={() => { setChannelFilter('Todos los canales'); setOwnerFilter('Todos los responsables'); setKanbanStateFilter('all'); }}>Limpiar filtros</button>}
      {view === 'kanban' && <label className="vc-marketing-empty-lanes-toggle"><input type="checkbox" checked={showEmptyKanbanLanes} onChange={(event) => setShowEmptyKanbanLanes(event.target.checked)}/>Mostrar etapas vacías</label>}
    </div>
    {(view === 'month' || view === 'week') && filteredPeriodPosts.length === 0 && <div className="vc-marketing-calendar-empty" role="status">{postsInPeriod.length === 0 ? 'No hay publicaciones en este periodo.' : 'Ninguna publicación coincide con estos filtros. Ajusta los filtros o límpialos para ver resultados.'}</div>}
    {view === 'kanban' ? <>
      <div className="vc-marketing-kanban-rule" role="note"><span><Check size={15}/></span><div><b>Regla de continuidad activa</b><small>Las fichas vencidas sin publicar pasan automáticamente al siguiente día hábil. Si el vencimiento cae sábado o domingo, pasan al lunes. Publicadas, terminadas y canceladas se respetan.{canEdit ? ' También se revisan al abrir el Kanban mientras el proceso diario completa el traslado en segundo plano.' : ' Tu perfil puede consultar la regla; los cambios requieren permiso de edición.'}</small></div></div>
      <div className="vc-marketing-kanban-board" role="list" aria-label={`Kanban semanal · ${weekRange}`}>
        {kanbanPosts.length === 0 && <div className="vc-marketing-calendar-empty" role="status">No hay publicaciones para esta semana con los filtros actuales. Prueba otros filtros o límpialos.</div>}
        {kanbanColumns.map((lane) => {
          const lanePosts = kanbanPosts.filter((post) => laneForStatus(String(post.status || 'Por iniciar')) === lane.key)
            .sort((a, b) => String(a.scheduled_date || '').localeCompare(String(b.scheduled_date || '')) || String(a.scheduled_time || '').localeCompare(String(b.scheduled_time || '')));
          if (!showEmptyKanbanLanes && lanePosts.length === 0) return null;
          return <section key={lane.key} className={`vc-marketing-kanban-column lane-${lane.key.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}${draggingKanban ? ' can-drop' : ''}`} role="listitem" aria-label={`${lane.label}: ${lanePosts.length} publicaciones`}
            onDragOver={(event) => { if (canEdit && draggingKanban) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); const post = weekPosts.find((item) => item.id === (event.dataTransfer.getData('text/plain') || draggingKanban)); if (post && laneForStatus(String(post.status || 'Por iniciar')) !== lane.key) onStatusChange(post, lane.status); setDraggingKanban(null); }}>
            <header className="vc-marketing-kanban-column-head"><div><b>{lane.label}</b><span>{lanePosts.length}</span></div><small>{lane.status}</small></header>
            <div className="vc-marketing-kanban-cards">{lanePosts.length === 0 && <span className="vc-marketing-kanban-empty">Sin fichas en esta etapa</span>}{lanePosts.map((post) => {
              const color = getMarketingCalendarColor(post.calendar_color, post.tags);
              const tags = getMarketingTags(post.tags);
              const artworkProps = { organizationId, post, asset: artworkByPost.get(post.id), canEdit, canDelete, onSaved: onArtworkSaved };
              const formattedDate = new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${post.scheduled_date.slice(0, 10)}T12:00:00`));
              return <ContextMenu key={post.id} className="vc-marketing-kanban-card-context vc-marketing-context-menu" label={`Acciones para ${post.title}`} actions={contextualActions(post)}>
                <article className={`vc-marketing-kanban-card tone-${statusClass(post)}`} style={color ? { '--event-color': color, '--event-tint': `${color}18` } as React.CSSProperties : undefined}>
                  <div className="vc-marketing-kanban-card-top"><time>{formattedDate}{post.scheduled_time ? ` · ${post.scheduled_time}` : ''}</time>{(canEdit || canDelete) && <input type="checkbox" aria-label={`Seleccionar ${post.title}`} checked={selectedIds.has(post.id)} onChange={() => onToggle(post.id)}/>}</div>
                  <button type="button" className="vc-marketing-kanban-card-title" draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData('text/plain', post.id); event.dataTransfer.effectAllowed = 'move'; setDraggingKanban(post.id); }} onDragEnd={() => setDraggingKanban(null)} onClick={() => onSelect(post)} title="Arrastra entre columnas para cambiar la etapa"><GripVertical size={13}/><b>{post.title || 'Sin título'}</b></button>
                  <span className="vc-marketing-kanban-card-topic">{post.content_line || post.next_action || 'Tema y siguiente paso por completar.'}</span>
                  <MarketingPostArtwork {...artworkProps} variant="week"/>
                  <MarketingReadinessIndicators post={post} onChange={(field, checked) => onReadinessChange(post, field, checked)} disabled={!canEdit}/>
                  <div className="vc-marketing-kanban-card-meta"><span><Megaphone size={12}/>{post.platform || 'Canal pendiente'}</span><span>{post.owner || 'Responsable pendiente'}</span></div>
                  <div className="vc-marketing-kanban-card-foot"><span className={`vc-marketing-week-card-status tone-${statusClass(post)}`}>{post.status || 'Por iniciar'}</span>{tags.length > 0 && <div>{tags.slice(0, 2).map((tag) => <Badge key={tag} color={color || undefined} title={`Etiqueta: ${tag}`}>{tag}</Badge>)}</div>}</div>
                </article>
              </ContextMenu>;
            })}</div>
          </section>;
        })}
      </div>
    </> : view === 'table' ? <div className="vc-marketing-table-wrap">
      <table className="vc-marketing-table" aria-label={`Publicaciones de la semana ${weekRange}`}>
        <thead><tr>{(canEdit || canDelete) && <th className="vc-marketing-table-select" scope="col"><span className="vc-sr-only">Seleccionar</span></th>}<th scope="col">Fecha</th><th scope="col">Publicación</th><th scope="col">Canal y formato</th><th scope="col">Responsable</th><th scope="col">Etapa</th><th scope="col">Etiquetas</th><th className="vc-marketing-table-actions" scope="col"><span className="vc-sr-only">Acciones</span></th></tr></thead>
        <tbody>{tablePosts.length === 0 ? <tr><td className="vc-marketing-table-empty" colSpan={(canEdit || canDelete) ? 8 : 7}>No hay publicaciones para este periodo y estos filtros.</td></tr> : tablePosts.map((post) => {
          const color = getMarketingCalendarColor(post.calendar_color, post.tags);
          const tags = getMarketingTags(post.tags);
          const formattedDate = new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${post.scheduled_date.slice(0, 10)}T12:00:00`));
          const artworkProps = { organizationId, post, asset: artworkByPost.get(post.id), canEdit, canDelete, onSaved: onArtworkSaved };
          return <tr key={post.id} className={selectedIds.has(post.id) ? 'is-selected' : ''}>
            {(canEdit || canDelete) && <td className="vc-marketing-table-select"><input type="checkbox" aria-label={`Seleccionar ${post.title}`} checked={selectedIds.has(post.id)} onChange={() => onToggle(post.id)}/></td>}
            <td className="vc-marketing-table-date"><b>{formattedDate}</b><small>{post.scheduled_time || 'Hora pendiente'}</small></td>
            <td className="vc-marketing-table-publication"><div className="vc-marketing-table-publication-main"><div className="vc-marketing-table-artwork"><MarketingPostArtwork {...artworkProps} variant="compact"/></div><div className="vc-marketing-table-publication-copy"><button type="button" onClick={() => onSelect(post)}><b>{post.title || 'Sin título'}</b><small>{post.content_line || post.next_action || 'Tema y siguiente paso por completar.'}</small></button><MarketingReadinessIndicators post={post} onChange={(field, checked) => onReadinessChange(post, field, checked)} disabled={!canEdit}/></div></div></td>
            <td className="vc-marketing-table-channel"><b>{post.platform || 'Canal pendiente'}</b><small>{post.format || 'Formato pendiente'}</small></td>
            <td className="vc-marketing-table-owner">{post.owner || 'Responsable pendiente'}</td>
            <td><span className={`vc-marketing-week-card-status tone-${statusClass(post)}`}>{post.status || 'Por iniciar'}</span></td>
            <td className="vc-marketing-table-tags">{tags.length ? tags.slice(0, 3).map((tag) => <Badge key={tag} color={color || undefined} title={`Etiqueta: ${tag}`}>{tag}</Badge>) : <span>—</span>}</td>
            <td className="vc-marketing-table-actions"><ContextMenu className="vc-marketing-table-context vc-marketing-context-menu" label={`Acciones para ${post.title}`} actions={contextualActions(post)}><span aria-hidden="true"/></ContextMenu></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <>
      {view === 'week' && <div className="vc-marketing-week-scroll-controls"><span aria-live="polite">Días {weekScrollPosition.start}–{weekScrollPosition.end} de 7</span><button type="button" aria-label="Desplazar a los días anteriores" disabled={weekScrollPosition.start <= 1} onClick={() => scrollWeekByDay(-1)}><ChevronLeft size={16}/><span>Anterior</span></button><button type="button" aria-label="Desplazar a los días siguientes" disabled={weekScrollPosition.end >= 7} onClick={() => scrollWeekByDay(1)}><span>Siguiente</span><ChevronRight size={16}/></button></div>}
      <div ref={view === 'week' ? weekGridRef : undefined} onScroll={view === 'week' ? updateWeekScrollPosition : undefined} tabIndex={view === 'week' ? 0 : undefined} className="vc-marketing-calendar-grid" role="grid" aria-label={view === 'month' ? monthHeading : `Semana ${weekRange}. Desplázate horizontalmente para recorrer los siete días.`} style={{'--calendar-cols':view === 'month' ? 8 : 7} as React.CSSProperties}>
      {view === 'month' && <div className="vc-marketing-calendar-weekday vc-marketing-calendar-week-number-heading" role="columnheader" aria-label="Semana del mes">Sem.</div>}{weekdays.map((day)=><div key={day} className="vc-marketing-calendar-weekday" role="columnheader">{day}</div>)}
      {cells.map((date,cellIndex)=>{
        const key=dateKey(date), items=byDate.get(key)||[];
        const inMonth=view==='week'||date.getMonth()===anchor.getMonth();
        const firstDateOfRow = cells.slice(cellIndex - (cellIndex % 7), cellIndex - (cellIndex % 7) + 7);
        const monthRepresentative = firstDateOfRow.find((rowDate) => rowDate.getMonth() === anchor.getMonth() && rowDate.getFullYear() === anchor.getFullYear());
        const weekLabel = weekOfMonth(view === 'month' ? monthRepresentative || date : date);
        const maxVisible=view==='week'?items.length:6;
        const visible=items.slice(0,maxVisible), remaining=items.length-visible.length;
        return <React.Fragment key={key}>{view === 'month' && cellIndex % 7 === 0 && <div className="vc-marketing-calendar-week-number" role="rowheader" aria-label={`Semana ${weekLabel}`}>{weekLabel}</div>}<ContextMenu displayContents trigger={false} className="vc-calendar-day-scope vc-marketing-context-menu" label={`Acciones del ${key}`} actions={dayActions(key)}><div role="gridcell" aria-label={`${key}, ${items.length} publicaciones`} className={`vc-marketing-calendar-day${inMonth?'':' is-outside'}${key===today?' is-today':''}${dragging?' can-drop':''}${expandedDate===key?' is-expanded':''}`} style={{'--calendar-day-index':cellIndex} as React.CSSProperties}
          onDragOver={(event)=>{if(canEdit&&dragging)event.preventDefault();}}
          onDrop={(event)=>{event.preventDefault();const post=posts.find((item)=>item.id===(event.dataTransfer.getData('text/plain')||dragging));if(post&&post.scheduled_date.slice(0,10)!==key)onReschedule(post,key);setDragging(null);}}
          onDragLeave={(event)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))event.currentTarget.classList.remove('is-drop-target');}}
          onDragEnter={(event)=>{if(dragging)event.currentTarget.classList.add('is-drop-target');}}>
          <div className="vc-marketing-calendar-day-head"><span>{date.getDate()}</span>{items.length>0&&<button type="button" className="vc-marketing-calendar-day-agenda-toggle" aria-label={`Abrir agenda del ${key}`} onClick={()=>setExpandedDate(expandedDate===key?null:key)}>{items.length}</button>}{canEdit&&<button type="button" aria-label={`Crear publicación el ${key}`} onClick={()=>onCreate(key)}><Plus size={13}/></button>}</div>
          <div className="vc-marketing-calendar-events">{visible.map((post)=>{
            const color=getMarketingCalendarColor(post.calendar_color,post.tags);
            const tags=getMarketingTags(post.tags);
            const artworkProps={organizationId,post,asset:artworkByPost.get(post.id),canEdit,canDelete,onSaved:onArtworkSaved};
            return <div className={`vc-marketing-event-row${canEdit||canDelete?' is-selectable':''}${view==='week'?' is-week-card':''}`} key={post.id}>
              {(canEdit||canDelete)&&<input className="vc-marketing-event-select" type="checkbox" aria-label={`Seleccionar ${post.title}`} checked={selectedIds.has(post.id)} onChange={()=>onToggle(post.id)}/>}
              {view==='week' ? <ContextMenu className="vc-marketing-event-context vc-marketing-context-menu" label={`Acciones para ${post.title}`} actions={contextualActions(post)}><article className={`vc-marketing-week-card tone-${statusClass(post)}`} style={color?{'--event-color':color,'--event-tint':`${color}18`} as React.CSSProperties:undefined}>
                <div className="vc-marketing-week-card-head"><div>{post.scheduled_time?<time>{post.scheduled_time}</time>:<span>Hora pendiente</span>}<small>{post.platform||'Canal pendiente'}{post.format?` · ${post.format}`:''}</small></div><span className={`vc-marketing-week-card-status tone-${statusClass(post)}`}>{post.status||'Por iniciar'}</span></div>
                <button type="button" draggable={canEdit} onDragStart={(event)=>{event.dataTransfer.setData('text/plain',post.id);event.dataTransfer.effectAllowed='move';setDragging(post.id);}} onDragEnd={()=>setDragging(null)} onClick={()=>onSelect(post)} className="vc-marketing-week-card-title" title="Abrir ficha de publicación"><b>{post.title||'Sin título'}</b><span>{post.content_line||post.next_action||'Tema y siguiente paso por completar.'}</span></button>
                <MarketingPostArtwork {...artworkProps} variant="week"/>
                <MarketingReadinessIndicators post={post} onChange={(field, checked) => onReadinessChange(post, field, checked)} disabled={!canEdit}/>
                <div className="vc-marketing-week-card-foot"><span>{post.owner||'Responsable pendiente'}</span>{tags.length>0&&<div>{tags.slice(0,2).map((tag)=><Badge key={tag} color={color||undefined} title={`Etiqueta: ${tag}`}>{tag}</Badge>)}</div>}</div>
              </article></ContextMenu> : <><MarketingPostArtwork {...artworkProps} variant="compact"/><ContextMenu className="vc-marketing-event-context vc-marketing-context-menu" label={`Acciones para ${post.title}`} actions={contextualActions(post)}><div className={`vc-marketing-calendar-event tone-${statusClass(post)}`} style={color?{'--event-color':color,'--event-tint':`${color}18`} as React.CSSProperties:undefined} title={`${post.title} · ${post.status}${tags.length?` · ${tags.join(', ')}`:''}`}>
                {post.scheduled_time&&<time>{post.scheduled_time}</time>}<button type="button" draggable={canEdit} onDragStart={(event)=>{event.dataTransfer.setData('text/plain',post.id);event.dataTransfer.effectAllowed='move';setDragging(post.id);}} onDragEnd={()=>setDragging(null)} onClick={()=>onSelect(post)} className="vc-marketing-event-label" title="Abrir ficha de publicación">{post.title||'Sin título'}</button><MarketingReadinessIndicators post={post} compact onChange={(field, checked) => onReadinessChange(post, field, checked)} disabled={!canEdit}/><span className={`vc-marketing-event-status tone-${statusClass(post)}`}>{post.status||'Por iniciar'}</span>{tags.length>0&&<Badge color={color||undefined} title={`Etiquetas: ${tags.join(', ')}`}>{tags[0]}</Badge>}
              </div></ContextMenu></>}
            </div>;
          })}{remaining>0&&<button type="button" className="vc-marketing-calendar-more" onClick={()=>setExpandedDate(expandedDate===key?null:key)}>+{remaining} más · ver agenda</button>}</div>
        </div></ContextMenu></React.Fragment>;
      })}
      </div>
    </>}
    {expandedDate&&<section className="vc-marketing-day-agenda" aria-label={`Agenda del ${expandedDate}`}><header><div><span className="eyebrow">AGENDA DEL DÍA</span><b>{new Intl.DateTimeFormat('es-EC',{dateStyle:'full'}).format(new Date(`${expandedDate}T12:00:00`))} · {(byDate.get(expandedDate)||[]).length} publicaciones</b></div><button type="button" className="icon-button" aria-label="Cerrar agenda" onClick={()=>setExpandedDate(null)}><X size={15}/></button></header>{(byDate.get(expandedDate)||[]).map((post)=><article key={post.id}><span className="vc-marketing-agenda-time">{post.scheduled_time||'Sin hora'}</span><button type="button" className="vc-marketing-agenda-title" onClick={()=>onSelect(post)}><b>{post.title}</b><small>{post.platform||'Canal pendiente'} · {post.status}{getMarketingTags(post.tags).length?` · ${getMarketingTags(post.tags).join(', ')}`:''}</small></button><ContextMenu className="vc-marketing-context-menu" label={`Acciones para ${post.title}`} actions={contextualActions(post)}><span/></ContextMenu></article>)}{canEdit&&<button type="button" className="button button-outline" onClick={()=>onCreate(expandedDate)}><Plus size={14}/>Crear publicación</button>}</section>}
    <footer className="vc-marketing-calendar-foot" aria-label="Leyenda de etapas"><span><i className="tone-active"/>Pendiente o planificada</span><span><i className="tone-working"/>En trabajo</span><span><i className="tone-review"/>En revisión</span><span><i className="tone-approved"/>Aprobada o programada</span><span><i className="tone-published"/>Publicada</span><span><i className="tone-completed"/>Terminada</span><span><i className="tone-blocked"/>Bloqueada</span><span><i className="tone-cancelled"/>Cancelada</span>{undated.length>0&&<span className="vc-marketing-undated">{undated.length} sin fecha asignada</span>}</footer>
  </section>;
}
