import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Filter, Play, Users, Zap } from 'lucide-react';
import { AREA_BY_ID, PRODUCTION_AREAS, getAreaCapacity, isEligibleForProductionArea } from '../../lib/productionWorkflow';
import { getRoleCapabilities, updateProductionOperation } from '../../lib/posStore';

const STATUS = {
  blocked: { label: 'Bloqueado', color: '#64748b' },
  ready: { label: 'Listo para iniciar', color: '#2563eb' },
  in_progress: { label: 'En proceso', color: '#ea580c' },
  review: { label: 'En revisión', color: '#d97706' },
  done: { label: 'Terminado', color: '#059669' },
  cancelled: { label: 'Cancelado', color: '#dc2626' }
};

const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const formatTime = (value) => value ? new Date(value).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) : '—';
const formatDuration = (minutes = 0) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ''}` : `${minutes}m`;

function startOfWeek(value) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function OperationCard({ operation, order, advisors, onUpdate, session, canManage }) {
  const area = AREA_BY_ID[operation.area] || { label: operation.area, color: '#64748b' };
  const status = STATUS[operation.status] || STATUS.blocked;
  const assignee = advisors.find((person) => person.id === operation.assignedTo);
  const blocked = operation.status === 'blocked';
  const isAssignedWorker = operation.assignedTo === session?.id;
  const canClaim = !operation.assignedTo && isEligibleForProductionArea(session || {}, operation.area);
  const canOperate = canManage || isAssignedWorker;
  const eligibleAdvisors = advisors.filter((person) => person.isActive !== false && isEligibleForProductionArea(person, operation.area));

  return (
    <article className={`pos-operation-card status-${operation.status}`} style={{ '--area-color': area.color }}>
      <div className="pos-operation-card-top">
        <span className="pos-operation-area">{area.label}</span>
        <span className="pos-operation-status" style={{ color: status.color }}>{status.label}</span>
      </div>
      <strong className="pos-operation-title">#{order?.orderNumber || '—'} · {order?.jobName || operation.title}</strong>
      <span className="pos-operation-customer">{order?.customerName || 'Cliente'} · {operation.title}</span>
      <div className="pos-operation-meta">
        <span><Clock3 size={13} /> {formatTime(operation.scheduledStart)}–{formatTime(operation.scheduledEnd)} · {formatDuration(operation.estimatedMinutes)}</span>
        <span><Users size={13} /> {assignee?.name || 'Sin responsable'}</span>
      </div>
      {canManage && <div className="pos-operation-fields">
          <select value={operation.assignedTo || ''} onChange={(event) => onUpdate(operation.id, { assignedTo: event.target.value || null })}>
            <option value="">Asignar responsable…</option>
            {eligibleAdvisors.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <input type="number" min="5" step="5" value={operation.estimatedMinutes || 30} aria-label="Duración estimada en minutos" onChange={(event) => onUpdate(operation.id, { estimatedMinutes: Math.max(5, Number(event.target.value) || 5) })} />
          <input type="date" value={operation.scheduledStart?.slice(0, 10) || ''} aria-label="Fecha programada" onChange={(event) => {
            const start = new Date(`${event.target.value}T08:00:00`);
            const end = new Date(start.getTime() + Number(operation.estimatedMinutes || 30) * 60000);
            onUpdate(operation.id, { scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() });
          }} />
        </div>}
      <div className="pos-operation-actions">
        {canClaim && operation.status === 'ready' && <button type="button" onClick={() => onUpdate(operation.id, { assignedTo: session.id, status: 'in_progress' })}><Play size={14} /> Tomar e iniciar trabajo</button>}
        {canOperate && operation.status === 'ready' && <button type="button" onClick={() => onUpdate(operation.id, { status: 'in_progress' })}><Play size={14} /> Iniciar</button>}
        {canOperate && operation.status === 'in_progress' && <button type="button" className="complete" onClick={() => onUpdate(operation.id, { status: 'done' })}><CheckCircle2 size={14} /> Terminar y notificar</button>}
        {operation.status === 'done' && <span className="pos-operation-done"><CheckCircle2 size={14} /> Completado</span>}
        {blocked && <span className="pos-operation-blocked">Espera etapas anteriores</span>}
      </div>
    </article>
  );
}

export function POSProductionControl({ store, setStore, session }) {
  const [view, setView] = useState('board');
  const [areaFilter, setAreaFilter] = useState('all');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const operations = store.productionOperations || [];
  const capabilities = useMemo(() => getRoleCapabilities(session?.role), [session?.role]);
  const canManage = capabilities.canManageAssignments;
  const ordersById = useMemo(() => Object.fromEntries((store.orders || []).map((order) => [order.id, order])), [store.orders]);
  const activeOperations = useMemo(() => operations.filter((operation) => operation.status !== 'cancelled' && ordersById[operation.orderId]?.status !== 'cancelled'), [operations, ordersById]);
  const scopedOperations = useMemo(() => {
    if (canManage || capabilities.isAdmin) return activeOperations;
    return activeOperations.filter((operation) => capabilities.managedAreas.includes(operation.area) && (!operation.assignedTo || operation.assignedTo === session?.id));
  }, [activeOperations, canManage, capabilities, session?.id]);
  const visible = areaFilter === 'all' ? scopedOperations : scopedOperations.filter((operation) => operation.area === areaFilter);
  const areas = PRODUCTION_AREAS.filter((area) => area.id !== 'asesoria' && (canManage || capabilities.isAdmin || capabilities.managedAreas.includes(area.id)));
  const unassigned = scopedOperations.filter((operation) => !operation.assignedTo && !['done', 'blocked'].includes(operation.status)).length;
  const overdue = scopedOperations.filter((operation) => !['done', 'cancelled'].includes(operation.status) && operation.scheduledEnd && new Date(operation.scheduledEnd) < new Date()).length;
  const inProgress = scopedOperations.filter((operation) => operation.status === 'in_progress').length;

  const update = (operationId, changes) => {
    const result = updateProductionOperation(store, operationId, changes, session?.id);
    if (result.ok) setStore(result.updatedStore);
  };

  const days = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });

  return (
    <section className="pos-flow-control">
      <div className="pos-flow-hero">
        <div>
          <span className="pos-flow-kicker"><Zap size={15} /> Centro operativo sincronizado</span>
          <h2>{canManage ? 'Producción, responsables y capacidad' : 'Mis trabajos y agenda'}</h2>
          <p>{canManage ? 'Cada venta se convierte en operaciones encadenadas. Lo bloqueado se libera automáticamente cuando termina la etapa anterior.' : 'Aquí aparecen únicamente los trabajos de tu área. Puedes tomar uno disponible, iniciarlo y notificar cuando esté terminado.'}</p>
        </div>
        <div className="pos-flow-view-switch">
          <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Flujo por área</button>
          <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}><CalendarDays size={15} /> Agenda semanal</button>
        </div>
      </div>

      <div className="pos-flow-kpis">
        <div><strong>{inProgress}</strong><span>En proceso</span></div>
        <div><strong>{unassigned}</strong><span>Sin responsable</span></div>
        <div className={overdue ? 'danger' : ''}><strong>{overdue}</strong><span>Fuera de horario</span></div>
        <div><strong>{new Set(scopedOperations.map((operation) => operation.orderId)).size}</strong><span>Órdenes activas</span></div>
      </div>

      {view === 'board' ? (
        <>
          <div className="pos-flow-toolbar">
            <Filter size={15} />
            {areas.length > 1 && <button className={areaFilter === 'all' ? 'active' : ''} onClick={() => setAreaFilter('all')}>Todas</button>}
            {areas.map((area) => <button key={area.id} className={areaFilter === area.id ? 'active' : ''} onClick={() => setAreaFilter(area.id)}>{area.label}</button>)}
          </div>
          <div className="pos-flow-board">
            {areas.filter((area) => areaFilter === 'all' || areaFilter === area.id).map((area) => {
              const areaOperations = visible.filter((operation) => operation.area === area.id && operation.status !== 'done');
              return (
                <div className="pos-flow-column" key={area.id}>
                  <header style={{ '--area-color': area.color }}><span>{area.label}</span><b>{areaOperations.length}</b></header>
                  <div className="pos-flow-column-body">
                    {areaOperations.length ? areaOperations.map((operation) => <OperationCard key={operation.id} operation={operation} order={ordersById[operation.orderId]} advisors={store.advisors || []} onUpdate={update} session={session} canManage={canManage || capabilities.isAdmin} />) : <div className="pos-flow-empty">Sin trabajos pendientes</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="pos-capacity-calendar">
          <div className="pos-calendar-toolbar">
            <button onClick={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() - 7); return next; })}><ChevronLeft size={16} /></button>
            <strong>Semana del {weekStart.toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })}</strong>
            <button onClick={() => setWeekStart((current) => { const next = new Date(current); next.setDate(next.getDate() + 7); return next; })}><ChevronRight size={16} /></button>
          </div>
          <div className="pos-calendar-grid">
            <div className="pos-calendar-corner">Área / Capacidad</div>
            {days.map((day) => <div className="pos-calendar-day" key={day.toISOString()}><strong>{day.toLocaleDateString('es-EC', { weekday: 'short' })}</strong><span>{day.getDate()}</span></div>)}
            {areas.filter((area) => !['aprobacion', 'entrega'].includes(area.id)).map((area) => (
              <React.Fragment key={area.id}>
                <div className="pos-calendar-area" style={{ '--area-color': area.color }}>{area.label}</div>
                {days.map((day) => {
                  const dayCode = isoDay(day);
                  const dayOperations = visible.filter((operation) => operation.area === area.id && operation.scheduledStart?.slice(0, 10) === dayCode && operation.status !== 'done');
                  const capacity = getAreaCapacity(scopedOperations, dayCode, area.id);
                  return (
                    <div className={`pos-calendar-cell ${capacity.percentage > 100 ? 'overload' : ''}`} key={`${area.id}-${dayCode}`}>
                      <div className="pos-capacity-meter"><span style={{ width: `${Math.min(100, capacity.percentage)}%`, background: capacity.percentage > 100 ? '#dc2626' : area.color }} /></div>
                      <small>{formatDuration(capacity.usedMinutes)} / 8h</small>
                      {dayOperations.map((operation) => <button key={operation.id} style={{ '--area-color': area.color }} title={operation.title}>{formatTime(operation.scheduledStart)} · #{ordersById[operation.orderId]?.orderNumber}</button>)}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
