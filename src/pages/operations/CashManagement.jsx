import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Clock3, Wallet } from 'lucide-react';
import './cash-management.css';

export function CashManagement({ branches, branchId, setBranchId, activeCash, cash, cashMoves, opening, setOpening, counted, setCounted, cashNote, setCashNote, canManage, busy, openCash, closeCash, cashMovement, branchName, money, date }) {
  const [direction, setDirection] = useState('in');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const closed = cash.filter((session) => session.status === 'closed' && session.branch_id === branchId).slice(0, 12);
  const movements = activeCash ? cashMoves.filter((move) => move.session_id === activeCash.id) : [];
  const validOpening = opening !== '' && Number.isFinite(Number(opening)) && Number(opening) >= 0;
  const validCounted = counted !== '' && Number.isFinite(Number(counted)) && Number(counted) >= 0;
  const validMovement = Number.isFinite(Number(amount)) && Number(amount) > 0 && reason.trim().length >= 3;

  const submitMovement = async (event) => {
    event.preventDefault();
    if (!validMovement || busy) return;
    const saved = await cashMovement(direction, Number(amount), reason.trim());
    if (saved) { setAmount(''); setReason(''); }
  };

  return <div className="op-flow-grid">
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">TURNO Y ARQUEO</span><h2>Caja</h2></div><Wallet size={19}/></div>
      <label>Sucursal<select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {activeCash ? <>
        <div className="op-flow-kpi"><span>Tu turno abierto desde {date(activeCash.opened_at)}</span><b>{money(activeCash.opening_cash)} fondo inicial</b></div>
        <p className="muted">Los cobros en efectivo se asocian al turno abierto de quien registra la venta. Al cerrar, el sistema calcula el efectivo esperado y la diferencia.</p>
        {canManage && <form className="cash-movement-form" onSubmit={submitMovement}>
          <h3>Movimiento manual</h3>
          <div className="op-flow-form-grid">
            <label>Tipo<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="in">Entrada</option><option value="out">Retiro</option></select></label>
            <label>Monto<input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)}/></label>
          </div>
          <label>Motivo<input value={reason} minLength={3} maxLength={500} required onChange={(event) => setReason(event.target.value)} placeholder="Motivo del movimiento"/></label>
          <button className="button button-outline" type="submit" disabled={busy || !validMovement}>{direction === 'in' ? <ArrowDownToLine size={16}/> : <ArrowUpFromLine size={16}/>} Registrar {direction === 'in' ? 'entrada' : 'retiro'}</button>
        </form>}
        {movements.length > 0 && <div className="cash-movement-history"><h3>Movimientos de este turno</h3><div className="op-flow-list">{movements.map((move) => <article key={move.id}><b>{move.direction === 'in' ? 'Entrada' : 'Retiro'} · {money(move.amount)}</b><small>{date(move.created_at)}</small><span>{move.reason}</span></article>)}</div></div>}
        <div className="cash-close-form"><h3>Cierre de tu turno</h3><label>Efectivo físico contado<input type="number" min="0" step="0.01" value={counted} onChange={(event) => setCounted(event.target.value)}/></label><label>Nota de cierre<textarea value={cashNote} onChange={(event) => setCashNote(event.target.value)} placeholder="Explica la diferencia si la hay"/></label><button className="button button-dark" disabled={busy || !validCounted} onClick={closeCash}>Cerrar turno y conciliar</button></div>
      </> : <>
        <p className="muted">Abre tu turno antes de cobrar en efectivo. El turno queda ligado a tu usuario y sucursal.</p>
        <label>Fondo inicial en efectivo<input type="number" min="0" step="0.01" value={opening} onChange={(event) => setOpening(event.target.value)}/></label>
        <button className="button button-dark" disabled={busy || !branchId || !validOpening} onClick={openCash}>Abrir caja</button>
      </>}
    </section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">CIERRES RECIENTES</span><h2>Historial de caja</h2></div><Clock3 size={19}/></div>
      <div className="op-flow-list">{closed.map((session) => <article key={session.id}><b>{branchName(session.branch_id)} · {date(session.closed_at)}</b><div className="cash-close-amounts"><span>Esperado <strong>{money(session.expected_cash)}</strong></span><span>Contado <strong>{money(session.counted_cash)}</strong></span><span>Diferencia <strong>{money(session.difference)}</strong></span></div><small>Fondo inicial: {money(session.opening_cash)}</small><span>Nota: {session.closing_note || '—'}</span></article>)}{closed.length === 0 && <p className="muted">Aún no hay cierres registrados.</p>}</div>
    </section>
  </div>;
}
