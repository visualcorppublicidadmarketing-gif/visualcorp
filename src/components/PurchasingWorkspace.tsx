import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowRight, CalendarDays, Check, ChevronDown, CircleAlert, ClipboardList, Clock3, Mail, PackageCheck, Pencil, Plus, RefreshCw, Search, Send, ShoppingCart, Truck, Users, X } from 'lucide-react';
import { useWorkspace, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { NumberTicker } from './ui/MagicComponents';
import { supabase } from '../lib/supabaseClient';
import './PurchasingWorkspace.css';

const blankSupplier = () => ({ name: '', contact_name: '', phone: '', email: '', tax_id: '', address: '', notes: '' });
const blankLine = () => ({ variant_id: '', quantity_ordered: '', unit_cost: '' });
const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const states: Record<string, string> = { draft: 'Borrador', ordered: 'Enviada', partially_received: 'Recepción parcial', received: 'Recibida', cancelled: 'Cancelada' };
const orderPageSize = 50;
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const quantity = (value: unknown) => new Intl.NumberFormat('es-EC', { maximumFractionDigits: 3 }).format(Number(value) || 0);

function VariantPicker({ itemId, variants, selectedId, excludedIds, onSelect }: { itemId: string; variants: any[]; selectedId: string; excludedIds: Set<string>; onSelect: (id: string) => void }) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = variants.find((item) => item.variantId === selectedId);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { if (selected) setSearch(`${selected.name}${selected.variant ? ` · ${selected.variant}` : ''}`); }, [selected?.variantId]);
  const matches = useMemo(() => {
    const term = normalize(search.trim());
    return variants.filter((item) => {
      if (excludedIds.has(item.variantId) && item.variantId !== selectedId) return false;
      return !term || normalize(`${item.name} ${item.variant} ${item.sku} ${item.variantSku} ${item.category} ${item.unit}`).includes(term);
    }).slice(0, 40);
  }, [variants, search, excludedIds, selectedId]);

  const choose = (item: any) => { onSelect(item.variantId); setSearch(`${item.name}${item.variant ? ` · ${item.variant}` : ''}`); setOpen(false); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); setOpen(true); window.requestAnimationFrame(() => document.getElementById(`${listId}-option-0`)?.focus()); }
    if (event.key === 'Enter' && open && matches.length) { event.preventDefault(); choose(matches[0]); }
  };

  return <div className="purchase-variant-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <div className="purchase-variant-input"><Search size={15}/><input ref={inputRef} id={itemId} type="text" role="combobox" aria-label="Buscar artículo o variante" aria-autocomplete="list" aria-expanded={open} aria-controls={`${listId}-options`} autoComplete="off" value={search} onFocus={(event) => { event.currentTarget.select(); setOpen(true); }} onChange={(event) => { setSearch(event.target.value); onSelect(''); setOpen(true); }} onKeyDown={handleKeyDown} placeholder="Escribe nombre, SKU o variante…"/><ChevronDown size={14}/></div>
    {open && <div className="purchase-variant-options" id={`${listId}-options`} role="listbox">
      {matches.length ? matches.map((item, index) => <button id={`${listId}-option-${index}`} type="button" role="option" aria-selected={item.variantId === selectedId} key={item.variantId} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
        <span><b>{item.name}{item.variant ? ` · ${item.variant}` : ''}</b><small>{item.sku || item.variantSku || 'Sin SKU'} · {item.unit || 'unidad'}{item.category ? ` · ${item.category}` : ''}</small></span>
        {item.variantId === selectedId && <Check size={15}/>}
      </button>) : <p>No encontramos artículos con ese nombre.</p>}
      {matches.length === 40 && <small className="purchase-variant-limit">Mostrando 40 coincidencias. Afina la búsqueda para ver menos resultados.</small>}
    </div>}
  </div>;
}

export function PurchasingWorkspace() {
  const { data, flash } = useWorkspace();
  const { organizationId, user, hasPermission } = useAuth();
  const [routeParams, setRouteParams] = useSearchParams();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderLines, setOrderLines] = useState<Record<string, any[]>>({});
  const [receipts, setReceipts] = useState<Record<string, any[]>>({});
  const [orderCounts, setOrderCounts] = useState({ total: 0, open: 0, partial: 0, drafts: 0, received: 0 });
  const [orderCountsStatus, setOrderCountsStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const orderCountsRequestVersion = useRef(0);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todas');
  const [activeView, setActiveView] = useState<'overview' | 'orders' | 'suppliers'>('overview');
  const [supplierDraft, setSupplierDraft] = useState<any>(blankSupplier());
  const [supplierEditTarget, setSupplierEditTarget] = useState<any>(null);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [showArchivedSuppliers, setShowArchivedSuppliers] = useState(false);
  const [archiveSupplierTarget, setArchiveSupplierTarget] = useState<any>(null);
  const [orderDraft, setOrderDraft] = useState<any>(null);
  const [receiveOrder, setReceiveOrder] = useState<any>(null);
  const [cancelOrderTarget, setCancelOrderTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [receiveDraft, setReceiveDraft] = useState<any>({ quantities: {}, reference: '', note: '', location: 'MAIN', idempotencyKey: '' });
  const requestVersion = useRef(0);

  const canManage = hasPermission('purchases', 'edit');
  const canApprove = hasPermission('purchases', 'approve_purchase');
  const canCancel = hasPermission('purchases', 'cancel_purchase');
  const canReceive = hasPermission('purchases', 'receive_purchase');
  const canEditInventoryCosts = hasPermission('inventory_costs', 'edit_costs');
  const variants = useMemo(() => {
    const distinct = new Map<string, any>();
    (data.inventory || []).filter((row) => !row.archived && row.variantId).forEach((row) => {
      if (!distinct.has(row.variantId)) distinct.set(row.variantId, row);
    });
    return [...distinct.values()].sort((a, b) => `${a.name} ${a.variant}`.localeCompare(`${b.name} ${b.variant}`, 'es'));
  }, [data.inventory]);
  const activeReceiptLocations = useMemo(() => (data.inventoryLocations || []).filter((location) => location.active && location.branchId === receiveOrder?.branch_id), [data.inventoryLocations, receiveOrder?.branch_id]);

  const refresh = useCallback(async (append = false, offset = 0) => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    const version = ++requestVersion.current;
    if (append) setLoadingMore(true);
    else { setLoading(true); setOrders([]); setOrderLines({}); setReceipts({}); }
    setError('');
    try {
      const [supplierResult, branchResult] = await Promise.all([
        supabase.from('suppliers').select('id,name,contact_name,phone,email,tax_id,address,notes,active,created_at').eq('organization_id', organizationId).order('name'),
        supabase.from('branches').select('id,code,name,active').eq('organization_id', organizationId).eq('active', true).order('name'),
      ]);
      if (supplierResult.error || branchResult.error) throw supplierResult.error || branchResult.error;
      const nextSuppliers = supplierResult.data || [];
      const needle = search.trim().replace(/[(),"']/g, ' ').replace(/\s+/g, ' ').trim();
      let orderQuery = supabase.from('purchase_orders')
        .select('id,order_number,organization_id,branch_id,supplier_id,status,expected_date,currency,note,created_by,created_at,submitted_at,cancelled_by,cancelled_at,cancellation_reason', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + orderPageSize - 1);
      if (statusFilter === 'open') orderQuery = orderQuery.in('status', ['ordered', 'partially_received']);
      else if (statusFilter !== 'Todas') orderQuery = orderQuery.eq('status', statusFilter);
      if (needle) {
        const supplierIds = nextSuppliers.filter((supplier) => normalize(`${supplier.name} ${supplier.contact_name} ${supplier.email} ${supplier.tax_id}`).includes(normalize(needle))).map((supplier) => supplier.id);
        const pattern = `%${needle}%`;
        const filters = [`order_number.ilike.${pattern}`, `note.ilike.${pattern}`];
        if (supplierIds.length) filters.push(`supplier_id.in.(${supplierIds.join(',')})`);
        orderQuery = orderQuery.or(filters.join(','));
      }
      const orderResult = await orderQuery;
      if (orderResult.error) throw orderResult.error;
      const nextOrders = orderResult.data || [];
      const orderIds = nextOrders.map((order) => order.id);
      const [lineResult, receiptResult] = orderIds.length ? await Promise.all([
        supabase.from('purchase_order_lines').select('id,purchase_order_id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_ordered,quantity_received,unit_cost,organization_id').eq('organization_id', organizationId).in('purchase_order_id', orderIds),
        supabase.from('purchase_receipts').select('id,purchase_order_id,reference,note,received_by,received_at').eq('organization_id', organizationId).in('purchase_order_id', orderIds).order('received_at', { ascending: false }),
      ]) : [{ data: [], error: null }, { data: [], error: null }];
      if (lineResult.error || receiptResult.error) throw lineResult.error || receiptResult.error;
      if (version !== requestVersion.current) return;
      const nextLines = (lineResult.data || []).reduce((acc: Record<string, any[]>, line: any) => { (acc[line.purchase_order_id] ||= []).push(line); return acc; }, {});
      const nextReceipts = (receiptResult.data || []).reduce((acc: Record<string, any[]>, receipt: any) => { (acc[receipt.purchase_order_id] ||= []).push(receipt); return acc; }, {});
      setSuppliers(nextSuppliers);
      setBranches(branchResult.data || []);
      setOrders((current) => append ? [...current, ...nextOrders] : nextOrders);
      setOrderLines((current) => append ? { ...current, ...nextLines } : nextLines);
      setReceipts((current) => append ? { ...current, ...nextReceipts } : nextReceipts);
      setOrderCount(orderResult.count || 0);
    } catch (loadError: any) {
      if (version === requestVersion.current) setError(`No se pudo cargar Compras: ${loadError?.message || 'Revisa la conexión e intenta actualizar.'}`);
    } finally {
      if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [organizationId, search, statusFilter]);

  const loadOrderCounts = useCallback(async () => {
    const version = ++orderCountsRequestVersion.current;
    if (!supabase || !organizationId) {
      setOrderCountsStatus('error');
      return;
    }
    setOrderCountsStatus('loading');
    const count = (statuses?: string[]) => {
      let query = supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId);
      query = statuses?.length === 1 ? query.eq('status', statuses[0]) : query.in('status', statuses || []);
      return query;
    };
    try {
      const [all, open, partial, drafts, received] = await Promise.all([
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
        count(['ordered', 'partially_received']), count(['partially_received']), count(['draft']), count(['received']),
      ]);
      if (version !== orderCountsRequestVersion.current) return;
      if ([all, open, partial, drafts, received].some((result) => result.error || result.count === null)) throw new Error('count-query-failed');
      setOrderCounts({ total: all.count || 0, open: open.count || 0, partial: partial.count || 0, drafts: drafts.count || 0, received: received.count || 0 });
      setOrderCountsStatus('ready');
    } catch {
      if (version === orderCountsRequestVersion.current) setOrderCountsStatus('error');
    }
  }, [organizationId]);

  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, search ? 220 : 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => { void loadOrderCounts(); }, [loadOrderCounts]);
  useEffect(() => {
    const requestedOrder = routeParams.get('order')?.trim();
    if (!requestedOrder) return;
    setSearch(requestedOrder);
    setStatusFilter('Todas');
    setActiveView('orders');
  }, [routeParams.toString()]);

  const refreshAfterChange = async () => { await Promise.all([refresh(), loadOrderCounts()]); };
  const openSupplierForm = (supplier: any = null) => {
    setModalError(''); setSupplierEditTarget(supplier);
    setSupplierFormOpen(true);
    setSupplierDraft(supplier ? { name: supplier.name || '', contact_name: supplier.contact_name || '', phone: supplier.phone || '', email: supplier.email || '', tax_id: supplier.tax_id || '', address: supplier.address || '', notes: supplier.notes || '' } : blankSupplier());
  };

  const saveSupplier = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || !user || !organizationId || !supabase || !supplierDraft.name.trim()) return;
    setSaving(true); setModalError('');
    try {
      const fields = { ...supplierDraft, name: supplierDraft.name.trim(), contact_name: supplierDraft.contact_name.trim(), phone: supplierDraft.phone.trim(), email: supplierDraft.email.trim(), tax_id: supplierDraft.tax_id.trim(), address: supplierDraft.address.trim(), notes: supplierDraft.notes.trim(), updated_by: user.id, updated_at: new Date().toISOString() };
      const result = supplierEditTarget
        ? await supabase.from('suppliers').update(fields).eq('id', supplierEditTarget.id).eq('organization_id', organizationId).select('id').maybeSingle()
        : await supabase.from('suppliers').insert({ ...fields, organization_id: organizationId, created_by: user.id }).select('id').single();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('La base de datos no confirmó el cambio. Comprueba tu permiso para administrar proveedores.');
      setSupplierEditTarget(null); setSupplierFormOpen(false); setSupplierDraft(blankSupplier()); setModalError(''); await refreshAfterChange();
      flash(supplierEditTarget ? 'Datos del proveedor actualizados.' : 'Proveedor guardado.');
    } catch (saveError: any) {
      setModalError(saveError?.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : `No se guardó el proveedor: ${saveError?.message || 'revisa los datos e intenta de nuevo.'}`);
    } finally { setSaving(false); }
  };

  const setSupplierActive = async (supplier: any, active: boolean) => {
    if (!canManage || !user || !organizationId || !supabase) return;
    setSaving(true); setModalError('');
    try {
      const { data: saved, error: saveError } = await supabase.from('suppliers').update({ active, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', supplier.id).eq('organization_id', organizationId).select('id').maybeSingle();
      if (saveError) throw saveError;
      if (!saved) throw new Error('La base de datos no confirmó el cambio. Comprueba tu permiso para administrar proveedores.');
      setArchiveSupplierTarget(null); await refreshAfterChange();
      flash(active ? 'Proveedor reactivado.' : 'Proveedor archivado; se conservó su historial.');
    } catch (saveError: any) { const message = `No se actualizó el proveedor: ${saveError?.message || 'intenta de nuevo.'}`; if (active) setError(message); else setModalError(message); }
    finally { setSaving(false); }
  };

  const startOrder = (initial: any = {}) => {
    setModalError('');
    setOrderDraft({ supplier_id: '', branch_id: initial.branch_id || '', expected_date: '', note: initial.note || '', lines: initial.lines || [blankLine()] });
    setActiveView('orders');
  };
  const updateOrderLine = (index: number, patch: Record<string, string>) => setOrderDraft((current: any) => ({ ...current, lines: current.lines.map((line: any, row: number) => row === index ? { ...line, ...patch } : line) }));
  const orderEstimate = useMemo(() => (orderDraft?.lines || []).reduce((sum: number, line: any) => {
    const count = Number(line.quantity_ordered); const cost = Number(line.unit_cost);
    return Number.isFinite(count) && count > 0 && line.unit_cost !== '' && Number.isFinite(cost) && cost >= 0 ? sum + count * cost : sum;
  }, 0), [orderDraft]);

  const createOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || !orderDraft || !supabase || !organizationId) return;
    if (orderDraft.lines.some((line: any) => !line.variant_id || line.quantity_ordered === '' || line.unit_cost === '')) { setModalError('Completa o elimina cada artículo antes de guardar la orden.'); return; }
    const lines = orderDraft.lines.map((line: any) => ({ variant_id: line.variant_id, quantity_ordered: Number(line.quantity_ordered), unit_cost: Number(line.unit_cost) }));
    if (!orderDraft.branch_id || !orderDraft.supplier_id) { setModalError('Selecciona un proveedor y una sucursal.'); return; }
    if (!lines.length || lines.some((line: any) => !Number.isFinite(line.quantity_ordered) || line.quantity_ordered <= 0 || !Number.isFinite(line.unit_cost) || line.unit_cost < 0)) { setModalError('Completa cada artículo con una cantidad mayor que cero y un costo unitario confirmado.'); return; }
    if (new Set(lines.map((line: any) => line.variant_id)).size !== lines.length) { setModalError('Cada variante debe aparecer una sola vez. Ajusta la cantidad en una sola línea.'); return; }
    setSaving(true); setModalError('');
    try {
      const { data: orderId, error: saveError } = await supabase.rpc('create_purchase_order', { p_organization_id: organizationId, p_branch_id: orderDraft.branch_id, p_supplier_id: orderDraft.supplier_id, p_lines: lines, p_expected_date: orderDraft.expected_date || null, p_note: orderDraft.note || '' });
      if (saveError) throw saveError;
      if (!orderId) throw new Error('La base de datos no confirmó la orden.');
      setOrderDraft(null); setModalError(''); await refreshAfterChange(); flash('Orden guardada como borrador.');
    } catch (saveError: any) { setModalError(`No se creó el borrador: ${saveError?.message || 'revisa la conexión e intenta de nuevo.'}`); }
    finally { setSaving(false); }
  };

  const submitOrder = async (order: any) => {
    if (!canApprove || !supabase) return;
    setSaving(true); setError('');
    try {
      const { error: saveError } = await supabase.rpc('submit_purchase_order', { p_order_id: order.id });
      if (saveError) throw saveError;
      await refreshAfterChange(); flash(`Orden ${order.order_number} marcada como enviada.`);
    } catch (saveError: any) { setError(`No se pudo enviar ${order.order_number}: ${saveError?.message || 'intenta de nuevo.'}`); }
    finally { setSaving(false); }
  };

  const cancelOrder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCancel || !cancelOrderTarget || !supabase || !cancelReason.trim()) { setModalError('Escribe el motivo para continuar.'); return; }
    setSaving(true); setModalError('');
    try {
      const { error: saveError } = await supabase.rpc('cancel_purchase_order', { p_order_id: cancelOrderTarget.id, p_reason: cancelReason.trim() });
      if (saveError) throw saveError;
      const number = cancelOrderTarget.order_number; setCancelOrderTarget(null); setCancelReason(''); await refreshAfterChange(); flash(`Orden ${number} cancelada con motivo registrado.`);
    } catch (saveError: any) { setModalError(`No se canceló la orden: ${saveError?.message || 'intenta de nuevo.'}`); }
    finally { setSaving(false); }
  };

  const beginReceipt = (order: any) => {
    const lines = orderLines[order.id] || [];
    const locations = (data.inventoryLocations || []).filter((location) => location.active && location.branchId === order.branch_id);
    setModalError('');
    setReceiveDraft({ quantities: Object.fromEntries(lines.map((line) => [line.id, ''])), reference: '', note: '', location: locations.find((location) => location.code === 'MAIN')?.code || locations[0]?.code || 'MAIN', idempotencyKey: idempotencyKey() });
    setReceiveOrder(order);
  };

  const recordReceipt = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receiveOrder || !canReceive || !user || !supabase) return;
    const lines = (orderLines[receiveOrder.id] || []).filter((line) => receiveDraft.quantities[line.id] !== '' && Number(receiveDraft.quantities[line.id]) > 0).map((line) => ({ purchase_order_line_id: line.id, quantity_received: Number(receiveDraft.quantities[line.id]), location_code: receiveDraft.location.trim() || 'MAIN' }));
    if (!lines.length) { setModalError('Indica al menos una cantidad realmente recibida.'); return; }
    if (lines.some((line) => !Number.isFinite(line.quantity_received) || line.quantity_received <= 0)) { setModalError('Revisa las cantidades recibidas; cada una debe ser mayor que cero.'); return; }
    setSaving(true); setModalError('');
    try {
      const { error: saveError } = await supabase.rpc('receive_purchase_order', { p_order_id: receiveOrder.id, p_lines: lines, p_idempotency_key: receiveDraft.idempotencyKey, p_reference: receiveDraft.reference, p_note: receiveDraft.note });
      if (saveError) throw saveError;
      const number = receiveOrder.order_number; setReceiveOrder(null); setModalError(''); await refreshAfterChange(); flash(canEditInventoryCosts
        ? `Recepción de ${number} guardada. Solo lo recibido se refleja en inventario.`
        : `Recepción de ${number} guardada. El costo vigente no se actualizó; solicita su revisión a un perfil autorizado para editar costos.`);
    } catch (saveError: any) { setModalError(`No se registró la recepción: ${saveError?.message || 'la clave de reintento se mantiene para evitar duplicados.'}`); }
    finally { setSaving(false); }
  };

  const supplierById = useMemo(() => Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const visibleSuppliers = useMemo(() => suppliers.filter((supplier) => showArchivedSuppliers ? !supplier.active : supplier.active).filter((supplier) => normalize(`${supplier.name} ${supplier.contact_name} ${supplier.phone} ${supplier.email} ${supplier.tax_id}`).includes(normalize(supplierQuery.trim()))), [suppliers, showArchivedSuppliers, supplierQuery]);
  const shortages = useMemo(() => variants.filter((item) => !item.sourceStatus && Number(item.quantity) <= Number(item.minimum) && Number(item.minimum) > 0), [variants]);
  const priorityOrders = orders.filter((order) => ['ordered', 'partially_received'].includes(order.status)).slice(0, 5);
  const hasMoreOrders = orders.length < orderCount;
  const showOrders = (filter = 'Todas') => {
    setSearch('');
    setStatusFilter(filter);
    setActiveView('orders');
    if (routeParams.has('order')) {
      const next = new URLSearchParams(routeParams);
      next.delete('order');
      setRouteParams(next);
    }
  };
  const showSuppliers = () => {
    setSupplierQuery('');
    setShowArchivedSuppliers(false);
    setActiveView('suppliers');
  };

  return <div className="purchasing-workspace">
    <section className="purchasing-hero panel">
      <div className="purchasing-hero-copy"><span className="purchasing-kicker"><Truck size={14}/> ABASTECIMIENTO</span><h2>Del pedido a la recepción, en un solo lugar</h2><p>Organiza proveedores y órdenes. El inventario cambia cuando registras lo que realmente llegó.</p></div>
      <div className="purchasing-hero-actions"><button className="button button-outline" type="button" onClick={() => { setError(''); void refresh(); void loadOrderCounts(); }} disabled={loading || loadingMore}><RefreshCw size={15}/> Actualizar</button>{canManage && <button className="button button-outline" type="button" onClick={() => { openSupplierForm(); setActiveView('suppliers'); }}><Plus size={15}/> Proveedor</button>}{canManage && <button className="button button-dark" type="button" onClick={() => startOrder()} disabled={!suppliers.some((supplier) => supplier.active) || !variants.length || !branches.length}><ShoppingCart size={15}/> Nueva orden</button>}</div>
    </section>

    <section className="purchasing-summary" aria-label="Accesos rápidos de abastecimiento">
      <button type="button" className="purchasing-summary-card is-suppliers" aria-pressed={activeView === 'suppliers'} aria-label={`Ver ${suppliers.filter((supplier) => supplier.active).length} proveedores activos`} onClick={showSuppliers}><span><Users size={16}/> Proveedores activos</span><b><NumberTicker value={suppliers.filter((supplier) => supplier.active).length}/></b><small>Contactos comerciales</small><i>Ver proveedores <ArrowRight size={13}/></i></button>
      <button type="button" className={`purchasing-summary-card is-open-orders${activeView === 'orders' && statusFilter === 'open' ? ' is-active' : ''}`} aria-pressed={activeView === 'orders' && statusFilter === 'open'} aria-label={orderCountsStatus === 'ready' ? `Ver ${orderCounts.open} órdenes abiertas` : 'Órdenes abiertas; conteo no disponible'} onClick={() => showOrders('open')}><span><Clock3 size={16}/> Órdenes abiertas</span><b>{orderCountsStatus === 'ready' ? <NumberTicker value={orderCounts.open}/> : '—'}</b><small>{orderCountsStatus === 'ready' ? 'Enviadas o recepción parcial' : orderCountsStatus === 'loading' ? 'Confirmando el conteo…' : 'Conteo no disponible · actualiza para reintentar'}</small><i>Ver órdenes <ArrowRight size={13}/></i></button>
      <button type="button" className={`purchasing-summary-card is-partial-orders${activeView === 'orders' && statusFilter === 'partially_received' ? ' is-active' : ''}`} aria-pressed={activeView === 'orders' && statusFilter === 'partially_received'} aria-label={orderCountsStatus === 'ready' ? `Ver ${orderCounts.partial} órdenes con recepción parcial` : 'Órdenes con recepción parcial; conteo no disponible'} onClick={() => showOrders('partially_received')}><span><PackageCheck size={16}/> Recepción parcial</span><b>{orderCountsStatus === 'ready' ? <NumberTicker value={orderCounts.partial}/> : '—'}</b><small>{orderCountsStatus === 'ready' ? 'Con saldo por recibir' : orderCountsStatus === 'loading' ? 'Confirmando el conteo…' : 'Conteo no disponible · actualiza para reintentar'}</small><i>Revisar saldo <ArrowRight size={13}/></i></button>
      <a className="purchasing-summary-card is-shortages" href="/operaciones/inventario" aria-label={`Abrir materiales y existencias; ${shortages.length} artículos bajo mínimo confirmado`}><span><ClipboardList size={16}/> Bajo mínimo confirmado</span><b><NumberTicker value={shortages.length}/></b><small>Conteo físico y mínimo definidos</small><i>Abrir inventario <ArrowRight size={13}/></i></a>
    </section>

    <nav className="purchasing-nav" aria-label="Secciones de compras">
      <button type="button" className={activeView === 'overview' ? 'active' : ''} aria-pressed={activeView === 'overview'} onClick={() => setActiveView('overview')}><ClipboardList size={16}/><span>Resumen</span></button>
      <button type="button" className={activeView === 'orders' ? 'active' : ''} aria-pressed={activeView === 'orders'} aria-label={orderCountsStatus === 'ready' ? `Órdenes, ${orderCounts.total} en total` : `Órdenes, conteo ${orderCountsStatus === 'loading' ? 'cargando' : 'no disponible'}`} onClick={() => setActiveView('orders')}><ShoppingCart size={16}/><span>Órdenes</span><i>{orderCountsStatus === 'ready' ? orderCounts.total : '—'}</i></button>
      <button type="button" className={activeView === 'suppliers' ? 'active' : ''} aria-pressed={activeView === 'suppliers'} onClick={() => setActiveView('suppliers')}><Users size={16}/><span>Proveedores</span><i>{suppliers.filter((supplier) => supplier.active).length}</i></button>
    </nav>

    {error && <div className="purchasing-alert" role="alert"><CircleAlert size={17}/><span>{error}</span><button aria-label="Cerrar aviso" type="button" onClick={() => setError('')}><X size={16}/></button></div>}

    {activeView === 'overview' && <div className="purchasing-overview-grid">
      <section className="panel purchase-overview-attention"><div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO</span><h2>Órdenes que requieren atención</h2><p>Revisa entregas pendientes y su avance por artículo.</p></div><button className="button button-outline" type="button" onClick={() => setActiveView('orders')}>Ver órdenes <ArrowRight size={14}/></button></div>
        {loading ? <div className="purchasing-empty">Cargando órdenes…</div> : priorityOrders.length ? <div className="purchase-priority-list">{priorityOrders.map((order) => {
          const lines = orderLines[order.id] || [];
          const progress = lines.length ? Math.round(lines.reduce((sum, line) => sum + Math.min(1, Number(line.quantity_received) / Math.max(1, Number(line.quantity_ordered))), 0) / lines.length * 100) : 0;
          return <button className="purchase-priority-row" type="button" key={order.id} onClick={() => { const next = new URLSearchParams(routeParams); next.set('order', order.order_number); setRouteParams(next); setSearch(order.order_number); setStatusFilter('Todas'); setActiveView('orders'); }}><span className={`purchase-status status-${order.status}`}>{states[order.status]}</span><span className="purchase-priority-main"><b>{order.order_number}</b><small>{supplierById[order.supplier_id]?.name || 'Proveedor archivado'}{order.expected_date ? ` · Prevista ${new Date(`${order.expected_date}T12:00:00`).toLocaleDateString('es-EC')}` : ''}</small></span><span className="purchase-priority-progress"><b>{progress}%</b><small>{lines.length} {lines.length === 1 ? 'artículo' : 'artículos'}</small></span><ArrowRight size={15}/></button>;
        })}</div> : <div className="purchasing-empty"><PackageCheck size={20}/><span>No hay órdenes enviadas con recepción pendiente.</span></div>}
      </section>
      <section className="panel purchase-overview-shortages"><div className="panel-heading"><div><span className="eyebrow">REPOSICIÓN MANUAL</span><h2>Artículos bajo mínimo</h2><p>Solo se muestran saldos físicos confirmados. Revisa cantidad y costo antes de guardar.</p></div><span className="purchase-count-pill">{shortages.length}</span></div>
        {shortages.length ? <div className="purchase-suggestion-list">{shortages.slice(0, 8).map((item) => <article key={`${item.variantId}-${item.branchId}`}><span><b>{item.name}{item.variant ? ` · ${item.variant}` : ''}</b><small>{item.branch} · {quantity(item.quantity)} de mínimo {quantity(item.minimum)} {item.unit}</small></span>{canManage && <button className="button button-outline" type="button" onClick={() => startOrder({ branch_id: item.branchId, note: 'Reposición sugerida desde stock confirmado; revisa la cantidad y el costo antes de enviar.', lines: [{ variant_id: item.variantId, quantity_ordered: String(Math.max(Number(item.minimum) - Number(item.quantity), 0.001)), unit_cost: '' }] })}>Preparar borrador <ArrowRight size={14}/></button>}</article>)}</div> : <div className="purchasing-empty"><Check size={19}/><span>No hay artículos bajo el mínimo confirmado.</span></div>}
      </section>
      <div className="purchasing-footnote"><CircleAlert size={16}/><span>Los costos, cantidades, proveedores y condiciones se confirman manualmente. Las sugerencias no generan compras automáticamente.</span></div>
    </div>}

    {activeView === 'orders' && <section className="panel purchasing-orders">
      <div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO Y RECEPCIÓN</span><h2>Órdenes de compra</h2><p>Busca en órdenes, referencias y proveedores; abre cada pedido para revisar artículos, costos capturados y recepciones.</p></div>{canManage && <button className="button button-dark" type="button" onClick={() => startOrder()} disabled={!suppliers.some((supplier) => supplier.active) || !variants.length || !branches.length}><Plus size={15}/> Crear orden</button>}</div>
      {canManage && (!branches.length || !variants.length || !suppliers.some((supplier) => supplier.active)) && <div className="purchase-prerequisite" role="status"><CircleAlert size={16}/><span>{!suppliers.some((supplier) => supplier.active) ? 'Añade un proveedor activo' : !branches.length ? 'No hay sucursales activas disponibles para tu perfil' : 'No hay variantes de inventario activas disponibles'}. Al completar este dato podrás crear una orden.</span>{!suppliers.some((supplier) => supplier.active) && <button type="button" onClick={() => openSupplierForm()}>Añadir proveedor <ArrowRight size={14}/></button>}</div>}
      <div className="purchasing-toolbar"><label className="search-box"><Search size={16}/><input aria-label="Buscar órdenes" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="N.º de orden, proveedor, contacto o referencia"/>{search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => { setSearch(''); const next = new URLSearchParams(routeParams); next.delete('order'); setRouteParams(next); }}>×</button>}</label><label className="purchase-status-filter"><span>Estado</span><select aria-label="Filtrar órdenes por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todas</option><option value="open">Abiertas</option>{Object.entries(states).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><span className="purchase-results-count">{loading ? 'Buscando…' : `${orders.length} de ${orderCount} ${orderCount === 1 ? 'orden' : 'órdenes'}`}</span></div>
      {loading ? <div className="purchasing-empty"><RefreshCw size={18}/>Cargando órdenes…</div> : !orders.length ? <div className="purchasing-empty"><ClipboardList size={21}/><span>{orderCount ? 'No hay órdenes que coincidan con estos filtros.' : 'Aún no hay órdenes para mostrar.'}</span>{(search || statusFilter !== 'Todas') && <button className="button button-outline" type="button" onClick={() => { setSearch(''); setStatusFilter('Todas'); const next = new URLSearchParams(routeParams); next.delete('order'); setRouteParams(next); }}>Quitar filtros</button>}</div> : <div className="purchase-order-list">{orders.map((order) => {
        const lines = orderLines[order.id] || [];
        const value = lines.reduce((sum, line) => sum + Number(line.quantity_ordered) * Number(line.unit_cost), 0);
        const progress = lines.length ? Math.round(lines.reduce((sum, line) => sum + Math.min(1, Number(line.quantity_received) / Math.max(1, Number(line.quantity_ordered))), 0) / lines.length * 100) : 0;
        return <article className="purchase-order-card" key={order.id}>
          <header><div><span className={`purchase-status status-${order.status}`}>{states[order.status] || order.status}</span><h3>{order.order_number}</h3><p>{supplierById[order.supplier_id]?.name || 'Proveedor archivado'} · {branches.find((branch) => branch.id === order.branch_id)?.name || 'Sucursal'}</p></div><div className="purchase-order-total"><b>{formatMoney(value)}</b><small>USD según costos capturados · {lines.length} líneas</small></div></header>
          <div className="purchase-progress"><div><span>Avance promedio de artículos</span><b>{progress}%</b></div><span className="purchase-progress-track" role="progressbar" aria-label={`Avance promedio de artículos de ${order.order_number}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }}/></span>{order.expected_date && <small><CalendarDays size={13}/> Prevista {new Date(`${order.expected_date}T12:00:00`).toLocaleDateString('es-EC')}</small>}</div>
          <details className="purchase-order-details"><summary><span>{lines.length} {lines.length === 1 ? 'artículo' : 'artículos'} · <b>Ver detalle de la orden</b></span><ChevronDown size={15}/></summary><div className="purchase-lines">{lines.map((line) => {
            const pending = Math.max(0, Number(line.quantity_ordered) - Number(line.quantity_received));
            return <div className="purchase-line" key={line.id}><span><b>{line.description_snapshot}</b><small>{line.sku_snapshot || 'Sin SKU'} · {line.unit_snapshot || 'unidad'} · {formatMoney(line.unit_cost)} c/u</small></span><strong>{quantity(line.quantity_received)} / {quantity(line.quantity_ordered)} {line.unit_snapshot || ''}</strong><small>{pending > 0 ? `Pendiente ${quantity(pending)} ${line.unit_snapshot || ''}` : 'Completo'}</small></div>;
          })}</div>
          {!!(receipts[order.id] || []).length && <details className="purchase-receipt-history"><summary>Historial de recepciones ({receipts[order.id].length}) <ChevronDown size={14}/></summary>{receipts[order.id].map((receipt) => <div key={receipt.id}><span>{receipt.reference || 'Sin referencia'} · {new Date(receipt.received_at).toLocaleString('es-EC')}</span><small>{receipt.note || 'Sin nota'}</small></div>)}</details>}
          {(order.note || order.cancellation_reason) && <p className="purchase-order-note">{order.cancellation_reason ? `Cancelada el ${new Date(order.cancelled_at).toLocaleString('es-EC')} · motivo: ${order.cancellation_reason}` : order.note}</p>}</details>
          <footer>{order.status === 'draft' && canApprove && <button className="button button-outline" type="button" onClick={() => void submitOrder(order)} disabled={saving}><Send size={14}/> Marcar enviada</button>}{order.status === 'draft' && canCancel && <button className="button button-quiet" type="button" onClick={() => { setModalError(''); setCancelReason(''); setCancelOrderTarget(order); }} disabled={saving}>Cancelar orden</button>}{canReceive && ['ordered', 'partially_received'].includes(order.status) && <button className="button button-dark" type="button" onClick={() => beginReceipt(order)} disabled={saving}><Truck size={15}/> Registrar recepción</button>}</footer>
        </article>;
      })}</div>}
      {hasMoreOrders && !loading && <div className="purchase-load-more"><span>Mostrando las más recientes primero.</span><button className="button button-outline" type="button" onClick={() => void refresh(true, orders.length)} disabled={loadingMore}>{loadingMore ? 'Cargando…' : 'Cargar más órdenes'} <ChevronDown size={14}/></button></div>}
      <div className="purchasing-footnote"><CircleAlert size={16}/><span>Un borrador no cambia existencias. El inventario se actualiza al registrar cada recepción; las recepciones parciales conservan su trazabilidad.</span></div>
    </section>}

    {activeView === 'suppliers' && <section className="panel purchasing-suppliers">
      <div className="panel-heading"><div><span className="eyebrow">DIRECTORIO CENTRAL</span><h2>Proveedores</h2><p>Administra sus datos de contacto y conserva los registros archivados junto al historial de órdenes.</p></div>{canManage && <button className="button button-dark" type="button" onClick={() => openSupplierForm()}><Plus size={15}/> Nuevo proveedor</button>}</div>
      <div className="supplier-toolbar"><label className="search-box"><Search size={16}/><input aria-label="Buscar proveedores" value={supplierQuery} onChange={(event) => setSupplierQuery(event.target.value)} placeholder="Busca nombre, contacto, teléfono, correo o RUC"/>{supplierQuery && <button type="button" aria-label="Limpiar búsqueda de proveedores" onClick={() => setSupplierQuery('')}>×</button>}</label><button type="button" className={`supplier-archive-filter${showArchivedSuppliers ? ' active' : ''}`} aria-pressed={showArchivedSuppliers} onClick={() => setShowArchivedSuppliers((current) => !current)}>{showArchivedSuppliers ? <ArchiveRestore size={14}/> : <Archive size={14}/>} {showArchivedSuppliers ? 'Ver activos' : 'Ver archivados'} <i>{suppliers.filter((supplier) => showArchivedSuppliers ? !supplier.active : supplier.active).length}</i></button></div>
      {visibleSuppliers.length ? <div className="supplier-cards">{visibleSuppliers.map((supplier) => <article className={`supplier-card${supplier.active ? '' : ' is-archived'}`} key={supplier.id}>
        <span className="supplier-avatar">{supplier.name.slice(0, 1).toLocaleUpperCase('es')}</span><div className="supplier-card-main"><div className="supplier-card-heading"><b>{supplier.name}</b><span className={supplier.active ? 'supplier-state is-active' : 'supplier-state'}>{supplier.active ? 'Activo' : 'Archivado'}</span></div><small>{supplier.contact_name || 'Contacto pendiente'}</small><div className="supplier-contact-lines">{supplier.phone && <span>{supplier.phone}</span>}{supplier.email && <a href={`mailto:${supplier.email}`}><Mail size={12}/>{supplier.email}</a>}{supplier.tax_id && <span>RUC · {supplier.tax_id}</span>}</div>{supplier.address && <small>{supplier.address}</small>}</div>
        {canManage && <div className="supplier-card-actions"><button type="button" className="button button-outline" onClick={() => openSupplierForm(supplier)}><Pencil size={13}/> Editar</button>{supplier.active ? <button type="button" className="supplier-icon-action" aria-label={`Archivar ${supplier.name}`} title="Archivar proveedor" onClick={() => { setModalError(''); setArchiveSupplierTarget(supplier); }}><Archive size={15}/></button> : <button type="button" className="button button-outline" onClick={() => void setSupplierActive(supplier, true)} disabled={saving}><ArchiveRestore size={14}/> Reactivar</button>}</div>}
        <button className="supplier-orders-link" type="button" onClick={() => { setStatusFilter('Todas'); setSearch(supplier.name); const next = new URLSearchParams(routeParams); next.delete('order'); setRouteParams(next); setActiveView('orders'); }}>Ver órdenes del proveedor <ArrowRight size={13}/></button>
      </article>)}</div> : <div className="purchasing-empty"><Users size={21}/><span>{suppliers.length ? 'No encontramos proveedores con esos filtros.' : 'Aún no hay proveedores registrados.'}</span>{canManage && !supplierQuery && !showArchivedSuppliers && <button className="button button-outline" type="button" onClick={() => openSupplierForm()}><Plus size={14}/> Añadir primer proveedor</button>}</div>}
    </section>}

    {supplierFormOpen && <SupplierFormModal supplier={supplierEditTarget} draft={supplierDraft} setDraft={setSupplierDraft} saving={saving} error={modalError} onClose={() => { setSupplierFormOpen(false); setSupplierEditTarget(null); setSupplierDraft(blankSupplier()); setModalError(''); }} onSubmit={saveSupplier}/>}
    {archiveSupplierTarget && <div className="purchasing-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setArchiveSupplierTarget(null); }}><section className="purchasing-modal purchasing-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="archive-supplier-title"><span className="purchasing-modal-icon"><Archive size={19}/></span><h2 id="archive-supplier-title">¿Archivar a {archiveSupplierTarget.name}?</h2><p>El proveedor dejará de aparecer al crear órdenes. Su información y las órdenes anteriores se conservarán.</p>{modalError && <div className="purchasing-modal-error" role="alert">{modalError}</div>}<footer><button className="button button-outline" type="button" onClick={() => { setArchiveSupplierTarget(null); setModalError(''); }} disabled={saving}>Volver</button><button className="button button-dark" type="button" onClick={() => void setSupplierActive(archiveSupplierTarget, false)} disabled={saving}>{saving ? 'Archivando…' : 'Archivar proveedor'} <Archive size={14}/></button></footer></section></div>}
    {orderDraft && <div className="purchasing-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOrderDraft(null); }}><form className="purchasing-modal purchasing-order-modal" onSubmit={createOrder} role="dialog" aria-modal="true" aria-labelledby="new-purchase-title">
      <header><div><span className="eyebrow">ORDEN EN BORRADOR</span><h2 id="new-purchase-title">Nueva orden de compra</h2><p>Elige proveedor y sucursal, busca variantes y registra costos confirmados. Guardar crea un borrador, no lo envía.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => { setOrderDraft(null); setModalError(''); }} disabled={saving}><X size={18}/></button></header>
      <div className="purchasing-form purchasing-order-fields"><label>Proveedor<select required value={orderDraft.supplier_id} onChange={(event) => setOrderDraft({ ...orderDraft, supplier_id: event.target.value })}><option value="">Selecciona proveedor</option>{suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.contact_name ? ` · ${supplier.contact_name}` : ''}</option>)}</select></label><label>Sucursal<select required value={orderDraft.branch_id} onChange={(event) => setOrderDraft({ ...orderDraft, branch_id: event.target.value })}><option value="">Selecciona sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Fecha prevista<input type="date" value={orderDraft.expected_date} onChange={(event) => setOrderDraft({ ...orderDraft, expected_date: event.target.value })}/></label><label className="purchasing-wide">Nota o referencia<textarea rows={2} maxLength={2000} value={orderDraft.note} onChange={(event) => setOrderDraft({ ...orderDraft, note: event.target.value })} placeholder="Referencia del proveedor, solicitud interna u otra nota"/></label></div>
      <div className="order-line-editor"><div className="order-line-editor-heading"><span><b>Artículos solicitados</b><small>El costo no se rellena automáticamente.</small></span><button type="button" className="button button-outline" onClick={() => setOrderDraft({ ...orderDraft, lines: [...orderDraft.lines, blankLine()] })}><Plus size={14}/> Añadir artículo</button></div>
        {orderDraft.lines.map((line: any, index: number) => {
          const excludedIds = new Set<string>(orderDraft.lines.filter((_: any, row: number) => row !== index).map((row: any) => row.variant_id).filter(Boolean));
          const selectedVariant = variants.find((item) => item.variantId === line.variant_id);
          return <div className="order-line-inputs" key={`purchase-line-${index}`}>
            <label className="purchase-item-field"><span>Artículo o variante</span><VariantPicker itemId={`purchase-item-${index}`} variants={variants} selectedId={line.variant_id} excludedIds={excludedIds} onSelect={(variant_id) => updateOrderLine(index, { variant_id })}/>{selectedVariant && <small>{selectedVariant.sku || selectedVariant.variantSku || 'Sin SKU'} · unidad de compra: {selectedVariant.unit || 'unidad'}</small>}</label>
            <label>Cantidad pedida<input aria-label={`Cantidad pedida · línea ${index + 1}`} required type="number" min="0.001" step="0.001" value={line.quantity_ordered} onChange={(event) => updateOrderLine(index, { quantity_ordered: event.target.value })} placeholder="0"/></label>
            <label>Costo unitario USD<input aria-label={`Costo unitario USD · línea ${index + 1}`} required type="number" min="0" step="0.0001" value={line.unit_cost} onChange={(event) => updateOrderLine(index, { unit_cost: event.target.value })} placeholder="Por confirmar"/></label>
            {orderDraft.lines.length > 1 && <button type="button" className="purchase-line-remove" aria-label={`Quitar artículo ${index + 1}`} title="Quitar artículo" onClick={() => setOrderDraft({ ...orderDraft, lines: orderDraft.lines.filter((_: any, row: number) => row !== index) })}><X size={16}/></button>}
            {Number(line.quantity_ordered) > 0 && line.unit_cost !== '' && <small className="purchase-line-subtotal">Importe informado: {formatMoney(Number(line.quantity_ordered) * Number(line.unit_cost))}</small>}
          </div>;
        })}
      </div>
      <div className="purchase-order-estimate"><span><small>Total con costos ingresados</small><b>{formatMoney(orderEstimate)}</b></span><small>Estimación del borrador; verifica factura y condiciones al recibir.</small></div>
      {modalError && <div className="purchasing-modal-error" role="alert">{modalError}</div>}
      <footer><button type="button" className="button button-outline" onClick={() => { setOrderDraft(null); setModalError(''); }} disabled={saving}>Volver</button><button className="button button-dark" disabled={saving}>{saving ? 'Guardando…' : 'Guardar borrador'} <Check size={15}/></button></footer>
    </form></div>}
    {cancelOrderTarget && <div className="purchasing-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setCancelOrderTarget(null); }}><form className="purchasing-modal purchasing-confirm-modal" onSubmit={cancelOrder} role="dialog" aria-modal="true" aria-labelledby="cancel-purchase-title"><span className="purchasing-modal-icon is-warning"><CircleAlert size={19}/></span><h2 id="cancel-purchase-title">Cancelar {cancelOrderTarget.order_number}</h2><p>La orden no se borrará. Escribe el motivo para conservarlo en el historial.</p><label className="purchase-reason-field">Motivo de cancelación<textarea required autoFocus maxLength={500} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Indica por qué se cancela esta orden"/></label>{modalError && <div className="purchasing-modal-error" role="alert">{modalError}</div>}<footer><button className="button button-outline" type="button" onClick={() => { setCancelOrderTarget(null); setModalError(''); }} disabled={saving}>Conservar orden</button><button className="button button-dark" type="submit" disabled={saving || !cancelReason.trim()}>{saving ? 'Cancelando…' : 'Confirmar cancelación'} <X size={14}/></button></footer></form></div>}
    {receiveOrder && <div className="purchasing-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setReceiveOrder(null); }}><form className="purchasing-modal purchasing-receive-modal" onSubmit={recordReceipt} role="dialog" aria-modal="true" aria-labelledby="receive-purchase-title">
      <header><div><span className="eyebrow">RECEPCIÓN AUDITADA</span><h2 id="receive-purchase-title">Registrar recepción · {receiveOrder.order_number}</h2><p>Introduce solo lo que recibiste y verificaste. Si se reintenta el guardado, se reutiliza la misma clave para no duplicar movimientos.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => { setReceiveOrder(null); setModalError(''); }} disabled={saving}><X size={18}/></button></header>
      <label className="receipt-location">Ubicación de recepción<select required value={receiveDraft.location} onChange={(event) => setReceiveDraft({ ...receiveDraft, location: event.target.value })}>{activeReceiptLocations.map((location) => <option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}{!activeReceiptLocations.some((location) => location.code === 'MAIN') && <option value="MAIN">MAIN · Ubicación principal</option>}</select></label>
      <div className="receipt-line-editor">{(orderLines[receiveOrder.id] || []).map((line) => { const pending = Math.max(0, Number(line.quantity_ordered) - Number(line.quantity_received)); return <label className="receipt-line" key={line.id}><span><b>{line.description_snapshot}</b><small>{line.sku_snapshot || 'Sin SKU'} · Pendiente {quantity(pending)} {line.unit_snapshot}</small></span><span className="receipt-line-quantity"><input aria-label={`Cantidad recibida de ${line.description_snapshot}`} type="number" min="0" max={pending} step="0.001" value={receiveDraft.quantities[line.id]} onChange={(event) => setReceiveDraft({ ...receiveDraft, quantities: { ...receiveDraft.quantities, [line.id]: event.target.value } })}/><small>{line.unit_snapshot || 'unidad'}</small></span></label>; })}</div>
      <div className="purchasing-form purchasing-receipt-fields"><label>Factura, guía o referencia<input maxLength={180} value={receiveDraft.reference} onChange={(event) => setReceiveDraft({ ...receiveDraft, reference: event.target.value })} placeholder="Opcional"/></label><label className="purchasing-wide">Observaciones<textarea rows={2} maxLength={2000} value={receiveDraft.note} onChange={(event) => setReceiveDraft({ ...receiveDraft, note: event.target.value })} placeholder="Novedades de la recepción, si las hay"/></label></div>
      <div className="purchasing-footnote"><CircleAlert size={16}/><span>Solo las cantidades registradas actualizan inventario. La base de datos vuelve a validar el saldo pendiente.</span></div>
      {modalError && <div className="purchasing-modal-error" role="alert">{modalError}</div>}
      <footer><button type="button" className="button button-outline" onClick={() => { setReceiveOrder(null); setModalError(''); }} disabled={saving}>Volver</button><button className="button button-dark" disabled={saving}>{saving ? 'Registrando…' : 'Confirmar recepción'} <Check size={15}/></button></footer>
    </form></div>}
  </div>;
}

function SupplierFormModal({ supplier, draft, setDraft, saving, error, onClose, onSubmit }: { supplier: any; draft: any; setDraft: (next: any) => void; saving: boolean; error: string; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <div className="purchasing-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form className="purchasing-modal purchasing-supplier-modal" onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="supplier-form-title">
    <header><div><span className="eyebrow">DIRECTORIO COMERCIAL</span><h2 id="supplier-form-title">{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2><p>Guarda la información confirmada para que el equipo la encuentre al preparar una orden.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose} disabled={saving}><X size={18}/></button></header>
    <div className="purchasing-form"><label>Nombre comercial<input required autoFocus maxLength={180} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nombre del proveedor"/></label><label>Persona de contacto<input maxLength={180} value={draft.contact_name} onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })} placeholder="Opcional"/></label><label>Teléfono<input type="tel" maxLength={80} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="Opcional"/></label><label>Correo<input type="email" maxLength={254} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="nombre@empresa.com"/></label><label>RUC o identificación<input maxLength={80} value={draft.tax_id} onChange={(event) => setDraft({ ...draft, tax_id: event.target.value })} placeholder="Opcional"/></label><label>Dirección<input maxLength={300} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Opcional"/></label><label className="purchasing-wide">Notas<textarea rows={3} maxLength={2000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Detalles útiles para el equipo"/></label></div>
    {error && <div className="purchasing-modal-error" role="alert">{error}</div>}<footer><button type="button" className="button button-outline" onClick={onClose} disabled={saving}>Cancelar</button><button className="button button-dark" disabled={saving}>{saving ? 'Guardando…' : supplier ? 'Guardar cambios' : 'Guardar proveedor'} <Check size={15}/></button></footer>
  </form></div>;
}
