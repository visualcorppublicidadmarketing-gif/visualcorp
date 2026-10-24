import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Banknote, ChartNoAxesCombined, Download, LoaderCircle, PackageCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { OperationsFinanceControls } from './OperationsFinanceControls';
import './operations-lifecycle.css';

const BUSINESS_TIME_ZONE = 'America/Guayaquil';
const PAGE_SIZE = 500;
const FINANCE_ROLES = ['advisor', 'owner', 'admin', 'manager'];
type InventoryCostSummary = { inventory_lines: number; missing_inventory_cost_lines: number; non_inventory_lines: number; cost_total: number; restocked_return_units: number; restocked_return_cost: number };
type MaterialCostSummary = { consumption_movements: number; costed_movements: number; missing_cost_movements: number; material_cost_total: number };
type InventoryCatalogCostSummary = { active_variants: number; configured_variants: number; missing_variants: any[] };
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
const businessMonthRange = (value) => {
  if (!value) return null;
  const [year, month] = value.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 5)).toISOString(),
    end: new Date(Date.UTC(year, month, 1, 5)).toISOString(),
  };
};
const shiftBusinessMonth = (value, offset) => {
  if (!value) return '';
  const [year, month] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
};
const previousBusinessMonth = (value) => shiftBusinessMonth(value, -1);
const monthLabel = (value) => value
  ? new Date(`${value}-01T12:00:00`).toLocaleDateString('es-EC', { timeZone: BUSINESS_TIME_ZONE, month: 'long', year: 'numeric' })
  : '';
const timestamp = (value) => value
  ? new Date(value).toLocaleString('es-EC', { timeZone: BUSINESS_TIME_ZONE, dateStyle: 'short', timeStyle: 'short' })
  : '—';
const businessDate = (value) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
};
const daysSinceBusinessDate = (value, todayValue = businessDate(new Date())) => {
  const [year, month, day] = value.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayValue.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(todayYear, todayMonth - 1, todayDay) - Date.UTC(year, month - 1, day)) / 86_400_000));
};

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
  const canManageFinance = roles.some((role) => ['owner', 'admin', 'manager'].includes(role));
  const canSeePayrollDeductions = roles.some((role) => ['owner', 'admin'].includes(role));
  const canSeeInventoryCosts = roles.some((role) => ['owner', 'admin', 'manager'].includes(role));
  const canSeeCrm = hasPermission('crm', 'view');
  const canSeeCashReconciliation = hasPermission('cash', 'view');
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [realtimeRevision, setRealtimeRevision] = useState({ sales: 0, cash: 0, expenses: 0, expensePayments: 0, inventoryCosts: 0, materialCosts: 0, catalogCosts: 0 });
  const realtimePending = useRef(new Set<string>());
  const realtimeFlushTimer = useRef<number | null>(null);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [saleReturns, setSaleReturns] = useState([]);
  const [saleReturnsError, setSaleReturnsError] = useState('');
  const [cashSessions, setCashSessions] = useState([]);
  const [cashSessionMovements, setCashSessionMovements] = useState([]);
  const [cashSessionLoading, setCashSessionLoading] = useState(false);
  const [cashSessionError, setCashSessionError] = useState('');
  const [cashMovementError, setCashMovementError] = useState('');
  const [cashRefreshKey, setCashRefreshKey] = useState(0);
  const [refundSettlements, setRefundSettlements] = useState([]);
  const [refundSettlementError, setRefundSettlementError] = useState('');
  const [expensePayments, setExpensePayments] = useState([]);
  const [expensePaymentsLoading, setExpensePaymentsLoading] = useState(false);
  const [expensePaymentsError, setExpensePaymentsError] = useState('');
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
  const [inventoryCatalogCostSummary, setInventoryCatalogCostSummary] = useState<InventoryCatalogCostSummary | null>(null);
  const [inventoryCatalogCostLoading, setInventoryCatalogCostLoading] = useState(false);
  const [inventoryCatalogCostError, setInventoryCatalogCostError] = useState('');
  const [inventoryCatalogCostRefreshKey, setInventoryCatalogCostRefreshKey] = useState(0);
  const [materialCostSummary, setMaterialCostSummary] = useState<MaterialCostSummary | null>(null);
  const [materialCostLoading, setMaterialCostLoading] = useState(false);
  const [materialCostError, setMaterialCostError] = useState('');

  useEffect(() => {
    if (!supabase || !organizationId) {
      setRealtimeStatus('offline');
      return undefined;
    }

    const channel = supabase.channel(`operations-finance-${organizationId}`);
    const sources: Array<{ table: string; areas: Array<keyof typeof realtimeRevision>; enabled?: boolean }> = [
      { table: 'organization_memberships', areas: ['sales'] },
      { table: 'branches', areas: ['sales', 'expenses'], enabled: canManageFinance },
      { table: 'customers', areas: ['sales'] },
      { table: 'suppliers', areas: ['expenses'], enabled: canManageFinance },
      { table: 'personnel_records', areas: ['expenses'], enabled: canSeePayrollDeductions },
      { table: 'personnel_account_links', areas: ['expenses'], enabled: canSeePayrollDeductions },
      { table: 'sales', areas: ['sales', 'inventoryCosts'] },
      { table: 'sale_payments', areas: ['sales', 'cash'] },
      { table: 'sale_returns', areas: ['sales'] },
      { table: 'sale_refund_settlements', areas: ['sales', 'cash'], enabled: canSeeInventoryCosts },
      { table: 'finance_expenses', areas: ['expenses'], enabled: canManageFinance },
      { table: 'finance_expense_payments', areas: ['expenses', 'expensePayments'], enabled: canManageFinance },
      { table: 'finance_recurring_templates', areas: ['expenses'], enabled: canManageFinance },
      { table: 'finance_recurring_occurrences', areas: ['expenses'], enabled: canManageFinance },
      { table: 'finance_payroll_deductions', areas: ['expenses'], enabled: canSeePayrollDeductions },
      { table: 'finance_budgets', areas: ['expenses'], enabled: canManageFinance },
      { table: 'purchase_orders', areas: ['expenses'], enabled: canManageFinance },
      { table: 'purchase_order_lines', areas: ['expenses'], enabled: canManageFinance },
      { table: 'purchase_receipts', areas: ['expenses'], enabled: canManageFinance },
      { table: 'purchase_receipt_lines', areas: ['expenses'], enabled: canManageFinance },
      { table: 'cash_sessions', areas: ['cash'], enabled: canSeeCashReconciliation },
      { table: 'cash_session_movements', areas: ['cash'], enabled: canSeeCashReconciliation },
      { table: 'inventory_variants', areas: ['catalogCosts'], enabled: canSeeInventoryCosts },
      { table: 'inventory_items', areas: ['catalogCosts'], enabled: canSeeInventoryCosts },
      { table: 'inventory_item_costs', areas: ['catalogCosts'], enabled: canSeeInventoryCosts },
      { table: 'sale_line_cost_snapshots', areas: ['inventoryCosts'], enabled: canSeeInventoryCosts },
      { table: 'inventory_movement_cost_snapshots', areas: ['materialCosts'], enabled: canSeeInventoryCosts },
    ];

    sources.filter((source) => source.enabled !== false).forEach((source) => {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: source.table,
        filter: `organization_id=eq.${organizationId}`,
      }, () => {
        source.areas.forEach((area) => realtimePending.current.add(area));
        if (realtimeFlushTimer.current !== null) return;
        realtimeFlushTimer.current = window.setTimeout(() => {
          const changedAreas = new Set(realtimePending.current);
          realtimePending.current.clear();
          realtimeFlushTimer.current = null;
          setRealtimeRevision((current) => Object.fromEntries(
            Object.entries(current).map(([area, revision]) => [area, revision + (changedAreas.has(area as keyof typeof current) ? 1 : 0)]),
          ) as typeof current);
        }, 350);
      });
    });

    channel.subscribe((status) => {
      setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'reconnecting' : 'connecting');
    });
    return () => {
      if (realtimeFlushTimer.current !== null) window.clearTimeout(realtimeFlushTimer.current);
      realtimeFlushTimer.current = null;
      realtimePending.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [organizationId, canManageFinance, canSeePayrollDeductions, canSeeInventoryCosts, canSeeCashReconciliation]);

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
      setRefundSettlementError('');
      setSaleReturnsError('');
      try {
        const [salesRows, paymentRows, teamResult, branchResult] = await Promise.all([
          readAllRows(() => supabase
            .from('sales')
            .select('id,sale_code,status,total,created_at,branch_id,advisor_id,created_by,customer_id,customers(full_name)')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })),
          readAllRows(() => supabase
            .from('sale_payments')
            .select(canSeeCashReconciliation
              ? 'id,sale_id,amount,method,created_by,created_at,cash_session_id'
              : 'id,sale_id,amount,method,created_by,created_at')
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
        try {
          const returnRows = await readAllRows(() => supabase
            .from('sale_returns')
            .select('id,sale_id,kind,refund_amount,refund_status,sale_return_lines(quantity,sale_lines(unit_price))')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }));
          if (active) setSaleReturns(returnRows);
        } catch (returnLoadError) {
          if (active) {
            setSaleReturns([]);
            setSaleReturnsError(returnLoadError?.message || 'No se pudieron cargar las devoluciones; los saldos ajustados no están disponibles.');
          }
        }
        if (canSeeInventoryCosts) {
          try {
            const refundRows = await readAllRows(() => supabase
              .from('sale_refund_settlements')
              .select('id,return_id,return_code,sale_id,branch_id,amount,method,reference,cash_session_id,settled_at,settled_by')
              .eq('organization_id', organizationId)
              .order('settled_at', { ascending: false }));
            if (active) setRefundSettlements(refundRows);
          } catch (refundLoadError) {
            if (active) {
              setRefundSettlements([]);
              setRefundSettlementError(refundLoadError?.message || 'No se pudieron cargar los reembolsos liquidados.');
            }
          }
        } else if (active) {
          setRefundSettlements([]);
        }
      } catch (loadError) {
        if (active) setError(loadError?.message || 'No se pudieron cargar las ventas y los pagos.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [organizationId, hasPermission, canSeeInventoryCosts, canSeeCashReconciliation, realtimeRevision.sales, realtimeRevision.inventoryCosts]);

  useEffect(() => {
    let active = true;
    const range = businessMonthRange(month);
    if (!canSeeInventoryCosts || !supabase || !organizationId || !range) {
      setExpensePayments([]);
      setExpensePaymentsError('');
      setExpensePaymentsLoading(false);
      return () => { active = false; };
    }
    setExpensePaymentsLoading(true);
    setExpensePaymentsError('');
    const trendRange = businessMonthRange(shiftBusinessMonth(month, -5));
    void readAllRows(() => supabase
      .from('finance_expense_payments')
      .select('id,amount,method,paid_at,reference,finance_expenses!inner(description,category,branch_id,reference)')
      .eq('organization_id', organizationId)
      .gte('paid_at', trendRange?.start || range.start)
      .lt('paid_at', range.end)
      .order('paid_at', { ascending: false })
      .order('id'))
      .then((rows) => {
        if (!active) return;
        setExpensePayments(rows);
        setExpensePaymentsLoading(false);
      }, (cause) => {
        if (!active) return;
        setExpensePayments([]);
        setExpensePaymentsError(cause?.message || 'No se pudieron cargar los pagos de egresos.');
        setExpensePaymentsLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, canSeeInventoryCosts, month, realtimeRevision.expensePayments]);

  useEffect(() => {
    let active = true;
    if (!canSeeCashReconciliation) {
      setCashSessions([]);
      setCashSessionMovements([]);
      setCashSessionError('');
      setCashMovementError('');
      setCashSessionLoading(false);
      return () => { active = false; };
    }
    if (!supabase || !organizationId) {
      setCashSessionError(!supabase ? 'La conexión con la base de datos no está disponible.' : 'Esta cuenta no tiene una organización asignada.');
      setCashSessionLoading(false);
      return () => { active = false; };
    }

    setCashSessionLoading(true);
    setCashSessionError('');
    setCashMovementError('');
    const loadCashSessions = async () => {
      try {
        let openQuery = () => supabase.from('cash_sessions')
          .select('id,branch_id,status,opening_cash,opened_by,opened_at,expected_cash,counted_cash,difference,closed_by,closed_at')
          .eq('organization_id', organizationId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .order('id');
        let closedQuery = () => supabase.from('cash_sessions')
          .select('id,branch_id,status,opening_cash,opened_by,opened_at,expected_cash,counted_cash,difference,closed_by,closed_at')
          .eq('organization_id', organizationId)
          .eq('status', 'closed')
          .order('closed_at', { ascending: false })
          .order('id');
        if (branch !== 'all') {
          const selectedBranch = branch;
          const baseOpenQuery = openQuery;
          const baseClosedQuery = closedQuery;
          openQuery = () => baseOpenQuery().eq('branch_id', selectedBranch);
          closedQuery = () => baseClosedQuery().eq('branch_id', selectedBranch);
        }
        if (month) {
          const [year, monthNumber] = month.split('-').map(Number);
          const start = new Date(Date.UTC(year, monthNumber - 1, 1, 5)).toISOString();
          const end = new Date(Date.UTC(year, monthNumber, 1, 5)).toISOString();
          const baseClosedQuery = closedQuery;
          closedQuery = () => baseClosedQuery().gte('closed_at', start).lt('closed_at', end);
        }
        const [openRows, closedRows] = await Promise.all([
          readAllRows(openQuery),
          readAllRows(closedQuery),
        ]);
        if (!active) return;
        const sessions = [...openRows, ...closedRows];
        setCashSessions(sessions);
        const openSessionIds = openRows.map((session) => session.id);
        if (!openSessionIds.length) {
          setCashSessionMovements([]);
          return;
        }
        try {
          const movements = await readAllRows(() => supabase
            .from('cash_session_movements')
            .select('id,session_id,direction,amount,created_at')
            .eq('organization_id', organizationId)
            .in('session_id', openSessionIds)
            .order('created_at', { ascending: false })
            .order('id'));
          if (!active) return;
          setCashSessionMovements(movements);
        } catch (movementError) {
          if (!active) return;
          setCashSessionMovements([]);
          setCashMovementError(movementError?.message || 'No se pudieron cargar los movimientos manuales.');
        }
      } catch (loadError) {
        if (active) {
          setCashSessionError(loadError?.message || 'No se pudieron cargar los cierres de Caja.');
          setCashSessions([]);
          setCashSessionMovements([]);
        }
      } finally {
        if (active) setCashSessionLoading(false);
      }
    };
    void loadCashSessions();
    return () => { active = false; };
  }, [organizationId, canSeeCashReconciliation, month, branch, cashRefreshKey, realtimeRevision.cash]);

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
  }, [organizationId, canSeeInventoryCosts, month, branch, advisor, realtimeRevision.inventoryCosts]);

  useEffect(() => {
    let active = true;
    if (!canSeeInventoryCosts || !supabase || !organizationId) {
      setInventoryCatalogCostSummary(null);
      setInventoryCatalogCostError('');
      setInventoryCatalogCostLoading(false);
      return () => { active = false; };
    }
    setInventoryCatalogCostLoading(true);
    setInventoryCatalogCostError('');
    void readAllRows(() => supabase
      .from('inventory_variants')
      .select('id,item_id,sku,label,inventory_items!inner(id,sku,name,active),inventory_item_costs(variant_id)')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .eq('inventory_items.active', true)
      .order('sku')
      .order('id'))
      .then((rows) => {
        if (!active) return;
        const variants = rows.map((variant) => ({
          ...variant,
          inventory_item: Array.isArray(variant.inventory_items) ? variant.inventory_items[0] : variant.inventory_items,
        }));
        const missingVariants = variants.filter((variant) => (
          Array.isArray(variant.inventory_item_costs)
            ? variant.inventory_item_costs.length === 0
            : !variant.inventory_item_costs
        ));
        setInventoryCatalogCostSummary({
          active_variants: variants.length,
          configured_variants: variants.length - missingVariants.length,
          missing_variants: missingVariants,
        });
        setInventoryCatalogCostLoading(false);
      }, (cause) => {
        if (!active) return;
        setInventoryCatalogCostError(cause instanceof Error ? cause.message : 'No se pudieron consultar los costos vigentes del inventario.');
        setInventoryCatalogCostSummary(null);
        setInventoryCatalogCostLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, canSeeInventoryCosts, inventoryCatalogCostRefreshKey, realtimeRevision.catalogCosts]);

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
      setMaterialCostLoading(false);
    }, (cause) => {
      if (!active) return;
      setMaterialCostError(cause instanceof Error ? cause.message : 'No se pudo consultar el costo capturado de materiales.');
      setMaterialCostSummary(null);
      setMaterialCostLoading(false);
    });
    return () => { active = false; };
  }, [organizationId, canSeeInventoryCosts, month, branch, advisor, realtimeRevision.materialCosts]);

  const advisorNames = useMemo(() => new Map(advisors.map((person) => [
    person.user_id,
    person.full_name || person.email || `Usuario ${String(person.user_id).slice(0, 8)}`,
  ])), [advisors]);
  const salesById = useMemo(() => new Map(sales.map((sale) => [sale.id, sale])), [sales]);
  const paymentsBySale = useMemo(() => payments.reduce((totals, payment) => {
    totals.set(payment.sale_id, (totals.get(payment.sale_id) || 0) + Number(payment.amount || 0));
    return totals;
  }, new Map()), [payments]);
  const returnsBySale = useMemo(() => saleReturns.reduce((totals, saleReturn) => {
    const current = totals.get(saleReturn.sale_id) || { returnedValue: 0, settledRefund: 0, pendingRefund: 0, count: 0 };
    const lines = Array.isArray(saleReturn.sale_return_lines) ? saleReturn.sale_return_lines : [];
    const returnedValue = saleReturn.kind === 'cancellation' ? 0 : lines.reduce((sum, line) => {
      const saleLine = Array.isArray(line.sale_lines) ? line.sale_lines[0] : line.sale_lines;
      return sum + Number(line.quantity || 0) * Number(saleLine?.unit_price || 0);
    }, 0);
    current.returnedValue += returnedValue;
    current.settledRefund += saleReturn.refund_status === 'refunded' ? Number(saleReturn.refund_amount || 0) : 0;
    current.pendingRefund += saleReturn.refund_status === 'pending' ? Number(saleReturn.refund_amount || 0) : 0;
    current.count += 1;
    totals.set(saleReturn.sale_id, current);
    return totals;
  }, new Map()), [saleReturns]);
  const branchNames = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches]);
  const branchName = (id) => branchNames.get(id) || 'Sucursal';
  const cashMovementTotals = useMemo(() => cashSessionMovements.reduce((totals, movement) => {
    const amount = Number(movement.amount || 0) * (movement.direction === 'in' ? 1 : -1);
    totals.set(movement.session_id, (totals.get(movement.session_id) || 0) + amount);
    return totals;
  }, new Map()), [cashSessionMovements]);
  const cashPaymentTotals = useMemo(() => payments.reduce((totals, payment) => {
    if (payment.method === 'cash' && payment.cash_session_id) {
      totals.set(payment.cash_session_id, (totals.get(payment.cash_session_id) || 0) + Number(payment.amount || 0));
    }
    return totals;
  }, new Map()), [payments]);

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
  const openReceivables = useMemo(() => salesMatchingTeamAndBranch.flatMap((sale) => {
    const total = Number(sale.total || 0);
    const returns = returnsBySale.get(sale.id) || { returnedValue: 0, settledRefund: 0, pendingRefund: 0, count: 0 };
    const adjustedTotal = Math.max(0, total - returns.returnedValue);
    const collected = Number(paymentsBySale.get(sale.id) || 0) - returns.settledRefund;
    const balance = Math.max(0, adjustedTotal - collected);
    const customerCredit = Math.max(0, collected - adjustedTotal);
    if (balance < 0.005 && customerCredit < 0.005) return [];
    return [{ sale, total, adjustedTotal, returnedValue: returns.returnedValue, settledRefund: returns.settledRefund, pendingRefund: returns.pendingRefund, returnCount: returns.count, collected, balance, customerCredit, ageDays: daysSinceBusinessDate(sale.created_at) }];
  }).sort((a, b) => b.ageDays - a.ageDays || b.balance - a.balance), [salesMatchingTeamAndBranch, paymentsBySale, returnsBySale]);
  const receivableAging = useMemo(() => {
    const buckets = [
      { label: '0–7 días', min: 0, max: 7, amount: 0, count: 0 },
      { label: '8–30 días', min: 8, max: 30, amount: 0, count: 0 },
      { label: '31–60 días', min: 31, max: 60, amount: 0, count: 0 },
      { label: 'Más de 60 días', min: 61, max: Number.POSITIVE_INFINITY, amount: 0, count: 0 },
    ];
    openReceivables.forEach((item) => {
      const bucket = buckets.find((entry) => item.ageDays >= entry.min && item.ageDays <= entry.max);
      if (bucket) {
        bucket.amount += item.balance;
        bucket.count += 1;
      }
    });
    return buckets;
  }, [openReceivables]);
  const receivablesWithBalance = useMemo(() => openReceivables.filter(({ balance }) => balance > 0.005), [openReceivables]);
  const customerCredits = useMemo(() => openReceivables.filter(({ customerCredit }) => customerCredit > 0.005), [openReceivables]);
  const receivablesWithoutCrm = useMemo(() => receivablesWithBalance.filter(({ sale }) => !sale.customer_id), [receivablesWithBalance]);
  const receivablesWithoutCrmAmount = receivablesWithoutCrm.reduce((sum, item) => sum + item.balance, 0);
  const paymentSaleIds = useMemo(() => new Set(salesMatchingTeamAndBranch.map((sale) => sale.id)), [salesMatchingTeamAndBranch]);
  const salesInScope = useMemo(() => sales.filter((sale) => (
    (advisor === 'all' || sale.advisor_id === advisor)
    && (branch === 'all' || sale.branch_id === branch)
  )), [sales, advisor, branch]);
  const salesInScopeIds = useMemo(() => new Set(salesInScope.map((sale) => sale.id)), [salesInScope]);
  const paymentsInPeriod = useMemo(() => payments.filter((payment) => (
    paymentSaleIds.has(payment.sale_id)
    && (!month || monthInBusinessTimeZone(payment.created_at) === month)
    && (method === 'all' || payment.method === method)
  )), [payments, paymentSaleIds, month, method]);

  const totalSold = salesInPeriod.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalCollected = paymentsInPeriod.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const outstanding = salesInPeriod.reduce((sum, sale) => (
    sum + Math.max(0,
      Math.max(0, Number(sale.total || 0) - (returnsBySale.get(sale.id)?.returnedValue || 0))
      - ((paymentsBySale.get(sale.id) || 0) - (returnsBySale.get(sale.id)?.settledRefund || 0)),
    )
  ), 0);
  const allHistoricalPayments = salesInPeriod.reduce((sum, sale) => sum + (paymentsBySale.get(sale.id) || 0), 0);
  const posCashInflows = payments.filter((payment) => (
    salesInScopeIds.has(payment.sale_id)
    && (!month || monthInBusinessTimeZone(payment.created_at) === month)
    && (method === 'all' || payment.method === method)
  ));
  const refundsSettledInPeriod = refundSettlements.filter((refund) => (
    salesInScopeIds.has(refund.sale_id)
    && (!month || monthInBusinessTimeZone(refund.settled_at) === month)
    && (method === 'all' || refund.method === method)
  ));
  const posRefundOutflow = refundsSettledInPeriod.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
  const posCashInflow = posCashInflows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const posNetCashFlow = posCashInflow - posRefundOutflow;
  const operatingCashflow = useMemo(() => {
    const paymentsInPeriod = payments.filter((payment) => (
      (!month || monthInBusinessTimeZone(payment.created_at) === month)
      && (branch === 'all' || salesById.get(payment.sale_id)?.branch_id === branch)
    ));
    const refundsInPeriod = refundSettlements.filter((refund) => (
      (!month || monthInBusinessTimeZone(refund.settled_at) === month)
      && (branch === 'all' || refund.branch_id === branch)
    ));
    const expensesInPeriod = expensePayments.filter((payment) => (
      (!month || monthInBusinessTimeZone(payment.paid_at) === month)
      && (branch === 'all' || payment.finance_expenses?.branch_id === branch)
    ));
    const collections = paymentsInPeriod.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const refunds = refundsInPeriod.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const branchExpenses = expensesInPeriod.filter((payment) => payment.finance_expenses?.branch_id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const generalExpenses = expensesInPeriod.filter((payment) => !payment.finance_expenses?.branch_id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      collections,
      refunds,
      branchExpenses,
      generalExpenses,
      expenses: branchExpenses + (branch === 'all' ? generalExpenses : 0),
      net: collections - refunds - branchExpenses - (branch === 'all' ? generalExpenses : 0),
      refundCount: refundsInPeriod.length,
      paymentCount: paymentsInPeriod.length,
      expenseCount: expensesInPeriod.length,
    };
  }, [payments, salesById, refundSettlements, expensePayments, month, branch]);
  const previousMonth = previousBusinessMonth(month);
  const previousOperatingCashflow = useMemo(() => {
    const paymentsInPeriod = payments.filter((payment) => (
      monthInBusinessTimeZone(payment.created_at) === previousMonth
      && (branch === 'all' || salesById.get(payment.sale_id)?.branch_id === branch)
    ));
    const refundsInPeriod = refundSettlements.filter((refund) => (
      monthInBusinessTimeZone(refund.settled_at) === previousMonth
      && (branch === 'all' || refund.branch_id === branch)
    ));
    const expensesInPeriod = expensePayments.filter((payment) => (
      monthInBusinessTimeZone(payment.paid_at) === previousMonth
      && (branch === 'all' || payment.finance_expenses?.branch_id === branch)
    ));
    const collections = paymentsInPeriod.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const refunds = refundsInPeriod.reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
    const branchExpenses = expensesInPeriod.filter((payment) => payment.finance_expenses?.branch_id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const generalExpenses = expensesInPeriod.filter((payment) => !payment.finance_expenses?.branch_id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return {
      collections,
      refunds,
      expenses: branchExpenses + (branch === 'all' ? generalExpenses : 0),
      net: collections - refunds - branchExpenses - (branch === 'all' ? generalExpenses : 0),
    };
  }, [payments, salesById, refundSettlements, expensePayments, previousMonth, branch]);
  const operatingCashflowTrend = useMemo(() => {
    if (!month) return [];
    return Array.from({ length: 6 }, (_, index) => shiftBusinessMonth(month, index - 5)).map((period) => {
      const collections = payments.filter((payment) => (
        monthInBusinessTimeZone(payment.created_at) === period
        && (branch === 'all' || salesById.get(payment.sale_id)?.branch_id === branch)
      )).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const refunds = refundSettlements.filter((refund) => (
        monthInBusinessTimeZone(refund.settled_at) === period
        && (branch === 'all' || refund.branch_id === branch)
      )).reduce((sum, refund) => sum + Number(refund.amount || 0), 0);
      const expenses = expensePayments.filter((payment) => (
        monthInBusinessTimeZone(payment.paid_at) === period
        && (branch === 'all' || payment.finance_expenses?.branch_id === branch)
      )).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      return { period, collections, outflows: refunds + expenses, net: collections - refunds - expenses };
    });
  }, [month, payments, salesById, refundSettlements, expensePayments, branch]);
  const operatingCashflowTrendScale = Math.max(1, ...operatingCashflowTrend.map((item) => Math.abs(item.net)));
  const operatingCashflowRows = useMemo(() => {
    const rows = [];
    payments.forEach((payment) => {
      const sale = salesById.get(payment.sale_id);
      if ((!month || monthInBusinessTimeZone(payment.created_at) === month)
        && (branch === 'all' || sale?.branch_id === branch)) {
        rows.push({ date: payment.created_at, type: 'Cobro POS', reference: sale?.sale_code || payment.sale_id, description: sale?.customers?.full_name ? `Cobro POS · ${sale.customers.full_name}` : 'Cobro POS', category: 'Venta', branch: branchName(sale?.branch_id), method: payment.method || '', amount: Number(payment.amount || 0) });
      }
    });
    refundSettlements.forEach((refund) => {
      if ((!month || monthInBusinessTimeZone(refund.settled_at) === month)
        && (branch === 'all' || refund.branch_id === branch)) {
        const sale = salesById.get(refund.sale_id);
        rows.push({ date: refund.settled_at, type: 'Devolución liquidada', reference: refund.return_code || refund.return_id, description: `Reembolso de venta ${sale?.sale_code || refund.sale_id}`, category: 'Devolución', branch: branchName(refund.branch_id), method: refund.method || '', amount: -Math.abs(Number(refund.amount || 0)) });
      }
    });
    expensePayments.forEach((payment) => {
      const expense = payment.finance_expenses;
      if ((branch === 'all' || expense?.branch_id === branch)
        && (!month || monthInBusinessTimeZone(payment.paid_at) === month)) {
        rows.push({ date: payment.paid_at, type: 'Pago de egreso', reference: payment.reference || expense?.reference || '', description: expense?.description || 'Egreso', category: expense?.category || 'Sin categoría', branch: expense?.branch_id ? branchName(expense.branch_id) : 'General', method: payment.method || '', amount: -Math.abs(Number(payment.amount || 0)) });
      }
    });
    return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [payments, salesById, refundSettlements, expensePayments, month, branch, branchNames]);
  const operatingExpenseCategories = useMemo(() => {
    const totals = new Map<string, number>();
    expensePayments
      .filter((payment) => (!month || monthInBusinessTimeZone(payment.paid_at) === month)
        && (branch === 'all' || payment.finance_expenses?.branch_id === branch))
      .forEach((payment) => {
        const category = payment.finance_expenses?.category || 'Sin categoría';
        totals.set(category, (totals.get(category) || 0) + Number(payment.amount || 0));
      });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [expensePayments, month, branch]);
  const largestOperatingExpenseCategory = Math.max(1, ...operatingExpenseCategories.map(([, amount]) => amount));
  const cashReconciliationRows = useMemo(() => cashSessions.map((session) => {
    const expected = session.status === 'closed'
      ? Number(session.expected_cash || 0)
      : cashMovementError
        ? null
        : Number(session.opening_cash || 0) + Number(cashPaymentTotals.get(session.id) || 0) + Number(cashMovementTotals.get(session.id) || 0);
    return {
      ...session,
      expected,
      counted: session.status === 'closed' ? Number(session.counted_cash || 0) : null,
      difference: session.status === 'closed' ? Number(session.difference || 0) : null,
    };
  }), [cashSessions, cashPaymentTotals, cashMovementError, cashMovementTotals]);
  const openCashRows = cashReconciliationRows.filter((session) => session.status === 'open');
  const closedCashRows = cashReconciliationRows.filter((session) => session.status === 'closed');
  const cashExpectedInOpenSessions = openCashRows.some((session) => session.expected === null)
    ? null
    : openCashRows.reduce((sum, session) => sum + session.expected, 0);
  const cashShortfall = closedCashRows.reduce((sum, session) => sum + Math.max(0, -session.difference), 0);
  const cashSurplus = closedCashRows.reduce((sum, session) => sum + Math.max(0, session.difference), 0);
  const cashSessionsWithDifference = closedCashRows.filter((session) => Math.abs(session.difference) >= 0.005).length;

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
  const paymentMethods = [...new Set([...payments, ...refundSettlements].map((movement) => movement.method).filter(Boolean))].sort();
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

  const downloadReceivablesCsv = () => {
    const rows = [
      ['Fecha de venta', 'Antigüedad en días', 'Asesora responsable', 'Venta', 'Cliente', 'Ficha CRM', 'Sucursal', 'Total venta USD', 'Artículos devueltos USD', 'Venta ajustada USD', 'Pagos POS USD', 'Reembolsos liquidados USD', 'Reembolso pendiente USD', 'Cobrado neto USD', 'Saldo por cobrar USD', 'Saldo a favor del cliente USD', 'Devoluciones'],
      ...openReceivables.map(({ sale, total, returnedValue, adjustedTotal, settledRefund, pendingRefund, collected, balance, customerCredit, returnCount, ageDays }) => [
        timestamp(sale.created_at), ageDays, personName(sale.advisor_id), sale.sale_code || sale.id,
        sale.customers?.full_name || '', sale.customer_id ? 'Vinculada' : 'Sin ficha', branchName(sale.branch_id), total.toFixed(2), returnedValue.toFixed(2), adjustedTotal.toFixed(2), (collected + settledRefund).toFixed(2), settledRefund.toFixed(2), pendingRefund.toFixed(2), collected.toFixed(2), balance.toFixed(2), customerCredit.toFixed(2), returnCount,
      ]),
    ];
    const escape = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saldos-por-cobrar-${businessDate(new Date())}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadRefundsCsv = () => {
    const rows = [
      ['Fecha de liquidación', 'Devolución', 'Venta', 'Asesora', 'Sucursal', 'Medio', 'Referencia', 'Caja', 'Monto de salida USD'],
      ...refundsSettledInPeriod.map((refund) => {
        const sale = salesById.get(refund.sale_id);
        return [timestamp(refund.settled_at), refund.return_code, sale?.sale_code || refund.sale_id, personName(sale?.advisor_id), branchName(refund.branch_id), refund.method, refund.reference, refund.cash_session_id || '', Number(refund.amount || 0).toFixed(2)];
      }),
    ];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reembolsos-liquidados-${month || 'historico'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadOperatingCashflowCsv = () => {
    const rows = [
      ['Fecha efectiva', 'Tipo', 'Referencia', 'Detalle', 'Categoría', 'Sucursal', 'Medio de pago', 'Monto USD (+/-)'],
      ...operatingCashflowRows.map((row) => [timestamp(row.date), row.type, row.reference, row.description, row.category, row.branch, row.method, row.amount.toFixed(2)]),
    ];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flujo-operativo-${month || 'historico'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadMissingInventoryCostsCsv = () => {
    const missingVariants = inventoryCatalogCostSummary?.missing_variants || [];
    if (!missingVariants.length) return;
    const rows = [
      ['Producto', 'SKU de producto', 'Variante', 'SKU de variante', 'ID de variante', 'Estado del costo'],
      ...missingVariants.map((variant) => [
        variant.inventory_item?.name || 'Producto sin nombre',
        variant.inventory_item?.sku || '',
        variant.label || 'Variante general',
        variant.sku || '',
        variant.id,
        'Sin costo unitario configurado',
      ]),
    ];
    const escape = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventario-variantes-sin-costo.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadCashReconciliationCsv = () => {
    const rows = [
      ['Estado', 'Apertura', 'Cierre', 'Sucursal', 'Responsable', 'Efectivo esperado USD', 'Efectivo contado USD', 'Diferencia USD'],
      ...cashReconciliationRows.map((session) => [
        session.status === 'open' ? 'Abierta' : 'Cerrada',
        timestamp(session.opened_at),
        timestamp(session.closed_at),
        branchName(session.branch_id),
        personName(session.opened_by),
        session.expected === null ? '' : session.expected.toFixed(2),
        session.counted === null ? '' : session.counted.toFixed(2),
        session.difference === null ? '' : session.difference.toFixed(2),
      ]),
    ];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conciliacion-caja-${month || 'historico'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading) return <div className="op-flow-loading"><LoaderCircle className="spin" /> Cargando ventas y pagos registrados…</div>;

  return <div className="op-finance-page">
    <OperationsFinanceControls month={month} branch={branch} realtimeRefreshKey={realtimeRevision.expenses} />
    <section className="panel op-finance-intro">
      <div>
        <span className="eyebrow">INGRESOS Y RECAUDACIÓN</span>
        <h2>Finanzas por asesora</h2>
        <p>Ventas confirmadas y pagos recibidos desde el punto de venta. Cada abono conserva su fecha, medio de pago y venta asociada.</p>
        <span className={`op-finance-sync ${realtimeStatus === 'live' ? 'is-live' : ''}`} role="status">
          <i aria-hidden="true" />{realtimeStatus === 'live' ? 'Conectado a cambios en vivo' : realtimeStatus === 'offline' ? 'Sin conexión en vivo' : 'Reconectando datos…'}
        </span>
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
      <article><span>Saldo por cobrar</span><b>{saleReturnsError ? '—' : money(outstanding)}</b><small>{saleReturnsError ? 'No disponible: error al cargar devoluciones' : 'Ajustado por devoluciones de ventas filtradas'}</small></article>
      <article><span>Valor promedio por venta</span><b>{money(salesInPeriod.length ? totalSold / salesInPeriod.length : 0)}</b><small>Solo ventas confirmadas</small></article>
    </section>
    <section className="panel op-finance-receivables" aria-labelledby="op-finance-receivables-title">
      <div className="panel-heading"><div><span className="eyebrow">POS → DEVOLUCIONES → FINANZAS → CRM · SALDOS ABIERTOS</span><h2 id="op-finance-receivables-title">Antigüedad de saldos por cobrar</h2><p className="op-finance-cost-note">La venta se ajusta por el valor de artículos devueltos. Solo los reembolsos liquidados reducen el cobro neto. El filtro de mes y medio de pago no aplica; se usan asesora y sucursal.</p></div><div className="op-finance-heading-actions"><button className="button button-outline" onClick={downloadReceivablesCsv} disabled={!openReceivables.length || !!saleReturnsError}><Download size={15}/> Exportar saldos CSV</button><a className="button button-outline" href="/operaciones/pos">Abrir POS <ArrowUpRight size={15}/></a>{canSeeCrm && <a className="button button-outline" href="/operaciones/clientes">Abrir CRM <ArrowUpRight size={15}/></a>}</div></div>
      {saleReturnsError && <p className="op-finance-cost-error" role="alert">{saleReturnsError}</p>}
      {!saleReturnsError && <><div className="op-finance-receivables-metrics"><article className="is-total"><span>Saldo abierto ajustado</span><b>{money(openReceivables.reduce((sum, item) => sum + item.balance, 0))}</b><small>{receivablesWithBalance.length} ventas con saldo</small></article>{receivableAging.map((bucket) => <article key={bucket.label}><span>{bucket.label}</span><b>{money(bucket.amount)}</b><small>{bucket.count} ventas desde POS</small></article>)}<article className={customerCredits.length ? 'is-unlinked' : ''}><span>Saldo a favor por revisar</span><b>{money(customerCredits.reduce((sum, item) => sum + item.customerCredit, 0))}</b><small>{customerCredits.length} ventas · sin liquidación automática</small></article><article className={receivablesWithoutCrm.length ? 'is-unlinked' : ''}><span>Sin ficha CRM vinculada</span><b>{money(receivablesWithoutCrmAmount)}</b><small>{receivablesWithoutCrm.length} ventas con saldo</small></article></div>
      {openReceivables.length ? <div className="op-finance-receivables-list">{openReceivables.slice(0, 10).map(({ sale, total, adjustedTotal, returnedValue, settledRefund, pendingRefund, collected, balance, customerCredit, ageDays }) => <article key={sale.id}>
        <div className="op-finance-receivables-sale"><b>{sale.sale_code || sale.id.slice(0, 8)} · {sale.customers?.full_name || 'Cliente sin nombre'}</b><span>{timestamp(sale.created_at)} · {personName(sale.advisor_id)} · {branchName(sale.branch_id)}</span></div>
        <div className="op-finance-receivables-progress"><div><span>Cobrado neto {money(collected)} de {money(adjustedTotal)}{returnedValue > 0 ? ` · devuelto ${money(returnedValue)}` : ''}{settledRefund > 0 ? ` · reembolsado ${money(settledRefund)}` : ''}{pendingRefund > 0 ? ` · reembolso pendiente ${money(pendingRefund)}` : ''}</span><b>{balance > 0 ? money(balance) : `A favor ${money(customerCredit)}`}</b></div><div className="op-finance-receivables-track" role="progressbar" aria-label={`Cobrado neto ${money(collected)} de ${money(adjustedTotal)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(adjustedTotal > 0 ? Math.max(0, collected) / adjustedTotal * 100 : 100))}><i style={{ width: `${Math.min(100, Math.max(0, adjustedTotal > 0 ? Math.max(0, collected) / adjustedTotal * 100 : 100))}%` }}/></div></div>
        <span className={`op-finance-receivables-age ${ageDays > 30 ? 'is-aged' : ''}`}>{ageDays} días desde la venta</span>
        {sale.customer_id && canSeeCrm ? <a className="op-finance-receivables-crm" href={`/operaciones/clientes?cliente=${encodeURIComponent(sale.customer_id)}`}>Abrir ficha CRM <ArrowUpRight size={13}/></a> : <span className={`op-finance-receivables-crm ${sale.customer_id ? '' : 'is-unlinked'}`}>{sale.customer_id ? 'Ficha CRM vinculada' : 'Sin ficha CRM'}</span>}
      </article>)}</div> : <div className="op-finance-ledger-empty"><Banknote size={23}/><b>Sin saldos abiertos en este alcance</b><span>Cambia la asesora o la sucursal para revisar otras ventas confirmadas.</span></div>}
      {openReceivables.length > 10 && <p className="op-finance-cost-note">Se muestran las 10 ventas con mayor antigüedad; el resumen y el CSV consideran {receivablesWithBalance.length} saldos abiertos y {customerCredits.length} saldos a favor.</p>}
      <p className="op-finance-cost-note">Los días son antigüedad desde la venta, no mora contractual. El valor devuelto usa cantidad por precio unitario guardado en POS; cobrado neto resta únicamente reembolsos liquidados. Los reembolsos pendientes se muestran aparte y el saldo a favor requiere revisión manual. No se crean pagos, créditos ni compensaciones automáticamente. Las fichas CRM permiten documentar el seguimiento.</p></>}
    </section>
    {canSeeInventoryCosts && <section className="panel op-finance-refund-panel" aria-labelledby="op-finance-refund-title">
      <div className="panel-heading"><div><span className="eyebrow">POS → DEVOLUCIONES → CAJA → FINANZAS</span><h2 id="op-finance-refund-title">Cobros y reembolsos liquidados</h2><p className="op-finance-cost-note">Filtra por la fecha real del cobro o de la liquidación, además de asesora, sucursal y medio.</p></div><button className="button button-outline" onClick={downloadRefundsCsv} disabled={!refundsSettledInPeriod.length}><Download size={15}/> Exportar reembolsos</button></div>
      {refundSettlementError ? <p className="op-finance-cost-error" role="alert">{refundSettlementError}</p> : <>
        <div className="op-finance-refund-metrics"><article><span>Cobros POS del periodo</span><b>{money(posCashInflow)}</b><small>Incluye ventas anuladas si hubo cobro efectivo registrado</small></article><article><span>Reembolsos liquidados</span><b>{money(posRefundOutflow)}</b><small>{refundsSettledInPeriod.length} liquidaciones con fecha efectiva</small></article><article className={posNetCashFlow < 0 ? 'is-negative' : ''}><span>Flujo neto POS</span><b>{money(posNetCashFlow)}</b><small>Cobros menos reembolsos liquidados</small></article></div>
        <div className="op-finance-table-wrap"><table className="op-finance-table"><thead><tr><th>Liquidado</th><th>Devolución</th><th>Venta</th><th>Asesora</th><th>Sucursal</th><th>Medio</th><th>Referencia / caja</th><th>Monto</th></tr></thead><tbody>{[...refundsSettledInPeriod].sort((a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime()).slice(0, 100).map((refund) => { const sale = salesById.get(refund.sale_id); return <tr key={refund.id}><td>{timestamp(refund.settled_at)}</td><td>{refund.return_code}</td><td>{sale?.sale_code || refund.sale_id.slice(0, 8)}</td><td>{personName(sale?.advisor_id)}</td><td>{branchName(refund.branch_id)}</td><td>{refund.method}</td><td>{refund.reference || (refund.cash_session_id ? `Caja ${refund.cash_session_id.slice(0, 8)}` : '—')}</td><td>{money(refund.amount)}</td></tr>; })}{!refundsSettledInPeriod.length && <tr><td colSpan={8}>No hay reembolsos liquidados en el periodo seleccionado.</td></tr>}</tbody></table></div>
        <p className="op-finance-cost-note">El flujo neto POS incluye cobros y reembolsos liquidados; no descuenta compras, nómina ni otros egresos. Los reembolsos en efectivo se registran también como salida en el cierre de su caja. La tabla muestra hasta 100 liquidaciones; los indicadores incluyen todo el periodo.</p>
      </>}
    </section>}
    {canSeeInventoryCosts && <section className="panel op-finance-refund-panel" aria-labelledby="op-finance-operating-title">
      <div className="panel-heading"><div><span className="eyebrow">POS + DEVOLUCIONES + EGRESOS → FINANZAS</span><h2 id="op-finance-operating-title">Flujo de efectivo operativo registrado</h2><p className="op-finance-cost-note">Solo considera cobros POS y pagos efectivos de egresos o devoluciones en el mes y sucursal seleccionados. No usa filtros de asesora ni medio de pago. Es un flujo de movimientos registrados, no una medida de utilidad.</p></div><div className="op-finance-heading-actions"><button className="button button-outline" onClick={downloadOperatingCashflowCsv} disabled={!operatingCashflowRows.length || expensePaymentsLoading || !!refundSettlementError || !!expensePaymentsError}><Download size={15}/> Exportar flujo CSV</button><a className="button button-outline" href="/operaciones/flujos">Gestionar egresos <ArrowUpRight size={15}/></a></div></div>
      {refundSettlementError && <p className="op-finance-cost-error" role="alert">{refundSettlementError}</p>}
      {expensePaymentsError && <p className="op-finance-cost-error" role="alert">{expensePaymentsError}</p>}
      {!refundSettlementError && !expensePaymentsError && expensePaymentsLoading && <p className="muted">Cargando cobros, liquidaciones y pagos efectivos de egresos…</p>}
      {!refundSettlementError && !expensePaymentsError && !expensePaymentsLoading && <>
        <div className="op-finance-refund-metrics">
          <article><span>Cobros recibidos</span><b>{money(operatingCashflow.collections)}</b><small>{operatingCashflow.paymentCount} pagos registrados en POS</small></article>
          <article><span>Devoluciones liquidadas</span><b>{money(operatingCashflow.refunds)}</b><small>{operatingCashflow.refundCount} salidas efectivas</small></article>
          <article><span>Egresos pagados de la sucursal</span><b>{money(operatingCashflow.branchExpenses)}</b><small>{operatingCashflow.expenseCount} pagos de egreso con este alcance</small></article>
          <article><span>Egresos generales</span><b>{money(operatingCashflow.generalExpenses)}</b><small>{branch === 'all' ? 'Incluidos en el flujo neto de toda la empresa' : 'Visibles aparte; excluidos del neto de esta sucursal'}</small></article>
          <article className={operatingCashflow.net < 0 ? 'is-negative' : ''}><span>Flujo neto registrado</span><b>{money(operatingCashflow.net)}</b><small>{branch === 'all' ? 'Cobros menos devoluciones y todos los egresos pagados' : 'Cobros menos devoluciones y egresos de la sucursal'}</small></article>
        </div>
        {month && <div className="op-finance-month-comparison" aria-labelledby="op-finance-cash-trend-title">
          <div className="op-finance-month-comparison-heading"><div><span className="eyebrow">TENDENCIA DE CAJA · MISMO ALCANCE</span><h3 id="op-finance-cash-trend-title">Tendencia de seis meses</h3><p>{monthLabel(operatingCashflowTrend[0]?.period || month)} a {monthLabel(month)} · {branch === 'all' ? 'toda la empresa' : `sucursal ${branchName(branch)}`}</p></div></div>
          <div className="op-finance-cash-trend" role="list" aria-label="Flujo de caja neto por mes">
            {operatingCashflowTrend.map((item) => {
              const extent = Math.min(50, Math.abs(item.net) / operatingCashflowTrendScale * 50);
              return <article role="listitem" key={item.period}>
                <b>{monthLabel(item.period)}</b>
                <span>Cobros <strong>{money(item.collections)}</strong></span>
                <span>Salidas <strong>{money(item.outflows)}</strong></span>
                <span className={`op-finance-cash-trend-net ${item.net < 0 ? 'is-negative' : 'is-positive'}`}>Neto <strong>{money(item.net)}</strong></span>
                <div className="op-finance-cash-trend-track" role="img" aria-label={`Neto ${money(item.net)}`}><i className={item.net < 0 ? 'is-negative' : 'is-positive'} style={{ width: `${extent}%`, left: item.net < 0 ? `calc(50% - ${extent}%)` : '50%' }}/></div>
              </article>;
            })}
          </div>
          <p className="op-finance-cost-note">Usa cobros POS, reembolsos liquidados y pagos efectivos de egresos por su fecha registrada. La sucursal seleccionada excluye gastos generales; “Todas” los incluye. No es utilidad contable ni presupuesto y no aplica los filtros de asesora o medio de pago.</p>
        </div>}
        {month && <div className="op-finance-month-comparison" aria-labelledby="op-finance-month-comparison-title">
          <div className="op-finance-month-comparison-heading"><div><span className="eyebrow">ANÁLISIS DEL PERIODO</span><h3 id="op-finance-month-comparison-title">Comparación con el mes anterior</h3><p>{monthLabel(month)} frente a {monthLabel(previousMonth)} · {branch === 'all' ? 'toda la empresa' : `sucursal ${branchName(branch)}`}</p></div></div>
          <div className="op-finance-month-comparison-grid">
            {[
              { label: 'Cobros recibidos', current: operatingCashflow.collections, previous: previousOperatingCashflow.collections },
              { label: 'Devoluciones liquidadas', current: operatingCashflow.refunds, previous: previousOperatingCashflow.refunds },
              { label: 'Egresos pagados', current: operatingCashflow.expenses, previous: previousOperatingCashflow.expenses },
              { label: 'Flujo neto registrado', current: operatingCashflow.net, previous: previousOperatingCashflow.net },
            ].map((item) => {
              const difference = item.current - item.previous;
              return <article key={item.label}>
                <span>{item.label}</span><b>{money(item.current)}</b>
                <small>Mes anterior: {money(item.previous)}</small>
                <small className={difference < 0 ? 'is-negative' : difference > 0 ? 'is-positive' : ''}>Variación: {difference > 0 ? '+' : ''}{money(difference)}</small>
              </article>;
            })}
          </div>
          <p className="op-finance-cost-note">Compara movimientos según su fecha efectiva y la sucursal seleccionada; no aplica los filtros de asesora o medio de pago. La variación es nominal y no representa presupuesto ni utilidad.</p>
        </div>}
        <div className="op-finance-expense-breakdown" aria-labelledby="op-finance-expense-breakdown-title">
          <div className="op-finance-expense-breakdown-heading"><div><span className="eyebrow">SALIDAS EFECTIVAS</span><h3 id="op-finance-expense-breakdown-title">Egresos pagados por categoría</h3></div><b>{money(operatingCashflow.branchExpenses + (branch === 'all' ? operatingCashflow.generalExpenses : 0))}</b></div>
          {operatingExpenseCategories.length ? <div className="op-finance-expense-breakdown-list">{operatingExpenseCategories.map(([category, amount]) => <div className="op-finance-expense-category" key={category}><div><span>{category}</span><b>{money(amount)}</b></div><div className="op-finance-expense-track" role="progressbar" aria-label={`${category}: ${money(amount)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(amount / largestOperatingExpenseCategory * 100)}><i style={{ width: `${Math.max(2, amount / largestOperatingExpenseCategory * 100)}%` }} /></div></div>)}</div> : <p className="muted">No hay pagos efectivos de egresos para el mes y sucursal seleccionados.</p>}
          <p className="op-finance-cost-note">{branch === 'all' ? 'Incluye egresos generales y de sucursales.' : 'Incluye solo egresos asignados a la sucursal elegida; los generales aparecen aparte arriba.'} Las barras comparan montos entre categorías del filtro actual.</p>
        </div>
      </>}
      <p className="op-finance-cost-note">La cifra es un flujo de efectivo basado en registros, no utilidad contable. No incluye obligaciones pendientes, descuentos de nómina ni movimientos entre cajas. Los gastos generales no se distribuyen entre sucursales.</p>
    </section>}
    {canSeeCashReconciliation && <section className="panel op-finance-cash-panel" aria-labelledby="op-finance-cash-title">
      <div className="panel-heading">
        <div><span className="eyebrow">CAJA → FINANZAS</span><h2 id="op-finance-cash-title">Conciliación de cierres de caja</h2><p className="op-finance-cost-note">Los cierres usan esperado y contado de Caja; las sesiones abiertas muestran el efectivo esperado al momento. Aplica mes de cierre y sucursal, no filtros de asesora o medio de pago.</p></div>
        <div className="op-finance-cash-actions"><button className="button button-outline" onClick={() => setCashRefreshKey((value) => value + 1)} disabled={cashSessionLoading}><RefreshCw size={15}/> Actualizar</button><button className="button button-outline" onClick={downloadCashReconciliationCsv} disabled={cashSessionLoading || !cashReconciliationRows.length}><Download size={15}/> Exportar CSV</button><a className="button button-outline" href="/operaciones/flujos"><Banknote size={15}/> Abrir Caja <ArrowUpRight size={14}/></a></div>
      </div>
      <div className="op-finance-cash-metrics">
        <article><span>Efectivo esperado en cajas abiertas</span><b>{cashExpectedInOpenSessions === null ? '—' : money(cashExpectedInOpenSessions)}</b><small>{openCashRows.length} sesiones abiertas · fuera del efectivo ya cerrado</small></article>
        <article><span>Cierres del periodo</span><b>{closedCashRows.length}</b><small>{cashSessionsWithDifference} con diferencia registrada</small></article>
        <article className="is-shortfall"><span>Faltante registrado</span><b>{money(cashShortfall)}</b><small>Suma de diferencias negativas, sin compensarlas con sobrantes</small></article>
        <article className="is-surplus"><span>Sobrante registrado</span><b>{money(cashSurplus)}</b><small>Suma de diferencias positivas del periodo</small></article>
      </div>
      {cashSessionError ? <p className="op-finance-cost-error" role="alert">{cashSessionError}</p> : cashSessionLoading ? <p className="muted">Cargando cierres y turnos abiertos…</p> : !cashReconciliationRows.length ? <div className="op-finance-cash-empty"><Banknote size={22}/><b>Sin cierres ni cajas abiertas para este filtro</b><span>Prueba otro mes o sucursal, o revisa los turnos en Caja.</span></div> : <div className="op-finance-table-wrap"><table className="op-finance-table op-finance-cash-table"><thead><tr><th>Estado</th><th>Apertura / cierre</th><th>Sucursal</th><th>Responsable</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead><tbody>{cashReconciliationRows.map((session) => <tr key={session.id}><td><span className={`op-finance-cash-status ${session.status === 'open' ? 'is-open' : 'is-closed'}`}>{session.status === 'open' ? 'Abierta' : 'Cerrada'}</span></td><td>{session.status === 'open' ? `Abierta ${timestamp(session.opened_at)}` : `Cerrada ${timestamp(session.closed_at)}`}</td><td>{branchName(session.branch_id)}</td><td>{personName(session.opened_by)}</td><td>{session.expected === null ? 'No disponible' : money(session.expected)}</td><td>{session.counted === null ? 'Pendiente' : money(session.counted)}</td><td className={session.difference < 0 ? 'is-negative' : session.difference > 0 ? 'is-positive' : ''}>{session.difference === null ? 'Pendiente' : money(session.difference)}</td></tr>)}</tbody></table></div>}
      {cashMovementError && <p className="op-finance-cost-error" role="alert">No se pudieron cargar todos los movimientos de las cajas abiertas; se oculta su esperado para evitar mostrar un importe incompleto. {cashMovementError}</p>}
      <p className="op-finance-cost-note">El esperado en una caja abierta se calcula con efectivo inicial + pagos POS en efectivo + entradas y salidas manuales registradas. La diferencia es contado menos esperado. Este informe no vuelve a sumar los cobros ni los reembolsos en los KPIs de ingresos.</p>
    </section>}
    {canSeeInventoryCosts && <section className="panel op-finance-cost-panel" aria-labelledby="op-finance-cost-title">
      <div className="panel-heading"><div><span className="eyebrow">INVENTARIO → POS → FINANZAS</span><h2 id="op-finance-cost-title">Costo de inventario capturado en ventas</h2></div></div>
      {inventoryCostError ? <p className="op-finance-cost-error" role="alert">{inventoryCostError}</p> : inventoryCostLoading ? <p className="muted">Calculando referencia de costos para este periodo…</p> : inventoryCostSummary ? <div className="op-finance-cost-metrics op-finance-return-cost-metrics">
        <article><span>Costo neto de artículos vendidos</span><b>{money(Number(inventoryCostSummary.cost_total || 0))}</b><small>Descuenta las unidades devueltas que reingresaron al stock</small></article>
        <article><span>Costo restituido por devoluciones</span><b>{money(Number(inventoryCostSummary.restocked_return_cost || 0))}</b><small>{Number(inventoryCostSummary.restocked_return_units || 0)} unidades registradas como reingresadas a inventario</small></article>
        <article><span>Cobertura de costo en líneas de inventario</span><b>{Number(inventoryCostSummary.inventory_lines || 0) + Number(inventoryCostSummary.missing_inventory_cost_lines || 0) > 0 ? `${Math.round(Number(inventoryCostSummary.inventory_lines || 0) / (Number(inventoryCostSummary.inventory_lines || 0) + Number(inventoryCostSummary.missing_inventory_cost_lines || 0)) * 100)}%` : '—'}</b><small>{inventoryCostSummary.inventory_lines || 0} con costo · {inventoryCostSummary.missing_inventory_cost_lines || 0} sin costo configurado</small></article>
      </div> : <p className="muted">Aún no hay datos de costo para este periodo.</p>}
      <p className="op-finance-cost-note">Se agrupa por fecha de venta y descuenta devoluciones con destino «Reintegrar como vendible». «Separar para revisión» y «Registrar como merma» conservan el costo de la venta. Es una referencia operativa, no utilidad contable; excluye servicios y costos indirectos.</p>
    </section>}
    {canSeeInventoryCosts && <section className="panel op-finance-cost-panel" aria-labelledby="op-finance-catalog-cost-title">
      <div className="panel-heading op-finance-catalog-cost-heading"><div><span className="eyebrow">INVENTARIO → FINANZAS · CATÁLOGO ACTUAL</span><h2 id="op-finance-catalog-cost-title">Variantes activas sin costo unitario</h2></div><div className="op-finance-cost-actions"><button className="button button-outline" onClick={() => setInventoryCatalogCostRefreshKey((key) => key + 1)} disabled={inventoryCatalogCostLoading}><RefreshCw className={inventoryCatalogCostLoading ? 'spin' : ''} size={15}/> Actualizar</button><a className="button button-outline" href="/operaciones/inventario">Revisar en Inventario <ArrowUpRight size={15}/></a><button className="button button-outline" onClick={downloadMissingInventoryCostsCsv} disabled={!inventoryCatalogCostSummary?.missing_variants.length}><Download size={15}/> Exportar pendientes</button></div></div>
      <p className="op-finance-cost-note">Este control es global para las variantes activas del catálogo y no cambia con los filtros de mes, asesora o sucursal. Configurar un costo mejora las próximas capturas; no modifica los snapshots de ventas pasadas.</p>
      {inventoryCatalogCostError ? <p className="op-finance-cost-error" role="alert">{inventoryCatalogCostError}</p> : inventoryCatalogCostLoading ? <p className="muted">Revisando costos unitarios del catálogo activo…</p> : inventoryCatalogCostSummary ? <>
        <div className="op-finance-cost-metrics op-finance-catalog-cost-metrics">
          <article><span>Variantes activas</span><b>{inventoryCatalogCostSummary.active_variants}</b><small>Productos vigentes en Inventario</small></article>
          <article><span>Con costo configurado</span><b>{inventoryCatalogCostSummary.configured_variants}</b><small>Costos privados gestionados desde Inventario</small></article>
          <article><span>Sin costo configurado</span><b>{inventoryCatalogCostSummary.missing_variants.length}</b><small>Requieren revisión de costo unitario</small></article>
          <article><span>Cobertura del catálogo</span><b>{inventoryCatalogCostSummary.active_variants ? `${Math.round(inventoryCatalogCostSummary.configured_variants / inventoryCatalogCostSummary.active_variants * 100)}%` : '—'}</b><small>Variantes activas con costo registrado</small></article>
        </div>
        {inventoryCatalogCostSummary.missing_variants.length ? <>
          <div className="op-finance-table-wrap"><table className="op-finance-table"><thead><tr><th>Producto</th><th>SKU de producto</th><th>Variante</th><th>SKU de variante</th></tr></thead><tbody>{inventoryCatalogCostSummary.missing_variants.slice(0, 12).map((variant) => <tr key={variant.id}><td>{variant.inventory_item?.name || 'Producto sin nombre'}</td><td>{variant.inventory_item?.sku || '—'}</td><td>{variant.label || 'Variante general'}</td><td>{variant.sku}</td></tr>)}</tbody></table></div>
          {inventoryCatalogCostSummary.missing_variants.length > 12 && <p className="op-finance-cost-note">Se muestran las primeras 12 variantes por SKU; el CSV exporta las {inventoryCatalogCostSummary.missing_variants.length} pendientes.</p>}
        </> : <p className="op-finance-cost-note">Todas las variantes activas tienen un costo unitario configurado.</p>}
      </> : <p className="muted">No se pudo preparar el resumen de costos del catálogo.</p>}
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
