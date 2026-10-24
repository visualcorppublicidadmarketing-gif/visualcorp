import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChartNoAxesCombined, Download, LoaderCircle, PackageCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { OperationsFinanceControls } from './OperationsFinanceControls';
import './operations-lifecycle.css';

const BUSINESS_TIME_ZONE = 'America/Guayaquil';
const PAGE_SIZE = 500;
const FINANCE_ROLES = ['advisor', 'owner', 'admin', 'manager'];
type InventoryCostSummary = { inventory_lines: number; missing_inventory_cost_lines: number; non_inventory_lines: number; cost_total: number };
type MaterialCostSummary = { consumption_movements: number; costed_movements: number; missing_cost_movements: number; material_cost_total: number };
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
  const { organizationId, hasPermission, roles } = useAuth();
  const canSeeInventoryCosts = roles.some((role) => ['owner', 'admin', 'manager'].includes(role));
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
  const [inventoryCostSummary, setInventoryCostSummary] = useState<InventoryCostSummary | null>(null);
  const [inventoryCostLoading, setInventoryCostLoading] = useState(false);
  const [inventoryCostError, setInventoryCostError] = useState('');
  const [materialCostSummary, setMaterialCostSummary] = useState<MaterialCostSummary | null>(null);
  const [materialCostLoading, setMaterialCostLoading] = useState(false);
  const [materialCostError, setMaterialCostError] = useState('');

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

  useEffect(() => {
    let active = true;
    if (!canSeeInventoryCosts || !supabase || !organizationId || !month) {
      setInventoryCostSummary(null);
      setInventoryCostError('');
      return () => { active = false; };
    }
    setInventoryCostLoading(true);
    setInventoryCostError('');
    void supabase.rpc('get_finance_inventory_cost_summary', {
      p_month: `${month}-01`,
      p_branch_id: branch === 'all' ? null : branch,
      p_advisor_id: advisor === 'all' ? null : advisor,
    }).then(({ data, error: summaryError }) => {
      if (!active) return;
      if (summaryError) {
        setInventoryCostError(summaryError.message || 'No se pudo consultar el costo capturado de inventario.');
        setInventoryCostSummary(null);
      } else {
        setInventoryCostSummary(data);
      }
      setInventoryCostLoading(false);
    }, (cause) => {
      if (!active) return;
      setInventoryCostError(cause instanceof Error ? cause.message : 'No se pudo consultar el costo capturado de inventario.');
      setInventoryCostSummary(null);
      setInventoryCostLoading(false);
    });
    return () => { active = false; };
  }, [organizationId, canSeeInventoryCosts, month, branch, advisor]);

  useEffect(() => {
    let active = true;
    if (!canSeeInventoryCosts || !supabase || !organizationId || !month) {
      setMaterialCostSummary(null);
      setMaterialCostError('');
      setMaterialCostLoading(false);
      return () => { active = false; };
    }
    setMaterialCostLoading(true);
    setMaterialCostError('');
    void Promise.resolve(supabase.rpc('get_finance_material_cost_summary', {
      p_month: `${month}-01`,
      p_branch_id: branch === 'all' ? null : branch,
      p_advisor_id: advisor === 'all' ? null : advisor,
    })).then(({ data, error: summaryError }) => {
      if (!active) return;
      if (summaryError) {
        setMaterialCostError(summaryError.message || 'No se pudo consultar el costo capturado de materiales.');
        setMaterialCostSummary(null);
      } else {
        setMaterialCostSummary(data);
      }
    }).finally(() => { if (active) setMaterialCostLoading(false); });
    return () => { active = false; };
  }, [organizationId, canSeeInventoryCosts, month, branch, advisor]);

  useEffect(() => {
    let active = true;
    if (!canSeeInventoryCosts || !supabase || !organizationId || !month) {
      setMaterialCostSummary(null);
      setMaterialCostError('');
      setMaterialCostLoading(false);
      return () => { active = false; };
    }
    setMaterialCostLoading(true);
    setMaterialCostError('');
    void Promise.resolve(supabase.rpc('get_finance_material_cost_summary', {
      p_month: `${month}-01`,
      p_branch_id: branch === 'all' ? null : branch,
      p_advisor_id: advisor === 'all' ? null : advisor,
    })).then(({ data, error: summaryError }) => {
      if (!active) return;
      if (summaryError) {
        setMaterialCostError(summaryError.message || 'No se pudo consultar el costo capturado de materiales.');
        setMaterialCostSummary(null);
      } else {
        setMaterialCostSummary(data);
      }
    }).finally(() => { if (active) setMaterialCostLoading(false); });
    return () => { active = false; };
  }, [organizationId, canSeeInventoryCosts, month, branch, advisor]);

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
    <OperationsFinanceControls />
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
    {canSeeInventoryCosts && <section className="panel op-finance-cost-panel" aria-labelledby="op-finance-cost-title">
      <div className="panel-heading"><div><span className="eyebrow">INVENTARIO → POS → FINANZAS</span><h2 id="op-finance-cost-title">Costo de inventario capturado en ventas</h2></div></div>
      {inventoryCostError ? <p className="op-finance-cost-error" role="alert">{inventoryCostError}</p> : inventoryCostLoading ? <p className="muted">Calculando referencia de costos para este periodo…</p> : inventoryCostSummary ? <div className="op-finance-cost-metrics">
        <article><span>Costo de artículos entregados</span><b>{money(Number(inventoryCostSummary.cost_total || 0))}</b><small>Usa el costo vigente guardado al vender cada línea</small></article>
        <article><span>Cobertura de costo en líneas de inventario</span><b>{Number(inventoryCostSummary.inventory_lines || 0) + Number(inventoryCostSummary.missing_inventory_cost_lines || 0) > 0 ? `${Math.round(Number(inventoryCostSummary.inventory_lines || 0) / (Number(inventoryCostSummary.inventory_lines || 0) + Number(inventoryCostSummary.missing_inventory_cost_lines || 0)) * 100)}%` : '—'}</b><small>{inventoryCostSummary.inventory_lines || 0} con costo · {inventoryCostSummary.missing_inventory_cost_lines || 0} sin costo configurado</small></article>
      </div> : <p className="muted">Aún no hay datos de costo para este periodo.</p>}
      <p className="op-finance-cost-note">Es una referencia operativa basada en el costo de inventario vigente al registrar la venta. No calcula utilidad contable e identifica por separado líneas sin costo; los servicios y costos indirectos no están incluidos.</p>
    </section>}
    {canSeeInventoryCosts && <section className="panel op-finance-cost-panel" aria-labelledby="op-finance-material-title">
      <div className="panel-heading"><div><span className="eyebrow">INVENTARIO → POS Y PRODUCCIÓN → FINANZAS</span><h2 id="op-finance-material-title">Costo de materiales consumidos</h2></div></div>
      {materialCostError ? <p className="op-finance-cost-error" role="alert">{materialCostError}</p> : materialCostLoading ? <p className="muted">Calculando consumos de materiales para este periodo…</p> : materialCostSummary ? <div className="op-finance-cost-metrics">
        <article><span>Costo de materiales registrados</span><b>{money(Number(materialCostSummary.material_cost_total || 0))}</b><small>Basado en el costo guardado al descontar stock</small></article>
        <article><span>Cobertura de costo por movimiento</span><b>{Number(materialCostSummary.consumption_movements || 0) > 0 ? `${Math.round(Number(materialCostSummary.costed_movements || 0) / Number(materialCostSummary.consumption_movements || 1) * 100)}%` : '—'}</b><small>{materialCostSummary.costed_movements || 0} con costo · {materialCostSummary.missing_cost_movements || 0} sin costo al consumir</small></article>
      </div> : <p className="muted">Aún no hay consumos de materiales capturados para este periodo.</p>}
      <div className="op-finance-material-links"><a className="button button-outline" href="/operaciones/flujos">Ver producción</a><a className="button button-outline" href="/operaciones/inventario">Ver inventario</a></div>
      <p className="op-finance-cost-note">Incluye salidas registradas por recetas de venta y consumos de órdenes de producción. Se captura desde la activación del control; no estima costos históricos sin snapshot ni representa utilidad contable.</p>
    </section>}
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
    <aside className="op-flow-footnote"><PackageCheck size={16} /><span>Las ventas confirmadas y sus abonos provienen de POS. El centro financiero incorpora egresos operativos, obligaciones y previsiones; nómina permanece separada y no se procesa aquí.</span></aside>
  </div>;
}
