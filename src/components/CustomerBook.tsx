import React, { useMemo, useState } from 'react';
import { Search, UserRoundPlus, Users } from 'lucide-react';
import { useWorkspace, formatDate } from '../app/workspace';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';

export function CustomerBook() {
  const { data, add, flash } = useWorkspace();
  const { organizationId, user, hasPermission } = useAuth();
  const canEdit = hasPermission('crm','edit');
  const [term, setTerm] = useState('');
  const [remoteCustomers, setRemoteCustomers] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  React.useEffect(() => {
    if (!supabase || !organizationId) { setLoading(false); return; }
    let active = true;
    supabase.from('customers').select('id,full_name,phone,email,notes,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).then(({ data: rows, error }) => {
      if (!active) return;
      if (error) flash(`No se pudo cargar la base de clientes: ${error.message}`);
      else setRemoteCustomers((rows || []).map((row) => ({ id: row.id, name: row.full_name, phone: row.phone, email: row.email, notes: row.notes, createdAt: row.created_at })));
      setLoading(false);
    });
    return () => { active = false; };
  }, [organizationId]);
  const customers = remoteCustomers || data.customers || [];
  const visible = useMemo(() => customers.filter((c) => `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(term.toLowerCase())), [customers, term]);
  const save = async (event) => {
    event.preventDefault();
    if (!canEdit || !form.name.trim()) return;
    const duplicate = customers.find((c) => c.name.trim().toLowerCase() === form.name.trim().toLowerCase() && (c.phone || '') === form.phone.trim());
    if (duplicate) { flash('Ese cliente ya está registrado.'); return; }
    const values = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), notes: form.notes.trim() };
    if (supabase && organizationId && user) {
      const { data: saved, error } = await supabase.from('customers').insert({ organization_id: organizationId, full_name: values.name, phone: values.phone, email: values.email, notes: values.notes, created_by: user.id }).select('id,full_name,phone,email,notes,created_at').single();
      if (error) { flash(`No se guardó el cliente: ${error.message}`); return; }
      setRemoteCustomers((current) => [{ id: saved.id, name: saved.full_name, phone: saved.phone, email: saved.email, notes: saved.notes, createdAt: saved.created_at }, ...(current || [])]);
    } else add('customers', { ...values, source: 'Registro manual' });
    setForm({ name: '', phone: '', email: '', notes: '' });
    flash(supabase ? 'Cliente guardado en la base compartida.' : 'Cliente guardado localmente.');
  };
  return <div className="customer-book">
    <div className="page-heading"><div><div className="eyebrow">CLIENTES · BASE COMPARTIDA</div><h1>Directorio de clientes</h1><p>Registra y busca clientes para asociarlos a ventas del POS. Los datos se guardan en Supabase con acceso para el equipo autorizado.</p></div><span className="local-badge"><Users size={14}/> {loading?'…':customers.length} clientes</span></div>
    <div className="customer-book-grid">
      <form className="panel form-panel" onSubmit={save}><div className="panel-heading"><div><span className="eyebrow">NUEVO REGISTRO</span><h2>Agregar cliente</h2></div><UserRoundPlus size={19}/></div>
        <label>Nombre o razón social *<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Correo electrónico<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Notas<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <button className="button button-dark form-submit" type="submit" disabled={!canEdit}>Guardar cliente <UserRoundPlus size={15}/></button>
      </form>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DIRECTORIO</span><h2>Clientes registrados</h2></div></div>
        <label className="search-box"><Search size={16}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar por nombre, teléfono o correo" /></label>
        {visible.length ? <div className="customer-list">{visible.map((customer) => <article className="customer-row" key={customer.id}><span className="customer-avatar">{customer.name?.slice(0, 1)?.toUpperCase() || 'C'}</span><span><b>{customer.name}</b><small>{[customer.phone, customer.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'} · Agregado {formatDate(customer.createdAt)}</small>{customer.notes && <small>{customer.notes}</small>}</span><span className="inventory-status ok">Cliente</span></article>)}</div> : <div className="inventory-empty">{customers.length ? 'No hay coincidencias.' : 'La base empieza vacía. Puedes agregar clientes aquí o desde el POS al registrar una venta.'}</div>}
      </section>
    </div>
    <div className="notice-box"><span><Users size={17}/></span><div><b>Base compartida dentro de esta app local</b><p>El perfil, historial de compra, documentos y acceso entre dispositivos requieren la futura conexión a la base central y definición de permisos.</p></div></div>
  </div>;
}
