import React, { useMemo, useState } from 'react';
import { ArrowLeft, Clock3, Search, UserRoundPlus, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace, formatDate, formatMoney } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';

type Customer = {
  id: string; name: string; phone: string; email: string; documentReference?: string; notes: string; createdAt: string;
  preferences?: Record<string, any>; tags?: string[];
};

export function CustomerBook() {
  const { data, add, flash } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCustomerId = searchParams.get('cliente') || '';
  const { organizationId, user, hasPermission } = useAuth();
  const canEdit = hasPermission('crm','edit');
  const canViewSales = hasPermission('sales','view');
  const canViewQuotes = hasPermission('quotes','view');
  const [term, setTerm] = useState('');
  const [remoteCustomers, setRemoteCustomers] = useState<Customer[] | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [selectedId, setSelectedId] = useState(requestedCustomerId);
  const [sales, setSales] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [interactionSummary, setInteractionSummary] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', documentReference: '', notes: '', interests: '', tags: '' });
  const selectCustomer = (id: string) => {
    setSelectedId(id);
    setSearchParams(id ? { cliente: id } : {}, { replace: true });
  };
  React.useEffect(() => { setSelectedId(requestedCustomerId); }, [requestedCustomerId]);
  React.useEffect(() => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    let active = true;
    supabase.from('customers').select('id,full_name,phone,email,document_reference,notes,created_at,preferences,tags').eq('organization_id', organizationId).order('created_at', { ascending: false }).then(({ data: rows, error }) => {
      if (!active) return;
      if (error) flash(`No se pudo cargar la base de clientes: ${error.message}`);
      else setRemoteCustomers((rows || []).map((row) => ({ id: row.id, name: row.full_name, phone: row.phone, email: row.email, documentReference: row.document_reference, notes: row.notes, createdAt: row.created_at, preferences: row.preferences || {}, tags: row.tags || [] })));
      setLoading(false);
    });
    return () => { active = false; };
  }, [organizationId]);
  const customers = remoteCustomers || data.customers || [];
  const selectedCustomer = customers.find((customer) => customer.id === selectedId);
  React.useEffect(() => {
    if (!selectedId || !supabase || !organizationId) { setSales([]); setQuotes([]); setInteractions([]); return; }
    let active = true;
    setDetailLoading(true);
    Promise.all([
      canViewSales ? supabase.from('sales').select('id,status,total,created_at,note,sale_lines(description_snapshot,quantity,line_total)').eq('organization_id', organizationId).eq('customer_id', selectedId).eq('status', 'confirmed').order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      canViewQuotes ? supabase.from('central_quotes').select('id,quote_code,selected_total,status,created_at,items').eq('organization_id', organizationId).eq('customer_id', selectedId).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      supabase.from('customer_interactions').select('id,interaction_type,summary,occurred_at,created_at').eq('organization_id', organizationId).eq('customer_id', selectedId).order('occurred_at', { ascending: false }).limit(100),
    ]).then(([salesResult, quoteResult, interactionResult]) => {
      if (!active) return;
      const resultWithError = [salesResult, quoteResult, interactionResult].find((result) => result.error);
      if (resultWithError?.error) flash(`No se pudo completar el historial: ${resultWithError.error.message}`);
      setSales(salesResult.data || []); setQuotes(quoteResult.data || []); setInteractions(interactionResult.data || []);
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, organizationId, canViewSales, canViewQuotes]);
  const visible = useMemo(() => customers.filter((c) => `${c.name} ${c.phone} ${c.email} ${(c.tags || []).join(' ')}`.toLowerCase().includes(term.toLowerCase())), [customers, term]);
  const lifetimeValue = sales.reduce((total, sale) => total + Number(sale.total || 0), 0);
  const save = async (event) => {
    event.preventDefault();
    if (!canEdit || !form.name.trim()) return;
    const duplicate = customers.find((c) => c.name.trim().toLowerCase() === form.name.trim().toLowerCase() && (c.phone || '') === form.phone.trim());
    if (duplicate) { flash('Ese cliente ya está registrado.'); return; }
    const values = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), documentReference: form.documentReference.trim(), notes: form.notes.trim(), interests: form.interests.trim(), tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) };
    if (supabase && organizationId && user) {
      const { data: saved, error } = await supabase.from('customers').insert({ organization_id: organizationId, full_name: values.name, phone: values.phone, email: values.email, document_reference: values.documentReference, notes: values.notes, preferences: { interests: values.interests }, tags: values.tags, created_by: user.id }).select('id,full_name,phone,email,document_reference,notes,created_at,preferences,tags').single();
      if (error) { flash(`No se guardó el cliente: ${error.message}`); return; }
      const customer = { id: saved.id, name: saved.full_name, phone: saved.phone, email: saved.email, documentReference: saved.document_reference, notes: saved.notes, createdAt: saved.created_at, preferences: saved.preferences || {}, tags: saved.tags || [] };
      setRemoteCustomers((current) => [customer, ...(current || [])]); selectCustomer(customer.id);
    } else add('customers', { ...values, source: 'Registro manual' });
    setForm({ name: '', phone: '', email: '', documentReference: '', notes: '', interests: '', tags: '' });
    flash(supabase ? 'Cliente guardado en la base compartida.' : 'Cliente guardado localmente.');
  };
  const saveCustomerProfile = async (event) => {
    event.preventDefault(); if (!canEdit || !selectedCustomer || !supabase || !organizationId) return;
    setProfileSaving(true);
    const interests = String(selectedCustomer.preferences?.interests || '');
    const { data: saved, error } = await supabase.from('customers').update({ notes: selectedCustomer.notes, preferences: { ...(selectedCustomer.preferences || {}), interests }, tags: selectedCustomer.tags || [], updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', selectedCustomer.id).select('id').maybeSingle();
    if (error) flash(`No se guardó la ficha: ${error.message}`);
    else flash(saved ? 'Ficha del cliente actualizada.' : 'No se encontró el cliente para actualizar.');
    setProfileSaving(false);
  };
  const addInteraction = async (event) => {
    event.preventDefault();
    if (!canEdit || !selectedCustomer || !interactionSummary.trim() || !supabase || !organizationId || !user) return;
    const { data: created, error } = await supabase.from('customer_interactions').insert({ organization_id: organizationId, customer_id: selectedCustomer.id, interaction_type: 'note', summary: interactionSummary.trim(), created_by: user.id }).select('id,interaction_type,summary,occurred_at,created_at').single();
    if (error) flash(`No se registró la interacción: ${error.message}`);
    else { setInteractions((current) => [created, ...current]); setInteractionSummary(''); flash('Nota agregada al historial del cliente.'); }
  };
  return <div className="customer-book">
    <div className="page-heading"><div><div className="eyebrow">CLIENTES · BASE COMPARTIDA</div><h1>{selectedCustomer ? selectedCustomer.name : 'Directorio de clientes'}</h1><p>{selectedCustomer ? 'Ficha, compras, cotizaciones y conversaciones registradas para este cliente.' : 'Consulta la relación completa del cliente con Visual Corp y registra información útil para atenderle mejor.'}</p></div><span className="local-badge"><Users size={14}/> {loading?'…':customers.length} clientes</span></div>
    {selectedCustomer ? <>
      <button type="button" className="button button-outline customer-back" onClick={() => selectCustomer('')}><ArrowLeft size={15}/> Volver al directorio</button>
      <div className="customer-summary-grid">
        <article className="panel customer-summary-card"><small>Compras confirmadas</small><b>{canViewSales?sales.length:'Sin permiso'}</b></article>
        <article className="panel customer-summary-card"><small>Total en ventas confirmadas</small><b>{canViewSales?formatMoney(lifetimeValue):'Sin permiso'}</b></article>
        <article className="panel customer-summary-card"><small>Última compra</small><b>{canViewSales?(sales[0] ? formatDate(sales[0].created_at) : 'Sin compras registradas'):'Sin permiso'}</b></article>
        <article className="panel customer-summary-card"><small>Cotizaciones</small><b>{canViewQuotes?quotes.length:'Sin permiso'}</b></article>
      </div>
      <div className="customer-detail-grid">
        <section className="panel customer-detail-card"><div className="panel-heading"><div><span className="eyebrow">FICHA DEL CLIENTE</span><h2>Datos y preferencias</h2></div></div>
          <form className="customer-profile-form" onSubmit={saveCustomerProfile}><div className="customer-contact-summary"><b>{selectedCustomer.name}</b><span>{selectedCustomer.phone || 'Sin teléfono'}</span><span>{selectedCustomer.email || 'Sin correo'}</span><span>{selectedCustomer.documentReference ? `Documento / RUC: ${selectedCustomer.documentReference}` : 'Sin documento o RUC registrado'}</span></div>
            <label>Intereses y preferencias<textarea rows={3} value={selectedCustomer.preferences?.interests || ''} disabled={!canEdit} placeholder="Productos, acabados, colores o necesidades que el cliente comentó" onChange={(event)=>setRemoteCustomers((current)=>current?.map((customer)=>customer.id===selectedId?{...customer,preferences:{...(customer.preferences||{}),interests:event.target.value}}:customer)||null)}/></label>
            <label>Etiquetas separadas por comas<input value={(selectedCustomer.tags||[]).join(', ')} disabled={!canEdit} placeholder="cliente frecuente, empresas, eventos" onChange={(event)=>setRemoteCustomers((current)=>current?.map((customer)=>customer.id===selectedId?{...customer,tags:event.target.value.split(',').map((tag)=>tag.trim()).filter(Boolean)}:customer)||null)}/></label>
            <label>Notas internas<textarea rows={4} value={selectedCustomer.notes||''} disabled={!canEdit} placeholder="Acuerdos, recomendaciones de atención u otra información pertinente" onChange={(event)=>setRemoteCustomers((current)=>current?.map((customer)=>customer.id===selectedId?{...customer,notes:event.target.value}:customer)||null)}/></label>
            {canEdit&&<button className="button button-dark" type="submit" disabled={profileSaving}>{profileSaving?'Guardando…':'Guardar ficha'}</button>}
          </form>
          {canEdit&&<form className="customer-interaction-form" onSubmit={addInteraction}><label>Agregar nota al historial<textarea required maxLength={2000} rows={2} value={interactionSummary} onChange={(event)=>setInteractionSummary(event.target.value)} placeholder="¿Qué se conversó o qué seguimiento quedó pendiente?"/></label><button className="button button-outline" type="submit">Guardar seguimiento</button></form>}
          <div className="customer-timeline"><h3><Clock3 size={15}/> Seguimiento</h3>{interactions.length?interactions.map((entry)=><article key={entry.id}><time>{formatDate(entry.occurred_at)}</time><p>{entry.summary}</p></article>):<p className="inventory-empty">Todavía no hay notas de seguimiento.</p>}</div>
        </section>
        <div className="customer-history-column"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">HISTORIAL COMERCIAL</span><h2>Compras</h2></div></div>{detailLoading?<div className="inventory-empty">Cargando historial…</div>:!canViewSales?<div className="inventory-empty">Tu perfil no permite consultar el historial de ventas.</div>:sales.length?<div className="customer-history-list">{sales.map((sale)=><article key={sale.id}><span><b>{formatDate(sale.created_at)}</b><small>{(sale.sale_lines||[]).map((line)=>`${line.description_snapshot} × ${line.quantity}`).join(' · ')||sale.note||'Venta registrada'}</small></span><strong>{formatMoney(sale.total)}</strong></article>)}</div>:<div className="inventory-empty">Este cliente aún no tiene ventas confirmadas asociadas.</div>}</section>
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">PROPUESTAS</span><h2>Cotizaciones</h2></div></div>{!canViewQuotes?<div className="inventory-empty">Tu perfil no permite consultar cotizaciones.</div>:quotes.length?<div className="customer-history-list">{quotes.map((quote)=><article key={quote.id}><span><b>{quote.quote_code}</b><small>{formatDate(quote.created_at)} · {quote.status}</small></span><strong>{quote.selected_total==null?'Por confirmar':formatMoney(quote.selected_total)}</strong></article>)}</div>:<div className="inventory-empty">Sin cotizaciones asociadas a este cliente.</div>}</section></div>
      </div>
      {detailLoading&&<p className="customer-history-loading">Actualizando el historial completo…</p>}
    </> : <div className="customer-book-grid">
      <form className="panel form-panel" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">NUEVO REGISTRO</span><h2>Agregar cliente</h2></div><UserRoundPlus size={19}/></div>
        <label>Nombre o razón social *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Correo electrónico<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Cédula o RUC<input value={form.documentReference} onChange={(e) => setForm({ ...form, documentReference: e.target.value })} /></label>
        <label>Intereses y preferencias<textarea rows={2} value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="Productos, colores, acabados o necesidades comentadas" /></label>
        <label>Etiquetas<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="frecuente, empresa, eventos" /></label>
        <label>Notas<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button className="button button-dark form-submit" type="submit" disabled={!canEdit}>Guardar cliente <UserRoundPlus size={15}/></button>
      </form>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DIRECTORIO</span><h2>Clientes registrados</h2></div></div>
        <label className="search-box"><Search size={16}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nombre, teléfono, correo o etiqueta" /></label>
        {visible.length ? <div className="customer-list">{visible.map((customer) => <button type="button" className="customer-row customer-row-button" key={customer.id} onClick={() => selectCustomer(customer.id)}><span className="customer-avatar">{customer.name?.slice(0, 1)?.toUpperCase() || 'C'}</span><span><b>{customer.name}</b><small>{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'} · Agregado {formatDate(customer.createdAt)}</small>{customer.tags?.length>0&&<small>{customer.tags.join(' · ')}</small>}</span><span className="inventory-status ok">Ver ficha</span></button>)}</div> : <div className="inventory-empty">{customers.length ? 'No hay coincidencias.' : 'La base empieza vacía. Puedes agregar clientes aquí o desde el POS al registrar una venta.'}</div>}
      </section>
    </div>}
    {!selectedCustomer&&<div className="notice-box"><span><Users size={17}/></span><div><b>Historial basado en registros reales</b><p>Las compras y cotizaciones aparecen cuando están vinculadas a una ficha de cliente. Las preferencias y seguimientos se guardan en la base compartida; no se estiman gustos ni montos.</p></div></div>}
  </div>;
}

