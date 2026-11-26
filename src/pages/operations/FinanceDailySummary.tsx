import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Banknote,
  Building2, ChevronDown, CircleDollarSign, Clock3, CreditCard,
  ListFilter, ReceiptText, RefreshCw, UsersRound, Wallet,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { financeHour, financeTime, summarizeFinanceDay, unassignedAdvisor } from './dailyFinanceSummaryModel';
import { useFinancePeriod } from './useFinancePeriod';
import { addDays, businessDate, dateLabel, PAYMENT_METHODS } from './weeklyFinanceSummaryModel';
import './finance-daily-summary.css';

const currency = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const compactCurrency = new Intl.NumberFormat('es-EC', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
});
const money = (cents: number) => currency.format(cents / 100);
const hourLabel = (hour: number) => String(hour).padStart(2, '0') + ':00';
const countLabel = (count: number, singular: string, plural: string) => count + ' ' + (count === 1 ? singular : plural);
const METHOD_COLORS = { cash: '#59e5c6', transfer: '#6eb1ff', card: '#b8a0ff', cheque: '#ffd186', other: '#adbad4' };
const METHOD_ICONS = { cash: Banknote, transfer: ArrowUpRight, card: CreditCard, cheque: ReceiptText, other: Wallet };
const CHART_LABELS = { collected: 'Cobros', sales: 'Ventas' };
const INITIAL_MOVEMENT_LIMIT = 5;

export function FinanceDailySummary() {
  const { organizationId, hasPermission } = useAuth();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const sync = () => setNow(new Date());
    const timer = window.setInterval(sync, 30_000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const today = businessDate(now);
  const canSeeRefunds = hasPermission('sales', 'view');
  const canSeeTeam = hasPermission('team', 'view');
  return <DailyFinanceView
    key={JSON.stringify([organizationId, today, canSeeRefunds, canSeeTeam])}
    today={today}
    hour={financeHour(now)}
    organizationId={organizationId}
    canSeeRefunds={canSeeRefunds}
    canSeeTeam={canSeeTeam}
  />;
}

function DailyFinanceView({ today, hour, organizationId, canSeeRefunds, canSeeTeam }: {
  today: string;
  hour: number;
  organizationId?: string | null;
  canSeeRefunds: boolean;
  canSeeTeam: boolean;
}) {
  const [branch, setBranch] = useState('all');
  const [advisor, setAdvisor] = useState('all');
  const [metric, setMetric] = useState<'collected' | 'sales'>('collected');
  const [movementType, setMovementType] = useState('all');
  const [movementLimit, setMovementLimit] = useState(INITIAL_MOVEMENT_LIMIT);
  const { snapshot, loading, error, rosterError, refresh } = useFinancePeriod({
    organizationId, start: today, end: addDays(today, 1), branchFilter: 'all',
    canSeeRefunds, canSeeTeam, scope: 'daily',
  });

  const directory = useMemo(() => {
    const names = new Map<string, string>();
    for (const member of snapshot.team) {
      if (member.active && (member.role === 'advisor' || member.access_profile_key === 'asesoras') && member.user_id) {
        const name = String(member.full_name || '').trim();
        if (name) names.set(member.user_id, name);
      }
    }
    for (const sale of snapshot.saleContext) {
      const id = sale.advisor_id || unassignedAdvisor;
      if (!names.has(id)) names.set(id, id === unassignedAdvisor ? 'Sin asesora asignada' : 'Usuario ' + id.slice(0, 8));
    }
    return names;
  }, [snapshot.team, snapshot.saleContext]);
  const advisors = [...directory].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const activeBranch = snapshot.branches.some((item) => item.id === branch) ? branch : 'all';
  const activeAdvisor = directory.has(advisor) ? advisor : 'all';
  const summary = useMemo(() => summarizeFinanceDay(snapshot, activeBranch, activeAdvisor), [snapshot, activeBranch, activeAdvisor]);
  const advisorRows = [...summary.advisors].sort((a, b) => b.collected - a.collected || b.sales - a.sales);
  const movements = summary.movements.filter((movement) => movementType === 'all' || movement.type === movementType);
  const hasActivity = metric === 'collected' ? summary.paymentCount > 0 : summary.saleCount > 0;
  const hasData = !error && !loading;
  const visibleHours = summary.hourly.map((point) => ({
    hour: point.hour,
    amount: point.hour <= hour ? point[metric] : null,
  }));
  const currentTotal = metric === 'collected' ? summary.collectedCents : summary.salesCents;
  const date = dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cards = [
    { label: 'Ventas confirmadas', value: summary.salesCents, detail: countLabel(summary.saleCount, 'venta registrada', 'ventas registradas'), icon: ReceiptText, tone: 'purple' },
    { label: 'Cobros registrados', value: summary.collectedCents, detail: countLabel(summary.paymentCount, 'pago recibido', 'pagos recibidos'), icon: ArrowDownLeft, tone: 'mint' },
    { label: 'Devoluciones liquidadas', value: canSeeRefunds ? summary.refundsCents : null, detail: canSeeRefunds ? countLabel(summary.refundCount, 'reembolso', 'reembolsos') : 'Requiere permiso de ventas', icon: ArrowUpRight, tone: 'pink' },
  ];

  return <section className="daily-finance" aria-labelledby="daily-finance-title">
    <header className="df-header">
      <div>
        <Link className="df-breadcrumb" to="/operaciones/finanzas"><Wallet size={15} aria-hidden="true" /> Finanzas</Link>
        <h1 id="daily-finance-title">Resumen diario</h1>
        <p className="df-date"><span className="df-today">Hoy</span><time dateTime={today}>{date}</time></p>
      </div>
      <div className="df-actions">
        <Link className="df-control" to="/operaciones/finanzas/resumen-semanal">Ver semana <ArrowRight size={16} aria-hidden="true" /></Link>
        <button className="df-control df-refresh" type="button" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </div>
    </header>

    <div className="df-filters">
      <label><Building2 size={16} aria-hidden="true" /><span>Sucursal</span><select value={activeBranch} onChange={(event) => setBranch(event.target.value)}>
        <option value="all">Todas las sucursales</option>
        {snapshot.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select><ChevronDown size={14} aria-hidden="true" /></label>
      <label><UsersRound size={16} aria-hidden="true" /><span>Asesora</span><select value={activeAdvisor} onChange={(event) => setAdvisor(event.target.value)}>
        <option value="all">Todas las asesoras</option>
        {advisors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select><ChevronDown size={14} aria-hidden="true" /></label>
      <span className="df-timezone"><Clock3 size={14} aria-hidden="true" /> Hora de Ecuador</span>
    </div>

    {error && <div className="df-error" role="alert"><span><strong>No se pudo cargar el resumen.</strong> {error}</span><button className="df-control" type="button" onClick={refresh}>Reintentar</button></div>}
    {loading && <p className="df-sr-only" role="status">Cargando el resumen diario.</p>}
    {rosterError && !error && <p className="df-notice" role="status">{rosterError}</p>}

    <div className="df-board" aria-busy={loading}>
      <div className="df-metrics">
        {cards.map(({ label, value, detail, icon: Icon, tone }) => <section key={label} className={'df-metric df-' + tone}>
          <span className="df-metric-icon"><Icon size={19} aria-hidden="true" /></span>
          <div><h2>{label}</h2><strong>{hasData && value !== null ? money(value) : '—'}</strong>
            <p>{hasData ? detail : loading ? 'Actualizando…' : 'Datos no disponibles'}</p></div>
        </section>)}
      </div>

      <div className="df-grid">
        <section className="df-panel df-pulse" aria-labelledby="df-pulse-title">
          <div className="df-panel-heading">
            <h2 id="df-pulse-title"><Activity size={18} aria-hidden="true" /> Actividad por hora</h2>
            <div className="df-segments" role="group" aria-label="Métrica del gráfico">
              {(['collected', 'sales'] as const).map((option) => <button key={option} type="button" aria-pressed={metric === option} onClick={() => setMetric(option)}>{CHART_LABELS[option]}</button>)}
            </div>
          </div>
          <div className="df-pulse-total"><strong>{hasData ? money(currentTotal) : '—'}</strong><span>{metric === 'collected' ? 'Cobrado hoy' : 'Vendido hoy'}</span></div>
          {hasData && hasActivity ? <div className="df-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart accessibilityLayer data={visibleHours} margin={{ right: 16, left: 0, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="df-area-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#599fff" stopOpacity={0.47} />
                    <stop offset="100%" stopColor="#705dff" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#829ccd30" strokeDasharray="3 5" />
                <XAxis dataKey="hour" ticks={[0, 4, 8, 12, 16, 20, 23]} tickFormatter={hourLabel} axisLine={false} tickLine={false} tick={{ fill: '#b6c6e9', fontSize: 11 }} minTickGap={14} />
                <YAxis width={54} tickFormatter={(amount) => compactCurrency.format(amount / 100)} axisLine={false} tickLine={false} tick={{ fill: '#b6c6e9', fontSize: 11 }} />
                <Tooltip formatter={(amount) => [money(Number(amount)), CHART_LABELS[metric]]} labelFormatter={(point) => hourLabel(Number(point))}
                  contentStyle={{ background: '#151d39', borderColor: '#5775b0', borderRadius: 12, color: '#f1f5ff' }}
                  itemStyle={{ color: '#dce9ff' }} cursor={{ stroke: '#a3cbff', strokeDasharray: '4 4' }} />
                <Area dataKey="amount" type="linear" fill="url(#df-area-fill)" stroke="#9edaff" strokeWidth={2.5} isAnimationActive={false}
                  dot={({ cx, cy, payload }) => payload.amount != null && (payload.amount !== 0 || payload.hour === hour)
                    ? <circle key={payload.hour} cx={cx} cy={cy} r={3.5} fill="#abe3ff" stroke="#243c77" strokeWidth={1.5} />
                    : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div> : <div className="df-chart df-chart-empty"><BarChart3 size={24} aria-hidden="true" /><span>{loading ? 'Cargando actividad…' : error ? 'Actividad no disponible' : 'Todavía no hay ' + CHART_LABELS[metric].toLowerCase() + ' para estos filtros.'}</span></div>}
        </section>

        <section className="df-panel df-methods" aria-labelledby="df-methods-title">
          <div className="df-panel-heading"><h2 id="df-methods-title"><CreditCard size={18} aria-hidden="true" /> Medios de cobro</h2></div>
          <div className="df-split" aria-hidden="true">
            {hasData && summary.collectedCents > 0 && PAYMENT_METHODS.map(({ id }) => {
              const amount = summary.methods.get(id) ?? 0;
              return amount > 0 && <span key={id} style={{ flexGrow: amount, background: METHOD_COLORS[id] }} />;
            })}
          </div>
          <ul className="df-method-list">
            {PAYMENT_METHODS.map(({ id, label }) => {
              const Icon = METHOD_ICONS[id];
              return <li key={id}><span className="df-method-icon" style={{ color: METHOD_COLORS[id] }}><Icon size={17} aria-hidden="true" /></span><span>{label}</span><strong>{hasData ? money(summary.methods.get(id) ?? 0) : '—'}</strong></li>;
            })}
          </ul>
        </section>

        <section className="df-panel df-advisors" aria-labelledby="df-advisors-title">
          <div className="df-panel-heading"><h2 id="df-advisors-title"><UsersRound size={18} aria-hidden="true" /> Por asesora</h2></div>
          {hasData && advisorRows.length > 0 ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Totales por asesora">
            <table><thead><tr><th scope="col">Asesora</th><th scope="col">Ventas</th><th scope="col">Cobros</th></tr></thead>
              <tbody>{advisorRows.map((row) => <tr key={row.id}><th scope="row">{directory.get(row.id)}</th><td>{money(row.sales)}</td><td>{money(row.collected)}</td></tr>)}</tbody>
            </table>
          </div> : <p className="df-empty">{loading ? 'Cargando totales…' : error ? 'Totales no disponibles' : 'Sin ventas ni cobros para estos filtros.'}</p>}
        </section>

        <section className="df-panel df-movements" aria-labelledby="df-movements-title">
          <div className="df-panel-heading"><h2 id="df-movements-title"><ListFilter size={18} aria-hidden="true" /> Movimientos</h2>
            {canSeeRefunds && <select aria-label="Tipo de movimiento" value={movementType} onChange={(event) => {
              setMovementType(event.target.value);
              setMovementLimit(INITIAL_MOVEMENT_LIMIT);
            }}>
              <option value="all">Todos</option><option value="payment">Cobros</option><option value="refund">Devoluciones</option>
            </select>}
          </div>
          {hasData && movements.length > 0 ? <>
            <ul className="df-feed">
              {movements.slice(0, movementLimit).map((movement) => {
                const isRefund = movement.type === 'refund';
                const Icon = isRefund ? ArrowUpRight : CircleDollarSign;
                const code = movement.sale.sale_code || movement.sale.id.slice(0, 8);
                return <li key={movement.type + movement.id}>
                  <span className={'df-movement-icon' + (isRefund ? ' df-out' : '')}><Icon size={17} aria-hidden="true" /></span>
                  <div><b>{isRefund ? 'Devolución' : PAYMENT_METHODS.find((method) => method.id === movement.method)?.label}</b><small>{isRefund ? movement.return_code || code : code} · {directory.get(movement.sale.advisor_id || unassignedAdvisor)}</small></div>
                  <div className="df-movement-value"><strong className={isRefund ? 'df-out' : ''}>{isRefund ? '−' : '+'}{money(movement.amountCents)}</strong><time dateTime={movement.timestamp}>{financeTime(movement.timestamp)}</time></div>
                </li>;
              })}
            </ul>
            {movements.length > INITIAL_MOVEMENT_LIMIT && <button className="df-control df-more" type="button" onClick={() => setMovementLimit(
              movementLimit >= movements.length ? INITIAL_MOVEMENT_LIMIT : movementLimit + INITIAL_MOVEMENT_LIMIT,
            )}>{movementLimit >= movements.length ? 'Mostrar menos' : 'Ver más movimientos'} <ChevronDown size={15} aria-hidden="true" /></button>}
          </> : <p className="df-empty">{loading ? 'Cargando movimientos…' : error ? 'Movimientos no disponibles' : 'Sin movimientos para estos filtros.'}</p>}
        </section>
      </div>
    </div>
  </section>;
}
