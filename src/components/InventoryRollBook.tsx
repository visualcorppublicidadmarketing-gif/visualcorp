import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownToLine, ArrowRightLeft, Check, CircleHelp, Clock3, Disc3, History, LoaderCircle, MapPin, Plus, RefreshCw, Ruler, Scissors, Search, Warehouse, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { Dialog } from './ui/OperationalKit';
import './InventoryRollBook.css';

type Branch = { id: string; name: string };
type InventoryItem = {
  id?: string;
  variantId?: string;
  remoteItemId?: string;
  branchId?: string | null;
  branch?: string;
  name?: string;
  variant?: string;
  variantSku?: string;
  sku?: string;
  unit?: string;
  category?: string;
  itemType?: string;
  tags?: string[];
  location?: string;
  variantAttributes?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  archived?: boolean;
  rollGroupId?: string;
  groupId?: string;
  categoryId?: string;
  inventoryGroupId?: string;
};
type Roll = {
  id: string;
  organization_id: string;
  branch_id: string;
  variant_id: string;
  location_code: string;
  machine_name: string;
  material_name: string;
  roll_tag: string;
  standard_length_m: number | null;
  nominal_width_cm: number | null;
  remaining_m: number | null;
  remaining_percent: number | null;
  remaining_is_estimate: boolean;
  roll_state: 'bodega' | 'machine';
  status: string;
  operator_name: string;
  notes: string;
  last_measured_at: string;
  updated_at: string;
};
type RollLog = { id: string; event_type: string; previous_m: number | null; new_m: number | null; previous_state: string | null; new_state: string | null; reason: string; work_reference: string; operator_name: string; recorded_at: string; notes: string };
type LocationOption = { code: string; name: string };

type Props = {
  organizationId: string;
  branches: Branch[];
  canEdit: boolean;
  onNotice?: (message: string) => void;
  operatorDefaultName?: string;
  inventoryItems: InventoryItem[];
  rollGroupId: string | null;
  onRefreshInventory?: () => Promise<void> | void;
  availableMachines?: string[];
};

const unitIsMeters = (unit = '') => /^(m|metro|metros|metro lineal|metros lineales)$/i.test(unit.trim());
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String((error as { message?: string })?.message || 'Ocurrió un error inesperado.');
const formatNumber = (value: number, digits = 2) => new Intl.NumberFormat('es-EC', { maximumFractionDigits: digits }).format(value);
const LOW_ROLL_PERCENT = 20;
const rollColumns = 'id,organization_id,branch_id,variant_id,location_code,machine_name,material_name,material_family,roll_tag,standard_length_m,nominal_width_cm,remaining_m,remaining_percent,remaining_is_estimate,roll_state,status,operator_name,notes,last_measured_at,created_at,updated_at';

export function InventoryRollBook({
  organizationId,
  branches,
  canEdit,
  onNotice,
  operatorDefaultName = '',
  inventoryItems = [],
  rollGroupId,
  onRefreshInventory,
  availableMachines = [],
}: Props) {
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('all');
  const [stateFilter, setStateFilter] = useState<'todos' | 'bodega' | 'machine' | 'agotado' | 'bajo' | 'estimado'>('todos');
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [showReceive, setShowReceive] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [activeLocations, setActiveLocations] = useState<LocationOption[]>([]);
  const [equipmentMachines, setEquipmentMachines] = useState<string[]>([]);
  const [historyRoll, setHistoryRoll] = useState<Roll | null>(null);
  const [historyRows, setHistoryRows] = useState<RollLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [expandedToolsRollId, setExpandedToolsRollId] = useState<string | null>(null);
  const measurementInputRef = useRef<HTMLInputElement>(null);
  const [replaceConfirmId, setReplaceConfirmId] = useState('');
  const [form, setForm] = useState({ variantId: '', width: '', nominal: '', remainingMode: 'meters' as 'meters' | 'percent', remaining: '', percent: '', location: 'MAIN', tag: '', operator: operatorDefaultName, reason: '', reference: '' });
  const [measurement, setMeasurement] = useState<Record<string, { meters: string; reason: string; reference: string }>>({});
  const [actions, setActions] = useState<Record<string, { machine: string; reason: string; reference: string }>>({});

  const rollItems = useMemo(() => {
    const candidates = inventoryItems.filter((item) => !item.archived && item.variantId && unitIsMeters(item.unit));
    const groupKey = String(rollGroupId || '').trim().toLowerCase();
    if (!groupKey) return candidates.filter((item) => /lona|vinil|papel|rollo|bobina/i.test(`${item.name} ${item.category} ${item.itemType} ${(item.tags || []).join(' ')}`));
    const matched = candidates.filter((item) => {
      const keys = [item.rollGroupId, item.groupId, item.inventoryGroupId, item.categoryId, item.remoteItemId, item.category, item.name, item.itemType, ...(item.tags || [])]
        .filter(Boolean).map((value) => String(value).trim().toLowerCase());
      return item.customFields?.inventory_model === 'roll' && keys.includes(groupKey);
    });
    return matched;
  }, [inventoryItems, rollGroupId]);

  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name || 'Sucursal';
  const loadRolls = useCallback(async () => {
    if (!supabase || !organizationId) { setLoading(false); setLoadError('No hay conexión con el inventario.'); return; }
    setLoading(true);
    setLoadError('');
    try {
      let query = supabase.from('inventory_active_rolls').select(rollColumns).eq('organization_id', organizationId);
      const allowedBranchIds = branches.map((branch) => branch.id).filter(Boolean);
      if (branchId === 'all' && allowedBranchIds.length) query = query.in('branch_id', allowedBranchIds);
      else if (branchId !== 'all') query = query.eq('branch_id', branchId);
      const { data, error } = await query.order('roll_state').order('remaining_m', { ascending: true }).order('created_at', { ascending: false });
      if (error) throw error;
      setRolls((data || []) as Roll[]);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      onNotice?.(`No se pudieron cargar los rollos: ${message}`);
    } finally { setLoading(false); }
  }, [organizationId, branchId, branches, onNotice]);

  useEffect(() => {
    void loadRolls();
    if (!supabase || !organizationId) { setRealtimeState('offline'); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`inventory-roll-book:${organizationId}:${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_active_rolls', filter: `organization_id=eq.${organizationId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void loadRolls(); }, 250);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_roll_logs', filter: `organization_id=eq.${organizationId}` }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void loadRolls(); }, 250);
      })
      .subscribe((status) => setRealtimeState(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'offline' : 'connecting'));
    return () => { if (timer) clearTimeout(timer); void supabase?.removeChannel(channel); };
  }, [organizationId, branchId, loadRolls]);

  useEffect(() => {
    if (!supabase || !organizationId || branchId === 'all') { setActiveLocations([]); return; }
    let active = true;
    void supabase.from('inventory_locations').select('code,name').eq('organization_id', organizationId).eq('branch_id', branchId).eq('active', true).order('name')
      .then(({ data, error }) => {
        if (!active || error) return;
        const next = (data || []) as LocationOption[];
        setActiveLocations(next);
        setForm((current) => ({ ...current, location: next.some((location) => location.code === current.location) ? current.location : next[0]?.code || '' }));
      });
    return () => { active = false; };
  }, [organizationId, branchId]);

  useEffect(() => {
    if (!supabase || !organizationId) { setEquipmentMachines([]); return; }
    let active = true;
    let query = supabase.from('equipment_assets').select('name,equipment_type,status,branch_id').eq('organization_id', organizationId).neq('status', 'Retirado');
    if (branchId !== 'all') query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    void query.order('name').then(({ data, error }) => {
      if (!active || error) return;
      const values = (data || []).filter((asset: any) => /impresora|plotter|sublim|calandra|imprenta/i.test(`${asset.name} ${asset.equipment_type}`)).map((asset: any) => String(asset.name || '').trim()).filter(Boolean);
      setEquipmentMachines([...new Set(values)]);
    });
    return () => { active = false; };
  }, [organizationId, branchId]);

  const groupVariantIds = useMemo(() => new Set(rollItems.map((item) => item.variantId).filter((id): id is string => Boolean(id))), [rollItems]);
  const visibleRolls = useMemo(() => rolls.filter((roll) => {
    if (!groupVariantIds.has(roll.variant_id)) return false;
    if (machineFilter !== 'all' && roll.machine_name !== machineFilter) return false;
    if (locationFilter !== 'all' && roll.location_code !== locationFilter) return false;
    const nominal = Number(roll.standard_length_m || 0);
    const percent = nominal > 0 ? Number(roll.remaining_m || 0) / nominal * 100 : null;
    if (stateFilter === 'agotado' && roll.status !== 'agotado') return false;
    if (stateFilter === 'bajo' && (roll.status === 'agotado' || percent === null || percent > LOW_ROLL_PERCENT)) return false;
    if (stateFilter === 'estimado' && !roll.remaining_is_estimate) return false;
    if (stateFilter === 'bodega' && roll.roll_state !== 'bodega') return false;
    if (stateFilter === 'machine' && roll.roll_state !== 'machine') return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${roll.material_name} ${roll.roll_tag} ${roll.machine_name} ${roll.variant_id}`.toLowerCase().includes(needle);
  }), [rolls, groupVariantIds, machineFilter, locationFilter, stateFilter, search]);

  const scopedRolls = useMemo(() => rolls.filter((roll) => groupVariantIds.has(roll.variant_id)), [rolls, groupVariantIds]);
  const lowRolls = scopedRolls.filter((roll) => {
    if (roll.status === 'agotado') return false;
    return roll.standard_length_m !== null && Number(roll.standard_length_m) > 0 && Number(roll.remaining_m || 0) / Number(roll.standard_length_m) * 100 <= LOW_ROLL_PERCENT;
  });
  const exhaustedCount = scopedRolls.filter((roll) => roll.status === 'agotado' || Number(roll.remaining_m || 0) <= 0).length;
  const estimatedCount = scopedRolls.filter((roll) => roll.remaining_is_estimate).length;
  const warehouseMeters = scopedRolls.filter((roll) => roll.roll_state === 'bodega').reduce((sum, roll) => sum + Number(roll.remaining_m || 0), 0);
  const machines = [...new Set(scopedRolls.map((roll) => roll.machine_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const availableMachineNames = [...new Set([...equipmentMachines, ...availableMachines, ...machines])].sort((a, b) => a.localeCompare(b, 'es'));
  const locations = [...new Set(scopedRolls.map((roll) => roll.location_code).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  useEffect(() => {
    if (expandedToolsRollId) measurementInputRef.current?.focus();
  }, [expandedToolsRollId]);

  const submitReceive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !supabase || busy) return;
    const selected = rollItems.find((item) => item.variantId === form.variantId);
    const width = Number(form.width);
    const nominal = form.nominal.trim() ? Number(form.nominal) : null;
    const remaining = Number(form.remaining);
    const percent = Number(form.percent);
    if (!selected || !branchId || branchId === 'all') return onNotice?.('Selecciona un material y una sucursal específica para recibir el rollo.');
    if (!Number.isFinite(width) || width <= 0) return onNotice?.('Indica el ancho del rollo en centímetros.');
    if (nominal !== null && (!Number.isFinite(nominal) || nominal <= 0)) return onNotice?.('El largo nominal debe ser mayor que cero.');
    if (form.remainingMode === 'percent' && nominal === null) return onNotice?.('El porcentaje requiere el largo nominal del rollo.');
    if (!form.reason.trim()) return onNotice?.('Indica el motivo de recepción.');
    if (form.remainingMode === 'meters' && (!Number.isFinite(remaining) || remaining <= 0 || (nominal !== null && remaining > nominal))) return onNotice?.('Revisa los metros restantes. Deben ser mayores que cero y no superar el largo nominal.');
    if (form.remainingMode === 'percent' && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) return onNotice?.('El porcentaje debe estar entre 0 y 100.');
    const key = 'receive'; setBusy(key);
    try {
      const { error } = await supabase.rpc('receive_inventory_roll', {
        p_variant_id: selected.variantId,
        p_branch_id: branchId,
        p_location_code: form.location.trim() || selected.location || 'MAIN',
        p_roll_tag: form.tag.trim(),
        p_nominal_length_m: nominal,
        p_nominal_width_cm: width,
        p_remaining_m: form.remainingMode === 'meters' ? remaining : null,
        p_remaining_percent: form.remainingMode === 'percent' ? percent : null,
        p_operator: form.operator.trim() || operatorDefaultName,
        p_reason: form.reason.trim(),
        p_work_reference: form.reference.trim(),
      });
      if (error) throw error;
      setForm((current) => ({ ...current, width: '', nominal: '', remaining: '', percent: '', tag: '', reason: '', reference: '', operator: operatorDefaultName }));
      await loadRolls();
      await onRefreshInventory?.();
      onNotice?.('Rollo recibido y stock reconciliado en metros.');
    } catch (error) { onNotice?.(`No se pudo recibir el rollo: ${errorMessage(error)}`); }
    finally { setBusy(null); }
  };

  const saveMeasurement = async (roll: Roll) => {
    if (!canEdit || !supabase || busy) return;
    const draft = measurement[roll.id];
    const meters = Number(draft?.meters);
    if (!Number.isFinite(meters) || meters < 0 || (roll.standard_length_m !== null && meters > Number(roll.standard_length_m))) return onNotice?.('Los metros restantes deben estar entre cero y el largo nominal registrado.');
    if (!draft?.reason.trim()) return onNotice?.('Indica el motivo del ajuste.');
    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('update_inventory_roll_remaining', { p_roll_id: roll.id, p_remaining_m: meters, p_remaining_percent: null, p_reason: draft.reason.trim(), p_operator: operatorDefaultName || roll.operator_name, p_work_reference: draft.reference.trim() });
      if (error) throw error;
      await loadRolls(); await onRefreshInventory?.();
      setMeasurement((current) => ({ ...current, [roll.id]: { meters: '', reason: '', reference: '' } }));
      onNotice?.(`Restante de ${roll.material_name} actualizado a ${formatNumber(meters, 3)} m.`);
    } catch (error) { onNotice?.(`No se pudo guardar la medición: ${errorMessage(error)}`); }
    finally { setBusy(null); }
  };

  const moveRoll = async (roll: Roll, destination: 'bodega' | 'machine') => {
    if (!canEdit || !supabase || busy) return;
    const draft = actions[roll.id] || { machine: availableMachines[0] || '', reason: '', reference: '' };
    if (destination === 'machine' && !draft.machine.trim()) return onNotice?.('Selecciona una máquina.');
    if (!draft.reason.trim()) return onNotice?.('Indica el motivo del traslado.');
    setBusy(roll.id);
    try {
      const { error } = await supabase.rpc('move_inventory_roll', { p_roll_id: roll.id, p_destination: destination, p_machine_name: destination === 'machine' ? draft.machine : '', p_reason: draft.reason.trim(), p_operator: operatorDefaultName || roll.operator_name, p_work_reference: draft.reference.trim() });
      if (error) throw error;
      await loadRolls();
      setActions((current) => ({ ...current, [roll.id]: { ...draft, reason: '', reference: '' } }));
      onNotice?.(destination === 'machine' ? 'Rollo movido a máquina. El stock no cambió.' : 'Rollo devuelto a bodega. El stock no cambió.');
    } catch (error) { onNotice?.(`No se pudo mover el rollo: ${errorMessage(error)}`); }
    finally { setBusy(null); }
  };

  const openHistory = async (roll: Roll) => {
    if (!supabase) return;
    setHistoryRoll(roll); setHistoryRows([]); setHistoryError(''); setHistoryLoading(true);
    try {
      const { data, error } = await supabase.from('inventory_roll_logs').select('id,event_type,previous_m,new_m,previous_state,new_state,reason,work_reference,operator_name,recorded_at,notes').eq('organization_id', organizationId).eq('roll_id', roll.id).order('recorded_at', { ascending: false }).limit(30);
      if (error) throw error;
      setHistoryRows((data || []) as RollLog[]);
    } catch (error) {
      const message = errorMessage(error);
      setHistoryError(message);
      onNotice?.(`No se pudo cargar el historial: ${message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const replaceRoll = async (roll: Roll) => {
    if (!canEdit || !supabase || busy) return;
    setBusy(roll.id);
    try {
      const { data, error } = await supabase.rpc('replace_active_roll', { p_roll_id: roll.id, p_consume_warehouse_roll: false, p_new_tag: '', p_operator: operatorDefaultName || roll.operator_name, p_notes: 'Intercambio físico de rollos: usado a bodega y nuevo a máquina' });
      if (error) throw error;
      await loadRolls();
      setReplaceConfirmId('');
      const activeId = (data as any)?.active_roll_id;
      const active = rolls.find((item) => item.id === activeId);
      onNotice?.(`Intercambio registrado. El rollo anterior quedó en bodega y ${active?.roll_tag ? `el lote ${active.roll_tag}` : 'el rollo de bodega'} pasó a máquina. El saldo total no cambió.`);
    } catch (error) { onNotice?.(`No se pudo intercambiar: ${errorMessage(error)}`); }
    finally { setBusy(null); }
  };

  const warehouseReplacementCount = (roll: Roll) => scopedRolls.filter((candidate) => candidate.branch_id === roll.branch_id && candidate.variant_id === roll.variant_id && candidate.roll_state === 'bodega' && candidate.status === 'en_bodega' && Number(candidate.remaining_m || 0) > 0).length;

  return (
    <main className="roll-book" aria-labelledby="roll-book-title">
      <header className="roll-book__header">
        <div className="roll-book__title-wrap"><span className="roll-book__mark" aria-hidden="true"><Scissors size={20}/></span><div><div className="roll-book__eyebrow"><span className={`roll-book__live-dot is-${realtimeState}`}/>{realtimeState === 'live' ? 'Sincronizado en vivo' : realtimeState === 'connecting' ? 'Conectando sincronización' : 'Actualización manual'}</div><h1 id="roll-book-title">Rollos de impresión</h1><p>Consulta saldo por rollo, identifica qué está en máquina y registra movimientos con trazabilidad.</p></div></div>
        <div className="roll-book__header-actions">
          <label className="roll-book__branch">Sucursal<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setMachineFilter('all'); setLocationFilter('all'); }} aria-label="Sucursal de los rollos"><option value="all">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <button className="roll-book__refresh" type="button" onClick={() => void loadRolls()} disabled={loading}><RefreshCw size={15} className={loading ? 'roll-book__spin' : ''}/> Actualizar</button>
          {canEdit && <button className="roll-book__receive-toggle" type="button" aria-expanded={showReceive} aria-controls="roll-book-receive-form" onClick={() => setShowReceive((value) => !value)}>{showReceive ? <X size={16}/> : <Plus size={16}/>} {showReceive ? 'Cerrar recepción' : 'Recibir rollo'}</button>}
        </div>
      </header>

      <section className="roll-book__metrics" aria-label="Resumen de rollos">
        <article><span className="roll-book__metric-icon is-violet"><Disc3 size={17}/></span><div><small>Rollos identificados</small><strong>{scopedRolls.length}</strong><span>En todas las ubicaciones</span></div></article>
        <article><span className="roll-book__metric-icon is-teal"><Warehouse size={17}/></span><div><small>En bodega</small><strong>{scopedRolls.filter((roll) => roll.roll_state === 'bodega').length}</strong><span>{formatNumber(warehouseMeters, 2)} m disponibles</span></div></article>
        <article><span className="roll-book__metric-icon is-blue"><Activity size={17}/></span><div><small>En máquinas</small><strong>{scopedRolls.filter((roll) => roll.roll_state === 'machine' && roll.status !== 'agotado').length}</strong><span>Asignados a producción</span></div></article>
        <article className={lowRolls.length + exhaustedCount > 0 ? 'is-attention' : ''}><span className="roll-book__metric-icon is-amber"><AlertTriangle size={17}/></span><div><small>Necesitan atención</small><strong>{lowRolls.length + exhaustedCount}</strong><span>{lowRolls.length} bajo {LOW_ROLL_PERCENT}% · {exhaustedCount} agotados</span></div></article>
      </section>

      {estimatedCount > 0 && <aside className="roll-book__estimate-notice" aria-label="Saldos estimados pendientes de medición">
        <span className="roll-book__estimate-icon"><Ruler size={17}/></span>
        <div><strong>{estimatedCount} {estimatedCount === 1 ? 'saldo estimado' : 'saldos estimados'} por confirmar</strong><p>El consumo registrado calcula el restante. Una medición física confirma el metraje real del rollo.</p></div>
        <button type="button" onClick={() => setStateFilter('estimado')}>Revisar saldos <span aria-hidden="true">→</span></button>
      </aside>}

      {realtimeState !== 'live' && <p className="roll-book__sync-note" role="status"><Clock3 size={14}/> {lastUpdatedAt ? `Última consulta ${new Date(lastUpdatedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}.` : 'La conexión en vivo aún no está disponible.'} La pantalla se actualiza al recargar.</p>}
      {loadError && <div className="roll-book__error" role="alert"><CircleHelp size={17}/><span>No se pudieron actualizar los datos. Se conserva la última lectura disponible.</span><button type="button" onClick={() => void loadRolls()} disabled={loading}>Reintentar</button></div>}

      {showReceive && <section className="roll-book__receive" aria-labelledby="roll-book-receive-title" id="roll-book-receive-form">
        <div className="roll-book__section-heading"><div><span className="roll-book__kicker">Recepción individual</span><h2 id="roll-book-receive-title">Ingresar rollo a bodega</h2></div><span className="roll-book__unit"><Ruler size={15}/> saldo en metros lineales</span></div>
        {!canEdit && <p className="roll-book__read-only">Tu perfil tiene acceso de consulta. Solicita permiso de edición para registrar y mover rollos.</p>}
        <form onSubmit={submitReceive} className="roll-book__form">
          <label className="roll-book__field roll-book__field--wide">Material y variante<select required value={form.variantId} onChange={(event) => { const selected = rollItems.find((item) => item.variantId === event.target.value); const defaultNominal = Number(selected?.customFields?.default_nominal_roll_length_m); setForm((current) => ({ ...current, variantId: event.target.value, width: String(selected?.variantAttributes?.width_cm || ''), nominal: Number.isFinite(defaultNominal) && defaultNominal > 0 ? String(defaultNominal) : '' })); }} disabled={!canEdit}><option value="">Seleccionar material de rollo</option>{rollItems.map((item) => <option key={item.variantId} value={item.variantId}>{item.name}{item.variant ? ` · ${item.variant}` : ''} · {item.variantSku || item.sku || ''}</option>)}</select></label>
          <label className="roll-book__field">Ancho nominal<input required type="number" min="0.01" step="0.01" value={form.width} onChange={(event) => setForm({ ...form, width: event.target.value })} placeholder="cm" disabled={!canEdit}/></label>
          <label className="roll-book__field">Largo nominal <span>(opcional)</span><div className="roll-book__input-unit"><input type="number" min="0.01" step="0.01" value={form.nominal} onChange={(event) => setForm({ ...form, nominal: event.target.value })} placeholder="200" disabled={!canEdit}/><i>m</i></div></label>
          <fieldset className="roll-book__mode"><legend>Restante inicial</legend><label><input type="radio" name="remaining-mode" value="meters" checked={form.remainingMode === 'meters'} onChange={() => setForm({ ...form, remainingMode: 'meters' })} disabled={!canEdit}/> Metros</label><label><input type="radio" name="remaining-mode" value="percent" checked={form.remainingMode === 'percent'} onChange={() => setForm({ ...form, remainingMode: 'percent' })} disabled={!canEdit || !form.nominal}/> Porcentaje</label></fieldset>
          {form.remainingMode === 'meters' ? <label className="roll-book__field">Metros restantes<input required type="number" min="0.001" step="0.001" value={form.remaining} onChange={(event) => setForm({ ...form, remaining: event.target.value })} placeholder="200" disabled={!canEdit}/></label> : <label className="roll-book__field">Porcentaje restante<input required type="number" min="0.01" max="100" step="0.01" value={form.percent} onChange={(event) => setForm({ ...form, percent: event.target.value })} placeholder="100" disabled={!canEdit || !form.nominal}/></label>}
          <label className="roll-book__field">Ubicación activa<select required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} disabled={!canEdit || branchId === 'all' || !activeLocations.length}><option value="">Selecciona una ubicación registrada</option>{activeLocations.map((location) => <option key={location.code} value={location.code}>{location.name} · {location.code}</option>)}</select>{branchId === 'all' && <small>Elige una sucursal para cargar sus ubicaciones.</small>}{branchId !== 'all' && !activeLocations.length && <small>No hay ubicaciones activas cargadas para esta sucursal.</small>}</label>
          <label className="roll-book__field">Lote / etiqueta<input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="Código del rollo" disabled={!canEdit}/></label>
          <label className="roll-book__field">Operador<input value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })} placeholder={operatorDefaultName || 'Nombre'} disabled={!canEdit}/></label>
          <label className="roll-book__field roll-book__field--wide">Motivo<input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Compra, devolución o ingreso inicial contado" disabled={!canEdit}/></label>
          <label className="roll-book__field">Referencia de trabajo<input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Orden o documento (opcional)" disabled={!canEdit}/></label>
          <div className="roll-book__form-submit"><span>El traslado a máquina conserva el saldo agregado de inventario.</span><button type="submit" disabled={!canEdit || busy === 'receive' || !rollItems.length || !branchId || branchId === 'all' || !activeLocations.some((location) => location.code === form.location)}>{busy === 'receive' ? <LoaderCircle className="roll-book__spin" size={16}/> : <Plus size={16}/>} Recibir en bodega</button></div>
        </form>
      </section>}

      <section className="roll-book__inventory" aria-labelledby="roll-book-list-title">
        <div className="roll-book__section-heading roll-book__section-heading--list"><div><span className="roll-book__kicker">Trazabilidad física</span><h2 id="roll-book-list-title">Rollos por ubicación <small>{visibleRolls.length}</small></h2></div><div className="roll-book__filters"><label className="roll-book__search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar material, lote o máquina" aria-label="Buscar rollos"/>{search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X size={14}/></button>}</label><select value={machineFilter} onChange={(event) => setMachineFilter(event.target.value)} aria-label="Filtrar por máquina"><option value="all">Todas las máquinas</option>{machines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}</select><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filtrar por ubicación de bodega"><option value="all">Todas las ubicaciones</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></div></div>
        <div className="roll-book__state-filters" role="group" aria-label="Filtrar rollos por estado">{([['todos', 'Todos', scopedRolls.length], ['bodega', 'En bodega', scopedRolls.filter((roll) => roll.roll_state === 'bodega').length], ['machine', 'En máquina', scopedRolls.filter((roll) => roll.roll_state === 'machine' && roll.status !== 'agotado').length], ['estimado', 'Por confirmar', estimatedCount], ['bajo', 'Bajo mínimo', lowRolls.length], ['agotado', 'Agotados', exhaustedCount]] as const).map(([key, label, count]) => <button key={key} type="button" className={stateFilter === key ? 'is-active' : ''} aria-pressed={stateFilter === key} onClick={() => setStateFilter(key)}>{label}<b>{count}</b></button>)}</div>
        {loading && rolls.length === 0 ? <div className="roll-book__empty"><LoaderCircle className="roll-book__spin" size={20}/> Cargando rollos…</div> : visibleRolls.length ? <div className="roll-book__grid">{visibleRolls.map((roll) => {
          const remaining = Number(roll.remaining_m ?? (roll.standard_length_m ? Number(roll.standard_length_m) * Number(roll.remaining_percent || 0) / 100 : 0));
          const percent = roll.standard_length_m && Number(roll.standard_length_m) > 0 ? Math.max(0, Math.min(100, remaining / Number(roll.standard_length_m) * 100)) : null;
          const isLow = roll.status !== 'agotado' && percent !== null && percent <= LOW_ROLL_PERCENT;
          const action = actions[roll.id] || { machine: availableMachines[0] || '', reason: '', reference: '' };
          const draft = measurement[roll.id] || { meters: '', reason: '', reference: '' };
          return <article className={`roll-book__card ${roll.roll_state === 'machine' ? 'is-machine' : ''}${isLow ? ' is-low' : ''}${roll.status === 'agotado' ? ' is-exhausted' : ''}`} key={roll.id}>
            <div className="roll-book__card-top"><span className={`roll-book__location ${roll.roll_state}`}><i/>{roll.roll_state === 'bodega' ? 'En bodega' : 'En máquina'}</span><span className={`roll-book__status ${roll.status === 'agotado' ? 'is-empty' : isLow ? 'is-low' : ''}`}>{roll.status === 'agotado' ? 'Agotado' : isLow ? 'Bajo mínimo' : roll.roll_state === 'machine' ? 'En uso' : 'Disponible'}</span></div>
            <div className="roll-book__material-heading"><div><h3>{roll.material_name}</h3><p className="roll-book__variant">{roll.nominal_width_cm ? `${formatNumber(Number(roll.nominal_width_cm))} cm de ancho` : 'Ancho sin dato'}{roll.roll_tag ? ` · Lote ${roll.roll_tag}` : ' · Sin etiqueta'}</p></div><span className="roll-book__material-icon"><Disc3 size={20}/></span></div>
            <div className="roll-book__measure"><strong>{formatNumber(remaining, 3)} <small>m</small></strong><span>{percent === null ? 'Sin largo nominal' : `${formatNumber(percent, 1)}% restante`}</span></div>
            {percent !== null && <div className={`roll-book__bar${isLow ? ' is-low' : ''}`} role="progressbar" aria-label={`${formatNumber(remaining, 3)} metros restantes de ${roll.material_name}; ${formatNumber(percent, 1)} por ciento`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }}/></div>}
            <div className="roll-book__data-line"><span>{roll.standard_length_m ? `Nominal ${formatNumber(Number(roll.standard_length_m))} m` : 'Largo nominal pendiente'}</span><span className={`roll-book__confidence${roll.remaining_is_estimate ? ' is-estimate' : ''}`}>{roll.remaining_is_estimate ? 'Saldo estimado' : 'Saldo medido'}</span></div>
            {roll.remaining_is_estimate && canEdit && <button type="button" className="roll-book__measure-cta" onClick={() => { setMeasurement((current) => ({ ...current, [roll.id]: { ...(current[roll.id] || { meters: '', reason: '', reference: '' }), reason: current[roll.id]?.reason || 'Medición física' } })); setExpandedToolsRollId(roll.id); }}><Ruler size={14}/> Confirmar metraje físico</button>}
            <p className="roll-book__where"><MapPin size={14}/>{roll.roll_state === 'machine' ? `${roll.machine_name || 'Máquina sin especificar'} · ` : ''}{branchName(roll.branch_id)} · {roll.location_code}</p>
            <div className="roll-book__card-meta"><span><Clock3 size={12}/> Actualizado {roll.last_measured_at ? new Date(roll.last_measured_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }) : 'sin fecha'}</span>{roll.operator_name && <span>Por {roll.operator_name}</span>}</div>
            {canEdit && <details className="roll-book__tools" open={expandedToolsRollId === roll.id} onToggle={(event) => { if (!event.currentTarget.open && expandedToolsRollId === roll.id) setExpandedToolsRollId(null); else if (event.currentTarget.open && expandedToolsRollId !== roll.id) setExpandedToolsRollId(roll.id); }}><summary><span className="roll-book__tools-title"><Ruler size={15}/> Acciones del rollo</span><small>Medir · mover · intercambiar</small></summary>
              <div className="roll-book__tool-block"><b>Medición física</b><p className="roll-book__measurement-hint">Ingresa el metraje que ves en el rollo; al guardar quedará como saldo medido.</p><div className="roll-book__tool-fields"><label>Metros restantes<input ref={expandedToolsRollId === roll.id ? measurementInputRef : null} type="number" min="0" {...(roll.standard_length_m ? { max: roll.standard_length_m } : {})} step="0.001" value={draft.meters} onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, meters: event.target.value } })} placeholder={formatNumber(remaining, 3)}/></label><label>Motivo<input value={draft.reason} onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, reason: event.target.value } })} placeholder="Medición física"/></label><label>Referencia<input value={draft.reference} onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, reference: event.target.value } })} placeholder="OT (opcional)"/></label></div><button type="button" className="roll-book__secondary-action" onClick={() => void saveMeasurement(roll)} disabled={busy === roll.id || !draft.meters || !draft.reason.trim()}>{busy === roll.id ? <LoaderCircle className="roll-book__spin" size={15}/> : <Ruler size={15}/>} Guardar medición</button></div>
              <div className="roll-book__tool-block"><b>{roll.roll_state === 'bodega' ? 'Mover a máquina' : 'Devolver a bodega'}</b><div className="roll-book__tool-fields">{roll.roll_state === 'bodega' && <label>Máquina<input list={`roll-machines-${roll.id}`} value={action.machine} onChange={(event) => setActions({ ...actions, [roll.id]: { ...action, machine: event.target.value } })} placeholder="Busca o escribe el equipo"/><datalist id={`roll-machines-${roll.id}`}>{availableMachineNames.map((machine) => <option key={machine} value={machine}/>)}</datalist></label>}<label>Motivo<input value={action.reason} onChange={(event) => setActions({ ...actions, [roll.id]: { ...action, reason: event.target.value } })} placeholder="Asignación o devolución"/></label><label>Referencia<input value={action.reference} onChange={(event) => setActions({ ...actions, [roll.id]: { ...action, reference: event.target.value } })} placeholder="OT (opcional)"/></label></div><button type="button" className="roll-book__secondary-action" onClick={() => void moveRoll(roll, roll.roll_state === 'bodega' ? 'machine' : 'bodega')} disabled={busy === roll.id || !action.reason.trim() || (roll.roll_state === 'bodega' && !action.machine.trim())}><ArrowRightLeft size={15}/>{roll.roll_state === 'bodega' ? 'Mover a máquina' : 'Regresar a bodega'}</button><small>Trasladar un rollo no cambia el saldo global de inventario.</small></div>
              {roll.roll_state === 'machine' && <div className="roll-book__tool-block"><b>Intercambiar por un rollo disponible</b><p>{warehouseReplacementCount(roll) ? `${warehouseReplacementCount(roll)} rollo(s) de esta variante están en bodega.` : 'No hay un rollo compatible en bodega.'}</p>{replaceConfirmId === roll.id ? <div className="roll-book__confirm-replace"><span>El rollo usado volverá a bodega y el nuevo pasará a la máquina. El saldo total no cambia.</span><button type="button" className="roll-book__secondary-action" onClick={() => void replaceRoll(roll)} disabled={busy === roll.id || warehouseReplacementCount(roll) === 0}>{busy === roll.id ? 'Intercambiando…' : 'Confirmar intercambio'}</button><button type="button" className="roll-book__cancel-action" onClick={() => setReplaceConfirmId('')}>Cancelar</button></div> : <button type="button" className="roll-book__secondary-action" onClick={() => setReplaceConfirmId(roll.id)} disabled={!warehouseReplacementCount(roll)}><ArrowRightLeft size={15}/> Preparar intercambio</button>}</div>}
            </details>}
            <button type="button" className="roll-book__history-action" onClick={() => void openHistory(roll)}><History size={14}/> Ver historial</button>
          </article>;
        })}</div> : scopedRolls.length > 0 ? <div className="roll-book__empty"><Search size={21}/><b>No hay rollos que coincidan</b><span>Ajusta la búsqueda o los filtros para ver los rollos de esta sucursal.</span><button type="button" className="roll-book__clear-filters" onClick={() => { setSearch(''); setStateFilter('todos'); setMachineFilter('all'); setLocationFilter('all'); }}>Limpiar filtros</button></div> : <div className="roll-book__empty"><ArrowDownToLine size={21}/><b>Aún no hay rollos identificados</b><span>Registra cada unidad física con su metraje real o estimado para comenzar el control.</span>{canEdit && <button type="button" className="roll-book__clear-filters" onClick={() => setShowReceive(true)}><Plus size={14}/> Recibir primer rollo</button>}</div>}
      </section>

      <Dialog open={Boolean(historyRoll)} onOpenChange={(open) => { if (!open) setHistoryRoll(null); }} eyebrow="Trazabilidad del rollo" title={historyRoll?.material_name || 'Historial'} description={historyRoll ? `${historyRoll.roll_tag || 'Sin lote'} · ${branchName(historyRoll.branch_id)}` : undefined} icon={<History size={18}/>} size="lg" tone="info" className="roll-book-history" footer={<button type="button" className="roll-book__refresh" onClick={() => setHistoryRoll(null)}>Cerrar historial</button>}>
        {historyLoading ? <p className="roll-book__history-state"><LoaderCircle className="roll-book__spin" size={18}/> Cargando movimientos…</p> : historyError ? <div className="roll-book__history-state" role="alert"><span>No se pudo cargar la trazabilidad.</span><button type="button" className="roll-book__history-action" onClick={() => historyRoll && void openHistory(historyRoll)}>Reintentar</button></div> : historyRows.length ? <ol className="roll-book__history-list">{historyRows.map((row) => <li key={row.id}><span className="roll-book__history-marker"><Check size={13}/></span><div><strong>{row.event_type === 'receive' ? 'Recepción' : row.event_type === 'measurement' ? 'Medición física' : row.event_type === 'transfer' ? 'Traslado' : 'Registro anterior'}</strong><small>{new Date(row.recorded_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })} · {row.operator_name || 'Sin responsable'}</small><p>{row.reason || row.notes || 'Sin motivo registrado'}{row.work_reference ? ` · Ref. ${row.work_reference}` : ''}</p>{(row.previous_m !== null || row.new_m !== null) && <span className="roll-book__history-values">{row.previous_m === null ? '—' : `${formatNumber(Number(row.previous_m), 3)} m`} → {row.new_m === null ? '—' : `${formatNumber(Number(row.new_m), 3)} m`}</span>}</div></li>)}</ol> : <p className="roll-book__history-state">No hay movimientos registrados para este rollo.</p>}
      </Dialog>
    </main>
  );
}

export default InventoryRollBook;
