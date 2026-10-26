import React from 'react';

export type InventorySpecificationDraft = {
  paper_size?: string;
  width_cm?: string | number;
  length_m?: string | number;
  roll_length_reference_m?: string | number;
  finish?: string;
  color?: string;
  purchase_unit?: string;
  supplier_code?: string;
  barcode?: string;
  material?: string;
};

type Props = {
  value: InventorySpecificationDraft;
  onChange: (value: InventorySpecificationDraft) => void;
  idPrefix: string;
  includeLength?: boolean;
};

const update = (value: InventorySpecificationDraft, key: keyof InventorySpecificationDraft, next: string) => ({ ...value, [key]: next });

export function InventorySpecificationFields({ value, onChange, idPrefix, includeLength = false }: Props) {
  return <fieldset className="inventory-specifications">
    <legend>Especificaciones editables</legend>
    <div className="inventory-form-grid">
      <label>Formato de papel
        <select value={value.paper_size || ''} onChange={event => onChange(update(value, 'paper_size', event.target.value))}>
          <option value="">No aplica / pendiente</option>
          <option value="A5">A5 · 148 × 210 mm</option>
          <option value="A4">A4 · 210 × 297 mm</option>
          <option value="A3">A3 · 297 × 420 mm</option>
          <option value="A2">A2 · 420 × 594 mm</option>
        </select>
      </label>
      <label>Ancho del rollo (cm)<input type="number" min="0" step="0.1" value={value.width_cm ?? ''} onChange={event => onChange(update(value, 'width_cm', event.target.value))} placeholder="Ej. 107"/></label>
      {includeLength && <label>Largo disponible o medido (m)<input type="number" min="0" step="0.01" value={value.length_m ?? ''} onChange={event => onChange(update(value, 'length_m', event.target.value))} placeholder="Medir en recepción"/><small>Registra la medida de esta entrada; no se asume el largo típico.</small></label>}
      <label>Largo habitual de referencia (m)<input type="number" min="0" step="0.1" value={value.roll_length_reference_m ?? ''} onChange={event => onChange(update(value, 'roll_length_reference_m', event.target.value))} placeholder="Opcional"/><small>Referencia informativa; puede variar según proveedor.</small></label>
      <label>Acabado<input value={value.finish || ''} onChange={event => onChange(update(value, 'finish', event.target.value))} placeholder="Brillante, mate, arenado…"/></label>
      <label>Color<input value={value.color || ''} onChange={event => onChange(update(value, 'color', event.target.value))} placeholder="Negro, amarillo, azul…"/></label>
      <label>Unidad de compra<input value={value.purchase_unit || ''} onChange={event => onChange(update(value, 'purchase_unit', event.target.value))} placeholder="Rollo, resma, hoja…"/></label>
      <label>Material / composición<input value={value.material || ''} onChange={event => onChange(update(value, 'material', event.target.value))} placeholder="Opcional; confirmar ficha técnica"/></label>
      <label>Código del proveedor<input value={value.supplier_code || ''} onChange={event => onChange(update(value, 'supplier_code', event.target.value))} placeholder="Opcional"/></label>
      <label>Código de barras<input value={value.barcode || ''} onChange={event => onChange(update(value, 'barcode', event.target.value))} placeholder="Opcional"/></label>
    </div>
    <small className="inventory-specifications-note" id={`${idPrefix}-specification-note`}>Estos campos describen el artículo. La existencia solo cambia con conteo físico confirmado o un movimiento registrado.</small>
  </fieldset>;
}
