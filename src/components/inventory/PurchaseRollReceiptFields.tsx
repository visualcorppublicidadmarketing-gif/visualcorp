import React from 'react';
export type PurchaseRollDraft = { roll_tag: string; remaining_m: string; nominal_length_m: string; width_cm: string };
export function PurchaseRollReceiptFields({ rows, onChange }: { rows: PurchaseRollDraft[]; onChange: (rows: PurchaseRollDraft[]) => void }) {
 const update = (index: number, field: keyof PurchaseRollDraft, value: string) => onChange(rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
 return <fieldset className="purchase-roll-receipt-fields"><legend>Rollos individuales · metros aceptados</legend><p>Identifica cada rollo. La suma de sus metros debe coincidir con lo aceptado.</p>{rows.map((row, i) => <div className="purchase-roll-receipt-row" key={i}>
 <label>Etiqueta del rollo {i + 1}<input required maxLength={120} value={row.roll_tag} onChange={e => update(i, 'roll_tag', e.target.value)}/></label>
 <label>Metros recibidos<input required type="number" min="0.001" step="0.001" value={row.remaining_m} onChange={e => update(i, 'remaining_m', e.target.value)}/></label>
 <label>Ancho · cm<input required type="number" min="0.01" step="0.01" value={row.width_cm} onChange={e => update(i, 'width_cm', e.target.value)}/></label>
 <label>Largo nominal · opcional<input type="number" min="0.01" step="0.01" value={row.nominal_length_m} onChange={e => update(i, 'nominal_length_m', e.target.value)}/></label>
 <button type="button" className="button button-outline" onClick={() => onChange(rows.filter((_, index) => index !== i))}>Quitar rollo {i + 1}</button>
 </div>)}<button type="button" className="button button-outline" onClick={() => onChange([...rows, { roll_tag: '', remaining_m: '', width_cm: '', nominal_length_m: '' }])}>Añadir rollo</button></fieldset>;
}
