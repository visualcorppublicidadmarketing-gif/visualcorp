import React, { useMemo, useState } from 'react';
import { Check, Copy, Plus, X } from 'lucide-react';
import { colorFormats } from './color';

export function ColorPicker({ value = '#FF5B1F', onChange, multiple = false, label = 'Color' }) {
  const [colors, setColors] = useState(multiple ? (Array.isArray(value) ? value : [value]) : [value]);
  const [active, setActive] = useState(colors[0] || '#FF5B1F');
  const [copied, setCopied] = useState('');
  const formats = useMemo(() => colorFormats(active), [active]);
  const update = (next) => { setActive(next); const nextColors = multiple ? colors.map((color, index) => index === colors.indexOf(active) ? next : color) : [next]; setColors(nextColors); onChange?.(multiple ? nextColors : next); };
  const add = () => { const next = [...colors, '#FFFFFF']; setColors(next); setActive('#FFFFFF'); onChange?.(next); };
  const remove = (color) => { if (colors.length === 1) return; const next = colors.filter((item) => item !== color); setColors(next); setActive(next[0]); onChange?.(next); };
  const copy = async (key) => { await navigator.clipboard?.writeText(formats[key]); setCopied(key); window.setTimeout(() => setCopied(''), 1200); };
  return <div className="studio-color-picker"><div className="studio-picker-heading"><span>{label}</span>{multiple && <button type="button" onClick={add}><Plus size={14} /> Añadir color</button>}</div><div className="studio-color-row"><input aria-label={label} type="color" value={active} onChange={(event) => update(event.target.value.toUpperCase())} /><input className="studio-hex-input" value={active} onChange={(event) => update(event.target.value)} /></div>{multiple && <div className="studio-color-swatches">{colors.map((color) => <button type="button" key={color} style={{ '--swatch': color }} className={color === active ? 'active' : ''} onClick={() => setActive(color)} aria-label={`Seleccionar ${color}`}><i />{color === active && <Check size={12} />}{colors.length > 1 && <span onClick={(event) => { event.stopPropagation(); remove(color); }}><X size={10} /></span>}</button>)}</div>}<div className="studio-color-formats">{Object.entries(formats).map(([key, text]) => <button type="button" key={key} onClick={() => copy(key)}><span><small>{key.toUpperCase()}</small>{text}</span>{copied === key ? <Check size={13} /> : <Copy size={13} />}</button>)}</div></div>;
}
