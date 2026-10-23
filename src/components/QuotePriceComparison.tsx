import React from 'react';
import { Check, CircleHelp } from 'lucide-react';
import { formatMoney } from '../app/workspace';
import { calculateQuotePrice, quoteTiers } from '../lib/quotePricing';
import './QuotePriceComparison.css';

export function QuotePriceComparison({ product, basis, selectedTier, onSelect, optionChoice = '' }) {
  if (!product) return null;

  const rateUnit = product.priceBasis === 'total'
    ? 'por lote'
    : product.mode === 'area'
      ? 'por m²'
      : `por ${product.unit || 'unidad'}`;

  return <section className="quote-price-comparison" aria-label="Comparación de tarifas en vivo">
    <div className="quote-price-comparison-heading">
      <div>
        <span className="eyebrow">PRECIOS EN VIVO</span>
        <h3>Compara las tres tarifas</h3>
      </div>
      <span className="quote-price-basis">{product.mode === 'area' ? `${Number(basis).toFixed(2)} m²` : `${basis} ${product.priceBasis === 'total' ? 'unidades · lote' : product.unit || 'unidades'}`}</span>
    </div>
    <div className="quote-price-options">
      {quoteTiers.map((tier) => {
        const total = calculateQuotePrice(product, tier.id, basis, optionChoice);
        const active = selectedTier === tier.id;
        return <button
          key={tier.id}
          type="button"
          disabled={total === null}
          aria-pressed={active}
          onClick={() => onSelect(tier.id)}
          className={`quote-live-price${active ? ' active' : ''}${total === null ? ' unavailable' : ''}`}
        >
          <span className="quote-live-price-top"><b>{tier.label}</b>{active && <i><Check size={13}/> Para cotizar</i>}</span>
          <strong>{total === null ? 'No disponible' : formatMoney(total)}</strong>
          <small>{total === null ? 'Esta tarifa no está registrada para el producto' : `${formatMoney(total / (product.priceBasis === 'total' ? 1 : Math.max(1, Number(basis))))} ${rateUnit}`}</small>
          {!product.confirmed && total !== null && <em>Referencia pendiente de validar</em>}
        </button>;
      })}
    </div>
    {!product.confirmed && <p className="quote-price-note"><CircleHelp size={14}/> Los valores se calculan al cambiar producto, cantidad o medidas. La tarifa elegida sigue pendiente hasta validarla en el catálogo.</p>}
  </section>;
}
