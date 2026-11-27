import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { getInventoryBalance } from '../../lib/inventoryModel';
import { useConfirm } from '../ui/OperationalKit';
import './production-material-panel.css';

/** The same material ledger is used by the job sheet and the kiosk. Costs stay in finance. */
export function ProductionMaterialPanel({ job, step, onChanged, initialKind = 'consumption' }: {
  job: { id: string; organization_id: string; branch_id: string };
  step: { id: string; assigned_to: string | null } | null;
  onChanged?: () => Promise<void> | void;
  initialKind?: 'consumption' | 'scrap';
}) {
  const { data, refreshRemote } = useWorkspace();
  const { hasPermission, user } = useAuth();
  const confirm = useConfirm();
  const [kind, setKind] = useState(initialKind);
  const [itemId, setItemId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [equipment, setEquipment] = useState('');
  const [equipmentRows, setEquipmentRows] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const items = useMemo(() => (data.inventory || []).filter(row => !row.archived && row.variantId && row.branchId === job.branch_id), [data.inventory, job.branch_id]);
  const selected = items.find(row => row.id === itemId);
  const available = selected ? getInventoryBalance(selected).available : null;
  const canEdit = Boolean(step && hasPermission('workshop', 'edit') && (step.assigned_to === user?.id || hasPermission('workshop', 'coordinate')));
  const key = useMemo(() => crypto.randomUUID(), [job.id, step?.id, kind, itemId, amount, reason, equipment, revision]);
  const load = useCallback(async () => {
    if (!supabase) return;
    const [assets, usages] = await Promise.all([
      supabase.from('equipment_assets').select('id,name,asset_code').eq('organization_id', job.organization_id).eq('branch_id', job.branch_id).neq('status', 'Retirado').order('name'),
      supabase.from('production_job_material_usage').select('id,kind,quantity,reason,created_at,equipment_asset_id,inventory_movements(variant_id,location_code)').eq('organization_id', job.organization_id).eq('job_id', job.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (assets.error || usages.error) { setError('No se pudo cargar el registro de materiales. Actualiza antes de registrar: ' + (assets.error || usages.error)?.message); return; }
    setEquipmentRows(assets.data || []); setHistory(usages.data || []);
  }, [job.id, job.organization_id, job.branch_id]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (!supabase || !step || !selected || busy || !canEdit) return;
    const qty = Number(amount);
    if (!Number.isFinite(qty) || qty <= 0 || available == null || qty > available || reason.trim().length < 3) { setError('Indica cantidad disponible y un motivo de al menos 3 caracteres.'); return; }
    if (!(await confirm({ title: kind === 'scrap' ? 'Registrar merma' : 'Registrar consumo', description: `${qty} ${selected.unit} de ${selected.name} se descontarán de ${selected.location}.`, confirmLabel: 'Confirmar movimiento', tone: 'warning' }))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: failure } = await supabase.rpc(kind === 'scrap' ? 'record_production_job_scrap' : 'consume_production_job_material', {
        p_job_id: job.id, p_step_id: step.id, p_variant_id: selected.variantId, p_quantity: qty,
        p_location_code: selected.location, p_reason: reason.trim(), p_idempotency_key: key, p_equipment_asset_id: equipment || null,
      });
      if (failure) throw failure;
      setAmount(''); setReason(''); setRevision(value => value + 1);
      setMessage(kind === 'scrap' ? 'Merma registrada con movimiento de inventario.' : 'Consumo registrado con movimiento de inventario.');
      await Promise.all([load(), refreshRemote(), onChanged?.()]);
    } catch (failure: any) { setError(failure.message || 'No se pudo registrar. Puedes reintentar sin duplicar.'); }
    finally { setBusy(false); }
  };
  return <section className="production-material-panel" aria-label="Consumos y mermas del trabajo">
    <header><span className="eyebrow">MATERIALES DEL TRABAJO</span><h3>Consumo y merma</h3><p>Disponible = existencia física − reservado. Cada movimiento conserva trabajo, etapa y equipo.</p></header>
    {error && <p role="alert" className="material-error">{error}</p>}{message && <p role="status">{message}</p>}
    {canEdit ? <fieldset disabled={busy} className="production-material-fields">
      <legend>Registrar salida de material</legend>
      <label>Tipo<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="consumption">Consumo de producción</option><option value="scrap">Merma</option></select></label>
      <label>Material y ubicación<select value={itemId} onChange={event => setItemId(event.target.value)}><option value="">Selecciona material</option>{items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.variant} · {item.location}</option>)}</select></label>
      <label>Cantidad {selected?.unit || ''}<input type="number" min="0.001" step="0.001" max={available ?? undefined} value={amount} onChange={event => setAmount(event.target.value)}/><small>Disponible: {available == null ? 'pendiente de verificar' : available}</small></label>
      <label>Equipo utilizado<select value={equipment} onChange={event => setEquipment(event.target.value)}><option value="">Trabajo manual / sin equipo</option>{equipmentRows.map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.asset_code}</option>)}</select></label>
      <label className="material-wide">Motivo<input maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe el uso o la causa de la merma"/></label>
      <button type="button" className="button button-dark" disabled={!selected || !amount || reason.trim().length < 3} onClick={() => void save()}>{busy ? 'Registrando…' : kind === 'scrap' ? 'Registrar merma' : 'Registrar consumo'}</button>
    </fieldset> : <p>El responsable asignado o coordinación puede registrar materiales en una etapa abierta.</p>}
    <div className="production-material-history">{history.map(row => <article key={row.id}><strong>{row.kind === 'scrap' ? 'Merma' : 'Consumo'} · {Number(row.quantity)}</strong><span>{items.find(item => item.variantId === row.inventory_movements?.variant_id)?.name || 'Material registrado'} · {row.inventory_movements?.location_code}</span><small>{row.reason}{row.equipment_asset_id ? ` · ${equipmentRows.find(asset => asset.id === row.equipment_asset_id)?.name || 'Equipo registrado'}` : ''}</small></article>)}</div>
    {!history.length && <p>Aún no hay consumos ni mermas registrados.</p>}
  </section>;
}
