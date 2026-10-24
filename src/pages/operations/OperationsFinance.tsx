import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChartNoAxesCombined, Download, LoaderCircle, PackageCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import './operations-lifecycle.css';

const BUSINESS_TIME_ZONE = 'America/Guayaquil';
const PAGE_SIZE = 500;
const FINANCE_ROLES = ['advisor', 'owner', 'admin', 'manager'];
const money = (value) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);

function monthInBusinessTimeZone(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return year && month ? `${year}-${month}` : '';
}

const currentMonth = () => monthInBusinessTimeZone(new Date());
const timestamp = (value) => value
  ? new Date(value).toLocaleString('es-EC', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'short', timeStyle: 'short' })
  : '—';

async function readAllRows(createQuery) {
  const allRows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await createQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    allRows.push(...page);
    if (page.length < PAGE_SIZE) return allRows;
    offset += PAGE_SIZE;
  }
}

export function OperationsFinance() {
  const { organizationId, hasPermission } = useAuth();
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [advisors, setAdvisors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [month, setMonth] = useState(currentMonth);
  const [advisor, setAdvisor] = useState('all');
  const [branch, setBranch] = useState('all');
  const [method, setMethod] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
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

      setLoading(true);
      setError('');
      try {
        const [salesRows, paymentRows, teamResult, branchResult] = await Promise.all([
          readAllRows(() => supabase
            .from('sales')
            .select('id,sale_code,status,total,created_at,branch_id,advisor_id,created_by,customers(full_name)')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })),
          readAllRows(() => supabase
            .from('sale_payments')
            .select('id,sale_id,amount,method,created_by,created_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })),
          hasPermission('team', 'view')
            ? supabase.rpc('list_visualcorp_team_members')
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('branches')
            .select('id,code,name')
            .eq('organization_id', organizationId)
            .eq('active', true)
            .order('name'),
        ]);

        if (branchResult.error) throw branchResult.error;
        if (active) {
          setSales(salesRows);
          setPayments(paymentRows);
          setAdvisors(teamResult.error ? [] : teamResult.data || []);
          setBranches(branchResult.data || []);
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || 'No se pudieron cargar las ventas y los pagos.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [organizationId, hasPermission]);

  const advisorNames = useMemo(() => new Map(advisors.map((person) => [
    person.user_id,
    person.full_name || person.email || `Usuario ${String(person.user_id).slice(0, 8)}`,
  ])), [advisors]);
  const salesById = useMemo(() => new Map(sales.map((sale) => [sale.id, sale])), [sales]);
  const paymentsBySale = useMemo(() => payments.reduce((totals, payment) => {
    totals.set(payment.sale_id, (totals.get(payment.sale_id) || 0) + Number(payment.amount || 0));
    return totals;
  }, new Map()), [payments]);
  const branchNames = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches]);

  const salesInPeriod = useMemo(() => sales.filter((sale) => (
    sale.status === 'confirmed'
    && (!month || monthInBusinessTimeZone(sale.created_at) === month)
    && (advisor === 'all' || sale.advisor_id === advisor)
    && (branch === 'all' || sale.branch_id === branch)
  )), [sales, month, advisor, branch]);
  const selectedIds = useMemo(() => new Set(salesInPeriod.map((sale) => sale.id)), [salesInPeriod]);
  const salesMatchingTeamAndBranch = useMemo(() => sales.filter((sale) => (
    sale.status === 'confirmed'
    && (advisor === 'all' || sale.advisor_id === advisor)
    && (branch === 'all' || sale.branch_id === branch)
  )), [sales, advisor, branch]);
  const paymentSaleIds = useMemo(() => new Set(salesMatchingTeamAndBranch.map((sale) => sale.id)), [salesMatchingTeamAndBranch]);
  const paymentsInPeriod = useMemo(() => payments.filter((payment) => (
    paymentSaleIds.has(payment.sale_id)
    && (!month || monthInBusinessTimeZone(payment.created_at) === month)
    && (method === 'all' || payment.method === method)
  )), [payments, paymentSaleIds, month, method]);

  const totalSold = salesInPeriod.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalCollected = paymentsInPeriod.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const outstanding = salesInPeriod.reduce((sum, sale) => (
    sum + Math.max(0, Number(sale.total || 0) - (paymentsBySale.get(sale.id) || 0))
  ), 0);
  const allHistoricalPayments = salesInPeriod.reduce((sum, sale) => sum + (paymentsBySale.get(sale.id) || 0), 0);

  const grouped = new Map();
  salesInPeriod.forEach((sale) => {
    const id = sale.advisor_id || 'unassigned';
    const item = grouped.get(id) || { id, sold: 0, collected: 0, count: 0 };
    item.sold += Number(sale.total || 0);
    item.count += 1;
    grouped.set(id, item);
  });
  paymentsInPeriod.forEach((payment) => {
    const sale = salesById.get(payment.sale_id);
    const id = sale?.advisor_id || 'unassigned';
    const item = grouped.get(id) || { id, sold: 0, collected: 0, count: 0 };
    item.collected += Number(payment.amount || 0);
    grouped.set(id, item);
  });
  const advisorSummary = [...grouped.values()].sort((a, b) => b.sold - a.sold);
  const maxSold = Math.max(1, ...advisorSummary.map((item) => item.sold));
  const paymentMethods = [...new Set(payments.map((payment) => payment.method).filter(Boolean))].sort();
  const branchName = (id) => branchNames.get(id) || 'Sucursal';
  const personName = (id) => advisorNames.get(id) || `Usuario ${String(id || '').slice(0, 8) || 'sin asignar'}`;

  const downloadCsv = () => {
    const rows = [
      ['Fecha', 'Asesora', 'Venta', 'Cliente', 'Sucursal', 'Medio', 'Registró el pago', 'Monto'],
      ...paymentsInPeriod.map((payment) => {
        const sale = salesById.get(payment.sale_id);
        return [
          payment.created_at,
          personName(sale?.advisor_id),
          sale?.sale_code || payment.sale_id,
          sale?.customers?.full_name || '',
          branchName(sale?.branch_id),
          payment.method || '',
          personName(payment.created_by),
          Number(payment.amount || 0).toFixed(2),
        ];
      }),
    ];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finanzas-${month || 'historico'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading) return <div className="op-flow-loading"><LoaderCircle className="spin" /> Cargando ventas y pagos registrados…</div>;

  return <div className="op-finance-page">
    <section className="panel op-finance-intro">
      <div>
        <span className="eyebrow">INGRESOS Y RECAUDACIÓN</span>
        <h2>Finanzas por asesora</h2>
        <p>Ventas confirmadas y pagos recibidos desde el punto de venta. Cada abono conserva su fecha, medio de pago y venta asociada.</p>
      </div>
      <a className="button button-outline" href="/operaciones/pos">Registrar venta o abono en POS <ArrowUpRight size={15} /></a>
    </section>
    {error && <div className="op-flow-alert error" role="alert"><ShieldAlert size={16} />{error}</div>}
    <section className="panel op-finance-filters">
      <label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      <label>Asesora<select value={advisor} onChange={(event) => setAdvisor(event.target.value)}>
        <option value="all">Todas las asesoras</option>
        {advisors.filter((person) => person.active && FINANCE_ROLES.includes(person.role)).map((person) => (
          <option key={person.user_id} value={person.user_id}>{person.full_name || person.email || person.user_id.slice(0, 8)}</option>
        ))}
      </select></label>
      <label>Sucursal<select value={branch} onChange={(event) => setBranch(event.target.value)}>
        <option value="all">Todas las sucursales</option>
        {branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Medio de pago<select value={method} onChange={(event) => setMethod(event.target.value)}>
        <option value="all">Todos los medios</option>
        {paymentMethods.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
    </section>
    <section className="op-finance-kpis">
      <article><span>Ventas confirmadas</span><b>{money(totalSold)}</b><small>{salesInPeriod.length} ventas registradas</small></article>
      <article className="is-collected"><span>Pagos recibidos en el periodo</span><b>{money(totalCollected)}</b><small>Abonos asociados a las ventas filtradas</small></article>
      <article><span>Saldo por cobrar</span><b>{money(outstanding)}</b><small>Saldo vigente de las ventas filtradas</small></article>
      <article><span>Valor promedio por venta</span><b>{money(salesInPeriod.length ? totalSold / salesInPeriod.length : 0)}</b><small>Solo ventas confirmadas</small></article>
    </section>
    <div className="op-finance-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">COMPARATIVO DEL PERIODO</span><h2>Desempeño por asesora</h2></div><ChartNoAxesCombined size={19} /></div>
        <div className="op-finance-advisors">{advisorSummary.map((item) => (
          <article key={item.id}>
            <div className="op-finance-advisor-line"><b>{personName(item.id)}</b><span>{money(item.sold)} · {item.count} ventas</span></div>
            <div className="op-finance-bar"><i style={{ width: `${Math.max(2, item.sold / maxSold * 100)}%` }} /></div>
            <small>Recaudado en el periodo: {money(item.collected)}</small>
          </article>
        ))}{!advisorSummary.length && <p className="muted">No hay ventas confirmadas para estos filtros.</p>}</div>
        <p className="op-finance-note">La atribución usa la asesora responsable guardada en la venta; quien registra un pago aparece por separado.</p>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">COMPOSICIÓN DE RECAUDACIÓN</span><h2>Por medio de pago</h2></div></div>
        <div className="op-finance-methods">{Object.entries(paymentsInPeriod.reduce<Record<string, number>>((totals, payment) => {
          const name = payment.method || 'Sin medio';
          totals[name] = (totals[name] || 0) + Number(payment.amount || 0);
          return totals;
        }, {})).sort((a, b) => b[1] - a[1]).map(([name, amount]) => (
          <div key={name}><span>{name}</span><b>{money(amount)}</b></div>
        ))}{!paymentsInPeriod.length && <p className="muted">Sin pagos en el periodo seleccionado.</p>}</div>
        <p className="op-finance-note">Ventas {money(totalSold)} · Pagos históricos asociados {money(allHistoricalPayments)} · Recaudo del periodo {money(totalCollected)}.</p>
      </section>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">MOVIMIENTOS REGISTRADOS</span><h2>Abonos recibidos</h2></div><button className="button button-outline" onClick={downloadCsv} disabled={!paymentsInPeriod.length}><Download size={15} /> Exportar CSV</button></div>
      <div className="op-finance-table-wrap"><table className="op-finance-table">
        <thead><tr><th>Fecha</th><th>Asesora</th><th>Venta</th><th>Sucursal</th><th>Medio</th><th>Registró el pago</th><th>Monto</th></tr></thead>
        <tbody>{[...paymentsInPeriod].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((payment) => {
          const sale = salesById.get(payment.sale_id);
          return <tr key={payment.id}>
            <td>{timestamp(payment.created_at)}</td><td>{personName(sale?.advisor_id)}</td>
            <td>{sale?.sale_code || payment.sale_id.slice(0, 8)} · {sale?.customers?.full_name || 'Cliente sin nombre'}</td>
            <td>{branchName(sale?.branch_id)}</td><td>{payment.method || '—'}</td>
            <td>{personName(payment.created_by)}</td><td>{money(payment.amount)}</td>
          </tr>;
        })}{!paymentsInPeriod.length && <tr><td colSpan={7}>No hay abonos para mostrar con los filtros elegidos.</td></tr>}</tbody>
      </table></div>
    </section>
    <aside className="op-flow-footnote"><PackageCheck size={16} /><span>Este panel muestra ventas y pagos capturados en POS; no contabiliza gastos, comisiones, impuestos, nómina ni utilidad. Los pagos externos deben registrarse en su fuente correspondiente para que aparezcan aquí.</span></aside>
  </div>;
}
