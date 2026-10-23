import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleHelp, CreditCard, Search, ShoppingCart, Wallet } from 'lucide-react';
import { formatMoney, localDateKey, useWorkspace } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import './visual-corp-pos.css';

const METHODS = { Efectivo: 'cash', Transferencia: 'transfer', Tarjeta: 'card', Otro: 'other' };
const SALE_PENDING_KEY = 'visualcorp-pos-pending-sale-v2';
const PAYMENT_PENDING_KEY = 'visualcorp-pos-pending-payment-v2';
const LEGACY_SALE_PENDING_KEY = 'visualcorp-pos-pending-sale-key';
const emptyForm = () => ({ quoteId: '', total: '', paymentKind: 'full', amountPaid: '', method: 'Efectivo', customer: '', customerId: '', customerPhone: '', description: '', productId: '', branchCode: 'VIS', quantity: '1' });
const readPending = (key) => {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; }
};
const newKey = (prefix) => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const cents = (value) => Math.round(Number(value) * 100);
const isDefiniteRejection = (error) => Boolean(error?.code && error.code !== '0' && !/clave.+(usada|usó)/i.test(error.message || ''));

function Field({ label, children, hint }) {
  return <label className="vcpos-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function VisualCorpPOS() {
  const { data, flash, refreshRemote } = useWorkspace();
  const { organizationId, user, roles } = useAuth();
  const saleStorageKey = `${SALE_PENDING_KEY}-${user?.id || 'anonymous'}`;
  const paymentStorageKey = `${PAYMENT_PENDING_KEY}-${user?.id || 'anonymous'}`;
  const restoredSale = useRef(readPending(saleStorageKey));
  const restoredPayment = useRef(readPending(paymentStorageKey));
  const [form, setForm] = useState(restoredSale.current?.form || emptyForm);
  const [pendingSale, setPendingSale] = useState(restoredSale.current);
  const [pendingPayment, setPendingPayment] = useState(restoredPayment.current);
  const [saleBusy, setSaleBusy] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const saleLock = useRef(false);
  const paymentLock = useRef(false);
  const [catalogLinks, setCatalogLinks] = useState([]);
  const [centralQuotes, setCentralQuotes] = useState([]);
  const [paymentTarget, setPaymentTarget] = useState(restoredPayment.current?.saleId || null);
  const [paymentForm, setPaymentForm] = useState(restoredPayment.current?.form || { amount: '', method: 'Efectivo', reference: '' });
  const [saleSearch, setSaleSearch] = useState('');
  const [saleFilter, setSaleFilter] = useState('pending');
  const [lastResult, setLastResult] = useState(null);
  const flashRef = useRef(flash);
  flashRef.current = flash;

  React.useEffect(() => {
    if (!supabase || !organizationId) return undefined;
    let active = true;
    Promise.all([
      supabase.from('catalog_inventory_links').select('catalog_product_id,inventory_variant_id,branch_id,location_code,active').eq('organization_id', organizationId).eq('active', true),
      supabase.from('central_quotes').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100),
    ]).then(([links, quotes]) => {
      if (!active) return;
      if (links.error) flashRef.current(`No se pudieron cargar los vínculos de stock: ${links.error.message}`);
      else setCatalogLinks(links.data || []);
      if (quotes.error) flashRef.current(`No se pudieron cargar cotizaciones: ${quotes.error.message}`);
      else setCentralQuotes(quotes.data || []);
    });
    return () => { active = false; };
  }, [organizationId]);

  const canSell = roles.some((role) => ['owner', 'admin', 'manager', 'advisor'].includes(role));
  const todaySales = data.sales.filter((sale) => localDateKey(sale.date) === localDateKey());
  const pendingCount = data.sales.filter((sale) => sale.balance > 0).length;
  const selectedProduct = data.catalog.find((product) => product.id === form.productId);
  const branchName = form.branchCode === 'GIGA' ? 'Gigaprint' : 'Visual Corp';
  const productLink = catalogLinks.find((link) => link.catalog_product_id === form.productId && data.inventory.some((row) => row.variantId === link.inventory_variant_id && row.branchId === link.branch_id && row.branch === branchName));
  const stockItem = productLink ? data.inventory.find((row) => row.variantId === productLink.inventory_variant_id && row.branchId === productLink.branch_id && row.location === productLink.location_code) : null;
  const total = Number(form.total) || 0;
  const paidNow = form.paymentKind === 'full' ? total : form.paymentKind === 'none' ? 0 : Number(form.amountPaid) || 0;
  const balance = Math.max(0, (cents(total) - cents(paidNow)) / 100);
  const visibleSales = useMemo(() => {
    const query = saleSearch.trim().toLocaleLowerCase('es');
    return data.sales.filter((sale) => (saleFilter === 'all' || sale.balance > 0) && (!query || [sale.code, sale.customer, sale.description].some((value) => String(value || '').toLocaleLowerCase('es').includes(query)))).slice(0, 80);
  }, [data.sales, saleSearch, saleFilter]);

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const chooseQuote = (id) => {
    const quote = centralQuotes.find((item) => item.id === id);
    setForm((current) => ({ ...current, quoteId: id, total: quote?.selected_total ?? '', customerId: '', customer: quote?.customer_name || '', description: Array.isArray(quote?.items) ? quote.items.map((item) => item.name || item.product_name).join(', ') : '' }));
  };
  const chooseCustomer = (id) => {
    const customer = data.customers.find((row) => row.id === id);
    setForm((current) => ({ ...current, customerId: id, customer: customer?.name || '', customerPhone: customer?.phone || '' }));
  };
  const assertOpenCashShift = async (branchId) => {
    if (!branchId) throw new Error('No se pudo identificar la sucursal de la caja.');
    const { data: shift, error } = await supabase.from('cash_sessions').select('id').eq('organization_id', organizationId).eq('branch_id', branchId).eq('opened_by', user.id).eq('status', 'open').maybeSingle();
    if (error) throw error;
    if (!shift) throw new Error('Abre tu turno en Caja y producción antes de cobrar en efectivo.');
  };

  const save = async (event) => {
    event.preventDefault();
    if (saleLock.current || !canSell || !user || !organizationId || !supabase) return;
    const retry = pendingSale;
    const activeForm = retry?.form || form;
    const amount = Number(activeForm.total);
    const quantity = Number(activeForm.quantity);
    const initialPaid = activeForm.paymentKind === 'full' ? amount : activeForm.paymentKind === 'none' ? 0 : Number(activeForm.amountPaid);
    if (!retry) {
      if (!Number.isInteger(quantity) || quantity < 1) { flash('La cantidad debe ser un número entero mayor a cero.'); return; }
      if (!Number.isFinite(amount) || cents(amount) <= 0) { flash('Ingresa un valor acordado mayor a cero.'); return; }
      if (!Number.isFinite(initialPaid) || cents(initialPaid) < 0 || cents(initialPaid) > cents(amount) || (activeForm.paymentKind === 'partial' && cents(initialPaid) === 0)) { flash('El abono inicial debe ser mayor a cero y no puede superar el total.'); return; }
      const quote = centralQuotes.find((item) => item.id === activeForm.quoteId);
      if (activeForm.quoteId && (!quote || quote.status !== 'accepted' || !quote.price_confirmed || cents(quote.selected_total) !== cents(amount))) { flash('La cotización debe estar aceptada y conservar el mismo total.'); return; }
      if (productLink && (!stockItem || stockItem.sourceStatus || Number(stockItem.quantity) < quantity) && !window.confirm('Hay un faltante o conteo pendiente. ¿Confirmar la orden y registrar la compra urgente?')) return;
    }
    saleLock.current = true;
    setSaleBusy(true);
    let rejected = false;
    try {
      let operation = retry;
      if (!operation) {
        const legacyKey = sessionStorage.getItem(LEGACY_SALE_PENDING_KEY);
        if (legacyKey) {
          const { data: previous, error } = await supabase.from('sales').select('sale_code').eq('organization_id', organizationId).eq('idempotency_key', legacyKey).maybeSingle();
          if (error) throw error;
          sessionStorage.removeItem(LEGACY_SALE_PENDING_KEY);
          if (previous) {
            await refreshRemote();
            flash(`La venta anterior ${previous.sale_code} ya estaba registrada. Revísala antes de confirmar otra.`);
            return;
          }
        }
        if (initialPaid > 0 && activeForm.method === 'Efectivo') {
          const { data: branch, error } = await supabase.from('branches').select('id').eq('organization_id', organizationId).eq('code', activeForm.branchCode).maybeSingle();
          if (error) throw error;
          await assertOpenCashShift(branch?.id);
        }
        const totalCents = cents(amount);
        const base = Math.floor(totalCents / quantity);
        const remainder = totalCents - base * quantity;
        const chosenProduct = data.catalog.find((product) => product.id === activeForm.productId);
        const quote = centralQuotes.find((item) => item.id === activeForm.quoteId);
        operation = {
          key: newKey('sale'), form: activeForm,
          payload: {
            p_branch_code: activeForm.branchCode,
            p_customer_id: activeForm.customerId || null,
            p_customer_data: { full_name: activeForm.customer.trim(), phone: activeForm.customerPhone.trim() },
            p_discount: 0,
            p_note: [activeForm.description, quote ? `Cotización ${quote.quote_code}` : ''].filter(Boolean).join(' · '),
            p_allow_backorder: true,
            p_lines: Array.from({ length: quantity }, (_, index) => ({ catalog_product_id: activeForm.productId || null, sku: chosenProduct?.id || '', description: activeForm.description || chosenProduct?.name || 'Venta POS', quantity: 1, unit_price: (base + (index < remainder ? 1 : 0)) / 100 })),
            p_payments: initialPaid > 0 ? [{ method: METHODS[activeForm.method], amount: cents(initialPaid) / 100 }] : [],
          },
        };
        sessionStorage.setItem(saleStorageKey, JSON.stringify(operation));
        setPendingSale(operation);
      }
      const { data: sale, error } = await supabase.rpc('create_pos_sale_idempotent', { p_idempotency_key: operation.key, ...operation.payload });
      if (error) {
        if (isDefiniteRejection(error)) {
          sessionStorage.removeItem(saleStorageKey);
          setPendingSale(null);
          rejected = true;
        }
        throw error;
      }
      sessionStorage.removeItem(saleStorageKey);
      setPendingSale(null);
      setLastResult(sale);
      setForm(emptyForm());
      let quoteLinkError = '';
      if (operation.form.quoteId) {
        const { error: linkError } = await supabase.rpc('link_pos_sale_to_central_quote', { p_sale: sale.sale_id, p_quote: operation.form.quoteId });
        if (linkError) quoteLinkError = linkError.message;
        else setCentralQuotes((rows) => rows.map((row) => row.id === operation.form.quoteId ? { ...row, status: 'converted' } : row));
      }
      await refreshRemote();
      flash(quoteLinkError ? `Orden ${sale.sale_code} guardada; falta vincular la cotización: ${quoteLinkError}` : `Orden ${sale.sale_code} guardada${sale.backordered_quantity ? ' con compra urgente pendiente' : ''}.`);
    } catch (error) {
      flash(`${rejected ? 'El servidor rechazó la venta. Revisa los datos antes de confirmar otra vez.' : pendingSale || readPending(saleStorageKey) ? 'No se pudo confirmar el resultado. Reintenta la misma operación sin modificarla.' : 'No se inició la venta.'} ${error.message}`);
    } finally { saleLock.current = false; setSaleBusy(false); }
  };

  const registerPayment = async (event, sale) => {
    event.preventDefault();
    if (paymentLock.current || !canSell || !user || !organizationId) return;
    const retry = pendingPayment;
    const activeForm = retry?.form || paymentForm;
    const amount = Number(activeForm.amount);
    if (!retry && (!Number.isFinite(amount) || cents(amount) <= 0 || cents(amount) > cents(sale.balance))) { flash('El abono debe ser mayor a cero y no superar el saldo.'); return; }
    paymentLock.current = true;
    setPaymentBusy(true);
    let rejected = false;
    try {
      let operation = retry;
      if (!operation) {
        const legacyKeyName = `visualcorp-pos-payment-${sale.id}`;
        const legacyKey = sessionStorage.getItem(legacyKeyName);
        if (legacyKey) {
          const { data: previous, error } = await supabase.from('sale_payments').select('id').eq('organization_id', organizationId).eq('sale_id', sale.id).eq('idempotency_key', legacyKey).maybeSingle();
          if (error) throw error;
          sessionStorage.removeItem(legacyKeyName);
          if (previous) {
            await refreshRemote();
            flash('El abono anterior ya estaba registrado. Revisa el saldo antes de guardar otro.');
            return;
          }
        }
        if (activeForm.method === 'Efectivo') await assertOpenCashShift(sale.branchId);
        operation = { key: newKey('payment'), saleId: sale.id, form: activeForm, payload: { p_sale_id: sale.id, p_method: METHODS[activeForm.method], p_amount: cents(amount) / 100, p_reference: activeForm.reference.trim(), p_note: '' } };
        sessionStorage.setItem(paymentStorageKey, JSON.stringify(operation));
        setPendingPayment(operation);
      }
      const { data: result, error } = await supabase.rpc('record_sale_payment', { p_idempotency_key: operation.key, ...operation.payload });
      if (error) {
        if (isDefiniteRejection(error)) {
          sessionStorage.removeItem(paymentStorageKey);
          setPendingPayment(null);
          rejected = true;
          await refreshRemote();
        }
        throw error;
      }
      sessionStorage.removeItem(paymentStorageKey);
      setPendingPayment(null);
      setPaymentTarget(null);
      setPaymentForm({ amount: '', method: 'Efectivo', reference: '' });
      await refreshRemote();
      flash(`Abono registrado. Saldo actual: ${formatMoney(result.balance)}.`);
    } catch (error) {
      flash(`${rejected ? 'El servidor rechazó el abono. Revisa el saldo y los datos antes de intentar de nuevo.' : pendingPayment || readPending(paymentStorageKey) ? 'No se pudo confirmar el abono. Reintenta con los mismos datos.' : 'No se inició el abono.'} ${error.message}`);
    } finally { paymentLock.current = false; setPaymentBusy(false); }
  };

  const openPayment = (sale) => {
    if (pendingPayment && pendingPayment.saleId !== sale.id) return;
    setPaymentTarget(paymentTarget === sale.id && !pendingPayment ? null : sale.id);
    if (!pendingPayment) setPaymentForm({ amount: String(sale.balance), method: 'Efectivo', reference: '' });
  };

  return <div className="vcpos">
    <div className="vcpos-heading"><div><span className="eyebrow">PUNTO DE VENTA</span><h1>Caja y ventas</h1><p>Registra la venta y el cobro inicial en una sola operación. Los abonos quedan vinculados a la orden.</p></div><span className="vcpos-live"><i/> Registro compartido</span></div>
    <div className="vcpos-stats"><div><span>Ventas de hoy</span><strong>{formatMoney(todaySales.reduce((sum, sale) => sum + sale.total, 0))}</strong><small>{todaySales.length} órdenes confirmadas</small></div><div><span>Cobrado en órdenes de hoy</span><strong>{formatMoney(todaySales.reduce((sum, sale) => sum + sale.paid, 0))}</strong><small>Incluye abonos registrados después</small></div><div><span>Con saldo pendiente</span><strong>{pendingCount}</strong><small>Entre las 500 órdenes recientes</small></div></div>
    {!canSell && <div className="vcpos-warning" role="status"><AlertTriangle size={17}/> Tu rol puede consultar, pero no registrar ventas ni abonos.</div>}
    {lastResult && <div className="vcpos-success" role="status"><Check size={18}/><span><b>Orden {lastResult.sale_code} confirmada.</b> Total {formatMoney(lastResult.total)} · Abonado {formatMoney(lastResult.paid)} · Saldo {formatMoney(lastResult.balance)}{lastResult.backordered_quantity > 0 ? ' · Compra urgente pendiente' : ''}</span></div>}
    <div className="vcpos-layout"><section className="panel vcpos-sale"><div className="vcpos-section-head"><span className="vcpos-step">1</span><div><span className="eyebrow">NUEVA ORDEN</span><h2>Datos de la venta</h2></div><ShoppingCart size={20}/></div>
      {pendingSale && <div className="vcpos-warning" role="status"><AlertTriangle size={18}/><span>El resultado de esta venta está pendiente de confirmar. El formulario queda fijo para reintentar con la misma clave y evitar duplicados.</span></div>}
      <form onSubmit={save}><fieldset disabled={!canSell || saleBusy || Boolean(pendingSale)} className="vcpos-fields"><Field label="Cotización aprobada"><select value={form.quoteId} onChange={(event) => chooseQuote(event.target.value)}><option value="">Venta manual</option>{centralQuotes.filter((quote) => quote.status === 'accepted' && quote.price_confirmed && quote.selected_total !== null).map((quote) => <option key={quote.id} value={quote.id}>{quote.quote_code} · {quote.customer_name || 'Cliente'} · {formatMoney(quote.selected_total)}</option>)}</select></Field>
      <div className="vcpos-two"><Field label="Sucursal"><select value={form.branchCode} onChange={(event) => setField('branchCode', event.target.value)}><option value="VIS">Visual Corp</option><option value="GIGA">Gigaprint</option></select></Field><Field label="Cantidad" hint="Solo unidades enteras verificadas"><input type="number" min="1" step="1" required value={form.quantity} onChange={(event) => setField('quantity', event.target.value)}/></Field></div>
      <Field label="Producto o servicio"><select value={form.productId} onChange={(event) => setField('productId', event.target.value)}><option value="">Concepto libre / servicio sin stock</option>{data.catalog.map((product) => <option key={product.id} value={product.id}>{product.family} · {product.name}</option>)}</select></Field>
      {selectedProduct && <div className="vcpos-stock"><AlertTriangle size={17}/><span><b>{stockItem ? `${stockItem.name}${stockItem.variant ? ` · ${stockItem.variant}` : ''}` : productLink ? 'Variante vinculada sin saldo en esta ubicación' : 'Sin vínculo físico'}</b><small>{stockItem ? stockItem.sourceStatus ? 'Conteo físico pendiente. Si confirmas, el faltante se marca como compra urgente.' : `Disponible: ${stockItem.quantity} ${stockItem.unit} en ${branchName}.` : productLink ? 'La venta marcará el faltante como compra urgente.' : 'Esta línea no moverá inventario hasta que se vincule una variante en Inventario.'}</small></span></div>}
      <Field label="Cliente existente"><select value={form.customerId} onChange={(event) => chooseCustomer(event.target.value)}><option value="">Nuevo cliente / sin asociar</option>{data.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></Field>
      <div className="vcpos-two"><Field label="Nombre del cliente"><input value={form.customer} onChange={(event) => setForm((current) => ({ ...current, customerId: '', customer: event.target.value }))} placeholder="Nombre o razón social"/></Field><Field label="Teléfono"><input type="tel" value={form.customerPhone} onChange={(event) => setForm((current) => ({ ...current, customerId: '', customerPhone: event.target.value }))} placeholder="Opcional"/></Field></div>
      <Field label="Concepto / notas"><textarea rows="2" value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder={selectedProduct?.name || 'Describe el producto o servicio'}/></Field>
      <Field label="Valor acordado (USD)"><input type="number" min="0.01" step="0.01" required value={form.total} readOnly={Boolean(form.quoteId)} onChange={(event) => setField('total', event.target.value)} placeholder="0,00"/></Field></fieldset>
      <div className="vcpos-section-head vcpos-payment-head"><span className="vcpos-step">2</span><div><span className="eyebrow">COBRO INICIAL</span><h2>¿Cuánto recibes ahora?</h2></div><CreditCard size={20}/></div>
      <fieldset disabled={!canSell || saleBusy || Boolean(pendingSale)} className="vcpos-fields"><div className="vcpos-choices" role="group" aria-label="Cobro inicial">{[['full','Pago total'],['partial','Abono'],['none','Sin pago ahora']].map(([value,label]) => <button key={value} type="button" className={form.paymentKind === value ? 'selected' : ''} aria-pressed={form.paymentKind === value} onClick={() => setField('paymentKind', value)}>{label}</button>)}</div>{form.paymentKind === 'partial' && <Field label="Monto recibido (USD)"><input type="number" min="0.01" max={form.total || undefined} step="0.01" required value={form.amountPaid} onChange={(event) => setField('amountPaid', event.target.value)} placeholder="0,00"/></Field>}{form.paymentKind !== 'none' && <Field label="Forma de pago"><select value={form.method} onChange={(event) => setField('method', event.target.value)}>{Object.keys(METHODS).map((method) => <option key={method}>{method}</option>)}</select></Field>}</fieldset>
      <div className="vcpos-total"><div><span>Total de la orden</span><b>{formatMoney(total)}</b></div><div><span>Recibido ahora</span><b>{formatMoney(paidNow)}</b></div><div className="vcpos-balance"><span>Saldo posterior</span><strong>{formatMoney(balance)}</strong></div></div>
      <button className="button button-dark vcpos-submit" type="submit" disabled={!canSell || saleBusy}>{saleBusy ? 'Confirmando…' : pendingSale ? 'Reintentar la misma venta' : 'Confirmar venta'} <ArrowRight size={17}/></button><p className="vcpos-footnote"><CircleHelp size={14}/> La orden se registra al confirmar, aunque el cliente deje saldo. Un faltante vinculado queda como compra urgente.</p></form>
    </section>
    <section className="panel vcpos-orders"><div className="vcpos-section-head"><span className="vcpos-step">3</span><div><span className="eyebrow">SEGUIMIENTO DE COBROS</span><h2>Órdenes recientes</h2></div><Wallet size={20}/></div><div className="vcpos-order-tools"><div className="vcpos-choices" role="group" aria-label="Filtrar órdenes"><button type="button" className={saleFilter === 'pending' ? 'selected' : ''} aria-pressed={saleFilter === 'pending'} onClick={() => setSaleFilter('pending')}>Con saldo ({pendingCount})</button><button type="button" className={saleFilter === 'all' ? 'selected' : ''} aria-pressed={saleFilter === 'all'} onClick={() => setSaleFilter('all')}>Todas</button></div><label className="vcpos-search"><Search size={17}/><input value={saleSearch} onChange={(event) => setSaleSearch(event.target.value)} placeholder="Buscar orden o cliente" aria-label="Buscar orden o cliente"/></label></div>
      {visibleSales.length === 0 ? <div className="vcpos-empty">{saleFilter === 'pending' ? 'No hay saldos pendientes entre las órdenes recientes.' : 'No se encontraron órdenes recientes.'}</div> : <div className="vcpos-order-list">{visibleSales.map((sale) => <article key={sale.id} className="vcpos-order"><div className="vcpos-order-top"><div><b>{sale.customer || sale.description || 'Venta de mostrador'}</b><small>{sale.code} · {sale.branchName || sale.branchCode} · {new Date(sale.date).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</small></div><strong>{formatMoney(sale.total)}</strong></div><div className="vcpos-order-status"><span>Abonado <b>{formatMoney(sale.paid)}</b></span><span>Saldo <b>{formatMoney(sale.balance)}</b></span>{sale.urgent && <em>Compra urgente</em>}</div>{sale.balance > 0 && <><button className="button button-outline vcpos-abono-button" type="button" disabled={!canSell || Boolean(pendingPayment && pendingPayment.saleId !== sale.id)} onClick={() => openPayment(sale)}>{paymentTarget === sale.id ? 'Cerrar cobro' : 'Registrar abono'}</button>{paymentTarget === sale.id && <form className="vcpos-abono" onSubmit={(event) => registerPayment(event, sale)}><p>Saldo disponible: <b>{formatMoney(sale.balance)}</b></p>{pendingPayment && <div className="vcpos-warning"><AlertTriangle size={16}/> Resultado pendiente. Reintenta exactamente el mismo abono.</div>}<fieldset disabled={paymentBusy || Boolean(pendingPayment)} className="vcpos-abono-fields"><Field label="Monto recibido"><input type="number" min="0.01" max={sale.balance} step="0.01" required value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}/></Field><Field label="Forma de pago"><select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })}>{Object.keys(METHODS).map((method) => <option key={method}>{method}</option>)}</select></Field><Field label="Referencia" hint="Opcional; número de transferencia o comprobante"><input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} placeholder="Referencia del pago"/></Field></fieldset><button className="button button-dark" type="submit" disabled={paymentBusy || !canSell}>{paymentBusy ? 'Guardando…' : pendingPayment ? 'Reintentar abono' : 'Guardar abono'}</button></form>}</>}</article>)}</div>}
      <p className="vcpos-footnote"><CircleHelp size={14}/> Muestra hasta 80 resultados de las 500 órdenes más recientes. El recibo de esta pantalla es interno; no sustituye un comprobante tributario.</p></section></div></div>;
}
