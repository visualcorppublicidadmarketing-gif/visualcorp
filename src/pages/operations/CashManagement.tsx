import React, { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock3,
  Edit3,
  RotateCcw,
  Trash2,
  Wallet,
  Check,
  AlertTriangle,
  LoaderCircle,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import './cash-management.css';

type CashSession = {
  id: string;
  branch_id: string;
  opened_at: string;
  closed_at?: string | null;
  opening_cash: number | string;
  counted_cash?: number | string | null;
  expected_cash?: number | string | null;
  difference?: number | string | null;
  closing_note?: string | null;
  status?: string;
};

type CashMove = {
  id: string;
  session_id: string;
  direction: 'in' | 'out';
  amount: number | string;
  reason: string;
  created_at: string;
};

type Branch = { id: string; name: string };

type CashManagementProps = {
  branches: Branch[];
  branchId: string;
  setBranchId: (id: string) => void;
  activeCash: CashSession | null;
  cash: CashSession[];
  cashMoves: CashMove[];
  opening: string;
  setOpening: (val: string) => void;
  counted: string;
  setCounted: (val: string) => void;
  cashNote: string;
  setCashNote: (val: string) => void;
  canManage: boolean;
  busy: boolean;
  openCash: () => Promise<void> | void;
  closeCash: () => Promise<void> | void;
  cashMovement: (direction: 'in' | 'out', amount: number, reason: string) => Promise<boolean | void>;
  branchName: (id: string) => string;
  money: (val: number | string) => string;
  date: (val: string) => string;
};

export function CashManagement({
  branches,
  branchId,
  setBranchId,
  activeCash,
  cash,
  cashMoves,
  opening,
  setOpening,
  counted,
  setCounted,
  cashNote,
  setCashNote,
  canManage,
  busy,
  openCash,
  closeCash,
  cashMovement,
  branchName,
  money,
  date,
}: CashManagementProps) {
  // Estado de nuevo movimiento
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Edición inline de fondo inicial en turno abierto
  const [editingOpening, setEditingOpening] = useState(false);
  const [editOpeningVal, setEditOpeningVal] = useState(String(activeCash?.opening_cash ?? '0'));

  // Edición inline de movimiento
  const [editingMoveId, setEditingMoveId] = useState<string | null>(null);
  const [editMoveAmount, setEditMoveAmount] = useState('');
  const [editMoveReason, setEditMoveReason] = useState('');
  const [editMoveDir, setEditMoveDir] = useState<'in' | 'out'>('in');

  // Edición de arqueo de turno cerrado
  const [editingClosedSessionId, setEditingClosedSessionId] = useState<string | null>(null);
  const [editClosedOpening, setEditClosedOpening] = useState('');
  const [editClosedCounted, setEditClosedCounted] = useState('');
  const [editClosedNote, setEditClosedNote] = useState('');

  // Reapertura de turno cerrado
  const [reopeningSessionId, setReopeningSessionId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('Reapertura de turno');

  const closed = cash.filter((session) => session.status === 'closed' && session.branch_id === branchId).slice(0, 12);
  const movements = activeCash ? cashMoves.filter((move) => move.session_id === activeCash.id) : [];
  const validOpening = opening !== '' && Number.isFinite(Number(opening)) && Number(opening) >= 0;
  const validCounted = counted !== '' && Number.isFinite(Number(counted)) && Number(counted) >= 0;
  const validMovement = Number.isFinite(Number(amount)) && Number(amount) > 0 && reason.trim().length >= 3;

  const isBusy = busy || localBusy;

  // Registrar movimiento (disponible siempre que haya turno activo)
  const submitMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validMovement || isBusy) return;
    setLocalBusy(true);
    setFeedback(null);
    try {
      const saved = await cashMovement(direction, Number(amount), reason.trim());
      if (saved !== false) {
        setAmount('');
        setReason('');
        setFeedback({
          kind: 'success',
          message: `${direction === 'in' ? 'Entrada' : 'Retiro'} de ${money(amount)} registrado con éxito.`,
        });
      }
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'Error al guardar movimiento.' });
    } finally {
      setLocalBusy(false);
    }
  };

  // Guardar edición inline de fondo inicial
  const saveInlineOpening = async () => {
    if (!activeCash || !supabase) return;
    const nextVal = Number(editOpeningVal);
    if (!Number.isFinite(nextVal) || nextVal < 0) {
      setFeedback({ kind: 'error', message: 'Ingresa un monto de fondo inicial válido.' });
      return;
    }
    setLocalBusy(true);
    setFeedback(null);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_details', {
        p_session: activeCash.id,
        p_opening_cash: nextVal,
      });

      if (rpcErr) {
        const isMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /update_cash_session_details/i.test(rpcErr.message || '');
        if (isMissing) {
          const { error: updErr } = await supabase
            .from('cash_sessions')
            .update({ opening_cash: nextVal })
            .eq('id', activeCash.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      // Actualizar objeto en memoria para visualización inmediata
      activeCash.opening_cash = nextVal;
      setEditingOpening(false);
      setFeedback({ kind: 'success', message: `Fondo inicial actualizado a ${money(nextVal)}.` });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'No se pudo actualizar el fondo inicial.' });
    } finally {
      setLocalBusy(false);
    }
  };

  // Guardar edición de un movimiento
  const saveEditMovement = async (move: CashMove) => {
    if (!supabase) return;
    const newAmt = Number(editMoveAmount);
    if (!Number.isFinite(newAmt) || newAmt <= 0 || editMoveReason.trim().length < 3) {
      setFeedback({ kind: 'error', message: 'Monto mayor a 0 y motivo de al menos 3 caracteres.' });
      return;
    }
    setLocalBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_movement', {
        p_movement_id: move.id,
        p_amount: newAmt,
        p_reason: editMoveReason.trim(),
        p_direction: editMoveDir,
      });

      if (rpcErr) {
        const isMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /update_cash_session_movement/i.test(rpcErr.message || '');
        if (isMissing) {
          const { error: updErr } = await supabase
            .from('cash_session_movements')
            .update({ amount: newAmt, reason: editMoveReason.trim(), direction: editMoveDir })
            .eq('id', move.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      move.amount = newAmt;
      move.reason = editMoveReason.trim();
      move.direction = editMoveDir;
      setEditingMoveId(null);
      setFeedback({ kind: 'success', message: 'Movimiento actualizado con éxito.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'Error al actualizar movimiento.' });
    } finally {
      setLocalBusy(false);
    }
  };

  // Anular movimiento
  const voidMovement = async (move: CashMove) => {
    if (!supabase) return;
    if (!window.confirm(`¿Confirmas la anulación de este movimiento de ${money(move.amount)}?`)) return;
    setLocalBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('void_cash_session_movement', {
        p_movement_id: move.id,
        p_reason: 'Anulado por usuario',
      });

      if (rpcErr) {
        const isMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /void_cash_session_movement/i.test(rpcErr.message || '');
        if (isMissing) {
          const { error: delErr } = await supabase.from('cash_session_movements').delete().eq('id', move.id);
          if (delErr) throw delErr;
        } else {
          throw rpcErr;
        }
      }

      // Remover del listado visual
      const idx = cashMoves.findIndex((m) => m.id === move.id);
      if (idx !== -1) cashMoves.splice(idx, 1);

      setFeedback({ kind: 'success', message: 'Movimiento anulado.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'Error al anular movimiento.' });
    } finally {
      setLocalBusy(false);
    }
  };

  // Guardar edición de arqueo cerrado
  const saveClosedArqueo = async (session: CashSession) => {
    if (!supabase) return;
    const openVal = Number(editClosedOpening);
    const countedVal = Number(editClosedCounted);
    if (!Number.isFinite(openVal) || openVal < 0 || !Number.isFinite(countedVal) || countedVal < 0) {
      setFeedback({ kind: 'error', message: 'Valores numéricos válidos requeridos para fondo y contado.' });
      return;
    }
    setLocalBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_details', {
        p_session: session.id,
        p_opening_cash: openVal,
        p_counted_cash: countedVal,
        p_closing_note: editClosedNote.trim(),
      });

      if (rpcErr) {
        const isMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /update_cash_session_details/i.test(rpcErr.message || '');
        if (isMissing) {
          const exp = Number(session.expected_cash) || 0;
          const newDiff = Math.round((countedVal - exp) * 100) / 100;
          const { error: updErr } = await supabase
            .from('cash_sessions')
            .update({
              opening_cash: openVal,
              counted_cash: countedVal,
              difference: newDiff,
              closing_note: editClosedNote.trim(),
            })
            .eq('id', session.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      session.opening_cash = openVal;
      session.counted_cash = countedVal;
      session.difference = Math.round((countedVal - (Number(session.expected_cash) || 0)) * 100) / 100;
      session.closing_note = editClosedNote.trim();
      setEditingClosedSessionId(null);
      setFeedback({ kind: 'success', message: 'Arqueo corregido y actualizado.' });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'Error al actualizar arqueo.' });
    } finally {
      setLocalBusy(false);
    }
  };

  // Reabrir turno cerrado
  const confirmReopen = async (session: CashSession) => {
    if (!supabase) return;
    setLocalBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('reopen_cash_session', {
        p_session: session.id,
        p_reason: reopenReason.trim(),
      });

      if (rpcErr) {
        const isMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /reopen_cash_session/i.test(rpcErr.message || '');
        if (isMissing) {
          const { error: updErr } = await supabase
            .from('cash_sessions')
            .update({
              status: 'open',
              closed_at: null,
              closed_by: null,
              difference: null,
              counted_cash: null,
            })
            .eq('id', session.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      session.status = 'open';
      setReopeningSessionId(null);
      setFeedback({
        kind: 'success',
        message: 'Turno reabierto con éxito. Actualiza la vista para continuar operándolo.',
      });
    } catch (err: any) {
      setFeedback({ kind: 'error', message: err?.message || 'Error al reabrir turno.' });
    } finally {
      setLocalBusy(false);
    }
  };

  return (
    <div className="op-flow-grid cash-management-container">
      {feedback && (
        <div
          className={`cash-mgmt-feedback ${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.kind === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{feedback.message}</span>
          <button type="button" className="feedback-dismiss" onClick={() => setFeedback(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Panel Izquierdo: Turno y Arqueo */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">TURNO Y ARQUEO</span>
            <h2>Caja</h2>
          </div>
          <Wallet size={19} />
        </div>

        <label>
          Sucursal
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        {activeCash ? (
          <>
            <div className="op-flow-kpi-wrap">
              <div className="op-flow-kpi">
                <span>Tu turno abierto desde {date(activeCash.opened_at)}</span>
                <b>{money(activeCash.opening_cash)} fondo inicial</b>
              </div>
              <button
                type="button"
                className="button button-outline button-sm edit-opening-trigger"
                onClick={() => {
                  setEditingOpening((prev) => !prev);
                  setEditOpeningVal(String(activeCash.opening_cash ?? '0'));
                }}
              >
                <Edit3 size={13} /> {editingOpening ? 'Cancelar edición' : 'Editar fondo'}
              </button>
            </div>

            {/* Formulario Inline para Editar Fondo Inicial */}
            {editingOpening && (
              <div className="inline-opening-editor">
                <h4>Editar fondo inicial de este turno</h4>
                <div className="cash-quick-presets">
                  {[0, 20, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`preset-pill ${Number(editOpeningVal) === amt ? 'is-selected' : ''}`}
                      onClick={() => setEditOpeningVal(String(amt))}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <div className="inline-editor-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editOpeningVal}
                    onChange={(e) => setEditOpeningVal(e.target.value)}
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    className="button button-primary button-sm"
                    disabled={isBusy}
                    onClick={saveInlineOpening}
                  >
                    {isBusy ? <LoaderCircle size={14} className="spin" /> : 'Guardar'}
                  </button>
                </div>
              </div>
            )}

            <p className="muted">
              Los cobros en efectivo se asocian a este turno. Al cerrar, el sistema calcula el efectivo esperado y la
              diferencia de arqueo.
            </p>

            {/* Movimiento manual (disponible para asesora en su propio turno) */}
            <form className="cash-movement-form" onSubmit={submitMovement}>
              <h3>Registrar movimiento (Entrada / Retiro)</h3>
              <div className="op-flow-form-grid">
                <label>
                  Tipo
                  <select value={direction} onChange={(event) => setDirection(event.target.value as 'in' | 'out')}>
                    <option value="in">Entrada (+)</option>
                    <option value="out">Retiro (-)</option>
                  </select>
                </label>
                <label>
                  Monto ($)
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <label>
                Motivo
                <input
                  value={reason}
                  minLength={3}
                  maxLength={500}
                  required
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ej. Cambio para caja / compra urgente"
                />
              </label>
              <button className="button button-outline" type="submit" disabled={isBusy || !validMovement}>
                {direction === 'in' ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}
                Registrar {direction === 'in' ? 'entrada' : 'retiro'}
              </button>
            </form>

            {/* Historial de movimientos de este turno (con Editar y Anular) */}
            {movements.length > 0 && (
              <div className="cash-movement-history">
                <h3>Movimientos de este turno ({movements.length})</h3>
                <div className="op-flow-list">
                  {movements.map((move) => {
                    const isEditing = editingMoveId === move.id;
                    return (
                      <article key={move.id} className="cash-move-card">
                        {isEditing ? (
                          <div className="move-edit-inline-panel">
                            <div className="move-edit-fields">
                              <select
                                value={editMoveDir}
                                onChange={(e) => setEditMoveDir(e.target.value as 'in' | 'out')}
                              >
                                <option value="in">Entrada (+)</option>
                                <option value="out">Retiro (-)</option>
                              </select>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={editMoveAmount}
                                onChange={(e) => setEditMoveAmount(e.target.value)}
                              />
                              <input
                                type="text"
                                value={editMoveReason}
                                onChange={(e) => setEditMoveReason(e.target.value)}
                                placeholder="Motivo"
                              />
                            </div>
                            <div className="move-edit-btn-row">
                              <button
                                type="button"
                                className="button button-sm button-primary"
                                disabled={isBusy}
                                onClick={() => void saveEditMovement(move)}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                className="button button-sm button-outline"
                                onClick={() => setEditingMoveId(null)}
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="cash-move-row">
                            <div className="cash-move-left">
                              <b className={move.direction === 'in' ? 'text-in' : 'text-out'}>
                                {move.direction === 'in' ? '+ Entrada' : '- Retiro'} · {money(move.amount)}
                              </b>
                              <small>{date(move.created_at)}</small>
                              <span>{move.reason}</span>
                            </div>
                            <div className="cash-move-actions">
                              <button
                                type="button"
                                className="subtle-btn"
                                title="Editar movimiento"
                                onClick={() => {
                                  setEditingMoveId(move.id);
                                  setEditMoveAmount(String(move.amount));
                                  setEditMoveReason(move.reason);
                                  setEditMoveDir(move.direction);
                                }}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                className="subtle-btn danger"
                                title="Anular movimiento"
                                onClick={() => void voidMovement(move)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cierre de turno */}
            <div className="cash-close-form">
              <h3>Cierre de tu turno</h3>
              <label>
                Efectivo físico contado ($)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label>
                Nota de cierre <span>(opcional)</span>
                <textarea
                  value={cashNote}
                  onChange={(event) => setCashNote(event.target.value)}
                  placeholder="Explica la diferencia si la hay o novedades del turno"
                />
              </label>
              <button
                className="button button-dark"
                disabled={isBusy || !validCounted}
                onClick={closeCash}
              >
                Cerrar turno y conciliar
              </button>
            </div>
          </>
        ) : (
          /* Estado sin turno: Apertura fácil con presets rápidos */
          <div className="cash-open-panel">
            <p className="muted">
              Abre tu turno antes de cobrar en efectivo. El turno queda ligado a tu usuario y sucursal.
            </p>
            <div className="cash-quick-opening-section">
              <label>Fondo inicial en efectivo ($)</label>
              <div className="cash-quick-presets">
                {[0, 20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    className={`preset-pill ${Number(opening) === amt ? 'is-selected' : ''}`}
                    onClick={() => setOpening(String(amt))}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <button
              className="button button-dark open-turn-btn"
              disabled={isBusy || !branchId || !validOpening}
              onClick={openCash}
            >
              <Wallet size={16} /> Abrir caja ahora ({money(opening || 0)})
            </button>
          </div>
        )}
      </section>

      {/* Panel Derecho: Historial de Cierres Recientes (con Editar Arqueo y Reabrir) */}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">CIERRES RECIENTES</span>
            <h2>Historial de caja</h2>
          </div>
          <Clock3 size={19} />
        </div>

        <div className="op-flow-list cash-history-list">
          {closed.map((session) => {
            const isEditing = editingClosedSessionId === session.id;
            const isReopening = reopeningSessionId === session.id;

            return (
              <article key={session.id} className="cash-history-card-item">
                <b>
                  {branchName(session.branch_id)} · {session.closed_at ? date(session.closed_at) : '—'}
                </b>

                <div className="cash-close-amounts">
                  <span>
                    Esperado <strong>{money(session.expected_cash ?? 0)}</strong>
                  </span>
                  <span>
                    Contado <strong>{money(session.counted_cash ?? 0)}</strong>
                  </span>
                  <span>
                    Diferencia <strong>{money(session.difference ?? 0)}</strong>
                  </span>
                </div>

                <small>Fondo inicial: {money(session.opening_cash)}</small>
                <span>Nota: {session.closing_note || '—'}</span>

                {/* Formulario inline para editar arqueo */}
                {isEditing && (
                  <div className="closed-edit-inline-box">
                    <h4>Corregir arqueo</h4>
                    <div className="closed-edit-fields">
                      <label>
                        Fondo inicial ($)
                        <input
                          type="number"
                          step="0.01"
                          value={editClosedOpening}
                          onChange={(e) => setEditClosedOpening(e.target.value)}
                        />
                      </label>
                      <label>
                        Efectivo contado ($)
                        <input
                          type="number"
                          step="0.01"
                          value={editClosedCounted}
                          onChange={(e) => setEditClosedCounted(e.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      Nota de cierre
                      <input
                        type="text"
                        value={editClosedNote}
                        onChange={(e) => setEditClosedNote(e.target.value)}
                      />
                    </label>
                    <div className="closed-edit-actions">
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={isBusy}
                        onClick={() => void saveClosedArqueo(session)}
                      >
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        className="button button-sm button-outline"
                        onClick={() => setEditingClosedSessionId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Formulario inline para reabrir turno */}
                {isReopening && (
                  <div className="closed-reopen-inline-box">
                    <h4>Reabrir turno para continuar operando</h4>
                    <label>
                      Motivo de reapertura
                      <input
                        type="text"
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                        placeholder="Ej. Cobro adicional / cierre por error"
                      />
                    </label>
                    <div className="closed-edit-actions">
                      <button
                        type="button"
                        className="button button-sm button-primary"
                        disabled={isBusy}
                        onClick={() => void confirmReopen(session)}
                      >
                        Confirmar reapertura
                      </button>
                      <button
                        type="button"
                        className="button button-sm button-outline"
                        onClick={() => setReopeningSessionId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Botones de acción: Editar arqueo y Reabrir turno */}
                {!isEditing && !isReopening && (
                  <div className="cash-history-actions">
                    <button
                      type="button"
                      className="button button-outline button-sm"
                      onClick={() => {
                        setEditingClosedSessionId(session.id);
                        setEditClosedOpening(String(session.opening_cash ?? '0'));
                        setEditClosedCounted(String(session.counted_cash ?? '0'));
                        setEditClosedNote(session.closing_note || '');
                      }}
                      title="Editar fondo, efectivo contado o nota"
                    >
                      <Edit3 size={13} /> Editar arqueo
                    </button>
                    <button
                      type="button"
                      className="button button-outline button-sm"
                      onClick={() => {
                        setReopeningSessionId(session.id);
                        setReopenReason('Reapertura para continuar operando');
                      }}
                      title="Reabrir este turno"
                    >
                      <RotateCcw size={13} /> Reabrir turno
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {closed.length === 0 && <p className="muted">Aún no hay cierres registrados.</p>}
        </div>
      </section>
    </div>
  );
}
