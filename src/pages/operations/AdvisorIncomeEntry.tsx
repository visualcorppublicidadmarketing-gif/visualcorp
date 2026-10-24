import React, { useMemo, useRef, useState } from 'react';
import { Banknote, CheckCircle2, LoaderCircle, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

const METHODS = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Tarjeta'], ['cheque', 'Cheque'], ['other', 'Otro']];

export function AdvisorIncomeEntry({ branches, advisors, customers, customersError, currentUserId, canChooseAdvisor, selectedBranch, onRecorded }) {
  const eligibleAdvisors = useMemo(() => advisors.filter((person) => person.active && ['advisor', 'owner', 'admin', 'manager'].includes(person.role)), [advisors]);
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(selectedBranch !== 'all' ? selectedBranch : branches[0]?.id || '');
  const [advisorId, setAdvisorId] = useState(currentUserId || '');
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('');
  const [received, setReceived] = useState('');
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const numericTotal = Number(total) || 0;
  const numericReceived = Number(received) || 0;
  const effectiveAdvisorId = canChooseAdvisor ? advisorId : currentUserId;

  const submit = async (event) => {
    event.preventDefault();
    if (!supabase || !branchId || !effectiveAdvisorId || !description.trim() || numericTotal <= 0 || numericReceived < 0 || numericReceived > numericTotal) {
      setError('Revisa la sucursal, la asesora, la descripción y los montos antes de guardar.');
      return;
    }
    const payload = { p_branch_id: branchId, p_advisor_id: effectiveAdvisorId, p_customer_id: customerId || null, p_description: description.trim(), p_total: numericTotal, p_amount_received: numericReceived, p_method: numericReceived > 0 ? method : 'other', p_reference: reference.trim(), p_note: note.trim() };
    const fingerprint = JSON.stringify(payload);
    if (!requestKey.current || requestKey.current.fingerprint !== fingerprint) requestKey.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true); setError(''); setSuccess('');
    try {
      const { data, error: rpcError } = await supabase.rpc('record_advisor_finance_sale', { p_idempotency_key: requestKey.current.key, ...payload });
      if (rpcError) throw rpcError;
      const result = data as { sale_code?: string; total?: number; paid?: number; balance?: number };
      setSuccess(`${result.sale_code || 'Ingreso registrado'} · total ${money(result.total ?? numericTotal)} · recibido ${money(result.paid ?? numericReceived)} · saldo ${money(result.balance ?? numericTotal - numericReceived)}`);
      setDescription(''); setTotal(''); setReceived(''); setReference(''); setNote(''); requestKey.current = null; onRecorded();
    } catch (saveError) {
      setError(saveError?.message || 'No se pudo registrar el ingreso. Puedes reintentar sin duplicar el movimiento.');
    } finally { setSaving(false); }
  };

  return <section className="panel op-finance-entry" aria-labelledby="op-finance-entry-title">
    <div className="op-finance-entry-heading"><div><span className="eyebrow">INGRESO DE ASESORA</span><h2 id="op-finance-entry-title">Registrar ingreso manual</h2><p>Para servicios u otros ingresos que no se originan como artículos del inventario.</p></div><button className="button button-outline" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? <X size={15}/> : <Plus size={15}/>} {open ? 'Cerrar' : 'Nuevo ingreso'}</button></div>
    {success && <p className="op-finance-entry-success" role="status"><CheckCircle2 size={16}/>{success}</p>}
    {open && <form className="op-finance-entry-form" onSubmit={submit}>
      <div className="op-finance-form-grid">
        <label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Selecciona sucursal</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {canChooseAdvisor && <label>Asesora<select value={advisorId} onChange={(event) => setAdvisorId(event.target.value)} required><option value="">Selecciona asesora</option>{eligibleAdvisors.map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name || person.email || person.user_id.slice(0, 8)}</option>)}</select></label>}
        {customers && <label>Cliente CRM (opcional)<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Sin ficha vinculada</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label>}
        <label className="op-finance-description">Descripción<input maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej. servicio de diseño, instalación u otro ingreso" required /></label>
        <label>Total USD<input type="number" min="0.01" step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} required /></label>
        <label>Recibido ahora USD<input type="number" min="0" step="0.01" max={numericTotal || undefined} value={received} onChange={(event) => setReceived(event.target.value)} /></label>
        {numericReceived > 0 && <label>Medio de pago<select value={method} onChange={(event) => setMethod(event.target.value)}>{METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {numericReceived > 0 && <label>Referencia<input maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Comprobante o referencia opcional" /></label>}
        <label className="op-finance-description">Nota<input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Detalle adicional opcional" /></label>
      </div>
      {customersError && <p className="op-finance-entry-hint" role="status">No se pudo cargar el directorio CRM; el ingreso podrá guardarse sin ficha vinculada.</p>}
      {numericReceived > 0 && method === 'cash' && <p className="op-finance-entry-hint"><Banknote size={15}/> Para efectivo, tu turno de caja debe estar abierto en esta sucursal.</p>}
      {numericTotal > 0 && numericReceived <= numericTotal && <p className="op-finance-entry-hint">Saldo por cobrar: <b>{money(numericTotal - numericReceived)}</b></p>}
      {error && <p className="op-finance-cost-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={saving || !branches.length}>{saving ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} {saving ? 'Guardando ingreso…' : 'Guardar ingreso'}</button>
    </form>}
  </section>;
}

function money(value: number) { return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0); }
