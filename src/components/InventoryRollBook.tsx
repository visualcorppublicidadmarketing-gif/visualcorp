import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRightLeft, LoaderCircle, Plus, RefreshCw, Ruler, Scissors, Search, Warehouse } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
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
  roll_state: 'bodega' | 'machine';
  status: string;
  operator_name: string;
  notes: string;
};

type Props = {
  organizationId: string;
  branches: Branch[];
  canEdit: boolean;
  onNotice?: (message: string) => void;
  operatorDefaultName?: string;
  inventoryItems: InventoryItem[];
  rollGroupId: string | null;
  onRefreshInventory?: () => Promise<void> | void;
  availableMachines: string[];
};

const unitIsMeters = (unit = '') => /^(m|metro|metros|metro lineal|metros lineales)$/i.test(unit.trim());
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String((error as { message?: string })?.message || 'Ocurrió un error inesperado.');
const formatNumber = (value: number, digits = 2) => new Intl.NumberFormat('es-EC', { maximumFractionDigits: digits }).format(value);

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
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [stateFilter, setStateFilter] = useState<'todos' | 'bodega' | 'machine'>('todos');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ variantId: '', width: '', nominal: '', remainingMode: 'meters' as 'meters' | 'percent', remaining: '', percent: '', location: 'MAIN', tag: '', operator: operatorDefaultName, reason: '', reference: '' });
  const [measurement, setMeasurement] = useState<Record<string, { meters: string; reason: string; reference: string }>>({});
  const [actions, setActions] = useState<Record<string, { machine: string; reason: string; reference: string }>>({});

  useEffect(() => {
    if (!branches.some((branch) => branch.id === branchId)) setBranchId(branches[0]?.id || '');
  }, [branches, branchId]);

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
  const loadRolls = async () => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from('inventory_active_rolls').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
    if (error) onNotice?.(`No se pudieron cargar los rollos: ${error.message}`);
    else setRolls((data || []) as Roll[]);
    setLoading(false);
  };

  useEffect(() => { void loadRolls(); }, [organizationId]);

  const groupVariantIds = useMemo(() => new Set(rollItems.map((item) => item.variantId).filter((id): id is string => Boolean(id))), [rollItems]);
  const visibleRolls = useMemo(() => rolls.filter((roll) => {
    if (!groupVariantIds.has(roll.variant_id)) return false;
    if (branchId && roll.branch_id !== branchId) return false;
    if (stateFilter !== 'todos' && roll.roll_state !== stateFilter) return false;
    const needle = search.trim().toLowerCase();
    return !needle || `${roll.material_name} ${roll.roll_tag} ${roll.machine_name} ${roll.variant_id}`.toLowerCase().includes(needle);
  }), [rolls, groupVariantIds, branchId, stateFilter, search]);

  const submitReceive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !supabase || busy) return;
    const selected = rollItems.find((item) => item.variantId === form.variantId);
    const width = Number(form.width);
    const nominal = form.nominal.trim() ? Number(form.nominal) : null;
    const remaining = Number(form.remaining);
    const percent = Number(form.percent);
    if (!selected || !branchId) return onNotice?.('Selecciona un material y una sucursal.');
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

  return (
    <main className="roll-book" aria-labelledby="roll-book-title">
      <header className="roll-book__header">
        <div className="roll-book__title-wrap"><span className="roll-book__mark" aria-hidden="true"><Scissors size={20}/></span><div><h1 id="roll-book-title">Libro de rollos</h1><p>Controla cada rollo por su metraje, desde la recepción hasta la máquina.</p></div></div>
        <div className="roll-book__header-actions">
          <label className="roll-book__branch">Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="Sucursal de los rollos">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <button className="roll-book__refresh" type="button" onClick={() => void loadRolls()} disabled={loading}><RefreshCw size={15}/> Actualizar</button>
        </div>
      </header>

      <section className="roll-book__receive" aria-labelledby="roll-book-receive-title">
        <div className="roll-book__section-heading"><div><span className="roll-book__kicker">Recepción individual</span><h2 id="roll-book-receive-title">Ingresar rollo a bodega</h2></div><span className="roll-book__unit"><Ruler size={15}/> saldo en metros lineales</span></div>
        {!canEdit && <p className="roll-book__read-only">Tu perfil tiene acceso de consulta. Solicita permiso de edición para registrar y mover rollos.</p>}
        <form onSubmit={submitReceive} className="roll-book__form">
          <label className="roll-book__field roll-book__field--wide">Material y variante<select required value={form.variantId} onChange={(event) => { const selected = rollItems.find((item) => item.variantId === event.target.value); const defaultNominal = Number(selected?.customFields?.default_nominal_roll_length_m); setForm({ ...form, variantId: event.target.value, width: String(selected?.variantAttributes?.width_cm || ''), nominal: form.nominal || (Number.isFinite(defaultNominal) && defaultNominal > 0 ? String(defaultNominal) : '') }); }} disabled={!canEdit}><option value="">Seleccionar material de rollo</option>{rollItems.map((item) => <option key={item.variantId} value={item.variantId}>{item.name}{item.variant ? ` · ${item.variant}` : ''} · {item.variantSku || item.sku || ''}</option>)}</select></label>
          <label className="roll-book__field">Ancho nominal<input required type="number" min="0.01" step="0.01" value={form.width} onChange={(event) => setForm({ ...form, width: event.target.value })} placeholder="cm" disabled={!canEdit}/></label>
          <label className="roll-book__field">Largo nominal <span>(opcional)</span><div className="roll-book__input-unit"><input type="number" min="0.01" step="0.01" value={form.nominal} onChange={(event) => setForm({ ...form, nominal: event.target.value })} placeholder="200" disabled={!canEdit}/><i>m</i></div></label>
          <fieldset className="roll-book__mode"><legend>Restante inicial</legend><label><input type="radio" name="remaining-mode" value="meters" checked={form.remainingMode === 'meters'} onChange={() => setForm({ ...form, remainingMode: 'meters' })} disabled={!canEdit}/> Metros</label><label><input type="radio" name="remaining-mode" value="percent" checked={form.remainingMode === 'percent'} onChange={() => setForm({ ...form, remainingMode: 'percent' })} disabled={!canEdit || !form.nominal}/> Porcentaje</label></fieldset>
          {form.remainingMode === 'meters' ? <label className="roll-book__field">Metros restantes<input required type="number" min="0.001" step="0.001" value={form.remaining} onChange={(event) => setForm({ ...form, remaining: event.target.value })} placeholder="200" disabled={!canEdit}/></label> : <label className="roll-book__field">Porcentaje restante<input required type="number" min="0.01" max="100" step="0.01" value={form.percent} onChange={(event) => setForm({ ...form, percent: event.target.value })} placeholder="100" disabled={!canEdit || !form.nominal}/></label>}
          <label className="roll-book__field">Ubicación<select value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} disabled={!canEdit}><option value="MAIN">Principal · MAIN</option>{[...new Set(inventoryItems.map((item) => item.location).filter((location): location is string => Boolean(location) && location !== 'MAIN'))].map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
          <label className="roll-book__field">Lote / etiqueta<input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} placeholder="Código del rollo" disabled={!canEdit}/></label>
          <label className="roll-book__field">Operador<input value={form.operator} onChange={(event) => setForm({ ...form, operator: event.target.value })} placeholder={operatorDefaultName || 'Nombre'} disabled={!canEdit}/></label>
          <label className="roll-book__field roll-book__field--wide">Motivo<input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Compra, devolución o ingreso inicial contado" disabled={!canEdit}/></label>
          <label className="roll-book__field">Referencia de trabajo<input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Orden o documento (opcional)" disabled={!canEdit}/></label>
          <div className="roll-book__form-submit"><span>El traslado a máquina conserva el saldo agregado de inventario.</span><button type="submit" disabled={!canEdit || busy === 'receive' || !rollItems.length || !branchId}>{busy === 'receive' ? <LoaderCircle className="roll-book__spin" size={16}/> : <Plus size={16}/>} Recibir en bodega</button></div>
        </form>
      </section>

      <section className="roll-book__inventory" aria-labelledby="roll-book-list-title">
        <div className="roll-book__section-heading roll-book__section-heading--list"><div><span className="roll-book__kicker">Existencias identificadas</span><h2 id="roll-book-list-title">Rollos por ubicación <small>{visibleRolls.length}</small></h2></div><div className="roll-book__filters"><label className="roll-book__search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar material o lote" aria-label="Buscar rollos"/></label><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)} aria-label="Filtrar por ubicación"><option value="todos">Todas las ubicaciones</option><option value="bodega">Bodega</option><option value="machine">En máquina</option></select></div></div>
        {loading ? <div className="roll-book__empty"><LoaderCircle className="roll-book__spin" size={20}/> Cargando rollos…</div> : visibleRolls.length ? <div className="roll-book__grid">{visibleRolls.map((roll) => {
          const remaining = Number(roll.remaining_m ?? (roll.standard_length_m ? Number(roll.standard_length_m) * Number(roll.remaining_percent || 0) / 100 : 0));
          const percent = roll.standard_length_m && Number(roll.standard_length_m) > 0 ? Math.max(0, Math.min(100, remaining / Number(roll.standard_length_m) * 100)) : null;
          const action = actions[roll.id] || { machine: availableMachines[0] || '', reason: '', reference: '' };
          const draft = measurement[roll.id] || { meters: '', reason: '', reference: '' };
          return <article className={`roll-book__card ${roll.roll_state === 'machine' ? 'is-machine' : ''}`} key={roll.id}>
            <div className="roll-book__card-top"><span className={`roll-book__location ${roll.roll_state}`}><i/>{roll.roll_state === 'bodega' ? 'Bodega' : 'En máquina'}</span><span className={`roll-book__status ${roll.status === 'agotado' ? 'is-empty' : ''}`}>{roll.status === 'agotado' ? 'Agotado' : roll.roll_state === 'machine' ? 'En uso' : 'Disponible'}</span></div>
            <h3>{roll.material_name}</h3><p className="roll-book__variant">{roll.nominal_width_cm ? `${formatNumber(Number(roll.nominal_width_cm))} cm` : 'Ancho sin dato'}{roll.roll_tag ? ` · Lote ${roll.roll_tag}` : ''}</p>
            <div className="roll-book__measure"><strong>{formatNumber(remaining, 3)} <small>m</small></strong><span>{percent === null ? 'Porcentaje sin estimar' : `${formatNumber(percent, 1)}% estimado`}</span></div>
            {percent !== null && <div className="roll-book__bar" role="progressbar" aria-label={`Metros restantes de ${roll.material_name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }}/></div>}
            <p className="roll-book__where"><Warehouse size={14}/>{roll.roll_state === 'machine' ? `${roll.machine_name || 'Máquina sin especificar'} · ` : ''}{branchName(roll.branch_id)} · {roll.location_code}</p>
            {canEdit && <details className="roll-book__tools"><summary>Medir o mover rollo</summary>
              <div className="roll-book__tool-block"><b>Medición física</b><div className="roll-book__tool-fields"><label>Metros restantes<input type="number" min="0" {...(roll.standard_length_m ? { max: roll.standard_length_m } : {})} step="0.001" value={draft.meters} onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, meters: event.target.value } })} placeholder={formatNumber(remaining, 3)}/></label><label>Motivo<input value={draft.reason} onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, reason: event.target.value } })} placeholder="Uso en orden…"/></label><label>Referencia<input value={draft.reference} onChange={(event) => setMeasurement({ ...measurement, [roll.id]: { ...draft, reference: event.target.value } })} placeholder="OT (opcional)"/></label></div><button type="button" className="roll-book__secondary-action" onClick={() => void saveMeasurement(roll)} disabled={busy === roll.id || !draft.meters || !draft.reason.trim()}>{busy === roll.id ? <LoaderCircle className="roll-book__spin" size={15}/> : <Ruler size={15}/>} Guardar medición</button></div>
              <div className="roll-book__tool-block"><b>{roll.roll_state === 'bodega' ? 'Mover a máquina' : 'Devolver a bodega'}</b><div className="roll-book__tool-fields">{roll.roll_state === 'bodega' && <label>Máquina<select value={action.machine} onChange={(event) => setActions({ ...actions, [roll.id]: { ...action, machine: event.target.value } })}><option value="">Seleccionar máquina</option>{availableMachines.map((machine) => <option key={machine} value={machine}>{machine}</option>)}</select></label>}<label>Motivo<input value={action.reason} onChange={(event) => setActions({ ...actions, [roll.id]: { ...action, reason: event.target.value } })} placeholder="Asignación o devolución"/></label><label>Referencia<input value={action.reference} onChange={(event) => setActions({ ...actions, [roll.id]: { ...action, reference: event.target.value } })} placeholder="OT (opcional)"/></label></div><button type="button" className="roll-book__secondary-action" onClick={() => void moveRoll(roll, roll.roll_state === 'bodega' ? 'machine' : 'bodega')} disabled={busy === roll.id || !action.reason.trim()}><ArrowRightLeft size={15}/>{roll.roll_state === 'bodega' ? 'Mover a máquina' : 'Regresar a bodega'}</button><small>Este traslado no descuenta metros del inventario.</small></div>
            </details>}
          </article>;
        })}</div> : <div className="roll-book__empty"><ArrowDownToLine size={21}/><b>Aún no hay rollos en esta vista</b><span>Recibe un rollo contado para iniciar el control por metros.</span></div>}
      </section>
    </main>
  );
}

export default InventoryRollBook;
