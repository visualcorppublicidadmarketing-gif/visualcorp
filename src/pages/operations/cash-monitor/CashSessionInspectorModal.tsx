import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckSquare,
  Edit3,
  Eye,
  FlaskConical,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import {
  type CashMonitorLinkedSaleRow,
  type CashMonitorSessionDetail,
  fetchCashMonitorSessionDetail,
  formatAdminControlError,
  formatMoneyUsd,
} from '../../../lib/adminCashSalesControl';
import { CommercialDocumentDetails } from '../../../components/CommercialDocumentDetails';
import { AdminDeleteRecordModal, type AdminDeleteTarget } from '../../../components/AdminDeleteRecordModal';
import { POSSaleEditorModal } from '../../pos/components/POSSaleEditorModal';
import { Dialog, DialogCallout, useConfirm } from '../../../components/ui/DialogSystem';
import { Sheet } from '../../../components/ui/OperationalKit';

export interface CashSessionInspectorModalProps {
  open: boolean;
  sessionId: string | null;
  organizationId: string;
  canManageCash: boolean;
  canEditSales: boolean;
  canDeleteSales: boolean;
  canDeleteCash: boolean;
  onOpenChange: (open: boolean) => void;
  onEditSession: (sessionId: string) => void;
  onCloseOrReopenSession: (sessionId: string, status: string) => void;
  onDeleteSession: (detail: CashMonitorSessionDetail) => void;
  onDataChanged: (message?: string) => void | Promise<void>;
}

const TIME_ZONE = 'America/Guayaquil';

const formatDateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-EC', {
        timeZone: TIME_ZONE,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';

const paymentMethodLabel = (method: string) =>
  ({ cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', other: 'Otro' }[method] || method || 'Otro');

const isProbableTestSale = (sale: CashMonitorLinkedSaleRow) => {
  const hay = `${sale.customer_name || ''} ${sale.note || ''} ${sale.sale_code || ''}`.toLowerCase();
  return hay.includes('prueba') || hay.includes('test') || hay.includes('ejemplo') || Number(sale.total) <= 1;
};

export function CashSessionInspectorModal({
  open,
  sessionId,
  organizationId,
  canManageCash,
  canEditSales,
  canDeleteSales,
  canDeleteCash,
  onOpenChange,
  onEditSession,
  onCloseOrReopenSession,
  onDeleteSession,
  onDataChanged,
}: CashSessionInspectorModalProps) {
  const confirmDialog = useConfirm();
  const [activeTab, setActiveTab] = useState<'sales' | 'movements' | 'audits'>('sales');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<CashMonitorSessionDetail | null>(null);
  const [salesSearch, setSalesSearch] = useState('');
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');

  // Quick movement form
  const [moveDir, setMoveDir] = useState<'in' | 'out'>('in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moveBusy, setMoveBusy] = useState(false);

  // Nested drawers/modals
  const [docSaleTarget, setDocSaleTarget] = useState<{ id: string; code: string } | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDeleteTarget | null>(null);

  const loadDetail = useCallback(async () => {
    if (!open || !sessionId) return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchCashMonitorSessionDetail(sessionId);
      setDetail(next);
      setSelectedSaleIds((prev) =>
        prev.filter((id) => next.linked_sales.some((s) => s.id === id))
      );
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo cargar el detalle del turno.'));
    } finally {
      setLoading(false);
    }
  }, [open, sessionId]);

  useEffect(() => {
    if (!open) {
      setSelectedSaleIds([]);
      setSalesSearch('');
      setNotice('');
      setActiveTab('sales');
      return;
    }
    void loadDetail();
  }, [open, loadDetail]);

  const filteredSales = useMemo(() => {
    const rows = detail?.linked_sales || [];
    const q = salesSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) =>
      `${s.sale_code} ${s.customer_name} ${s.advisor_name} ${s.note || ''}`.toLowerCase().includes(q)
    );
  }, [detail?.linked_sales, salesSearch]);

  const selectedSalesTotal = useMemo(() => {
    const idSet = new Set(selectedSaleIds);
    return (detail?.linked_sales || [])
      .filter((s) => idSet.has(s.id))
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  }, [detail?.linked_sales, selectedSaleIds]);

  const toggleSaleSelection = (saleId: string) => {
    setSelectedSaleIds((curr) =>
      curr.includes(saleId) ? curr.filter((id) => id !== saleId) : [...curr, saleId]
    );
  };

  const selectProbableTests = () => {
    const matched = (detail?.linked_sales || []).filter(isProbableTestSale).map((s) => s.id);
    if (!matched.length) {
      setNotice('No se detectaron ventas con texto de prueba/ejemplo; marca manualmente las casillas.');
      return;
    }
    setSelectedSaleIds(matched);
  };

  const handleRecordMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !detail?.session?.id || moveBusy) return;
    const val = Number(moveAmount);
    if (!Number.isFinite(val) || val <= 0 || moveReason.trim().length < 3) {
      setError('Ingresa un monto mayor a cero y un motivo de al menos 3 caracteres.');
      return;
    }
    setMoveBusy(true);
    setError('');
    try {
      const key = globalThis.crypto?.randomUUID?.() || `mov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { error: rpcErr } = await supabase.rpc('record_cash_session_movement', {
        p_session: detail.session.id,
        p_direction: moveDir,
        p_amount: val,
        p_reason: moveReason.trim(),
        p_key: key,
      });
      if (rpcErr) throw rpcErr;
      setMoveAmount('');
      setMoveReason('');
      setNotice(`${moveDir === 'in' ? 'Entrada' : 'Retiro'} de ${formatMoneyUsd(val)} registrada.`);
      await loadDetail();
      await onDataChanged();
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo registrar el movimiento.'));
    } finally {
      setMoveBusy(false);
    }
  };

  const handleVoidMovement = async (moveId: string, amount: number, reason: string) => {
    if (!supabase || !detail?.session?.id) return;
    const confirmed = await confirmDialog({
      title: 'Anular movimiento de caja',
      description: `Se anulará el movimiento de ${formatMoneyUsd(amount)} (${reason}) y se recalculará el esperado del turno.`,
      tone: 'warning',
      destructive: true,
      confirmLabel: 'Sí, anular movimiento',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;
    setMoveBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('void_cash_session_movement', {
        p_movement_id: moveId,
        p_reason: 'Anulado desde inspector administrativo de caja',
      });
      if (rpcErr) throw rpcErr;
      setNotice('Movimiento anulado correctamente.');
      await loadDetail();
      await onDataChanged();
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo anular el movimiento.'));
    } finally {
      setMoveBusy(false);
    }
  };

  const session = detail?.session;
  const totals = detail?.live_totals;
  const isOpen = session?.status === 'open';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="xl"
        eyebrow="INSPECTOR DETALLADO DE TURNO"
        title={
          session
            ? `${session.register_name || 'Caja libre'} · ${session.branch_name || 'Sucursal'}`
            : 'Cargando turno de caja…'
        }
        description={
          session
            ? `Apertura ${formatDateTime(session.opened_at)} · Estado: ${isOpen ? 'Abierta' : 'Cerrada'}`
            : 'Consultando ventas cobradas, movimientos manuales y cuadre en tiempo real.'
        }
        headerActions={
          <button
            type="button"
            className="vc-dlg-btn variant-outline"
            onClick={() => void loadDetail()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Actualizar
          </button>
        }
        footer={
          <div className="ocm-inspector-footer">
            {session && canDeleteCash && (
              <button
                type="button"
                className="vc-dlg-btn variant-danger"
                onClick={() => detail && onDeleteSession(detail)}
              >
                <Trash2 size={14} /> Eliminar turno de caja
              </button>
            )}
            <div className="ocm-inspector-footer-right">
              {session && (isOpen ? (
                <>
                  <button
                    type="button"
                    className="vc-dlg-btn variant-outline"
                    onClick={() => onEditSession(session.id)}
                  >
                    <Edit3 size={14} /> Editar apertura / asesor
                  </button>
                  <button
                    type="button"
                    className="vc-dlg-btn variant-primary"
                    onClick={() => onCloseOrReopenSession(session.id, 'open')}
                  >
                    Arqueo y cierre
                  </button>
                </>
              ) : (
                canManageCash && (
                  <button
                    type="button"
                    className="vc-dlg-btn variant-outline"
                    onClick={() => onCloseOrReopenSession(session.id, 'closed')}
                  >
                    <RotateCcw size={14} /> Reabrir turno
                  </button>
                )
              ))}
              <button type="button" className="vc-dlg-btn variant-outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </button>
            </div>
          </div>
        }
      >
        {loading && !detail ? (
          <div className="ocm-inspector-loading">
            <Loader2 size={24} className="spin" />
            <span>Calculando cuadre y recopilando ventas vinculadas…</span>
          </div>
        ) : error && !detail ? (
          <DialogCallout tone="danger" role="alert">
            {error}
          </DialogCallout>
        ) : detail && totals && session ? (
          <div className="ocm-inspector-body">
            {error && (
              <DialogCallout tone="danger" role="alert">
                {error}
              </DialogCallout>
            )}
            {notice && (
              <DialogCallout tone="success" role="status">
                {notice}
              </DialogCallout>
            )}

            {/* Fórmula viva del cuadre de efectivo */}
            <section className="ocm-formula-panel" aria-label="Cuadre en vivo del turno">
              <div className="ocm-formula-grid">
                <div>
                  <small>Base inicial</small>
                  <strong>{formatMoneyUsd(totals.opening_cash)}</strong>
                </div>
                <div>
                  <small>+ Ventas efectivo</small>
                  <strong className="is-positive">+{formatMoneyUsd(totals.cash_sales_total)}</strong>
                </div>
                <div>
                  <small>+ Entradas caja</small>
                  <strong className="is-positive">+{formatMoneyUsd(totals.movements_in)}</strong>
                </div>
                <div>
                  <small>− Retiros caja</small>
                  <strong className="is-negative">−{formatMoneyUsd(totals.movements_out)}</strong>
                </div>
                <div className="is-expected">
                  <small>= Efectivo esperado</small>
                  <strong>{formatMoneyUsd(totals.expected_cash)}</strong>
                </div>
              </div>
              <div className="ocm-noncash-strip">
                <span>
                  <Wallet size={13} /> Ventas vinculadas: <b>{totals.sales_count}</b>
                </span>
                <span>Transferencias: <b>{formatMoneyUsd(totals.transfer_sales_total)}</b></span>
                <span>Tarjetas: <b>{formatMoneyUsd(totals.card_sales_total)}</b></span>
                {Number(totals.other_sales_total) > 0 && (
                  <span>Otros: <b>{formatMoneyUsd(totals.other_sales_total)}</b></span>
                )}
              </div>
            </section>

            {/* Sub-tabs */}
            <div className="ocm-inspector-tabs" role="tablist" aria-label="Secciones del turno">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'sales'}
                className={activeTab === 'sales' ? 'is-active' : ''}
                onClick={() => setActiveTab('sales')}
              >
                <ShoppingBag size={14} /> Ventas vinculadas ({detail.linked_sales.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'movements'}
                className={activeTab === 'movements' ? 'is-active' : ''}
                onClick={() => setActiveTab('movements')}
              >
                <ArrowUpFromLine size={14} /> Movimientos ({detail.movements.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'audits'}
                className={activeTab === 'audits' ? 'is-active' : ''}
                onClick={() => setActiveTab('audits')}
              >
                <History size={14} /> Auditoría de turno ({detail.audits.length})
              </button>
            </div>

            {activeTab === 'sales' && (
              <section className="ocm-inspector-section">
                <div className="ocm-inspector-toolbar">
                  <div className="ocm-search-box">
                    <Search size={14} />
                    <input
                      type="search"
                      value={salesSearch}
                      onChange={(e) => setSalesSearch(e.target.value)}
                      placeholder="Buscar por código VEN, cliente o nota…"
                      aria-label="Buscar ventas del turno"
                    />
                  </div>
                  {canDeleteSales && detail.linked_sales.length > 0 && (
                    <div className="ocm-batch-tools">
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={selectProbableTests}
                      >
                        <FlaskConical size={13} /> Detectar pruebas
                      </button>
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() =>
                          setSelectedSaleIds((curr) =>
                            curr.length === filteredSales.length ? [] : filteredSales.map((s) => s.id)
                          )
                        }
                      >
                        <CheckSquare size={13} />{' '}
                        {selectedSaleIds.length === filteredSales.length && filteredSales.length > 0
                          ? 'Desmarcar'
                          : 'Marcar visibles'}
                      </button>
                    </div>
                  )}
                </div>

                {canDeleteSales && selectedSaleIds.length > 0 && (
                  <div className="ocm-batch-bar">
                    <span>
                      <strong>{selectedSaleIds.length}</strong> venta(s) seleccionadas ({formatMoneyUsd(selectedSalesTotal)})
                    </span>
                    <button
                      type="button"
                      className="button ocm-btn-danger"
                      onClick={() =>
                        setDeleteTarget({
                          kind: 'bulk_test',
                          saleIds: selectedSaleIds,
                          sessionIds: [],
                          totalAmount: selectedSalesTotal,
                        })
                      }
                    >
                      <Trash2 size={14} /> Limpiar seleccionadas
                    </button>
                  </div>
                )}

                {filteredSales.length === 0 ? (
                  <div className="ocm-inspector-empty">
                    No hay ventas registradas en este turno que coincidan con el filtro.
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="ocm-inspector-table">
                      <thead>
                        <tr>
                          {canDeleteSales && <th aria-label="Seleccionar" />}
                          <th>Comprobante</th>
                          <th>Cliente</th>
                          <th>Métodos</th>
                          <th>Efectivo caja</th>
                          <th>Total venta</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSales.map((sale) => {
                          const testHint = isProbableTestSale(sale);
                          const isChecked = selectedSaleIds.includes(sale.id);
                          return (
                            <tr key={sale.id} className={isChecked ? 'is-selected' : undefined}>
                              {canDeleteSales && (
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`Seleccionar venta ${sale.sale_code}`}
                                    checked={isChecked}
                                    onChange={() => toggleSaleSelection(sale.id)}
                                  />
                                </td>
                              )}
                              <td>
                                <div className="ocm-cell-stack">
                                  <strong>{sale.sale_code}</strong>
                                  <small>{formatDateTime(sale.created_at)}</small>
                                </div>
                              </td>
                              <td>
                                <div className="ocm-cell-stack">
                                  <span>{sale.customer_name}</span>
                                  {testHint && (
                                    <span className="ocm-test-badge">
                                      <FlaskConical size={11} /> Posible prueba
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="ocm-method-pills">
                                  {(sale.payment_methods || []).map((m) => (
                                    <span key={m} className="ocm-method-pill">
                                      {paymentMethodLabel(m)}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td>
                                <strong>{formatMoneyUsd(sale.cash_in_session)}</strong>
                              </td>
                              <td>
                                <strong>{formatMoneyUsd(sale.total)}</strong>
                              </td>
                              <td>
                                <div className="ocm-row-actions">
                                  <button
                                    type="button"
                                    className="button button-outline"
                                    onClick={() => setDocSaleTarget({ id: sale.id, code: sale.sale_code })}
                                  >
                                    <Eye size={13} /> Ficha
                                  </button>
                                  {canEditSales && (
                                    <button
                                      type="button"
                                      className="button button-outline"
                                      onClick={() => setEditingSaleId(sale.id)}
                                    >
                                      <Edit3 size={13} /> Editar
                                    </button>
                                  )}
                                  {canDeleteSales && (
                                    <button
                                      type="button"
                                      className="button ocm-btn-danger-outline"
                                      onClick={() =>
                                        setDeleteTarget({
                                          kind: 'sale',
                                          saleId: sale.id,
                                          saleCode: sale.sale_code,
                                          customerName: sale.customer_name,
                                          total: Number(sale.total) || 0,
                                          status: sale.status,
                                          paymentMethod: (sale.payment_methods || []).join(', '),
                                          createdAt: sale.created_at,
                                          isLikelyTest: testHint,
                                        })
                                      }
                                    >
                                      <Trash2 size={13} /> Eliminar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {activeTab === 'movements' && (
              <section className="ocm-inspector-section">
                {isOpen && (
                  <form className="open-cash-new-move-form" onSubmit={handleRecordMovement}>
                    <h3>Registrar entrada o retiro en este turno</h3>
                    <div className="open-cash-direction-toggle">
                      <button
                        type="button"
                        className={`direction-btn in ${moveDir === 'in' ? 'active' : ''}`}
                        onClick={() => setMoveDir('in')}
                      >
                        <ArrowDownToLine size={14} /> + Entrada de efectivo
                      </button>
                      <button
                        type="button"
                        className={`direction-btn out ${moveDir === 'out' ? 'active' : ''}`}
                        onClick={() => setMoveDir('out')}
                      >
                        <ArrowUpFromLine size={14} /> − Retiro / gasto
                      </button>
                    </div>
                    <div className="open-cash-move-fields">
                      <label>
                        <span>Monto ($)</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={moveAmount}
                          onChange={(e) => setMoveAmount(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Motivo *</span>
                        <input
                          type="text"
                          required
                          placeholder="Ej.: Sencillo para cambio, compra menor, ajuste"
                          value={moveReason}
                          onChange={(e) => setMoveReason(e.target.value)}
                        />
                      </label>
                    </div>
                    <button type="submit" className="button button-dark" disabled={moveBusy}>
                      <Plus size={14} /> {moveBusy ? 'Guardando…' : 'Guardar movimiento'}
                    </button>
                  </form>
                )}

                {detail.movements.length === 0 ? (
                  <div className="ocm-inspector-empty">No hay movimientos manuales registrados en este turno.</div>
                ) : (
                  <ul className="ocm-movements-feed">
                    {detail.movements.map((move) => (
                      <li
                        key={move.id}
                        className={`move-item ${move.direction} ${move.voided ? 'is-voided' : ''}`}
                      >
                        <div className="move-info">
                          <span className={`move-badge ${move.direction}`}>
                            {move.direction === 'in' ? '+ Entrada' : '− Retiro'}
                          </span>
                          <b>{formatMoneyUsd(move.amount)}</b>
                          <span className="move-reason">
                            {move.reason}
                            {move.voided ? ` · ANULADO (${move.void_reason || 'sin motivo'})` : ''}
                          </span>
                          <span className="move-time">
                            {move.created_by_name} · {formatDateTime(move.created_at)}
                          </span>
                        </div>
                        {!move.voided && isOpen && (
                          <button
                            type="button"
                            className="button button-outline"
                            onClick={() => void handleVoidMovement(move.id, move.amount, move.reason)}
                            disabled={moveBusy}
                          >
                            <Trash2 size={13} /> Anular
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {activeTab === 'audits' && (
              <section className="ocm-inspector-section">
                {detail.audits.length === 0 ? (
                  <div className="ocm-inspector-empty">
                    No existen modificaciones registradas sobre este turno todavía.
                  </div>
                ) : (
                  <div className="ocm-audits-list">
                    {detail.audits.map((audit) => (
                      <article className="ocm-audit-card" key={audit.id}>
                        <header>
                          <strong>{audit.action}</strong>
                          <span>{formatDateTime(audit.created_at)}</span>
                        </header>
                        <p>{audit.reason || 'Sin motivo detallado'}</p>
                        <small>Responsable: {audit.created_by_name}</small>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        ) : null}
      </Dialog>

      <Sheet
        open={Boolean(docSaleTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDocSaleTarget(null);
        }}
        title={docSaleTarget ? `Ficha completa · ${docSaleTarget.code}` : 'Ficha completa'}
        description="Detalle íntegro de productos, pagos, cliente y acciones administrativas."
      >
        {docSaleTarget && (
          <CommercialDocumentDetails
            kind="sale"
            documentId={docSaleTarget.id}
            onAmended={() => {
              void loadDetail();
              void onDataChanged();
            }}
            onDeleted={(msg) => {
              setDocSaleTarget(null);
              setNotice(msg);
              void loadDetail();
              void onDataChanged(msg);
            }}
          />
        )}
      </Sheet>

      <POSSaleEditorModal
        open={Boolean(editingSaleId)}
        saleId={editingSaleId}
        organizationId={organizationId}
        branchName={session?.branch_name || 'Sucursal'}
        onSaved={() => {
          setNotice('Venta actualizada correctamente y cuadre recalculado.');
          void loadDetail();
          void onDataChanged('Venta modificada.');
        }}
        onDeleted={(msg) => {
          setEditingSaleId(null);
          setNotice(msg);
          void loadDetail();
          void onDataChanged(msg);
        }}
        onClose={() => setEditingSaleId(null)}
      />

      <AdminDeleteRecordModal
        open={Boolean(deleteTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        target={deleteTarget}
        onDeleted={async (msg) => {
          setSelectedSaleIds([]);
          setNotice(msg);
          await loadDetail();
          await onDataChanged(msg);
        }}
      />
    </>
  );
}
