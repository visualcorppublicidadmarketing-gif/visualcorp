import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, BriefcaseBusiness, CalendarDays, Check, ChevronRight, CircleUserRound, Clock3, ContactRound, Edit3, History, Link2, Mail, Phone, Plus, Search, ShieldAlert, Unlink, UserRound, Users, X } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import './personnel.css';

type PersonnelRecord = {
  id: string; organization_id: string; full_name: string; email: string; phone: string;
  department: string; job_title: string; status: 'active' | 'inactive'; start_date: string | null; end_date: string | null;
  created_at: string; updated_at: string;
};
type PersonnelEvent = { id: number; event_key: string; summary: string; changed_fields: string[]; salary_sensitive: boolean; actor_label: string; created_at: string };
type Compensation = { id: string; amount: number; currency_code: string; pay_period: string; effective_date: string; note: string; created_at: string; created_by: string };
type RecordDraft = Pick<PersonnelRecord, 'full_name' | 'email' | 'phone' | 'department' | 'job_title' | 'status' | 'start_date' | 'end_date'>;
type GoogleAccount = { user_id: string; email: string; full_name: string; last_sign_in_at: string | null; linked_personnel_id: string | null; linked_personnel_name: string | null; roles: string[]; access_profiles: string[]; access_active: boolean };

const emptyDraft: RecordDraft = { full_name: '', email: '', phone: '', department: '', job_title: '', status: 'active', start_date: '', end_date: '' };
const fieldLabels: Record<string, string> = { full_name: 'nombre', email: 'correo', phone: 'teléfono', department: 'área', job_title: 'cargo', status: 'estado', start_date: 'fecha de ingreso', end_date: 'fecha de salida', google_account: 'cuenta Google' };
const dateLabel = (value?: string | null) => value ? new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('es-EC',{day:'numeric',month:'short',year:'numeric'}) : '—';
const dateTimeLabel = (value?: string | null) => value ? new Date(value).toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'}) : '—';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';
const formatCompensation = (item: Compensation) => {
  try { return new Intl.NumberFormat('es-EC',{style:'currency',currency:item.currency_code}).format(Number(item.amount)); }
  catch { return `${Number(item.amount).toFixed(2)} ${item.currency_code}`; }
};

export function PersonnelPage() {
  const { organizationId, user, roles, hasPermission } = useAuth();
  const canEdit = hasPermission('personnel','edit');
  const canManageTeam = hasPermission('team','manage_members');
  const canLinkAccount = canEdit && canManageTeam;
  const canViewCompensation = hasPermission('personnel','view_compensation');
  const canEditCompensation = hasPermission('personnel','edit_compensation');
  const [records, setRecords] = useState<PersonnelRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState<PersonnelEvent[]>([]);
  const [compensation, setCompensation] = useState<Compensation[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [accessProfiles, setAccessProfiles] = useState<any[]>([]);
  const [accountUserId, setAccountUserId] = useState('');
  const [accountProfileId, setAccountProfileId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PersonnelRecord | null>(null);
  const [draft, setDraft] = useState<RecordDraft>(emptyDraft);
  const [salaryDraft, setSalaryDraft] = useState({ amount: '', currency_code: 'USD', pay_period: '', effective_date: '', note: '' });

  const loadRecords = useCallback(async (preferredId?: string) => {
    if (!supabase || !organizationId) { setRecords([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data, error: resultError } = await supabase.from('personnel_records').select('id,organization_id,full_name,email,phone,department,job_title,status,start_date,end_date,created_at,updated_at').eq('organization_id',organizationId).order('full_name');
      if (resultError) throw resultError;
      const rows = (data || []) as PersonnelRecord[];
      setRecords(rows);
      setSelectedId((current) => {
        const wanted = preferredId || current;
        return rows.some((row) => row.id === wanted) ? wanted : rows[0]?.id || '';
      });
    } catch (loadError) { setError(errorText(loadError)); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const loadGoogleAccounts = useCallback(async () => {
    if (!supabase || !canLinkAccount) { setGoogleAccounts([]); setAccessProfiles([]); return; }
    const [accountsResult, profilesResult] = await Promise.all([
      supabase.rpc('list_visualcorp_personnel_google_accounts'),
      supabase.rpc('list_visualcorp_personnel_access_profiles'),
    ]);
    if (accountsResult.error) { setError(accountsResult.error.message); return; }
    if (profilesResult.error) { setError(profilesResult.error.message); return; }
    setGoogleAccounts((accountsResult.data || []) as GoogleAccount[]);
    setAccessProfiles(profilesResult.data || []);
  }, [canLinkAccount]);
  useEffect(() => { void loadGoogleAccounts(); }, [loadGoogleAccounts]);

  const selected = records.find((record) => record.id === selectedId) || null;
  useEffect(() => {
    if (!supabase || !organizationId || !selectedId) { setEvents([]); setCompensation([]); return; }
    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true); setError('');
      try {
        const requests: any[] = [supabase.from('personnel_events').select('id,event_key,summary,changed_fields,salary_sensitive,actor_label,created_at').eq('organization_id',organizationId).eq('personnel_id',selectedId).order('created_at',{ascending:false}).limit(80)];
        if (canViewCompensation) requests.push(supabase.from('personnel_compensation_history').select('id,amount,currency_code,pay_period,effective_date,note,created_at,created_by').eq('organization_id',organizationId).eq('personnel_id',selectedId).order('effective_date',{ascending:false}).limit(40));
        const results = await Promise.all(requests);
        const eventResult = results[0];
        if (eventResult.error) throw eventResult.error;
        const payResult = canViewCompensation ? results[1] : null;
        if (payResult?.error) throw payResult.error;
        if (!active) return;
        setEvents((eventResult.data || []) as PersonnelEvent[]);
        setCompensation((payResult?.data || []) as Compensation[]);
      } catch (loadError) { if (active) setError(errorText(loadError)); }
      finally { if (active) setDetailLoading(false); }
    };
    void loadDetail();
    return () => { active = false; };
  }, [organizationId, selectedId, canViewCompensation]);

  const departments = useMemo(() => [...new Set(records.map((record) => record.department.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), [records]);
  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchesQuery = `${record.full_name} ${record.email} ${record.phone} ${record.department} ${record.job_title}`.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'));
    return matchesQuery && (statusFilter === 'all' || record.status === statusFilter) && (departmentFilter === 'all' || record.department === departmentFilter);
  }), [records, query, statusFilter, departmentFilter]);
  const activeCount = records.filter((record) => record.status === 'active').length;
  const linkedAccount = googleAccounts.find((account) => account.linked_personnel_id === selected?.id) || null;
  const chosenAccount = googleAccounts.find((account) => account.user_id === accountUserId) || null;

  const openNew = () => { setEditingRecord(null); setDraft(emptyDraft); setError(''); setMessage(''); setModalOpen(true); };
  const openEdit = (record: PersonnelRecord) => {
    setEditingRecord(record);
    setDraft({ full_name:record.full_name,email:record.email,phone:record.phone,department:record.department,job_title:record.job_title,status:record.status,start_date:record.start_date||'',end_date:record.end_date||'' });
    setError(''); setMessage(''); setModalOpen(true);
  };

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !canEdit || saving) return;
    setSaving(true); setError(''); setMessage('');
    const payload = { ...draft, full_name:draft.full_name.trim(), email:draft.email.trim(), phone:draft.phone.trim(), department:draft.department.trim(), job_title:draft.job_title.trim(), start_date:draft.start_date||null, end_date:draft.end_date||null, organization_id:organizationId, updated_by:user.id };
    try {
      const result = editingRecord
        ? await supabase.from('personnel_records').update(payload).eq('id',editingRecord.id).eq('organization_id',organizationId).select('id').single()
        : await supabase.from('personnel_records').insert(payload).select('id').single();
      if (result.error) throw result.error;
      setModalOpen(false); await loadRecords(result.data.id); setMessage(editingRecord?'Ficha actualizada.':'Ficha creada.');
    } catch (saveError) { setError(errorText(saveError)); }
    finally { setSaving(false); }
  };

  const addCompensation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !selected || !canEditCompensation || saving) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const { error: insertError } = await supabase.from('personnel_compensation_history').insert({
        organization_id:organizationId,personnel_id:selected.id,amount:Number(salaryDraft.amount),currency_code:salaryDraft.currency_code.trim().toUpperCase(),pay_period:salaryDraft.pay_period.trim(),effective_date:salaryDraft.effective_date,note:salaryDraft.note.trim(),created_by:user.id,
      });
      if (insertError) throw insertError;
      setSalaryDraft({ amount:'',currency_code:'USD',pay_period:'',effective_date:'',note:'' });
      await reloadDetail(); setMessage('Cambio de remuneración registrado en el historial.');
    } catch (saveError) { setError(errorText(saveError)); }
    finally { setSaving(false); }
  };

  const saveAccountLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !selected || !chosenAccount || !canLinkAccount || chosenAccount.linked_personnel_id && chosenAccount.linked_personnel_id !== selected.id || accountSaving) return;
    setAccountSaving(true); setError(''); setMessage('');
    try {
      const { error: linkError } = await supabase.rpc('link_visualcorp_personnel_google_account', { p_personnel_id: selected.id, p_user_id: chosenAccount.user_id });
      if (linkError) throw linkError;
      await loadGoogleAccounts(); await loadRecords(selected.id); setMessage('Cuenta Google vinculada a la ficha. Los permisos se gestionan por separado.');
    } catch (linkError) { setError(errorText(linkError)); }
    finally { setAccountSaving(false); }
  };

  const removeAccountLink = async () => {
    if (!supabase || !selected || !canLinkAccount || !linkedAccount || accountSaving) return;
    setAccountSaving(true); setError(''); setMessage('');
    try {
      const { error: unlinkError } = await supabase.rpc('unlink_visualcorp_personnel_google_account', { p_personnel_id: selected.id });
      if (unlinkError) throw unlinkError;
      await loadGoogleAccounts(); await loadRecords(selected.id); setMessage('Cuenta desvinculada. Su acceso actual se conserva.');
    } catch (unlinkError) { setError(errorText(unlinkError)); }
    finally { setAccountSaving(false); }
  };

  const assignAccountProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !linkedAccount || !accountProfileId || !canLinkAccount || accountSaving) return;
    setAccountSaving(true); setError(''); setMessage('');
    try {
      const { error: assignError } = await supabase.rpc('assign_visualcorp_profile', { p_email: linkedAccount.email, p_profile_id: accountProfileId });
      if (assignError) throw assignError;
      setAccountProfileId(''); await loadGoogleAccounts(); setMessage('Perfil de acceso asignado.');
    } catch (assignError) { setError(errorText(assignError)); }
    finally { setAccountSaving(false); }
  };

  const reloadDetail = async () => {
    if (!supabase || !organizationId || !selectedId) return;
    const requests: any[] = [supabase.from('personnel_events').select('id,event_key,summary,changed_fields,salary_sensitive,actor_label,created_at').eq('organization_id',organizationId).eq('personnel_id',selectedId).order('created_at',{ascending:false}).limit(80)];
    if (canViewCompensation) requests.push(supabase.from('personnel_compensation_history').select('id,amount,currency_code,pay_period,effective_date,note,created_at,created_by').eq('organization_id',organizationId).eq('personnel_id',selectedId).order('effective_date',{ascending:false}).limit(40));
    const results = await Promise.all(requests);
    if (results[0].error) throw results[0].error;
    if (results[1]?.error) throw results[1].error;
    setEvents((results[0].data || []) as PersonnelEvent[]);
    setCompensation((results[1]?.data || []) as Compensation[]);
  };

  return <div className="personnel-page">
    <header className="personnel-heading"><div><span className="eyebrow">OPERACIONES · EQUIPO</span><h1>Personal</h1><p>Fichas laborales e historial del equipo, con acceso limitado según el perfil.</p></div>{canEdit&&<button className="button button-dark" type="button" onClick={openNew}><Plus size={16}/> Nueva ficha</button>}</header>
    {error&&<p className="personnel-alert" role="alert"><ShieldAlert size={16}/>{error}</p>}{message&&<p className="personnel-success" role="status"><Check size={16}/>{message}</p>}
    <section className="personnel-metrics" aria-label="Resumen de personal"><article className="panel personnel-metric"><span className="personnel-metric-icon"><Users size={18}/></span><div><small>FICHAS REGISTRADAS</small><b>{records.length}</b></div></article><article className="panel personnel-metric"><span className="personnel-metric-icon active"><Check size={18}/></span><div><small>PERSONAL ACTIVO</small><b>{activeCount}</b></div></article><article className="panel personnel-metric"><span className="personnel-metric-icon"><History size={18}/></span><div><small>HISTORIAL CONSERVADO</small><b>Por persona</b></div></article></section>
    <div className="personnel-workspace">
      <section className="panel personnel-directory"><div className="panel-heading"><div><span className="eyebrow">DIRECTORIO</span><h2>Fichas del personal</h2></div><span className="muted-count">{filteredRecords.length} resultados</span></div>
        <div className="personnel-filters"><label className="personnel-search"><Search size={16}/><input aria-label="Buscar personal" placeholder="Buscar nombre, correo o área" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><label><span className="sr-only">Estado</span><select aria-label="Filtrar por estado" value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label><label><span className="sr-only">Área</span><select aria-label="Filtrar por área" value={departmentFilter} onChange={(event)=>setDepartmentFilter(event.target.value)}><option value="all">Todas las áreas</option>{departments.map((department)=><option key={department} value={department}>{department}</option>)}</select></label></div>
        {loading?<div className="personnel-empty" role="status">Cargando fichas…</div>:!filteredRecords.length?<div className="personnel-empty"><CircleUserRound size={25}/><b>{records.length?'No encontramos personal con estos filtros.':'Aún no hay fichas de personal.'}</b><span>{records.length?'Prueba otra búsqueda o cambia los filtros.':'Crea la primera ficha cuando tengas los datos confirmados.'}</span>{!records.length&&canEdit&&<button className="button button-outline" type="button" onClick={openNew}><Plus size={15}/> Crear ficha</button>}</div>:<div className="personnel-list">{filteredRecords.map((record)=><button type="button" className={`personnel-list-row ${record.id===selectedId?'selected':''}`} key={record.id} onClick={()=>setSelectedId(record.id)} aria-pressed={record.id===selectedId}><span className="personnel-avatar">{record.full_name.split(/\s+/).slice(0,2).map((part)=>part[0]).join('').toUpperCase()}</span><span className="personnel-list-copy"><b>{record.full_name}</b><small>{record.job_title||'Cargo pendiente'}{record.department?` · ${record.department}`:''}</small></span><span className={`personnel-status ${record.status}`}>{record.status==='active'?'Activo':'Inactivo'}</span><ChevronRight size={16}/></button>)}</div>}
      </section>
      <section className="panel personnel-detail-panel" aria-live="polite">{!selected?<div className="personnel-detail-placeholder"><span><CircleUserRound size={22}/></span><div><small>DIRECTORIO DE PERSONAL</small><b>{records.length?'Elige una ficha para continuar':'Aquí verás el perfil de cada persona'}</b><p>{records.length?'Selecciona un nombre del directorio para consultar datos, acceso vinculado, remuneración e historial.':'Crea una ficha para reunir los datos laborales, el área, el cargo y el historial en un solo lugar.'}</p></div>{!records.length&&canEdit&&<button className="button button-outline" type="button" onClick={openNew}><Plus size={15}/> Crear primera ficha</button>}</div>:<>
        <div className="personnel-detail-heading"><span className="personnel-avatar large">{selected.full_name.split(/\s+/).slice(0,2).map((part)=>part[0]).join('').toUpperCase()}</span><div><span className="eyebrow">FICHA DEL PERSONAL</span><h2>{selected.full_name}</h2><p>{selected.job_title||'Cargo pendiente'}{selected.department?` · ${selected.department}`:''}</p></div>{canEdit&&<button className="button button-outline personnel-edit-button" type="button" onClick={()=>openEdit(selected)}><Edit3 size={15}/><span>Editar ficha</span></button>}</div>
        <div className="personnel-status-line"><span className={`personnel-status ${selected.status}`}>{selected.status==='active'?'Activo':'Inactivo'}</span><span><CalendarDays size={14}/> Ingreso: {dateLabel(selected.start_date)}</span>{selected.end_date&&<span>Salida: {dateLabel(selected.end_date)}</span>}</div>
        <div className="personnel-contact-grid"><div><Mail size={15}/><span><small>Correo</small><b>{selected.email||'Sin registrar'}</b></span></div><div><Phone size={15}/><span><small>Teléfono</small><b>{selected.phone||'Sin registrar'}</b></span></div><div><BriefcaseBusiness size={15}/><span><small>Área</small><b>{selected.department||'Sin asignar'}</b></span></div><div><ContactRound size={15}/><span><small>Cargo</small><b>{selected.job_title||'Sin registrar'}</b></span></div></div>
        <section className="personnel-subsection personnel-account-panel"><div className="panel-heading"><div><span className="eyebrow">IDENTIDAD Y ACCESO</span><h3>Cuenta de Google vinculada</h3></div><Link2 size={18}/></div>
          {linkedAccount?<div className="personnel-linked-account"><div className="personnel-google-avatar">G</div><div className="personnel-linked-copy"><b>{linkedAccount.full_name}</b><span>{linkedAccount.email}</span><small>{linkedAccount.roles.length?`Roles: ${linkedAccount.roles.join(', ')}`:'Sin perfil de acceso'}{linkedAccount.access_profiles.length?` · Perfiles: ${linkedAccount.access_profiles.join(', ')}`:''}</small><small>{linkedAccount.access_active?'Acceso activo':'Acceso sin activar o pausado'} · Último ingreso: {dateTimeLabel(linkedAccount.last_sign_in_at)}</small></div>{canLinkAccount&&<button className="button button-outline personnel-unlink-button" type="button" onClick={removeAccountLink} disabled={accountSaving}><Unlink size={14}/>{accountSaving?'Guardando…':'Desvincular'}</button>}</div>:<p className="personnel-inline-empty">Esta ficha no tiene una cuenta de acceso vinculada.</p>}
          {canLinkAccount?<>
            {!linkedAccount&&<form className="personnel-account-form" onSubmit={saveAccountLink}><label>Cuenta registrada con Google<select required value={accountUserId} onChange={(event)=>setAccountUserId(event.target.value)}><option value="">Selecciona una cuenta Google</option>{googleAccounts.map((account)=><option key={account.user_id} value={account.user_id} disabled={Boolean(account.linked_personnel_id)}>{account.full_name} · {account.email}{account.linked_personnel_id?` · Vinculada a ${account.linked_personnel_name}`:''}</option>)}</select></label><p className="personnel-privacy-hint">Solo aparecen cuentas que ya iniciaron sesión con Google. Vincularlas identifica a la persona en el sistema y no cambia sus permisos.</p><button className="button button-outline" type="submit" disabled={accountSaving||!chosenAccount||Boolean(chosenAccount.linked_personnel_id)}><Link2 size={15}/>{accountSaving?'Vinculando…':'Vincular cuenta'}</button></form>}
            {linkedAccount&&!linkedAccount.roles.includes('owner')&&<form className="personnel-account-form" onSubmit={assignAccountProfile}><label>Perfil de acceso<select required value={accountProfileId} onChange={(event)=>setAccountProfileId(event.target.value)}><option value="">Selecciona un perfil</option>{accessProfiles.filter((profile)=>roles.includes('owner')||!['admin','website_admin'].includes(profile.profile_key)).map((profile)=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><p className="personnel-privacy-hint">Área laboral: {selected.department||'sin asignar'}. No concede permisos automáticamente. El perfil se añadirá a los accesos actuales de la cuenta; para reemplazarlos, gestiónalos desde Equipo y permisos.</p><button className="button button-outline" type="submit" disabled={accountSaving||!accountProfileId}><ShieldAlert size={15}/>{accountSaving?'Asignando…':'Añadir perfil de acceso'}</button></form>}
          </>:<p className="personnel-privacy-hint">Para vincular cuentas necesitas permisos de edición de Personal y gestión de accesos del Equipo.</p>}
        </section>
        <div className="personnel-subsection"><div className="panel-heading"><div><span className="eyebrow">REMUNERACIÓN</span><h3>Historial de remuneración</h3></div><Banknote size={18}/></div>
          {!canViewCompensation?<p className="personnel-private-note"><ShieldAlert size={15}/> Información restringida. Tu perfil no tiene permiso para consultar remuneraciones.</p>:<>
            {canEditCompensation&&<form className="personnel-pay-form" onSubmit={addCompensation}><label>Valor<input type="number" min="0" step="0.01" required value={salaryDraft.amount} onChange={(event)=>setSalaryDraft((current)=>({...current,amount:event.target.value}))} placeholder="0,00"/></label><label>Moneda<input required maxLength={3} pattern="[A-Za-z]{3}" value={salaryDraft.currency_code} onChange={(event)=>setSalaryDraft((current)=>({...current,currency_code:event.target.value}))} aria-label="Código ISO de moneda"/></label><label>Periodo<input required maxLength={40} value={salaryDraft.pay_period} onChange={(event)=>setSalaryDraft((current)=>({...current,pay_period:event.target.value}))} placeholder="p. ej., mensual"/></label><label>Vigente desde<input type="date" required value={salaryDraft.effective_date} onChange={(event)=>setSalaryDraft((current)=>({...current,effective_date:event.target.value}))}/></label><label className="personnel-pay-note">Nota opcional<input maxLength={500} value={salaryDraft.note} onChange={(event)=>setSalaryDraft((current)=>({...current,note:event.target.value}))} placeholder="Motivo del cambio (sin datos sensibles adicionales)"/></label><button className="button button-outline" type="submit" disabled={saving}><Plus size={15}/>{saving?'Guardando…':'Registrar cambio'}</button></form>}
            {detailLoading?<p className="personnel-inline-loading">Cargando remuneración…</p>:!compensation.length?<p className="personnel-inline-empty">No hay registros de remuneración.</p>:<div className="personnel-compensation-list">{compensation.map((item)=><article key={item.id}><div><b>{formatCompensation(item)}</b><small>{item.pay_period} · Vigente desde {dateLabel(item.effective_date)}</small>{item.note&&<span>{item.note}</span>}</div><time>{dateTimeLabel(item.created_at)}</time></article>)}</div>}
          </>}
        </div>
        <div className="personnel-subsection"><div className="panel-heading"><div><span className="eyebrow">TRAZABILIDAD</span><h3>Historial de la ficha</h3></div><Clock3 size={18}/></div>{detailLoading?<p className="personnel-inline-loading">Cargando historial…</p>:!events.length?<p className="personnel-inline-empty">Aún no hay cambios registrados.</p>:<ol className="personnel-history-list">{events.filter((item)=>!item.salary_sensitive||canViewCompensation).map((item)=><li key={item.id}><span className="personnel-history-icon">{item.event_key==='compensation_changed'?<Banknote size={14}/>:<History size={14}/>}</span><div><b>{item.summary}</b><small>{item.changed_fields.map((field)=>fieldLabels[field]||field).join(', ')||'Registro creado'} · {item.actor_label}</small><time>{dateTimeLabel(item.created_at)}</time></div></li>)}</ol>}</div>
        <p className="personnel-footnote"><UserRound size={14}/> La ficha laboral y el acceso Google están vinculados. Cambiar o quitar el vínculo no pausa ni elimina los permisos; eso se gestiona desde Equipo y permisos.</p>
      </>}</section>
    </div>
    {modalOpen&&<div className="personnel-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setModalOpen(false);}}><section className="personnel-modal panel" role="dialog" aria-modal="true" aria-labelledby="personnel-modal-title"><div className="panel-heading"><div><span className="eyebrow">FICHA LABORAL</span><h2 id="personnel-modal-title">{editingRecord?'Editar ficha':'Nueva ficha de personal'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={()=>setModalOpen(false)}><X size={18}/></button></div><form onSubmit={saveRecord}><div className="personnel-form-grid"><label className="personnel-field-wide">Nombre completo<input required maxLength={160} autoComplete="name" value={draft.full_name} onChange={(event)=>setDraft((current)=>({...current,full_name:event.target.value}))}/></label><label>Correo de contacto<input type="email" maxLength={254} autoComplete="email" value={draft.email} onChange={(event)=>setDraft((current)=>({...current,email:event.target.value}))}/></label><label>Teléfono<input type="tel" maxLength={40} autoComplete="tel" inputMode="tel" value={draft.phone} onChange={(event)=>setDraft((current)=>({...current,phone:event.target.value}))}/></label><label>Área<input maxLength={100} value={draft.department} onChange={(event)=>setDraft((current)=>({...current,department:event.target.value}))} placeholder="Escribe el área confirmada"/></label><label>Cargo<input maxLength={120} value={draft.job_title} onChange={(event)=>setDraft((current)=>({...current,job_title:event.target.value}))}/></label><label>Estado<select value={draft.status} onChange={(event)=>setDraft((current)=>({...current,status:event.target.value as RecordDraft['status']}))}><option value="active">Activo</option><option value="inactive">Inactivo</option></select></label><label>Fecha de ingreso<input type="date" value={draft.start_date||''} onChange={(event)=>setDraft((current)=>({...current,start_date:event.target.value}))}/></label><label>Fecha de salida<input type="date" value={draft.end_date||''} onChange={(event)=>setDraft((current)=>({...current,end_date:event.target.value}))}/></label></div><p className="personnel-privacy-hint"><ShieldAlert size={15}/> Registra solo los datos necesarios para identificar y organizar la relación laboral. Esta ficha no almacena documentos de identidad, dirección domiciliaria ni datos de salud.</p>{error&&<p className="personnel-alert" role="alert">{error}</p>}<div className="personnel-modal-actions"><button type="button" className="button button-outline" onClick={()=>setModalOpen(false)}>Cancelar</button><button type="submit" className="button button-dark" disabled={saving}><Check size={15}/>{saving?'Guardando…':'Guardar ficha'}</button></div></form></section></div>}
  </div>;
}
