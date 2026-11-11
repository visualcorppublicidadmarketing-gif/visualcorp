import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlaskConical, History, Loader2, RefreshCw, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import {
  type AdminDeletionAuditRecord,
  fetchAdminDeletionAudits,
  formatAdminControlError,
  formatMoneyUsd,
} from '../../../lib/adminCashSalesControl';
import { Dialog, DialogCallout } from '../../../components/ui/DialogSystem';

export interface AdminDeletionAuditDrawerProps {
  open: boolean;
  organizationId: string;
  onOpenChange: (open: boolean) => void;
}

const TIME_ZONE = 'America/Guayaquil';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-EC', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const ENTITY_LABEL: Record<string, string> = {
  sale: 'Venta',
  cash_session: 'Turno de caja',
  cash_register: 'Caja registradora',
  cash_movement: 'Movimiento de caja',
  test_batch: 'Lote de pruebas',
};

export function AdminDeletionAuditDrawer({
  open,
  organizationId,
  onOpenChange,
}: AdminDeletionAuditDrawerProps) {
  const [audits, setAudits] = useState<AdminDeletionAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | 'sale' | 'cash_session' | 'cash_register' | 'test_only'>('all');

  const loadAudits = useCallback(async () => {
    if (!open || !organizationId) return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAdminDeletionAudits(organizationId, 100);
      setAudits(rows);
    } catch (err) {
      setError(formatAdminControlError(err, 'No se pudo cargar la bitácora de eliminaciones.'));
    } finally {
      setLoading(false);
    }
  }, [open, organizationId]);

  useEffect(() => {
    if (!open) return;
    void loadAudits();
  }, [open, loadAudits]);

  const filteredAudits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return audits.filter((row) => {
      if (filterKind === 'test_only' && !row.is_test_cleanup) return false;
      if (filterKind !== 'all' && filterKind !== 'test_only' && row.entity_type !== filterKind) return false;
      if (!q) return true;
      return `${row.entity_code || ''} ${row.reason} ${row.created_by_name || ''} ${row.branch_name || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [audits, filterKind, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      eyebrow="TRAZABILIDAD INMUTABLE DE BORRADOS"
      title="Bitácora de eliminaciones administrativas"
      description="Historial protegido de ventas, turnos y cajas eliminados por propietario, administrador o encargado de local."
      headerActions={
        <button type="button" className="vc-dlg-btn variant-outline" onClick={() => void loadAudits()} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : undefined} /> Actualizar
        </button>
      }
      footer={
        <button type="button" className="vc-dlg-btn variant-outline" onClick={() => onOpenChange(false)}>
          Cerrar
        </button>
      }
    >
      <div className="ocm-audit-drawer">
        <div className="ocm-inspector-toolbar">
          <div className="ocm-search-box">
            <Search size={14} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, motivo o usuario…"
              aria-label="Buscar en bitácora de eliminaciones"
            />
          </div>
          <div className="ocm-filter-pills" role="group" aria-label="Filtrar eliminaciones">
            {(
              [
                ['all', 'Todo'],
                ['sale', 'Ventas'],
                ['cash_session', 'Turnos'],
                ['cash_register', 'Cajas reg.'],
                ['test_only', 'Solo pruebas'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filterKind === key ? 'is-active' : ''}
                onClick={() => setFilterKind(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <DialogCallout tone="danger" role="alert">
            {error}
          </DialogCallout>
        )}

        {loading ? (
          <div className="ocm-inspector-loading">
            <Loader2 size={22} className="spin" />
            <span>Consultando registros de auditoría…</span>
          </div>
        ) : filteredAudits.length === 0 ? (
          <div className="ocm-inspector-empty">
            <History size={22} />
            <span>No existen eliminaciones registradas para este filtro todavía.</span>
          </div>
        ) : (
          <div className="ocm-audits-list">
            {filteredAudits.map((row) => {
              const snapSale = (row.snapshot as any)?.sale;
              const snapSession = (row.snapshot as any)?.session;
              const snapAmount =
                snapSale?.total ?? snapSession?.opening_cash ?? null;
              return (
                <article className="ocm-audit-card" key={row.id}>
                  <header>
                    <div className="ocm-audit-title-group">
                      <span className={`ocm-entity-pill type-${row.entity_type}`}>
                        {ENTITY_LABEL[row.entity_type] || row.entity_type}
                      </span>
                      <strong>{row.entity_code || row.entity_id.slice(0, 8)}</strong>
                      {row.is_test_cleanup && (
                        <span className="ocm-test-badge">
                          <FlaskConical size={11} /> Dato de prueba
                        </span>
                      )}
                      {row.restore_inventory && (
                        <span className="ocm-restore-badge">
                          <RotateCcw size={11} /> Stock restaurado
                        </span>
                      )}
                      {row.cascade_sales && (
                        <span className="ocm-cascade-badge">Con ventas en cascada</span>
                      )}
                    </div>
                    <span>{formatDateTime(row.created_at)}</span>
                  </header>
                  <p>{row.reason}</p>
                  <small>
                    <ShieldCheck size={12} /> {row.created_by_name || 'Administrador'} · Sucursal: {row.branch_name || 'Global'}
                    {snapAmount !== null ? ` · Valor respaldo: ${formatMoneyUsd(snapAmount)}` : ''}
                  </small>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
