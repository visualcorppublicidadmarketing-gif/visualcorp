import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NumberFlow from '@number-flow/react';
import { ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, CircleAlert, Clock3, FileText, Filter, Mail, MessageCircle, Plus, RefreshCw, Search, SlidersHorizontal, UserRound, Users, X } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { formatDate } from '../../app/workspace';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, supabaseConfigured } from '../../lib/supabaseClient';
import { Dialog, useAlert, useConfirm } from '../../components/ui/OperationalKit';
import './crm-page.css';

const stages: Record<string, string> = { new: 'Nuevo', contacted: 'Contactado', quoted: 'Cotizando', won: 'Ganado', lost: 'Perdido', closed: 'Cerrado' };
const stageKeys = Object.keys(stages);

function activityDescription(entry: any) {
  const details = entry.details || {};
  if (entry.kind === 'created') return details.manual ? `Registro manual · ${details.source || 'Origen pendiente'}` : '';
  if (entry.kind === 'stage') return `${stages[details.from] || 'Etapa anterior'} → ${stages[details.to] || 'Etapa actual'}${details.reason ? ` · ${details.reason}` : ''}`;
  if (entry.kind === 'assignment') return `${details.from_name || 'Sin asignar'} → ${details.to_name || 'Sin asignar'}`;
  if (entry.kind === 'follow_up') return [details.action, details.at ? new Date(details.at).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : 'Fecha retirada'].filter(Boolean).join(' · ');
  if (entry.kind === 'contact') return details.note || '';
  if (entry.kind === 'customer') return details.customer_name || 'Cliente vinculado';
  return details.text || '';
}

function whatsappHref(phone?: string, name?: string, service?: string) {
  const digits = String(phone || '').replace(/\D+/g, '');
  if (digits.length < 8) return '';
  const normalized = digits.startsWith('593') ? digits : digits.startsWith('0') ? `593${digits.slice(1)}` : digits.length === 9 ? `593${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(`Hola ${name || ''}, te escribimos de Visual Corp respecto a tu solicitud${service ? ` de ${service}` : ''}.`)}`;
}

function initials(name?: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toLocaleUpperCase('es') : '?';
}

function requestFollowUp(item: any) {
  if (!item.follow_up_at) return { action: item.follow_up_action || '', date: 'Sin fecha', overdue: false, missing: true };
  const when = new Date(item.follow_up_at);
  const overdue = when.getTime() < Date.now() && !['won', 'lost', 'closed'].includes(item.status);
  return {
    action: item.follow_up_action || 'Acción por definir',
    date: when.toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    overdue,
    missing: false,
  };
}

function RequestRow({ item, compact, onOpen }: { item: any; compact: boolean; onOpen: (id: string) => void }) {
  const sourceLabel = item.source === 'Sitio web' && item.request_type === 'quote' ? 'Cotizador público' : item.source;
  const followUp = requestFollowUp(item);
  const displayName = item.name || 'Sin nombre';
  const contactLine = [item.phone, item.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo';
  const priority = followUp.overdue ? 'is-overdue' : item.status === 'new' ? 'is-new' : '';
  if (compact) return <article className={`crm-request-card ${priority}`}><button className="crm-request-main" type="button" onClick={() => onOpen(item.id)} aria-label={`Abrir solicitud de ${displayName}`}>
    <span className="crm-request-card-head"><span className="crm-avatar" aria-hidden="true">{initials(displayName)}</span><span className="crm-request-person"><b>{displayName}</b><small>{item.company || 'Contacto individual'}</small></span><span className={`crm-stage-pill stage-${item.status}`}>{stages[item.status] || 'Nuevo'}</span></span>
    <span className="crm-request-interest"><b>{item.service || 'Interés por definir'}</b><small>{sourceLabel}</small></span>
    <span className="crm-request-contact">{contactLine}</span>
    <span className={`crm-request-followup ${followUp.overdue ? 'is-overdue' : followUp.missing ? 'is-missing' : ''}`}><CalendarClock size={14}/><span><b>{followUp.action || (item.status === 'new' ? 'Primer contacto pendiente' : 'Sin próxima acción')}</b><small>{followUp.date}</small></span>{followUp.overdue&&<em>Vencido</em>}</span>
    <span className={`crm-request-owner ${!item.assigned_name ? 'is-unassigned' : ''}`}><UserRound size={14}/>{item.assigned_name || 'Sin asignar'}</span><ArrowUpRight className="crm-request-open" size={16}/>
  </button></article>;
  return <tr className={`crm-table-row ${priority}`} tabIndex={0} aria-label={`Abrir solicitud de ${displayName}`} onClick={()=>onOpen(item.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen(item.id)}}}>
    <td><span className="crm-person-cell"><span className="crm-avatar" aria-hidden="true">{initials(displayName)}</span><span><b>{displayName}</b><small>{item.company || 'Contacto individual'}</small><small className="crm-contact-line">{contactLine}</small></span></span></td>
    <td><span className="crm-interest-cell"><b>{item.service || 'Interés por definir'}</b><small><i className={`crm-source-dot source-${item.source === 'WhatsApp' ? 'whatsapp' : item.source === 'Teléfono' ? 'phone' : item.source === 'Local' ? 'local' : 'web'}`}/>{sourceLabel}</small></span></td>
    <td><span className={`crm-owner-cell ${!item.assigned_name ? 'is-unassigned' : ''}`}><UserRound size={14}/>{item.assigned_name || 'Sin asignar'}</span></td>
    <td><span className={`crm-stage-pill stage-${item.status}`}>{stages[item.status] || 'Nuevo'}</span></td>
    <td><span className={`crm-next-action ${followUp.overdue ? 'is-overdue' : followUp.missing ? 'is-missing' : ''}`}><b>{followUp.action || (item.status === 'new' ? 'Primer contacto pendiente' : 'Sin próxima acción')}</b><small>{followUp.date}{followUp.overdue?' · Vencido':''}</small></span></td>
    <td><span className="crm-row-open" aria-hidden="true"><ArrowUpRight size={15}/></span></td>
  </tr>;
}

export function CRMInboxPage({ area = 'operations' }: { area?: 'admin' | 'operations' }) {
  const { user, hasPermission } = useAuth();
  const alert = useAlert();
  const confirm = useConfirm();
  const canView = hasPermission('crm', 'view');
  const canEdit = hasPermission('crm', 'edit');
  const [mode, setMode] = useState<'loading' | 'ready' | 'error' | 'denied' | 'offline'>('loading');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<any>({ items: [], total: 0, metrics: {}, assignees: [] });
  const readFilters = () => { try { return JSON.parse(sessionStorage.getItem('visualcorp-crm-filters') || '{}'); } catch { return {}; } };
  const [saved] = useState(readFilters);
  const [view, setView] = useState(saved.view || 'all');
  const [query, setQuery] = useState(saved.query || '');
  const [search, setSearch] = useState(saved.query || '');
  const [stage, setStage] = useState(saved.stage || 'all');
  const [source, setSource] = useState(saved.source || 'all');
  const [assignee, setAssignee] = useState(saved.assignee || 'all');
  const [from, setFrom] = useState(saved.from || '');
  const [to, setTo] = useState(saved.to || '');
  const [page, setPage] = useState(saved.page || 1);
  const [period, setPeriod] = useState(saved.period || '30d');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newBusy, setNewBusy] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', phone: '', email: '', company: '', service: '', message: '', source: 'WhatsApp' });
  const [note, setNote] = useState('');
  const [followUpAction, setFollowUpAction] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [lostReason, setLostReason] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    try { sessionStorage.setItem('visualcorp-crm-filters', JSON.stringify({ view, query, stage, source, assignee, from, to, page, period })); } catch { /* Storage is optional. */ }
  }, [view, query, stage, source, assignee, from, to, page, period]);

  const loadInbox = async () => {
    if (!supabaseConfigured || !supabase) { setMode('offline'); return; }
    if (!user || !canView) { setMode('denied'); return; }
    setRefreshing(true);
    if (!hasLoaded) setMode('loading');
    try {
      const { data: result, error } = await supabase.rpc('get_visualcorp_crm_inbox', {
        p_view: view, p_search: search, p_stage: stage, p_source: source, p_assignee: assignee,
        p_from: from || null, p_to: to || null, p_period: period, p_page: page, p_page_size: 25,
      });
      if (error) throw error;
      setData(result || { items: [], total: 0, metrics: {}, assignees: [] }); setMode('ready'); setHasLoaded(true); setErrorMessage('');
    } catch (error: any) { setErrorMessage(error.message || 'No se pudo cargar la bandeja.'); setMode('error'); }
    finally { setRefreshing(false); }
  };
  useEffect(() => { void loadInbox(); }, [user?.id, canView, view, search, stage, source, assignee, from, to, period, page, retry]);

  const loadDetail = async (id: string) => {
    if (!supabase) return;
    setSelectedId(id); setDetailBusy(true);
    try {
      const { data: result, error } = await supabase.rpc('get_visualcorp_request_detail', { p_request_id: id });
      if (error) throw error;
      setDetail(result); setFollowUpAction(result?.follow_up_action || ''); setFollowUp(result?.follow_up_at ? new Date(result.follow_up_at).toISOString().slice(0, 16) : ''); setLostReason(result?.lost_reason || '');
    } catch (error: any) { setDetail(null); await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'No se abrió la ficha', description: error.message, tone: 'danger' }); setSelectedId(null); }
    finally { setDetailBusy(false); }
  };
  const refresh = async () => { if (selectedId) await loadDetail(selectedId); await loadInbox(); };
  const saveRequest = async (payload: Record<string, unknown>, success: string) => {
    if (!supabase || !detail?.id) return false;
    setDetailBusy(true); const { error } = await supabase.rpc('update_visualcorp_request', { p_request_id: detail.id, ...payload }); setDetailBusy(false);
    if (error) { await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'No se guardaron los cambios', description: error.message, tone: 'danger' }); return false; }
    await refresh(); if (success) await alert({ eyebrow: 'SOLICITUDES Y CRM', title: success, tone: 'success' }); return true;
  };
  const createRequest = async (event: React.FormEvent) => {
    event.preventDefault(); if (!supabase) return;
    setNewBusy(true); const { data: id, error } = await supabase.rpc('create_visualcorp_manual_request', {
      p_name: newForm.name.trim(), p_phone: newForm.phone.trim(), p_email: newForm.email.trim(), p_company: newForm.company.trim(),
      p_service: newForm.service.trim(), p_message: newForm.message.trim(), p_source: newForm.source,
    }); setNewBusy(false);
    if (error) { await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'No se creó la solicitud', description: error.message, tone: 'danger' }); return; }
    setNewOpen(false); setNewForm({ name: '', phone: '', email: '', company: '', service: '', message: '', source: 'WhatsApp' }); setPage(1); await loadInbox(); await loadDetail(id);
  };
  const logContact = async (method: string) => {
    if (!supabase || !detail) return;
    const { error } = await supabase.rpc('log_visualcorp_request_contact', { p_request_id: detail.id, p_method: method, p_note: note.trim() });
    if (error) { await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'No se registró el contacto', description: error.message, tone: 'danger' }); return; }
    setNote('');
    if (detail.status === 'new') { const updateResult = await supabase.rpc('update_visualcorp_request', { p_request_id: detail.id, p_status: 'contacted' }); if (updateResult.error) { await alert({ eyebrow: 'SOLICITUDES Y CRM', title: 'Se registró el contacto, pero no cambió la etapa', description: updateResult.error.message, tone: 'warning' }); } }
    await refresh();
  };
  const chooseCustomer = async (customerId?: string) => {
    if (!supabase || !detail) return;
    const match = (detail.matches || []).find((candidate: any) => candidate.id === customerId);
    const accepted = await confirm({ eyebrow: 'CONFIRMAR VÍNCULO', title: match ? `¿Vincular con ${match.name}?` : '¿Crear o encontrar una ficha 360°?', description: match ? `Se vinculará esta solicitud al cliente que coincide por teléfono o correo (${match.phone || match.email}).` : 'Se buscará una ficha con el mismo teléfono o correo. Si no existe, se creará una nueva y esta solicitud pasará a Ganado.', confirmLabel: match ? 'Vincular cliente' : 'Confirmar y continuar', cancelLabel: 'Volver' });
    if (!accepted) return;
    const { error } = customerId
      ? await supabase.rpc('link_visualcorp_request_customer', { p_request_id: detail.id, p_customer_id: customerId })
      : await supabase.rpc('convert_visualcorp_request_to_customer', { p_request_id: detail.id });
    if (error) { await alert({ eyebrow: 'CLIENTES 360°', title: 'No se vinculó la ficha', description: error.message, tone: 'danger' }); return; }
    await refresh(); await alert({ eyebrow: 'CLIENTES 360°', title: 'Solicitud vinculada al cliente', description: 'La ficha 360° quedó conectada con esta oportunidad.', tone: 'success' });
  };
  const pageCount = Math.max(1, Math.ceil(Number(data.total || 0) / 25));
  const received = Number(data.metrics?.received || 0);
  const won = Number(data.metrics?.won || 0);
  const conversionRate = received ? Math.round((won / received) * 100) : 0;
  const filtersActive = view !== 'all' || Boolean(search.trim()) || stage !== 'all' || source !== 'all' || assignee !== 'all' || Boolean(from || to);
  const setViewFilter = (next: string) => { setView(next); setStage('all'); setPage(1); };
  const clearFilters = () => { setView('all'); setQuery(''); setSearch(''); setStage('all'); setSource('all'); setAssignee('all'); setFrom(''); setTo(''); setPage(1); };
  const metricCard = (viewKey: string, metricKey: string, label: string, noteText: string, tone: string, icon: React.ReactNode) => {
    const active = viewKey === 'new' ? view === 'all' && stage === 'new' : view === viewKey;
    const value = mode === 'loading' && !hasLoaded ? null : Number(data.metrics?.[metricKey] || 0);
    return <button type="button" className={`crm-kpi ${tone} ${active ? 'is-active' : ''}`} onClick={() => {
      if (viewKey === 'new') { setView('all'); setStage('new'); setPage(1); }
      else setViewFilter(viewKey);
    }} aria-pressed={active}>
      <span className="crm-kpi-icon" aria-hidden="true">{icon}</span>
      <span className="crm-kpi-copy"><span>{label}</span><b>{value === null ? '—' : <NumberFlow value={value} locales="es-EC" format={{ maximumFractionDigits: 0 }}/>}</b><small>{noteText}</small></span>
      <ArrowUpRight className="crm-kpi-open" size={15} aria-hidden="true"/>
    </button>;
  };

  return <AppFrame area={area}>
    <div className="crm-workspace">
      <PageHeading
        eyebrow="GESTIÓN DE CLIENTES · EMBUDO COMERCIAL"
        title="Solicitudes y Prospectos CRM"
        description="Cada oportunidad, con responsable y siguiente paso a la vista."
        action={<div className="crm-heading-actions">
          <Link className="button button-outline" to="/operaciones/clientes"><Users size={15}/> Directorio 360°</Link>
          {canEdit && <button className="button button-primary" type="button" onClick={()=>setNewOpen(true)}><Plus size={15}/> Nueva solicitud</button>}
        </div>}
      />

      {mode === 'error' && <div className="crm-data-state is-error" role="alert"><span>{errorMessage}</span><button className="button button-outline" type="button" disabled={refreshing} onClick={()=>setRetry(x=>x+1)}><RefreshCw size={14}/> {refreshing?'Reintentando…':'Reintentar'}</button></div>}
      {mode === 'offline' && <p className="crm-data-state is-denied" role="status">La base compartida no está configurada. No se muestran registros locales de demostración.</p>}
      {mode === 'denied' && <p className="crm-data-state is-denied" role="status">Tu perfil no tiene permiso para consultar las solicitudes del CRM.</p>}

      <section className="crm-overview" aria-label="Resumen de solicitudes y conversión">
        <header className="crm-overview-heading"><div><span>Prioridades de atención</span><small>Recuento actualizado con tu acceso</small></div><span className="crm-shared-status"><i/> Datos compartidos</span></header>
        <div className="crm-kpi-grid">
          {metricCard('new','new','Nuevos','Por contactar','tone-new',<Users size={17}/>)}
          {metricCard('unassigned','unassigned','Sin asignar','Oportunidades activas','tone-unassigned',<UserRound size={17}/>)}
          {metricCard('overdue','overdue','Vencidos','Seguimientos atrasados','tone-overdue',<CircleAlert size={17}/>)}
          {metricCard('today','today','Para hoy','Seguimientos agendados','tone-today',<Clock3 size={17}/>)}
          <article className="crm-conversion-card">
            <div className="crm-conversion-ring" style={{'--crm-progress': `${conversionRate}%`} as React.CSSProperties} aria-hidden="true"><span>{received ? <NumberFlow value={conversionRate} suffix="%" locales="es-EC" format={{ maximumFractionDigits: 0 }}/> : '—'}</span></div>
            <div className="crm-conversion-copy"><span>Conversión</span><b>{received ? `${won} ganadas de ${received}` : 'Sin datos'}</b><small>Solicitudes recibidas en el período</small></div>
            <label className="crm-period-select"><span>Período</span><select aria-label="Período de conversión" value={period} onChange={e=>setPeriod(e.target.value)}><option value="7d">7 días</option><option value="30d">30 días</option><option value="90d">90 días</option><option value="all">Todo el período</option></select></label>
          </article>
        </div>
      </section>

      <section className="panel crm-inbox-panel" aria-labelledby="crm-inbox-title">
        <header className="crm-inbox-heading">
          <div><span className="crm-section-kicker">Bandeja comercial</span><h2 id="crm-inbox-title">Oportunidades</h2><p>Atiende primero las vencidas y los contactos nuevos.</p></div>
          <div className="crm-inbox-header-tools"><span className="crm-results-count" aria-live="polite">{mode==='loading'?'Cargando…':`${data.total||0} ${Number(data.total||0)===1?'solicitud':'solicitudes'}`}</span><button className="crm-icon-button" type="button" aria-label="Actualizar bandeja" title="Actualizar" disabled={refreshing} onClick={()=>void loadInbox()}><RefreshCw size={16} className={refreshing?'is-spinning':''}/></button></div>
        </header>

        <div className="crm-view-tabs" role="tablist" aria-label="Vistas de solicitudes">{[['all','Todas'],['mine','Mis pendientes'],['unassigned','Sin asignar'],['overdue','Vencidos'],['today','Para hoy']].map(([key,label])=><button key={key} type="button" role="tab" aria-selected={view===key} className={view===key?'is-active':''} onClick={()=>setViewFilter(key)}>{label}</button>)}</div>

        <div className="crm-filter-area">
          <label className="crm-search"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Busca por nombre, empresa, contacto o servicio" aria-label="Buscar solicitudes"/>{query&&<button type="button" aria-label="Limpiar búsqueda" onClick={()=>{setQuery('');setSearch('');setPage(1)}}><X size={14}/></button>}</label>
          <div className="crm-filters" aria-label="Filtros de solicitudes">
            <label className="crm-filter-select"><span><SlidersHorizontal size={13}/> Etapa</span><select aria-label="Etapa" value={stage} onChange={e=>{setStage(e.target.value);setPage(1)}}><option value="all">Todas las etapas</option>{stageKeys.map(k=><option value={k} key={k}>{stages[k]}</option>)}</select></label>
            <label className="crm-filter-select"><span><Filter size={13}/> Origen</span><select aria-label="Origen" value={source} onChange={e=>{setSource(e.target.value);setPage(1)}}><option value="all">Todos los orígenes</option>{['Sitio web','Cotizador público','WhatsApp','Teléfono','Local'].map(s=><option key={s}>{s}</option>)}</select></label>
            <label className="crm-filter-select"><span><UserRound size={13}/> Responsable</span><select aria-label="Responsable" value={assignee} onChange={e=>{setAssignee(e.target.value);setPage(1)}}><option value="all">Todo el equipo</option><option value="unassigned">Sin asignar</option>{(data.assignees||[]).map((p:any)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
            <label className="crm-date-filter"><span>Desde</span><input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1)}} aria-label="Fecha desde"/></label>
            <label className="crm-date-filter"><span>Hasta</span><input type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1)}} aria-label="Fecha hasta"/></label>
            {filtersActive&&<button className="crm-clear-filters" type="button" onClick={clearFilters}><X size={13}/> Limpiar filtros</button>}
          </div>
        </div>

        {mode==='loading'&&!hasLoaded&&<p className="crm-data-state is-loading" role="status">Cargando solicitudes compartidas…</p>}
        {mode==='ready'&&!data.items?.length&&<div className="crm-inbox-empty"><span className="crm-empty-icon"><Search size={20}/></span><b>{filtersActive?'No hay coincidencias':'Aún no hay solicitudes'}</b><span>{filtersActive?'Prueba con otros términos o limpia los filtros.':'Las solicitudes web y los contactos que registre el equipo aparecerán aquí.'}</span>{filtersActive&&<button className="button button-outline" type="button" onClick={clearFilters}>Limpiar filtros</button>}</div>}
        {(mode==='ready'||(hasLoaded&&mode==='error'&&Boolean(data.items?.length)))&&Boolean(data.items?.length)&&<>
          <div id="crm-results" className="table-wrap crm-table-wrap"><table className="crm-table"><thead><tr><th>Contacto</th><th>Interés y origen</th><th>Responsable</th><th>Etapa</th><th>Próxima acción</th><th aria-label="Abrir ficha"/></tr></thead><tbody>{data.items.map((item:any)=><RequestRow key={item.id} item={item} compact={false} onOpen={id=>void loadDetail(id)}/>)}</tbody></table></div>
          <div className="crm-mobile-list">{data.items.map((item:any)=><RequestRow key={item.id} item={item} compact onOpen={id=>void loadDetail(id)}/>)}</div>
          <footer className="crm-pagination"><span>Mostrando {data.total?`${(page-1)*25+1}–${Math.min(page*25,data.total)} de ${data.total}`:'0 solicitudes'}</span><div><button className="crm-page-button" type="button" disabled={page<=1} onClick={()=>setPage((n:number)=>Math.max(1,n-1))} aria-label="Página anterior"><ChevronLeft size={16}/></button><span>Página {page} de {pageCount}</span><button className="crm-page-button" type="button" disabled={page>=pageCount} onClick={()=>setPage((n:number)=>n+1)} aria-label="Página siguiente"><ChevronRight size={16}/></button></div></footer>
        </>}
      </section>

      <Dialog open={newOpen} onOpenChange={setNewOpen} title="Nueva solicitud" description="Registra un contacto recibido por un canal directo." eyebrow="REGISTRO COMERCIAL" icon={<Plus size={20}/>} size="md" busy={newBusy} footer={<><button className="button button-outline" type="button" onClick={()=>setNewOpen(false)}>Cancelar</button><button className="button button-primary" type="submit" form="crm-new-form" disabled={newBusy||!newForm.name.trim()}>{newBusy?'Guardando…':'Guardar solicitud'}</button></>}>
        <form id="crm-new-form" className="crm-form" onSubmit={createRequest}><label>Nombre<input required maxLength={160} value={newForm.name} onChange={e=>setNewForm({...newForm,name:e.target.value})}/></label><div className="crm-form-row"><label>Teléfono<input inputMode="tel" maxLength={50} value={newForm.phone} onChange={e=>setNewForm({...newForm,phone:e.target.value})}/></label><label>Correo<input type="email" maxLength={254} value={newForm.email} onChange={e=>setNewForm({...newForm,email:e.target.value})}/></label></div><label>Empresa<input maxLength={160} value={newForm.company} onChange={e=>setNewForm({...newForm,company:e.target.value})}/></label><div className="crm-form-row"><label>Servicio de interés<input maxLength={160} value={newForm.service} onChange={e=>setNewForm({...newForm,service:e.target.value})}/></label><label>Origen<select value={newForm.source} onChange={e=>setNewForm({...newForm,source:e.target.value})}><option>WhatsApp</option><option>Teléfono</option><option>Local</option></select></label></div><label>Consulta<textarea maxLength={4000} rows={3} value={newForm.message} onChange={e=>setNewForm({...newForm,message:e.target.value})}/></label></form>
      </Dialog>

      <Dialog open={Boolean(selectedId)} onOpenChange={open=>{if(!open){setSelectedId(null);setDetail(null)}}} title={detail?.name||'Seguimiento de solicitud'} description={detail?.company||'Contacto, historial y próximos pasos de esta oportunidad.'} eyebrow="FICHA CRM" icon={<span className="crm-avatar crm-dialog-avatar" aria-hidden="true">{initials(detail?.name)}</span>} size="xl" side="right" className="crm-detail-dialog" overlayClassName="crm-detail-overlay" busy={detailBusy}>
        {detailBusy&&!detail?<p role="status">Cargando ficha…</p>:detail&&<div className="crm-detail-body">
          <section className="crm-detail-summary"><div className="crm-detail-summary-main"><span className={`crm-stage-pill stage-${detail.status}`}>{stages[detail.status]}</span><small>{detail.source==='Sitio web'&&detail.request_type==='quote'?'Cotizador público':detail.source} · {formatDate(detail.created_at)}</small></div>{detail.customer_id&&<Link className="button button-outline" to={`/operaciones/clientes?cliente=${encodeURIComponent(detail.customer_id)}`}><Users size={14}/> Ficha 360°</Link>}</section>
          <section className="crm-detail-section"><h3>Contacto</h3><p><b>{detail.name||'Sin nombre'}</b>{detail.company&&` · ${detail.company}`}</p><p className="crm-detail-contact-line">{detail.phone||'Teléfono pendiente'}{detail.email?` · ${detail.email}`:''}</p>{detail.email&&<a className="crm-email-link" href={`mailto:${detail.email}`}><Mail size={14}/> Escribir correo</a>}{detail.message&&<blockquote>{detail.message}</blockquote>}{detail.quote_data?.request&&<details className="crm-quote-details"><summary>Ver especificaciones del cotizador</summary><pre>{JSON.stringify(detail.quote_data.request,null,2)}</pre></details>}</section>
          <section className="crm-detail-section"><h3>Gestión</h3>{canEdit?<>
            <div className="crm-form-row"><label>Etapa<select value={detail.status} onChange={e=>{const next=e.target.value;if(next==='won'){void chooseCustomer();return}if(next==='lost'){setDetail({...detail,status:'lost'});return}void saveRequest({p_status:next},'Etapa actualizada')}}>{stageKeys.map(k=><option value={k} key={k}>{stages[k]}</option>)}</select></label><label>Responsable<select value={detail.assigned_to||''} onChange={e=>void saveRequest({p_update_assignment:true,p_assigned_to:e.target.value||null},'Responsable actualizado')}><option value="">Sin asignar</option>{(data.assignees||[]).map((p:any)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div>
            {detail.status==='lost'&&<div className="crm-inline-action"><label>Motivo de pérdida<input required value={lostReason} onChange={e=>setLostReason(e.target.value)} maxLength={500}/></label><button className="button button-primary" type="button" disabled={!lostReason.trim()} onClick={()=>void saveRequest({p_status:'lost',p_lost_reason:lostReason},'Motivo registrado')}>Guardar motivo</button></div>}
            <div className="crm-followup-editor"><label>Próxima acción<input value={followUpAction} onChange={e=>setFollowUpAction(e.target.value)} maxLength={180} placeholder="Ej. Llamar para revisar el alcance"/></label><label>Fecha y hora<input type="datetime-local" value={followUp} onChange={e=>setFollowUp(e.target.value)}/></label><small>Completa acción y fecha, o deja ambos vacíos para retirar el seguimiento.</small><button className="button button-primary" type="button" disabled={Boolean(followUpAction.trim())!==Boolean(followUp)||detailBusy} onClick={()=>void saveRequest({p_update_follow_up:true,p_follow_up_action:followUpAction.trim(),p_follow_up_at:followUp?new Date(followUp).toISOString():null},'Próxima acción guardada')}><CalendarClock size={14}/> Guardar próxima acción</button></div>
          </>:<p>{detail.assigned_name||'Sin asignar'}{detail.follow_up_action?` · ${detail.follow_up_action}`:''}{detail.follow_up_at?` · ${new Date(detail.follow_up_at).toLocaleString('es-EC',{timeZone:'America/Guayaquil'})}`:''}</p>}</section>
          {canEdit&&detail.status!=='lost'&&(!detail.customer_id)&&<section className="crm-detail-section crm-win-section"><h3>{detail.status==='won'?'Completar ficha de cliente':'Vincular cliente'}</h3><p>Al cerrar como ganada, conecta esta oportunidad con una ficha 360°.</p>{detail.matches?.length>0&&<div className="crm-customer-matches">{detail.matches.map((m:any)=><button type="button" key={m.id} onClick={()=>void chooseCustomer(m.id)}><b>{m.name}</b><small>{m.phone||m.email}</small><span>Vincular</span></button>)}</div>}<button className="button button-outline" type="button" onClick={()=>void chooseCustomer()}>{detail.matches?.length?'Crear o encontrar ficha 360°':detail.status==='won'?'Crear ficha 360°':'Crear ficha 360° y marcar ganada'}</button></section>}
          <section className="crm-detail-section"><h3>Propuestas vinculadas</h3>{detail.quotes?.length?detail.quotes.map((q:any)=><div className="crm-linked-quote" key={q.id}><b>{q.quote_code}</b><span>{q.status}</span><small>{formatDate(q.created_at)}</small></div>):<p className="muted-count">Aún no hay cotizaciones vinculadas.</p>}<Link className="button button-outline" to={`/operaciones/cotizador?fromRequest=${encodeURIComponent(detail.id)}`}><FileText size={14}/> Abrir cotizador con esta solicitud</Link></section>
          {canEdit&&<section className="crm-detail-section"><h3>Registrar actividad</h3><label>Nota<input maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Resumen del contacto o acuerdo"/></label><button className="button button-outline" type="button" disabled={!note.trim()} onClick={()=>void saveRequest({p_note:note},'Nota guardada').then(ok=>ok&&setNote(''))}>Guardar nota</button><div className="crm-contact-actions">{whatsappHref(detail.phone,detail.name,detail.service)&&<a className="button button-outline" href={whatsappHref(detail.phone,detail.name,detail.service)} target="_blank" rel="noreferrer"><MessageCircle size={14}/> Abrir WhatsApp</a>}<button className="button button-outline" type="button" onClick={()=>void logContact('WhatsApp')}>Registrar contacto por WhatsApp</button><button className="button button-outline" type="button" onClick={()=>void logContact('Teléfono')}>Registrar llamada</button><button className="button button-outline" type="button" onClick={()=>void logContact('Presencial')}>Registrar visita</button></div></section>}
          <section className="crm-detail-section crm-history-section"><div className="crm-history-heading"><h3>Historial</h3><span>{detail.activity?.length||0} eventos</span></div>{detail.activity?.length?detail.activity.map((entry:any)=><div className="crm-activity" key={entry.id}><i/><div><b>{entry.kind==='created'?'Solicitud creada':entry.kind==='stage'?'Cambio de etapa':entry.kind==='assignment'?'Cambio de responsable':entry.kind==='follow_up'?'Próxima acción':entry.kind==='contact'?`Contacto · ${entry.details.method}`:entry.kind==='customer'?'Ficha de cliente vinculada':'Nota'}</b><p>{activityDescription(entry)}</p><small>{entry.actor} · {new Date(entry.created_at).toLocaleString('es-EC',{timeZone:'America/Guayaquil'})}</small></div></div>):<p className="muted-count">No hay actividad registrada.</p>}</section>
        </div>}
      </Dialog>
    </div>
  </AppFrame>;
}
