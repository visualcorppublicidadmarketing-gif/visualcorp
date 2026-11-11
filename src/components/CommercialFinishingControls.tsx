import React from 'react';
import { Check, Eye, PenTool } from 'lucide-react';
import {
  calculateCommercialFinishing,
  type CommercialFinishingPrices,
  type CommercialFinishingValue,
  type DesignService,
  type EyeletStyle,
} from '../lib/commercialFinishing';
import './commercial-finishing-controls.css';

const eyeletOptions: Array<{ id: EyeletStyle; title: string; amount: string }> = [
  { id: 'none', title: 'Sin ojales', amount: 'Sin costo' },
  { id: 'large', title: 'Ojal grande', amount: 'por unidad' },
  { id: 'small', title: 'Ojal pequeño', amount: 'por unidad' },
];

const designOptions: Array<{ id: DesignService; title: string; amount: string }> = [
  { id: 'ready', title: 'Archivo listo', amount: 'Sin costo' },
  { id: 'adaptation', title: 'Adaptación de arte', amount: 'Tarifa configurada' },
  { id: 'from_scratch', title: 'Diseño desde cero', amount: 'Tarifa configurada' },
  { id: 'custom', title: 'Concepto libre', amount: 'Monto editable' },
];

export function CommercialFinishingControls({
  value,
  onChange,
  quantity,
  prices,
  allowEyelets = true,
  allowDesign = true,
  idPrefix = 'line-finishing',
}: {
  value: CommercialFinishingValue;
  onChange: (next: CommercialFinishingValue) => void;
  quantity: number;
  prices?: CommercialFinishingPrices;
  allowEyelets?: boolean;
  allowDesign?: boolean;
  idPrefix?: string;
}) {
  const calculated = calculateCommercialFinishing(value, quantity, prices);
  if (!allowEyelets && !allowDesign) return null;

  const selectEyelet = (eyeletType: EyeletStyle) => onChange({ ...value, eyeletType, eyeletUnitPriceSnapshot: undefined });
  const selectDesign = (designService: DesignService) => onChange({ ...value, designService, designAmountSnapshot: undefined });

  return <section className="commercial-finishing-controls" aria-label="Acabados y servicios de preprensa">
    <div className="commercial-finishing-heading">
      <span className="commercial-finishing-step">+</span>
      <div><b>Acabados y servicios de preprensa</b><small>Configura los cargos por artículo antes de continuar.</small></div>
    </div>

    {allowEyelets && <div className="commercial-finishing-group">
      <span className="commercial-finishing-label"><Eye size={14}/> Ojales de montaje</span>
      <div className="commercial-finishing-options is-three" role="group" aria-label="Tipo de ojal">
        {eyeletOptions.map((option) => {
          const selected = value.eyeletType === option.id;
          const configuredPrice = option.id === 'small' ? prices?.eyeletSmallPrice : prices?.eyeletLargePrice;
          const price = option.id === value.eyeletType && value.eyeletUnitPriceSnapshot !== undefined
            ? value.eyeletUnitPriceSnapshot
            : Number.isFinite(Number(configuredPrice)) ? Number(configuredPrice) : option.id === 'small' ? 0.3 : option.id === 'large' ? 0.5 : 0;
          return <button key={option.id} type="button" className={`commercial-finishing-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => selectEyelet(option.id)}>
            <b>{selected && <Check size={13}/>} {option.title}</b>
            <small>{option.id === 'none' ? option.amount : `+${new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(price)} c/u`}</small>
          </button>;
        })}
      </div>
      {value.eyeletType !== 'none' && <div className="commercial-finishing-eyelet-count">
        <label htmlFor={`${idPrefix}-eyelet-count`}>Ojales por pieza</label>
        <div className="commercial-finishing-stepper">
          <button type="button" aria-label="Reducir ojales por pieza" onClick={() => onChange({ ...value, eyeletCount: Math.max(0, Number(value.eyeletCount || 0) - 1) })}>−</button>
          <input id={`${idPrefix}-eyelet-count`} type="number" min="0" max="1000" step="1" value={value.eyeletCount} onChange={(event) => onChange({ ...value, eyeletCount: event.target.value })}/>
          <button type="button" aria-label="Aumentar ojales por pieza" onClick={() => onChange({ ...value, eyeletCount: Math.min(1000, Number(value.eyeletCount || 0) + 1) })}>+</button>
        </div>
        <small>{calculated.eyeletTotalCount} {calculated.eyeletTotalCount === 1 ? 'ojal' : 'ojales'} en {quantity} {quantity === 1 ? 'pieza' : 'piezas'} · {new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(calculated.eyeletTotal)}</small>
      </div>}
    </div>}

    {allowDesign && <div className="commercial-finishing-group">
      <span className="commercial-finishing-label"><PenTool size={14}/> Servicio de diseño gráfico</span>
      <div className="commercial-finishing-options is-four" role="group" aria-label="Servicio de diseño">
        {designOptions.map((option) => {
          const selected = value.designService === option.id;
          const configuredAmount = option.id === 'adaptation' ? prices?.designAdaptationPrice : option.id === 'from_scratch' ? prices?.designFromScratchPrice : 0;
          const amount = option.id === value.designService && value.designAmountSnapshot !== undefined
            ? value.designAmountSnapshot
            : Number.isFinite(Number(configuredAmount)) ? Number(configuredAmount) : option.id === 'adaptation' ? 5 : option.id === 'from_scratch' ? 15 : 0;
          return <button key={option.id} type="button" className={`commercial-finishing-option${selected ? ' is-selected' : ''}`} aria-pressed={selected} onClick={() => selectDesign(option.id)}>
            <b>{selected && <Check size={13}/>} {option.title}</b>
            <small>{option.id === 'adaptation' || option.id === 'from_scratch' ? `+${new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(amount)}` : option.amount}</small>
          </button>;
        })}
      </div>
      {value.designService === 'custom' && <div className="commercial-finishing-custom">
        <label>Concepto de diseño<input maxLength={120} value={value.designLabel} onChange={(event) => onChange({ ...value, designLabel: event.target.value })} placeholder="Ej. Redibujo de logotipo, vectorización…" required/></label>
        <label>Monto por línea ($)<div className="commercial-finishing-money"><span>$</span><input type="number" min="0" step="0.01" value={value.designAmount} onChange={(event) => onChange({ ...value, designAmount: event.target.value })} placeholder="0,00" required/></div></label>
      </div>}
      {!calculated.valid && <small className="commercial-finishing-error" role="alert">Completa el concepto y un monto válido, aunque sea $0,00.</small>}
      <small className="commercial-finishing-note">El servicio de diseño se cobra una vez por esta línea. Puedes elegir un monto personalizado.</small>
    </div>}
  </section>;
}
