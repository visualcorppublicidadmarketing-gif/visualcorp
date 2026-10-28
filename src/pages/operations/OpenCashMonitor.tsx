import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, AlertTriangle, Banknote, Check, Clock3, LoaderCircle, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabaseClient';
import './open-cash-monitor.css';

type CashSession = {
  id: string;
  branch_id: string;
  cash_register_id: string | null;
  opened_by: string;
  opened_at: string;
  opening_cash: number | string;
};
type Branch = { id: string; name: string };
type CashRegister = { id: string; branch_id: string; name: string; assigned_advisor_id: string | null };
type TeamMember = { user_id: string; full_name?: string | null; email?: string | null };
type CloseDraft = { counted: string; note: string };
type CloseResult = { sessionId: string; label: string; success: boolean; message: string };
type DialogState = { mode: 'single' | 'all'; sessions: CashSession[] } | null;

const TIME_ZONE = 'America/Guayaquil';
const money = (value: number | string) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const dateTime = (value: string) => new Intl.DateTimeFormat('es-EC', {
  timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
const shortId = (value: string) => value.slice(0, 8).toUpperCase();
const countIsValid = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar el cierre.';

export function OpenCashMonitor() {
  const { organizationId, hasPermission } = useAuth();
  const canViewCash = hasPermission('cash', 'view') || hasPermission('cash', 'manage_cash');
  const canManageCash = hasPermission('cash', 'manage_cash');
  const canViewTeam = hasPermission('team', 'view');
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [branchFilter, setBranchFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [closeResults, setCloseResults] = useState<CloseResult[]>([]);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [lastUpdated, setLastUpdated] = useState('—');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [drafts, setDrafts] = useState<Record<string, CloseDraft>>({});
  const [confirmedAll, setConfirmedAll] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadedOnce = useRef(false);
  const loadPending = useRef(false);

  const loadOpenSessions = useCallback(async (manual = false) => {
    if (!canViewCash) return;
    if (!organizationId || !supabase) {
      setError('No hay conexión de Caja o la cuenta no tiene una organización asignada.');
      setLoading(false);
      return;
    }
    if (loadPending.current) return;
    loadPending.current = true;
    if (manual && loadedOnce.current) setRefreshing(true);
    else if (!loadedOnce.current) setLoading(true);
    setError('');
    try {
      const [sessionResult, branchResult, registerResult] = await Promise.all([
        supabase.from('cash_sessions').select('id,branch_id,cash_register_id,opened_by,opened_at,opening_cash')
          .eq('organization_id', organizationId).eq('status', 'open')
          .order('opened_at', { ascending: true }).order('id', { ascending: true }),
        supabase.from('branches').select('id,name').eq('organization_id', organizationId).order('name'),
        supabase.from('cash_registers').select('id,branch_id,name,assigned_advisor_id')
          .eq('organization_id', organizationId).order('name'),
      ]);
      if (sessionResult.error) throw sessionResult.error;
      if (branchResult.error) throw branchResult.error;
      setSessions((sessionResult.data || []) as CashSession[]);
      setBranches((branchResult.data || []) as Branch[]);
      if (!registerResult.error) setRegisters((registerResult.data || []) as CashRegister[]);
      else setRegisters([]);
      if (canViewTeam) {
        const { data, error: teamError } = await supabase.rpc('list_visualcorp_team_members');
        if (teamError) setTeam([]);
        else setTeam((data || []) as TeamMember[]);
      } else setTeam([]);
      setLastUpdated(new Date().toLocaleTimeString('es-EC', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }));
      loadedOnce.current = true;
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      loadPending.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [organizationId, canViewCash, canViewTeam]);

  useEffect(() => { void loadOpenSessions(); }, [loadOpenSessions]);

  useEffect(() => {
    if (!organizationId || !supabase || !canViewCash) return undefined;
    let refreshTimer: number | undefined;
    const channel = supabase.channel(`open-cash-monitor-${organizationId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'cash_sessions',
        filter: `organization_id=eq.${organizationId}`,
      }, () => {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void loadOpenSessions(true); }, 250);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLiveStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLiveStatus('offline');
        else setLiveStatus('connecting');
      });
    const fallbackRefresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadOpenSessions(true);
    }, 30_000);
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      window.clearInterval(fallbackRefresh);
      void supabase?.removeChannel(channel);
    };
  }, [organizationId, canViewCash, loadOpenSessions]);

  useEffect(() => {
    const node = dialogRef.current;
    if (dialog && node && !node.open) node.showModal();
    if (!dialog && node?.open) node.close();
  }, [dialog]);

  useEffect(() => {
    if (dialog?.mode === 'all' && !busy) setDialog((current) => current?.mode === 'all' ? { ...current, sessions } : current);
  }, [sessions, dialog?.mode, busy]);

  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const registerById = useMemo(() => new Map(registers.map((register) => [register.id, register])), [registers]);
  const people = useMemo(() => new Map(team.map((member) => [member.user_id, member.full_name || member.email || `Usuario ${member.user_id.slice(0, 8)}`])), [team]);
  const visibleSessions = useMemo(() => branchFilter === 'all'
    ? sessions
    : sessions.filter((session) => session.branch_id === branchFilter), [sessions, branchFilter]);
  const visibleOpeningTotal = useMemo(() => visibleSessions.reduce((total, session) => total + Number(session.opening_cash || 0), 0), [visibleSessions]);

  const branchName = (id: string) => branchNames.get(id) || 'Sucursal';
  const registerName = (session: CashSession) => session.cash_register_id
    ? registerById.get(session.cash_register_id)?.name || 'Caja asignada'
    : 'Turno sin caja asignada';
  const openedBy = (session: CashSession) => people.get(session.opened_by) || `Usuario ${shortId(session.opened_by)}`;
  const sessionLabel = (session: CashSession) => `${registerName(session)} · ${branchName(session.branch_id)}`;
  const editDraft = (sessionId: string, key: keyof CloseDraft, value: string) => {
    setDrafts((current) => ({ ...current, [sessionId]: { counted: '', note: '', ...current[sessionId], [key]: value } }));
  };
  const openSingleClose = (session: CashSession) => {
    setCloseResults([]);
    setConfirmedAll(false);
    setDialog({ mode: 'single', sessions: [session] });
  };
  const openAllClose = (items = sessions) => {
    setCloseResults([]);
    setConfirmedAll(false);
    setDialog({ mode: 'all', sessions: items });
  };

  const submitClose = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || !canManageCash || !supabase) return;
    const pendingSessions = dialog.sessions.filter((session) => sessions.some((row) => row.id === session.id));
    if (!pendingSessions.length) {
      setFeedback({ kind: 'error', message: 'Estas cajas ya no están abiertas. Actualicé la lista para confirmar su estado.' });
      setDialog(null);
      void loadOpenSessions(true);
      return;
    }
    if (pendingSessions.some((session) => !countIsValid(drafts[session.id]?.counted || ''))) {
      setFeedback({ kind: 'error', message: 'Ingresa el efectivo físico contado en cada caja antes de continuar.' });
      return;
    }
    if (dialog.mode === 'all' && !confirmedAll) return;

    setBusy(true);
    setFeedback(null);
    setCloseResults([]);
    const results: CloseResult[] = [];
    for (const session of pendingSessions) {
      const draft = drafts[session.id] || { counted: '', note: '' };
      const label = sessionLabel(session);
      try {
        const { data, error: closeError } = await supabase.rpc('close_cash_session', {
          p_session: session.id,
          p_counted_cash: Number(draft.counted),
          p_note: draft.note.trim(),
        });
        if (closeError) throw closeError;
        results.push({
          sessionId: session.id,
          label,
          success: true,
          message: `Conciliada. Esperado ${money(data?.expected_cash)} · diferencia ${money(data?.difference)}.`,
        });
      } catch (cause) {
        results.push({ sessionId: session.id, label, success: false, message: errorMessage(cause) });
      }
    }
    setBusy(false);
    setCloseResults(results);
    const successes = results.filter((result) => result.success).length;
    const failures = results.length - successes;
    setFeedback(failures
      ? { kind: 'error', message: `${successes} ${successes === 1 ? 'caja cerrada' : 'cajas cerradas'} y ${failures} ${failures === 1 ? 'pendiente' : 'pendientes'}. Revisa el resultado de cada caja.` }
      : { kind: 'success', message: `${successes} ${successes === 1 ? 'caja conciliada y cerrada' : 'cajas conciliadas y cerradas'}.` });
    await loadOpenSessions(true);
    setDialog(null);
  };

  if (!canViewCash) return <main className="access-screen"><section className="access-card"><span className="site-eyebrow"><i/> PERMISOS</span><h1>Tu perfil no tiene acceso a las cajas.</h1><p>Esta pantalla requiere permiso de consulta del módulo Caja.</p></section></main>;

  return <AppFrame area="operations">
    <PageHeading eyebrow="OPERACIONES · CONTROL DE CAJA" title="Cajas abiertas" description="Monitorea los turnos activos de todas las sucursales. Los cambios de apertura y cierre se reflejan automáticamente." action={<div className="open-cash-heading-actions"><span className={`open-cash-live ${liveStatus}`} role="status"><i aria-hidden="true"/>{liveStatus === 'live' ? 'En vivo' : liveStatus === 'connecting' ? 'Conectando' : 'Sin conexión en vivo'}</span><button className="button button-outline" type="button" onClick={() => void loadOpenSessions(true)} disabled={loading || refreshing}><RefreshCw size={15}/> Actualizar</button></div>}/>
    {error && <p className="open-cash-alert" role="alert"><AlertTriangle size={16}/>{error}</p>}
    {feedback && <div className={`open-cash-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'error' ? <AlertTriangle size={16}/> : <Check size={16}/>}<span>{feedback.message}</span></div>}
    {closeResults.length > 0 && <section className="open-cash-results" aria-label="Resultado de los cierres"><h2>Resultado de conciliación</h2><ul>{closeResults.map((result) => <li className={result.success ? 'success' : 'error'} key={result.sessionId}><b>{result.label}</b><span>{result.message}</span></li>)}</ul>{closeResults.some((result) => !result.success) && <button className="button button-outline" type="button" onClick={() => openAllClose(sessions.filter((session) => closeResults.some((result) => result.sessionId === session.id && !result.success)))}>Reintentar las cajas pendientes</button>}</section>}

    <section className="open-cash-overview" aria-label="Resumen de cajas abiertas">
      <article className="open-cash-stat"><span className="open-cash-stat-icon"><Wallet size={19}/></span><div><small>{branchFilter === 'all' ? 'Turnos abiertos' : 'Turnos abiertos en sucursal'}</small><b>{visibleSessions.length}</b><span>{branchFilter === 'all' ? 'en toda la organización' : branchName(branchFilter)}</span></div></article>
      <article className="open-cash-stat"><span className="open-cash-stat-icon"><Banknote size={19}/></span><div><small>Fondo inicial visible</small><b>{money(visibleOpeningTotal)}</b><span>Capital de apertura, no saldo actual</span></div></article>
      <article className="open-cash-stat"><span className="open-cash-stat-icon"><Activity size={19}/></span><div><small>Última actualización</small><b>{lastUpdated}</b><span>{liveStatus === 'live' ? 'Sincronización automática activa' : 'Actualización automática de respaldo cada 30 s'}</span></div></article>
    </section>

    <section className="panel open-cash-panel">
      <div className="open-cash-panel-heading"><div><span className="eyebrow">TURNOS ACTIVOS</span><h2>Cajas de todas las sucursales</h2><p>Los montos de efectivo contado y la diferencia quedan protegidos hasta confirmar cada arqueo.</p></div>{canManageCash && sessions.length > 0 && <button type="button" className="button button-dark open-cash-close-all" onClick={() => openAllClose()}><ShieldCheck size={16}/> Cerrar todas las cajas · Todas las sucursales <span>{sessions.length}</span></button>}</div>
      <div className="open-cash-toolbar"><label htmlFor="open-cash-branch">Sucursal<select id="open-cash-branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="all">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><span className="open-cash-refresh-note"><Clock3 size={14}/> Actualizado {lastUpdated}{refreshing ? ' · sincronizando' : ''}</span></div>
      {loading ? <div className="open-cash-empty" role="status"><LoaderCircle size={22} className="open-cash-spin"/><b>Cargando turnos abiertos…</b></div>
        : !visibleSessions.length ? <div className="open-cash-empty"><span className="open-cash-empty-icon"><Check size={22}/></span><b>{sessions.length ? 'No hay cajas abiertas en esta sucursal' : 'No hay cajas abiertas'}</b><span>{sessions.length ? 'Elige otra sucursal para ver sus turnos activos.' : 'Cuando alguien abra un turno desde POS, aparecerá aquí automáticamente.'}</span></div>
        : <div className="open-cash-grid">{visibleSessions.map((session) => {
          const register = session.cash_register_id ? registerById.get(session.cash_register_id) : undefined;
          const isAssigned = Boolean(register?.assigned_advisor_id);
          return <article className="open-cash-card" key={session.id}>
            <div className="open-cash-card-top"><span className="open-cash-state"><i aria-hidden="true"/> ABIERTA</span><span className="open-cash-id">#{shortId(session.id)}</span></div>
            <h3>{registerName(session)}</h3>
            <p className="open-cash-branch">{branchName(session.branch_id)}{register?.assigned_advisor_id ? ` · ${people.get(register.assigned_advisor_id) || 'Asesora asignada'}` : ''}</p>
            <div className="open-cash-meta"><span>Responsable</span><b>{openedBy(session)}{isAssigned && register?.assigned_advisor_id !== session.opened_by ? <small>Caja asignada a otra persona</small> : null}</b></div>
            <div className="open-cash-meta"><span>Abierta desde</span><b>{dateTime(session.opened_at)}</b></div>
            <div className="open-cash-opening"><span>Fondo inicial</span><b>{money(session.opening_cash)}</b></div>
            {canManageCash && <button type="button" className="button button-outline open-cash-close-one" onClick={() => openSingleClose(session)}><Wallet size={15}/> Conciliar y cerrar</button>}
          </article>;
        })}</div>}
    </section>

    <dialog ref={dialogRef} className="open-cash-dialog" aria-labelledby="open-cash-dialog-title" aria-describedby="open-cash-dialog-description" onCancel={(event) => { if (busy) event.preventDefault(); else setDialog(null); }}>
      {dialog && <form onSubmit={submitClose}>
        <div className="open-cash-dialog-heading"><span className="open-cash-dialog-icon"><ShieldCheck size={19}/></span><button type="button" className="open-cash-dialog-dismiss" aria-label="Cerrar ventana" disabled={busy} onClick={() => setDialog(null)}><X size={18}/></button><div><span className="eyebrow">{dialog.mode === 'all' ? 'CIERRE MASIVO' : 'ARQUEO DE CAJA'}</span><h2 id="open-cash-dialog-title">{dialog.mode === 'all' ? 'Conciliar todas las cajas' : 'Cerrar turno de caja'}</h2></div></div>
        <p id="open-cash-dialog-description" className="open-cash-dialog-copy">{dialog.mode === 'all'
          ? `Se procesarán ${dialog.sessions.length} cajas en secuencia. Ingresa el efectivo físico contado para cada una; cada cierre guarda su propio arqueo y queda auditado.`
          : 'Ingresa el efectivo físico contado. El servidor calculará el esperado y guardará cualquier diferencia en el cierre.'}</p>
        <div className="open-cash-count-list">{dialog.sessions.map((session) => {
          const draft = drafts[session.id] || { counted: '', note: '' };
          return <section className="open-cash-count-item" key={session.id}><header><div><b>{registerName(session)}</b><span>{branchName(session.branch_id)} · {openedBy(session)}</span></div><small>Fondo inicial {money(session.opening_cash)}</small></header><div className="open-cash-count-fields"><label htmlFor={`counted-${session.id}`}>Efectivo contado ($)<input id={`counted-${session.id}`} type="number" inputMode="decimal" min="0" step="0.01" required value={draft.counted} onChange={(event) => editDraft(session.id, 'counted', event.target.value)} placeholder="0,00"/></label><label htmlFor={`note-${session.id}`}>Nota de cierre <span>(opcional)</span><input id={`note-${session.id}`} type="text" maxLength={1000} value={draft.note} onChange={(event) => editDraft(session.id, 'note', event.target.value)} placeholder="Explica una diferencia o novedad"/></label></div></section>;
        })}</div>
        {dialog.mode === 'all' && <label className="open-cash-bulk-confirm"><input type="checkbox" checked={confirmedAll} onChange={(event) => setConfirmedAll(event.target.checked)}/><span>Confirmo que estos montos corresponden al efectivo contado físicamente en cada caja.</span></label>}
        <div className="open-cash-dialog-footer"><button type="button" className="button button-outline" onClick={() => setDialog(null)} disabled={busy}>Cancelar</button><button type="submit" className="button button-dark" disabled={busy || (dialog.mode === 'all' && !confirmedAll) || dialog.sessions.some((session) => !countIsValid(drafts[session.id]?.counted || ''))}>{busy ? <><LoaderCircle size={15} className="open-cash-spin"/> Conciliando…</> : dialog.mode === 'all' ? `Cerrar ${dialog.sessions.length} cajas` : 'Conciliar y cerrar caja'}</button></div>
      </form>}
    </dialog>
  </AppFrame>;
}
