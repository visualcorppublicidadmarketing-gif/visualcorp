import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarDays, Check, ChevronDown, CircleAlert, ClipboardList, Plus, RefreshCw, Search, Send, Truck, X } from 'lucide-react';
import { useWorkspace, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './PurchasingWorkspace.css';

const blankSupplier = { name:'', contact_name:'', phone:'', email:'', tax_id:'', address:'', notes:'' };
const blankLine = () => ({ variant_id:'', quantity_ordered:'', unit_cost:'' });
const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const states = { draft:'Borrador', ordered:'Enviada', partially_received:'Recepción parcial', received:'Recibida', cancelled:'Cancelada' };

export function PurchasingWorkspace() {
  const { data, flash } = useWorkspace();
  const { organizationId, user, hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderLines, setOrderLines] = useState({});
  const [receipts, setReceipts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todas');
  const [supplierDraft, setSupplierDraft] = useState(blankSupplier);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [orderDraft, setOrderDraft] = useState(null);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [receiveDraft, setReceiveDraft] = useState({ quantities:{}, reference:'', note:'', location:'MAIN' });
  const canManage = hasPermission('purchases','edit');
  const canApprove = hasPermission('purchases','approve_purchase');
  const canCancel = hasPermission('purchases','cancel_purchase');
  const canReceive = hasPermission('purchases','receive_purchase');
  const variants = useMemo(() => {
    const distinct = new Map();
    (data.inventory || []).filter((row) => !row.archived).forEach((row) => {
      if (!distinct.has(row.variantId)) distinct.set(row.variantId, row);
    });
    return [...distinct.values()].sort((a,b) => `${a.name} ${a.variant}`.localeCompare(`${b.name} ${b.variant}`,'es'));
  }, [data.inventory]);
  const branches = useMemo(() => [...new Map((data.inventory || []).filter((row) => row.branchId).map((row) => [row.branchId,{id:row.branchId,name:row.branch}])).values()], [data.inventory]);

  const refresh = useCallback(async () => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    setLoading(true); setError('');
    const [supplierResult, orderResult] = await Promise.all([
      supabase.from('suppliers').select('id,name,contact_name,phone,email,tax_id,address,notes,active,created_at').eq('organization_id',organizationId).order('name'),
      supabase.from('purchase_orders').select('id,order_number,organization_id,branch_id,supplier_id,status,expected_date,currency,note,created_by,created_at,submitted_at,cancelled_by,cancelled_at,cancellation_reason').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(250),
    ]);
    const readError = supplierResult.error || orderResult.error;
    if (readError) { setError(`No se pudo cargar Compras: ${readError.message}`); setLoading(false); return; }
    const nextOrders = orderResult.data || [];
    const orderIds = nextOrders.map((order) => order.id);
    const [lineResult, receiptResult] = orderIds.length ? await Promise.all([
      supabase.from('purchase_order_lines').select('id,purchase_order_id,variant_id,description_snapshot,sku_snapshot,unit_snapshot,quantity_ordered,quantity_received,unit_cost,organization_id').eq('organization_id',organizationId).in('purchase_order_id',orderIds),
      supabase.from('purchase_receipts').select('id,purchase_order_id,reference,note,received_by,received_at').eq('organization_id',organizationId).in('purchase_order_id',orderIds).order('received_at',{ascending:false}),
    ]) : [{data:[],error:null},{data:[],error:null}];
    if (lineResult.error || receiptResult.error) { setError(`No se pudo cargar el detalle: ${(lineResult.error||receiptResult.error).message}`); setLoading(false); return; }
    setSuppliers(supplierResult.data || []);
    setOrders(nextOrders);
    setOrderLines((lineResult.data||[]).reduce((acc,line)=>{(acc[line.purchase_order_id] ||= []).push(line);return acc;},{}));
    setReceipts((receiptResult.data||[]).reduce((acc,receipt)=>{(acc[receipt.purchase_order_id] ||= []).push(receipt);return acc;},{}));
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveSupplier = async (event) => {
    event.preventDefault();
    if (!canManage || !user || !organizationId || !supplierDraft.name.trim()) return;
    setSaving(true);
    const { error: saveError } = await supabase.from('suppliers').insert({ ...supplierDraft, name:supplierDraft.name.trim(), organization_id:organizationId, created_by:user.id, updated_by:user.id });
    if (saveError) { setError(saveError.code==='23505'?'Ya existe un proveedor con ese nombre.':`No se guardó el proveedor: ${saveError.message}`); setSaving(false); return; }
    setSupplierDraft(blankSupplier); setShowSupplierForm(false); setSaving(false); await refresh(); flash('Proveedor guardado.');
  };

  const archiveSupplier = async (supplier) => {
    if (!canManage || !window.confirm(`¿Archivar a ${supplier.name}? Las órdenes históricas se conservarán.`)) return;
    const {error:saveError}=await supabase.from('suppliers').update({active:false,updated_by:user.id,updated_at:new Date().toISOString()}).eq('id',supplier.id).eq('organization_id',organizationId);
    if(saveError){setError(`No se archivó el proveedor: ${saveError.message}`);return;}
    await refresh(); flash('Proveedor archivado; se conservó su historial.');
  };

  const createOrder = async (event) => {
    event.preventDefault();
    if (!canManage || !orderDraft || !supabase) return;
    const lines = orderDraft.lines.filter((line)=>line.variant_id && line.quantity_ordered!=='' && line.unit_cost!=='').map((line)=>({variant_id:line.variant_id,quantity_ordered:Number(line.quantity_ordered),unit_cost:Number(line.unit_cost)}));
    if (!lines.length || lines.some((line)=>!Number.isFinite(line.quantity_ordered)||line.quantity_ordered<=0||!Number.isFinite(line.unit_cost)||line.unit_cost<0)) { setError('Completa artículo, cantidad positiva y costo confirmado en cada línea.'); return; }
    if (new Set(lines.map((line)=>line.variant_id)).size !== lines.length) { setError('Cada variante debe aparecer una sola vez. Combina las cantidades en una misma línea.'); return; }
    setSaving(true); setError('');
    const {data:orderId,error:saveError}=await supabase.rpc('create_purchase_order',{p_organization_id:organizationId,p_branch_id:orderDraft.branch_id,p_supplier_id:orderDraft.supplier_id,p_lines:lines,p_expected_date:orderDraft.expected_date||null,p_note:orderDraft.note||''});
    if(saveError){setError(`No se creó el borrador: ${saveError.message}`);setSaving(false);return;}
    setSaving(false);setOrderDraft(null);await refresh();flash('Orden guardada como borrador.');
  };

  const submitOrder = async (order) => {
    if (!canApprove || !window.confirm(`¿Marcar ${order.order_number} como enviada al proveedor?`)) return;
    setSaving(true); const {error:saveError}=await supabase.rpc('submit_purchase_order',{p_order_id:order.id});
    if(saveError){setError(`No se pudo enviar la orden: ${saveError.message}`);setSaving(false);return;}
    setSaving(false);await refresh();flash('Orden marcada como enviada.');
  };

  const cancelOrder = async (order) => {
    if (!canCancel) return;
    const reason=window.prompt(`Motivo de cancelación de ${order.order_number}:`);
    if(reason===null)return;
    if(!reason.trim()){setError('Escribe el motivo antes de cancelar la orden.');return;}
    setSaving(true);const {error:saveError}=await supabase.rpc('cancel_purchase_order',{p_order_id:order.id,p_reason:reason});
    if(saveError){setError(`No se pudo cancelar: ${saveError.message}`);setSaving(false);return;}
    setSaving(false);await refresh();flash('Orden cancelada con motivo.');
  };

  const beginReceipt = (order) => {
    const lines=orderLines[order.id]||[];
    setReceiveDraft({quantities:Object.fromEntries(lines.map((line)=>[line.id,''])),reference:'',note:'',location:'MAIN'});
    setReceiveOrder(order);
  };

  const recordReceipt = async (event) => {
    event.preventDefault(); if (!receiveOrder || !canReceive || !user) return;
    const lines=(orderLines[receiveOrder.id]||[]).filter((line)=>receiveDraft.quantities[line.id]!=='' && Number(receiveDraft.quantities[line.id])>0).map((line)=>({purchase_order_line_id:line.id,quantity_received:Number(receiveDraft.quantities[line.id]),location_code:receiveDraft.location.trim()||'MAIN'}));
    if(!lines.length){setError('Indica al menos una cantidad realmente recibida.');return;}
    setSaving(true);setError('');
    const {error:saveError}=await supabase.rpc('receive_purchase_order',{p_order_id:receiveOrder.id,p_lines:lines,p_idempotency_key:idempotencyKey(),p_reference:receiveDraft.reference,p_note:receiveDraft.note});
    if(saveError){setError(`No se registró la recepción: ${saveError.message}`);setSaving(false);return;}
    setSaving(false);setReceiveOrder(null);await refresh();flash('Recepción guardada. El stock refleja solo las cantidades recibidas.');
  };

  const supplierById=useMemo(()=>Object.fromEntries(suppliers.map((supplier)=>[supplier.id,supplier])),[suppliers]);
  const filteredOrders=orders.filter((order)=> (statusFilter==='Todas'||order.status===statusFilter) && `${order.order_number} ${supplierById[order.supplier_id]?.name||''} ${order.note}`.toLowerCase().includes(query.toLowerCase()));
  const totals={open:orders.filter((order)=>['ordered','partially_received'].includes(order.status)).length,partial:orders.filter((order)=>order.status==='partially_received').length,received:orders.filter((order)=>order.status==='received').length,suppliers:suppliers.filter((supplier)=>supplier.active).length};
  const shortages=variants.filter((item)=>!item.sourceStatus&&Number(item.quantity)<=Number(item.minimum)&&Number(item.minimum)>0);

  return <div className="purchasing-workspace">
    <div className="purchasing-summary">
      <article><span>Proveedores activos</span><b>{totals.suppliers}</b><small>Contactos confirmados</small></article>
      <article><span>Órdenes abiertas</span><b>{totals.open}</b><small>Enviadas o parcialmente recibidas</small></article>
      <article><span>Recepción parcial</span><b>{totals.partial}</b><small>Saldo pendiente de recibir</small></article>
      <article><span>Bajo mínimo confirmado</span><b>{shortages.length}</b><small>Sin incluir existencias sin conteo</small></article>
    </div>
    {error&&<div className="purchasing-alert" role="alert"><CircleAlert size={17}/><span>{error}</span><button aria-label="Cerrar aviso" onClick={()=>setError('')}><X size={16}/></button></div>}
    <section className="panel purchasing-suppliers">
      <div className="panel-heading"><div><span className="eyebrow">DIRECTORIO CENTRAL</span><h2>Proveedores</h2><p>Guarda solo datos comerciales confirmados. Los proveedores archivados siguen visibles en el historial de compras.</p></div><div className="purchasing-actions"><button className="button button-outline" onClick={()=>setShowSupplierForm((open)=>!open)} disabled={!canManage}><Plus size={15}/>{showSupplierForm?'Cerrar':'Nuevo proveedor'}</button></div></div>
      {showSupplierForm&&<form className="purchasing-form" onSubmit={saveSupplier}><label>Nombre comercial<input required maxLength="180" value={supplierDraft.name} onChange={(e)=>setSupplierDraft({...supplierDraft,name:e.target.value})}/></label><label>Contacto<input maxLength="180" value={supplierDraft.contact_name} onChange={(e)=>setSupplierDraft({...supplierDraft,contact_name:e.target.value})}/></label><label>Teléfono<input maxLength="80" value={supplierDraft.phone} onChange={(e)=>setSupplierDraft({...supplierDraft,phone:e.target.value})}/></label><label>Correo<input type="email" maxLength="254" value={supplierDraft.email} onChange={(e)=>setSupplierDraft({...supplierDraft,email:e.target.value})}/></label><label>RUC / identificación<input maxLength="80" value={supplierDraft.tax_id} onChange={(e)=>setSupplierDraft({...supplierDraft,tax_id:e.target.value})}/></label><label>Dirección<input maxLength="300" value={supplierDraft.address} onChange={(e)=>setSupplierDraft({...supplierDraft,address:e.target.value})}/></label><label className="purchasing-wide">Notas<textarea rows="2" maxLength="2000" value={supplierDraft.notes} onChange={(e)=>setSupplierDraft({...supplierDraft,notes:e.target.value})}/></label><div className="purchasing-wide purchasing-form-buttons"><button className="button button-dark" disabled={saving}>{saving?'Guardando…':'Guardar proveedor'} <Check size={15}/></button></div></form>}
      <div className="supplier-cards">{suppliers.filter((supplier)=>supplier.active).map((supplier)=><article className="supplier-card" key={supplier.id}><span className="supplier-avatar">{supplier.name.slice(0,1).toUpperCase()}</span><div><b>{supplier.name}</b><small>{[supplier.contact_name,supplier.phone,supplier.email].filter(Boolean).join(' · ')||'Sin contacto registrado'}</small>{supplier.tax_id&&<small>ID fiscal · {supplier.tax_id}</small>}</div>{canManage&&<button className="icon-button" title="Archivar proveedor" onClick={()=>archiveSupplier(supplier)}><Archive size={16}/></button>}</article>)}{!suppliers.some((supplier)=>supplier.active)&&<div className="purchasing-empty"><Truck size={20}/><span>No hay proveedores activos. Añade los contactos comerciales confirmados para empezar.</span></div>}</div>
    </section>
    <section className="panel purchasing-orders">
      <div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO Y RECEPCIÓN</span><h2>Órdenes de compra</h2><p>Un borrador no cambia existencias. El inventario se actualiza al registrar una recepción.</p></div>{canManage&&<button className="button button-dark" onClick={()=>{setError('');setOrderDraft({supplier_id:'',branch_id:'',expected_date:'',note:'',lines:[blankLine()]});}} disabled={!suppliers.some((supplier)=>supplier.active)||!variants.length||!branches.length}><Plus size={15}/> Crear orden</button>}</div>
      <div className="purchasing-toolbar"><label className="search-box"><Search size={16}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Buscar orden o proveedor"/></label><select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}><option>Todas</option>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="button button-outline" onClick={refresh}><RefreshCw size={15}/> Actualizar</button></div>
      {!!shortages.length&&<div className="purchase-suggestions"><div className="purchase-suggestions-heading"><div><b>Reposición sugerida</b><small>Solo saldo físico confirmado contra mínimo definido. Completa proveedor y costo antes de guardar.</small></div><span>{shortages.length}</span></div><div className="purchase-suggestion-list">{shortages.slice(0,8).map((item)=><article key={`${item.variantId}-${item.branchId}`}><span><b>{item.name}{item.variant?` · ${item.variant}`:''}</b><small>{item.branch} · {item.quantity} de mínimo {item.minimum} {item.unit}</small></span>{canManage&&<button className="button button-outline" onClick={()=>{setError('');setOrderDraft({supplier_id:'',branch_id:item.branchId,expected_date:'',note:'Reposición sugerida desde stock confirmado; revisar necesidad y cantidad antes de enviar.',lines:[{variant_id:item.variantId,quantity_ordered:String(Math.max(Number(item.minimum)-Number(item.quantity),0.001)),unit_cost:''}]});}}>Preparar borrador <ChevronDown size={14}/></button>}</article>)}</div></div>}
      {loading?<div className="purchasing-empty">Cargando órdenes y proveedores…</div>:!filteredOrders.length?<div className="purchasing-empty"><ClipboardList size={21}/><span>{orders.length?'No hay órdenes que coincidan con estos filtros.':'Aún no hay órdenes de compra registradas.'}</span></div>:<div className="purchase-order-list">{filteredOrders.map((order)=>{const lines=orderLines[order.id]||[];const received=lines.reduce((sum,line)=>sum+Number(line.quantity_received),0);const ordered=lines.reduce((sum,line)=>sum+Number(line.quantity_ordered),0);const value=lines.reduce((sum,line)=>sum+Number(line.quantity_ordered)*Number(line.unit_cost),0);return <article className="purchase-order-card" key={order.id}>
        <header><div><span className={`purchase-status status-${order.status}`}>{states[order.status]}</span><h3>{order.order_number}</h3><p>{supplierById[order.supplier_id]?.name||'Proveedor archivado'} · {branches.find((branch)=>branch.id===order.branch_id)?.name||'Sucursal'}</p></div><div className="purchase-order-total"><b>{formatMoney(value)}</b><small>USD estimado · {lines.length} líneas</small></div></header>
        <div className="purchase-progress"><div><span>Recibido</span><b>{received} / {ordered} unidades</b></div><span className="purchase-progress-track"><i style={{width:`${ordered?Math.min(100,received/ordered*100):0}%`}}/></span>{order.expected_date&&<small><CalendarDays size={13}/> Prevista {new Date(`${order.expected_date}T12:00:00`).toLocaleDateString('es-EC')}</small>}</div>
        <div className="purchase-lines">{lines.map((line)=><div className="purchase-line" key={line.id}><span><b>{line.description_snapshot}</b><small>{line.sku_snapshot} · {line.unit_snapshot} · {formatMoney(line.unit_cost)} c/u</small></span><strong>{line.quantity_received} / {line.quantity_ordered}</strong><small>pendiente {Math.max(0,Number(line.quantity_ordered)-Number(line.quantity_received))}</small></div>)}</div>
        {!!(receipts[order.id]||[]).length&&<details className="purchase-receipt-history"><summary>Recepciones registradas ({receipts[order.id].length}) <ChevronDown size={14}/></summary>{receipts[order.id].map((receipt)=><div key={receipt.id}><span>{receipt.reference||'Sin referencia'} · {new Date(receipt.received_at).toLocaleString('es-EC')}</span><small>{receipt.note||'Sin nota'}</small></div>)}</details>}
        {(order.note||order.cancellation_reason)&&<p className="purchase-order-note">{order.cancellation_reason?`Cancelada el ${new Date(order.cancelled_at).toLocaleString('es-EC')} · motivo: ${order.cancellation_reason}`:order.note}</p>}
        <footer>{order.status==='draft'&&canApprove&&<button className="button button-outline" onClick={()=>submitOrder(order)} disabled={saving}><Send size={14}/> Marcar enviada</button>}{order.status==='draft'&&canCancel&&<button className="button button-quiet" onClick={()=>cancelOrder(order)} disabled={saving}>Cancelar</button>}{canReceive&&['ordered','partially_received'].includes(order.status)&&<button className="button button-dark" onClick={()=>beginReceipt(order)} disabled={saving}><Truck size={15}/> Registrar recepción</button>}</footer>
      </article>;})}</div>}
    </section>
    <div className="purchasing-footnote"><CircleAlert size={16}/><span>Las sugerencias se basan solo en saldos de inventario con conteo físico confirmado y mínimos registrados. Costos y cantidades de compra se ingresan y confirman manualmente.</span></div>
    {orderDraft&&<div className="purchasing-backdrop"><form className="purchasing-modal" onSubmit={createOrder}><header><div><span className="eyebrow">ORDEN EN BORRADOR</span><h2>Nueva orden de compra</h2><p>Solo usa artículos activos. El costo es obligatorio para poder confirmar el borrador y no se estimará automáticamente.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={()=>setOrderDraft(null)}><X size={18}/></button></header><div className="purchasing-form"><label>Proveedor<select required value={orderDraft.supplier_id} onChange={(e)=>setOrderDraft({...orderDraft,supplier_id:e.target.value})}><option value="">Selecciona proveedor</option>{suppliers.filter((supplier)=>supplier.active).map((supplier)=><option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label>Sucursal<select required value={orderDraft.branch_id} onChange={(e)=>setOrderDraft({...orderDraft,branch_id:e.target.value})}><option value="">Selecciona sucursal</option>{branches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Fecha prevista<input type="date" value={orderDraft.expected_date} onChange={(e)=>setOrderDraft({...orderDraft,expected_date:e.target.value})}/></label><label className="purchasing-wide">Nota / referencia<textarea rows="2" maxLength="2000" value={orderDraft.note} onChange={(e)=>setOrderDraft({...orderDraft,note:e.target.value})}/></label></div><div className="order-line-editor"><div className="order-line-editor-heading"><b>Artículos</b><button type="button" className="button button-outline" onClick={()=>setOrderDraft({...orderDraft,lines:[...orderDraft.lines,blankLine()]})}><Plus size={14}/> Añadir línea</button></div>{orderDraft.lines.map((line,index)=><div className="order-line-inputs" key={index}><label>Artículo<select required value={line.variant_id} onChange={(e)=>setOrderDraft({...orderDraft,lines:orderDraft.lines.map((row,i)=>i===index?{...row,variant_id:e.target.value}:row)})}><option value="">Buscar artículo/variante</option>{variants.map((item)=><option key={item.variantId} value={item.variantId}>{item.name}{item.variant?` · ${item.variant}`:''} · {item.sku||item.variantSku} · {item.unit||'unidad'}</option>)}</select></label><label>Cantidad pedida<input required type="number" min="0.001" step="0.001" value={line.quantity_ordered} onChange={(e)=>setOrderDraft({...orderDraft,lines:orderDraft.lines.map((row,i)=>i===index?{...row,quantity_ordered:e.target.value}:row)})}/></label><label>Costo unitario USD<input required type="number" min="0" step="0.0001" value={line.unit_cost} onChange={(e)=>setOrderDraft({...orderDraft,lines:orderDraft.lines.map((row,i)=>i===index?{...row,unit_cost:e.target.value}:row)})}/></label>{orderDraft.lines.length>1&&<button type="button" className="icon-button" aria-label="Quitar línea" onClick={()=>setOrderDraft({...orderDraft,lines:orderDraft.lines.filter((_,i)=>i!==index)})}><X size={16}/></button>}</div>)}</div><footer><button type="button" className="button button-outline" onClick={()=>setOrderDraft(null)}>Volver</button><button className="button button-dark" disabled={saving}>{saving?'Guardando…':'Guardar borrador'} <Check size={15}/></button></footer></form></div>}
    {receiveOrder&&<div className="purchasing-backdrop"><form className="purchasing-modal" onSubmit={recordReceipt}><header><div><span className="eyebrow">RECEPCIÓN AUDITADA</span><h2>{receiveOrder.order_number}</h2><p>Registra solo cantidades verificadas al recibir. Cada envío de formulario tiene protección contra duplicados.</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={()=>setReceiveOrder(null)}><X size={18}/></button></header><label className="receipt-location">Ubicación de recepción<select required value={receiveDraft.location} onChange={(e)=>setReceiveDraft({...receiveDraft,location:e.target.value})}>{(data.inventoryLocations||[]).filter(location=>location.active&&location.branchId===receiveOrder.branch_id).map(location=><option key={location.id} value={location.code}>{location.code} · {location.name}</option>)}</select></label><div className="receipt-line-editor">{(orderLines[receiveOrder.id]||[]).map((line)=>{const pending=Number(line.quantity_ordered)-Number(line.quantity_received);return <label className="receipt-line" key={line.id}><span><b>{line.description_snapshot}</b><small>{line.sku_snapshot} · pendiente {pending} {line.unit_snapshot}</small></span><input aria-label={`Cantidad recibida de ${line.description_snapshot}`} type="number" min="0" max={pending} step="0.001" value={receiveDraft.quantities[line.id]} onChange={(e)=>setReceiveDraft({...receiveDraft,quantities:{...receiveDraft.quantities,[line.id]:e.target.value}})}/></label>;})}</div><div className="purchasing-form"><label>Factura / guía / referencia<input maxLength="180" value={receiveDraft.reference} onChange={(e)=>setReceiveDraft({...receiveDraft,reference:e.target.value})}/></label><label className="purchasing-wide">Observaciones<textarea rows="2" maxLength="2000" value={receiveDraft.note} onChange={(e)=>setReceiveDraft({...receiveDraft,note:e.target.value})}/></label></div><div className="purchasing-footnote"><CircleAlert size={16}/><span>Solo las unidades recibidas actualizan el saldo. No se puede recibir más que lo pendiente en cada línea.</span></div><footer><button type="button" className="button button-outline" onClick={()=>setReceiveOrder(null)}>Volver</button><button className="button button-dark" disabled={saving}>{saving?'Registrando…':'Confirmar recepción'} <Check size={15}/></button></footer></form></div>}
  </div>;
}
