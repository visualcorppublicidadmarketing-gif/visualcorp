import { getApplicableTier } from '../../lib/quotePricing';
import './quantity-price-table.css';

export function QuantityPriceTable({ product, quantity }: { product: any; quantity?: number }) {
  if (!product?.customOptions?.quantity_pricing) return null;
  const tiers = [...(product.tiers || [])].sort((a, b) => a.min_qty - b.min_qty);
  const options: { label: string }[] = product.optionPrices || [];
  const approved = quantity == null ? null : getApplicableTier(product, quantity);
  const money = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const displayRate = (rate?: number | null) => rate == null ? '—' : money.format(rate);

  return <details className="quantity-price-table">
    <summary>Tarifas por cantidad ({tiers.length}){approved && <span> · tramo {approved.min_qty}–{approved.max_qty}</span>}</summary>
    <div className="table-wrap">
      <table>
        <caption>Precio por unidad según la cantidad de la línea</caption>
        <thead><tr><th scope="col">Unidades</th>{options.length
          ? options.map(({ label }) => <th key={label} scope="col">{label}</th>)
          : <th scope="col">Normal</th>}</tr></thead>
        <tbody>{tiers.map((tier) => <tr key={tier.min_qty} aria-current={approved?.min_qty === tier.min_qty ? 'true' : undefined}>
          <th scope="row">{tier.min_qty === tier.max_qty ? tier.min_qty : `${tier.min_qty}–${tier.max_qty}`}</th>
          {options.length ? options.map(({ label }) => <td key={label}>{displayRate(tier.option_prices?.find((option) => option.option === label)?.price)}</td>)
            : <td>{displayRate(tier.unit_price)}</td>}
        </tr>)}</tbody>
      </table>
    </div>
    {quantity != null && Number.isSafeInteger(quantity) && quantity > 0 && !approved &&
      <p role="status">No hay una tarifa publicada para {quantity} unidades. Confirma un precio acordado antes de continuar.</p>}
  </details>;
}
