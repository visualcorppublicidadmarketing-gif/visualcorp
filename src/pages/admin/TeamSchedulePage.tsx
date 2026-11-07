import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, Check, Clock3, Plus, RotateCcw, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import { Calendar, DatePicker, dateFromKey, dateToKey } from '../../components/ui/Calendar';
import './team-schedule.css';

type WorkHour = { organization_id: string; weekday: number; is_open: boolean; opens_at: string | null; closes_at: string | null };
type WorkException = { id: string; organization_id: string; work_date: string; user_id: string | null; kind: 'open' | 'closed'; opens_at: string | null; closes_at: string | null; note: string };
type Rotation = { id: string; area_name: string; task_name: string; weekday: number; starts_on: string; starts_at: string; ends_at: string; note: string; active: boolean };
type RotationMember = { rotation_id: string; user_id: string; position: number };
type TeamMember = { user_id: string; display_name: string; profile_names: string | null };
type AuditEntry = { id: number; actor_user_id: string | null; entity: string; entity_id: string; action: string; created_at: string };
type RotationDraft = { id: string | null; area_name: string; task_name: string; weekday: number; starts_on: string; starts_at: string; ends_at: string; note: string; active: boolean; member_ids: string[] };

const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const defaultHour = (weekday: number): WorkHour => ({ organization_id: '', weekday, is_open: weekday !== 0, opens_at: weekday === 0 ? null : '08:00', closes_at: weekday === 6 ? '13:00' : weekday === 0 ? null : '18:30' });
const time = (value: string | null) => value?.slice(0, 5) || '';
const ecuadorToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const emptyRotation = (date: string): RotationDraft => ({ id: null, area_name: '', task_name: 'Limpieza del área', weekday: dateFromKey(date)?.getDay() ?? 1, starts_on: date, starts_at: '08:00', ends_at: '08:30', note: '', active: true, member_ids: [] });
const friendlyDate = (date: string) => dateFromKey(date)?.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) || date;
const dayDifference = (from: string, to: string) => (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;

function assigneeForDate(rotation: Rotation, members: RotationMember[], date: string) {
  const day = dateFromKey(date);
  if (!day || !rotation.active || day.getDay() !== rotation.weekday || date < rotation.starts_on) return null;
  const first = dateToKey(new Date((dateFromKey(rotation.starts_on)?.getTime() || 0) + ((rotation.weekday - (dateFromKey(rotation.starts_on)?.getDay() || 0) + 7) % 7) * 86_400_000));
  const ordered = members.filter((row) => row.rotation_id === rotation.id).sort((a, b) => a.position - b.position);
  if (!ordered.length || date < first) return null;
  return ordered[Math.floor(dayDifference(first, date) / 7) % ordered.length]?.user_id || null;
}

export function TeamSchedulePage() {
  const { organizationId, user, hasPermission } = useAuth();
  const [hours, setHours] = useState<WorkHour[]>([]);
  const [exceptions, setExceptions] = useState<WorkException[]>([]);
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [rotationMembers, setRotationMembers] = useState<RotationMember[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(ecuadorToday);
  const [exceptionUser, setExceptionUser] = useState('');
  const [exceptionKind, setExceptionKind] = useState<'open' | 'closed'>('open');
  const [exceptionStart, setExceptionStart] = useState('08:00');
  const [exceptionEnd, setExceptionEnd] = useState('18:30');
  const [exceptionNote, setExceptionNote] = useState('');
  const [draft, setDraft] = useState<RotationDraft>(() => emptyRotation(ecuadorToday()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = hasPermission('team_schedule', 'edit');

  const load = useCallback(async () => {
    if (!supabase || !organizationId) { setError('No se pudo conectar con la organización.'); setLoading(false); return; }
    setLoading(true); setError('');
    const [h, e, r, rm, m, a] = await Promise.all([
      supabase.from('team_work_hours').select('*').eq('organization_id', organizationId).order('weekday'),
      supabase.from('team_work_exceptions').select('*').eq('organization_id', organizationId).order('work_date'),
      supabase.from('team_area_rotations').select('*').eq('organization_id', organizationId).order('weekday'),
      supabase.from('team_area_rotation_members').select('*').eq('organization_id', organizationId).order('position'),
      supabase.rpc('list_team_schedule_members'),
      supabase.from('team_schedule_audit').select('id,actor_user_id,entity,entity_id,action,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(30),
    ]);
    const failure = [h.error, e.error, r.error, rm.error, m.error, a.error].find(Boolean);
    if (failure) setError(`No se pudieron cargar los horarios: ${failure.message}`);
    else { setHours(h.data || []); setExceptions(e.data || []); setRotations(r.data || []); setRotationMembers(rm.data || []); setMembers(m.data || []); setAuditEntries(a.data || []); }
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const selectedException = exceptions.find((row) => row.work_date === selectedDate && (row.user_id || '') === exceptionUser);
  useEffect(() => {
    setExceptionKind(selectedException?.kind || 'open');
    setExceptionStart(time(selectedException?.opens_at || null) || '08:00');
    setExceptionEnd(time(selectedException?.closes_at || null) || '18:30');
    setExceptionNote(selectedException?.note || '');
  }, [selectedException?.id, selectedDate, exceptionUser]);
  const memberName = (id: string | null) => id ? members.find((member) => member.user_id === id)?.display_name || 'Integrante no disponible' : 'Todo el equipo';
  const selectedDuties = rotations.map((rotation) => ({ rotation, assignee: assigneeForDate(rotation, rotationMembers, selectedDate) })).filter((item) => item.assignee);
  const metadata = useCallback((date: Date) => {
    const key = dateToKey(date);
    const count = exceptions.filter((row) => row.work_date === key).length + rotations.filter((row) => assigneeForDate(row, rotationMembers, key)).length;
    return count ? { badge: String(count), description: `${count} horario${count === 1 ? '' : 's'} o turno${count === 1 ? '' : 's'}` } : undefined;
  }, [exceptions, rotations, rotationMembers]);
  const activeRotations = useMemo(() => rotations.filter((row) => row.active).length, [rotations]);
  const auditLabel = (entry: AuditEntry) => {
    const entity = entry.entity === 'team_work_hours' ? `Horario de ${weekdays[Number(entry.entity_id)] || 'la semana'}` : entry.entity === 'team_work_exceptions' ? 'Excepción de calendario' : 'Turno de área';
    const action = entry.action === 'insert' ? 'creado' : entry.action === 'delete' ? 'eliminado' : 'actualizado';
    return `${entity} ${action}`;
  };
  const auditTime = (value: string) => new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date(value));

  const saveHour = async (row: WorkHour) => {
    if (!supabase || !organizationId || !user || !canManage) return;
    if (row.is_open && (!row.opens_at || !row.closes_at || row.opens_at >= row.closes_at)) { setError('La apertura debe ser anterior al cierre.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: failure } = await supabase.from('team_work_hours').upsert({ organization_id: organizationId, weekday: row.weekday, is_open: row.is_open, opens_at: row.is_open ? row.opens_at : null, closes_at: row.is_open ? row.closes_at : null, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,weekday' });
    if (failure) setError(failure.message); else { setNotice(`${weekdays[row.weekday]} actualizado.`); await load(); }
    setBusy(false);
  };
  const saveException = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !canManage) return;
    if (exceptionKind === 'open' && (!exceptionStart || !exceptionEnd || exceptionStart >= exceptionEnd)) { setError('La apertura especial debe terminar después de empezar.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: failure } = await supabase.from('team_work_exceptions').upsert({ id: selectedException?.id || crypto.randomUUID(), organization_id: organizationId, work_date: selectedDate, user_id: exceptionUser || null, kind: exceptionKind, opens_at: exceptionKind === 'open' ? exceptionStart : null, closes_at: exceptionKind === 'open' ? exceptionEnd : null, note: exceptionNote.trim(), updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (failure) setError(failure.message); else { setNotice('Excepción guardada para la fecha seleccionada.'); await load(); }
    setBusy(false);
  };
  const removeException = async () => {
    if (!supabase || !selectedException || !canManage) return;
    setBusy(true); setError(''); setNotice('');
    const { error: failure } = await supabase.from('team_work_exceptions').delete().eq('id', selectedException.id).eq('organization_id', organizationId);
    if (failure) setError(failure.message); else { setNotice('Excepción eliminada.'); await load(); }
    setBusy(false);
  };
  const saveRotation = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !canManage) return;
    if (!draft.member_ids.length) { setError('Selecciona al menos una persona para el turno.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: failure } = await supabase.rpc('save_team_area_rotation', { p_id: draft.id, p_area_name: draft.area_name.trim(), p_task_name: draft.task_name.trim(), p_weekday: draft.weekday, p_starts_on: draft.starts_on, p_starts_at: draft.starts_at, p_ends_at: draft.ends_at, p_member_ids: draft.member_ids, p_note: draft.note.trim(), p_active: draft.active });
    if (failure) setError(failure.message); else { setNotice('Turno de área guardado. La rotación avanza cada semana.'); setDraft(emptyRotation(selectedDate)); await load(); }
    setBusy(false);
  };
  const editRotation = (rotation: Rotation) => {
    setDraft({ ...rotation, member_ids: rotationMembers.filter((row) => row.rotation_id === rotation.id).sort((a, b) => a.position - b.position).map((row) => row.user_id) });
    document.getElementById('team-rotation-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <div className="team-schedule">
    <header className="team-schedule-hero"><div><span className="eyebrow">ADMINISTRACIÓN · EQUIPO</span><h1>Horarios y turnos</h1><p>Define cuándo puede ingresar el equipo y organiza las tareas recurrentes por área. Todas las horas usan Ecuador (America/Guayaquil).</p></div><span className="team-schedule-zone"><Clock3 size={17}/> Ecuador · UTC−5</span></header>
    <div className="team-schedule-stats"><article><Clock3 size={19}/><span><b>Horario base</b><small>Lun–vie 08:00–18:30 · Sáb 08:00–13:00</small></span></article><article><CalendarClock size={19}/><span><b>{exceptions.length} excepciones</b><small>Fechas con horario especial o cierre</small></span></article><article><Users size={19}/><span><b>{activeRotations} turnos activos</b><small>La persona asignada cambia cada semana</small></span></article></div>
    {notice && <p className="team-schedule-notice" role="status"><Check size={16}/>{notice}</p>}
    {error && <p className="team-schedule-error" role="alert">{error} <button type="button" onClick={() => void load()}>Reintentar</button></p>}
    {loading ? <p role="status">Cargando horarios…</p> : <>
      <section className="team-schedule-panel" aria-labelledby="team-hours-title"><div className="team-schedule-section-title"><div><span>01 · ACCESO</span><h2 id="team-hours-title">Semana laboral</h2><p>El cierre se aplica al instante, incluso si la sesión sigue abierta. Propietario, administradores y encargado del local tienen acceso permanente.</p></div><ShieldCheck size={24}/></div><div className="team-hours-grid">{weekdays.map((label, weekday) => {
        const row = hours.find((item) => item.weekday === weekday) || defaultHour(weekday);
        const defaults = defaultHour(weekday);
        return <div className="team-hour-row" key={weekday}><strong>{label}</strong><label className="team-hour-toggle"><input type="checkbox" checked={row.is_open} disabled={busy || !canManage} onChange={(event) => setHours((current) => [...current.filter((item) => item.weekday !== weekday), { ...row, organization_id: organizationId || '', is_open: event.target.checked, opens_at: event.target.checked ? row.opens_at || defaults.opens_at : null, closes_at: event.target.checked ? row.closes_at || defaults.closes_at : null }])}/><span>{row.is_open ? 'Abierto' : 'Cerrado'}</span></label><div className="team-hour-times"><input aria-label={`Apertura ${label}`} type="time" value={time(row.opens_at)} disabled={!row.is_open || busy || !canManage} onChange={(event) => setHours((current) => [...current.filter((item) => item.weekday !== weekday), { ...row, opens_at: event.target.value }])}/><span>–</span><input aria-label={`Cierre ${label}`} type="time" value={time(row.closes_at)} disabled={!row.is_open || busy || !canManage} onChange={(event) => setHours((current) => [...current.filter((item) => item.weekday !== weekday), { ...row, closes_at: event.target.value }])}/></div><button className="button button-outline" type="button" disabled={busy || !canManage} onClick={() => void saveHour(row)}><Save size={14}/> Guardar</button></div>;
      })}</div></section>
      <div className="team-schedule-columns"><section className="team-schedule-panel" aria-labelledby="team-calendar-title"><div className="team-schedule-section-title"><div><span>02 · CALENDARIO</span><h2 id="team-calendar-title">Fechas especiales</h2><p>Amplía el horario, abre un domingo o cierra un día para todo el equipo o para una persona.</p></div></div><Calendar value={selectedDate} onChange={setSelectedDate} label="Calendario de horarios del equipo" getDateMetadata={metadata} cellSize="comfortable"/><h3>{friendlyDate(selectedDate)}</h3><div className="team-day-list">{exceptions.filter((row) => row.work_date === selectedDate).map((row) => <button type="button" className={`team-day-chip${exceptionUser === (row.user_id || '') ? ' active' : ''}`} key={row.id} onClick={() => setExceptionUser(row.user_id || '')}><b>{row.kind === 'closed' ? 'Cerrado' : `${time(row.opens_at)}–${time(row.closes_at)}`}</b><span>{memberName(row.user_id)}</span></button>)}{selectedDuties.map(({ rotation, assignee }) => <div className="team-day-duty" key={rotation.id}><b>{rotation.task_name} · {rotation.area_name}</b><small>{time(rotation.starts_at)}–{time(rotation.ends_at)} · {memberName(assignee)}</small></div>)}{!exceptions.some((row) => row.work_date === selectedDate) && !selectedDuties.length && <p>Sin cambios ni turnos para esta fecha.</p>}</div></section>
      <section className="team-schedule-panel" aria-labelledby="team-exception-title"><div className="team-schedule-section-title"><div><span>03 · EXCEPCIÓN</span><h2 id="team-exception-title">Editar {friendlyDate(selectedDate)}</h2><p>La excepción individual tiene prioridad sobre la general y sobre el horario semanal.</p></div></div><form className="team-schedule-form" inert={!canManage} onSubmit={(event) => void saveException(event)}><label>Aplicar a<select value={exceptionUser} onChange={(event) => setExceptionUser(event.target.value)}><option value="">Todo el equipo</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}</option>)}</select></label><div className="team-schedule-form-split"><label>Tipo<select value={exceptionKind} onChange={(event) => setExceptionKind(event.target.value as 'open' | 'closed')}><option value="open">Horario especial</option><option value="closed">Cerrado</option></select></label><label>Fecha<DatePicker value={selectedDate} onChange={setSelectedDate} label="Fecha de excepción"/></label></div>{exceptionKind === 'open' && <div className="team-schedule-form-split"><label>Desde<input required type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)}/></label><label>Hasta<input required type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)}/></label></div>}<label>Motivo o nota<textarea rows={3} maxLength={300} value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Ej. Producción extendida por entrega"/></label><div className="team-schedule-actions"><button className="button button-dark" type="submit" disabled={busy || !canManage}><Save size={15}/> {selectedException ? 'Actualizar excepción' : 'Guardar excepción'}</button>{selectedException && <button className="button button-outline" type="button" disabled={busy || !canManage} onClick={() => void removeException()}><Trash2 size={15}/> Eliminar</button>}</div></form></section></div>
      <section className="team-schedule-panel" id="team-rotation-editor" aria-labelledby="team-rotations-title"><div className="team-schedule-section-title"><div><span>04 · ÁREAS</span><h2 id="team-rotations-title">Turnos de limpieza y tareas</h2><p>Selecciona las personas en el orden del turno. La primera comienza en la fecha de inicio y la siguiente toma el mismo día de la semana siguiente.</p></div><button className="button button-outline" type="button" disabled={!canManage} onClick={() => setDraft(emptyRotation(selectedDate))}><Plus size={15}/> Nuevo turno</button></div><div className="team-schedule-columns"><form className="team-schedule-form" inert={!canManage} onSubmit={(event) => void saveRotation(event)}><div className="team-schedule-form-split"><label>Área<input disabled={!canManage} required minLength={2} maxLength={100} value={draft.area_name} onChange={(event) => setDraft({ ...draft, area_name: event.target.value })} placeholder="Oficinas o taller"/></label><label>Tarea<input disabled={!canManage} required minLength={3} maxLength={120} value={draft.task_name} onChange={(event) => setDraft({ ...draft, task_name: event.target.value })}/></label></div><div className="team-schedule-form-split"><label>Día de la semana<select disabled={!canManage} value={draft.weekday} onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}>{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>Comienza el<DatePicker value={draft.starts_on} onChange={(value) => setDraft({ ...draft, starts_on: value })} label="Inicio de la rotación"/></label></div><div className="team-schedule-form-split"><label>Desde<input disabled={!canManage} required type="time" value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })}/></label><label>Hasta<input disabled={!canManage} required type="time" value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })}/></label></div><label>Personas del turno <small>Haz clic en el orden de rotación.</small><div className="team-schedule-member-grid">{members.map((member) => { const position = draft.member_ids.indexOf(member.user_id); return <button className={position >= 0 ? 'selected' : ''} disabled={!canManage} type="button" key={member.user_id} onClick={() => setDraft((current) => ({ ...current, member_ids: position >= 0 ? current.member_ids.filter((id) => id !== member.user_id) : [...current.member_ids, member.user_id] }))}><span>{position >= 0 ? position + 1 : '+'}</span>{member.display_name}</button>; })}</div></label><label>Nota<textarea disabled={!canManage} rows={2} maxLength={500} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Indicaciones para el área"/></label><label className="team-schedule-checkbox"><input disabled={!canManage} type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })}/> Turno activo</label><button className="button button-dark" type="submit" disabled={busy || !canManage || !members.length}><Save size={15}/> {draft.id ? 'Guardar cambios' : 'Crear turno'}</button></form><div className="team-rotations-list">{rotations.length ? rotations.map((rotation) => <button type="button" className={`team-rotation-card${draft.id === rotation.id ? ' selected' : ''}`} key={rotation.id} onClick={() => editRotation(rotation)}><span><b>{rotation.task_name}</b><small>{rotation.area_name} · {weekdays[rotation.weekday]} {time(rotation.starts_at)}–{time(rotation.ends_at)}</small></span><span>{rotation.active ? 'Activo' : 'Pausado'}<RotateCcw size={15}/></span><small>{rotationMembers.filter((row) => row.rotation_id === rotation.id).sort((a, b) => a.position - b.position).map((row) => memberName(row.user_id)).join(' → ')}</small></button>) : <p className="team-schedule-empty">Aún no hay turnos de área. Crea el primero para organizar la rotación.</p>}</div></div></section>
      <section className="team-schedule-panel" aria-labelledby="team-audit-title"><div className="team-schedule-section-title"><div><span>05 · HISTORIAL</span><h2 id="team-audit-title">Cambios recientes</h2><p>Registro de modificaciones a horarios, excepciones y turnos de área.</p></div></div>{auditEntries.length ? <ol className="team-schedule-audit">{auditEntries.map((entry) => <li key={entry.id}><span><b>{auditLabel(entry)}</b><small>{memberName(entry.actor_user_id)} · {auditTime(entry.created_at)}</small></span></li>)}</ol> : <p className="team-schedule-empty">Todavía no hay cambios registrados.</p>}</section>
    </>}
  </div>;
}
