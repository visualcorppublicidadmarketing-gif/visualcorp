import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, MapPinned, Plus, RefreshCw, RotateCcw, Wrench } from 'lucide-react';
import { AdminHeader, AdminShell } from '../../components';
import { hasSupabase, supabase } from '../../lib/supabase';
import { useToast } from '../../components/studio/Toast';

const MODULES = {
  quality: {
    label: 'Calidad', table: 'pos_quality_checks', icon: ClipboardCheck,
    description: 'Inspecciones, fallos y retrabajos antes de entregar.',
    statuses: ['pending', 'passed', 'failed', 'rework'],
  },
  returns: {
    label: 'Postventa', table: 'pos_returns', icon: RotateCcw,
    description: 'Reclamos, devoluciones, garantías y resolución.',
    statuses: ['open', 'reviewing', 'approved', 'rejected', 'resolved'],
  },
  maintenance: {
    label: 'Mantenimiento', table: 'pos_maintenance_orders', icon: Wrench,
    description: 'Paradas, mantenimiento preventivo y correctivo de equipos.',
    statuses: ['open', 'scheduled', 'in_progress', 'completed', 'cancelled'],
  },
  field: {
    label: 'Instalaciones', table: 'pos_field_visits', icon: MapPinned,
    description: 'Visitas, mediciones, montaje, evidencia y firma del cliente.',
    statuses: ['planned', 'confirmed', 'en_route', 'on_site', 'completed', 'cancelled'],
  },
};

const STATUS_LABELS = {
  pending: 'Pendiente', passed: 'Aprobado', failed: 'Falló', rework: 'Retrabajo',
  open: 'Abierto', reviewing: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', resolved: 'Resuelto',
  scheduled: 'Programado', in_progress: 'En proceso', completed: 'Completado', cancelled: 'Cancelado',
  planned: 'Planificada', confirmed: 'Confirmada', en_route: 'En camino', on_site: 'En sitio',
};

function createPayload(moduleId, draft) {
  const common = { title: draft.title.trim(), notes: draft.notes.trim() || null };
  if (moduleId === 'quality') return { ...common, order_id: draft.orderId.trim(), status: 'pending', checklist: [] };
  if (moduleId === 'returns') return { ...common, order_id: draft.orderId.trim(), reason: draft.notes.trim(), status: 'open' };
  if (moduleId === 'maintenance') return { ...common, priority: draft.priority, status: 'open', scheduled_at: draft.scheduledAt || null };
  return {
    ...common, order_id: draft.orderId.trim(), visit_type: draft.visitType,
    status: 'planned', scheduled_start: draft.scheduledAt || null,
    address: draft.address.trim() || null, maps_url: draft.mapsUrl.trim() || null,
  };
}

export function POSBusinessOperations() {
  const toast = useToast();
  const [activeModule, setActiveModule] = useState('quality');
  const [records, setRecords] = useState({ quality: [], returns: [], maintenance: [], field: [] });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ title: '', orderId: '', notes: '', priority: 'normal', scheduledAt: '', visitType: 'installation', address: '', mapsUrl: '' });

  const load = useCallback(async () => {
    if (!hasSupabase) { setLoading(false); return; }
    setLoading(true);
    const entries = await Promise.all(Object.entries(MODULES).map(async ([id, module]) => {
      const { data, error } = await supabase.from(module.table).select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return [id, data || []];
    }));
    setRecords(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => { load().catch((error) => { setLoading(false); toast.error(error.message); }); }, [load]);

  const module = MODULES[activeModule];
  const visible = records[activeModule] || [];
  const openCount = visible.filter((item) => !['passed', 'resolved', 'completed', 'cancelled', 'rejected'].includes(item.status)).length;
  const criticalCount = visible.filter((item) => ['failed', 'rework'].includes(item.status) || item.priority === 'urgent').length;
  const nextScheduled = useMemo(() => visible.find((item) => item.scheduled_at || item.scheduled_start), [visible]);

  const save = async (event) => {
    event.preventDefault();
    if (!draft.title.trim() || (activeModule !== 'maintenance' && !draft.orderId.trim())) {
      toast.warning('Completa el título y la orden relacionada.');
      return;
    }
    const { error } = await supabase.from(module.table).insert(createPayload(activeModule, draft));
    if (error) { toast.error(error.message); return; }
    setDraft({ title: '', orderId: '', notes: '', priority: 'normal', scheduledAt: '', visitType: 'installation', address: '', mapsUrl: '' });
    setShowForm(false);
    toast.success(`${module.label}: registro creado.`);
    await load();
  };

  const changeStatus = async (record, status) => {
    const patch = { status, updated_at: new Date().toISOString() };
    if (activeModule === 'quality' && status !== 'pending') patch.inspected_at = new Date().toISOString();
    if (activeModule === 'maintenance' && status === 'completed') patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from(module.table).update(patch).eq('id', record.id);
    if (error) { toast.error(error.message); return; }
    setRecords((current) => ({ ...current, [activeModule]: current[activeModule].map((item) => item.id === record.id ? { ...item, ...patch } : item) }));
  };

  return <AdminShell>
    <AdminHeader
      eyebrow="Operación integrada"
      title="Calidad, postventa y servicio técnico"
      text="Un solo centro para cerrar el ciclo después de vender: inspeccionar, resolver incidentes, cuidar equipos e instalar."
      action={<div className="header-actions"><button className="button button-ghost" onClick={load}><RefreshCw size={15} /> Actualizar</button><button className="button button-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Nuevo registro</button></div>}
    />

    <div className="admin-card" style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      {Object.entries(MODULES).map(([id, item]) => {
        const Icon = item.icon;
        return <button key={id} onClick={() => { setActiveModule(id); setShowForm(false); }} style={{ border: activeModule === id ? '2px solid var(--orange)' : '1px solid var(--line)', background: activeModule === id ? 'var(--orange-soft)' : 'var(--paper)', color: 'var(--ink)', borderRadius: 14, padding: 14, textAlign: 'left', cursor: 'pointer' }}>
          <Icon size={20} color="var(--orange)" /><b style={{ display: 'block', marginTop: 8 }}>{item.label}</b><small style={{ color: 'var(--muted)' }}>{(records[id] || []).length} registros</small>
        </button>;
      })}
    </div>

    <div className="metric-grid">
      <div><span><AlertTriangle size={17} /> Pendientes</span><strong>{openCount}</strong><small>Requieren seguimiento</small></div>
      <div><span><CheckCircle2 size={17} /> Cerrados</span><strong>{visible.length - openCount}</strong><small>Proceso completado</small></div>
      <div><span><AlertTriangle size={17} /> Críticos</span><strong>{criticalCount}</strong><small>Fallo, retrabajo o urgente</small></div>
      <div><span><MapPinned size={17} /> Próxima agenda</span><strong style={{ fontSize: 18 }}>{nextScheduled ? new Date(nextScheduled.scheduled_at || nextScheduled.scheduled_start).toLocaleDateString('es-EC') : 'Sin fecha'}</strong><small>Planificación más reciente</small></div>
    </div>

    {showForm && <form className="admin-card" onSubmit={save} style={{ display: 'grid', gap: 14 }}>
      <div className="admin-card-heading"><div><span className="eyebrow">Nuevo registro</span><h2>{module.label}</h2></div></div>
      <div className="fields two">
        <label>Título<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Describe la acción o incidente" /></label>
        {activeModule !== 'maintenance' && <label>Número o ID de orden<input value={draft.orderId} onChange={(event) => setDraft({ ...draft, orderId: event.target.value })} placeholder="Ej. 10452" /></label>}
        {activeModule === 'maintenance' && <label>Prioridad<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>}
        {(activeModule === 'maintenance' || activeModule === 'field') && <label>Fecha y hora<input type="datetime-local" value={draft.scheduledAt} onChange={(event) => setDraft({ ...draft, scheduledAt: event.target.value })} /></label>}
        {activeModule === 'field' && <><label>Tipo<select value={draft.visitType} onChange={(event) => setDraft({ ...draft, visitType: event.target.value })}><option value="measurement">Medición</option><option value="installation">Instalación</option><option value="repair">Garantía / reparación</option><option value="delivery">Entrega</option></select></label><label>Dirección<input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label><label>Google Maps<input value={draft.mapsUrl} onChange={(event) => setDraft({ ...draft, mapsUrl: event.target.value })} placeholder="https://maps.google.com/..." /></label></>}
      </div>
      <label>Notas<textarea rows="3" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="modal-actions"><button type="button" className="button button-ghost" onClick={() => setShowForm(false)}>Cancelar</button><button className="button button-primary">Guardar</button></div>
    </form>}

    <div className="admin-card table-card">
      <div className="admin-card-heading"><div><span className="eyebrow">{module.label}</span><h2>{module.description}</h2></div></div>
      {loading && <div className="admin-empty">Sincronizando operación…</div>}
      {!loading && !hasSupabase && <div className="admin-empty">Conecta Supabase para usar este módulo.</div>}
      {!loading && hasSupabase && !visible.length && <div className="admin-empty">No hay registros. El módulo está listo para comenzar.</div>}
      {!loading && visible.map((record) => <div className="data-table-row" key={record.id} style={{ gridTemplateColumns: '1.4fr .8fr 1fr .9fr' }}>
        <div><b>{record.title}</b><small>{record.order_id ? `Orden ${record.order_id}` : record.asset_id ? `Activo ${record.asset_id}` : module.label}</small></div>
        <span>{new Date(record.created_at).toLocaleDateString('es-EC')}</span>
        <span className="message-preview">{record.notes || record.reason || record.address || 'Sin observaciones'}</span>
        <select value={record.status} onChange={(event) => changeStatus(record, event.target.value)}>{module.statuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status] || status}</option>)}</select>
      </div>)}
    </div>
  </AdminShell>;
}
