import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, ChevronLeft, RotateCcw, RefreshCw, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import {
  addDays,
  businessDate,
  businessDayBoundary,
  cents,
  dateLabel,
  FINANCE_TIME_ZONE,
  mondayOf,
  normalizePaymentMethod,
  PAYMENT_METHODS,
  saleReturnedCents,
  weekdayLabel,
  type PaymentMethodId,
} from './weeklyFinanceSummaryModel';
import './finance-weekly-summary.css';

const PAGE_SIZE = 500;
const PAYMENT_LABELS = Object.fromEntries(PAYMENT_METHODS.map((method) => [method.id, method.label])) as Record<PaymentMethodId, string>;
const money = (value: number) => new Intl.NumberFormat('es-EC', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value || 0);
const fromCents = (value: number) => money(value / 100);

async function readAllRows(createQuery: () => any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await createQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

type SaleRow = {
  id: string;
  sale_code: string | null;
  status: string;
  total: number | string;
  subtotal?: number | string;
  discount_total?: number | string;
  created_at: string;
  branch_id: string | null;
  advisor_id: string | null;
};

type PaymentRow = {
  id: string;
  sale_id: string;
  amount: number | string;
  method: string | null;
  reference?: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  return_code: string;
  sale_id: string;
  branch_id: string;
  amount: number | string;
  method: string | null;
  reference?: string | null;
  settled_at: string;
};

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
  const [reloadCount, setReloadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rosterError, setRosterError] = useState('');
  const [detailFilter, setDetailFilter] = useState<DetailFilter | null>(null);
  const detailsDialog = useRef<HTMLDialogElement>(null);
  const refreshTimer = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<{
    sales: SaleRow[];
    payments: PaymentRow[];
    refunds: RefundRow[];
    saleContext: SaleRow[];
    returns: any[];
    branches: any[];
    team: any[];
  }>({ sales: [], payments: [], refunds: [], saleContext: [], returns: [], branches: [], team: [] });

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

  useEffect(() => {
    if (!supabase || !organizationId) return undefined;
    const channel = supabase.channel(`finance-weekly-${organizationId}`);
    const scheduleRefresh = () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => setReloadCount((value) => value + 1), 350);
    };
    ['sales', 'sale_payments', 'sale_returns', 'sale_refund_settlements'].forEach((table) => {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}`,
      }, scheduleRefresh);
    });
    channel.subscribe();
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setRosterError('');
      if (!supabase) {
        setError('La conexión con la base de datos no está disponible.');
        setLoading(false);
        return;
      }
      if (!organizationId) {
        setError('Esta cuenta no tiene una organización asignada.');
        setLoading(false);
        return;
      }

      const startAt = businessDayBoundary(weekStart);
      const endAt = businessDayBoundary(addDays(weekStart, 7));
      try {
        const salesQuery = () => {
          let query = supabase!
            .from('sales')
            .select('id,sale_code,status,total,subtotal,discount_total,created_at,branch_id,advisor_id')
            .eq('organization_id', organizationId)
            .eq('status', 'confirmed')
            .gte('created_at', startAt)
            .lt('created_at', endAt)
            .order('created_at', { ascending: true })
            .order('id');
          if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter);
          return query;
        };
        const paymentsQuery = () => supabase!
          .from('sale_payments')
          .select('id,sale_id,amount,method,reference,created_at')
          .eq('organization_id', organizationId)
          .gte('created_at', startAt)
          .lt('created_at', endAt)
          .order('created_at', { ascending: true })
          .order('id');
        const refundsQuery = () => {
          let query = supabase!
            .from('sale_refund_settlements')
            .select('id,return_code,sale_id,branch_id,amount,method,reference,settled_at')
            .eq('organization_id', organizationId)
            .gte('settled_at', startAt)
            .lt('settled_at', endAt)
            .order('settled_at', { ascending: true })
            .order('id');
          if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter);
          return query;
        };

        const [sales, payments, refunds, branchesResult, teamResult] = await Promise.all([
          readAllRows(salesQuery),
          readAllRows(paymentsQuery),
          canSeeRefunds ? readAllRows(refundsQuery) : Promise.resolve([]),
          supabase.from('branches').select('id,code,name').eq('organization_id', organizationId).eq('active', true).order('name'),
          canSeeTeam ? supabase.rpc('list_visualcorp_team_members') : Promise.resolve({ data: [], error: null }),
        ]);
        if (branchesResult.error) throw branchesResult.error;

        const knownSales = new Map<string, SaleRow>(sales.map((sale: SaleRow) => [sale.id, sale]));
        const extraIds = [...new Set<string>([
          ...payments.map((payment: PaymentRow) => payment.sale_id),
          ...refunds.map((refund: RefundRow) => refund.sale_id),
        ])].filter((id) => !knownSales.has(id));
        const saleBatches: string[][] = [];
        for (let index = 0; index < extraIds.length; index += 250) saleBatches.push(extraIds.slice(index, index + 250));
        const extraSaleRows = await Promise.all(saleBatches.map((ids) => readAllRows(() => {
          let query = supabase!
            .from('sales')
            .select('id,sale_code,status,total,subtotal,discount_total,created_at,branch_id,advisor_id')
            .eq('organization_id', organizationId)
            .in('id', ids)
            .order('id');
          if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter);
          return query;
        })));
        extraSaleRows.flat().forEach((sale: SaleRow) => knownSales.set(sale.id, sale));

        const returnBatches: string[][] = [];
        const weeklySaleIds = sales.map((sale: SaleRow) => sale.id);
        for (let index = 0; index < weeklySaleIds.length; index += 250) returnBatches.push(weeklySaleIds.slice(index, index + 250));
        const returnRows = await Promise.all(returnBatches.map((ids) => readAllRows(() => supabase!
          .from('sale_returns')
          .select('id,sale_id,kind,sale_return_lines(quantity,sale_lines(unit_price))')
          .eq('organization_id', organizationId)
          .in('sale_id', ids)
          .order('created_at')
          .order('id'))));

        if (!active) return;
        setSnapshot({
          sales: sales as SaleRow[],
          payments: payments as PaymentRow[],
          refunds: refunds as RefundRow[],
          saleContext: [...knownSales.values()],
          returns: returnRows.flat(),
          branches: branchesResult.data || [],
          team: teamResult.data || [],
        });
        if (teamResult.error) {
          setRosterError('No se pudo cargar el directorio completo de asesoras. Se muestran las personas con movimientos en esta semana.');
        }
      } catch (loadError: any) {
        if (active) {
          setSnapshot({ sales: [], payments: [], refunds: [], saleContext: [], returns: [], branches: [], team: [] });
          setError(loadError?.message || 'No se pudieron cargar las ventas y los cobros de esta semana.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [organizationId, weekStart, branchFilter, reloadCount, canSeeRefunds, canSeeTeam]);

  const branchNames = useMemo(() => new Map(snapshot.branches.map((branch) => [branch.id, branch.name])), [snapshot.branches]);
  const saleContextById = useMemo(() => new Map(snapshot.saleContext.map((sale) => [sale.id, sale])), [snapshot.saleContext]);
  const returnsBySale = useMemo(() => {
    const grouped = new Map<string, any[]>();
    snapshot.returns.forEach((saleReturn) => {
      const current = grouped.get(saleReturn.sale_id) || [];
      current.push(saleReturn);
      grouped.set(saleReturn.sale_id, current);
    });
    return grouped;
  }, [snapshot.returns]);

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
  const payments = useMemo(() => snapshot.payments.flatMap((payment) => {
    const sale = saleContextById.get(payment.sale_id);
    if (!sale || (branchFilter !== 'all' && sale.branch_id !== branchFilter)) return [];
    const advisorId = sale.advisor_id || 'unassigned';
    if (advisorFilter !== 'all' && advisorFilter !== advisorId) return [];
    const method = normalizePaymentMethod(payment.method);
    if (selectedMethod !== 'all' && selectedMethod !== method) return [];
    return [{ ...payment, sale, advisorId, method, amountCents: cents(payment.amount), date: businessDate(payment.created_at) }];
  }), [snapshot.payments, saleContextById, branchFilter, advisorFilter, selectedMethod]);
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
      const returnedCents = saleReturnedCents(sale, returnsBySale.get(sale.id) || []);
      row.salesCents += Math.max(0, cents(sale.total) - returnedCents);
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
  }, [directory, advisorFilter, sales, payments, returnsBySale, advisorNames, sortBy]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const chartRows = useMemo(() => advisorRows.map((row) => ({
    advisorId: row.id,
    advisorName: row.name,
    cash: row.methods.cash / 100,
    transfer: row.methods.transfer / 100,
    card: row.methods.card / 100,
    cheque: row.methods.cheque / 100,
    other: row.methods.other / 100,
  })), [advisorRows]);
  const collectedCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const salesCents = advisorRows.reduce((sum, row) => sum + row.salesCents, 0);
  const saleCount = advisorRows.reduce((sum, row) => sum + row.salesCount, 0);
  const refundsCents = refunds.reduce((sum, refund) => sum + refund.amountCents, 0);
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
          <button type="button" className="button button-outline" onClick={() => setWeekStart((date) => addDays(date, -7))} aria-label="Ver semana anterior"><ChevronLeft size={16} /> Semana anterior</button>
          {!isCurrentWeek && <button type="button" className="button button-outline" onClick={() => setWeekStart(currentWeekStart)}><RotateCcw size={15} /> Semana actual</button>}
          <button type="button" className="button button-outline weekly-finance-refresh" onClick={() => setReloadCount((value) => value + 1)} disabled={loading} aria-label="Actualizar resumen"><RefreshCw size={15} /> Actualizar</button>
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

      {error && <div className="weekly-finance-error" role="alert"><b>No se pudo cargar el resumen semanal</b><span>{error}</span><button type="button" className="button button-outline" onClick={() => setReloadCount((value) => value + 1)}>Reintentar</button></div>}
      {rosterError && !error && <p className="weekly-finance-note" role="status">{rosterError}</p>}
      {!canSeeTeam && !error && <p className="weekly-finance-note">Tu perfil no muestra asesoras sin movimientos; el resumen incluye a quienes registraron ventas o cobros esta semana.</p>}
      {!canSeeRefunds && !error && <p className="weekly-finance-note">El total de reembolsos requiere el permiso de consulta de ventas; los demás bloques siguen disponibles.</p>}

      <div className="weekly-finance-metrics">
        <article className="weekly-finance-metric weekly-finance-metric--sales">
          <span>Ventas confirmadas</span><b>{loading ? '—' : fromCents(salesCents)}</b>
          <small>{loading ? 'Cargando…' : 'Importe neto de artículos devueltos'}</small>
        </article>
        <article className="weekly-finance-metric">
          <span>Total cobrado{selectedMethod !== 'all' ? ` · ${PAYMENT_LABELS[selectedMethod]}` : ''}</span><b>{loading ? '—' : fromCents(collectedCents)}</b>
          <small>{loading ? 'Cargando…' : `${payments.length} ${payments.length === 1 ? 'movimiento' : 'movimientos'} · fecha del pago`}</small>
        </article>
        <article className="weekly-finance-metric">
          <span>Reembolsos realizados</span><b>{loading || !canSeeRefunds ? '—' : fromCents(refundsCents)}</b>
          <small>{loading ? 'Cargando…' : canSeeRefunds ? `${refunds.length} ${refunds.length === 1 ? 'liquidación' : 'liquidaciones'} · fecha de liquidación` : 'No disponible con este perfil'}</small>
        </article>
        <article className="weekly-finance-metric weekly-finance-metric--count">
          <span>Número de ventas</span><b>{loading ? '—' : String(saleCount)}</b>
          <small>Semana de la venta · asesoría responsable</small>
        </article>
      </div>

      <div className="weekly-finance-panels">
        <section className="panel weekly-finance-panel" aria-labelledby="weekly-finance-advisors-title">
          <div className="weekly-finance-panel-heading"><div><span className="weekly-finance-kicker">VENTAS Y COBROS</span><h2 id="weekly-finance-advisors-title">Resumen por asesora</h2></div><Wallet size={19} aria-hidden="true" /></div>
          <div className="weekly-finance-sort" aria-label="Ordenar asesoras">
            <span>Ordenar por</span>
            <button type="button" aria-pressed={sortBy === 'sales'} onClick={() => setSortBy('sales')}>Ventas</button>
            <button type="button" aria-pressed={sortBy === 'collections'} onClick={() => setSortBy('collections')}>Cobros</button>
          </div>
          <div className="weekly-finance-table-wrap">
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
          {chartRows.length ? <div className="weekly-finance-chart" aria-label="Barras apiladas con cobros por asesora y medio de pago">
            <ResponsiveContainer width="100%" height={Math.max(180, chartRows.length * 38 + 48)}>
              <BarChart data={chartRows} layout="vertical" accessibilityLayer margin={{ top: 8, right: 14, bottom: 0, left: 0 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" tickFormatter={(value) => money(Number(value))} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="advisorName" width={108} tick={{ fontSize: 10, fill: 'var(--ink)' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: any, name: any) => [money(Number(value)), PAYMENT_LABELS[name as PaymentMethodId] || 'Otros']} />
                {PAYMENT_METHODS.map((method) => <Bar key={method.id} dataKey={method.id} name={method.label} stackId="payments" fill={method.color} maxBarSize={24} isAnimationActive={false} onClick={() => selectMethod(method.id)} cursor="pointer" />)}
              </BarChart>
            </ResponsiveContainer>
          </div> : <p className="weekly-finance-empty">No hay asesoras registradas para graficar.</p>}
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
