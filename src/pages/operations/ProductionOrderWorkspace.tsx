import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ClipboardList, Factory, Save } from 'lucide-react';
import './production-order-workspace.css';

type OrderDraft = {
  branch: string;
  area: string;
  title: string;
  description: string;
  priority: string;
  due: string;
  sale: string;
  assignedTo: string;
  nextStep: string;
};

type HandoffDraft = {
  assignedTo: string;
  areaId: string;
  due: string;
  description: string;
  nextStep: string;
  note: string;
};

type Props = {
  branches: any[];
  areas: any[];
  sales: any[];
  orders: any[];
  events: any[];
  teamMembers: any[];
  orderForm: OrderDraft;
  setOrderForm: React.Dispatch<React.SetStateAction<OrderDraft>>;
  busy: boolean;
  canManage: boolean;
  onCreate: () => void;
  onStatusChange: (order: any, status: string, note: string) => void;
  onSaveHandoff: (order: any, draft: HandoffDraft) => Promise<unknown>;
};

const statusLabels: Record<string, string> = {
  queued: 'En cola', in_progress: 'En proceso', blocked: 'Bloqueada',
  quality_review: 'Control de calidad', ready: 'Lista para entrega',
  completed: 'Completada', cancelled: 'Cancelada',
};

const priorityLabels: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const dayValue = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-CA') : '';
const stamp = (value?: string | null) => value ? new Date(value).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : 'Fecha pendiente';

export function ProductionOrderWorkspace({ branches, areas, sales, orders, events, teamMembers, orderForm, setOrderForm, busy, canManage, onCreate, onStatusChange, onSaveHandoff }: Props) {
  const [statusFilter, setStatusFilter] = useState('open');
  const [branchFilter, setBranchFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [handoffs, setHandoffs] = useState<Record<string, HandoffDraft>>({});
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const members = teamMembers.filter((member) => member.active);
  const visibleOrders = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return orders.filter((order) => {
      const closed = ['completed', 'cancelled'].includes(order.status);
      if (statusFilter === 'open' && closed) return false;
      if (statusLabels[statusFilter] && order.status !== statusFilter) return false;
      if (branchFilter && order.branch_id !== branchFilter) return false;
      if (ownerFilter === 'unassigned' && order.assigned_to) return false;
      if (order.due_at && !closed) {
        const due = new Date(order.due_at);
        if (statusFilter === 'overdue' && due.getTime() >= today.getTime()) return false;
        if (statusFilter === 'today' && (due.getTime() < today.getTime() || due.toDateString() !== today.toDateString())) return false;
      } else if (statusFilter === 'overdue' || statusFilter === 'today') return false;
      return true;
    }).sort((a, b) => {
      const overdueA = a.due_at && new Date(a.due_at).getTime() < today.getTime() && !['completed', 'cancelled'].includes(a.status) ? 1 : 0;
      const overdueB = b.due_at && new Date(b.due_at).getTime() < today.getTime() && !['completed', 'cancelled'].includes(b.status) ? 1 : 0;
      return overdueB - overdueA || (b.priority === 'urgent' ? 1 : 0) - (a.priority === 'urgent' ? 1 : 0) || new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    });
  }, [orders, statusFilter, branchFilter, ownerFilter]);

  const draftFor = (order: any): HandoffDraft => handoffs[order.id] || {
    assignedTo: order.assigned_to || '', areaId: order.area_id || '', due: dayValue(order.due_at),
    description: order.description || '', nextStep: order.next_step || '', note: '',
  };
  const updateHandoff = (order: any, patch: Partial<HandoffDraft>) => setHandoffs((current) => ({ ...current, [order.id]: { ...(current[order.id] || draftFor(order)), ...patch } }));
  const submitHandoff = async (order: any) => {
    const draft = draftFor(order);
    if (draft.note.trim().length < 3) return;
    const saved = await onSaveHandoff(order, draft);
    if (saved === null) return;
    setHandoffs((current) => { const next = { ...current }; delete next[order.id]; return next; });
  };
  const saleForOrder = (order: any) => sales.find((sale) => sale.id === order.sale_id);
  const ownerName = (id?: string | null) => members.find((member) => member.user_id === id)?.full_name || (id ? 'Responsable con acceso restringido' : 'Sin asignar');
  const eventsForOrder = (orderId: string) => events.filter((event) => event.order_id === orderId).slice(0, 8);

  return <div className="production-workspace">
    <section className="panel production-create">
      <div className="panel-heading"><div><span className="eyebrow">VENTA → PRODUCCIÓN</span><h2>Crear orden de trabajo</h2><p>Vincula el trabajo a una venta confirmada y deja responsable, plazo y siguiente paso.</p></div><Factory size={19}/></div>
      <label>Título del trabajo<input maxLength={180} value={orderForm.title} onChange={(event) => setOrderForm({ ...orderForm, title: event.target.value })} placeholder="Ej. Rótulo exterior · referencia breve"/></label>
      <label>Venta confirmada<select value={orderForm.sale} onChange={(event) => { const sale = sales.find((row) => row.id === event.target.value); setOrderForm((current) => ({ ...current, sale: event.target.value, branch: sale?.branch_id || current.branch })); }}><option value="">Trabajo interno sin venta vinculada</option>{sales.filter((sale) => sale.status === 'confirmed' && !orders.some((order) => order.sale_id === sale.id)).map((sale) => <option key={sale.id} value={sale.id}>{sale.sale_code} · {sale.customers?.full_name || 'Cliente'}</option>)}</select><small>Al vincularla, la ficha conserva la referencia comercial para seguir el trabajo hasta producción.</small></label>
      <label>Instrucción breve<textarea maxLength={4000} rows={3} value={orderForm.description} onChange={(event) => setOrderForm({ ...orderForm, description: event.target.value })} placeholder="Qué debe fabricarse y qué referencia aprobada debe consultarse"/></label>
      <div className="production-form-grid">
        <label>Sucursal<select value={orderForm.branch} onChange={(event) => setOrderForm({ ...orderForm, branch: event.target.value })}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Área<select value={orderForm.area} onChange={(event) => setOrderForm({ ...orderForm, area: event.target.value })}><option value="">Por asignar</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label>Prioridad<select value={orderForm.priority} onChange={(event) => setOrderForm({ ...orderForm, priority: event.target.value })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Fecha prevista<input type="date" value={orderForm.due} onChange={(event) => setOrderForm({ ...orderForm, due: event.target.value })}/></label>
        <label>Responsable<select value={orderForm.assignedTo} onChange={(event) => setOrderForm({ ...orderForm, assignedTo: event.target.value })}><option value="">Sin asignar</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email}</option>)}</select>{!members.length && <small>Para asignar personas, el perfil necesita acceso al directorio de equipo.</small>}</label>
        <label>Siguiente paso<input maxLength={500} value={orderForm.nextStep} onChange={(event) => setOrderForm({ ...orderForm, nextStep: event.target.value })} placeholder="Ej. Confirmar medidas con diseño"/></label>
      </div>
      <button className="button button-dark" type="button" disabled={busy || !canManage || !orderForm.title.trim() || !orderForm.branch} onClick={onCreate}>Crear orden de trabajo</button>
    </section>

    <section className="panel production-board">
      <div className="panel-heading"><div><span className="eyebrow">SEGUIMIENTO Y TRASPASOS</span><h2>Órdenes de trabajo</h2><p>Los cambios de responsable y siguiente paso quedan en el historial de la orden.</p></div><ClipboardList size={19}/></div>
      <div className="production-filters">
        <label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="open">Abiertas</option><option value="overdue">Atrasadas</option><option value="today">Vencen hoy</option><option value="blocked">Bloqueadas</option><option value="quality_review">Control de calidad</option><option value="ready">Listas para entrega</option><option value="completed">Completadas</option><option value="all">Todas</option></select></label>
        <label>Sucursal<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label>Responsable<select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="">Todos</option><option value="unassigned">Sin asignar</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email}</option>)}</select></label>
      </div>
      <div className="production-order-list">
        {visibleOrders.map((order) => {
          const sale = saleForOrder(order);
          const draft = draftFor(order);
          const timeline = eventsForOrder(order.id);
          const late = order.due_at && new Date(order.due_at).getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime() && !['completed', 'cancelled'].includes(order.status);
          return <article id={`op-production-${order.id}`} tabIndex={-1} key={order.id} className={`production-order ${late ? 'is-overdue' : ''}`}>
            <div className="production-order-heading"><div><span className="production-order-code">{order.order_code}</span><h3>{order.title}</h3></div><span className={`op-flow-status status-${order.status}`}>{statusLabels[order.status] || order.status}</span></div>
            <div className="production-order-facts"><span>{order.branches?.name || branches.find((branch) => branch.id === order.branch_id)?.name || 'Sucursal'}</span><span>{order.areas?.name || areas.find((area) => area.id === order.area_id)?.name || 'Área por asignar'}</span><span className={late ? 'is-late' : ''}>{late ? 'Atrasada · ' : 'Fecha prevista · '}{stamp(order.due_at)}</span><span>Prioridad · {priorityLabels[order.priority] || order.priority}</span></div>
            {sale && <a className="production-order-sale" href={sale.customer_id ? `/operaciones/clientes?cliente=${encodeURIComponent(sale.customer_id)}` : '/operaciones/pos'}>{sale.sale_code} · {sale.customers?.full_name || 'Venta vinculada'} <ArrowUpRight size={13}/></a>}
            {order.description && <p className="production-order-description">{order.description}</p>}
            <div className="production-order-next"><span>Responsable</span><b>{ownerName(order.assigned_to)}</b><span>Siguiente paso</span><b>{order.next_step || 'Pendiente de definir'}</b></div>
            {!['completed', 'cancelled'].includes(order.status) && canManage && <details className="production-handoff"><summary>Registrar traspaso o actualizar la orden</summary>
              <div className="production-form-grid"><label>Responsable<select value={draft.assignedTo} onChange={(event) => updateHandoff(order, { assignedTo: event.target.value })}><option value="">Sin asignar</option>{order.assigned_to && !members.some((member) => member.user_id === order.assigned_to) && <option value={order.assigned_to}>Responsable actual</option>}{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email}</option>)}</select></label><label>Área<select value={draft.areaId} onChange={(event) => updateHandoff(order, { areaId: event.target.value })}><option value="">Por asignar</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label><label>Fecha prevista<input type="date" value={draft.due} onChange={(event) => updateHandoff(order, { due: event.target.value })}/></label><label>Siguiente paso<input maxLength={500} value={draft.nextStep} onChange={(event) => updateHandoff(order, { nextStep: event.target.value })} placeholder="Acción concreta y quién debe continuar"/></label></div>
              <label>Instrucción para el área<textarea rows={2} maxLength={4000} value={draft.description} onChange={(event) => updateHandoff(order, { description: event.target.value })}/></label>
              <label>Nota del traspaso<input maxLength={700} value={draft.note} onChange={(event) => updateHandoff(order, { note: event.target.value })} placeholder="Qué queda listo o qué bloquea el avance"/></label>
              <button className="button button-outline" type="button" disabled={busy || draft.note.trim().length < 3} onClick={() => submitHandoff(order)}><Save size={15}/> Guardar traspaso</button>
            </details>}
            {!['completed', 'cancelled'].includes(order.status) && <div className="production-status-update"><label>Nota del cambio<input value={statusNotes[order.id] || ''} maxLength={900} onChange={(event) => setStatusNotes((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Obligatoria al bloquear, pasar a calidad o cerrar"/></label><label>Estado<select value={order.status} disabled={busy || !canManage} onChange={(event) => onStatusChange(order, event.target.value, statusNotes[order.id] || '')}>{Object.entries(statusLabels).filter(([value]) => value !== 'cancelled' || canManage).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}
            {Boolean(timeline.length) && <details className="production-history"><summary>Historial de traspasos y estados ({timeline.length})</summary><ol>{timeline.map((event) => <li key={event.id}><b>{event.from_status === event.to_status ? 'Traspaso actualizado' : `${statusLabels[event.from_status] || event.from_status || 'Inicio'} → ${statusLabels[event.to_status] || event.to_status}`}</b><span>{stamp(event.created_at)} · {ownerName(event.created_by)}</span>{event.note && <p>{event.note}</p>}</li>)}</ol></details>}
          </article>;
        })}
        {!visibleOrders.length && <div className="production-empty"><b>No hay órdenes para este filtro.</b><span>Prueba con otro estado o sucursal.</span></div>}
      </div>
    </section>
  </div>;
}
