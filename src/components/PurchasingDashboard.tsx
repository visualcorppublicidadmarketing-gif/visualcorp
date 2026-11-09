import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, CalendarDays, Check, Clock3, Truck } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './PurchasingDashboard.css';

type BranchOption = { id: string; code: string; name: string };
type MonthlyMetric = { month: string; committed: number; received: number };
type SupplierMetric = { id: string; name: string; orders: number; committed: number };
type DashboardMetric = {
  confirmedValue: number;
  ordersInPeriod: number;
  receivedValue: number;
  paidDocumented: number;
  paymentSample: number;
  outstandingValue: number;
  overdueCount: number;
  overdueValue: number;
  onTimeCount: number;
  onTimeSample: number;
  onTimePercent: number | null;
  medianLeadDays: number | null;
  leadTimeSample: number;
  monthly: MonthlyMetric[];
  suppliers: SupplierMetric[];
  branches: BranchOption[];
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const subtractDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
const monthLabel = (value: string) => {
  const date = new Date(`${value}-01T12:00:00`);
  return new Intl.DateTimeFormat('es-EC', { month: 'short', year: '2-digit' }).format(date);
};
const emptyMetric: DashboardMetric = {
  confirmedValue: 0, ordersInPeriod: 0, receivedValue: 0, paidDocumented: 0, paymentSample: 0, outstandingValue: 0,
  overdueCount: 0, overdueValue: 0, onTimeCount: 0, onTimeSample: 0,
  onTimePercent: null, medianLeadDays: null, leadTimeSample: 0,
  monthly: [], suppliers: [], branches: [],
};

export function PurchasingDashboard({ organizationId, refreshVersion = 0 }: { organizationId: string | null; refreshVersion?: number }) {
  const prefersReducedMotion = useReducedMotion();
  const { hasPermission } = useAuth();
  const canViewFinance = hasPermission('finance', 'view');
  const [periodPreset, setPeriodPreset] = useState('90');
  const [periodEnd, setPeriodEnd] = useState(today());
  const [periodStart, setPeriodStart] = useState(subtractDays(today(), 89));
  const [branchId, setBranchId] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetric>(emptyMetric);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (periodPreset === 'custom') return;
    const end = today();
    setPeriodEnd(end);
    setPeriodStart(subtractDays(end, Number(periodPreset) - 1));
  }, [periodPreset]);

  useEffect(() => {
    if (!organizationId || !supabase) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: queryError } = await supabase.rpc('get_purchasing_dashboard', {
          p_organization_id: organizationId,
          p_branch_id: branchId || null,
          p_period_start: periodStart,
          p_period_end: periodEnd,
        });
        if (!active) return;
        if (queryError) throw queryError;
        const next = { ...emptyMetric, ...(data || {}) } as DashboardMetric;
        setMetrics(next);
        if (branchId && !next.branches.some((branch) => branch.id === branchId)) setBranchId('');
      } catch (queryError: any) {
        if (active) setError(queryError?.message || 'No se pudieron cargar las métricas de compras.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [organizationId, branchId, periodStart, periodEnd, refreshVersion]);

  const chartMonths = useMemo(() => metrics.monthly.map((row) => ({
    ...row, monthLabel: monthLabel(row.month), committed: Number(row.committed) || 0, received: Number(row.received) || 0,
  })), [metrics.monthly]);
  const supplierRows = useMemo(() => metrics.suppliers.map((row) => ({
    ...row, orders: Number(row.orders) || 0, committed: Number(row.committed) || 0,
  })), [metrics.suppliers]);
  const periodDescription = `${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${periodStart}T12:00:00`))} – ${new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${periodEnd}T12:00:00`))}`;

  return <section className="purchase-dashboard" aria-labelledby="purchase-dashboard-title">
    <div className="purchase-dashboard-heading">
      <div><span className="eyebrow">COMPRAS · DATOS OPERATIVOS</span><h2 id="purchase-dashboard-title">Panorama de abastecimiento</h2><p>Compromisos, recepciones y cumplimiento en órdenes registradas. Las cifras de órdenes no representan pagos.</p></div>
      <div className="purchase-dashboard-filters">
        <label><span><CalendarDays size={14}/> Periodo</span><select aria-label="Periodo de métricas" value={periodPreset} onChange={(event) => setPeriodPreset(event.target.value)}><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="365">Últimos 12 meses</option><option value="custom">Personalizado</option></select></label>
        {periodPreset === 'custom' && <div className="purchase-date-range"><label><span>Desde</span><input type="date" aria-label="Fecha inicial" required value={periodStart} min={subtractDays(periodEnd, 370)} max={periodEnd} onChange={(event) => setPeriodStart(event.target.value)}/></label><label><span>Hasta</span><input type="date" aria-label="Fecha final" required value={periodEnd} min={periodStart} max={addDays(periodStart, 370) < today() ? addDays(periodStart, 370) : today()} onChange={(event) => setPeriodEnd(event.target.value)}/></label></div>}
        <label><span><Activity size={14}/> Sucursal</span><select aria-label="Filtrar métricas por sucursal" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Sucursales permitidas</option>{metrics.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      </div>
    </div>

    {error && <div className="purchase-dashboard-error" role="alert"><AlertTriangle size={16}/><span>No se pudo actualizar este panorama. {error}</span><button type="button" onClick={() => setMetrics(emptyMetric)} aria-label="Limpiar datos anteriores">Cerrar</button></div>}
    <div className={`purchase-kpi-grid${loading ? ' is-loading' : ''}${canViewFinance ? ' has-finance' : ''}`} aria-busy={loading}>
      <article className="purchase-kpi purchase-kpi-commitment"><div className="purchase-kpi-icon"><ArrowUpRight size={17}/></div><span className="purchase-kpi-label">Valor ordenado en el periodo</span><strong>{loading ? '—' : formatMoney(metrics.confirmedValue)}</strong><small>{loading ? 'Actualizando…' : `${metrics.ordersInPeriod} ${metrics.ordersInPeriod === 1 ? 'orden' : 'órdenes'} emitidas · no equivale a pagos`}</small></article>
      {canViewFinance && <article className="purchase-kpi purchase-kpi-paid"><div className="purchase-kpi-icon"><Check size={17}/></div><span className="purchase-kpi-label">Pagos documentados</span><strong>{loading ? '—' : formatMoney(metrics.paidDocumented)}</strong><small>{loading ? 'Actualizando…' : `${metrics.paymentSample} ${metrics.paymentSample === 1 ? 'pago' : 'pagos'} ligados a órdenes · Finanzas · ${periodDescription}`}</small></article>}
      <article className="purchase-kpi purchase-kpi-pending"><div className="purchase-kpi-icon"><Truck size={17}/></div><span className="purchase-kpi-label">Pendiente de recibir</span><strong>{loading ? '—' : formatMoney(metrics.outstandingValue)}</strong><small>Todas las órdenes abiertas · costo unitario registrado</small></article>
      <article className={`purchase-kpi purchase-kpi-overdue${metrics.overdueCount ? ' has-alert' : ''}`}><div className="purchase-kpi-icon"><AlertTriangle size={17}/></div><span className="purchase-kpi-label">Entregas vencidas</span><strong>{loading ? '—' : quantityLabel(metrics.overdueCount)}</strong><small>{loading ? 'Actualizando…' : `${formatMoney(metrics.overdueValue)} aún por recibir · fecha prevista anterior a hoy`}</small></article>
      <article className="purchase-kpi purchase-kpi-ontime"><div className="purchase-kpi-icon"><Clock3 size={17}/></div><span className="purchase-kpi-label">Entrega a tiempo</span><strong>{loading || metrics.onTimePercent === null ? '—' : `${metrics.onTimePercent}%`}</strong><small>{loading ? 'Actualizando…' : metrics.onTimeSample ? `${metrics.onTimeCount} de ${metrics.onTimeSample} órdenes recibidas con fecha prevista · ${periodDescription}` : `Sin órdenes completas con fecha prevista · ${periodDescription}`}</small></article>
    </div>

    <div className="purchase-dashboard-chart-grid">
      <section className="purchase-chart-card purchase-trend-card">
        <header><div><span className="eyebrow">TENDENCIA · USD</span><h3>Órdenes emitidas y recepción acumulada</h3><p>Agrupado por mes de emisión. “Aceptado” muestra lo recibido hasta hoy para esas órdenes; no equivale a pagos ni facturas.</p></div><span className="purchase-chart-period">{periodDescription}</span></header>
        {chartMonths.length ? <div className="purchase-chart-canvas purchase-trend-canvas"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartMonths} margin={{ top: 8, right: 8, bottom: 0, left: 2 }} accessibilityLayer>
          <defs><linearGradient id="purchaseCommittedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#92218c" stopOpacity={0.2}/><stop offset="95%" stopColor="#92218c" stopOpacity={0.01}/></linearGradient><linearGradient id="purchaseReceivedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#159e91" stopOpacity={0.18}/><stop offset="95%" stopColor="#159e91" stopOpacity={0.01}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="#edeaf0" strokeDasharray="3 5"/><XAxis dataKey="monthLabel" tickLine={false} axisLine={false} tickMargin={10} minTickGap={14} fontSize={11} stroke="#85818d"/><YAxis tickLine={false} axisLine={false} width={66} fontSize={10} stroke="#85818d" tickFormatter={(value) => compactMoney(Number(value))}/>
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="purchase-chart-tooltip"><b>{label}</b>{payload.map((point: any) => <span key={point.dataKey}><i style={{ background: point.color }}/>{point.name}: <strong>{formatMoney(Number(point.value))}</strong></span>)}</div> : null}/>
          <Area type="monotone" dataKey="committed" name="Ordenado" stroke="#92218c" strokeWidth={2.5} fill="url(#purchaseCommittedFill)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={!prefersReducedMotion}/>
          <Area type="monotone" dataKey="received" name="Aceptado acumulado" stroke="#159e91" strokeWidth={2.5} fill="url(#purchaseReceivedFill)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={!prefersReducedMotion}/>
        </AreaChart></ResponsiveContainer></div> : <ChartEmpty loading={loading} text="Todavía no hay órdenes emitidas en este periodo."/>}
        {chartMonths.length > 0 && <div className="purchase-chart-legend"><span><i className="is-committed"/> Ordenado</span><span><i className="is-received"/> Aceptado acumulado</span></div>}
      </section>
      <section className="purchase-chart-card purchase-supplier-chart-card">
        <header><div><span className="eyebrow">PROVEEDORES · USD</span><h3>Mayor valor ordenado</h3><p>Top cinco del periodo por importe registrado.</p></div><span className="purchase-chart-period">{supplierRows.length} {supplierRows.length === 1 ? 'proveedor' : 'proveedores'}</span></header>
        {supplierRows.length ? <div className="purchase-chart-canvas purchase-supplier-canvas"><ResponsiveContainer width="100%" height="100%"><BarChart data={supplierRows} layout="vertical" margin={{ top: 2, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
          <CartesianGrid horizontal={false} stroke="#edeaf0" strokeDasharray="3 5"/><XAxis type="number" tickLine={false} axisLine={false} fontSize={10} stroke="#85818d" tickFormatter={(value) => compactMoney(Number(value))}/><YAxis type="category" dataKey="name" width={116} tickLine={false} axisLine={false} fontSize={10} stroke="#615c68" tick={{ width: 112 }} interval={0}/>
          <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="purchase-chart-tooltip"><b>{payload[0]?.payload?.name}</b><span>Valor: <strong>{formatMoney(Number(payload[0]?.value))}</strong></span><span>Órdenes: <strong>{payload[0]?.payload?.orders}</strong></span></div> : null}/>
          <Bar dataKey="committed" name="Ordenado" fill="#79518c" radius={[0, 7, 7, 0]} maxBarSize={24} isAnimationActive={!prefersReducedMotion}/>
        </BarChart></ResponsiveContainer></div> : <ChartEmpty loading={loading} text="Aún no hay compras registradas en este periodo."/>}
      </section>
    </div>

    <div className="purchase-dashboard-footnote"><span><Clock3 size={15}/>{metrics.medianLeadDays === null || loading ? 'Plazo mediano: sin muestra suficiente.' : `Plazo mediano de recepción: ${metrics.medianLeadDays} días en ${metrics.leadTimeSample} órdenes completas del periodo.`}</span><span>Importes en USD · solo órdenes autorizadas para tu perfil · actualizado desde registros operativos.</span></div>
    <details className="purchase-dashboard-data"><summary>Consultar datos en tabla</summary><div className="table-wrap"><table><caption>Importes agrupados por mes de emisión; recepción acumulada a costo de orden, {periodDescription}</caption><thead><tr><th scope="col">Mes</th><th scope="col">Valor ordenado</th><th scope="col">Aceptado acumulado</th><th scope="col">Saldo de esas órdenes</th></tr></thead><tbody>{chartMonths.map((row) => <tr key={row.month}><th scope="row">{row.monthLabel}</th><td>{formatMoney(row.committed)}</td><td>{formatMoney(row.received)}</td><td>{formatMoney(Math.max(0, row.committed-row.received))}</td></tr>)}</tbody></table></div></details>
  </section>;
}

function ChartEmpty({ loading, text }: { loading: boolean; text: string }) {
  return <div className="purchase-chart-empty" role="status"><span className={loading ? 'is-loading' : ''}><Activity size={19}/></span><b>{loading ? 'Actualizando información' : text}</b><small>{loading ? 'Conservamos la lectura hasta que termine la consulta.' : 'Selecciona otro periodo o sucursal para ampliar la consulta.'}</small></div>;
}

function quantityLabel(value: number) {
  return new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 }).format(value);
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)} M`;
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)} mil`;
  return `$${Math.round(value)}`;
}
