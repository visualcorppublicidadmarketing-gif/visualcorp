import React, { useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

type InventoryRow = { id: string; name: string; sku?: string; variantId: string; remoteItemId: string; variantAttributes?: Record<string, unknown>; quantity?: number; unit?: string; branchId?: string | null; location?: string };
type Branch = { id: string; name: string; active?: boolean };

export function InventoryLonaCutPanel({ items, branches, canEdit, onDone, onMessage }: { items: InventoryRow[]; branches: Branch[]; canEdit: boolean; onDone: () => Promise<void>; onMessage: (message: string) => void }) {
  const [sourceId, setSourceId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [locationCode, setLocationCode] = useState('MAIN');
  const [length, setLength] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const sources = useMemo(() => [...new Map(items.filter(item => Number(item.variantAttributes?.width_cm) === 310 && item.variantAttributes?.material_family === 'lona').map(item => [item.variantId, item])).values()], [items]);
  const source = sources.find(item => item.variantId === sourceId);
  const outputs = source ? items.filter(item => item.remoteItemId === source.remoteItemId) : [];
  const output107 = outputs.find(item => Number(item.variantAttributes?.width_cm) === 107);
  const output203 = outputs.find(item => Number(item.variantAttributes?.width_cm) === 203);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const meters = Number(length);
    if (!canEdit || !supabase || !source || !output107 || !output203 || !branchId || !Number.isFinite(meters) || meters <= 0) return;
    setBusy(true);
    const { error } = await supabase.rpc('convert_inventory_lona_roll', {
      p_source_variant_id: source.variantId,
      p_output_107_variant_id: output107.variantId,
      p_output_203_variant_id: output203.variantId,
      p_branch_id: branchId,
      p_location_code: locationCode.trim() || 'MAIN',
      p_length_m: meters,
      p_reference: reference.trim(),
      p_note: 'Corte longitudinal completo del ancho confirmado por la empresa',
    });
    setBusy(false);
    if (error) { onMessage(`No se pudo registrar el corte: ${error.message}`); return; }
    await onDone();
    setLength('');
    setReference('');
    onMessage(`Corte registrado: ${meters} m pasan a la variante de 107 cm y ${meters} m a la de 203 cm. El movimiento quedó enlazado en el historial.`);
  };

  return <form className="inventory-lona-cut panel" onSubmit={submit}>
    <div className="inventory-lona-cut-heading"><span className="inventory-event-icon"><Scissors size={16}/></span><div><b>Cortar lona de 310 cm</b><small>Registra una conversión atómica: descuenta el largo cortado del rollo ancho y acredita ese mismo largo en 107 cm y 203 cm.</small></div></div>
    <div className="inventory-form-grid">
      <label>Rollo de origen<select required value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">Seleccionar variante de lona 310 cm</option>{sources.map(item => <option key={item.variantId} value={item.variantId}>{item.name} · {item.sku || item.variantId}</option>)}</select><small>La conversión requiere metros contados disponibles en la ubicación elegida.</small></label>
      <label>Sucursal<select required value={branchId} onChange={event => setBranchId(event.target.value)}><option value="">Seleccionar sucursal</option>{branches.filter(branch => branch.active !== false).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label>Ubicación<input required value={locationCode} onChange={event => setLocationCode(event.target.value)} placeholder="MAIN"/></label>
      <label>Metros lineales reales a cortar<input required type="number" min="0.001" step="0.001" value={length} onChange={event => setLength(event.target.value)} placeholder="Medir el tramo del rollo"/></label>
      <label>Referencia del rollo / lote<input value={reference} onChange={event => setReference(event.target.value)} placeholder="Opcional · etiqueta o documento"/></label>
    </div>
    {source && (!output107 || !output203) && <p className="inventory-lona-cut-warning">Faltan las variantes de salida de 107 cm y 203 cm para este artículo. Añádelas primero al catálogo.</p>}
    <button type="submit" className="button button-dark" disabled={!canEdit || busy || !output107 || !output203}>{busy ? 'Registrando corte…' : 'Registrar corte 310 → 107 + 203 cm'}</button>
  </form>;
}
