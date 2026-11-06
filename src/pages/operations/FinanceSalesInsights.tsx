import React, { useMemo, useState } from 'react';
import { Banknote, ChartNoAxesCombined, Clock3, Package, TrendingUp } from 'lucide-react';
import { netSaleAmount } from './financeSales';
import './finance-sales-insights.css';

const TIME_ZONE = 'America/Guayaquil';
const money = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value || 0);
const localDate = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));
const localHour = (value: string) => Number(new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23',
}).format(new Date(value)));
const localWeekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const monthDays = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};
const mondayOf = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
  return parsed.toISOString().slice(0, 10);
};
const addDays = (date: string, days: number) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
};
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-EC', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' });

const WEEKDAYS = [
  { id: 1, label: 'Lunes' }, { id: 2, label: 'Martes' }, { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' }, { id: 5, label: 'Viernes' }, { id: 6, label: 'Sábado' }, { id: 0, label: 'Domingo' },
];

type Props = {
  today: string;
  month: string;
  monthSales: any[];
  currentWeekSales: any[];
  returnsBySale: Map<string, { returnedValue?: number }>;
  saleReturns: any[];
  saleReturnsError: string;
  saleLinesError: string;
  saleLineCostSnapshots: any[];
  saleLineCostsError: string;
  canViewProductMargins: boolean;
};

export function FinanceSalesInsights({ today, month, monthSales, currentWeekSales, returnsBySale, saleReturns, saleReturnsError, saleLinesError, saleLineCostSnapshots, saleLineCostsError, canViewProductMargins }: Props) {
  const [productSort, setProductSort] = useState<'quantity' | 'revenue' | 'margin'>('quantity');
  const insights = useMemo(() => {
    const daily = Array.from({ length: monthDays(month) }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
      return { date, amount: 0, count: 0 };
    });
    const weekdayTotals = new Map(WEEKDAYS.map((day) => [day.id, { ...day, amount: 0, count: 0 }]));
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, amount: 0, count: 0 }));
    const lineRevenue = new Map<string, { label: string; sku: string; amount: number; units: number; sales: Set<string>; marginAmount: number; marginRevenue: number; marginLines: number; missingMarginLines: number }>();

    monthSales.forEach((sale) => {
      const date = localDate(sale.created_at);
      const amount = netSaleAmount(sale, returnsBySale);
      const day = daily[Number(date.slice(-2)) - 1];
      if (day) { day.amount += amount; day.count += 1; }
      const weekday = weekdayTotals.get(localWeekday(date));
      if (weekday) { weekday.amount += amount; weekday.count += 1; }
      const hourIndex = localHour(sale.created_at);
      if (hourly[hourIndex]) { hourly[hourIndex].amount += amount; hourly[hourIndex].count += 1; }

      const subtotal = Number(sale.subtotal || 0);
      const discountRate = subtotal > 0 ? Math.min(1, Number(sale.discount_total || 0) / subtotal) : 0;
      (sale.sale_lines || []).forEach((line) => {
        if (!line.catalog_product_id && !line.variant_id && !line.sku_snapshot) return;
        const key = line.catalog_product_id || line.variant_id || line.sku_snapshot || line.description_snapshot || line.id;
        if (!key) return;
        const item = lineRevenue.get(key) || {
          label: line.description_snapshot || 'Producto sin descripción',
          sku: line.sku_snapshot || '', amount: 0, units: 0, sales: new Set<string>(), marginAmount: 0, marginRevenue: 0, marginLines: 0, missingMarginLines: 0,
        };
        item.amount += Number(line.line_total || 0) * (1 - discountRate);
        item.units += Number(line.quantity || 0);
        item.sales.add(String(sale.id));
        lineRevenue.set(key, item);
      });
    });

    const returnsBySaleLine = new Map<string, number>();
    const returnedUnitsBySaleLine = new Map<string, number>();
    const restockedUnitsBySaleLine = new Map<string, number>();
    saleReturns.forEach((saleReturn) => {
      if (saleReturn.kind === 'cancellation') return;
      (saleReturn.sale_return_lines || []).forEach((returnLine) => {
        const saleLine = Array.isArray(returnLine.sale_lines) ? returnLine.sale_lines[0] : returnLine.sale_lines;
        if (!saleLine?.id) return;
        returnsBySaleLine.set(saleLine.id, (returnsBySaleLine.get(saleLine.id) || 0) + Number(returnLine.quantity || 0) * Number(saleLine.unit_price || 0));
        returnedUnitsBySaleLine.set(saleLine.id, (returnedUnitsBySaleLine.get(saleLine.id) || 0) + Number(returnLine.quantity || 0));
        if (returnLine.disposition === 'restock') restockedUnitsBySaleLine.set(saleLine.id, (restockedUnitsBySaleLine.get(saleLine.id) || 0) + Number(returnLine.quantity || 0));
      });
    });
    if (!saleReturnsError) {
      monthSales.forEach((sale) => {
        const subtotal = Number(sale.subtotal || 0);
        const discountRate = subtotal > 0 ? Math.min(1, Number(sale.discount_total || 0) / subtotal) : 0;
        (sale.sale_lines || []).forEach((line) => {
          if (!line.catalog_product_id && !line.variant_id && !line.sku_snapshot) return;
          const key = line.catalog_product_id || line.variant_id || line.sku_snapshot || line.description_snapshot || line.id;
          const item = key ? lineRevenue.get(key) : undefined;
          if (item && line.id) {
            item.amount -= (returnsBySaleLine.get(line.id) || 0) * (1 - discountRate);
            item.units -= returnedUnitsBySaleLine.get(line.id) || 0;
          }
        });
      });
    }

    const costByLine = new Map(saleLineCostSnapshots.map((snapshot) => [snapshot.sale_line_id, snapshot]));
    const marginCoverage = { total: 0, covered: 0 };
    const canCalculateMargins = canViewProductMargins && !saleLinesError && !saleLineCostsError && !saleReturnsError;
    if (canCalculateMargins) {
      monthSales.forEach((sale) => {
        const subtotal = Number(sale.subtotal || 0);
        const discountRate = subtotal > 0 ? Math.min(1, Math.max(0, Number(sale.discount_total || 0) / subtotal)) : 0;
        (sale.sale_lines || []).forEach((line) => {
          const fulfilled = Number(line.fulfilled_quantity || 0);
          if (fulfilled <= 0) return;
          const key = line.catalog_product_id || line.variant_id || line.sku_snapshot || line.description_snapshot || line.id;
          const item = lineRevenue.get(key);
          if (!item) return;
          marginCoverage.total += 1;
          const snapshot = costByLine.get(line.id);
          if (!snapshot || snapshot.source_kind !== 'inventory_cost' || snapshot.unit_cost_snapshot == null || snapshot.cost_total_snapshot == null) {
            item.missingMarginLines += 1;
            return;
          }
          marginCoverage.covered += 1;
          const returned = Math.min(fulfilled, returnedUnitsBySaleLine.get(line.id) || 0);
          const restocked = Math.min(fulfilled, restockedUnitsBySaleLine.get(line.id) || 0);
          const netFulfilled = Math.max(0, fulfilled - returned);
          const netRevenue = netFulfilled * Number(line.unit_price || 0) * (1 - discountRate);
          const netCost = Math.max(0, Number(snapshot.cost_total_snapshot) - Math.round(restocked * Number(snapshot.unit_cost_snapshot) * 100) / 100);
          item.marginAmount += netRevenue - netCost;
          item.marginRevenue += netRevenue;
          item.marginLines += 1;
        });
      });
    }

    const weekStart = mondayOf(today);
    const weekEnd = addDays(weekStart, 6);
    const week = currentWeekSales.filter((sale) => {
      const date = localDate(sale.created_at);
      return date >= weekStart && date <= weekEnd;
    });
    const weekTotal = week.reduce((sum, sale) => sum + netSaleAmount(sale, returnsBySale), 0);
    const weekDaily = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const matching = week.filter((sale) => localDate(sale.created_at) === date);
      return { date, amount: matching.reduce((sum, sale) => sum + netSaleAmount(sale, returnsBySale), 0), count: matching.length };
    });
    const currentWeekDay = month === today.slice(0, 7)
      ? WEEKDAYS.find((day) => day.id === localWeekday(today))
      : undefined;
    const weekdayRows = WEEKDAYS.map((day) => weekdayTotals.get(day.id)!);
    const topHour = hourly.filter((item) => item.count).sort((a, b) => b.amount - a.amount)[0];
    const products = [...lineRevenue.values()].map((item) => ({
      ...item,
      amount: Math.max(0, item.amount),
      units: Math.max(0, item.units),
      salesCount: item.sales.size,
      margin: item.marginLines > 0 && item.missingMarginLines === 0 ? item.marginAmount : null,
      marginRate: item.marginLines > 0 && item.missingMarginLines === 0 && item.marginRevenue > 0 ? item.marginAmount / item.marginRevenue : null,
    }))
      .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, 'es'));
    return {
      daily, weekdayRows, hourly, products, week, weekTotal, weekDaily, weekStart, weekEnd,
      currentWeekDay, topHour, maxDaily: Math.max(1, ...daily.map((item) => item.amount)),
      maxWeek: Math.max(1, ...weekDaily.map((item) => item.amount)),
      maxWeekday: Math.max(1, ...weekdayRows.map((item) => item.amount)),
      maxHour: Math.max(1, ...hourly.map((item) => item.amount)), marginCoverage, canCalculateMargins,
    };
  }, [today, month, monthSales, currentWeekSales, returnsBySale, saleReturns, saleReturnsError, saleLinesError, saleLineCostSnapshots, saleLineCostsError, canViewProductMargins]);
  const rankedProducts = useMemo(() => [...insights.products]
    .filter((item) => productSort !== 'margin' || item.margin !== null)
    .sort((left, right) => productSort === 'quantity'
      ? right.units - left.units || right.amount - left.amount
      : productSort === 'margin'
        ? Number(right.margin) - Number(left.margin) || right.units - left.units
        : right.amount - left.amount || right.units - left.units), [insights.products, productSort]);

  return <section className="panel finance-sales-insights" aria-labelledby="finance-sales-insights-title">
    <div className="panel-heading">
      <div><span className="eyebrow">VENTAS · TENDENCIAS DEL POS</span><h2 id="finance-sales-insights-title">Ritmo de ventas</h2>
        <p>{saleReturnsError ? 'Ventas confirmadas brutas, por fecha local, sucursal y asesora. No son utilidad ni pagos recibidos.' : 'Ventas confirmadas netas de artículos devueltos, por fecha local, sucursal y asesora. No son utilidad ni pagos recibidos.'}</p></div>
      <ChartNoAxesCombined size={19} aria-hidden="true" />
    </div>
    {saleReturnsError && <p className="finance-sales-empty" role="alert">No se pudieron cargar las devoluciones; estas tendencias muestran ventas brutas y no descuentan artículos devueltos.</p>}
    <div className="finance-sales-week">
      <div className="finance-sales-week-header"><div><span className="eyebrow">SEMANA ACTUAL · LUNES A DOMINGO</span><h3>{shortDate(insights.weekStart)} – {shortDate(insights.weekEnd)}</h3></div><b>{money(insights.weekTotal)}</b></div>
      <div className="finance-sales-week-days" role="list" aria-label="Ventas confirmadas de la semana actual">
        {insights.weekDaily.map((day) => <div className={day.date === today ? 'is-today' : ''} key={day.date} role="listitem" aria-current={day.date === today ? 'date' : undefined}>
          <span>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString('es-EC', { timeZone: TIME_ZONE, weekday: 'short' })}</span><b>{money(day.amount)}</b><small>{day.count} ventas</small>
        </div>)}
      </div>
      <p className="finance-sales-note">{insights.week.length ? `${insights.week.length} ventas confirmadas · promedio ${saleReturnsError ? 'bruto' : 'neto'} ${money(insights.weekTotal / insights.week.length)} por venta.` : 'Sin ventas confirmadas esta semana para estos filtros.'} Los artículos devueltos se descuentan de la fecha original de venta cuando la carga está disponible.</p>
    </div>
    <div className="finance-sales-grid">
      <article className="finance-sales-card">
        <div className="finance-sales-card-heading"><ChartNoAxesCombined size={16} aria-hidden="true"/><h3>Ventas diarias · {month}</h3></div>
        <div className="finance-sales-daily" role="list" aria-label={`Ventas por día de ${month}`}>
          {insights.daily.map((day) => <div className="finance-sales-day" key={day.date} role="listitem" aria-label={`${day.date}: ${money(day.amount)}, ${day.count} ventas`} title={`${day.date}: ${money(day.amount)}, ${day.count} ventas`}>
            <i aria-hidden="true" style={{ height: `${day.amount ? Math.max(5, day.amount / insights.maxDaily * 72) : 2}px` }} />
            <span>{Number(day.date.slice(-2))}</span>
          </div>)}
        </div>
        <p className="finance-sales-note">{saleReturnsError ? 'Cada barra muestra ventas brutas porque no se pudieron cargar las devoluciones.' : 'Cada barra muestra ventas netas por fecha original; las devoluciones descuentan sus artículos de la venta asociada.'} Los días sin venta quedan en cero.</p>
      </article>
      <article className="finance-sales-card">
        <div className="finance-sales-card-heading"><Clock3 size={16} aria-hidden="true"/><h3>Patrón por día y hora · {month}</h3></div>
        {insights.weekdayRows.some((item) => item.count) ? <div className="finance-sales-weekday-list" role="list" aria-label={`Ventas por día de la semana en ${month}`}>
          {insights.weekdayRows.map((item) => <div className={item.id === insights.currentWeekDay?.id ? 'is-current-day' : ''} key={item.id} role="listitem" aria-label={`${item.label}${item.id === insights.currentWeekDay?.id ? ', hoy' : ''}: ${money(item.amount)}, ${item.count} ventas`}>
            <span>{item.label}</span><i aria-hidden="true"><b style={{ width: `${item.amount / insights.maxWeekday * 100}%` }} /></i><strong>{money(item.amount)}</strong><small>{item.count}</small>
          </div>)}
        </div> : <p className="finance-sales-empty">Sin ventas confirmadas en este mes.</p>}
        <div className="finance-sales-hour-summary"><b>Hora de mayor venta</b><span>{insights.topHour ? `${String(insights.topHour.hour).padStart(2, '0')}:00–${String(insights.topHour.hour + 1).padStart(2, '0')}:00 · ${money(insights.topHour.amount)}` : 'Sin datos horarios'}</span></div>
        {insights.topHour && <div className="finance-sales-hours" role="list" aria-label={`Importe ${saleReturnsError ? 'bruto' : 'neto'} de ventas por hora del día`}>
          {insights.hourly.map((item) => <i key={item.hour} role="listitem" aria-label={`${String(item.hour).padStart(2, '0')}:00–${String(item.hour + 1).padStart(2, '0')}:00: ${money(item.amount)}, ${item.count} ventas`} title={`${String(item.hour).padStart(2, '0')}:00 · ${money(item.amount)} · ${item.count} ventas`} style={{ height: `${item.amount ? Math.max(4, item.amount / insights.maxHour * 40) : 2}px` }} />)}
        </div>}
      </article>
      <article className="finance-sales-card finance-sales-products">
        <div className="finance-sales-card-heading"><Package size={16} aria-hidden="true"/><h3>Productos más vendidos por asesora</h3></div>
        <div className="finance-sales-product-ranks" role="group" aria-label="Ordenar productos por métrica">
          <button type="button" className={productSort === 'quantity' ? 'active' : ''} aria-pressed={productSort === 'quantity'} onClick={() => setProductSort('quantity')}><Package size={13}/> Cantidad</button>
          <button type="button" className={productSort === 'revenue' ? 'active' : ''} aria-pressed={productSort === 'revenue'} onClick={() => setProductSort('revenue')}><Banknote size={13}/> Facturación neta</button>
          {canViewProductMargins && <button type="button" className={productSort === 'margin' ? 'active' : ''} aria-pressed={productSort === 'margin'} onClick={() => setProductSort('margin')}><TrendingUp size={13}/> Margen bruto real</button>}
        </div>
        {saleLinesError ? <p className="finance-sales-empty" role="status">No se puede generar el ranking porque falló la carga de líneas de venta.</p> : saleReturnsError ? <p className="finance-sales-empty" role="status">No se puede ajustar el ranking por devoluciones porque falló la carga.</p> : productSort === 'margin' && saleLineCostsError ? <p className="finance-sales-empty" role="status">No se pudo cargar el costo real de las líneas: {saleLineCostsError}</p> : productSort === 'margin' && !insights.canCalculateMargins ? <p className="finance-sales-empty" role="status">El margen requiere permiso de costos, devoluciones y líneas cargadas correctamente.</p> : productSort === 'margin' && !rankedProducts.length ? <p className="finance-sales-empty" role="status">No hay líneas entregadas con costo real completo para calcular el margen de este periodo.</p> : rankedProducts.length ? <ol>
          {rankedProducts.slice(0, 5).map((item, index) => <li key={`${item.label}-${item.sku}`}><span className="finance-sales-rank">{index + 1}</span><span className="finance-sales-product-name"><b>{item.label}</b><small>{item.sku ? `${item.sku} · ` : ''}{item.salesCount} {item.salesCount === 1 ? 'venta' : 'ventas'}</small></span><span className="finance-sales-product-units">{item.units.toLocaleString('es-EC')} cant.</span><strong>{productSort === 'margin' ? <>{money(item.margin!)}<small>{item.marginRate === null ? 'Margen % n/d' : `${new Intl.NumberFormat('es-EC',{style:'percent',maximumFractionDigits:1}).format(item.marginRate)} sobre venta neta`}</small></> : money(item.amount)}</strong></li>)}
        </ol> : <p className="finance-sales-empty">No hay líneas de producto en las ventas confirmadas de este mes.</p>}
        {productSort === 'margin' ? <p className="finance-sales-note">Margen bruto en líneas entregadas con costo real capturado, menos devoluciones; excluye líneas sin costo real y costos indirectos. Cobertura: {insights.marginCoverage.total ? `${insights.marginCoverage.covered} de ${insights.marginCoverage.total} líneas entregadas (${Math.round(insights.marginCoverage.covered / insights.marginCoverage.total * 100)}%)` : 'sin líneas entregadas con costo en este periodo'}.</p> : <p className="finance-sales-note">{productSort === 'quantity' ? 'Ordenado por cantidad vendida; el valor monetario corresponde a facturación neta por producto.' : 'Ordenado por facturación neta de devoluciones.'} El descuento general se distribuye proporcionalmente; excluye conceptos manuales sin vínculo a producto. Asesora y sucursal siguen los filtros del informe.</p>}
      </article>
    </div>
  </section>;
}
