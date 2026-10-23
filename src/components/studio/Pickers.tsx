import React, { useState } from 'react';
import { Asterisk, Badge, Brush, Building2, Circle, Heart, Lightbulb, Megaphone, Palette, Printer, Sparkles, Star, Tag, WandSparkles } from 'lucide-react';
import { resourceUrls } from '../../data/resourceManifest';

const iconOptions = [Megaphone, Printer, Palette, Sparkles, Lightbulb, Building2, Brush, Tag, Star, Heart, Asterisk, Badge];
const emojiOptions = ['✦', '✹', '✺', '✷', '☻', '☺', '♥', '⚡', '✌', '☀', '◉', '➜', '✓', '∞', '✳'];

export function IconPicker({ value, onChange }) { const [query, setQuery] = useState(''); return <div className="studio-picker"><input placeholder="Busca un icono" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="studio-icon-grid">{iconOptions.map((Icon, index) => <button type="button" key={index} className={value === index ? 'active' : ''} onClick={() => onChange?.(index)}><Icon size={18} /><small>{query ? `Icono ${index + 1}` : 'Icono'}</small></button>)}</div></div>; }

export function SvgPicker({ value, onChange }) { const svgs = ['<svg viewBox="0 0 32 32"><path d="M16 2 30 28H2Z"/></svg>', '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="13"/><path d="M9 17h14M16 10v14"/></svg>', '<svg viewBox="0 0 32 32"><path d="M5 7h22v18H5z"/><path d="m7 22 6-6 4 4 3-3 5 5"/></svg>']; return <div className="studio-svg-grid">{svgs.map((svg, index) => <button type="button" key={svg} className={value === svg ? 'active' : ''} onClick={() => onChange?.(svg)} dangerouslySetInnerHTML={{ __html: svg }} />)}</div>; }

export function LogoPicker({ value, onChange }) { const logos = resourceUrls.filter((item) => item.original.includes('/Logo Giga/') && item.type === 'svg').map((logo) => ({ id: logo.url, label: logo.name.replace(/\.svg$/i, ''), node: <img className="picker-brand-logo" src={logo.url} alt={logo.name.replace(/\.svg$/i, '')} /> })); return <div className="studio-logo-grid">{logos.map((logo) => <button type="button" key={logo.id} className={value === logo.id ? 'active' : ''} onClick={() => onChange?.(logo.id)}>{logo.node}<small>{logo.label}</small></button>)}</div>; }

export function EmojiPicker({ value, onChange }) { return <div className="studio-emoji-grid">{emojiOptions.map((emoji) => <button type="button" key={emoji} className={value === emoji ? 'active' : ''} onClick={() => onChange?.(emoji)}>{emoji}</button>)}</div>; }
