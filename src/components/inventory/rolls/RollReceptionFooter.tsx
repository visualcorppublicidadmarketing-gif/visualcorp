import React from 'react';
import { CheckCircle2, Info, LoaderCircle, Plus, X } from 'lucide-react';
import type { InventoryItem } from './types';

export type RollReceptionFooterProps = {
  selectedMaterial: InventoryItem | null;
  batchCount: number;
  width: string;
  remainingMeters: string;
  branchName: string;
  busy: boolean;
  canEdit: boolean;
  hasMaterial: boolean;
  onCancel: () => void;
  onSubmit?: (e: React.FormEvent) => void;
};

export const RollReceptionFooter: React.FC<RollReceptionFooterProps> = ({
  selectedMaterial,
  batchCount,
  width,
  remainingMeters,
  branchName,
  busy,
  canEdit,
  hasMaterial,
  onCancel,
}) => {
  return (
    <footer className="roll-reception__footer">
      <div className="roll-reception__footer-summary">
        {selectedMaterial ? (
          <div className="roll-reception__summary-ready">
            <CheckCircle2 size={18} className="roll-reception__summary-ready-icon" aria-hidden="true" />
            <div className="roll-reception__summary-text">
              <span>
                Recibiendo{' '}
                <strong className="roll-reception__highlight-qty">
                  {batchCount} {batchCount === 1 ? 'rollo' : 'rollos'}
                </strong>{' '}
                de <strong className="roll-reception__highlight-mat">{selectedMaterial.name}</strong>{' '}
                ({width || '127'}cm × {remainingMeters || '50'}m) en{' '}
                <strong className="roll-reception__highlight-branch">{branchName}</strong>.
              </span>
            </div>
          </div>
        ) : (
          <div className="roll-reception__summary-prompt">
            <Info size={16} className="roll-reception__summary-prompt-icon" aria-hidden="true" />
            <span>Selecciona un material arriba para completar y autorizar la recepción.</span>
          </div>
        )}
      </div>

      <div className="roll-reception__footer-actions">
        <button
          type="button"
          className="roll-reception__btn-cancel"
          onClick={onCancel}
          disabled={busy}
        >
          <X size={15} aria-hidden="true" />
          <span>Cancelar</span>
        </button>

        <button
          type="submit"
          className="roll-reception__btn-submit"
          disabled={!canEdit || busy || !hasMaterial}
        >
          {busy ? (
            <>
              <LoaderCircle size={16} className="roll-reception__spin" aria-hidden="true" />
              <span>Guardando en bodega...</span>
            </>
          ) : (
            <>
              <Plus size={16} aria-hidden="true" />
              <span>
                {batchCount > 1
                  ? `Recibir ${batchCount} rollos en bodega`
                  : 'Recibir rollo en bodega'}
              </span>
            </>
          )}
        </button>
      </div>
    </footer>
  );
};
