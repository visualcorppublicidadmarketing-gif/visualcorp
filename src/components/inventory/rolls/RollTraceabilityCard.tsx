import React from 'react';
import { Barcode, Dices, FileText, Layers, Minus, Plus, Tag, User } from 'lucide-react';

export type RollTraceabilityCardProps = {
  tag: string;
  onTagChange: (tag: string) => void;
  onAutoGenerateTag: () => void;
  batchCount: number;
  onBatchCountChange: (count: number) => void;
  operator: string;
  onOperatorChange: (operator: string) => void;
  operatorDefaultName?: string;
  reason: string;
  onReasonChange: (reason: string) => void;
  reference: string;
  onReferenceChange: (reference: string) => void;
  stepNumber?: number;
  disabled?: boolean;
};

const DEFAULT_REASON_CHIPS = [
  '📦 Compra nueva',
  '🔄 Devolución de máquina',
  '🔍 Inventario inicial',
  '✂️ Reingreso de saldo',
];

export const RollTraceabilityCard: React.FC<RollTraceabilityCardProps> = ({
  tag,
  onTagChange,
  onAutoGenerateTag,
  batchCount,
  onBatchCountChange,
  operator,
  onOperatorChange,
  operatorDefaultName = '',
  reason,
  onReasonChange,
  reference,
  onReferenceChange,
  stepNumber = 4,
  disabled = false,
}) => {
  return (
    <div className="roll-reception__card roll-reception__traceability-card">
      <div className="roll-reception__card-header">
        <span className="roll-reception__step-badge">{stepNumber}</span>
        <div className="roll-reception__card-title-group">
          <h3>Identificación y Trazabilidad</h3>
          <p>Código de rollo único y registro del operador responsable</p>
        </div>
      </div>

      <div className="roll-reception__card-body">
        <div className="roll-reception__trace-grid">
          {/* Lote / Tag con botón Auto Dices */}
          <div className="roll-reception__field-group">
            <label className="roll-reception__field">
              <span className="roll-reception__field-label">
                <Barcode size={14} className="roll-reception__field-label-icon" />
                Lote / Código único del rollo
              </span>
              <div className="roll-reception__tag-input-group">
                <input
                  required
                  type="text"
                  value={tag}
                  onChange={(e) => onTagChange(e.target.value)}
                  placeholder="Ej. ROL-VIN-2611-001"
                  disabled={disabled}
                  className="roll-reception__input roll-reception__tag-input"
                />
                <button
                  type="button"
                  className="roll-reception__auto-dice-btn"
                  onClick={onAutoGenerateTag}
                  disabled={disabled}
                  title="Generar código aleatorio con prefijo y fecha de hoy"
                  aria-label="Generar código automático"
                >
                  <Dices size={15} className="roll-reception__dice-icon" />
                  <span>Auto</span>
                </button>
              </div>
            </label>
          </div>

          {/* Stepper de Recepción Múltiple (Batch) con Botones Redondos +- */}
          <div className="roll-reception__field-group">
            <span className="roll-reception__field-label" id="batch-stepper-label">
              <Layers size={14} className="roll-reception__field-label-icon" />
              Cantidad de rollos iguales a recibir
            </span>
            <div
              className="roll-reception__batch-stepper"
              aria-labelledby="batch-stepper-label"
            >
              <div className="roll-reception__stepper-controls">
                <button
                  type="button"
                  disabled={disabled || batchCount <= 1}
                  onClick={() => onBatchCountChange(Math.max(1, batchCount - 1))}
                  className="roll-reception__stepper-round-btn is-minus"
                  aria-label="Disminuir un rollo"
                >
                  <Minus size={14} />
                </button>

                <div className="roll-reception__stepper-display">
                  <strong className="roll-reception__stepper-count">{batchCount}</strong>
                  <span className="roll-reception__stepper-unit">
                    {batchCount === 1 ? 'rollo' : 'rollos'}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={disabled || batchCount >= 20}
                  onClick={() => onBatchCountChange(Math.min(20, batchCount + 1))}
                  className="roll-reception__stepper-round-btn is-plus"
                  aria-label="Aumentar un rollo"
                >
                  <Plus size={14} />
                </button>
              </div>

              <span className="roll-reception__batch-note">
                {batchCount > 1
                  ? `Genera ${batchCount} rollos con sufijos secuenciales (-01, -02...)`
                  : '1 rollo individual'}
              </span>
            </div>
          </div>

          {/* Operador responsable */}
          <div className="roll-reception__field-group">
            <label className="roll-reception__field">
              <span className="roll-reception__field-label">
                <User size={14} className="roll-reception__field-label-icon" />
                Operador responsable
              </span>
              <input
                type="text"
                value={operator}
                onChange={(e) => onOperatorChange(e.target.value)}
                placeholder={operatorDefaultName || 'Nombre del operador'}
                disabled={disabled}
                className="roll-reception__input"
              />
            </label>
          </div>

          {/* Referencia de orden / factura */}
          <div className="roll-reception__field-group">
            <label className="roll-reception__field">
              <span className="roll-reception__field-label">
                <FileText size={14} className="roll-reception__field-label-icon" />
                Referencia de orden / factura (opcional)
              </span>
              <input
                type="text"
                value={reference}
                onChange={(e) => onReferenceChange(e.target.value)}
                placeholder="Ej. Factura #4028 o OT #120"
                disabled={disabled}
                className="roll-reception__input"
              />
            </label>
          </div>
        </div>

        {/* Motivo con chips interactivos */}
        <div className="roll-reception__field-group roll-reception__reason-group">
          <label className="roll-reception__field">
            <span className="roll-reception__field-label">
              <Tag size={14} className="roll-reception__field-label-icon" />
              Motivo de recepción
            </span>
            <input
              required
              type="text"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Motivo del ingreso a bodega"
              disabled={disabled}
              className="roll-reception__input"
            />
          </label>

          <div
            className="roll-reception__reason-chips"
            role="group"
            aria-label="Motivos rápidos de ingreso"
          >
            {DEFAULT_REASON_CHIPS.map((chipText) => {
              const isActive = reason === chipText;
              return (
                <button
                  key={chipText}
                  type="button"
                  className={`roll-reception__reason-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => onReasonChange(chipText)}
                  disabled={disabled}
                  aria-pressed={isActive}
                >
                  {chipText}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
