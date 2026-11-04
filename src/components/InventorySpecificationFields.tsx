import React from 'react';
import { InventoryOptionPicker } from './InventoryOptionPicker';

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
  options?: Partial<Record<'finish' | 'color' | 'purchase_unit' | 'material', string[]>>;
};

const update = (value: InventorySpecificationDraft, key: keyof InventorySpecificationDraft, next: string) => ({ ...value, [key]: next });

export function InventorySpecificationFields({ value, onChange, idPrefix, includeLength = false, options = {} }: Props) {
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
      <InventoryOptionPicker label="Acabado" mode="single" value={value.finish || ''} options={options.finish || []} placeholder="Selecciona o escribe un acabado" helpText="Las opciones escritas se agregan a la lista al guardar el artículo." customActionLabel="Otro acabado (escribir y guardar)" customApplyLabel="Guardar acabado" customInputPlaceholder="Ej. satinado, texturizado…" onChange={next => onChange(update(value, 'finish', String(next)))}/>
      <InventoryOptionPicker label="Color" mode="single" value={value.color || ''} options={options.color || []} placeholder="Selecciona o escribe un color" helpText="Las opciones escritas se agregan a la lista al guardar el artículo." customActionLabel="Otro color (escribir y guardar)" customApplyLabel="Guardar color" customInputPlaceholder="Ej. azul marino, natural…" onChange={next => onChange(update(value, 'color', String(next)))}/>
      <InventoryOptionPicker label="Unidad de compra" mode="single" value={value.purchase_unit || ''} options={options.purchase_unit || []} placeholder="Unidad, paquete u otra" helpText="Elige Unidad o Paquete, o escribe otra; quedará disponible al guardar el artículo." customActionLabel="Otros (escribir y guardar en la lista)" customApplyLabel="Usar valor" customInputPlaceholder="Ej. bidón, par, caja…" onChange={next => onChange(update(value, 'purchase_unit', String(next)))}/>
      <InventoryOptionPicker label="Material / composición" mode="single" value={value.material || ''} options={options.material || []} placeholder="Selecciona o escribe un material" helpText="Las opciones escritas se agregan a la lista al guardar el artículo." customActionLabel="Otro material (escribir y guardar)" customApplyLabel="Guardar material" customInputPlaceholder="Ej. panel compuesto de aluminio…" onChange={next => onChange(update(value, 'material', String(next)))}/>
      <label>Código del proveedor<input value={value.supplier_code || ''} onChange={event => onChange(update(value, 'supplier_code', event.target.value))} placeholder="Opcional"/></label>
      <label>Código de barras<input value={value.barcode || ''} onChange={event => onChange(update(value, 'barcode', event.target.value))} placeholder="Opcional"/></label>
    </div>
    <small className="inventory-specifications-note" id={`${idPrefix}-specification-note`}>Estos campos describen el artículo. La existencia solo cambia con conteo físico confirmado o un movimiento registrado.</small>
  </fieldset>;
}
