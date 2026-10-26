import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, CalendarClock, ChartNoAxesCombined, Check, CircleDollarSign, Clock3, Download, Plus, ReceiptText, ShieldCheck, Truck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const money = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
const dayDistance = (value: string, todayValue = today()) => {
  const [year, month, day] = value.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayValue.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000);
};
const addCalendarDays = (value: string, days: number) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
const businessMonth = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit' }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
};
const previousCalendarMonth = (value: string) => {
  if (!/^\d{4}-\d{2}$/.test(value)) return '';
  const [year, month] = value.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
};
const categories = ['Compras e insumos', 'Arriendo', 'Internet y telefonía', 'Servicios básicos', 'Transporte', 'Mantenimiento', 'Marketing', 'Honorarios', 'Otros'];
const methods = [['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['card', 'Tarjeta'], ['cheque', 'Cheque'], ['other', 'Otro']];
const FINANCE_PAGE_SIZE = 500;

async function readAllFinanceRows(createQuery: () => any) {
  const rows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await createQuery().range(from, from + FINANCE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < FINANCE_PAGE_SIZE) return rows;
    from += FINANCE_PAGE_SIZE;
  }
}

type Expense = { id: string; description: string; category: string; status: string; document_date: string; due_date: string | null; total: number; paid_total: number; branch_id: string | null; supplier_id: string | null; purchase_order_id: string | null; receipt_id: string | null; reference: string };
type FinanceBudget = { id: string; period_start: string; category: string; branch_id: string | null; budget_amount: number; note: string };
type TeamMember = { user_id: string; full_name: string; email: string; role: string; active: boolean };
type PersonnelOption = { personnel_id: string; full_name: string; department: string; job_title: string };
const payrollMonthLabel = (value: string) => new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString('es-EC', { year: 'numeric', month: 'long' });

export function OperationsFinanceControls({ month, branch, realtimeRefreshKey = 0 }: { month: string; branch: string; realtimeRefreshKey?: number }) {
  const { organizationId, roles } = useAuth();
  const canManage = roles.some((role: string) => ['owner', 'admin', 'manager'].includes(role));
  const canSeeDeductions = roles.some((role: string) => ['owner', 'admin'].includes(role));
  const [section, setSection] = useState('egresos');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudget[]>([]);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [budgetsError, setBudgetsError] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [recurringOccurrences, setRecurringOccurrences] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderLines, setOrderLines] = useState<any[]>([]);
  const [purchaseCommitmentsError, setPurchaseCommitmentsError] = useState('');
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptForms, setReceiptForms] = useState<Record<string, { total: string; due: string; document: string }>>({});
  const [orderReferenceTotals, setOrderReferenceTotals] = useState<Record<string, number>>({});
  const [expensePayments, setExpensePayments] = useState<any[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [personnelOptions, setPersonnelOptions] = useState<PersonnelOption[]>([]);
  const [personnelOptionsError, setPersonnelOptionsError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', category: categories[0], total: '', paid: '', due: '', branch: '', supplier: '', order: '', method: 'transfer', reference: '', documentReference: '', note: '' });
  const [paymentForms, setPaymentForms] = useState<Record<string, { amount: string; method: string }>>({});
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState('all');
  const [templateForm, setTemplateForm] = useState({ description: '', category: 'Servicios básicos', amount: '', cadence: 'monthly', due: today(), branch: '', supplier: '', note: '' });
  const [deductionForm, setDeductionForm] = useState({ employee: '', description: '', amount: '', period: today().slice(0, 7), authorization: '', evidence: '' });
  const [reviewRefs, setReviewRefs] = useState<Record<string, { authorization: string; evidence: string }>>({});
  const [payrollDeliveryRefs, setPayrollDeliveryRefs] = useState<Record<string, string>>({});
  const [budgetForm, setBudgetForm] = useState({ category: categories[0], branch: '', amount: '', note: '' });

  const refresh = async () => {
    if (!supabase || !organizationId || !canManage) return;
    setError('');
    setPurchaseCommitmentsError('');
    let expenseRows: Expense[];
    let templateRows: any[];
    let recurringOccurrenceRows: any[];
    let deductionRows: any[];
    let paymentRows: any[];
    const [branchResult, teamResult, supplierResult, orderResult, personnelResult] = await Promise.all([
      supabase.from('branches').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.rpc('list_visualcorp_team_members'),
      supabase.from('suppliers').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
      readAllFinanceRows(() => supabase.from('purchase_orders').select('id,order_number,status,supplier_id,branch_id,expected_date').eq('organization_id', organizationId).not('status', 'eq', 'cancelled').order('created_at', { ascending: false }).order('id')).then((data) => ({ data, error: null }), (error) => ({ data: null, error })),
      canSeeDeductions ? supabase.rpc('list_visualcorp_finance_personnel_options') : Promise.resolve({ data: [], error: null }),
    ]);
    if (branchResult.error || supplierResult.error || orderResult.error) {
      if (orderResult.error) setPurchaseCommitmentsError('No se pudieron cargar las órdenes de compra abiertas. Revisa la conexión de Compras.');
      setError(branchResult.error?.message || supplierResult.error?.message || orderResult.error?.message || 'No se pudieron cargar las áreas conectadas.');
      return;
    }
    try {
      const forecastStart = today();
      const forecastEnd = addCalendarDays(forecastStart, 29);
      [expenseRows, templateRows, recurringOccurrenceRows, deductionRows, paymentRows] = await Promise.all([
        readAllFinanceRows(() => supabase.from('finance_expenses').select('id,description,category,status,document_date,due_date,total,paid_total,branch_id,supplier_id,purchase_order_id,receipt_id,reference').eq('organization_id', organizationId).order('document_date', { ascending: false }).order('id')),
        readAllFinanceRows(() => supabase.from('finance_recurring_templates').select('id,description,category,expected_amount,cadence,next_due_date,cadence_anchor_day,branch_id,supplier_id,active').eq('organization_id', organizationId).order('next_due_date').order('id')),
        readAllFinanceRows(() => supabase.from('finance_recurring_occurrences').select('template_id,due_date').eq('organization_id', organizationId).gte('due_date', forecastStart).lte('due_date', forecastEnd).order('due_date').order('id')),
        canSeeDeductions
          ? readAllFinanceRows(() => supabase.from('finance_payroll_deductions').select('id,personnel_id,employee_user_id,description,amount,payroll_period,status,authorization_reference,evidence_reference,payroll_handoff_reference,payroll_handed_at,payroll_handed_by,created_at').eq('organization_id', organizationId).order('payroll_period', { ascending: false }).order('id'))
          : Promise.resolve([]),
        readAllFinanceRows(() => supabase.from('finance_expense_payments').select('id,expense_id,amount,method,reference,paid_at').eq('organization_id', organizationId).order('paid_at', { ascending: false }).order('id')),
      ]);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudo cargar el historial financiero completo.');
      return;
    }
    setExpenses(expenseRows);
    setTemplates(templateRows);
    setRecurringOccurrences(recurringOccurrenceRows);
    setBranches(branchResult.data || []);
    setSuppliers(supplierResult.data || []);
    setOrders(orderResult.data || []);
    setPersonnelOptions(personnelResult.error ? [] : (personnelResult.data || []) as PersonnelOption[]);
    setPersonnelOptionsError(personnelResult.error?.message || '');
    try {
      const orderLines = await readAllFinanceRows(() => supabase.from('purchase_order_lines').select('id,purchase_order_id,quantity_ordered,quantity_received,unit_cost').eq('organization_id', organizationId).order('purchase_order_id').order('id'));
      setOrderLines(orderLines);
      const totals = orderLines.reduce((result: Record<string, number>, line: any) => {
        result[line.purchase_order_id] = (result[line.purchase_order_id] || 0) + Number(line.quantity_ordered) * Number(line.unit_cost);
        return result;
      }, {});
      setOrderReferenceTotals(totals);
    } catch {
      setOrderLines([]);
      setOrderReferenceTotals({});
      setPurchaseCommitmentsError('No se pudieron calcular los compromisos de compra pendientes. Revisa la conexión de Compras.');
      setError('No se pudieron calcular los valores de referencia de Compras. Puedes registrar el egreso, pero confirma el importe con la factura.');
    }
    try {
      const receiptRows = await readAllFinanceRows(() => supabase.from('purchase_receipts').select('id,purchase_order_id,reference,note,received_at').eq('organization_id', organizationId).order('received_at', { ascending: false }));
      const receiptIds = receiptRows.map((receipt: any) => receipt.id);
      if (!receiptIds.length) setReceipts([]);
      else {
        const [receiptLineRows, allOrderLines] = await Promise.all([
          readAllFinanceRows(() => supabase.from('purchase_receipt_lines').select('receipt_id,purchase_order_line_id,quantity_received').eq('organization_id', organizationId).in('receipt_id', receiptIds).order('receipt_id').order('id')),
          readAllFinanceRows(() => supabase.from('purchase_order_lines').select('id,purchase_order_id,unit_cost').eq('organization_id', organizationId).order('purchase_order_id').order('id')),
        ]);
        const costByLine = new Map(allOrderLines.map((line: any) => [line.id, Number(line.unit_cost)]));
        const totalByReceipt = receiptLineRows.reduce((acc: Record<string, number>, line: any) => {
          acc[line.receipt_id] = (acc[line.receipt_id] || 0) + Number(line.quantity_received) * (costByLine.get(line.purchase_order_line_id) || 0);
          return acc;
        }, {});
        setReceipts(receiptRows.map((receipt: any) => ({ ...receipt, referenceTotal: totalByReceipt[receipt.id] || 0 })));
      }
    } catch (receiptError: any) {
      setReceipts([]);
      setError(receiptError?.message || 'No se pudieron cargar las recepciones de Compras.');
    }
    setExpensePayments(paymentRows);
    setTeam(teamResult.error ? [] : (teamResult.data || []));
    setDeductions(deductionRows);
  };

  useEffect(() => { void refresh(); }, [organizationId, canManage, canSeeDeductions, realtimeRefreshKey]);

  useEffect(() => {
    let active = true;
    if (!supabase || !organizationId || !canManage || !month) {
      setBudgets([]);
      setBudgetsError('');
      setBudgetsLoading(false);
      return () => { active = false; };
    }
    setBudgetsLoading(true);
    setBudgetsError('');
    setBudgets([]);
    let budgetQuery = supabase.from('finance_budgets')
      .select('id,period_start,category,branch_id,budget_amount,note')
      .eq('organization_id', organizationId)
      .eq('period_start', `${month}-01`);
    if (branch !== 'all') budgetQuery = budgetQuery.eq('branch_id', branch);
    void budgetQuery.order('category').order('branch_id').then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          setBudgets([]);
          setBudgetsError(loadError.message || 'No se pudieron cargar los presupuestos del periodo.');
        } else setBudgets((data || []) as FinanceBudget[]);
        setBudgetsLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, canManage, month, branch, realtimeRefreshKey]);
  useEffect(() => {
    if (branch !== 'all') setBudgetForm((current) => ({ ...current, branch }));
  }, [branch]);

  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const supplierNames = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])), [suppliers]);
  const orderNames = useMemo(() => new Map(orders.map((order) => [order.id, order.order_number])), [orders]);
  const teamNames = useMemo(() => new Map(team.map((person) => [person.user_id, person.full_name || person.email || person.user_id.slice(0, 8)])), [team]);
  const personnelNames = useMemo(() => new Map(personnelOptions.map((person) => [person.personnel_id, person.full_name])), [personnelOptions]);
  const expensesById = useMemo(() => new Map(expenses.map((expense) => [expense.id, expense])), [expenses]);
  const isInSelectedBranch = (expense: Expense) => branch === 'all' || expense.branch_id === branch;
  const openPayables = expenses.filter((expense) => expense.status === 'payable' && isInSelectedBranch(expense));
  const dueNow = openPayables.filter((expense) => expense.due_date && expense.due_date < today()).reduce((total, expense) => total + Number(expense.total) - Number(expense.paid_total), 0);
  const payableTotal = openPayables.reduce((total, expense) => total + Number(expense.total) - Number(expense.paid_total), 0);
  const purchaseCommitments = useMemo(() => {
    const openOrders = new Map(orders
      .filter((order) => ['ordered', 'partially_received'].includes(order.status) && (branch === 'all' || order.branch_id === branch))
      .map((order) => [order.id, { ...order, amount: 0, remainingLines: 0 }]));
    orderLines.forEach((line) => {
      const order = openOrders.get(line.purchase_order_id);
      if (!order) return;
      const remaining = Math.max(0, Number(line.quantity_ordered) - Number(line.quantity_received));
      if (!remaining) return;
      order.amount += remaining * Number(line.unit_cost);
      order.remainingLines += 1;
    });
    const rows = [...openOrders.values()].filter((order) => order.remainingLines > 0);
    rows.sort((a, b) => (a.expected_date || '9999-12-31').localeCompare(b.expected_date || '9999-12-31') || a.order_number.localeCompare(b.order_number, 'es-EC'));
    const summary = rows.reduce((totals, order) => {
      if (!order.expected_date) {
        totals.withoutDate += order.amount;
        totals.withoutDateCount += 1;
      } else {
        const distance = dayDistance(order.expected_date);
        if (distance < 0) {
          totals.overdue += order.amount;
          totals.overdueCount += 1;
        } else if (distance < 7) {
          totals.next7Days += order.amount;
          totals.next7DaysCount += 1;
        } else if (distance < 30) {
          totals.days8to30 += order.amount;
          totals.days8to30Count += 1;
        }
      }
      return totals;
    }, { overdue: 0, overdueCount: 0, next7Days: 0, next7DaysCount: 0, days8to30: 0, days8to30Count: 0, withoutDate: 0, withoutDateCount: 0 });
    return { rows, total: rows.reduce((sum, order) => sum + order.amount, 0), ...summary };
  }, [orders, orderLines, branch]);
  const payableAging = useMemo(() => {
    const todayValue = today();
    const overdue: Array<Expense & { balance: number; days_overdue: number }> = [];
    const withoutDueDate: Array<Expense & { balance: number }> = [];
    expenses.filter((expense) => expense.status === 'payable' && isInSelectedBranch(expense)).forEach((expense) => {
      const balance = Number(expense.total) - Number(expense.paid_total);
      if (balance <= 0) return;
      if (!expense.due_date) {
        withoutDueDate.push({ ...expense, balance });
        return;
      }
      const daysOverdue = -dayDistance(expense.due_date, todayValue);
      if (daysOverdue > 0) overdue.push({ ...expense, balance, days_overdue: daysOverdue });
    });
    overdue.sort((a, b) => b.days_overdue - a.days_overdue || b.balance - a.balance);
    const buckets = [
      { label: '1–30 días', min: 1, max: 30 },
      { label: '31–60 días', min: 31, max: 60 },
      { label: '61 días o más', min: 61, max: Infinity },
    ].map((bucket) => {
      const rows = overdue.filter((expense) => expense.days_overdue >= bucket.min && expense.days_overdue <= bucket.max);
      return { ...bucket, rows, amount: rows.reduce((total, expense) => total + expense.balance, 0) };
    });
    return {
      overdue,
      buckets,
      withoutDueDate,
      withoutDueDateAmount: withoutDueDate.reduce((total, expense) => total + expense.balance, 0),
    };
  }, [expenses, branch]);
  const upcomingObligations = useMemo(() => {
    const generatedOccurrences = new Set(recurringOccurrences.map((item) => `${item.template_id}:${item.due_date}`));
    const dueItems = expenses.flatMap((expense) => {
      const balance = Number(expense.total) - Number(expense.paid_total);
      const distance = expense.due_date ? dayDistance(expense.due_date) : -1;
      if (expense.status !== 'payable' || balance <= 0 || distance < 0 || distance >= 30 || !isInSelectedBranch(expense)) return [];
      return [{ id: `expense:${expense.id}`, source: 'payable' as const, date: expense.due_date!, description: expense.description, category: expense.category, branch_id: expense.branch_id, amount: balance, distance }];
    });
    const recurringItems = templates.flatMap((template) => {
      const distance = dayDistance(template.next_due_date);
      const alreadyGenerated = generatedOccurrences.has(`${template.id}:${template.next_due_date}`);
      if (!template.active || alreadyGenerated || distance < 0 || distance >= 30 || (branch !== 'all' && template.branch_id !== branch)) return [];
      return [{ id: `recurring:${template.id}:${template.next_due_date}`, source: 'recurring' as const, date: template.next_due_date, description: template.description, category: template.category, branch_id: template.branch_id, amount: Number(template.expected_amount || 0), distance, template }];
    });
    return [...dueItems, ...recurringItems].sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description, 'es-EC'));
  }, [expenses, templates, recurringOccurrences, branch]);
  const upcoming7DaysTotal = upcomingObligations.filter((item) => item.distance < 7).reduce((total, item) => total + item.amount, 0);
  const upcoming30DaysTotal = upcomingObligations.reduce((total, item) => total + item.amount, 0);
  const expensePaymentsInScope = expensePayments.filter((payment) => {
    const expense = expensesById.get(payment.expense_id);
    return payment.paid_at
      && (!month || businessMonth(payment.paid_at) === month)
      && expense
      && isInSelectedBranch(expense);
  });
  const paidInPeriod = expensePaymentsInScope.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const budgetReport = useMemo(() => {
    const reportExpenses = expenses.filter((expense) => Boolean(month)
      && expense.status !== 'void'
      && expense.document_date.slice(0, 7) === month
      && (branch === 'all' || expense.branch_id === branch));
    const amountByKey = new Map<string, { category: string; branch_id: string | null; amount: number; count: number }>();
    reportExpenses.forEach((expense) => {
      const key = JSON.stringify([expense.branch_id, expense.category]);
      const row = amountByKey.get(key) || { category: expense.category, branch_id: expense.branch_id, amount: 0, count: 0 };
      row.amount += Number(expense.total || 0);
      row.count += 1;
      amountByKey.set(key, row);
    });
    const scopedBudgets = budgets.filter((budget) => branch === 'all' || budget.branch_id === branch);
    const coveredKeys = new Set(scopedBudgets.map((budget) => JSON.stringify([budget.branch_id, budget.category])));
    const rows = scopedBudgets.map((budget) => {
      const actual = amountByKey.get(JSON.stringify([budget.branch_id, budget.category]));
      return { ...budget, actual: actual?.amount || 0, expenseCount: actual?.count || 0 };
    }).sort((a, b) => a.category.localeCompare(b.category, 'es-EC') || (a.branch_id || '').localeCompare(b.branch_id || ''));
    const unbudgetedRows = [...amountByKey.entries()]
      .filter(([key]) => !coveredKeys.has(key))
      .map(([, row]) => row)
      .sort((a, b) => b.amount - a.amount);
    const totalBudget = scopedBudgets.reduce((sum, budget) => sum + Number(budget.budget_amount || 0), 0);
    const totalActual = reportExpenses.reduce((sum, expense) => sum + Number(expense.total || 0), 0);
    return {
      rows,
      unbudgetedRows,
      totalBudget,
      totalActual,
      variance: totalBudget - totalActual,
      unbudgetedTotal: unbudgetedRows.reduce((sum, row) => sum + row.amount, 0),
    };
  }, [expenses, budgets, month, branch]);
  const supplierReport = useMemo(() => {
    const reportExpenses = expenses.filter((expense) => Boolean(month)
      && expense.status !== 'void'
      && expense.document_date.slice(0, 7) === month
      && (branch === 'all' || expense.branch_id === branch));
    const previousMonth = previousCalendarMonth(month);
    const previousExpenses = expenses.filter((expense) => Boolean(previousMonth)
      && expense.status !== 'void'
      && expense.document_date.slice(0, 7) === previousMonth
      && (branch === 'all' || expense.branch_id === branch));
    const previousTotalBySupplier = new Map<string, number>();
    previousExpenses.forEach((expense) => {
      if (!expense.supplier_id) return;
      previousTotalBySupplier.set(expense.supplier_id, (previousTotalBySupplier.get(expense.supplier_id) || 0) + Number(expense.total || 0));
    });
    const bySupplier = new Map<string, {
      id: string;
      name: string;
      documents: number;
      total: number;
      paidToDate: number;
      balance: number;
      overdueBalance: number;
      orderIds: Set<string>;
    }>();
    reportExpenses.forEach((expense) => {
      if (!expense.supplier_id) return;
      const id = expense.supplier_id;
      const row = bySupplier.get(id) || {
        id,
        name: supplierNames.get(id) || 'Proveedor',
        documents: 0,
        total: 0,
        paidToDate: 0,
        balance: 0,
        overdueBalance: 0,
        orderIds: new Set<string>(),
      };
      const total = Number(expense.total || 0);
      const paidToDate = Number(expense.paid_total || 0);
      const balance = Math.max(0, total - paidToDate);
      row.documents += 1;
      row.total += total;
      row.paidToDate += paidToDate;
      row.balance += balance;
      if (expense.status === 'payable' && expense.due_date && expense.due_date < today()) row.overdueBalance += balance;
      if (expense.purchase_order_id) row.orderIds.add(expense.purchase_order_id);
      bySupplier.set(id, row);
    });
    const rows = [...bySupplier.values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es-EC'))
      .map(({ orderIds, ...row }) => {
        const previousTotal = previousTotalBySupplier.get(row.id) || 0;
        return {
          ...row,
          purchaseOrders: orderIds.size,
          previousTotal,
          periodChange: row.total - previousTotal,
          periodChangePercent: previousTotal > 0 ? (row.total - previousTotal) / previousTotal * 100 : null,
        };
      });
    const totalDocumented = reportExpenses.reduce((sum, expense) => sum + Number(expense.total || 0), 0);
    const previousTotalDocumented = previousExpenses.reduce((sum, expense) => sum + Number(expense.total || 0), 0);
    const totalLinked = reportExpenses.filter((expense) => expense.supplier_id).reduce((sum, expense) => sum + Number(expense.total || 0), 0);
    return {
      rows,
      totalDocumented,
      previousTotalDocumented,
      totalPeriodChange: totalDocumented - previousTotalDocumented,
      totalPeriodChangePercent: previousTotalDocumented > 0 ? (totalDocumented - previousTotalDocumented) / previousTotalDocumented * 100 : null,
      unlinkedTotal: totalDocumented - totalLinked,
      balance: rows.reduce((sum, row) => sum + row.balance, 0),
      overdue: rows.reduce((sum, row) => sum + row.overdueBalance, 0),
      documentCount: reportExpenses.length,
    };
  }, [expenses, month, branch, supplierNames]);
  const visibleExpenses = useMemo(() => {
    const term = expenseSearch.trim().toLocaleLowerCase('es-EC');
    return expenses.filter((expense) => {
      const balance = Number(expense.total) - Number(expense.paid_total);
      const isOverdue = balance > 0 && Boolean(expense.due_date) && expense.due_date < today();
      const matchesStatus = expenseStatusFilter === 'all'
        || (expenseStatusFilter === 'open' && balance > 0)
        || (expenseStatusFilter === 'overdue' && isOverdue)
        || (expenseStatusFilter === 'paid' && balance <= 0);
      const searchable = [expense.description, expense.category, expense.reference, branchNames.get(expense.branch_id), supplierNames.get(expense.supplier_id), orderNames.get(expense.purchase_order_id)]
        .filter(Boolean).join(' ').toLocaleLowerCase('es-EC');
      return isInSelectedBranch(expense) && matchesStatus && (!term || searchable.includes(term));
    });
  }, [expenses, expenseSearch, expenseStatusFilter, branch, branchNames, supplierNames, orderNames]);
  const visibleTemplates = templates.filter((item) => item.active && (branch === 'all' || item.branch_id === branch));
  const visibleDeductions = deductions.filter((item) => !month || String(item.payroll_period || '').slice(0, 7) === month);
  const deductionPersonName = (item: any) => (item.personnel_id && personnelNames.get(item.personnel_id)) || teamNames.get(item.employee_user_id) || 'Integrante del equipo';
  const authorizedDeductions = visibleDeductions.filter((item) => item.status === 'authorized');
  const sentDeductions = visibleDeductions.filter((item) => item.status === 'sent_to_payroll');
  const deductionStatusSummary = visibleDeductions.reduce((summary, item) => {
    if (item.status === 'pending_authorization') summary.pending += Number(item.amount || 0);
    else if (item.status === 'authorized') summary.authorized += Number(item.amount || 0);
    else if (item.status === 'sent_to_payroll') summary.sent += Number(item.amount || 0);
    else if (item.status === 'applied_externally') summary.applied += Number(item.amount || 0);
    return summary;
  }, { pending: 0, authorized: 0, sent: 0, applied: 0 });

  const downloadAuthorizedDeductionsCsv = () => {
    if (!authorizedDeductions.length) return;
    const rows = [
      ['Persona', 'ID de ficha', 'Periodo de nómina', 'Motivo', 'Monto USD', 'Referencia de autorización', 'Referencia de evidencia', 'Estado'],
      ...authorizedDeductions.map((item) => [
        deductionPersonName(item), item.personnel_id || '', payrollMonthLabel(item.payroll_period), item.description,
        Number(item.amount || 0).toFixed(2), item.authorization_reference, item.evidence_reference,
        'Autorizada · pendiente de procesamiento externo',
      ]),
    ];
    const escape = (value: unknown) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `deducciones-nomina-${month || 'todos-los-periodos'}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const createReceiptPayable = async (receipt: any) => {
    const form = receiptForms[receipt.id] || { total: String(Number(receipt.referenceTotal).toFixed(2)), due: '', document: '' };
    if (!Number(form.total) || Number(form.total) <= 0) { setError('Confirma el importe real de la factura antes de crear la cuenta por pagar.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: payableError } = await supabase.rpc('record_finance_receipt_payable', { p_receipt_id: receipt.id, p_total: Number(form.total), p_document_reference: form.document.trim(), p_due_date: form.due || null });
      if (payableError) throw payableError;
      setNotice(data?.already_created ? 'Esta recepción ya tiene una cuenta por pagar vinculada; no se duplicó.' : 'Cuenta por pagar creada con el importe confirmado. No se registró ningún pago.');
      await refresh();
    } catch (payableError: any) { setError(payableError.message || 'No se pudo crear la cuenta por pagar desde la recepción.'); }
    finally { setBusy(false); }
  };

  const saveExpense = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { error: saveError } = await supabase.rpc('record_finance_expense', {
        p_description: expenseForm.description.trim(), p_category: expenseForm.category, p_total: Number(expenseForm.total),
        p_due_date: expenseForm.due || null, p_branch_id: expenseForm.branch || null,
        p_supplier_id: expenseForm.supplier || null, p_purchase_order_id: expenseForm.order || null,
        p_paid_now: Number(expenseForm.paid || 0), p_method: expenseForm.method,
        p_reference: expenseForm.reference.trim(), p_note: expenseForm.note.trim(), p_document_reference: expenseForm.documentReference.trim(),
      });
      if (saveError) throw saveError;
      setExpenseForm({ ...expenseForm, description: '', total: '', paid: '', due: '', reference: '', documentReference: '', note: '' });
      setNotice('Egreso guardado. El saldo pendiente y el pago inicial quedaron separados.'); await refresh();
    } catch (saveError: any) { setError(saveError.message || 'No se pudo guardar el egreso.'); }
    finally { setBusy(false); }
  };

  const registerPayment = async (event: FormEvent, expense: Expense) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const form = paymentForms[expense.id] || { amount: '', method: 'transfer' };
    try {
      const { error: payError } = await supabase.rpc('record_finance_expense_payment', { p_expense_id: expense.id, p_amount: Number(form.amount), p_method: form.method, p_reference: '' });
      if (payError) throw payError;
      setNotice('Pago agregado al compromiso y saldo actualizado.'); setPaymentForms({ ...paymentForms, [expense.id]: { ...form, amount: '' } }); await refresh();
    } catch (payError: any) { setError(payError.message || 'No se pudo registrar el pago.'); }
    finally { setBusy(false); }
  };

  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('finance_recurring_templates').insert({ organization_id: organizationId, description: templateForm.description.trim(), category: templateForm.category, expected_amount: Number(templateForm.amount), cadence: templateForm.cadence, next_due_date: templateForm.due, cadence_anchor_day: Number(templateForm.due.slice(-2)), branch_id: templateForm.branch || null, supplier_id: templateForm.supplier || null, note: templateForm.note.trim() });
    if (saveError) setError(saveError.message); else { setNotice('Pago periódico guardado con su sucursal y proveedor; cada vencimiento se confirma manualmente.'); setTemplateForm({ ...templateForm, description: '', amount: '', branch: '', supplier: '', note: '' }); await refresh(); }
    setBusy(false);
  };

  const saveBudget = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !organizationId || !month) return;
    if (branch !== 'all' && budgetForm.branch !== branch) {
      setError('Elige la sucursal seleccionada para guardar este presupuesto. Usa todas las sucursales para editar un presupuesto general.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: saveError } = await supabase.from('finance_budgets').upsert({
        organization_id: organizationId,
        period_start: `${month}-01`,
        category: budgetForm.category,
        branch_id: budgetForm.branch || null,
        budget_amount: Number(budgetForm.amount),
        note: budgetForm.note.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,period_start,category,branch_id' })
        .select('id,period_start,category,branch_id,budget_amount,note')
        .single();
      if (saveError) throw saveError;
      setBudgets((current) => [...current.filter((item) => item.id !== data.id
        && !(item.period_start === data.period_start && item.category === data.category && item.branch_id === data.branch_id)), data as FinanceBudget]
        .sort((a, b) => a.category.localeCompare(b.category, 'es-EC')));
      setNotice(`Presupuesto de ${budgetForm.category} guardado para ${payrollMonthLabel(`${month}-01`)}.`);
      setBudgetForm({ ...budgetForm, amount: '', note: '' });
    } catch (saveError: any) {
      setError(saveError.message || 'No se pudo guardar el presupuesto.');
    } finally { setBusy(false); }
  };

  const downloadBudgetComparisonCsv = () => {
    const rows = [
      ['Mes', 'Sucursal', 'Categoría', 'Presupuesto USD', 'Egreso registrado USD', 'Disponible / exceso USD', 'Nota'],
      ...budgetReport.rows.map((item) => [
        month,
        item.branch_id ? branchNames.get(item.branch_id) || 'Sucursal' : 'General / sin sucursal',
        item.category,
        Number(item.budget_amount),
        item.actual,
        Number(item.budget_amount) - item.actual,
        item.note || '',
      ]),
      ...budgetReport.unbudgetedRows.map((item) => [
        month,
        item.branch_id ? branchNames.get(item.branch_id) || 'Sucursal' : 'General / sin sucursal',
        item.category,
        '',
        item.amount,
        '',
        'Egreso sin presupuesto asignado',
      ]),
    ];
    const escape = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const blob = new Blob(['\ufeff', rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `presupuesto-egresos-${month || 'sin-periodo'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const generateRecurringExpense = async (template: any) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: generateError } = await supabase.rpc('record_finance_recurring_expense', { p_template_id: template.id, p_due_date: template.next_due_date });
      if (generateError) throw generateError;
      setNotice(data?.already_created
        ? 'Este vencimiento ya estaba vinculado a su cuenta por pagar; no se duplicó.'
        : `Cuenta por pagar creada por ${money(template.expected_amount)}. No se ha registrado ningún pago.`);
      setSection('egresos');
      await refresh();
    } catch (generateError: any) {
      setError(generateError.message || 'No se pudo generar la cuenta por pagar.');
    } finally { setBusy(false); }
  };

  const saveDeduction = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('finance_payroll_deductions').insert({ organization_id: organizationId, personnel_id: deductionForm.employee, description: deductionForm.description.trim(), amount: Number(deductionForm.amount), payroll_period: `${deductionForm.period}-01`, authorization_reference: deductionForm.authorization.trim(), evidence_reference: deductionForm.evidence.trim(), status: 'pending_authorization' });
    if (saveError) setError(saveError.message); else { setNotice('Deducción registrada como pendiente; aún no modifica ni procesa la nómina.'); setDeductionForm({ ...deductionForm, description: '', amount: '', authorization: '', evidence: '' }); await refresh(); }
    setBusy(false);
  };

  const updateDeductionStatus = async (item: any, status: string) => {
    setBusy(true); setError(''); setNotice('');
    const refs = reviewRefs[item.id] || { authorization: item.authorization_reference || '', evidence: item.evidence_reference || '' };
    const deliveryReference = (payrollDeliveryRefs[item.id] || item.payroll_handoff_reference || '').trim();
    const update = status === 'sent_to_payroll'
      ? { status, payroll_handoff_reference: deliveryReference }
      : { status, authorization_reference: refs.authorization.trim(), evidence_reference: refs.evidence.trim() };
    const { error: updateError } = await supabase.from('finance_payroll_deductions').update(update).eq('id', item.id);
    if (updateError) setError(updateError.message); else {
      setNotice(status === 'authorized'
        ? 'Autorización registrada; la solicitud aún no se ha entregado a nómina.'
        : status === 'sent_to_payroll'
          ? 'Entrega a nómina registrada con su referencia; la aplicación todavía debe confirmarse externamente.'
          : 'Aplicación externa registrada como referencia, sin integración de nómina.');
      if (status === 'sent_to_payroll') setPayrollDeliveryRefs({ ...payrollDeliveryRefs, [item.id]: '' });
      await refresh();
    }
    setBusy(false);
  };

  if (!canManage) return null;

  return <section className="op-finance-ledger">
    <header className="op-finance-ledger-heading"><div><span className="eyebrow">INGRESOS + EGRESOS + OBLIGACIONES</span><h2>Centro financiero</h2><p>Separa dinero recibido, pagos reales y saldos pendientes. Los pedidos de compra no se convierten automáticamente en egresos.</p></div></header>
    {(error || notice) && <div className={`op-finance-ledger-alert ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <nav className="op-finance-ledger-tabs" aria-label="Secciones financieras">
      <button className={section === 'egresos' ? 'active' : ''} onClick={() => setSection('egresos')}><ReceiptText size={16}/> Egresos y cuentas por pagar</button>
      <button className={section === 'budget' ? 'active' : ''} onClick={() => setSection('budget')}><ChartNoAxesCombined size={16}/> Presupuesto vs egresos</button>
      <button className={section === 'suppliers' ? 'active' : ''} onClick={() => setSection('suppliers')}><Truck size={16}/> Análisis por proveedor</button>
      <button className={section === 'recurring' ? 'active' : ''} onClick={() => setSection('recurring')}><CalendarClock size={16}/> Pagos periódicos</button>
      {canSeeDeductions && <button className={section === 'deductions' ? 'active' : ''} onClick={() => setSection('deductions')}><ShieldCheck size={16}/> Deducciones de remuneración</button>}
    </nav>
    {section === 'egresos' && <>
      <div className="op-finance-ledger-kpis">
        <article><span>Por pagar</span><b>{money(payableTotal)}</b><small>{openPayables.length} compromisos abiertos</small></article>
        <article className="is-overdue"><span>Vencido</span><b>{money(dueNow)}</b><small>Con fecha de vencimiento anterior a hoy</small></article>
        <article><span>Pagado en el periodo</span><b>{money(paidInPeriod)}</b><small>Pagos efectivos del mes y la sucursal seleccionados</small></article>
      </div>
      <p className="op-finance-cost-note">Los saldos por pagar y vencidos muestran el estado actual de {branch === 'all' ? 'todas las sucursales y gastos generales' : 'la sucursal seleccionada'}; el mes solo filtra pagos realizados. Usa «Todas las sucursales» para revisar los gastos generales.</p>
      <section className="panel op-finance-aging-panel" aria-labelledby="op-finance-aging-title">
        <div className="panel-heading"><div><span className="eyebrow">COMPRAS → FINANZAS · CONTROL DE VENCIMIENTOS</span><h3 id="op-finance-aging-title">Antigüedad de cuentas por pagar</h3><p className="muted">Tramos calculados desde la fecha de vencimiento hasta hoy, sobre el saldo pendiente y la sucursal seleccionada.</p></div><Clock3 size={19}/></div>
        <div className="op-finance-aging-metrics">{payableAging.buckets.map((bucket) => <article key={bucket.label}><span>{bucket.label}</span><b>{money(bucket.amount)}</b><small>{bucket.rows.length} cuentas</small></article>)}<article className={payableAging.withoutDueDate.length ? 'is-missing-date' : ''}><span>Sin fecha de vencimiento</span><b>{money(payableAging.withoutDueDateAmount)}</b><small>{payableAging.withoutDueDate.length} cuentas abiertas</small></article></div>
        {payableAging.overdue.length ? <>
          <div className="op-finance-table-wrap"><table className="op-finance-table op-finance-aging-table"><thead><tr><th>Egreso / proveedor</th><th>Vencía</th><th>Días vencido</th><th>Saldo</th></tr></thead><tbody>{payableAging.overdue.slice(0, 8).map((expense) => <tr key={expense.id}><td><b>{expense.description}</b><small>{supplierNames.get(expense.supplier_id) || 'Sin proveedor'} · {expense.category}{expense.reference ? ` · ${expense.reference}` : ''}</small></td><td>{new Date(`${expense.due_date}T12:00:00`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short', year: 'numeric' })}</td><td><span className="op-finance-aging-days">{expense.days_overdue} {expense.days_overdue === 1 ? 'día' : 'días'}</span></td><td><b>{money(expense.balance)}</b></td></tr>)}</tbody></table></div>
          {payableAging.overdue.length > 8 && <p className="op-finance-cost-note">Se muestran las 8 cuentas más antiguas de {payableAging.overdue.length}; los tramos incluyen el total.</p>}
          <button className="button button-outline op-finance-aging-filter" onClick={() => { setExpenseSearch(''); setExpenseStatusFilter('overdue'); document.getElementById('op-finance-expense-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><ReceiptText size={15}/> Ver todas las cuentas vencidas</button>
        </> : <div className="op-finance-ledger-empty"><Check size={22}/><b>No hay saldos vencidos</b><span>{payableAging.withoutDueDate.length ? `Completa la fecha de vencimiento de ${payableAging.withoutDueDate.length} cuentas abiertas para que aparezcan en la previsión.` : 'Las cuentas por pagar abiertas no tienen vencimientos atrasados.'}</span></div>}
        <p className="op-finance-cost-note">La antigüedad no agrega intereses, recargos ni penalidades; muestra solo el saldo registrado.</p>
      </section>
      <section className="panel op-finance-obligations-forecast" aria-labelledby="op-finance-obligations-title">
        <div className="panel-heading"><div><span className="eyebrow">CUENTAS POR PAGAR + PAGOS PERIÓDICOS</span><h3 id="op-finance-obligations-title">Obligaciones de los próximos 30 días</h3><p className="muted">El calendario usa la fecha actual y el filtro de sucursal; no depende del mes del informe.</p></div><CalendarClock size={19}/></div>
        <div className="op-finance-obligations-metrics"><article><span>En los próximos 7 días</span><b>{money(upcoming7DaysTotal)}</b></article><article><span>En los próximos 30 días</span><b>{money(upcoming30DaysTotal)}</b><small>{upcomingObligations.length} obligaciones previstas</small></article></div>
        {upcomingObligations.length ? <div className="op-finance-obligations-list">{upcomingObligations.slice(0, 12).map((item) => <article key={item.id}>
          <div className="op-finance-obligations-description"><b>{item.description}</b><span>{item.category} · {item.branch_id ? branchNames.get(item.branch_id) || 'Sucursal' : 'General'} · {item.source === 'recurring' ? 'Pago periódico estimado' : 'Cuenta por pagar'}</span></div>
          <div className="op-finance-obligations-due"><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short' })}</span><b>{money(item.amount)}</b></div>
          {item.source === 'recurring' && <button className="button button-outline" disabled={busy} onClick={() => void generateRecurringExpense(item.template)}><ReceiptText size={14}/> Preparar cuenta</button>}
        </article>)}</div> : <div className="op-finance-ledger-empty"><CalendarClock size={23}/><b>Sin obligaciones previstas en los próximos 30 días</b><span>Registra una fecha de vencimiento o programa internet, arriendo, luz, agua y otros pagos periódicos.</span></div>}
        {upcomingObligations.length > 12 && <p className="op-finance-cost-note">Se muestran 12 de {upcomingObligations.length} obligaciones; el total considera todas.</p>}
        <p className="op-finance-cost-note">Es una previsión de obligaciones, no de saldo disponible: suma saldos pendientes y montos estimados de pagos periódicos. No representa un pago realizado ni incluye ingresos futuros.</p>
      </section>
      <section className="panel op-finance-obligations-forecast" aria-labelledby="op-finance-purchase-commitments-title">
        <div className="panel-heading"><div><span className="eyebrow">COMPRAS → FINANZAS · ÓRDENES ABIERTAS</span><h3 id="op-finance-purchase-commitments-title">Compras pendientes de recepción</h3><p className="muted">Estimación del valor de las cantidades aún no recibidas en órdenes emitidas.</p></div><a className="button button-outline" href="/operaciones/compras">Revisar Compras <ArrowUpRight size={15}/></a></div>
        {purchaseCommitmentsError ? <p className="op-finance-cost-error" role="alert">{purchaseCommitmentsError}</p> : <>
        <div className="op-finance-obligations-metrics"><article><span>Compromiso estimado abierto</span><b>{money(purchaseCommitments.total)}</b><small>{purchaseCommitments.rows.length} órdenes con cantidades pendientes</small></article><article className={purchaseCommitments.overdue ? 'is-overdue' : ''}><span>Fecha de entrega prevista vencida</span><b>{money(purchaseCommitments.overdue)}</b><small>{purchaseCommitments.overdueCount} órdenes · confirmar estado en Compras</small></article><article><span>Entrega esperada en 7 días</span><b>{money(purchaseCommitments.next7Days)}</b><small>{purchaseCommitments.next7DaysCount} órdenes</small></article><article><span>Entrega esperada en 8–30 días</span><b>{money(purchaseCommitments.days8to30)}</b><small>{purchaseCommitments.days8to30Count} órdenes</small></article><article className={purchaseCommitments.withoutDateCount ? 'is-overdue' : ''}><span>Sin fecha de entrega</span><b>{money(purchaseCommitments.withoutDate)}</b><small>{purchaseCommitments.withoutDateCount} órdenes por programar</small></article></div>
        {purchaseCommitments.rows.length ? <div className="op-finance-obligations-list">{purchaseCommitments.rows.slice(0, 8).map((order) => <article key={order.id}>
          <div className="op-finance-obligations-description"><b>{order.order_number} · {supplierNames.get(order.supplier_id) || 'Proveedor'}</b><span>{branchNames.get(order.branch_id) || 'Sucursal'} · {order.remainingLines} líneas con unidades pendientes · {order.status === 'partially_received' ? 'Recepción parcial' : 'Emitida'}{order.expected_date && dayDistance(order.expected_date) < 0 ? ` · Fecha prevista vencida ${Math.abs(dayDistance(order.expected_date))} días` : ''}</span></div>
          <div className="op-finance-obligations-due"><span>{order.expected_date ? `Entrega esperada ${new Date(`${order.expected_date}T12:00:00`).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'short' })}` : 'Sin fecha esperada'}</span><b>{money(order.amount)}</b></div>
        </article>)}</div> : <div className="op-finance-ledger-empty"><Check size={22}/><b>Sin compromisos pendientes de recepción</b><span>Las órdenes emitidas con cantidades pendientes aparecerán aquí desde Compras.</span></div>}
        {purchaseCommitments.rows.length > 8 && <p className="op-finance-cost-note">Se muestran 8 de {purchaseCommitments.rows.length} órdenes; el total considera todas.</p>}
        <p className="op-finance-cost-note">Importe estimado según cantidad pendiente × costo unitario de la orden. La fecha es una previsión de entrega desde Compras, no un vencimiento ni fecha de pago; estos compromisos se mantienen fuera de la previsión de efectivo hasta confirmar factura y condiciones. No es una cuenta por pagar ni un pago confirmado; excluye órdenes en borrador, canceladas y recibidas. El importe final se confirma con la factura al conciliar la recepción.</p>
        </>}
      </section>
      <section className="panel op-finance-ledger-register"><div className="panel-heading"><div><span className="eyebrow">COMPRAS CON INVENTARIO RECIBIDO</span><h3>Recepciones pendientes de vincular</h3><p className="muted">El valor de la orden es solo una referencia. Confirma el total de la factura antes de crear el compromiso. Este listado de Compras muestra recepciones pendientes de todas las sucursales.</p></div><ReceiptText size={18}/></div>
        {!receipts.length ? <div className="op-finance-ledger-empty"><ReceiptText size={22}/><span>No hay recepciones registradas para conciliar.</span></div> : <div className="op-finance-ledger-list">{receipts.map((receipt) => {
          const linkedExpense = expenses.find((expense) => expense.receipt_id === receipt.id);
          const order = orders.find((item) => item.id === receipt.purchase_order_id);
          const form = receiptForms[receipt.id] || { total: String(Number(receipt.referenceTotal).toFixed(2)), due: '', document: receipt.reference || '' };
          return <article key={receipt.id}><div className="op-finance-ledger-record-top"><div><b>{order?.order_number || 'Orden de compra'} · {supplierNames.get(order?.supplier_id) || 'Proveedor'}</b><span>{new Date(receipt.received_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })} · {receipt.reference || 'Sin referencia de factura'}</span></div><span className="op-finance-ledger-status">{linkedExpense ? 'Cuenta vinculada' : 'Por conciliar'}</span></div>
            {linkedExpense ? <div className="op-finance-ledger-record-numbers"><span>Cuenta por pagar · {linkedExpense.reference || 'Factura sin referencia'}</span><b>{money(linkedExpense.total)} · saldo {money(Number(linkedExpense.total) - Number(linkedExpense.paid_total))}</b></div> : <><div className="op-finance-ledger-record-numbers"><span>Referencia estimada de líneas recibidas</span><b>{money(receipt.referenceTotal)}</b></div><div className="op-finance-ledger-pay"><label>Importe real de factura USD<input required aria-label="Importe confirmado de factura" type="number" min="0.01" step="0.01" value={form.total} onChange={(event) => setReceiptForms({ ...receiptForms, [receipt.id]: { ...form, total: event.target.value } })}/></label><label>Vencimiento<input type="date" value={form.due} onChange={(event) => setReceiptForms({ ...receiptForms, [receipt.id]: { ...form, due: event.target.value } })}/></label><label>Factura / comprobante<input maxLength={200} value={form.document} onChange={(event) => setReceiptForms({ ...receiptForms, [receipt.id]: { ...form, document: event.target.value } })}/></label><button className="button button-outline" disabled={busy} onClick={() => void createReceiptPayable(receipt)}>Crear cuenta por pagar</button></div><small>Se vinculará a este proveedor, orden y recepción. No registra abonos ni pagos.</small></>}
          </article>;
        })}</div>}
      </section>
      <div className="op-finance-ledger-columns">
        <form className="panel op-finance-ledger-form" onSubmit={saveExpense}>
          <div className="panel-heading"><div><span className="eyebrow">NUEVO MOVIMIENTO</span><h3>Registrar egreso</h3></div><Plus size={18}/></div>
          <p className="muted">Compra pagada hoy o factura/servicio pendiente. El pago inicial es opcional y admite abonos posteriores.</p>
          <label>Descripción<input required maxLength={240} placeholder="Ej. servicio de internet" value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })}/></label>
          <div className="op-finance-ledger-field-pair"><label>Categoría<select value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Sucursal<select value={expenseForm.branch} onChange={(event) => setExpenseForm({ ...expenseForm, branch: event.target.value })}><option value="">General / sin sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
          <div className="op-finance-ledger-field-pair"><label>Proveedor<select value={expenseForm.supplier} onChange={(event) => setExpenseForm({ ...expenseForm, supplier: event.target.value, order: '' })}><option value="">Sin proveedor vinculado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Orden de compra<select value={expenseForm.order} onChange={(event) => setExpenseForm({ ...expenseForm, order: event.target.value })}><option value="">Sin orden vinculada</option>{orders.filter((order) => !expenseForm.supplier || order.supplier_id === expenseForm.supplier).map((order) => <option key={order.id} value={order.id}>{order.order_number} · {order.status}</option>)}</select></label></div>
          {expenseForm.order && orderReferenceTotals[expenseForm.order] !== undefined && <p className="muted">Referencia de Compras: la orden suma {money(orderReferenceTotals[expenseForm.order])} según cantidades y costos registrados. Confirma el total real en la factura; esta referencia no registra ni paga la orden.</p>}
          <div className="op-finance-ledger-field-pair"><label>Total USD<input required type="number" min="0.01" step="0.01" value={expenseForm.total} onChange={(event) => setExpenseForm({ ...expenseForm, total: event.target.value })}/></label><label>Vence el<input type="date" value={expenseForm.due} onChange={(event) => setExpenseForm({ ...expenseForm, due: event.target.value })}/></label></div>
          <label>Factura / comprobante (referencia)<input maxLength={200} placeholder="Número o código del documento" value={expenseForm.documentReference} onChange={(event) => setExpenseForm({ ...expenseForm, documentReference: event.target.value })}/></label>
          <div className="op-finance-ledger-field-pair"><label>Pagado ahora USD<input type="number" min="0" step="0.01" value={expenseForm.paid} onChange={(event) => setExpenseForm({ ...expenseForm, paid: event.target.value })}/></label><label>Medio de pago<select value={expenseForm.method} onChange={(event) => setExpenseForm({ ...expenseForm, method: event.target.value })}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          {expenseForm.paid && Number(expenseForm.paid) > 0 && <label>Referencia del pago<input value={expenseForm.reference} onChange={(event) => setExpenseForm({ ...expenseForm, reference: event.target.value })}/></label>}
          <label>Nota<input maxLength={1000} value={expenseForm.note} onChange={(event) => setExpenseForm({ ...expenseForm, note: event.target.value })}/></label>
          <button className="button button-primary" disabled={busy}><Plus size={15}/> Guardar egreso</button>
        </form>
        <section className="panel op-finance-ledger-register" id="op-finance-expense-register"><div className="panel-heading"><div><span className="eyebrow">COMPROMISOS Y PAGOS</span><h3>Movimientos de egreso</h3></div><CircleDollarSign size={19}/></div>
          {!expenses.length ? <div className="op-finance-ledger-empty"><ReceiptText size={24}/><b>Aún no hay egresos</b><span>Registra compras pagadas al instante o servicios que debas pagar después.</span></div> : <><div className="op-finance-ledger-filters"><label>Buscar egreso<input type="search" value={expenseSearch} onChange={(event) => setExpenseSearch(event.target.value)} placeholder="Descripción, proveedor, OC o documento"/></label><label>Estado<select value={expenseStatusFilter} onChange={(event) => setExpenseStatusFilter(event.target.value)}><option value="all">Todos los estados</option><option value="open">Por pagar</option><option value="overdue">Vencidos</option><option value="paid">Pagados</option></select></label><span className="op-finance-ledger-result-count">{visibleExpenses.length} de {expenses.length} egresos</span></div>{!visibleExpenses.length ? <div className="op-finance-ledger-empty"><ReceiptText size={22}/><b>Sin coincidencias</b><span>Prueba otro término o estado para encontrar el egreso.</span></div> : <div className="op-finance-ledger-list">{visibleExpenses.map((expense) => { const balance = Number(expense.total) - Number(expense.paid_total); const form = paymentForms[expense.id] || { amount: '', method: 'transfer' }; return <article key={expense.id}>
            <div className="op-finance-ledger-record-top"><div><b>{expense.description}</b><span>{expense.category}{expense.branch_id ? ` · ${branchNames.get(expense.branch_id) || 'Sucursal'}` : ' · General'}{expense.supplier_id ? ` · ${supplierNames.get(expense.supplier_id) || 'Proveedor'}` : ''}{expense.purchase_order_id ? ` · OC ${orderNames.get(expense.purchase_order_id) || 'vinculada'}` : ''}{expense.reference ? ` · Doc. ${expense.reference}` : ''}</span></div><span className={`op-finance-ledger-status ${balance <= 0 ? 'is-paid' : ''}`}>{balance <= 0 ? 'Pagado' : expense.due_date && expense.due_date < today() ? 'Vencido' : 'Por pagar'}</span></div>
            <div className="op-finance-ledger-record-numbers"><span>Registrado {new Date(`${expense.document_date}T12:00:00`).toLocaleDateString('es-EC')} {expense.due_date ? `· vence ${new Date(`${expense.due_date}T12:00:00`).toLocaleDateString('es-EC')}` : ''}</span><b>{money(balance)} <small>pendiente</small></b></div>
            <div className="op-finance-ledger-progress"><i style={{ width: `${Math.min(100, Number(expense.paid_total) / Number(expense.total) * 100)}%` }}/></div><small>Pagado {money(Number(expense.paid_total))} de {money(Number(expense.total))}</small>
            {balance > 0 && <form className="op-finance-ledger-pay" onSubmit={(event) => void registerPayment(event, expense)}><input aria-label="Monto de abono" required type="number" min="0.01" max={balance} step="0.01" placeholder="Abono USD" value={form.amount} onChange={(event) => setPaymentForms({ ...paymentForms, [expense.id]: { ...form, amount: event.target.value } })}/><select aria-label="Medio de pago" value={form.method} onChange={(event) => setPaymentForms({ ...paymentForms, [expense.id]: { ...form, method: event.target.value } })}>{methods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button button-outline" disabled={busy}>Registrar pago</button></form>}
          </article>; })}</div>}</>}
          {!!expensePaymentsInScope.length && <><div className="panel-heading op-finance-ledger-history-heading"><div><span className="eyebrow">DINERO DESEMBOLSADO</span><h3>Pagos recientes del periodo</h3></div></div><div className="op-finance-ledger-list">{expensePaymentsInScope.slice(0, 15).map((payment) => { const linked = expensesById.get(payment.expense_id); return <article className="op-finance-ledger-history-row" key={payment.id}><div><b>{linked?.description || 'Egreso'}</b><span>{payment.method} · {new Date(payment.paid_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })}</span></div><b>{money(payment.amount)}</b></article>; })}</div></>}
        </section>
      </div>
    </>}
    {section === 'budget' && <div className="op-finance-ledger-columns op-finance-budget-columns">
      <form id="op-finance-budget-form" className="panel op-finance-ledger-form" onSubmit={saveBudget}>
        <div className="panel-heading"><div><span className="eyebrow">PLAN MENSUAL · EGRESOS</span><h3>Definir presupuesto por categoría</h3></div><ChartNoAxesCombined size={18}/></div>
        <p className="muted">Los montos los defines tú. Se comparan con egresos registrados por fecha de documento; guardar un presupuesto no crea gastos ni pagos.</p>
        {!month ? <p className="op-finance-cost-error" role="alert">Selecciona un mes en el filtro superior para planificar.</p> : <>
          <div className="op-finance-budget-period"><span>Periodo del presupuesto</span><b>{payrollMonthLabel(`${month}-01`)}</b></div>
          <label>Categoría<select value={budgetForm.category} onChange={(event) => setBudgetForm({ ...budgetForm, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
          <label>Sucursal<select required value={budgetForm.branch} onChange={(event) => setBudgetForm({ ...budgetForm, branch: event.target.value })}>
            <option value="" disabled={branch !== 'all'}>General / sin sucursal{branch !== 'all' ? ' · usa Todas las sucursales para editar' : ''}</option>
            {branches.filter((item) => branch === 'all' || item.id === branch).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label>Monto presupuestado USD<input required type="number" min="0.01" step="0.01" placeholder="Ingresa el monto aprobado" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })}/></label>
          <label>Nota (opcional)<textarea maxLength={1000} value={budgetForm.note} onChange={(event) => setBudgetForm({ ...budgetForm, note: event.target.value })} placeholder="Criterio o referencia del monto"/></label>
          <button className="button button-primary" disabled={busy}><Plus size={15}/> Guardar presupuesto del mes</button>
        </>}
      </form>
      <section className="panel op-finance-budget-register">
        <div className="panel-heading"><div><span className="eyebrow">CONTROL POR FECHA DE DOCUMENTO</span><h3>Presupuesto frente a egresos</h3><p className="muted">{branch === 'all' ? 'Incluye sucursales y egresos generales, sin distribuirlos.' : `Solo incluye ${branchNames.get(branch) || 'la sucursal seleccionada'}; los egresos generales se revisan con Todas las sucursales.`}</p></div><div className="op-finance-budget-actions"><button className="button button-outline" onClick={downloadBudgetComparisonCsv} disabled={budgetsLoading || !!budgetsError || (!budgetReport.rows.length && !budgetReport.unbudgetedRows.length)}><Download size={15}/> Exportar CSV</button><CircleDollarSign size={19}/></div></div>
        <div className="op-finance-ledger-kpis op-finance-budget-kpis">
          <article><span>Presupuesto asignado</span><b>{money(budgetReport.totalBudget)}</b><small>{budgetReport.rows.length} categorías y sucursales configuradas</small></article>
          <article><span>Egresos registrados</span><b>{money(budgetReport.totalActual)}</b><small>Importes de documentos del mes seleccionado; incluye cuentas pagadas y por pagar</small></article>
          <article className={budgetReport.totalBudget > 0 && budgetReport.variance < 0 ? 'is-overdue' : ''}><span>{budgetReport.variance < 0 ? 'Excedido del presupuesto' : 'Disponible del presupuesto'}</span><b>{budgetReport.totalBudget > 0 ? money(budgetReport.variance) : '—'}</b><small>{budgetReport.totalBudget > 0 ? 'Presupuesto menos egresos registrados' : 'Define presupuestos para calcular la diferencia'}</small></article>
          <article className={budgetReport.unbudgetedTotal > 0 ? 'is-overdue' : ''}><span>Egresos sin presupuesto</span><b>{money(budgetReport.unbudgetedTotal)}</b><small>{budgetReport.unbudgetedRows.length} combinaciones de categoría y sucursal</small></article>
        </div>
        {budgetsError ? <p className="op-finance-cost-error" role="alert">{budgetsError}</p> : budgetsLoading ? <p className="muted">Cargando presupuestos del periodo…</p> : <>
          {!!budgetReport.rows.length && <div className="op-finance-budget-list">{budgetReport.rows.map((item) => {
            const remaining = Number(item.budget_amount) - item.actual;
            const usedPercent = item.budget_amount > 0 ? item.actual / Number(item.budget_amount) * 100 : 0;
            return <article key={item.id} className={remaining < 0 ? 'is-over-budget' : ''}>
              <div className="op-finance-budget-row-heading"><div><b>{item.category}</b><small>{item.branch_id ? branchNames.get(item.branch_id) || 'Sucursal' : 'General / sin sucursal'} · {item.expenseCount} egresos</small></div><button type="button" className="button button-outline" onClick={() => { setBudgetForm({ category: item.category, branch: item.branch_id || '', amount: String(item.budget_amount), note: item.note || '' }); document.getElementById('op-finance-budget-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Editar</button></div>
              <div className="op-finance-budget-values"><span>Presupuesto <b>{money(Number(item.budget_amount))}</b></span><span>Registrado <b>{money(item.actual)}</b></span><span className={remaining < 0 ? 'is-over' : ''}>{remaining < 0 ? 'Exceso' : 'Disponible'} <b>{money(Math.abs(remaining))}</b></span></div>
              <div className="op-finance-ledger-progress op-finance-budget-progress" role="progressbar" aria-label={`Uso de presupuesto para ${item.category}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(usedPercent))}><i style={{ width: `${Math.min(100, Math.max(0, usedPercent))}%` }}/></div>
              <small className="op-finance-budget-usage">{Math.round(usedPercent)}% usado{item.note ? ` · ${item.note}` : ''}</small>
            </article>;
          })}</div>}
          {!!budgetReport.unbudgetedRows.length && <div className="op-finance-budget-unbudgeted"><div><b>Categorías con egresos sin presupuesto</b><small>Asígnales un monto para incluirlas en el control por categoría.</small></div>{budgetReport.unbudgetedRows.map((item) => <article key={`${item.branch_id || 'general'}-${item.category}`}><span><b>{item.category}</b><small>{item.branch_id ? branchNames.get(item.branch_id) || 'Sucursal' : 'General / sin sucursal'} · {item.count} egresos</small></span><strong>{money(item.amount)}</strong><button type="button" className="button button-outline" onClick={() => { setBudgetForm({ category: item.category, branch: item.branch_id || '', amount: '', note: '' }); document.getElementById('op-finance-budget-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Asignar</button></article>)}</div>}
          {!budgetReport.rows.length && !budgetReport.unbudgetedRows.length && <div className="op-finance-ledger-empty"><ChartNoAxesCombined size={24}/><b>Sin presupuestos ni egresos registrados</b><span>Define un monto mensual por categoría y sucursal para comparar el gasto real.</span></div>}
          <p className="op-finance-cost-note">Los documentos se asignan al mes de su fecha de emisión, aunque sigan pendientes de pago. Los pagos efectivos se consultan en Egresos y flujo de caja. Los presupuestos generales no se reparten automáticamente entre sucursales.</p>
        </>}
      </section>
    </div>}
    {section === 'suppliers' && <section className="panel op-finance-supplier-analysis" aria-labelledby="op-finance-supplier-title">
      <div className="panel-heading"><div><span className="eyebrow">COMPRAS → FINANZAS · {month || 'SIN PERIODO'}</span><h3 id="op-finance-supplier-title">Egresos documentados por proveedor</h3><p className="muted">Documentos emitidos en el mes y sucursal elegidos arriba. Los abonos son el acumulado actual de esas cuentas.</p></div><a className="button button-outline" href="/operaciones/compras">Abrir Compras <ArrowUpRight size={15}/></a></div>
      <div className="op-finance-supplier-metrics">
        <article><span>Egresos documentados</span><b>{money(supplierReport.totalDocumented)}</b><small>{supplierReport.documentCount} documentos del periodo</small></article>
        <article><span>Variación vs. mes anterior</span><b>{supplierReport.totalPeriodChange > 0 ? '+' : ''}{money(supplierReport.totalPeriodChange)}</b><small>{supplierReport.previousTotalDocumented > 0 ? `${supplierReport.totalPeriodChangePercent > 0 ? '+' : ''}${supplierReport.totalPeriodChangePercent.toFixed(1)}% frente a ${money(supplierReport.previousTotalDocumented)}` : 'Sin egresos del mes anterior para comparar'}</small></article>
        <article><span>Saldo abierto vinculado</span><b>{money(supplierReport.balance)}</b><small>De documentos con proveedor asociado</small></article>
        <article className={supplierReport.overdue ? 'is-overdue' : ''}><span>Vencido vinculado</span><b>{money(supplierReport.overdue)}</b><small>Saldos asociados con vencimiento pasado</small></article>
        <article className={supplierReport.unlinkedTotal ? 'is-unlinked' : ''}><span>Sin proveedor vinculado</span><b>{money(supplierReport.unlinkedTotal)}</b><small>Importe pendiente de clasificar en el periodo</small></article>
      </div>
      {supplierReport.rows.length ? <div className="op-finance-supplier-list">{supplierReport.rows.slice(0, 8).map((supplier, index) => <article key={supplier.id}>
        <div className="op-finance-supplier-rank"><span>{index + 1}</span><div><b>{supplier.name}</b><small>{supplier.documents} {supplier.documents === 1 ? 'documento' : 'documentos'} · {supplier.purchaseOrders} órdenes de compra vinculadas</small></div></div>
        <div className="op-finance-supplier-values"><b>{money(supplier.total)}</b><span>vs. mes anterior {supplier.periodChange > 0 ? '+' : ''}{money(supplier.periodChange)}{supplier.periodChangePercent !== null ? ` · ${supplier.periodChangePercent > 0 ? '+' : ''}${supplier.periodChangePercent.toFixed(1)}%` : ' · sin base'}</span><span>Abonado a la fecha {money(supplier.paidToDate)}</span><span className={supplier.overdueBalance ? 'is-overdue' : ''}>Saldo abierto {money(supplier.balance)}{supplier.overdueBalance ? ` · vencido ${money(supplier.overdueBalance)}` : ''}</span></div>
        <div className="op-finance-supplier-track" role="progressbar" aria-label={`${supplier.name}: ${money(supplier.total)} de egresos documentados`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(supplier.total / Math.max(1, supplierReport.totalDocumented) * 100)}><i style={{ width: `${Math.max(2, supplier.total / Math.max(1, supplierReport.totalDocumented) * 100)}%` }}/></div>
      </article>)}</div> : <div className="op-finance-ledger-empty"><Truck size={24}/><b>Sin egresos asociados a proveedores</b><span>Registra o vincula facturas con proveedores para ver concentración, órdenes y saldos.</span></div>}
      <p className="op-finance-cost-note">La variación compara el total de documentos emitidos en el mes seleccionado con el mes calendario anterior, en la misma sucursal; no corrige diferencias de días laborables ni cambios de precios. «Abonado a la fecha» y «saldo abierto» reflejan el estado acumulado de los documentos del periodo, no solo pagos del mes. Las órdenes sin factura no forman parte de estos importes.</p>
    </section>}
    {section === 'recurring' && <div className="op-finance-ledger-columns">
      <form className="panel op-finance-ledger-form" onSubmit={saveTemplate}><div className="panel-heading"><div><span className="eyebrow">PREVISIÓN Y RECORDATORIOS</span><h3>Programar pago periódico</h3></div><CalendarClock size={18}/></div><p className="muted">Cada vencimiento crea una cuenta por pagar solo cuando lo confirmes. No se ejecutan cargos ni pagos automáticos.</p>
        <label>Concepto<input required placeholder="Internet, arriendo, agua…" value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })}/></label><div className="op-finance-ledger-field-pair"><label>Categoría<select value={templateForm.category} onChange={(event) => setTemplateForm({ ...templateForm, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Frecuencia<select value={templateForm.cadence} onChange={(event) => setTemplateForm({ ...templateForm, cadence: event.target.value })}><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option></select></label></div><div className="op-finance-ledger-field-pair"><label>Monto esperado USD<input required type="number" min="0.01" step="0.01" value={templateForm.amount} onChange={(event) => setTemplateForm({ ...templateForm, amount: event.target.value })}/></label><label>Próximo vencimiento<input required type="date" value={templateForm.due} onChange={(event) => setTemplateForm({ ...templateForm, due: event.target.value })}/></label></div>
        <div className="op-finance-ledger-field-pair"><label>Sucursal<select value={templateForm.branch} onChange={(event) => setTemplateForm({ ...templateForm, branch: event.target.value })}><option value="">General / sin sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Proveedor<select value={templateForm.supplier} onChange={(event) => setTemplateForm({ ...templateForm, supplier: event.target.value })}><option value="">Sin proveedor vinculado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label></div>
        <button className="button button-primary" disabled={busy}><Plus size={15}/> Guardar pago periódico</button>
      </form><section className="panel op-finance-ledger-register"><div className="panel-heading"><div><span className="eyebrow">CALENDARIO DE OBLIGACIONES</span><h3>Pagos esperados</h3></div><Clock3 size={18}/></div>{!visibleTemplates.length ? <div className="op-finance-ledger-empty"><CalendarClock size={24}/><b>Sin pagos periódicos para este filtro</b><span>Agrega internet, renta, luz, agua u otros pagos recurrentes.</span></div> : <div className="op-finance-ledger-list">{visibleTemplates.map((item) => <article key={item.id}><div className="op-finance-ledger-record-top"><div><b>{item.description}</b><span>{item.category} · {item.cadence === 'monthly' ? 'Mensual' : item.cadence === 'quarterly' ? 'Trimestral' : 'Anual'}{item.branch_id ? ` · ${branchNames.get(item.branch_id) || 'Sucursal'}` : ' · General'}{item.supplier_id ? ` · ${supplierNames.get(item.supplier_id) || 'Proveedor'}` : ''}</span></div><span className="op-finance-ledger-status">Recordatorio</span></div><div className="op-finance-ledger-record-numbers"><span>Próximo vencimiento {new Date(`${item.next_due_date}T12:00:00`).toLocaleDateString('es-EC')}</span><b>{money(item.expected_amount)}</b></div><button className="button button-outline" disabled={busy} onClick={() => void generateRecurringExpense(item)}><ReceiptText size={15}/> Crear cuenta por pagar</button></article>)}</div>}</section>
    </div>}
    {section === 'deductions' && canSeeDeductions && <div className="op-finance-ledger-columns">
      <form className="panel op-finance-ledger-form" onSubmit={saveDeduction}>
        <div className="panel-heading"><div><span className="eyebrow">NÓMINA · ACCESO RESTRINGIDO</span><h3>Registrar solicitud de deducción</h3></div><ShieldCheck size={18}/></div>
        <p className="muted">Selecciona a la persona desde Personal. Registra evidencia y autorización; Finanzas no calcula ni descuenta remuneraciones.</p>
        <label>Persona<select required value={deductionForm.employee} onChange={(event) => setDeductionForm({ ...deductionForm, employee: event.target.value })}>
          <option value="">Selecciona una ficha activa…</option>
          {personnelOptions.map((person) => <option key={person.personnel_id} value={person.personnel_id}>{person.full_name}{person.department ? ' · ' + person.department : ''}{person.job_title ? ' · ' + person.job_title : ''}</option>)}
        </select></label>
        {personnelOptionsError && <p className="op-finance-cost-error" role="alert">No se pudieron cargar las fichas de Personal: {personnelOptionsError}</p>}
        <label>Motivo / concepto<input required maxLength={240} value={deductionForm.description} onChange={(event) => setDeductionForm({ ...deductionForm, description: event.target.value })}/></label>
        <div className="op-finance-ledger-field-pair">
          <label>Monto USD<input required type="number" min="0.01" step="0.01" value={deductionForm.amount} onChange={(event) => setDeductionForm({ ...deductionForm, amount: event.target.value })}/></label>
          <label>Periodo de nómina<input required type="month" value={deductionForm.period} onChange={(event) => setDeductionForm({ ...deductionForm, period: event.target.value })}/></label>
        </div>
        <label>Referencia de autorización<input placeholder="Documento o constancia aprobada" value={deductionForm.authorization} onChange={(event) => setDeductionForm({ ...deductionForm, authorization: event.target.value })}/></label>
        <label>Referencia de evidencia<input placeholder="Ruta interna / código de archivo" value={deductionForm.evidence} onChange={(event) => setDeductionForm({ ...deductionForm, evidence: event.target.value })}/></label>
        <button className="button button-primary" disabled={busy || !personnelOptions.length || Boolean(personnelOptionsError)}><Plus size={15}/> Guardar como pendiente</button>
      </form>
      <section className="panel op-finance-ledger-register">
        <div className="panel-heading op-finance-deductions-heading"><div><span className="eyebrow">SEGUIMIENTO CONFIDENCIAL</span><h3>Deducciones registradas</h3><p className="muted">Descarga solo las autorizadas; después registra la referencia de entrega y, cuando corresponda, la aplicación externa.</p></div><button className="button button-outline" onClick={downloadAuthorizedDeductionsCsv} disabled={!authorizedDeductions.length || busy}><Download size={15}/> Exportar autorizadas ({authorizedDeductions.length})</button></div>
        <div className="op-finance-ledger-kpis op-finance-ledger-payroll-kpis">
          <article><span>Pendiente de autorización</span><b>{money(deductionStatusSummary.pending)}</b><small>{visibleDeductions.filter((item) => item.status === 'pending_authorization').length} solicitudes</small></article>
          <article><span>Autorizado, pendiente de entrega</span><b>{money(deductionStatusSummary.authorized)}</b><small>{authorizedDeductions.length} solicitudes · periodo seleccionado</small></article>
          <article><span>Entregado a nómina, pendiente de aplicación</span><b>{money(deductionStatusSummary.sent)}</b><small>{sentDeductions.length} solicitudes · periodo seleccionado</small></article>
          <article><span>Reportado como aplicado externamente</span><b>{money(deductionStatusSummary.applied)}</b><small>{visibleDeductions.filter((item) => item.status === 'applied_externally').length} registros</small></article>
        </div>
        {!visibleDeductions.length ? <div className="op-finance-ledger-empty"><ShieldCheck size={24}/><b>Sin solicitudes para este periodo</b><span>Las deducciones se filtran por el mes de nómina y nunca se aplican automáticamente.</span></div> : <div className="op-finance-ledger-list">{visibleDeductions.map((item) => {
          const refs = reviewRefs[item.id] || { authorization: item.authorization_reference || '', evidence: item.evidence_reference || '' };
          const personName = deductionPersonName(item);
          const statusLabel = item.status === 'pending_authorization' ? 'Pendiente de autorización' : item.status === 'authorized' ? 'Autorizada · pendiente de entrega' : item.status === 'sent_to_payroll' ? 'Entregada a nómina · pendiente de aplicación' : item.status === 'applied_externally' ? 'Reportada como aplicada externamente' : item.status === 'cancelled' ? 'Cancelada' : item.status;
          return <article key={item.id}>
            <div className="op-finance-ledger-record-top"><div><b>{personName}</b><span>{item.description}</span></div><span className="op-finance-ledger-status">{statusLabel}</span></div>
            <div className="op-finance-ledger-record-numbers"><span>Periodo {payrollMonthLabel(item.payroll_period)}</span><b>{money(item.amount)}</b></div>
            {item.status === 'pending_authorization' && <>
              <label>Autorización expresa / referencia<input value={refs.authorization} onChange={(event) => setReviewRefs({ ...reviewRefs, [item.id]: { ...refs, authorization: event.target.value } })}/></label>
              <label>Evidencia / referencia<input value={refs.evidence} onChange={(event) => setReviewRefs({ ...reviewRefs, [item.id]: { ...refs, evidence: event.target.value } })}/></label>
              <button className="button button-outline" disabled={busy || !refs.authorization.trim() || !refs.evidence.trim()} onClick={() => void updateDeductionStatus(item, 'authorized')}><ShieldCheck size={14}/> Confirmar autorización</button>
            </>}
            {item.status === 'authorized' && <>
              <label>Referencia de entrega a nómina<input maxLength={240} placeholder="Código de lote, comprobante o referencia externa" value={payrollDeliveryRefs[item.id] || ''} onChange={(event) => setPayrollDeliveryRefs({ ...payrollDeliveryRefs, [item.id]: event.target.value })}/></label>
              <button className="button button-outline" disabled={busy || !(payrollDeliveryRefs[item.id] || '').trim()} onClick={() => void updateDeductionStatus(item, 'sent_to_payroll')}><Check size={14}/> Registrar entrega a nómina</button>
            </>}
            {item.status === 'sent_to_payroll' && <>
              <small>Entregada {item.payroll_handed_at ? new Date(item.payroll_handed_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }) : ''} · Registró {teamNames.get(item.payroll_handed_by) || 'Finanzas'} · Referencia: {item.payroll_handoff_reference}</small>
              <button className="button button-outline" disabled={busy} onClick={() => void updateDeductionStatus(item, 'applied_externally')}><Check size={14}/> Registrar aplicación externa</button>
            </>}
            {item.status === 'applied_externally' && <small>Referencia de autorización: {item.authorization_reference} · Evidencia: {item.evidence_reference}{item.payroll_handoff_reference ? ` · Entrega: ${item.payroll_handoff_reference}` : ''}</small>}
          </article>;
        })}</div>}
      </section>
    </div>}
    <aside className="op-finance-ledger-footnote"><Check size={16}/><span>Los indicadores de caja reflejan pagos registrados; los saldos por pagar son obligaciones, no dinero ya desembolsado. El margen/utilidad queda pendiente hasta integrar costos completos. Las deducciones se muestran separadas y no forman parte de egresos operativos.</span></aside>
  </section>;
}
