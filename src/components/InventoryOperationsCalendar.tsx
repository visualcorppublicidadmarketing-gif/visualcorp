import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownUp, CalendarDays, Check, ChevronLeft, ChevronRight,
  ClipboardCheck, Clock3, MapPin, PackageCheck, Plus, Truck, UserRound,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { DatePicker } from './ui/Calendar';
import { Dialog } from './ui/OperationalKit';
import './InventoryOperationsCalendar.css';

type CalendarView = 'month' | 'week' | 'agenda';
type InventoryScope = 'general' | 'visual' | 'giga';
type BranchOption = { id: string; name: string; code?: string };
type LocationOption = { id?: string; branchId: string; code: string; name: string; active?: boolean };
type InventoryItem = {
  id: string; variantId: string; variantSku?: string; sku?: string; name: string; variant?: string;
  branchId: string; branch?: string; location?: string; unit?: string; area?: string;
  customFields?: Record<string, unknown>; archived?: boolean;
};
type EventType = 'count_task' | 'count_session' | 'movement' | 'purchase_receipt';
type CalendarEvent = {
  id: string; type: EventType; date: string; branchId: string; title: string; detail: string;
  status: string; statusKey: string; overdue: boolean; locationCodes: string[]; raw: any; lines: any[];
};

const ZONE = 'America/Guayaquil';
const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (date: Date) => date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
const keyDate = (key: string) => {
  const parts = key.split('-').map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
};
const shiftDate = (key: string, days: number) => {
  const date = keyDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
};
const shiftMonth = (key: string, months: number) => {
  const date = keyDate(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return dateKey(date);
};
const startOfWeek = (key: string) => shiftDate(key, -((keyDate(key).getUTCDay() + 6) % 7));
const inEcuadorDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
};
const todayKey = () => inEcuadorDate(new Date());
const dateLabel = (key: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Intl.DateTimeFormat('es-EC', { ...options, timeZone: ZONE }).format(keyDate(key));
const monthLabel = (key: string) => new Intl.DateTimeFormat('es-EC', {
  month: 'long', year: 'numeric', timeZone: ZONE,
}).format(keyDate(key));
const timestampLabel = (value?: string) => value ? new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: ZONE,
}).format(new Date(value)) : '';
const unique = <T,>(values: T[]) => [...new Set(values)];
const lineKey = (variant: string, location: string) => variant + '|' + (location || 'MAIN');
const locationToken = (branchId: string, code: string) => branchId + '|' + code;
const itemScope = (item: InventoryItem): InventoryScope =>
  String(item.customFields?.brand_scope || 'visual').toLowerCase() === 'giga' ? 'giga' : 'visual';
const itemTitle = (item?: InventoryItem, fallback = '') =>
  item ? item.name + (item.variant ? ' · ' + item.variant : '') : fallback || 'Artículo de inventario';
const isoStart = (key: string) => key + 'T00:00:00-05:00';
const isoEnd = (key: string) => shiftDate(key, 1) + 'T00:00:00-05:00';
const monthGrid = (focus: string) => {
  const first = focus.slice(0, 7) + '-01';
  const offset = (keyDate(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => shiftDate(first, index - offset));
};
const statusLabel = (key: string) => ({
  pending: 'Pendiente', overdue: 'Atrasado', in_progress: 'En curso',
  completed: 'Completado', cancelled: 'Cancelado', recorded: 'Registrado',
}[key] || key.replaceAll('_', ' '));
const eventTypeLabel = (type: EventType) => ({
  count_task: 'Conteo programado', count_session: 'Sesión de conteo',
  movement: 'Movimiento registrado', purchase_receipt: 'Recepción prevista',
}[type]);
const iconFor = (type: EventType) => {
  if (type === 'count_task' || type === 'count_session') return <ClipboardCheck size={14}/>;
  if (type === 'purchase_receipt') return <Truck size={14}/>;
  return <ArrowDownUp size={14}/>;
};
const weekdays = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, 5 + index, 12));
  return new Intl.DateTimeFormat('es-EC', { weekday: 'short', timeZone: ZONE }).format(date).replace('.', '');
});

export type InventoryOperationsCalendarProps = {
  organizationId: string | null;
  branches: BranchOption[];
  locations: LocationOption[];
  items: InventoryItem[];
  brandScope: InventoryScope;
  canManageInventory: boolean;
  canViewPurchases: boolean;
  onNotice: (message: string) => void;
  onStartCount: (result: any) => void;
};

export function InventoryOperationsCalendar({
  organizationId, branches, locations, items, brandScope, canManageInventory, canViewPurchases,
  onNotice, onStartCount,
}: InventoryOperationsCalendarProps) {
  const [view, setView] = useState<CalendarView>('month');
  const [focusDate, setFocusDate] = useState(todayKey);
  const [scopeFilter, setScopeFilter] = useState<InventoryScope>(brandScope || 'general');
  const [branchFilter, setBranchFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | EventType>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [taskRows, setTaskRows] = useState<any[]>([]);
  const [sessionRows, setSessionRows] = useState<any[]>([]);
  const [movementRows, setMovementRows] = useState<any[]>([]);
  const [purchaseRows, setPurchaseRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [assignees, setAssignees] = useState<Array<{ user_id: string; display_name: string }>>([]);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({
    date: focusDate, branchId: '', scopeType: 'all' as 'all' | 'area' | 'location' | 'selected',
    area: '', location: '', assignee: '', note: '', selectedLineKeys: [] as string[],
  });
  const [rescheduleDraft, setRescheduleDraft] = useState({ date: '', assignee: '' });

  const visibleRange = useMemo(() => {
    if (view === 'month') {
      const dates = monthGrid(focusDate);
      return { start: dates[0], end: dates[41] };
    }
    if (view === 'week') {
      const start = startOfWeek(focusDate);
      return { start, end: shiftDate(start, 6) };
    }
    return { start: focusDate, end: focusDate };
  }, [view, focusDate]);
  const visibleDates = useMemo(() => {
    if (view === 'month') return monthGrid(focusDate);
    if (view === 'week') return Array.from({ length: 7 }, (_, index) => shiftDate(startOfWeek(focusDate), index));
    return [focusDate];
  }, [view, focusDate]);
  const dateTitle = view === 'month' ? monthLabel(focusDate) : view === 'week'
    ? dateLabel(visibleRange.start, { day: 'numeric', month: 'short' }) + ' – ' + dateLabel(visibleRange.end, { day: 'numeric', month: 'short', year: 'numeric' })
    : dateLabel(focusDate);
  const branchById = useMemo(() => new Map(branches.map(branch => [branch.id, branch])), [branches]);
  const itemByLine = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) map.set(lineKey(item.variantId, item.location || 'MAIN'), item);
    return map;
  }, [items]);
  const allAreas = useMemo(() => unique(items.filter(item => !item.archived).map(item => item.area || '').filter(Boolean))
    .sort((a, b) => a.localeCompare(b, 'es')), [items]);
  const availableLocations = useMemo(() => locations.filter(location =>
    location.active !== false && (branchFilter === 'all' || location.branchId === branchFilter),
  ), [locations, branchFilter]);

  const reload = useCallback(async () => {
    if (!supabase || !organizationId) return;
    setLoading(true);
    setLoadError('');
    const startAt = isoStart(visibleRange.start);
    const endAt = isoEnd(visibleRange.end);
    const constrainBranch = (query: any) => branchFilter === 'all' ? query : query.eq('branch_id', branchFilter);
    try {
      let tasksQuery = supabase.from('inventory_count_tasks')
        .select('id,organization_id,branch_id,scheduled_for,scope_type,scope_label,assigned_to,note,status,session_id,created_by,created_at,updated_at,inventory_count_task_lines(id,variant_id,location_code,name_snapshot,sku_snapshot,unit_snapshot)')
        .eq('organization_id', organizationId).gte('scheduled_for', visibleRange.start)
        .lte('scheduled_for', visibleRange.end).order('scheduled_for').order('created_at');
      let sessionsQuery = supabase.from('inventory_count_sessions')
        .select('id,organization_id,branch_id,status,note,created_by,opened_at,completed_at,inventory_count_session_lines(id,variant_id,location_code,status,expected_quantity,counted_quantity)')
        .eq('organization_id', organizationId).gte('opened_at', startAt).lt('opened_at', endAt)
        .order('opened_at').limit(1000);
      let movementsQuery = supabase.from('inventory_movements')
        .select('id,variant_id,branch_id,location_code,movement_type,quantity_delta,reason,reference_type,reference_id,created_at')
        .eq('organization_id', organizationId).gte('created_at', startAt).lt('created_at', endAt)
        .order('created_at').limit(1000);
      tasksQuery = constrainBranch(tasksQuery);
      sessionsQuery = constrainBranch(sessionsQuery);
      movementsQuery = constrainBranch(movementsQuery);
      const purchasesQuery = canViewPurchases
        ? constrainBranch(supabase.from('purchase_orders')
          .select('id,order_number,status,branch_id,expected_date,created_at,purchase_order_lines(variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_ordered,quantity_received)')
          .eq('organization_id', organizationId).in('status', ['ordered', 'partially_received'])
          .gte('expected_date', visibleRange.start).lte('expected_date', visibleRange.end)
          .order('expected_date').limit(1000))
        : Promise.resolve({ data: [], error: null } as any);
      const [tasks, sessions, movements, purchases] = await Promise.all([
        tasksQuery, sessionsQuery, movementsQuery, purchasesQuery,
      ]);
      const firstError = [tasks, sessions, movements, purchases].find(result => result.error)?.error;
      setTaskRows(tasks.data || []);
      setSessionRows(sessions.data || []);
      setMovementRows(movements.data || []);
      setPurchaseRows(purchases.data || []);
      if (firstError) setLoadError('Algunos eventos no se pudieron cargar: ' + firstError.message);
    } catch (error: any) {
      setLoadError(error?.message || 'No se pudo cargar el calendario de inventario.');
    } finally {
      setLoading(false);
    }
  }, [organizationId, visibleRange.start, visibleRange.end, branchFilter, canViewPurchases]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (branchFilter !== 'all' && !branches.some(branch => branch.id === branchFilter)) setBranchFilter('all');
  }, [branches, branchFilter]);
  useEffect(() => {
    if (locationFilter !== 'all' && !availableLocations.some(location => location.code === locationFilter)) setLocationFilter('all');
  }, [availableLocations, locationFilter]);
  useEffect(() => {
    if (brandScope) setScopeFilter(brandScope);
  }, [brandScope]);

  const baseEvents = useMemo<CalendarEvent[]>(() => {
    const events: CalendarEvent[] = [];
    const currentDay = todayKey();
    for (const row of taskRows) {
      const lines = row.inventory_count_task_lines || [];
      events.push({
        id: row.id, type: 'count_task', date: row.scheduled_for, branchId: row.branch_id,
        title: row.scope_label || 'Conteo programado',
        detail: lines.length + (lines.length === 1 ? ' artículo' : ' artículos') + ' · ' + (branchById.get(row.branch_id)?.name || 'Sucursal'),
        status: row.status,
        statusKey: row.status === 'scheduled' ? (row.scheduled_for < currentDay ? 'overdue' : 'pending') : row.status,
        overdue: row.status === 'scheduled' && row.scheduled_for < currentDay,
        locationCodes: unique(lines.map((line: any) => locationToken(row.branch_id, line.location_code)).filter(Boolean)),
        raw: row, lines,
      });
    }
    for (const row of sessionRows) {
      const lines = row.inventory_count_session_lines || [];
      const date = inEcuadorDate(row.opened_at);
      events.push({
        id: row.id, type: 'count_session', date, branchId: row.branch_id,
        title: row.status === 'open' ? 'Conteo en curso' : row.status === 'completed' ? 'Conteo completado' : 'Conteo cancelado',
        detail: lines.length + (lines.length === 1 ? ' artículo' : ' artículos') + ' · ' + (branchById.get(row.branch_id)?.name || 'Sucursal'),
        status: row.status, statusKey: row.status === 'open' ? 'in_progress' : row.status,
        overdue: false, locationCodes: unique(lines.map((line: any) => locationToken(row.branch_id, line.location_code)).filter(Boolean)),
        raw: row, lines,
      });
    }
    for (const row of movementRows) {
      const date = inEcuadorDate(row.created_at);
      const item = itemByLine.get(lineKey(row.variant_id, row.location_code || 'MAIN'))
        || items.find(candidate => candidate.variantId === row.variant_id && candidate.branchId === row.branch_id);
      const amount = Math.abs(Number(row.quantity_delta || 0));
      const sign = Number(row.quantity_delta) > 0 ? '+' : '−';
      events.push({
        id: row.id, type: 'movement', date, branchId: row.branch_id,
        title: itemTitle(item, row.reason || row.movement_type),
        detail: row.movement_type.replaceAll('_', ' ') + ' · ' + sign + amount + ' ' + (item?.unit || '')
          + ' · ' + (branchById.get(row.branch_id)?.name || 'Sucursal'),
        status: 'recorded', statusKey: 'recorded', overdue: false,
        locationCodes: row.location_code ? [locationToken(row.branch_id, row.location_code)] : [], raw: row, lines: [],
      });
    }
    for (const row of purchaseRows) {
      const lines = (row.purchase_order_lines || []).filter((line: any) =>
        Number(line.quantity_ordered) > Number(line.quantity_received),
      );
      const date = row.expected_date || '';
      events.push({
        id: row.id, type: 'purchase_receipt', date, branchId: row.branch_id,
        title: 'Recepción · ' + row.order_number,
        detail: (row.status === 'partially_received' ? 'Recepción parcial' : 'Enviada')
          + ' · ' + lines.length + (lines.length === 1 ? ' línea pendiente' : ' líneas pendientes')
          + ' · ' + (branchById.get(row.branch_id)?.name || 'Sucursal'),
        status: row.status, statusKey: date < currentDay ? 'overdue' : 'pending',
        overdue: date < currentDay, locationCodes: [], raw: row, lines,
      });
    }
    return events.filter(event => Boolean(event.date));
  }, [taskRows, sessionRows, movementRows, purchaseRows, items, itemByLine, branchById]);

  const filteredEvents = useMemo(() => baseEvents.filter(event => {
    if (scopeFilter !== 'general') {
      if (event.type === 'movement') {
        const item = items.find(candidate => candidate.variantId === event.raw.variant_id);
        if (!item || itemScope(item) !== scopeFilter) return false;
      } else {
        const matching = event.lines.filter((line: any) => {
          const item = itemByLine.get(lineKey(line.variant_id, line.location_code || 'MAIN'))
            || items.find(candidate => candidate.variantId === line.variant_id);
          return item && itemScope(item) === scopeFilter;
        });
        if (!matching.length) return false;
      }
    }
    if (branchFilter !== 'all' && event.branchId !== branchFilter) return false;
    if (locationFilter !== 'all' && !event.locationCodes.includes(locationFilter)) return false;
    if (typeFilter !== 'all' && event.type !== typeFilter) return false;
    if (statusFilter !== 'all' && event.statusKey !== statusFilter) return false;
    return true;
  }), [baseEvents, scopeFilter, branchFilter, locationFilter, typeFilter, statusFilter, itemByLine, items]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of filteredEvents) map.set(event.date, [...(map.get(event.date) || []), event]);
    for (const values of map.values()) values.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title, 'es'));
    return map;
  }, [filteredEvents]);
  const eventsForDay = (key: string) => eventsByDay.get(key) || [];
  const focusEvents = eventsForDay(focusDate);
  const overdueCount = filteredEvents.filter(event => event.overdue).length;
  const pendingCount = filteredEvents.filter(event => event.type === 'count_task' && event.status === 'scheduled').length;
  const receiptCount = filteredEvents.filter(event => event.type === 'purchase_receipt').length;
  const movementCount = filteredEvents.filter(event => event.type === 'movement').length;

  const move = (amount: number) => setFocusDate(current =>
    view === 'month' ? shiftMonth(current, amount) : shiftDate(current, amount * (view === 'week' ? 7 : 1)),
  );
  const branchLocations = (branchId: string) => locations.filter(location =>
    location.active !== false && location.branchId === branchId,
  );
  const openCreate = () => {
    const defaultBranch = branchFilter !== 'all' ? branchFilter : branches[0]?.id || '';
    const firstLocation = branchLocations(defaultBranch)[0]?.code || 'MAIN';
    setDraft({
      date: focusDate, branchId: defaultBranch, scopeType: 'all',
      area: allAreas[0] || '', location: firstLocation, assignee: '', note: '', selectedLineKeys: [],
    });
    setShowCreate(true);
  };
  const draftBranchItems = useMemo(() => items.filter(item =>
    item.variantId && item.branchId === draft.branchId && !item.archived
      && (scopeFilter === 'general' || itemScope(item) === scopeFilter),
  ), [items, draft.branchId, scopeFilter]);
  const draftSelectedItems = useMemo(() => {
    if (draft.scopeType === 'area') return draftBranchItems.filter(item => item.area === draft.area);
    if (draft.scopeType === 'location') {
      const variants = new Map<string, InventoryItem>();
      for (const item of draftBranchItems) if (!variants.has(item.variantId)) variants.set(item.variantId, item);
      return [...variants.values()].map(item => ({ ...item, location: draft.location || 'MAIN' }));
    }
    if (draft.scopeType === 'selected') {
      const selected = new Set(draft.selectedLineKeys);
      return draftBranchItems.filter(item => selected.has(lineKey(item.variantId, item.location || 'MAIN')));
    }
    const uniqueLines = new Map<string, InventoryItem>();
    for (const item of draftBranchItems) uniqueLines.set(lineKey(item.variantId, item.location || 'MAIN'), item);
    return [...uniqueLines.values()];
  }, [draft.scopeType, draft.area, draft.location, draft.selectedLineKeys, draftBranchItems]);

  const selectedAssigneeBranch = showCreate ? draft.branchId
    : selectedEvent?.type === 'count_task' ? selectedEvent.raw.branch_id : '';
  useEffect(() => {
    let active = true;
    if (!organizationId || !selectedAssigneeBranch
      || (!showCreate && !(selectedEvent?.type === 'count_task' && rescheduleMode))) {
      setAssignees([]);
      return undefined;
    }
    supabase.rpc('list_inventory_count_assignees', {
      p_organization_id: organizationId, p_branch_id: selectedAssigneeBranch,
    }).then(({ data, error }: any) => {
      if (!active) return;
      if (error) {
        setAssignees([]);
        onNotice('No se pudo cargar la lista de responsables: ' + error.message);
      } else setAssignees(data || []);
    });
    return () => { active = false; };
  }, [organizationId, selectedAssigneeBranch, showCreate, selectedEvent?.id, rescheduleMode, onNotice]);
  useEffect(() => {
    let active = true;
    if (!selectedEvent || selectedEvent.type !== 'count_task' || !organizationId) {
      setAuditRows([]);
      return undefined;
    }
    supabase.from('inventory_count_task_events').select('id,event_type,details,note,actor_id,created_at')
      .eq('organization_id', organizationId).eq('task_id', selectedEvent.id)
      .order('created_at', { ascending: false }).limit(30)
      .then(({ data, error }: any) => { if (active) setAuditRows(error ? [] : data || []); });
    return () => { active = false; };
  }, [organizationId, selectedEvent?.id, selectedEvent?.type]);

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || !canManageInventory || !draft.branchId || actionBusy) return;
    if (!draftSelectedItems.length) {
      onNotice('El alcance no contiene artículos activos. Ajusta la sucursal, el área o la selección.');
      return;
    }
    const scopeLabel = draft.scopeType === 'all' ? 'Inventario completo de la sucursal'
      : draft.scopeType === 'area' ? 'Área · ' + draft.area
        : draft.scopeType === 'location' ? 'Ubicación · ' + draft.location : 'Artículos seleccionados';
    const lines = draftSelectedItems.map(item => ({
      variant_id: item.variantId, location_code: item.location || 'MAIN',
      name_snapshot: item.name, sku_snapshot: item.variantSku || item.sku || '',
      unit_snapshot: item.unit || '',
    }));
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc('create_inventory_count_task', {
        p_organization_id: organizationId, p_branch_id: draft.branchId,
        p_scheduled_for: draft.date, p_scope_type: draft.scopeType,
        p_scope_label: scopeLabel, p_lines: lines,
        p_assigned_to: draft.assignee || null, p_note: draft.note.trim(),
      });
      if (error) throw error;
      setShowCreate(false);
      await reload();
      onNotice('Conteo programado para el ' + dateLabel(draft.date) + '. La existencia no cambió.');
    } catch (error: any) {
      onNotice('No se pudo programar el conteo: ' + (error?.message || 'Error desconocido'));
    } finally {
      setActionBusy(false);
    }
  };

  const openEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setRescheduleMode(false);
    setConfirmCancel(false);
    if (event.type === 'count_task') setRescheduleDraft({ date: event.date, assignee: event.raw.assigned_to || '' });
  };
  const startTask = async () => {
    if (!selectedEvent || selectedEvent.type !== 'count_task' || !canManageInventory || actionBusy) return;
    setActionBusy(true);
    try {
      const { data, error } = await supabase.rpc('start_inventory_count_task', { p_task_id: selectedEvent.id });
      if (error) throw error;
      setSelectedEvent(null);
      await reload();
      onStartCount(data);
    } catch (error: any) {
      onNotice('No se pudo iniciar el conteo: ' + (error?.message || 'Error desconocido'));
    } finally {
      setActionBusy(false);
    }
  };
  const rescheduleTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEvent || selectedEvent.type !== 'count_task' || !canManageInventory || actionBusy) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc('reschedule_inventory_count_task', {
        p_task_id: selectedEvent.id, p_scheduled_for: rescheduleDraft.date,
        p_assigned_to: rescheduleDraft.assignee || null,
        p_note: 'Programación actualizada desde el calendario.',
      });
      if (error) throw error;
      setRescheduleMode(false);
      setSelectedEvent(null);
      await reload();
      onNotice('Programación guardada y registrada en la auditoría.');
    } catch (error: any) {
      onNotice('No se pudo reprogramar: ' + (error?.message || 'Error desconocido'));
    } finally {
      setActionBusy(false);
    }
  };
  const cancelTask = async () => {
    if (!selectedEvent || selectedEvent.type !== 'count_task' || !canManageInventory || actionBusy) return;
    setActionBusy(true);
    try {
      const { error } = await supabase.rpc('cancel_inventory_count_task', {
        p_task_id: selectedEvent.id, p_note: 'Cancelado desde el calendario de inventario.',
      });
      if (error) throw error;
      setSelectedEvent(null);
      await reload();
      onNotice('Conteo cancelado. La existencia y el historial físico permanecen intactos.');
    } catch (error: any) {
      onNotice('No se pudo cancelar el conteo: ' + (error?.message || 'Error desconocido'));
    } finally {
      setActionBusy(false);
    }
  };

  const renderEvent = (event: CalendarEvent, compact = false) => <button
    key={event.type + '-' + event.id}
    className={'inventory-calendar-event event-' + event.type + ' status-' + event.statusKey}
    type="button" onClick={() => openEvent(event)}
    title={eventTypeLabel(event.type) + ' · ' + event.title}
  >
    <span className="inventory-calendar-event-icon">{iconFor(event.type)}</span>
    <span className="inventory-calendar-event-copy"><b>{event.title}</b>{!compact && <small>{event.detail}</small>}</span>
    {event.overdue && <span className="inventory-calendar-overdue-dot" aria-label="Atrasado"><AlertTriangle size={12}/></span>}
  </button>;
  const renderDayCell = (key: string, index: number) => {
    const dateEvents = eventsForDay(key);
    const inMonth = key.slice(0, 7) === focusDate.slice(0, 7);
    const classes = 'inventory-calendar-day' + (inMonth ? '' : ' is-outside')
      + (key === focusDate ? ' is-selected' : '') + (key === todayKey() ? ' is-today' : '');
    return <div className={classes} key={key} role="gridcell" aria-selected={key === focusDate}>
      <div className="inventory-calendar-day-heading">
        <button type="button" className="inventory-calendar-day-select"
          aria-label={dateLabel(key) + (dateEvents.length ? ', ' + dateEvents.length + ' eventos' : '')}
          onClick={() => setFocusDate(key)}><span>{keyDate(key).getUTCDate()}</span>{dateEvents.length > 0 && <small>{dateEvents.length}</small>}</button>
        {view === 'week' && <span className="inventory-calendar-weekday">{weekdays[index]}</span>}
      </div>
      <div className="inventory-calendar-day-events">
        {dateEvents.slice(0, view === 'month' ? 3 : 6).map(event => renderEvent(event, view === 'month'))}
        {dateEvents.length > (view === 'month' ? 3 : 6) && <button className="inventory-calendar-overflow" type="button" onClick={() => setFocusDate(key)}>
          +{dateEvents.length - (view === 'month' ? 3 : 6)} más · ver día
        </button>}
      </div>
    </div>;
  };

  const selectedTask = selectedEvent?.type === 'count_task' ? selectedEvent.raw : null;
  const selectedPurchase = selectedEvent?.type === 'purchase_receipt' ? selectedEvent.raw : null;
  const selectedMovement = selectedEvent?.type === 'movement' ? selectedEvent.raw : null;
  const selectedSession = selectedEvent?.type === 'count_session' ? selectedEvent.raw : null;
  const selectedLineKeys = new Set(draft.selectedLineKeys);
  const toggleLine = (key: string, checked: boolean) => setDraft(current => ({
    ...current, selectedLineKeys: checked
      ? unique([...current.selectedLineKeys, key])
      : current.selectedLineKeys.filter(value => value !== key),
  }));
  const locationsForDraft = locations.filter(location =>
    location.active !== false && location.branchId === draft.branchId,
  );

  return <section className="inventory-operations-calendar" data-view={view} aria-label="Calendario operativo del inventario">
    <header className="inventory-calendar-heading">
      <div><span className="eyebrow">AGENDA OPERATIVA</span><h2>Calendario de inventario</h2>
        <p>Conteos, movimientos registrados y recepciones previstas. Los eventos futuros no cambian el saldo disponible.</p></div>
      {canManageInventory && <button className="button button-dark" type="button" onClick={openCreate}><Plus size={15}/> Programar conteo</button>}
    </header>
    <div className="inventory-calendar-toolbar">
      <div className="inventory-calendar-view-switch" role="group" aria-label="Vista del calendario">
        {(['month', 'week', 'agenda'] as CalendarView[]).map(option => <button key={option} type="button"
          aria-pressed={view === option} onClick={() => setView(option)}>
          {option === 'month' ? 'Mes' : option === 'week' ? 'Semana' : 'Agenda'}
        </button>)}
      </div>
      <div className="inventory-calendar-date-tools">
        <DatePicker value={focusDate} onChange={setFocusDate} label="Fecha del calendario"/>
        <button className="button button-outline" type="button" onClick={() => setFocusDate(todayKey())}>Hoy</button>
        <button className="inventory-calendar-nav" type="button" aria-label="Periodo anterior" onClick={() => move(-1)}><ChevronLeft size={17}/></button>
        <button className="inventory-calendar-nav" type="button" aria-label="Periodo siguiente" onClick={() => move(1)}><ChevronRight size={17}/></button>
      </div>
      <h3 className="inventory-calendar-period">{dateTitle}</h3>
    </div>
    <div className="inventory-calendar-filters" aria-label="Filtros del calendario">
      <label><span>Inventario</span><select value={scopeFilter} onChange={event => setScopeFilter(event.target.value as InventoryScope)}>
        <option value="general">General · Visual + Giga</option><option value="visual">Visual</option><option value="giga">Giga</option>
      </select></label>
      <label><span>Sucursal</span><select value={branchFilter} onChange={event => setBranchFilter(event.target.value)}>
        <option value="all">Todas las sucursales</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select></label>
      <label><span>Ubicación</span><select value={locationFilter} onChange={event => setLocationFilter(event.target.value)}>
        <option value="all">Todas las ubicaciones</option>{availableLocations.map(location =>
          <option key={location.branchId + '-' + location.code} value={locationToken(location.branchId, location.code)}>{location.code} · {location.name}{branchFilter === 'all' ? ' · ' + (branchById.get(location.branchId)?.name || 'Sucursal') : ''}</option>)}
      </select></label>
      <label><span>Tipo de evento</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value as any)}>
        <option value="all">Todos los eventos</option><option value="count_task">Conteos programados</option>
        <option value="count_session">Sesiones de conteo</option><option value="movement">Movimientos</option>
        {canViewPurchases && <option value="purchase_receipt">Recepciones previstas</option>}
      </select></label>
      <label><span>Estado</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
        <option value="all">Todos los estados</option><option value="pending">Pendiente</option>
        <option value="in_progress">En curso</option><option value="completed">Completado</option>
        <option value="recorded">Registrado</option><option value="overdue">Atrasado</option><option value="cancelled">Cancelado</option>
      </select></label>
      <span className="inventory-calendar-result-count">{filteredEvents.length} eventos</span>
    </div>
    <div className="inventory-calendar-summary">
      <article><span>Conteos pendientes</span><b>{pendingCount}</b></article>
      {canViewPurchases && <article><span>Recepciones previstas</span><b>{receiptCount}</b></article>}
      <article><span>Movimientos del periodo</span><b>{movementCount}</b></article>
      {overdueCount > 0 && <article className="is-overdue"><span>Requieren atención</span><b><AlertTriangle size={15}/>{overdueCount}</b></article>}
    </div>
    {loadError && <div className="inventory-calendar-alert" role="status"><AlertTriangle size={16}/><span>{loadError}</span>
      <button type="button" onClick={() => void reload()}>Reintentar</button></div>}
    {loading && <div className="inventory-calendar-loading"><span className="inventory-calendar-spinner"/><span>Actualizando operaciones…</span></div>}
    {!loading && !filteredEvents.length && !loadError && <div className="inventory-calendar-empty">
      <CalendarDays size={22}/><b>No hay eventos para estos filtros</b>
      <span>Prueba otra fecha o programa un conteo para organizar el próximo recorrido.</span>
      {canManageInventory && <button className="button button-outline" type="button" onClick={openCreate}><Plus size={14}/> Programar conteo</button>}
    </div>}
    {view === 'month' && <div className="inventory-calendar-month" role="grid" aria-label={'Calendario del mes ' + monthLabel(focusDate)}>
      <div className="inventory-calendar-weekdays" role="row">{weekdays.map(name => <span role="columnheader" key={name}>{name}</span>)}</div>
      <div className="inventory-calendar-month-grid">{visibleDates.map(renderDayCell)}</div>
    </div>}
    {view === 'week' && <div className="inventory-calendar-week" role="grid" aria-label={'Semana de ' + dateLabel(visibleRange.start)}>
      <div className="inventory-calendar-week-grid">{visibleDates.map(renderDayCell)}</div>
    </div>}
    {view === 'agenda' && <div className="inventory-calendar-agenda">
      <h3><CalendarDays size={17}/><span>{dateLabel(focusDate)}</span><small>{focusEvents.length} eventos</small></h3>
      {focusEvents.length ? focusEvents.map(event => renderEvent(event)) : <div className="inventory-calendar-agenda-empty">No hay operaciones registradas para esta fecha.</div>}
    </div>}
    <div className="inventory-calendar-mobile-agenda">
      <h3><CalendarDays size={16}/><span>{dateLabel(focusDate)}</span><small>{focusEvents.length} eventos</small></h3>
      {focusEvents.length ? focusEvents.map(event => renderEvent(event)) : <p>Sin eventos para este día.</p>}
    </div>
    {overdueCount > 0 && <p className="inventory-calendar-rule"><Clock3 size={14}/> Los conteos vencidos y las recepciones atrasadas conservan su fecha original hasta que se reprogramen o registren.</p>}

    <Dialog open={showCreate} onOpenChange={setShowCreate} title="Programar conteo físico"
      description="Guarda el alcance ahora; al iniciar se tomará el saldo real como referencia. Programar no modifica existencias."
      footer={<><button className="button button-outline" type="button" onClick={() => setShowCreate(false)}>Cancelar</button>
        <button className="button button-dark" type="submit" form="inventory-count-task-form" disabled={actionBusy || !draftSelectedItems.length}>
          {actionBusy ? 'Guardando…' : 'Programar ' + draftSelectedItems.length + ' líneas'}</button></>}>
      <form id="inventory-count-task-form" className="inventory-calendar-form" onSubmit={createTask}>
        <label className="inventory-calendar-field">Fecha del conteo<DatePicker value={draft.date}
          onChange={date => setDraft(current => ({ ...current, date }))} label="Fecha del conteo"/></label>
        <label className="inventory-calendar-field">Sucursal<select required value={draft.branchId}
          onChange={event => setDraft(current => ({ ...current, branchId: event.target.value,
            location: locations.find(location => location.branchId === event.target.value && location.active !== false)?.code || 'MAIN',
            selectedLineKeys: [] }))}>
          <option value="">Seleccionar sucursal</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select></label>
        <label className="inventory-calendar-field">Alcance<select value={draft.scopeType}
          onChange={event => setDraft(current => ({ ...current, scopeType: event.target.value as any, selectedLineKeys: [] }))}>
          <option value="all">Todos los artículos de la sucursal</option><option value="area">Un área</option>
          <option value="location">Una ubicación</option><option value="selected">Artículos específicos</option>
        </select></label>
        {draft.scopeType === 'area' && <label className="inventory-calendar-field">Área<select required value={draft.area}
          onChange={event => setDraft(current => ({ ...current, area: event.target.value }))}>
          {allAreas.map(area => <option key={area} value={area}>{area}</option>)}</select></label>}
        {draft.scopeType === 'location' && <label className="inventory-calendar-field">Ubicación<select required value={draft.location}
          onChange={event => setDraft(current => ({ ...current, location: event.target.value }))}>
          {locationsForDraft.map(location => <option key={location.code} value={location.code}>{location.code} · {location.name}</option>)}
        </select></label>}
        {draft.scopeType === 'selected' && <fieldset className="inventory-calendar-line-picker">
          <legend>Artículos y ubicaciones ({draft.selectedLineKeys.length} seleccionados)</legend>
          <div>{draftBranchItems.map(item => {
            const key = lineKey(item.variantId, item.location || 'MAIN');
            return <label key={key}><input type="checkbox" checked={selectedLineKeys.has(key)}
              onChange={event => toggleLine(key, event.target.checked)}/><span>
              <b>{item.name}{item.variant ? ' · ' + item.variant : ''}</b>
              <small>{item.variantSku || item.sku} · {item.location || 'MAIN'} · {item.unit || 'unidad'}</small>
            </span></label>;
          })}{!draftBranchItems.length && <small>No hay artículos activos en esta sucursal con el filtro seleccionado.</small>}</div>
        </fieldset>}
        <div className="inventory-calendar-scope-preview"><PackageCheck size={17}/><span>
          <b>{draftSelectedItems.length} líneas en el alcance</b>
          <small>Se guardan las variantes y ubicaciones elegidas para que el plan no cambie con el catálogo.</small>
        </span></div>
        <label className="inventory-calendar-field">Responsable (opcional)<select value={draft.assignee}
          onChange={event => setDraft(current => ({ ...current, assignee: event.target.value }))}>
          <option value="">Sin asignar</option>{assignees.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}
        </select></label>
        <label className="inventory-calendar-field">Nota para el equipo<textarea maxLength={1000} rows={3}
          value={draft.note} onChange={event => setDraft(current => ({ ...current, note: event.target.value }))}
          placeholder="Qué revisar o tener preparado antes del conteo…"/></label>
      </form>
    </Dialog>

    <Dialog open={Boolean(selectedEvent)} onOpenChange={open => {
      if (!open) { setSelectedEvent(null); setRescheduleMode(false); setConfirmCancel(false); }
    }} title={selectedEvent ? eventTypeLabel(selectedEvent.type) : 'Detalle del evento'}
      description={selectedEvent ? dateLabel(selectedEvent.date) + ' · ' + (branchById.get(selectedEvent.branchId)?.name || 'Sucursal') : undefined}
      footer={selectedTask && selectedTask.status === 'scheduled' && canManageInventory
        ? <div className="inventory-calendar-detail-actions">
          {!confirmCancel && <><button type="button" className="button button-outline" onClick={() => setRescheduleMode(current => !current)}>{rescheduleMode ? 'Cerrar edición' : 'Reprogramar'}</button>
            <button type="button" className="button button-danger" onClick={() => setConfirmCancel(true)}>Cancelar conteo</button>
            <button type="button" className="button button-dark" onClick={startTask} disabled={actionBusy}><Check size={14}/>{actionBusy ? 'Iniciando…' : 'Iniciar conteo'}</button></>}
          {confirmCancel && <><span>¿Cancelar este conteo pendiente?</span>
            <button type="button" className="button button-outline" onClick={() => setConfirmCancel(false)}>Conservar</button>
            <button type="button" className="button button-danger" onClick={cancelTask} disabled={actionBusy}>{actionBusy ? 'Cancelando…' : 'Confirmar cancelación'}</button></>}
        </div>
        : <button className="button button-outline" type="button" onClick={() => setSelectedEvent(null)}>Cerrar</button>}>
      {selectedEvent && <div className="inventory-calendar-detail">
        <div className={'inventory-calendar-detail-status status-' + selectedEvent.statusKey}>
          <span>{statusLabel(selectedEvent.statusKey)}</span>{selectedEvent.overdue && <b><AlertTriangle size={13}/> Atrasado</b>}
        </div>
        <h3>{selectedEvent.title}</h3><p>{selectedEvent.detail}</p>
        {selectedTask && <>
          <div className="inventory-calendar-detail-facts">
            <span><MapPin size={14}/>{selectedTask.scope_label}</span>
            <span><UserRound size={14}/>{assignees.find(person => person.user_id === selectedTask.assigned_to)?.display_name || 'Sin responsable'}</span>
            <span><PackageCheck size={14}/>{selectedEvent.lines.length} líneas guardadas</span>
          </div>
          {selectedTask.note && <p className="inventory-calendar-note">{selectedTask.note}</p>}
          {rescheduleMode && selectedTask.status === 'scheduled' && <form className="inventory-calendar-reschedule" onSubmit={rescheduleTask}>
            <label>Fecha<DatePicker value={rescheduleDraft.date} onChange={date => setRescheduleDraft(current => ({ ...current, date }))} label="Nueva fecha del conteo"/></label>
            <label>Responsable<select value={rescheduleDraft.assignee} onChange={event => setRescheduleDraft(current => ({ ...current, assignee: event.target.value }))}>
              <option value="">Sin asignar</option>{assignees.map(person => <option key={person.user_id} value={person.user_id}>{person.display_name}</option>)}
            </select></label>
            <button className="button button-dark" type="submit" disabled={actionBusy}>{actionBusy ? 'Guardando…' : 'Guardar cambios'}</button>
          </form>}
          <section className="inventory-calendar-audit"><h4>Actividad del conteo</h4>
            {auditRows.length ? auditRows.map(row => <article key={row.id}><span>{statusLabel(row.event_type)}</span>
              <time>{timestampLabel(row.created_at)}</time>{row.note && <small>{row.note}</small>}</article>)
              : <p>Sin cambios de programación registrados.</p>}
          </section>
        </>}
        {selectedSession && <div className="inventory-calendar-detail-facts">
          <span><PackageCheck size={14}/>{selectedEvent.lines.length} artículos</span>
          <span><Clock3 size={14}/>Abierta {timestampLabel(selectedSession.opened_at)}</span>
          {selectedSession.completed_at && <span><Check size={14}/>Cerrada {timestampLabel(selectedSession.completed_at)}</span>}
        </div>}
        {selectedMovement && <div className="inventory-calendar-detail-facts">
          <span><MapPin size={14}/>{selectedMovement.location_code || 'MAIN'}</span>
          <span><Clock3 size={14}/>{timestampLabel(selectedMovement.created_at)}</span>
          {selectedMovement.reason && <span>{selectedMovement.reason}</span>}
        </div>}
        {selectedPurchase && <>
          <div className="inventory-calendar-receipt-lines">{selectedEvent.lines.map((line: any) => {
            const remaining = Math.max(0, Number(line.quantity_ordered) - Number(line.quantity_received));
            return <article key={selectedPurchase.id + '-' + line.variant_id}>
              <b>{line.description_snapshot}</b>
              <small>{line.sku_snapshot} · {line.quantity_received} recibidas de {line.quantity_ordered} · faltan {remaining} {line.unit_snapshot}</small>
            </article>;
          })}</div>
          <p className="inventory-calendar-location-note">La orden todavía no define la ubicación de recepción. El saldo cambia cuando se registra su recepción en Compras.</p>
          <a className="button button-outline" href="/operaciones/compras">Abrir Compras <ChevronRight size={14}/></a>
        </>}
      </div>}
    </Dialog>
  </section>;
}
