import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import './admin-delete-modal.css';
import {
  Dialog,
  DialogCallout,
  DialogConsequenceList,
  DialogKeyValueList,
  DialogSection,
} from './ui/DialogSystem';
import {
  bulkCleanupTestRecords,
  deleteCashRegister,
  deleteCashSession,
  deletePosSale,
  formatAdminControlError,
  formatMoneyUsd,
} from '../lib/adminCashSalesControl';

export type AdminDeleteTarget =
  | {
      kind: 'sale';
      saleId: string;
      saleCode: string;
      customerName?: string;
      total?: number;
      status?: string;
      paymentMethod?: string;
      createdAt?: string;
      isLikelyTest?: boolean;
    }
  | {
      kind: 'session';
      sessionId: string;
      registerName?: string;
      branchName?: string;
      advisorName?: string;
      openingCash?: number;
      status?: string;
      salesCount?: number;
      movementsCount?: number;
      openedAt?: string;
    }
  | {
      kind: 'register';
      registerId: string;
      registerName: string;
      branchName?: string;
      active?: boolean;
    }
  | {
      kind: 'bulk_test';
      saleIds: string[];
      sessionIds: string[];
      saleCodes?: string[];
      totalAmount?: number;
    };

export interface AdminDeleteRecordModalProps {
  target: AdminDeleteTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (summaryMessage: string, rawResult?: unknown) => void | Promise<void>;
}

const PRESET_REASONS: Record<AdminDeleteTarget['kind'], string[]> = {
  sale: [
    'Venta de ejemplo / prueba',
    'Error en monto o método de pago',
    'Venta duplicada por accidente',
    'Cliente o detalle equivocado',
  ],
  session: [
    'Error en saldo inicial',
    'Caja de prueba o ejemplo',
    'Sucursal o asesor equivocado',
    'Turno abierto por accidente',
  ],
  register: [
    'Caja duplicada o de prueba',
    'Caja ya no opera en este local',
  ],
  bulk_test: [
    'Limpieza de ventas y turnos de ejemplo',
    'Pruebas operativas de plataforma completadas',
  ],
};

function looksLikeTestSale(target: AdminDeleteTarget | null): boolean {
  if (!target) return false;
  if (target.kind === 'bulk_test') return true;
  if (target.kind === 'sale') {
    if (target.isLikelyTest) return true;
    const text = `${target.customerName || ''} ${target.saleCode || ''}`.toLowerCase();
    return text.includes('prueba') || text.includes('test') || text.includes('ejemplo');
  }
  return false;
}

export function AdminDeleteRecordModal({
  target,
  open,
  onOpenChange,
  onDeleted,
}: AdminDeleteRecordModalProps) {
  const [reason, setReason] = useState('');
  const [restoreInventory, setRestoreInventory] = useState(true);
  const [isTestCleanup, setIsTestCleanup] = useState(false);
  const [cascadeSales, setCascadeSales] = useState(false);
  const [detachSessions, setDetachSessions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !target) return;
    const testDefault = looksLikeTestSale(target);
    setReason(
      target.kind === 'bulk_test'
        ? 'Limpieza de ventas y turnos de ejemplo'
        : testDefault
        ? 'Venta de ejemplo / prueba'
        : ''
    );
    setRestoreInventory(true);
    setIsTestCleanup(testDefault);
    setCascadeSales(false);
    setDetachSessions(true);
    setBusy(false);
    setError('');
  }, [open, target]);

  const title = useMemo(() => {
    if (!target) return 'Eliminar registro';
    if (target.kind === 'sale') return `Eliminar venta ${target.saleCode || target.saleId.slice(0, 8)}`;
    if (target.kind === 'session') return 'Eliminar turno de caja';
    if (target.kind === 'register') return `Eliminar caja registradora "${target.registerName}"`;
    return `Limpieza de pruebas (${target.saleIds.length} ventas · ${target.sessionIds.length} turnos)`;
  }, [target]);

  const eyebrow = useMemo(() => {
    if (!target) return 'CONTROL ADMINISTRATIVO';
    return target.kind === 'bulk_test' || isTestCleanup
      ? 'LIMPIEZA DE DATOS DE PRUEBA'
      : 'ELIMINACIÓN PERMANENTE AUDITADA';
  }, [target, isTestCleanup]);

  const summaryItems = useMemo(() => {
    if (!target) return [];
    if (target.kind === 'sale') {
      return [
        { label: 'Comprobante', value: target.saleCode || target.saleId.slice(0, 8), tone: 'highlight' as const },
        { label: 'Cliente', value: target.customerName || 'Consumidor final' },
        { label: 'Total', value: formatMoneyUsd(target.total ?? 0), tone: 'danger' as const },
        { label: 'Estado', value: target.status || 'confirmada' },
      ];
    }
    if (target.kind === 'session') {
      return [
        { label: 'Caja / Sucursal', value: `${target.registerName || 'Caja libre'} · ${target.branchName || 'Sucursal'}`, tone: 'highlight' as const },
        { label: 'Asesor / Apertura', value: target.advisorName || 'Asesor' },
        { label: 'Base inicial', value: formatMoneyUsd(target.openingCash ?? 0) },
        { label: 'Ventas vinculadas', value: `${target.salesCount ?? 0}` },
      ];
    }
    if (target.kind === 'register') {
      return [
        { label: 'Caja', value: target.registerName, tone: 'highlight' as const },
        { label: 'Sucursal', value: target.branchName || 'Sucursal' },
        { label: 'Estado', value: target.active === false ? 'Inactiva' : 'Activa' },
      ];
    }
    return [
      { label: 'Ventas seleccionadas', value: `${target.saleIds.length}`, tone: 'danger' as const },
      { label: 'Turnos seleccionados', value: `${target.sessionIds.length}`, tone: 'danger' as const },
      ...(typeof target.totalAmount === 'number'
        ? [{ label: 'Monto agregado ventas', value: formatMoneyUsd(target.totalAmount) }]
        : []),
    ];
  }, [target]);

  const consequences = useMemo(() => {
    if (!target) return [];
    if (target.kind === 'sale') {
      return [
        'Elimina definitivamente la venta, sus líneas, pagos, entregas, órdenes de producción asociadas sin órdenes de compra activas y movimientos ligados a caja.',
        restoreInventory
          ? 'Reversa los descuentos de stock, reservas pendientes y metros físicos consumidos en rollos activos.'
          : 'Conservará los saldos actuales de inventario sin revertir salidas.',
        'Recalcula automáticamente los totales esperados y diferencias de cualquier caja cerrada vinculada.',
        'Si provenía de una cotización aceptada, la devuelve a estado aceptada para no perder el historial comercial.',
      ];
    }
    if (target.kind === 'session') {
      return [
        'Elimina el turno de caja, sus entradas/salidas manuales y sus registros de auditoría de turno.',
        cascadeSales
          ? 'ELIMINARÁ también todas las ventas y cobros asociados a esta sesión (ideal para turnos completos de ejemplo o prueba).'
          : 'Desvinculará los pagos existentes de la sesión eliminada y revertirá a pendiente cualquier reembolso en efectivo ligado a esta caja.',
        'La operación queda registrada de forma inmutable en la bitácora de eliminaciones administrativas.',
      ];
    }
    if (target.kind === 'register') {
      return [
        'Elimina la caja registradora y sus metas semanales configuradas.',
        'Conserva el historial de turnos cerrados desvinculados (no se permite borrar si existe un turno abierto).',
      ];
    }
    return [
      'Borra en lote las ventas de ejemplo/prueba y/o los turnos seleccionados en una sola operación.',
      restoreInventory
        ? 'Restaura inventario, reservas y metraje de rollos por cada venta eliminada.'
        : 'No modifica inventarios ni metros de rollo existentes.',
      'Recalcula cajas cerradas afectadas y registra cada borrado en la bitácora administrativa.',
    ];
  }, [target, restoreInventory, cascadeSales]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!target || busy) return;
    if (reason.trim().length < 3) {
      setError('Indica un motivo claro (mínimo 3 caracteres) para dejar respaldo en auditoría.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (target.kind === 'sale') {
        const res = await deletePosSale({
          saleId: target.saleId,
          reason,
          restoreInventory,
          isTest: isTestCleanup,
        });
        const suffix = res.restored_rolls > 0 || res.restored_inventory_variants > 0
          ? ` Stock restaurado (${res.restored_inventory_variants} SKU / ${res.restored_rolls} rollos).`
          : '';
        await onDeleted(`Venta ${res.sale_code || target.saleCode} eliminada permanentemente.${suffix}`, res);
      } else if (target.kind === 'session') {
        const res = await deleteCashSession({
          sessionId: target.sessionId,
          reason,
          cascadeSales,
          restoreInventory,
          isTest: isTestCleanup,
        });
        const detail = res.cascade_sales
          ? ` y ${res.deleted_sales_count} venta(s) vinculada(s)`
          : res.detached_payments_count > 0
          ? ` (${res.detached_payments_count} cobros desvinculados)`
          : '';
        await onDeleted(`Turno de caja eliminado${detail}.`, res);
      } else if (target.kind === 'register') {
        const res = await deleteCashRegister({
          registerId: target.registerId,
          reason,
          detachSessions,
        });
        await onDeleted(`Caja registradora "${res.name}" eliminada.`, res);
      } else {
        const res = await bulkCleanupTestRecords({
          saleIds: target.saleIds,
          sessionIds: target.sessionIds,
          reason,
          restoreInventory,
        });
        await onDeleted(
          `Limpieza completada: ${res.deleted_sales_count} ventas y ${res.deleted_sessions_count} turnos eliminados.`,
          res
        );
      }
      onOpenChange(false);
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo completar la eliminación.'));
    } finally {
      setBusy(false);
    }
  }

  const formId = 'vc-admin-delete-form';
  const presets = target ? PRESET_REASONS[target.kind] : [];

  return (
    <Dialog
      open={open && Boolean(target)}
      onOpenChange={onOpenChange}
      role="alertdialog"
      tone="danger"
      size="md"
      eyebrow={eyebrow}
      title={title}
      description="Acción exclusiva de propietario, administrador o encargado de local. Queda guardada con snapshot en la bitácora administrativa."
      busy={busy}
      closeOnOverlayClick={!busy}
      closeOnEscape={!busy}
      footer={
        <>
          <button
            type="button"
            className="vc-dlg-btn variant-outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            form={formId}
            className="vc-dlg-btn variant-danger"
            disabled={busy || reason.trim().length < 3}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
            {target?.kind === 'bulk_test' ? 'Limpiar registros de prueba' : 'Eliminar permanentemente'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="ocm-delete-form">
        <DialogSection title="Resumen del registro">
          <DialogKeyValueList items={summaryItems} />
        </DialogSection>

        <DialogSection title="Motivo de eliminación y trazabilidad">
          <div className="ocm-reason-chips" role="group" aria-label="Motivos rápidos">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`ocm-reason-chip ${reason.trim() === preset ? 'is-active' : ''}`}
                onClick={() => {
                  setReason(preset);
                  if (preset.toLowerCase().includes('prueba') || preset.toLowerCase().includes('ejemplo')) {
                    setIsTestCleanup(true);
                  }
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          <label className="ocm-delete-label">
            <span>Motivo exacto (obligatorio)</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Venta de ejemplo ingresada para probar el flujo o caja abierta con saldo inicial incorrecto..."
              required
              minLength={3}
              maxLength={450}
              data-autofocus
            />
          </label>

          <div className="ocm-delete-options">
            {(target?.kind === 'sale' || target?.kind === 'session' || target?.kind === 'bulk_test') && (
              <label className="ocm-delete-check">
                <input
                  type="checkbox"
                  checked={restoreInventory}
                  onChange={(e) => setRestoreInventory(e.target.checked)}
                />
                <span>
                  <RotateCcw size={14} /> Restaurar stock, reservas y metros de rollo descontados
                </span>
              </label>
            )}

            {(target?.kind === 'sale' || target?.kind === 'session') && (
              <label className="ocm-delete-check">
                <input
                  type="checkbox"
                  checked={isTestCleanup}
                  onChange={(e) => setIsTestCleanup(e.target.checked)}
                />
                <span>
                  <FlaskConical size={14} /> Marcar como limpieza de datos de prueba / ejemplo
                </span>
              </label>
            )}

            {target?.kind === 'session' && (
              <label className="ocm-delete-check is-danger-option">
                <input
                  type="checkbox"
                  checked={cascadeSales}
                  onChange={(e) => setCascadeSales(e.target.checked)}
                />
                <span>
                  <AlertTriangle size={14} /> Eliminar también en cascada las ventas cobradas dentro de este turno
                </span>
              </label>
            )}

            {target?.kind === 'register' && (
              <label className="ocm-delete-check">
                <input
                  type="checkbox"
                  checked={detachSessions}
                  onChange={(e) => setDetachSessions(e.target.checked)}
                />
                <span>Conservar turnos históricos cerrados desvinculándolos de esta caja</span>
              </label>
            )}
          </div>
        </DialogSection>

        {target?.kind === 'session' && cascadeSales && (
          <DialogCallout tone="danger">
            <strong>Modo cascada activado:</strong> se borrarán todas las ventas vinculadas a esta caja{' '}
            {restoreInventory ? 'y se devolverá el stock consumido.' : 'sin modificar el stock actual.'}
          </DialogCallout>
        )}

        <DialogConsequenceList title="Impacto de la operación" items={consequences} tone="danger" />

        {error && (
          <DialogCallout tone="danger" role="alert">
            {error}
          </DialogCallout>
        )}
      </form>
    </Dialog>
  );
}
