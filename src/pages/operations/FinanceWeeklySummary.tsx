import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import NumberFlow from '@number-flow/react';
import { motion, useReducedMotion } from 'motion/react';
import { CalendarDays, ChevronLeft, CircleDollarSign, CreditCard, ReceiptText, RotateCcw, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFinancePeriod } from './useFinancePeriod';
import {
  addDays,
  businessDate,
  cents,
  dateLabel,
  FINANCE_TIME_ZONE,
  mondayOf,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  summarizeWeeklyAttribution,
  weekdayLabel,
  type PaymentMethodId,
} from './weeklyFinanceSummaryModel';
import './finance-weekly-summary.css';

const PAYMENT_LABELS = Object.fromEntries(PAYMENT_METHODS.map((method) => [method.id, method.label])) as Record<PaymentMethodId, string>;
const money = (value: number) => new Intl.NumberFormat('es-EC', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value || 0);
const fromCents = (value: number) => money(value / 100);

function AnimatedCurrency({ value, reduceMotion }: { value: number; reduceMotion: boolean }) {
  const label = fromCents(value);
  if (reduceMotion) return <span>{label}</span>;
  return <NumberFlow value={value / 100} locales="es-EC" format={{ style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }} aria-label={label} aria-live="off" />;
}

function AnimatedCount({ value, reduceMotion }: { value: number; reduceMotion: boolean }) {
  const label = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 }).format(value);
  if (reduceMotion) return <span>{label}</span>;
  return <NumberFlow value={value} locales="es-EC" format={{ maximumFractionDigits: 0 }} aria-label={label} aria-live="off" />;
}

type DetailFilter = { date?: string; advisorId?: string };

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: FINANCE_TIME_ZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

function advisorFallback(id: string) {
  return id === 'unassigned' ? 'Sin asesora asignada' : `Usuario ${id.slice(0, 8)}`;
}

export function FinanceWeeklySummary() {
  const { organizationId, hasPermission } = useAuth();
  const reduceMotion = useReducedMotion() ?? false;
  const canSeeRefunds = hasPermission('sales', 'view');
  const canSeeTeam = hasPermission('team', 'view');
  const [today, setToday] = useState(() => businessDate());
  const currentWeekStart = useMemo(() => mondayOf(today), [today]);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const lastCurrentWeek = useRef(currentWeekStart);
  const [mobileDate, setMobileDate] = useState(currentWeekStart);
  const [branchFilter, setBranchFilter] = useState('all');
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId | 'all'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'collections'>('sales');
  const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);
  const detailsDialog = useRef<HTMLDialogElement>(null);
  const { snapshot, loading, error, rosterError, refresh } = useFinancePeriod({
    organizationId, start: weekStart, end: addDays(weekStart, 7), branchFilter, canSeeRefunds, canSeeTeam, scope: 'weekly',
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday((current) => {
        const next = businessDate();
        return current === next ? current : next;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (lastCurrentWeek.current !== currentWeekStart) {
      const previous = lastCurrentWeek.current;
      lastCurrentWeek.current = currentWeekStart;
      setWeekStart((current) => current === previous ? currentWeekStart : current);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    setMobileDate(weekStart === currentWeekStart && today >= weekStart ? today : weekStart);
  }, [weekStart, currentWeekStart, today]);

  useEffect(() => {
    const dialog = detailsDialog.current;
    if (!dialog) return;
    if (detailFilter && !dialog.open) dialog.showModal();
    if (!detailFilter && dialog.open) dialog.close();
  }, [detailFilter]);

  const branchNames = useMemo(() => new Map(snapshot.branches.map((branch) => [branch.id, branch.name])), [snapshot.branches]);
  const saleContextById = useMemo(() => new Map(snapshot.saleContext.map((sale) => [sale.id, sale])), [snapshot.saleContext]);
  const advisorNames = useMemo(() => {
    const names = new Map<string, string>();
    snapshot.team.forEach((member: any) => {
      if (member.active && (member.role === 'advisor' || member.access_profile_key === 'asesoras') && member.user_id) {
        const fullName = String(member.full_name || '').trim();
        if (fullName && !names.has(member.user_id)) names.set(member.user_id, fullName);
      }
    });
    return names;
  }, [snapshot.team]);

  const directory = useMemo(() => {
    const ids = new Set(advisorNames.keys());
    snapshot.saleContext.forEach((sale) => { if (sale.advisor_id) ids.add(sale.advisor_id); });
    const sorted = [...ids].map((id) => ({ id, name: advisorNames.get(id) || advisorFallback(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const hasUnassigned = snapshot.sales.some((sale) => !sale.advisor_id)
      || snapshot.payments.some((payment) => !saleContextById.get(payment.sale_id)?.advisor_id)
      || snapshot.refunds.some((refund) => !saleContextById.get(refund.sale_id)?.advisor_id);
    return hasUnassigned ? [{ id: 'unassigned', name: 'Sin asesora asignada' }, ...sorted] : sorted;
  }, [advisorNames, snapshot.saleContext, snapshot.sales, snapshot.payments, snapshot.refunds, saleContextById]);

  const sales = useMemo(() => snapshot.sales.filter((sale) => (
    advisorFilter === 'all' || (sale.advisor_id || 'unassigned') === advisorFilter
  )), [snapshot.sales, advisorFilter]);
  const allPayments = useMemo(() => snapshot.payments.flatMap((payment) => {
    const sale = saleContextById.get(payment.sale_id);
    if (!sale || (branchFilter !== 'all' && sale.branch_id !== branchFilter)) return [];
    const advisorId = sale.advisor_id || 'unassigned';
    if (advisorFilter !== 'all' && advisorFilter !== advisorId) return [];
    const method = normalizePaymentMethod(payment.method);
    return [{ ...payment, sale, advisorId, method, amountCents: cents(payment.amount), date: businessDate(payment.created_at) }];
  }), [snapshot.payments, saleContextById, branchFilter, advisorFilter]);
  const payments = useMemo(() => selectedMethod === 'all'
    ? allPayments
    : allPayments.filter((payment) => payment.method === selectedMethod), [allPayments, selectedMethod]);
  const refunds = useMemo(() => snapshot.refunds.flatMap((refund) => {
    const sale = saleContextById.get(refund.sale_id);
    if (!sale || (branchFilter !== 'all' && refund.branch_id !== branchFilter)) return [];
    const advisorId = sale.advisor_id || 'unassigned';
    if (advisorFilter !== 'all' && advisorFilter !== advisorId) return [];
    return [{ ...refund, sale, advisorId, amountCents: cents(refund.amount) }];
  }), [snapshot.refunds, saleContextById, branchFilter, advisorFilter]);

  const advisorRows = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; salesCents: number; salesCount: number; collectionsCents: number; methods: Record<PaymentMethodId, number>; days: Record<string, number> }>();
    const ensure = (id: string) => {
      let row = rows.get(id);
      if (!row) {
        row = {
          id, name: id === 'unassigned' ? 'Sin asesora asignada' : advisorNames.get(id) || advisorFallback(id),
          salesCents: 0, salesCount: 0, collectionsCents: 0,
          methods: { cash: 0, transfer: 0, card: 0, cheque: 0, other: 0 }, days: {},
        };
        rows.set(id, row);
      }
      return row;
    };
    directory.forEach(({ id }) => {
      if (advisorFilter === 'all' || advisorFilter === id) ensure(id);
    });
    sales.forEach((sale) => {
      const row = ensure(sale.advisor_id || 'unassigned');
      row.salesCents += cents(sale.total);
      row.salesCount += 1;
    });
    payments.forEach((payment) => {
      const row = ensure(payment.advisorId);
      row.collectionsCents += payment.amountCents;
      row.methods[payment.method] += payment.amountCents;
      row.days[payment.date] = (row.days[payment.date] || 0) + payment.amountCents;
    });
    return [...rows.values()].sort((a, b) => (
      sortBy === 'sales'
        ? b.salesCents - a.salesCents || a.name.localeCompare(b.name, 'es')
        : b.collectionsCents - a.collectionsCents || a.name.localeCompare(b.name, 'es')
    ));
  }, [directory, advisorFilter, sales, payments, advisorNames, sortBy]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const chartRows = useMemo(() => {
    const methodsByAdvisor = new Map<string, Record<PaymentMethodId, number>>();
    allPayments.forEach((payment) => {
      const methods = methodsByAdvisor.get(payment.advisorId) || { cash: 0, transfer: 0, card: 0, cheque: 0, other: 0 };
      methods[payment.method] += payment.amountCents;
      methodsByAdvisor.set(payment.advisorId, methods);
    });
    return advisorRows.map((row) => {
      const methods = methodsByAdvisor.get(row.id) || { cash: 0, transfer: 0, card: 0, cheque: 0, other: 0 };
      return {
        advisorId: row.id,
        advisorName: row.name,
        cash: methods.cash / 100,
        transfer: methods.transfer / 100,
        card: methods.card / 100,
        cheque: methods.cheque / 100,
        other: methods.other / 100,
      };
    });
  }, [advisorRows, allPayments]);
  const collectedCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const weeklyAttribution = useMemo(() => summarizeWeeklyAttribution(sales, refunds, weekStart), [sales, refunds, weekStart]);
  const { salesCents, saleCount, refundsCents, refundCount } = weeklyAttribution;
  const dailyTotals = useMemo(() => weekDays.map((date) => ({
    date,
    cents: payments.filter((payment) => payment.date === date).reduce((sum, payment) => sum + payment.amountCents, 0),
  })), [weekDays, payments]);
  const selectedDayTotal = dailyTotals.find((day) => day.date === mobileDate)?.cents || 0;
  const isCurrentWeek = weekStart === currentWeekStart;
  const rangeLabel = `${dateLabel(weekStart)} – ${dateLabel(addDays(weekStart, 6), { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const detailPayments = useMemo(() => snapshot.payments.flatMap((payment) => {
    const sale = saleContextById.get(payment.sale_id);
    if (!sale || (branchFilter !== 'all' && sale.branch_id !== branchFilter)) return [];
    const advisorId = sale.advisor_id || 'unassigned';
    const method = normalizePaymentMethod(payment.method);
    const date = businessDate(payment.created_at);
    if (advisorFilter !== 'all' && advisorFilter !== advisorId) return [];
    if (selectedMethod !== 'all' && selectedMethod !== method) return [];
    if (detailFilter?.date && detailFilter.date !== date) return [];
    if (detailFilter?.advisorId && detailFilter.advisorId !== advisorId) return [];
    return [{ ...payment, sale, advisorId, method, amountCents: cents(payment.amount) }];
  }).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)), [
    snapshot.payments, saleContextById, branchFilter, advisorFilter, selectedMethod, detailFilter,
  ]);
  const detailTotal = detailPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const detailTitle = detailFilter?.date
    ? `Cobros · ${weekdayLabel(detailFilter.date)} ${dateLabel(detailFilter.date)}`
    : 'Cobros de la semana';

  const openDetails = (filter: DetailFilter = {}) => setDetailFilter(filter);
  const selectMethod = (method: PaymentMethodId) => setSelectedMethod((current) => current === method ? 'all' : method);

  return (
    <section className="weekly-finance" aria-busy={loading}>
      <div className="weekly-finance-toolbar">
        <div className="weekly-finance-range">
          <span className="weekly-finance-range-icon" aria-hidden="true"><CalendarDays size={18} /></span>
          <div><span className="weekly-finance-kicker">{isCurrentWeek ? 'SEMANA ACTUAL' : 'SEMANA CONSULTADA'}</span><strong>{rangeLabel}</strong><small>Semana de lunes a domingo · hora de Ecuador</small></div>
        </div>
        <div className="weekly-finance-actions">
          <Link className="button button-outline" to="/operaciones/finanzas/resumen-diario">Ver hoy</Link>
          <button type="button" className="button button-outline" onClick={() => setWeekStart((date) => addDays(date, -7))} aria-label="Ver semana anterior"><ChevronLeft size={16} /> Semana anterior</button>
          {!isCurrentWeek && <button type="button" className="button button-outline" onClick={() => setWeekStart(currentWeekStart)}><RotateCcw size={15} /> Semana actual</button>}
          <button type="button" className="button button-outline weekly-finance-refresh" onClick={refresh} disabled={loading} aria-label="Actualizar resumen"><RefreshCw size={15} /> Actualizar</button>
        </div>
      </div>

      <div className="weekly-finance-filters" aria-label="Filtros del resumen semanal">
        <label><span>Sucursal</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          <option value="all">Todas las sucursales</option>
          {snapshot.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select></label>
        <label><span>Asesora</span><select value={advisorFilter} onChange={(event) => setAdvisorFilter(event.target.value)}>
          <option value="all">Todas las asesoras</option>
          {directory.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
        </select></label>
        {selectedMethod !== 'all' && <button type="button" className="weekly-finance-clear-filter" onClick={() => setSelectedMethod('all')}>Quitar filtro: {PAYMENT_LABELS[selectedMethod]} <span aria-hidden="true">×</span></button>}
      </div>

      {error && <div className="weekly-finance-error" role="alert"><b>No se pudo cargar el resumen semanal</b><span>{error}</span><button type="button" className="button button-outline" onClick={refresh}>Reintentar</button></div>}
      {rosterError && !error && <p className="weekly-finance-note" role="status">{rosterError}</p>}
      {!canSeeTeam && !error && <p className="weekly-finance-note">Tu perfil no muestra asesoras sin movimientos; el resumen incluye a quienes registraron ventas o cobros esta semana.</p>}
      {!canSeeRefunds && !error && <p className="weekly-finance-note">El total de reembolsos requiere el permiso de consulta de ventas; los demás bloques siguen disponibles.</p>}

      <motion.div
        className="weekly-finance-metrics"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.26, ease: 'easeOut' }}
      >
        <article className="weekly-finance-metric weekly-finance-metric--sales">
          <div className="weekly-finance-metric-label"><span>Ventas confirmadas</span><CircleDollarSign size={17} aria-hidden="true" /></div>
          <b>{loading ? '—' : <AnimatedCurrency value={salesCents} reduceMotion={reduceMotion} />}</b>
          <small>{loading ? 'Cargando…' : 'Ventas confirmadas · semana del registro'}</small>
        </article>
        <article className="weekly-finance-metric weekly-finance-metric--collections">
          <div className="weekly-finance-metric-label"><span>Total cobrado{selectedMethod !== 'all' ? ` · ${PAYMENT_LABELS[selectedMethod]}` : ''}</span><Wallet size={17} aria-hidden="true" /></div>
          <b>{loading ? '—' : <AnimatedCurrency value={collectedCents} reduceMotion={reduceMotion} />}</b>
          <small>{loading ? 'Cargando…' : `${payments.length} ${payments.length === 1 ? 'movimiento' : 'movimientos'} · fecha del pago`}</small>
        </article>
        <article className="weekly-finance-metric weekly-finance-metric--refunds">
          <div className="weekly-finance-metric-label"><span>Reembolsos realizados</span><ReceiptText size={17} aria-hidden="true" /></div>
          <b>{loading || !canSeeRefunds ? '—' : <AnimatedCurrency value={refundsCents} reduceMotion={reduceMotion} />}</b>
          <small>{loading ? 'Cargando…' : canSeeRefunds ? `${refundCount} ${refundCount === 1 ? 'liquidación' : 'liquidaciones'} · fecha de liquidación` : 'No disponible con este perfil'}</small>
        </article>
        <article className="weekly-finance-metric weekly-finance-metric--count">
          <div className="weekly-finance-metric-label"><span>Número de ventas</span><CreditCard size={17} aria-hidden="true" /></div>
          <b>{loading ? '—' : <AnimatedCount value={saleCount} reduceMotion={reduceMotion} />}</b>
          <small>Semana de la venta · asesoría responsable</small>
        </article>
      </motion.div>

      <div className="weekly-finance-panels">
        <section className="panel weekly-finance-panel" aria-labelledby="weekly-finance-advisors-title">
          <div className="weekly-finance-panel-heading"><div><span className="weekly-finance-kicker">VENTAS Y COBROS</span><h2 id="weekly-finance-advisors-title">Resumen por asesora</h2></div><Wallet size={19} aria-hidden="true" /></div>
          <div className="weekly-finance-sort" aria-label="Ordenar asesoras">
            <span>Ordenar por</span>
            <button type="button" aria-pressed={sortBy === 'sales'} onClick={() => setSortBy('sales')}>Ventas</button>
            <button type="button" aria-pressed={sortBy === 'collections'} onClick={() => setSortBy('collections')}>Cobros</button>
          </div>
          <div className="weekly-finance-table-wrap weekly-finance-advisor-table-wrap">
            <table className="weekly-finance-table">
              <thead><tr><th>Asesora</th><th>Ventas</th><th>N.º</th><th>Cobrado{selectedMethod !== 'all' ? ` · ${PAYMENT_LABELS[selectedMethod]}` : ''}</th></tr></thead>
              <tbody>
                {advisorRows.map((row) => <tr key={row.id}>
                  <th scope="row">{row.name}</th><td>{fromCents(row.salesCents)}</td><td>{row.salesCount}</td>
                  <td><button type="button" className="weekly-finance-amount-link" onClick={() => openDetails({ advisorId: row.id })} disabled={!row.collectionsCents}>{fromCents(row.collectionsCents)}</button></td>
                </tr>)}
                {!loading && !advisorRows.length && <tr><td colSpan={4} className="weekly-finance-empty">No hay asesoras o movimientos para estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="weekly-finance-advisor-cards">
            {advisorRows.map((row) => <article key={row.id} className="weekly-finance-advisor-card">
              <div className="weekly-finance-advisor-card-heading"><b>{row.name}</b><small>{row.salesCount} {row.salesCount === 1 ? 'venta' : 'ventas'}</small></div>
              <div className="weekly-finance-advisor-card-values"><span>Vendido <b>{fromCents(row.salesCents)}</b></span><span>Cobrado <button type="button" className="weekly-finance-amount-link" onClick={() => openDetails({ advisorId: row.id })} disabled={!row.collectionsCents}>{fromCents(row.collectionsCents)}</button></span></div>
            </article>)}
            {!loading && !advisorRows.length && <p className="weekly-finance-empty">No hay asesoras o movimientos para estos filtros.</p>}
          </div>
          <p className="weekly-finance-footnote">Las ventas se atribuyen a la semana de registro. Los cobros aparecen según la fecha en que se registró cada pago, incluso si pertenecen a una venta anterior.</p>
        </section>

        <section className="panel weekly-finance-panel weekly-finance-chart-panel" aria-labelledby="weekly-finance-method-title">
          <div className="weekly-finance-panel-heading"><div><span className="weekly-finance-kicker">ENTRADAS REGISTRADAS</span><h2 id="weekly-finance-method-title">Cobros por medio de pago</h2></div></div>
          <div className="weekly-finance-method-legend" aria-label="Filtrar por medio de pago">
            {PAYMENT_METHODS.map((method) => {
              const total = chartRows.reduce((sum, row) => sum + row[method.id], 0);
              return <button key={method.id} type="button" className={selectedMethod === method.id ? 'is-selected' : ''} aria-pressed={selectedMethod === method.id} onClick={() => selectMethod(method.id)}>
                <i style={{ backgroundColor: method.color }} aria-hidden="true" /><span>{method.label}</span><b>{money(total)}</b>
              </button>;
            })}
          </div>
          {chartRows.length ? <>
            <div className="weekly-finance-chart-mobile" aria-label="Comparación de cobros por asesora y medio de pago">
              {chartRows.map((row) => {
                const total = PAYMENT_METHODS.reduce((sum, method) => sum + row[method.id], 0);
                return <div className="weekly-finance-chart-mobile-row" key={row.advisorId}>
                  <div className="weekly-finance-chart-mobile-heading"><span>{row.advisorName}</span><b>{money(total)}</b></div>
                  <div className="weekly-finance-chart-mobile-track" role="img" aria-label={`${row.advisorName}: ${PAYMENT_METHODS.map((method) => `${method.label} ${money(row[method.id])}`).join(', ')}`}>
                    {total > 0 ? PAYMENT_METHODS.map((method) => row[method.id] > 0 && <i key={method.id} title={`${method.label}: ${money(row[method.id])}`} style={{ width: `${(row[method.id] / total) * 100}%`, backgroundColor: method.color }} />) : <i className="is-empty" />}
                  </div>
                </div>;
              })}
            </div>
            <div className="weekly-finance-chart" aria-label="Barras apiladas con cobros por asesora y medio de pago">
            <ResponsiveContainer width="100%" height={Math.max(180, chartRows.length * 38 + 48)}>
              <BarChart data={chartRows} layout="vertical" accessibilityLayer margin={{ top: 8, right: 14, bottom: 0, left: 0 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={(value) => money(Number(value))} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="advisorName" width={108} tick={{ fontSize: 10, fill: 'var(--ink)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: any, name: any) => [money(Number(value)), PAYMENT_LABELS[name as PaymentMethodId] || 'Otros']} contentStyle={{ background: 'var(--paper)', borderColor: 'var(--line)', borderRadius: 10, color: 'var(--ink)', boxShadow: '0 12px 32px rgb(0 0 0 / .14)' }} labelStyle={{ color: 'var(--ink)', fontWeight: 750 }} itemStyle={{ color: 'var(--ink)' }} />
                {PAYMENT_METHODS.map((method) => <Bar key={method.id} dataKey={method.id} name={method.label} stackId="payments" fill={method.color} maxBarSize={24} isAnimationActive={!reduceMotion} onClick={() => selectMethod(method.id)} cursor="pointer" />)}
              </BarChart>
            </ResponsiveContainer>
            </div>
          </> : <p className="weekly-finance-empty">No hay asesoras registradas para graficar.</p>}
          <p className="weekly-finance-footnote">Selecciona un medio para filtrar los importes cobrados y su detalle. El gráfico conserva la comparación completa.</p>
        </section>
      </div>

      <section className="panel weekly-finance-panel weekly-finance-daily-panel" aria-labelledby="weekly-finance-days-title">
        <div className="weekly-finance-panel-heading"><div><span className="weekly-finance-kicker">ENTRADAS POR FECHA DEL PAGO</span><h2 id="weekly-finance-days-title">Ingresos por día y asesora</h2></div><span className="weekly-finance-day-total">Semana: <b>{loading ? '—' : fromCents(collectedCents)}</b></span></div>
        <p className="weekly-finance-footnote">Pulsa un importe para abrir los cobros que lo componen. Los días futuros de la semana actual se muestran con un guion.</p>
        <div className="weekly-finance-desktop-matrix">
          <div className="weekly-finance-matrix-scroll">
            <table className="weekly-finance-matrix">
              <thead><tr><th scope="col">Asesora</th>{weekDays.map((date) => <th key={date} scope="col" className={date === today ? 'is-today' : ''}><span>{weekdayLabel(date, { weekday: 'short' })}</span><small>{dateLabel(date, { day: 'numeric' })}</small></th>)}<th scope="col">Total</th></tr></thead>
              <tbody>
                {advisorRows.map((row) => <tr key={row.id}>
                  <th scope="row">{row.name}</th>
                  {weekDays.map((date) => {
                    const isFuture = isCurrentWeek && date > today;
                    const amount = row.days[date] || 0;
                    return <td key={date} className={date === today ? 'is-today' : ''}>{isFuture ? <span className="weekly-finance-future">—</span> : <button type="button" className="weekly-finance-amount-link" onClick={() => openDetails({ date, advisorId: row.id })} disabled={amount === 0}>{amount ? fromCents(amount) : '—'}</button>}</td>;
                  })}
                  <td><button type="button" className="weekly-finance-amount-link is-total" onClick={() => openDetails({ advisorId: row.id })} disabled={!row.collectionsCents}>{fromCents(row.collectionsCents)}</button></td>
                </tr>)}
                {!loading && !advisorRows.length && <tr><td colSpan={9} className="weekly-finance-empty">No hay ingresos registrados para estos filtros.</td></tr>}
              </tbody>
              <tfoot><tr><th scope="row">Total por día</th>{dailyTotals.map((day) => {
                const isFuture = isCurrentWeek && day.date > today;
                return <td key={day.date} className={day.date === today ? 'is-today' : ''}>{isFuture ? <span className="weekly-finance-future">—</span> : <button type="button" className="weekly-finance-amount-link is-total" onClick={() => openDetails({ date: day.date })} disabled={!day.cents}>{fromCents(day.cents)}</button>}</td>;
              })}<td><button type="button" className="weekly-finance-amount-link is-total" onClick={() => openDetails()} disabled={!collectedCents}>{fromCents(collectedCents)}</button></td></tr></tfoot>
            </table>
          </div>
        </div>

        <div className="weekly-finance-mobile-days">
          <div className="weekly-finance-day-picker" role="group" aria-label="Elegir día">
            {weekDays.map((date) => {
              const day = dailyTotals.find((item) => item.date === date)!;
              const isFuture = isCurrentWeek && date > today;
              return <button type="button" key={date} aria-pressed={mobileDate === date} onClick={() => setMobileDate(date)} className={`${mobileDate === date ? 'is-selected' : ''}${date === today ? ' is-today' : ''}`}>
                <span>{weekdayLabel(date, { weekday: 'short' })}</span><small>{dateLabel(date, { day: 'numeric', month: 'short' })}</small><b>{isFuture ? '—' : fromCents(day.cents)}</b>
              </button>;
            })}
          </div>
          <div className="weekly-finance-mobile-advisors">
            <div className="weekly-finance-mobile-advisors-heading"><strong>{weekdayLabel(mobileDate)} {dateLabel(mobileDate)}</strong><b>{isCurrentWeek && mobileDate > today ? '—' : fromCents(selectedDayTotal)}</b></div>
            {isCurrentWeek && mobileDate > today ? <p className="weekly-finance-empty">Este día todavía no llega.</p> : advisorRows.map((row) => {
              const amount = row.days[mobileDate] || 0;
              return <div key={row.id}><span>{row.name}</span><button type="button" className="weekly-finance-amount-link" onClick={() => openDetails({ date: mobileDate, advisorId: row.id })} disabled={!amount}>{amount ? fromCents(amount) : '—'}</button></div>;
            })}
          </div>
        </div>
      </section>

      <dialog ref={detailsDialog} className="weekly-finance-dialog" aria-labelledby="weekly-finance-dialog-title" onCancel={(event) => { event.preventDefault(); setDetailFilter(null); }} onClose={() => setDetailFilter(null)} onClick={(event) => { if (event.target === event.currentTarget) setDetailFilter(null); }}>
        <div className="weekly-finance-dialog-heading"><div><span className="weekly-finance-kicker">MOVIMIENTOS REGISTRADOS</span><h2 id="weekly-finance-dialog-title">{detailTitle}</h2><p>{detailPayments.length} {detailPayments.length === 1 ? 'cobro' : 'cobros'} · {fromCents(detailTotal)}</p></div><button type="button" className="weekly-finance-dialog-close" onClick={() => setDetailFilter(null)} aria-label="Cerrar detalle">×</button></div>
        {selectedMethod !== 'all' && <p className="weekly-finance-dialog-filter">Medio: {PAYMENT_LABELS[selectedMethod]}</p>}
        <div className="weekly-finance-table-wrap weekly-finance-detail-wrap"><table className="weekly-finance-table weekly-finance-detail-table">
          <thead><tr><th>Fecha</th><th>Venta</th><th>Asesora</th><th>Sucursal</th><th>Medio</th><th>Referencia</th><th>Monto</th></tr></thead>
          <tbody>{detailPayments.map((payment) => <tr key={payment.id}>
            <td>{dateTimeLabel(payment.created_at)}</td><td>{payment.sale.sale_code || payment.sale_id.slice(0, 8)}</td><td>{payment.advisorId === 'unassigned' ? 'Sin asesora asignada' : advisorNames.get(payment.advisorId) || advisorFallback(payment.advisorId)}</td><td>{branchNames.get(payment.sale.branch_id) || 'Sucursal'}</td><td>{PAYMENT_LABELS[payment.method]}</td><td>{payment.reference || '—'}</td><td>{fromCents(payment.amountCents)}</td>
          </tr>)}{!detailPayments.length && <tr><td colSpan={7} className="weekly-finance-empty">No hay cobros para este importe.</td></tr>}</tbody>
          <tfoot><tr><th colSpan={6}>Total del detalle</th><td>{fromCents(detailTotal)}</td></tr></tfoot>
        </table></div>
      </dialog>
    </section>
  );
}
