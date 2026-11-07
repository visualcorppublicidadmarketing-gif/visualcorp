import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  ClipboardCheck,
  MapPin,
  Minus,
  Package,
  PackageMinus,
  PackagePlus,
  Plus,
  X,
} from 'lucide-react';

export type MovementForm = {
  itemId: string;
  type: string;
  toBranch?: string;
  toLocation?: string;
  fromLocation?: string;
  quantity: string;
  actor: string;
  reason: string;
  reference: string;
};

export type InventoryItemSummary = {
  id: string;
  name: string;
  variant?: string;
  unit?: string;
  quantity?: number | string | null;
  availableQuantity?: number | string | null;
  reservedQuantity?: number | string | null;
  sourceStatus?: boolean | string | null;
  branch?: string;
  branchId?: string | null;
  location?: string;
  sku?: string;
  variantAttributes?: Record<string, unknown>;
};

type Props = {
  movement: MovementForm;
  item: InventoryItemSummary;
  branches: string[];
  busy: boolean;
  onChange: (next: MovementForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  defaultActor?: string;
  currentUserLabel?: string;
  locationsForBranch?: (branchName: string) => Array<{ id: string; code: string; name: string }>;
};

const REASON_PRESETS: Record<string, string[]> = {
  consumo: ['Producción OT', 'Muestra / Prueba', 'Uso en taller', 'Limpieza de cabezales', 'Rotulación en sitio'],
  merma: ['Falla de impresión', 'Material roto / dañado', 'Merma de calibración', 'Material vencido / deteriorado'],
  entrada: ['Compra a proveedor', 'Reposición de stock', 'Devolución de cliente', 'Ingreso inicial'],
  ajuste: ['Conteo físico mensual', 'Cuadre de inventario', 'Corrección de saldo', 'Ajuste inicial'],
  transferencia: ['Reubicación por producción', 'Solicitud de sucursal', 'Equilibrio de stock'],
};

const ACTOR_PRESETS = ['Esteban', 'Taller', 'Impresión', 'Sublimación', 'Diseño', 'Recepción'];

export function InventoryMovementModal({
  movement,
  item,
  branches,
  busy,
  onChange,
  onClose,
  onSubmit,
  defaultActor = 'Esteban',
  currentUserLabel = 'Usuario autenticado',
  locationsForBranch,
}: Props) {
  if (!movement || !item) return null;

  const currentStock = Number(item.quantity ?? 0);
  const reservedStock = Number(item.reservedQuantity ?? 0);
  const availableStock = Number(
    item.availableQuantity !== undefined
      ? item.availableQuantity
      : currentStock - reservedStock
  );
  const unit = item.unit || 'unidades';
  const hasMeasuredRoll = movement.type === 'entrada' && Number(item.variantAttributes?.width_cm) > 0;

  const numberFormat = (val: number) =>
    new Intl.NumberFormat('es-EC', { maximumFractionDigits: 3 }).format(val);

  const numQty = movement.quantity === '' ? null : Number(movement.quantity);
  const isCount = movement.type === 'ajuste';
  const isTransfer = movement.type === 'transferencia';
  const isReceipt = movement.type === 'entrada';
  const isWaste = movement.type === 'merma';
  const isConsumption = movement.type === 'consumo';

  // Check if requested quantity exceeds available stock (for consumption, waste, or transfer)
  const isReduction = isConsumption || isWaste || isTransfer;
  const isOverAvailable = isReduction && numQty !== null && numQty > availableStock;
  const isQtyValid = numQty !== null && numQty >= 0 && (isCount || numQty > 0);

  // Computed resulting stock preview
  const resultingStock = useMemo(() => {
    if (numQty === null) return null;
    if (isCount) return numQty;
    if (isReceipt) return currentStock + numQty;
    return Math.max(0, currentStock - numQty);
  }, [numQty, isCount, isReceipt, currentStock]);

  const countDelta = isCount && numQty !== null ? numQty - currentStock : null;

  // Stepper handlers
  const adjustQty = (delta: number) => {
    const current = numQty === null ? 0 : numQty;
    const next = Math.max(0, Number((current + delta).toFixed(3)));
    onChange({ ...movement, quantity: String(next) });
  };

  const setExactQty = (val: number) => {
    onChange({ ...movement, quantity: String(val) });
  };

  const handleTypeChange = (newType: string) => {
    let nextReason = movement.reason;
    // Auto-suggest reason if empty or matches previous preset
    const prevPresets = REASON_PRESETS[movement.type] || [];
    if (!nextReason.trim() || prevPresets.includes(nextReason.trim())) {
      nextReason = REASON_PRESETS[newType]?.[0] || '';
    }
    onChange({
      ...movement,
      type: newType,
      reason: nextReason,
      actor: movement.actor || defaultActor,
    });
  };

  // Branch & Location resolution for transfers
  const originLocations = useMemo(() => {
    if (!locationsForBranch || !item.branch) return [];
    return locationsForBranch(item.branch);
  }, [locationsForBranch, item.branch]);

  const targetLocations = useMemo(() => {
    if (!locationsForBranch || !movement.toBranch) return [];
    return locationsForBranch(movement.toBranch);
  }, [locationsForBranch, movement.toBranch]);

  const modalTitle = isTransfer
    ? 'Traspaso entre sucursales'
    : isReceipt
    ? 'Registrar entrada / recepción'
    : isCount
    ? 'Confirmar conteo físico'
    : isWaste
    ? 'Registrar merma o desperdicio'
    : 'Registrar consumo interno';

  return (
    <div
      className="inventory-modal-backdrop inventory-movement-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (!busy && e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="inventory-modal inventory-movement-modal"
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-movement-title"
      >
        {/* Header */}
        <header className="inventory-movement-header">
          <span className="inventory-movement-icon" aria-hidden="true">
            {isReceipt ? (
              <PackagePlus size={20} />
            ) : isCount ? (
              <ClipboardCheck size={20} />
            ) : isWaste ? (
              <AlertTriangle size={20} />
            ) : isTransfer ? (
              <ArrowLeftRight size={20} />
            ) : (
              <PackageMinus size={20} />
            )}
          </span>
          <div className="inventory-movement-title-wrap">
            <span className="inventory-movement-eyebrow">
              {isCount ? 'CONCILIACIÓN FÍSICA' : isTransfer ? 'LOGÍSTICA INTERNA' : 'MOVIMIENTO DE INVENTARIO'}
            </span>
            <h3 id="inventory-movement-title">{modalTitle}</h3>
            <p>
              <strong>{item.name}</strong>
              {item.variant ? ` · ${item.variant}` : ''}
              {item.sku ? ` · ${item.sku}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="inventory-movement-close"
            aria-label="Cerrar modal"
            onClick={onClose}
            disabled={busy}
          >
            <X size={17} />
          </button>
        </header>

        {/* Current Stock Context Badge */}
        <div className={`inventory-movement-current${item.sourceStatus ? ' is-pending' : ''}`}>
          <div className="inventory-movement-current-icon">
            <ClipboardCheck size={16} />
          </div>
          <div className="inventory-movement-current-details">
            <span>{item.sourceStatus ? 'Estado físico' : 'Saldo físico actual'}</span>
            <strong>
              {item.sourceStatus
                ? 'Sin conteo previo'
                : `${numberFormat(currentStock)} ${unit}`}
            </strong>
            {!item.sourceStatus && reservedStock > 0 && (
              <small className="inventory-movement-reserved-hint">
                Disponible: {numberFormat(availableStock)} {unit} ({numberFormat(reservedStock)} reservado)
              </small>
            )}
          </div>
          <span className="inventory-movement-branch">
            <MapPin size={13} />
            {item.branch || 'Sucursal por asignar'}
            {item.location ? ` · ${item.location}` : ' · MAIN'}
          </span>
        </div>

        {/* Segmented Movement Type Tabs */}
        <div className="inventory-movement-type-nav" role="tablist" aria-label="Tipo de movimiento">
          <button
            type="button"
            role="tab"
            aria-selected={isConsumption}
            className={`inventory-movement-tab tab-consumo ${isConsumption ? 'is-active' : ''}`}
            onClick={() => handleTypeChange('consumo')}
          >
            <ArrowUpFromLine size={13} />
            <span>Consumo</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isReceipt}
            className={`inventory-movement-tab tab-entrada ${isReceipt ? 'is-active' : ''}`}
            onClick={() => handleTypeChange('entrada')}
          >
            <ArrowDownToLine size={13} />
            <span>Entrada</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isCount}
            className={`inventory-movement-tab tab-ajuste ${isCount ? 'is-active' : ''}`}
            onClick={() => handleTypeChange('ajuste')}
          >
            <ClipboardCheck size={13} />
            <span>Conteo</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isWaste}
            className={`inventory-movement-tab tab-merma ${isWaste ? 'is-active' : ''}`}
            onClick={() => handleTypeChange('merma')}
          >
            <AlertTriangle size={13} />
            <span>Merma</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isTransfer}
            className={`inventory-movement-tab tab-transferencia ${isTransfer ? 'is-active' : ''}`}
            onClick={() => handleTypeChange('transferencia')}
          >
            <ArrowLeftRight size={13} />
            <span>Traspaso</span>
          </button>
        </div>

        {/* Form Fields */}
        <div className="inventory-movement-fields">
          {/* Quantity Section with Stepper & Quick Presets */}
          <div className="inventory-movement-field inventory-movement-quantity">
            <div className="inventory-movement-label-row">
              <span>
                {isCount
                  ? 'Cantidad física contada (total real en bodega)'
                  : hasMeasuredRoll
                  ? 'Metros lineales recibidos'
                  : 'Cantidad'}
              </span>
              {isReduction && (
                <span className="inventory-movement-avail-badge">
                  Disponible: <b>{numberFormat(availableStock)} {unit}</b>
                </span>
              )}
            </div>

            <div className="inventory-movement-stepper-wrap">
              <button
                type="button"
                className="inventory-movement-step-btn"
                onClick={() => adjustQty(-1)}
                disabled={busy || (numQty !== null && numQty <= 0)}
                aria-label="Disminuir 1"
              >
                <Minus size={15} />
              </button>
              <div className="inventory-movement-quantity-input">
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={isReduction ? availableStock : undefined}
                  step="any"
                  required
                  value={movement.quantity}
                  onChange={(e) => onChange({ ...movement, quantity: e.target.value })}
                  placeholder={isCount ? `Total contado en ${unit}` : `Cantidad en ${unit}`}
                  aria-label={isCount ? 'Cantidad física contada' : 'Cantidad'}
                />
                <em>{unit}</em>
              </div>
              <button
                type="button"
                className="inventory-movement-step-btn"
                onClick={() => adjustQty(1)}
                disabled={busy || (isReduction && numQty !== null && numQty >= availableStock)}
                aria-label="Aumentar 1"
              >
                <Plus size={15} />
              </button>
            </div>

            {/* Quick numeric presets */}
            <div className="inventory-movement-presets" aria-label="Presets rápidos de cantidad">
              {isConsumption && (
                <>
                  {[1, 2, 5, 10].filter((n) => n <= availableStock).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`inventory-preset-chip ${numQty === n ? 'is-selected' : ''}`}
                      onClick={() => setExactQty(n)}
                    >
                      {n}
                    </button>
                  ))}
                  {availableStock > 0 && (
                    <button
                      type="button"
                      className={`inventory-preset-chip is-highlight ${numQty === availableStock ? 'is-selected' : ''}`}
                      onClick={() => setExactQty(availableStock)}
                    >
                      Todo ({numberFormat(availableStock)})
                    </button>
                  )}
                </>
              )}

              {isReceipt && (
                <>
                  {[1, 2, 5, 10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="inventory-preset-chip"
                      onClick={() => adjustQty(n)}
                    >
                      +{n}
                    </button>
                  ))}
                </>
              )}

              {isCount && (
                <>
                  <button
                    type="button"
                    className={`inventory-preset-chip ${numQty === 0 ? 'is-selected' : ''}`}
                    onClick={() => setExactQty(0)}
                  >
                    0 (Agotado)
                  </button>
                  {currentStock > 0 && (
                    <button
                      type="button"
                      className={`inventory-preset-chip ${numQty === currentStock ? 'is-selected' : ''}`}
                      onClick={() => setExactQty(currentStock)}
                    >
                      Igual ({numberFormat(currentStock)})
                    </button>
                  )}
                  {[-1, +1, +5, +10].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      className="inventory-preset-chip"
                      onClick={() => adjustQty(delta)}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </>
              )}

              {isWaste && (
                <>
                  {[0.5, 1, 2, 5].filter((n) => n <= availableStock).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`inventory-preset-chip ${numQty === n ? 'is-selected' : ''}`}
                      onClick={() => setExactQty(n)}
                    >
                      {n}
                    </button>
                  ))}
                  {availableStock > 0 && (
                    <button
                      type="button"
                      className="inventory-preset-chip is-highlight"
                      onClick={() => setExactQty(availableStock)}
                    >
                      Todo ({numberFormat(availableStock)})
                    </button>
                  )}
                </>
              )}

              {isTransfer && (
                <>
                  {[1, 2, 5, 10].filter((n) => n <= availableStock).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`inventory-preset-chip ${numQty === n ? 'is-selected' : ''}`}
                      onClick={() => setExactQty(n)}
                    >
                      {n}
                    </button>
                  ))}
                  {availableStock > 0 && (
                    <button
                      type="button"
                      className="inventory-preset-chip is-highlight"
                      onClick={() => setExactQty(availableStock)}
                    >
                      Todo ({numberFormat(availableStock)})
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Live Calculation / Validation Preview */}
            {isOverAvailable ? (
              <div className="inventory-movement-alert danger" role="alert">
                <AlertTriangle size={15} />
                <span>
                  Cantidad solicitada (<strong>{numberFormat(numQty || 0)} {unit}</strong>) supera el stock disponible (<strong>{numberFormat(availableStock)} {unit}</strong>).
                </span>
              </div>
            ) : resultingStock !== null ? (
              <div className="inventory-count-preview" aria-live="polite">
                <strong>
                  Saldo resultante: {numberFormat(resultingStock)} {unit}
                </strong>
                <small>
                  {isCount
                    ? countDelta === null
                      ? 'Confirmará el saldo físico inicial.'
                      : `Variación auditada: ${countDelta > 0 ? '+' : ''}${numberFormat(countDelta)} ${unit}.`
                    : isReceipt
                    ? `Ingresarán +${numberFormat(numQty || 0)} ${unit} al stock de bodega.`
                    : isTransfer
                    ? `Quedarán ${numberFormat(resultingStock)} ${unit} en ${item.branch}.`
                    : `Se descontarán −${numberFormat(numQty || 0)} ${unit} de bodega.`}
                </small>
              </div>
            ) : null}
          </div>

          {/* Transfer Route Controls */}
          {isTransfer && (
            <div className="inventory-movement-field inventory-movement-transfer-fields">
              <label>
                <span>Sucursal destino</span>
                <select
                  required
                  value={movement.toBranch || ''}
                  onChange={(e) => {
                    const nextBranch = e.target.value;
                    const nextLocs = locationsForBranch ? locationsForBranch(nextBranch) : [];
                    onChange({
                      ...movement,
                      toBranch: nextBranch,
                      toLocation: nextLocs.find((l) => l.code === 'MAIN')?.code || nextLocs[0]?.code || 'MAIN',
                    });
                  }}
                >
                  <option value="" disabled>
                    Selecciona una sucursal destino
                  </option>
                  {branches
                    .filter((b) => b !== item.branch)
                    .map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                </select>
              </label>

              {targetLocations.length > 0 && (
                <label>
                  <span>Ubicación destino</span>
                  <select
                    value={movement.toLocation || ''}
                    onChange={(e) => onChange({ ...movement, toLocation: e.target.value })}
                  >
                    {targetLocations.map((loc) => (
                      <option key={loc.id} value={loc.code}>
                        {loc.code} · {loc.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {/* Count authorship comes from the authenticated Supabase user. */}
          {isCount ? (
            <p className="inventory-movement-actor-auto" role="status">
              Conteo registrado automáticamente a nombre de <strong>{currentUserLabel}</strong>.
            </p>
          ) : (
            <div className="inventory-movement-field">
              <span>Responsable</span>
              <input
                required
                value={movement.actor}
                onChange={(e) => onChange({ ...movement, actor: e.target.value })}
                placeholder="Quién entrega o utiliza"
              />
              <div className="inventory-movement-chips" aria-label="Responsables frecuentes">
                {ACTOR_PRESETS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`inventory-chip ${movement.actor === name ? 'is-selected' : ''}`}
                    onClick={() => onChange({ ...movement, actor: name })}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Motivo / Reason Field + Quick Chips */}
          <div className="inventory-movement-field">
            <span>{isCount ? 'Motivo u observación' : 'Motivo'}</span>
            <input
              required
              value={movement.reason}
              onChange={(e) => onChange({ ...movement, reason: e.target.value })}
              placeholder={
                isCount
                  ? 'Conteo físico, cuadre o área'
                  : isReceipt
                  ? 'Compra, reposición…'
                  : isTransfer
                  ? 'Reubicación, solicitud…'
                  : 'OT, trabajo, uso o incidencia…'
              }
            />
            <div className="inventory-movement-chips" aria-label="Motivos sugeridos">
              {(REASON_PRESETS[movement.type] || []).map((text) => (
                <button
                  key={text}
                  type="button"
                  className={`inventory-chip ${movement.reason === text ? 'is-selected' : ''}`}
                  onClick={() => onChange({ ...movement, reason: text })}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {/* Document / Reference Field */}
          <label className="inventory-movement-field inventory-movement-reference">
            <span>
              Referencia o documento <em>Opcional</em>
            </span>
            <input
              value={movement.reference}
              onChange={(e) => onChange({ ...movement, reference: e.target.value })}
              placeholder="Número de OT, orden de compra, factura o remisión"
            />
          </label>
        </div>

        {/* Footer */}
        <footer className="inventory-movement-footer">
          <button
            type="button"
            className="button button-outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            className="button button-dark"
            type="submit"
            disabled={busy || !isQtyValid || isOverAvailable}
          >
            <Check size={14} />
            {busy
              ? 'Guardando…'
              : isCount
              ? 'Guardar conteo físico'
              : isTransfer
              ? 'Confirmar traspaso'
              : isReceipt
              ? 'Registrar entrada'
              : isWaste
              ? 'Registrar merma'
              : 'Registrar consumo'}
          </button>
        </footer>
      </form>
    </div>
  );
}
