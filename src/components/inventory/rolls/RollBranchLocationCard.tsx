import React from 'react';
import { Building2, Check, MapPin, Warehouse } from 'lucide-react';
import type { Branch, LocationOption } from './types';

export type RollBranchLocationCardProps = {
  branches: Branch[];
  formBranchId: string;
  onSelectBranch: (branchId: string) => void;
  location: string;
  onChangeLocation: (locationCode: string) => void;
  activeLocations: LocationOption[];
  stepNumber?: number;
  disabled?: boolean;
};

export const RollBranchLocationCard: React.FC<RollBranchLocationCardProps> = ({
  branches,
  formBranchId,
  onSelectBranch,
  location,
  onChangeLocation,
  activeLocations,
  stepNumber = 1,
  disabled = false,
}) => {
  return (
    <div className="roll-reception__card roll-reception__branch-card">
      <div className="roll-reception__card-header">
        <span className="roll-reception__step-badge">{stepNumber}</span>
        <div className="roll-reception__card-title-group">
          <h3>Destino del rollo</h3>
          <p>Selecciona la sucursal y bodega de recepción (Visual Corp por defecto)</p>
        </div>
      </div>

      <div className="roll-reception__card-body">
        {/* Selector de Sucursal */}
        <div className="roll-reception__field-group">
          <span className="roll-reception__field-label" id="branch-select-label">
            <Building2 size={14} className="roll-reception__field-label-icon" />
            Sucursal asignada:
          </span>
          <div
            className="roll-reception__branch-pills"
            role="radiogroup"
            aria-labelledby="branch-select-label"
          >
            {branches.map((b) => {
              const isSelected = formBranchId === b.id;
              const isVisualCorp = b.name.toLowerCase().includes('visual');
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={disabled}
                  className={`roll-reception__branch-pill ${isSelected ? 'is-active' : ''}`}
                  onClick={() => onSelectBranch(b.id)}
                >
                  <span className="roll-reception__branch-icon" aria-hidden="true">
                    {isVisualCorp ? '🏢' : '🖨️'}
                  </span>
                  <span className="roll-reception__branch-name">
                    {isVisualCorp ? 'Visual Corp' : b.name}
                  </span>
                  {isSelected && (
                    <Check size={14} className="roll-reception__pill-check" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selector de Ubicación interna en bodega */}
        <div className="roll-reception__field-group">
          <label className="roll-reception__field">
            <span className="roll-reception__field-label">
              <Warehouse size={14} className="roll-reception__field-label-icon" />
              Ubicación interna en bodega
            </span>
            <div className="roll-reception__select-wrapper">
              <MapPin size={15} className="roll-reception__select-prefix-icon" aria-hidden="true" />
              <select
                required
                value={location}
                onChange={(event) => onChangeLocation(event.target.value)}
                disabled={disabled || !activeLocations.length}
                className="roll-reception__select"
              >
                {activeLocations.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.name} · {loc.code}
                  </option>
                ))}
                {!activeLocations.length && (
                  <option value="MAIN">MAIN · Bodega general</option>
                )}
              </select>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};
