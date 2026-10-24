import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Check, CircleDollarSign, Clock3, Plus, ReceiptText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';

const money = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
const businessMonth = (value: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit' }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
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

type Expense = { id: string; description: string; category: string; status: string; document_date: string; due_date: string | null; total: number; paid_total: number; branch_id: string | null; supplier_id: string | null; purchase_order_id: string | null; reference: string };
type TeamMember = { user_id: string; full_name: string; email: string; role: string; active: boolean };

export function OperationsFinanceControls() {
  const { organizationId, roles } = useAuth();
  const canManage = roles.some((role: string) => ['owner', 'admin', 'manager'].includes(role));
  const canSeeDeductions = roles.some((role: string) => ['owner', 'admin'].includes(role));
  const [section, setSection] = useState('egresos');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [deductions, setDeductions] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderReferenceTotals, setOrderReferenceTotals] = useState<Record<string, number>>({});
  const [expensePayments, setExpensePayments] = useState<any[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', category: categories[0], total: '', paid: '', due: '', branch: '', supplier: '', order: '', method: 'transfer', reference: '', documentReference: '', note: '' });
  const [paymentForms, setPaymentForms] = useState<Record<string, { amount: string; method: string }>>({});
  const [templateForm, setTemplateForm] = useState({ description: '', category: 'Servicios básicos', amount: '', cadence: 'monthly', due: today(), branch: '', supplier: '', note: '' });
  const [deductionForm, setDeductionForm] = useState({ employee: '', description: '', amount: '', period: today(), authorization: '', evidence: '' });
  const [reviewRefs, setReviewRefs] = useState<Record<string, { authorization: string; evidence: string }>>({});

  const refresh = async () => {
    if (!supabase || !organizationId || !canManage) return;
    setError('');
    let expenseRows: Expense[];
    let templateRows: any[];
    let deductionRows: any[];
    let paymentRows: any[];
    const [branchResult, teamResult, supplierResult, orderResult] = await Promise.all([
      supabase.from('branches').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.rpc('list_visualcorp_team_members'),
      supabase.from('suppliers').select('id,name').eq('organization_id', organizationId).eq('active', true).order('name'),
      supabase.from('purchase_orders').select('id,order_number,status,supplier_id').eq('organization_id', organizationId).not('status', 'eq', 'cancelled').order('created_at', { ascending: false }).limit(300),
    ]);
    if (branchResult.error || supplierResult.error || orderResult.error) {
      setError(branchResult.error?.message || supplierResult.error?.message || orderResult.error?.message || 'No se pudieron cargar las áreas conectadas.');
      return;
    }
    try {
      [expenseRows, templateRows, deductionRows, paymentRows] = await Promise.all([
        readAllFinanceRows(() => supabase.from('finance_expenses').select('id,description,category,status,document_date,due_date,total,paid_total,branch_id,supplier_id,purchase_order_id,reference').eq('organization_id', organizationId).order('document_date', { ascending: false }).order('id')),
        readAllFinanceRows(() => supabase.from('finance_recurring_templates').select('id,description,category,expected_amount,cadence,next_due_date,cadence_anchor_day,branch_id,supplier_id,active').eq('organization_id', organizationId).order('next_due_date').order('id')),
        canSeeDeductions
          ? readAllFinanceRows(() => supabase.from('finance_payroll_deductions').select('id,employee_user_id,description,amount,payroll_period,status,authorization_reference,evidence_reference,created_at').eq('organization_id', organizationId).order('payroll_period', { ascending: false }).order('id'))
          : Promise.resolve([]),
        readAllFinanceRows(() => supabase.from('finance_expense_payments').select('id,expense_id,amount,method,reference,paid_at').eq('organization_id', organizationId).order('paid_at', { ascending: false }).order('id')),
      ]);
    } catch (loadError: any) {
      setError(loadError?.message || 'No se pudo cargar el historial financiero completo.');
      return;
    }
    setExpenses(expenseRows);
    setTemplates(templateRows);
    setBranches(branchResult.data || []);
    setSuppliers(supplierResult.data || []);
    setOrders(orderResult.data || []);
    try {
      const orderLines = await readAllFinanceRows(() => supabase.from('purchase_order_lines').select('purchase_order_id,quantity_ordered,unit_cost').eq('organization_id', organizationId).order('purchase_order_id').order('id'));
      const totals = orderLines.reduce((result: Record<string, number>, line: any) => {
        result[line.purchase_order_id] = (result[line.purchase_order_id] || 0) + Number(line.quantity_ordered) * Number(line.unit_cost);
        return result;
      }, {});
      setOrderReferenceTotals(totals);
    } catch {
      setOrderReferenceTotals({});
      setError('No se pudieron calcular los valores de referencia de Compras. Puedes registrar el egreso, pero confirma el importe con la factura.');
    }
    setExpensePayments(paymentRows);
    setTeam(teamResult.error ? [] : (teamResult.data || []));
    setDeductions(deductionRows);
  };

  useEffect(() => { void refresh(); }, [organizationId, canManage, canSeeDeductions]);

  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const supplierNames = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])), [suppliers]);
  const orderNames = useMemo(() => new Map(orders.map((order) => [order.id, order.order_number])), [orders]);
  const teamNames = useMemo(() => new Map(team.map((person) => [person.user_id, person.full_name || person.email || person.user_id.slice(0, 8)])), [team]);
  const openPayables = expenses.filter((expense) => expense.status === 'payable');
  const dueNow = openPayables.filter((expense) => expense.due_date && expense.due_date < today()).reduce((total, expense) => total + Number(expense.total) - Number(expense.paid_total), 0);
  const payableTotal = openPayables.reduce((total, expense) => total + Number(expense.total) - Number(expense.paid_total), 0);
  const thisMonth = today().slice(0, 7);
  const paidThisMonth = expensePayments.filter((payment) => payment.paid_at && businessMonth(payment.paid_at) === thisMonth).reduce((sum, payment) => sum + Number(payment.amount), 0);

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
    const { error: saveError } = await supabase.from('finance_payroll_deductions').insert({ organization_id: organizationId, employee_user_id: deductionForm.employee, description: deductionForm.description.trim(), amount: Number(deductionForm.amount), payroll_period: deductionForm.period, authorization_reference: deductionForm.authorization.trim(), evidence_reference: deductionForm.evidence.trim(), status: 'pending_authorization' });
    if (saveError) setError(saveError.message); else { setNotice('Deducción registrada como pendiente; aún no modifica ni procesa la nómina.'); setDeductionForm({ ...deductionForm, description: '', amount: '', authorization: '', evidence: '' }); await refresh(); }
    setBusy(false);
  };

  const updateDeductionStatus = async (item: any, status: string) => {
    setBusy(true); setError(''); setNotice('');
    const refs = reviewRefs[item.id] || { authorization: item.authorization_reference || '', evidence: item.evidence_reference || '' };
    const { error: updateError } = await supabase.from('finance_payroll_deductions').update({ status, authorization_reference: refs.authorization.trim(), evidence_reference: refs.evidence.trim() }).eq('id', item.id);
    if (updateError) setError(updateError.message); else { setNotice(status === 'authorized' ? 'Autorización registrada; todavía debe procesarse externamente.' : 'Aplicación externa registrada como referencia, sin integración de nómina.'); await refresh(); }
    setBusy(false);
  };

  if (!canManage) return null;

  return <section className="op-finance-ledger">
    <header className="op-finance-ledger-heading"><div><span className="eyebrow">INGRESOS + EGRESOS + OBLIGACIONES</span><h2>Centro financiero</h2><p>Separa dinero recibido, pagos reales y saldos pendientes. Los pedidos de compra no se convierten automáticamente en egresos.</p></div></header>
    {(error || notice) && <div className={`op-finance-ledger-alert ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <nav className="op-finance-ledger-tabs" aria-label="Secciones financieras">
      <button className={section === 'egresos' ? 'active' : ''} onClick={() => setSection('egresos')}><ReceiptText size={16}/> Egresos y cuentas por pagar</button>
      <button className={section === 'recurring' ? 'active' : ''} onClick={() => setSection('recurring')}><CalendarClock size={16}/> Pagos periódicos</button>
      {canSeeDeductions && <button className={section === 'deductions' ? 'active' : ''} onClick={() => setSection('deductions')}><ShieldCheck size={16}/> Deducciones de remuneración</button>}
    </nav>
    {section === 'egresos' && <>
      <div className="op-finance-ledger-kpis">
        <article><span>Por pagar</span><b>{money(payableTotal)}</b><small>{openPayables.length} compromisos abiertos</small></article>
        <article className="is-overdue"><span>Vencido</span><b>{money(dueNow)}</b><small>Con fecha de vencimiento anterior a hoy</small></article>
        <article><span>Pagado este mes</span><b>{money(paidThisMonth)}</b><small>Pagos hechos, no obligaciones pendientes</small></article>
      </div>
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
        <section className="panel op-finance-ledger-register"><div className="panel-heading"><div><span className="eyebrow">COMPROMISOS Y PAGOS</span><h3>Movimientos de egreso</h3></div><CircleDollarSign size={19}/></div>
          {!expenses.length ? <div className="op-finance-ledger-empty"><ReceiptText size={24}/><b>Aún no hay egresos</b><span>Registra compras pagadas al instante o servicios que debas pagar después.</span></div> : <div className="op-finance-ledger-list">{expenses.map((expense) => { const balance = Number(expense.total) - Number(expense.paid_total); const form = paymentForms[expense.id] || { amount: '', method: 'transfer' }; return <article key={expense.id}>
            <div className="op-finance-ledger-record-top"><div><b>{expense.description}</b><span>{expense.category}{expense.branch_id ? ` · ${branchNames.get(expense.branch_id) || 'Sucursal'}` : ' · General'}{expense.supplier_id ? ` · ${supplierNames.get(expense.supplier_id) || 'Proveedor'}` : ''}{expense.purchase_order_id ? ` · OC ${orderNames.get(expense.purchase_order_id) || 'vinculada'}` : ''}{expense.reference ? ` · Doc. ${expense.reference}` : ''}</span></div><span className={`op-finance-ledger-status ${balance <= 0 ? 'is-paid' : ''}`}>{balance <= 0 ? 'Pagado' : expense.due_date && expense.due_date < today() ? 'Vencido' : 'Por pagar'}</span></div>
            <div className="op-finance-ledger-record-numbers"><span>Registrado {new Date(`${expense.document_date}T12:00:00`).toLocaleDateString('es-EC')} {expense.due_date ? `· vence ${new Date(`${expense.due_date}T12:00:00`).toLocaleDateString('es-EC')}` : ''}</span><b>{money(balance)} <small>pendiente</small></b></div>
            <div className="op-finance-ledger-progress"><i style={{ width: `${Math.min(100, Number(expense.paid_total) / Number(expense.total) * 100)}%` }}/></div><small>Pagado {money(Number(expense.paid_total))} de {money(Number(expense.total))}</small>
            {balance > 0 && <form className="op-finance-ledger-pay" onSubmit={(event) => void registerPayment(event, expense)}><input aria-label="Monto de abono" required type="number" min="0.01" max={balance} step="0.01" placeholder="Abono USD" value={form.amount} onChange={(event) => setPaymentForms({ ...paymentForms, [expense.id]: { ...form, amount: event.target.value } })}/><select aria-label="Medio de pago" value={form.method} onChange={(event) => setPaymentForms({ ...paymentForms, [expense.id]: { ...form, method: event.target.value } })}>{methods.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button button-outline" disabled={busy}>Registrar pago</button></form>}
          </article>; })}</div>}
          {!!expensePayments.length && <><div className="panel-heading op-finance-ledger-history-heading"><div><span className="eyebrow">DINERO DESEMBOLSADO</span><h3>Pagos recientes</h3></div></div><div className="op-finance-ledger-list">{expensePayments.slice(0, 15).map((payment) => { const linked = expenses.find((expense) => expense.id === payment.expense_id); return <article className="op-finance-ledger-history-row" key={payment.id}><div><b>{linked?.description || 'Egreso'}</b><span>{payment.method} · {new Date(payment.paid_at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })}</span></div><b>{money(payment.amount)}</b></article>; })}</div></>}
        </section>
      </div>
    </>}
    {section === 'recurring' && <div className="op-finance-ledger-columns">
      <form className="panel op-finance-ledger-form" onSubmit={saveTemplate}><div className="panel-heading"><div><span className="eyebrow">PREVISIÓN Y RECORDATORIOS</span><h3>Programar pago periódico</h3></div><CalendarClock size={18}/></div><p className="muted">Cada vencimiento crea una cuenta por pagar solo cuando lo confirmes. No se ejecutan cargos ni pagos automáticos.</p>
        <label>Concepto<input required placeholder="Internet, arriendo, agua…" value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })}/></label><div className="op-finance-ledger-field-pair"><label>Categoría<select value={templateForm.category} onChange={(event) => setTemplateForm({ ...templateForm, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Frecuencia<select value={templateForm.cadence} onChange={(event) => setTemplateForm({ ...templateForm, cadence: event.target.value })}><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option></select></label></div><div className="op-finance-ledger-field-pair"><label>Monto esperado USD<input required type="number" min="0.01" step="0.01" value={templateForm.amount} onChange={(event) => setTemplateForm({ ...templateForm, amount: event.target.value })}/></label><label>Próximo vencimiento<input required type="date" value={templateForm.due} onChange={(event) => setTemplateForm({ ...templateForm, due: event.target.value })}/></label></div>
        <div className="op-finance-ledger-field-pair"><label>Sucursal<select value={templateForm.branch} onChange={(event) => setTemplateForm({ ...templateForm, branch: event.target.value })}><option value="">General / sin sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Proveedor<select value={templateForm.supplier} onChange={(event) => setTemplateForm({ ...templateForm, supplier: event.target.value })}><option value="">Sin proveedor vinculado</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label></div>
        <button className="button button-primary" disabled={busy}><Plus size={15}/> Guardar pago periódico</button>
      </form><section className="panel op-finance-ledger-register"><div className="panel-heading"><div><span className="eyebrow">CALENDARIO DE OBLIGACIONES</span><h3>Pagos esperados</h3></div><Clock3 size={18}/></div>{!templates.length ? <div className="op-finance-ledger-empty"><CalendarClock size={24}/><b>Sin pagos periódicos programados</b><span>Agrega internet, renta, luz, agua u otros pagos recurrentes.</span></div> : <div className="op-finance-ledger-list">{templates.filter((item) => item.active).map((item) => <article key={item.id}><div className="op-finance-ledger-record-top"><div><b>{item.description}</b><span>{item.category} · {item.cadence === 'monthly' ? 'Mensual' : item.cadence === 'quarterly' ? 'Trimestral' : 'Anual'}{item.branch_id ? ` · ${branchNames.get(item.branch_id) || 'Sucursal'}` : ' · General'}{item.supplier_id ? ` · ${supplierNames.get(item.supplier_id) || 'Proveedor'}` : ''}</span></div><span className="op-finance-ledger-status">Recordatorio</span></div><div className="op-finance-ledger-record-numbers"><span>Próximo vencimiento {new Date(`${item.next_due_date}T12:00:00`).toLocaleDateString('es-EC')}</span><b>{money(item.expected_amount)}</b></div><button className="button button-outline" disabled={busy} onClick={() => void generateRecurringExpense(item)}><ReceiptText size={15}/> Crear cuenta por pagar</button></article>)}</div>}</section>
    </div>}
    {section === 'deductions' && canSeeDeductions && <div className="op-finance-ledger-columns">
      <form className="panel op-finance-ledger-form" onSubmit={saveDeduction}><div className="panel-heading"><div><span className="eyebrow">NÓMINA · ACCESO RESTRINGIDO</span><h3>Registrar solicitud de deducción</h3></div><ShieldCheck size={18}/></div><p className="muted">Solo propietario/administración. Registra evidencia y autorización; este módulo no calcula ni descuenta remuneraciones.</p>
        <label>Persona<select required value={deductionForm.employee} onChange={(event) => setDeductionForm({ ...deductionForm, employee: event.target.value })}><option value="">Selecciona integrante activo…</option>{team.filter((person) => person.active).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name || person.email || person.user_id.slice(0, 8)}</option>)}</select></label>
        <label>Motivo / concepto<input required maxLength={240} value={deductionForm.description} onChange={(event) => setDeductionForm({ ...deductionForm, description: event.target.value })}/></label><div className="op-finance-ledger-field-pair"><label>Monto USD<input required type="number" min="0.01" step="0.01" value={deductionForm.amount} onChange={(event) => setDeductionForm({ ...deductionForm, amount: event.target.value })}/></label><label>Periodo de nómina<input required type="date" value={deductionForm.period} onChange={(event) => setDeductionForm({ ...deductionForm, period: event.target.value })}/></label></div><label>Referencia de autorización<input placeholder="Documento o constancia aprobada" value={deductionForm.authorization} onChange={(event) => setDeductionForm({ ...deductionForm, authorization: event.target.value })}/></label><label>Referencia de evidencia<input placeholder="Ruta interna / código de archivo" value={deductionForm.evidence} onChange={(event) => setDeductionForm({ ...deductionForm, evidence: event.target.value })}/></label><button className="button button-primary" disabled={busy}><Plus size={15}/> Guardar como pendiente</button>
      </form><section className="panel op-finance-ledger-register"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO CONFIDENCIAL</span><h3>Deducciones registradas</h3></div><ShieldCheck size={18}/></div>{!deductions.length ? <div className="op-finance-ledger-empty"><ShieldCheck size={24}/><b>Sin solicitudes registradas</b><span>Los registros nuevos comienzan pendientes de autorización y no se aplican automáticamente.</span></div> : <div className="op-finance-ledger-list">{deductions.map((item) => { const refs = reviewRefs[item.id] || { authorization: item.authorization_reference || '', evidence: item.evidence_reference || '' }; return <article key={item.id}><div className="op-finance-ledger-record-top"><div><b>{teamNames.get(item.employee_user_id) || 'Integrante del equipo'}</b><span>{item.description}</span></div><span className="op-finance-ledger-status">{item.status === 'pending_authorization' ? 'Pendiente de autorización' : item.status === 'authorized' ? 'Autorizada' : item.status === 'applied_externally' ? 'Aplicada externamente' : item.status}</span></div><div className="op-finance-ledger-record-numbers"><span>Periodo {new Date(`${item.payroll_period}T12:00:00`).toLocaleDateString('es-EC')}</span><b>{money(item.amount)}</b></div>{item.status === 'pending_authorization' && <><label>Autorización expresa / referencia<input value={refs.authorization} onChange={(event) => setReviewRefs({ ...reviewRefs, [item.id]: { ...refs, authorization: event.target.value } })}/></label><label>Evidencia / referencia<input value={refs.evidence} onChange={(event) => setReviewRefs({ ...reviewRefs, [item.id]: { ...refs, evidence: event.target.value } })}/></label><button className="button button-outline" disabled={busy || !refs.authorization.trim() || !refs.evidence.trim()} onClick={() => void updateDeductionStatus(item, 'authorized')}><ShieldCheck size={14}/> Confirmar autorización</button></>}{item.status === 'authorized' && <button className="button button-outline" disabled={busy} onClick={() => void updateDeductionStatus(item, 'applied_externally')}><Check size={14}/> Registrar aplicación externa</button>}{item.status === 'applied_externally' && <small>Autorización: {item.authorization_reference} · Evidencia: {item.evidence_reference}</small>}</article>; })}</div>}</section>
    </div>}
    <aside className="op-finance-ledger-footnote"><Check size={16}/><span>Los indicadores de caja reflejan pagos registrados; los saldos por pagar son obligaciones, no dinero ya desembolsado. El margen/utilidad queda pendiente hasta integrar costos completos. Las deducciones se muestran separadas y no forman parte de egresos operativos.</span></aside>
  </section>;
}
