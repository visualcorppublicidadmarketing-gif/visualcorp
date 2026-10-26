import React from 'react';
import { ArrowLeftRight, ClipboardCheck, MapPin, Package, X } from 'lucide-react';

type MovementForm = { itemId: string; type: string; toBranch?: string; quantity: string; actor: string; reason: string; reference: string };
type InventoryItem = { id: string; name: string; variant?: string; unit?: string; quantity?: number | string | null; sourceStatus?: boolean; branch?: string; variantAttributes?: Record<string, unknown> };
type Props = { movement: MovementForm; item: InventoryItem; branches: string[]; busy: boolean; onChange: (next: MovementForm) => void; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void };

export function InventoryMovementModal({ movement, item, branches, busy, onChange, onClose, onSubmit }: Props) {
  if (!movement || !item) return null;

  const isCount = movement.type === 'ajuste';
  const isTransfer = movement.type === 'transferencia';
  const isReceipt = movement.type === 'entrada';
  const hasMeasuredRoll = isReceipt && Number(item.variantAttributes?.width_cm) > 0;
  const unit = item.unit || 'unidades';
  const countValue = movement.quantity === '' ? null : Number(movement.quantity);
  const countDelta = countValue === null || item.sourceStatus ? null : countValue - Number(item.quantity || 0);
  const number = (value) => new Intl.NumberFormat('es-EC', { maximumFractionDigits: 3 }).format(value);
  const title = isTransfer
    ? 'Traspaso entre sucursales'
    : isReceipt
      ? 'Registrar entrada'
      : isCount
        ? 'Confirmar conteo físico'
        : movement.type === 'merma'
          ? 'Registrar merma'
          : 'Registrar consumo';
  const movementHelp = isCount
    ? 'Anota la cantidad que contaste físicamente. Es el total real, no la diferencia con el saldo.'
    : isReceipt
      ? 'Registra únicamente lo que recibiste y puedes confirmar.'
      : isTransfer
        ? 'El traspaso descuenta de esta sucursal y registra la entrada en la sucursal destino.'
        : movement.type === 'merma'
          ? 'Indica la cantidad que se perdió o quedó inutilizable.'
          : 'Indica cuánto material se utilizó.';

  return (
    <div className="inventory-modal-backdrop inventory-movement-backdrop">
      <form
        className="inventory-modal inventory-movement-modal"
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-movement-title"
        aria-describedby="inventory-movement-help"
      >
        <header className="inventory-movement-header">
          <span className="inventory-movement-icon"><Package size={18}/></span>
          <div className="inventory-movement-title-wrap">
            <span className="inventory-movement-eyebrow">{isCount ? 'CONCILIACIÓN FÍSICA' : 'MOVIMIENTO DE INVENTARIO'}</span>
            <h3 id="inventory-movement-title">{title}</h3>
            <p>{item.name}{item.variant ? ` · ${item.variant}` : ''}</p>
          </div>
          <button type="button" className="inventory-movement-close" aria-label="Cerrar formulario" onClick={onClose} disabled={busy}><X size={17}/></button>
        </header>

        <div className={`inventory-movement-current${item.sourceStatus ? ' is-pending' : ''}`}>
          <div className="inventory-movement-current-icon"><ClipboardCheck size={16}/></div>
          <div>
            <span>{item.sourceStatus ? 'Estado del conteo' : 'Saldo físico confirmado'}</span>
            <strong>{item.sourceStatus ? 'Pendiente de conteo' : `${number(Number(item.quantity || 0))} ${unit}`}</strong>
          </div>
          <span className="inventory-movement-branch"><MapPin size={13}/>{item.branch || 'Sucursal por asignar'}</span>
        </div>

        <p id="inventory-movement-help" className="inventory-movement-help">{movementHelp}</p>

        <div className="inventory-movement-fields">
          <label className="inventory-movement-field inventory-movement-type">
            <span>Tipo de movimiento</span>
            <select value={movement.type} onChange={(event) => onChange({ ...movement, type: event.target.value })}>
              <option value="entrada">Entrada / compra recibida</option>
              <option value="consumo">Consumo interno</option>
              <option value="merma">Merma / desperdicio</option>
              <option value="transferencia">Traspaso a otra sucursal</option>
              <option value="ajuste">Ajuste de conteo físico</option>
            </select>
          </label>

          <label className="inventory-movement-field inventory-movement-quantity">
            <span>{isCount ? 'Cantidad física contada' : hasMeasuredRoll ? 'Metros lineales recibidos' : 'Cantidad'}</span>
            <span className="inventory-movement-quantity-input">
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                required
                value={movement.quantity}
                onChange={(event) => onChange({ ...movement, quantity: event.target.value })}
                placeholder={isCount ? `Total contado en ${unit}` : hasMeasuredRoll ? 'Largo real medido' : `Cantidad en ${unit}`}
                aria-label={isCount ? `Cantidad física contada en ${unit}` : `Cantidad en ${unit}`}
              />
              <em>{unit}</em>
            </span>
            {hasMeasuredRoll && <small>Mide el largo real recibido; 25 m es solo una referencia habitual.</small>}
            {isCount && <span className="inventory-count-preview" aria-live="polite">
              <strong>{countValue === null ? '—' : `${number(countValue)} ${unit}`}</strong>
              <small>{countValue === null
                ? 'Este será el total físico que quedará registrado.'
                : countDelta === null
                  ? 'Este conteo confirmará por primera vez la cantidad física real.'
                  : `Variación frente al conteo confirmado: ${countDelta > 0 ? '+' : ''}${number(countDelta)} ${unit}.`}</small>
            </span>}
          </label>

          {isTransfer && <label className="inventory-movement-field inventory-movement-type">
            <span>Sucursal destino</span>
            <select value={movement.toBranch || ''} onChange={(event) => onChange({ ...movement, toBranch: event.target.value })} required>
              <option value="" disabled>Selecciona una sucursal</option>
              {branches.filter((branch) => branch !== item.branch).map((branch) => <option key={branch} value={branch}>{branch}</option>)}
            </select>
          </label>}

          <label className="inventory-movement-field">
            <span>{isCount ? 'Responsable del conteo' : 'Responsable'}</span>
            <input required value={movement.actor} onChange={(event) => onChange({ ...movement, actor: event.target.value })} placeholder={isCount ? 'Quién realizó el conteo' : 'Quién entrega o utiliza'}/>
          </label>

          <label className="inventory-movement-field">
            <span>{isCount ? 'Motivo u observación' : 'Motivo'}</span>
            <input required value={movement.reason} onChange={(event) => onChange({ ...movement, reason: event.target.value })} placeholder={isCount ? 'Conteo físico, responsable o área' : isReceipt ? 'Compra, reposición…' : isTransfer ? 'Reubicación, solicitud…' : 'Uso, OT o incidencia…'}/>
          </label>

          <label className="inventory-movement-field inventory-movement-reference">
            <span>Referencia o documento <em>Opcional</em></span>
            <input value={movement.reference} onChange={(event) => onChange({ ...movement, reference: event.target.value })} placeholder="Número de OT, factura o solicitud"/>
          </label>
        </div>

        {isTransfer && <div className="inventory-movement-transfer-note"><ArrowLeftRight size={15}/><span>Se requiere saldo disponible suficiente para completar el traspaso.</span></div>}

        <footer className="inventory-movement-footer">
          <button type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="button button-dark" type="submit" disabled={busy}>
            {busy ? 'Guardando…' : isCount ? 'Guardar conteo' : isTransfer ? 'Confirmar traspaso' : 'Registrar movimiento'}
          </button>
        </footer>
      </form>
    </div>
  );
}
