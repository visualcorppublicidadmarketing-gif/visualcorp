import { Check, Minus, Plus, Ruler } from 'lucide-react';
import { MeasurementPreview } from '../../../components/MeasurementPreview';
import './POSMeasurementControls.css';

const commonSizes = [
  { width: 100, height: 100, title: 'Cuadrado', subtitle: '1 × 1 m' },
  { width: 200, height: 100, title: 'Banner', subtitle: '2 × 1 m' },
  { width: 300, height: 100, title: 'Fachada', subtitle: '3 × 1 m' },
  { width: 80, height: 200, title: 'Roll-up', subtitle: '80 × 200 cm' },
  { width: 120, height: 80, title: 'Display', subtitle: '120 × 80 cm' },
  { width: 60, height: 40, title: 'Pancarta', subtitle: '60 × 40 cm' },
];

type MeasureFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  unit: string;
  precision?: number;
  minimum: number;
};

function MeasureField({ id, label, value, onChange, step, unit, precision = 2, minimum }: MeasureFieldProps) {
  const changeByStep = (direction: -1 | 1) => {
    const current = Number(value);
    const base = Number.isFinite(current) ? current : step;
    const next = Math.max(minimum, base + direction * step);
    onChange(String(Number(next.toFixed(precision))));
  };

  return <div className="pos-measure-field">
    <label htmlFor={id}>{label}<span className="pos-measure-unit-label">{unit}</span></label>
    <div className="pos-measure-stepper">
      <button type="button" className="pos-measure-step-button" aria-label={`Reducir ${label.toLocaleLowerCase('es')}`} onClick={() => changeByStep(-1)}>
        <Minus size={15} aria-hidden="true"/>
      </button>
      <input id={id} type="number" min={minimum} step={precision===0?1:0.01} inputMode={precision===0?'numeric':'decimal'} value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} en ${unit}`}/>
      <span className="pos-measure-unit" aria-hidden="true">{unit}</span>
      <button type="button" className="pos-measure-step-button" aria-label={`Aumentar ${label.toLocaleLowerCase('es')}`} onClick={() => changeByStep(1)}>
        <Plus size={15} aria-hidden="true"/>
      </button>
    </div>
  </div>;
}

type POSMeasurementControlsProps = {
  widthValue: string;
  heightValue: string;
  quantityValue: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
  onWidthChange: (value: string) => void;
  onHeightChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
};

export function POSMeasurementControls({
  widthValue,
  heightValue,
  quantityValue,
  widthCm,
  heightCm,
  quantity,
  onWidthChange,
  onHeightChange,
  onQuantityChange,
}: POSMeasurementControlsProps) {
  const dimensionsValid = Number.isFinite(widthCm) && Number.isFinite(heightCm) && widthCm > 0 && heightCm > 0;
  const areaPerPiece = dimensionsValid ? (widthCm * heightCm) / 10_000 : 0;
  const totalArea = areaPerPiece * Math.max(0, Number.isFinite(quantity) ? quantity : 0);
  const perimeter = dimensionsValid ? (2 * (widthCm + heightCm)) / 100 : 0;
  const activeSize = commonSizes.find((size) => Number(widthValue) === size.width && Number(heightValue) === size.height);
  const measure = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 2 });

  return <section className="pos-measurement-control" aria-labelledby="pos-measurement-title">
    <div className="pos-measurement-heading">
      <span className="pos-measurement-icon"><Ruler size={18} aria-hidden="true"/></span>
      <div>
        <span className="eyebrow">CÁLCULO POR SUPERFICIE</span>
        <h3 id="pos-measurement-title">Tamaño del trabajo</h3>
        <p>Ingresa las medidas en centímetros. El total se calcula por m².</p>
      </div>
    </div>

    <div className="pos-measurement-fields">
      <MeasureField id="pos-measure-width" label="Ancho" value={widthValue} onChange={onWidthChange} step={10} unit="cm" minimum={0.01}/>
      <MeasureField id="pos-measure-height" label="Alto" value={heightValue} onChange={onHeightChange} step={10} unit="cm" minimum={0.01}/>
      <MeasureField id="pos-measure-quantity" label="Cantidad de piezas" value={quantityValue} onChange={onQuantityChange} step={1} unit="piezas" precision={0} minimum={1}/>
    </div>

    <div className="pos-measurement-metrics" aria-label="Resumen de las medidas">
      <div><span>Área por pieza</span><b>{dimensionsValid ? `${measure.format(areaPerPiece)} m²` : '—'}</b></div>
      <div><span>Área facturable</span><b>{dimensionsValid ? `${measure.format(totalArea)} m²` : '—'}</b></div>
      <div><span>Perímetro por pieza</span><b>{dimensionsValid ? `${measure.format(perimeter)} m` : '—'}</b></div>
    </div>

    <div className="pos-measurement-presets" role="group" aria-label="Medidas frecuentes">
      <div className="pos-measurement-presets-heading">
        <span>Medidas frecuentes</span>
        {activeSize && <small><Check size={12} aria-hidden="true"/> {activeSize.title} seleccionado</small>}
      </div>
      <div className="pos-measurement-presets-grid">
        {commonSizes.map((size) => {
          const selected = activeSize === size;
          return <button key={`${size.width}x${size.height}`} type="button" className={`pos-measurement-preset${selected ? ' is-active' : ''}`} aria-pressed={selected} onClick={() => { onWidthChange(String(size.width)); onHeightChange(String(size.height)); }}>
            <span>{size.title}</span><b>{size.subtitle}</b>
          </button>;
        })}
      </div>
    </div>

    {dimensionsValid && <MeasurementPreview widthCm={widthCm} heightCm={heightCm} pieces={quantity}/>}
  </section>;
}
