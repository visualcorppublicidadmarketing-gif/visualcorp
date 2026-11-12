import React from 'react';
import { AlertTriangle, Boxes, Check, Ruler, Scissors, Sparkles } from 'lucide-react';
import type { RollCondition } from './types';

export type RollDimensionsCardProps = {
  width: string;
  onWidthChange: (width: string) => void;
  nominalLength: string;
  onNominalLengthChange: (length: string) => void;
  condition: RollCondition;
  onConditionChange: (condition: RollCondition) => void;
  remainingMeters: string;
  onRemainingMetersChange: (meters: string) => void;
  stepNumber?: number;
  disabled?: boolean;
};

const WIDTH_PRESETS = [107, 127, 152, 310];
const LENGTH_PRESETS = [30, 50, 100];

export const RollDimensionsCard: React.FC<RollDimensionsCardProps> = ({
  width,
  onWidthChange,
  nominalLength,
  onNominalLengthChange,
  condition,
  onConditionChange,
  remainingMeters,
  onRemainingMetersChange,
  stepNumber = 3,
  disabled = false,
}) => {
  const nominalNum = Number(nominalLength) || 0;
  const remainingNum = Number(remainingMeters) || 0;
  const percent = nominalNum > 0 ? Math.min(100, Math.max(0, (remainingNum / nominalNum) * 100)) : 100;
  const isOverflow = nominalNum > 0 && remainingNum > nominalNum;

  const handleSelectCondition = (nextCondition: RollCondition) => {
    onConditionChange(nextCondition);
    if (nextCondition === 'full') {
      onRemainingMetersChange(nominalLength || '50');
    }
  };

  const handleNominalChange = (newNominal: string) => {
    onNominalLengthChange(newNominal);
    if (condition === 'full') {
      onRemainingMetersChange(newNominal);
    }
  };

  return (
    <div className="roll-reception__card roll-reception__dimensions-card">
      <div className="roll-reception__card-header">
        <span className="roll-reception__step-badge">{stepNumber}</span>
        <div className="roll-reception__card-title-group">
          <h3>Dimensiones y Metros a Ingresar</h3>
          <p>Ancho en cm y largo en metros lineales</p>
        </div>
      </div>

      <div className="roll-reception__card-body">
        <div className="roll-reception__dimensions-row">
          {/* Ancho Nominal */}
          <div className="roll-reception__field-group">
            <label className="roll-reception__field">
              <span className="roll-reception__field-label">
                <Ruler size={14} className="roll-reception__field-label-icon" />
                Ancho nominal
              </span>
              <div className="roll-reception__input-unit-wrapper">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={width}
                  onChange={(e) => onWidthChange(e.target.value)}
                  placeholder="127"
                  disabled={disabled}
                  className="roll-reception__input-unit"
                />
                <span className="roll-reception__unit-suffix" aria-hidden="true">cm</span>
              </div>
            </label>
            <div
              className="roll-reception__segment-pills"
              role="group"
              aria-label="Medidas de ancho estándar"
            >
              {WIDTH_PRESETS.map((w) => {
                const isActive = Number(width) === w;
                return (
                  <button
                    key={w}
                    type="button"
                    className={`roll-reception__segment-pill ${isActive ? 'is-active' : ''}`}
                    onClick={() => onWidthChange(String(w))}
                    disabled={disabled}
                    aria-pressed={isActive}
                  >
                    {w} cm
                  </button>
                );
              })}
            </div>
          </div>

          {/* Largo Nominal Total */}
          <div className="roll-reception__field-group">
            <label className="roll-reception__field">
              <span className="roll-reception__field-label">
                <Boxes size={14} className="roll-reception__field-label-icon" />
                Largo nominal total
              </span>
              <div className="roll-reception__input-unit-wrapper">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={nominalLength}
                  onChange={(e) => handleNominalChange(e.target.value)}
                  placeholder="50"
                  disabled={disabled}
                  className="roll-reception__input-unit"
                />
                <span className="roll-reception__unit-suffix" aria-hidden="true">m</span>
              </div>
            </label>
            <div
              className="roll-reception__segment-pills"
              role="group"
              aria-label="Metrajes de largo estándar"
            >
              {LENGTH_PRESETS.map((l) => {
                const isActive = Number(nominalLength) === l;
                return (
                  <button
                    key={l}
                    type="button"
                    className={`roll-reception__segment-pill ${isActive ? 'is-active' : ''}`}
                    onClick={() => handleNominalChange(String(l))}
                    disabled={disabled}
                    aria-pressed={isActive}
                  >
                    {l} m
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selector Visual de Condición (2 Tarjetas Interactivas) */}
        <div className="roll-reception__condition-section">
          <span className="roll-reception__field-label" id="condition-selector-label">
            Condición del rollo a recibir:
          </span>

          <div
            className="roll-reception__condition-cards-grid"
            role="radiogroup"
            aria-labelledby="condition-selector-label"
          >
            {/* Tarjeta: Rollo Nuevo Completo */}
            <button
              type="button"
              role="radio"
              aria-checked={condition === 'full'}
              disabled={disabled}
              className={`roll-reception__condition-card ${condition === 'full' ? 'is-active' : ''}`}
              onClick={() => handleSelectCondition('full')}
            >
              <div className="roll-reception__condition-card-header">
                <div className="roll-reception__condition-icon is-full" aria-hidden="true">
                  <Sparkles size={20} />
                </div>
                <div className="roll-reception__condition-badge">100% Íntegro</div>
              </div>

              <div className="roll-reception__condition-content">
                <strong>Rollo nuevo completo</strong>
                <p>Bobina cerrada de fábrica ({nominalLength || 50} metros lineales directos)</p>
              </div>

              <div className="roll-reception__condition-selection-indicator" aria-hidden="true">
                {condition === 'full' && <Check size={14} />}
              </div>
            </button>

            {/* Tarjeta: Rollo Empezado / Parcial */}
            <button
              type="button"
              role="radio"
              aria-checked={condition === 'partial'}
              disabled={disabled}
              className={`roll-reception__condition-card ${condition === 'partial' ? 'is-active' : ''}`}
              onClick={() => handleSelectCondition('partial')}
            >
              <div className="roll-reception__condition-card-header">
                <div className="roll-reception__condition-icon is-partial" aria-hidden="true">
                  <Scissors size={20} />
                </div>
                <div className="roll-reception__condition-badge is-warning">Saldo / Retazo</div>
              </div>

              <div className="roll-reception__condition-content">
                <strong>Rollo empezado / parcial</strong>
                <p>Bobina abierta con consumo previo o sobrante de taller a inventariar</p>
              </div>

              <div className="roll-reception__condition-selection-indicator" aria-hidden="true">
                {condition === 'partial' && <Check size={14} />}
              </div>
            </button>
          </div>

          {/* Entrada Dinámica de Metros Restantes (cuando es parcial) */}
          {condition === 'partial' && (
            <div className="roll-reception__partial-panel">
              <div className="roll-reception__partial-input-group">
                <label className="roll-reception__field">
                  <span className="roll-reception__field-label">
                    Metros restantes medidos / calculados:
                  </span>
                  <div className="roll-reception__input-unit-wrapper">
                    <input
                      required
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={remainingMeters}
                      onChange={(e) => onRemainingMetersChange(e.target.value)}
                      placeholder="Ej. 35.5"
                      disabled={disabled}
                      className="roll-reception__input-unit"
                      autoFocus
                    />
                    <span className="roll-reception__unit-suffix" aria-hidden="true">m</span>
                  </div>
                </label>

                {/* Porcentaje y barra de saldo visual */}
                <div className="roll-reception__partial-meter-box">
                  <div className="roll-reception__meter-stats">
                    <span className="roll-reception__meter-title">Saldo proporcional:</span>
                    <strong className="roll-reception__meter-value">
                      {nominalNum > 0 ? `${percent.toFixed(1)}%` : '—'}
                    </strong>
                  </div>
                  <div className="roll-reception__meter-bar" aria-hidden="true">
                    <div
                      className={`roll-reception__meter-bar-fill ${percent < 25 ? 'is-low' : ''}`}
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>
                </div>
              </div>

              {isOverflow && (
                <div className="roll-reception__alert is-warning" role="alert">
                  <AlertTriangle size={15} />
                  <span>Los metros restantes ({remainingMeters}m) superan el largo nominal ({nominalLength}m). Verifica la medida.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
