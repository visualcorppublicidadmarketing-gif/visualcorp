import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Banknote, CircleAlert, LoaderCircle, Save, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { canAdminDeleteCash, formatAdminControlError, updateCashRegisterControl } from '../../lib/adminCashSalesControl';
import { AdminDeleteRecordModal, type AdminDeleteTarget } from '../../components/AdminDeleteRecordModal';
import { normalizePersonName } from '../../lib/personName';
import { supabase } from '../../lib/supabaseClient';
import { netSaleAmount } from './financeSales';
import './finance-cash-registers.css';

const TIME_ZONE = 'America/Guayaquil';
const money = (value: number) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const dateInBusinessZone = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));
const mondayOf = (date: string) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
  return parsed.toISOString().slice(0, 10);
};
const currentWeekEnd = (start: string) => {
  const parsed = new Date(`${start}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 6);
  return parsed.toISOString().slice(0, 10);
};
const registerErrorMessage = (cause: any, fallback: string) => {
  const detail = `${cause?.code || ''} ${cause?.message || ''}`;
  if (/PGRST205|42P01|Could not find the table 'public\.(cash_registers|cash_register_weekly_goals)'|schema cache/i.test(detail)) {
    return 'Las cajas y metas semanales aún no están habilitadas en la base de datos. Falta aplicar la migración correspondiente.';
  }
  return cause?.message || fallback;
};
const validateGoalAmount = (value: string) => {
  if (!value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0.01 || Number(amount.toFixed(2)) !== amount) {
    throw new Error('La meta debe ser un monto de al menos $0,01 con máximo dos decimales.');
  }
  return amount;
};

type CashRegister = { id: string; branch_id: string; name: string; assigned_advisor_id: string; active: boolean };
type WeeklyGoal = { id: string; cash_register_id: string; week_start: string; goal_amount: number };
type Draft = { branch_id: string; name: string; assigned_advisor_id: string; active: boolean; goal_amount: string };
type BranchAdvisor = { user_id: string; role: string; full_name: string };

type AdvisorCashRegisterSetupProps = {
  organizationId: string;
  userId: string;
  weekStart: string;
  branches: Array<{ id: string; name: string }>;
  registers: CashRegister[];
  goals: WeeklyGoal[];
  loading: boolean;
  onChanged: () => void;
};

/** Lets an advisor create and maintain only the active register assigned to them. */
export function AdvisorCashRegisterSetup({ organizationId, userId, weekStart, branches, registers, goals, loading, onChanged }: AdvisorCashRegisterSetupProps) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; goal_amount: string }>>({});
  const [registersWithHistory, setRegistersWithHistory] = useState<Set<string>>(new Set());
  const [historyChecked, setHistoryChecked] = useState(false);
  const [savingBranchId, setSavingBranchId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const nextDrafts: Record<string, { name: string; goal_amount: string }> = {};
    branches.forEach((branch) => {
      const register = registers.find((item) => item.branch_id === branch.id && item.assigned_advisor_id === userId && item.active);
      const goal = register ? goals.find((item) => item.cash_register_id === register.id && item.week_start === weekStart) : null;
      nextDrafts[branch.id] = { name: register?.name || '', goal_amount: goal ? String(goal.goal_amount) : '' };
    });
    setDrafts(nextDrafts);
  }, [branches, registers, goals, userId, weekStart]);

  useEffect(() => {
    let active = true;
    const registerIds = registers.filter((item) => item.assigned_advisor_id === userId).map((item) => item.id);
    if (!supabase || !organizationId || !registerIds.length) {
      setRegistersWithHistory(new Set()); setHistoryChecked(true);
      return () => { active = false; };
    }
    setHistoryChecked(false);
    void supabase.from('cash_sessions').select('cash_register_id').eq('organization_id', organizationId).in('cash_register_id', registerIds).then(({ data, error: historyError }) => {
      if (!active) return;
      setRegistersWithHistory(historyError ? new Set(registerIds) : new Set((data || []).map((session) => session.cash_register_id).filter(Boolean)));
      setHistoryChecked(true);
    }, () => {
      if (!active) return;
      setRegistersWithHistory(new Set(registerIds)); setHistoryChecked(true);
    });
    return () => { active = false; };
  }, [organizationId, registers, userId]);

  const saveBranch = async (branch: { id: string; name: string }) => {
    if (!supabase || savingBranchId) return;
    const draft = drafts[branch.id] || { name: '', goal_amount: '' };
    const name = draft.name.trim();
    if (!name || name.length > 80) { setError('El nombre de la caja debe tener entre 1 y 80 caracteres.'); return; }
    let goalAmount: number | null;
    try { goalAmount = validateGoalAmount(draft.goal_amount); }
    catch (cause: any) { setError(cause.message); return; }
    if (goalAmount === null) { setError('Define una meta semanal para completar la configuración de la caja.'); return; }

    setSavingBranchId(branch.id); setError(''); setNotice('');
    try {
      const register = registers.find((item) => item.branch_id === branch.id && item.assigned_advisor_id === userId && item.active);
      const result = register
        ? await supabase.rpc('update_cash_register_and_weekly_goal', {
          p_organization_id: organizationId,
          p_cash_register_id: register.id,
          p_branch_id: register.branch_id,
          p_name: name,
          p_active: true,
          p_week_start: weekStart,
          p_goal_amount: goalAmount,
        })
        : await supabase.rpc('create_cash_register_with_weekly_goal', {
          p_organization_id: organizationId,
          p_branch_id: branch.id,
          p_name: name,
          p_assigned_advisor_id: userId,
          p_week_start: weekStart,
          p_goal_amount: goalAmount,
        });
      if (result.error) throw result.error;
      setNotice(register ? `Se actualizaron tu caja y la meta de ${branch.name}.` : `Se creó tu caja para ${branch.name}.`);
      onChanged();
    } catch (cause: any) {
      setError(registerErrorMessage(cause, 'No se pudo guardar tu caja.'));
    } finally { setSavingBranchId(''); }
  };

  return <section className="panel finance-cash-registers" aria-labelledby="advisor-cash-registers-title">
    <div className="panel-heading"><div><span className="eyebrow">MIS CAJAS · CONFIGURACIÓN</span><h2 id="advisor-cash-registers-title">Mis cajas</h2><p>Crea una caja asignada a tu perfil o actualiza el nombre mientras no tenga turnos y la meta semanal.</p></div><Wallet size={19} aria-hidden="true"/></div>
    {error && <p className="finance-cash-register-alert" role="alert"><CircleAlert size={15}/>{error}</p>}
    {notice && <p className="finance-cash-register-notice" role="status">{notice}</p>}
    {loading ? <p className="muted"><LoaderCircle className="spin" size={15}/> Cargando tus cajas…</p> : !branches.length
      ? <div className="finance-cash-register-empty"><b>No hay sucursales disponibles para tu perfil.</b><span>Solicita a un encargado que revise tu asignación de sucursal.</span></div>
      : <div className="finance-cash-register-list">{branches.map((branch) => {
        const register = registers.find((item) => item.branch_id === branch.id && item.assigned_advisor_id === userId && item.active);
        const draft = drafts[branch.id] || { name: '', goal_amount: '' };
        const goal = register ? goals.find((item) => item.cash_register_id === register.id && item.week_start === weekStart) : null;
        const saving = savingBranchId === branch.id;
        const canRename = !register || (historyChecked && !registersWithHistory.has(register.id));
        return <form className="finance-cash-register-card advisor-cash-register-card" key={branch.id} onSubmit={(event) => { event.preventDefault(); void saveBranch(branch); }}>
          <div className="finance-cash-register-summary"><div><span>{branch.name} · {register?.name || 'Sin caja asignada'} <small className={`finance-cash-register-state ${register ? 'is-active' : 'is-inactive'}`}>{register ? 'Activa' : 'Pendiente'}</small></span><b>{goal ? `Meta semanal: ${money(Number(goal.goal_amount))}` : 'Meta semanal pendiente'}</b></div></div>
          <div className="finance-cash-register-form">
            <label>Nombre de caja<input required maxLength={80} disabled={!canRename} value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [branch.id]: { ...draft, name: event.target.value } }))} placeholder="Ej. Mi caja"/></label>
            <label>Meta semanal · USD<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={draft.goal_amount} onChange={(event) => setDrafts((current) => ({ ...current, [branch.id]: { ...draft, goal_amount: event.target.value } }))} placeholder="Monto de esta semana"/></label>
          </div>
          <button className="button button-outline" type="submit" disabled={saving || !draft.name.trim() || !draft.goal_amount.trim()}>{saving ? <><LoaderCircle className="spin" size={14}/> Guardando…</> : <><Save size={14}/>{register ? 'Guardar mis cambios' : 'Crear mi caja'}</>}</button>
        </form>;
      })}</div>}
    <p className="finance-cash-register-note">La caja queda asignada a ti. La sucursal y la persona asignada quedan fijas; después del primer turno, el nombre también queda fijo. Puedes seguir actualizando tu meta semanal.</p>
  </section>;
}

type Props = {
  today: string;
  organizationId: string;
  branches: any[];
  advisors: any[];
  sales: any[];
  returnsBySale: Map<string, { returnedValue?: number }>;
  saleReturnsError: string;
  canManage: boolean;
  canDeleteCash?: boolean;
  canManageTeam: boolean;
  refreshKey: number;
  onChanged: () => void;
};

export function FinanceCashRegisters({ today, organizationId, branches, advisors, sales, returnsBySale, saleReturnsError, canManage, canDeleteCash, canManageTeam, refreshKey, onChanged }: Props) {
  const { roles, hasPermission } = useAuth();
  const effectiveCanDeleteCash = canDeleteCash ?? canAdminDeleteCash(roles, hasPermission);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newRegister, setNewRegister] = useState<Draft>({ branch_id: '', name: '', assigned_advisor_id: '', active: true, goal_amount: '' });
  const [branchAdvisors, setBranchAdvisors] = useState<BranchAdvisor[]>([]);
  const [branchAdvisorsBranchId, setBranchAdvisorsBranchId] = useState('');
  const [branchAdvisorsLoading, setBranchAdvisorsLoading] = useState(false);
  const [branchAdvisorsError, setBranchAdvisorsError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminDeleteTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const weekStart = useMemo(() => mondayOf(today), [today]);
  const weekEnd = useMemo(() => currentWeekEnd(weekStart), [weekStart]);
  const eligibleBranchAdvisors = branchAdvisorsBranchId === newRegister.branch_id
    ? branchAdvisors.filter((advisor) => advisor.role === 'advisor')
    : [];
  const branchAdvisorsPending = branchAdvisorsLoading
    || Boolean(newRegister.branch_id && branchAdvisorsBranchId !== newRegister.branch_id && !branchAdvisorsError);

  useEffect(() => {
    if (!branches.length) return;
    setNewRegister((current) => branches.some((branch) => branch.id === current.branch_id)
      ? current
      : { ...current, branch_id: branches[0].id, assigned_advisor_id: '' });
  }, [branches]);

  useEffect(() => {
    let active = true;
    const branchId = newRegister.branch_id;
    setBranchAdvisors([]);
    setBranchAdvisorsBranchId('');
    setBranchAdvisorsError('');
    if (!canManage || loading || error || !supabase || !organizationId || !branchId) {
      setBranchAdvisorsLoading(false);
      return () => { active = false; };
    }
    setBranchAdvisorsLoading(true);
    void supabase.rpc('list_visualcorp_cash_register_advisors', { p_branch_id: branchId }).then(({ data, error: advisorsError }) => {
      if (!active) return;
      if (advisorsError) {
        setBranchAdvisorsError(advisorsError.message || 'No se pudieron consultar las asesoras habilitadas para esta sucursal.');
      } else {
        setBranchAdvisors((data || []) as BranchAdvisor[]);
        setBranchAdvisorsBranchId(branchId);
      }
      setBranchAdvisorsLoading(false);
    }, (cause) => {
      if (!active) return;
      setBranchAdvisorsError(cause?.message || 'No se pudieron consultar las asesoras habilitadas para esta sucursal.');
      setBranchAdvisorsLoading(false);
    });
    return () => { active = false; };
  }, [canManage, loading, error, organizationId, newRegister.branch_id]);

  const load = async () => {
    if (!supabase || !organizationId) {
      setRegisters([]);
      setGoals([]);
      setDrafts({});
      setError(!supabase ? 'La conexión con la base de datos no está disponible.' : 'No se encontró la organización activa.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [registerResult, goalResult] = await Promise.all([
        supabase.from('cash_registers').select('id,branch_id,name,assigned_advisor_id,active').eq('organization_id', organizationId).order('branch_id').order('name'),
        supabase.from('cash_register_weekly_goals').select('id,cash_register_id,week_start,goal_amount').eq('organization_id', organizationId).eq('week_start', weekStart),
      ]);
      if (registerResult.error) throw registerResult.error;
      if (goalResult.error) throw goalResult.error;
      const nextRegisters = registerResult.data || [];
      const nextGoals = goalResult.data || [];
      setRegisters(nextRegisters);
      setGoals(nextGoals);
      const nextDrafts: Record<string, Draft> = {};
      nextRegisters.forEach((register) => {
        const goal = nextGoals.find((item) => item.cash_register_id === register.id);
        nextDrafts[register.id] = {
          branch_id: register.branch_id,
          name: register.name,
          assigned_advisor_id: register.assigned_advisor_id,
          active: register.active,
          goal_amount: goal ? String(goal.goal_amount) : '',
        };
      });
      setDrafts(nextDrafts);
    } catch (cause: any) {
      setError(registerErrorMessage(cause, 'No se pudo cargar la configuración de cajas y metas.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [organizationId, weekStart, refreshKey]);

  const createRegister = async () => {
    if (!canManage || !supabase) return;
    if (!newRegister.branch_id || !newRegister.assigned_advisor_id || !newRegister.name.trim()) {
      setError('Completa sucursal, nombre de caja y asesora asignada.');
      return;
    }
    if (!eligibleBranchAdvisors.some((advisor) => advisor.user_id === newRegister.assigned_advisor_id)) {
      setError('Selecciona una asesora activa de la sucursal elegida.');
      return;
    }
    if (!newRegister.goal_amount.trim()) {
      setError('Define la meta semanal de esta caja para completar la asignación.');
      return;
    }
    try { validateGoalAmount(newRegister.goal_amount); } catch (cause: any) { setError(cause.message); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: insertError } = await supabase.rpc('create_cash_register_with_weekly_goal', {
        p_organization_id: organizationId,
        p_branch_id: newRegister.branch_id,
        p_name: newRegister.name.trim(),
        p_assigned_advisor_id: newRegister.assigned_advisor_id,
        p_week_start: weekStart,
        p_goal_amount: Number(newRegister.goal_amount),
      });
      if (insertError) throw insertError;
      setNewRegister({ branch_id: branches[0]?.id || '', name: '', assigned_advisor_id: '', active: true, goal_amount: '' });
      setNotice('Caja configurada. Los turnos nuevos de esta sucursal deberán seleccionar la caja asignada.');
      await load(); onChanged();
    } catch (cause: any) {
      setError(registerErrorMessage(cause, 'No se pudo guardar la caja.'));
    } finally { setBusy(false); }
  };

  const saveRegister = async (register: CashRegister) => {
    if (!canManage || !supabase) return;
    const draft = drafts[register.id];
    if (!draft?.branch_id || !draft.assigned_advisor_id || !draft.name.trim()) {
      setError('Completa sucursal, nombre de caja y asesora asignada.');
      return;
    }
    if (!draft.goal_amount.trim()) {
      setError('Define la meta semanal de esta caja antes de guardar.');
      return;
    }
    try { validateGoalAmount(draft.goal_amount); } catch (cause: any) { setError(cause.message); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await updateCashRegisterControl({
        registerId: register.id,
        name: draft.name.trim(),
        branchId: draft.branch_id,
        assignedAdvisorId: draft.assigned_advisor_id,
        active: draft.active,
        weekStart,
        goalAmount: Number(draft.goal_amount),
      });
      setNotice('Caja, asignación y meta de la semana actual guardadas.');
      await load(); onChanged();
    } catch (cause: any) {
      setError(formatAdminControlError(cause, registerErrorMessage(cause, 'No se pudo actualizar la caja.')));
    } finally { setBusy(false); }
  };

  const advisorName = (id: string) => {
    const advisor = advisors.find((person) => person.user_id === id);
    return normalizePersonName(advisor?.full_name) || advisor?.email || 'Asesora no disponible';
  };
  const assignableAdvisors = useMemo(() => {
    const list = advisors.filter((person) => person.active && (person.role === 'advisor' || person.access_profile_key === 'asesoras' || person.role === 'manager'));
    return list.length ? list : advisors.filter((person) => person.active);
  }, [advisors]);
  const branchName = (id: string) => branches.find((item) => item.id === id)?.name || 'Sucursal';
  const currentWeekSales = sales.filter((sale) => sale.status === 'confirmed' && (() => {
    const date = dateInBusinessZone(sale.created_at);
    return date >= weekStart && date <= weekEnd;
  })());
  const returnAdjustedSalesUnavailable = Boolean(saleReturnsError);
  const visibleRegisters = canManage ? registers : registers.filter((register) => register.active);

  return <section className="panel finance-cash-registers" aria-labelledby="finance-cash-registers-title">
    <div className="panel-heading">
      <div><span className="eyebrow">CAJAS · METAS SEMANALES</span><h2 id="finance-cash-registers-title">Avance por caja y asesora</h2>
        <p>Semana desde el lunes {weekStart}. El avance descuenta artículos devueltos y usa la fecha local de registro; los abonos se consultan por separado.</p></div>
      <div className="finance-cash-register-head-actions">
        {canManage && <a className="button button-outline" href="/operaciones/cajas-abiertas">Monitor cajas abiertas <ArrowUpRight size={14} aria-hidden="true"/></a>}
        <Wallet size={19} aria-hidden="true"/>
      </div>
    </div>
    {error && <p className="finance-cash-register-alert" role="alert"><CircleAlert size={15}/>{error}</p>}
    {saleReturnsError && <p className="finance-cash-register-alert" role="alert">No se puede calcular el avance neto de metas porque no se pudieron cargar las devoluciones.</p>}
    {error && <button className="button button-outline" type="button" disabled={loading || busy} onClick={() => void load()}>Reintentar carga</button>}
    {notice && <p className="finance-cash-register-notice" role="status">{notice}</p>}
    <AdminDeleteRecordModal
      open={Boolean(deleteTarget)}
      onOpenChange={(isOpen) => {
        if (!isOpen) setDeleteTarget(null);
      }}
      target={deleteTarget}
      onDeleted={async (msg) => {
        setNotice(msg);
        await load();
        onChanged();
      }}
    />
    {loading ? <p className="muted"><LoaderCircle className="spin" size={15}/> Cargando cajas y metas…</p> : <>
      {!error && !visibleRegisters.length && <div className="finance-cash-register-empty"><b>Todavía no hay cajas configuradas.</b><span>Al asignar una caja a una asesora, los nuevos turnos quedarán vinculados a esa caja y su meta semanal.</span></div>}
      <div className="finance-cash-register-list">
        {visibleRegisters.map((register) => {
          const draft = drafts[register.id];
          const goal = goals.find((item) => item.cash_register_id === register.id);
          const sold = currentWeekSales.filter((sale) => sale.branch_id === register.branch_id && sale.advisor_id === register.assigned_advisor_id)
            .reduce((sum, sale) => sum + netSaleAmount(sale, returnsBySale), 0);
          const target = Number(goal?.goal_amount || 0);
          const percent = !returnAdjustedSalesUnavailable && target > 0 ? Math.round(sold / target * 100) : null;
          return <article className="finance-cash-register-card" key={register.id}>
            <div className="finance-cash-register-summary">
              <div><span>{branchName(register.branch_id)} · {register.name} <small className={`finance-cash-register-state ${register.active ? 'is-active' : 'is-inactive'}`}>{register.active ? 'Activa' : 'Inactiva'}</small></span><b>{advisorName(register.assigned_advisor_id)}</b></div>
                <div className="finance-cash-register-numbers"><strong>{returnAdjustedSalesUnavailable ? '—' : money(sold)}</strong><span>{returnAdjustedSalesUnavailable ? (target ? `meta ${money(target)} · avance pendiente` : 'avance pendiente') : target ? `de ${money(target)} · ${percent}%` : 'meta pendiente'}</span></div>
            </div>
            {!returnAdjustedSalesUnavailable && target > 0 && <div className="finance-cash-register-progress" role="progressbar" aria-label={`Avance de ${register.name} para ${advisorName(register.assigned_advisor_id)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent || 0)} aria-valuetext={`${percent}% de ${money(target)}`}><i style={{ width: `${Math.min(100, Math.max(0, sold / target * 100))}%`}}/></div>}
            {canManage && draft && <div className="finance-cash-register-form">
              <label>Nombre de caja<input value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [register.id]: { ...current[register.id], name: event.target.value } }))}/></label>
              <label>Sucursal<select value={draft.branch_id} onChange={(event) => setDrafts((current) => ({ ...current, [register.id]: { ...current[register.id], branch_id: event.target.value } }))}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label>Asesora asignada<select value={draft.assigned_advisor_id} onChange={(event) => setDrafts((current) => ({ ...current, [register.id]: { ...current[register.id], assigned_advisor_id: event.target.value } }))}>{!assignableAdvisors.some((person) => person.user_id === draft.assigned_advisor_id) && <option value={draft.assigned_advisor_id}>{advisorName(draft.assigned_advisor_id)}</option>}{assignableAdvisors.map((person) => <option key={person.user_id} value={person.user_id}>{normalizePersonName(person.full_name) || person.email}</option>)}</select></label>
              <label>Meta semanal · USD<input type="number" min="0.01" step="0.01" required placeholder="Define la meta de esta semana" value={draft.goal_amount} onChange={(event) => setDrafts((current) => ({ ...current, [register.id]: { ...current[register.id], goal_amount: event.target.value } }))}/></label>
              <label className="finance-cash-register-active"><input type="checkbox" checked={draft.active} onChange={(event) => setDrafts((current) => ({ ...current, [register.id]: { ...current[register.id], active: event.target.checked } }))}/>Caja habilitada</label>
              <div className="finance-cash-register-card-actions">
                <button className="button button-outline" type="button" disabled={busy || !draft.name.trim() || !draft.branch_id || !draft.goal_amount.trim()} onClick={() => void saveRegister(register)}><Save size={14}/> Guardar caja y meta</button>
                {effectiveCanDeleteCash && <button className="button button-outline finance-cash-register-delete-btn" type="button" disabled={busy} onClick={() => setDeleteTarget({ kind: 'register', registerId: register.id, registerName: register.name, branchName: branchName(register.branch_id), active: register.active })}><Trash2 size={14}/> Eliminar caja</button>}
              </div>
            </div>}
            {canManage && <p className="finance-cash-register-note">La sucursal y la asesora quedan fijas al crear la caja. El nombre queda fijo después del primer turno. Para cambiar la asignación, desactívala y crea otra caja.</p>}
          </article>;
        })}
      </div>
      {canManage && !error && <div className="finance-cash-register-create">
        <div><span className="eyebrow">NUEVA ASIGNACIÓN</span><h3>Crear caja</h3></div>
        {branchAdvisorsError ? <p className="finance-cash-register-alert" role="alert">{branchAdvisorsError}</p> : branchAdvisorsPending ? <p className="muted" role="status">Consultando asesoras habilitadas para esta sucursal…</p> : !eligibleBranchAdvisors.length ? <div className="finance-cash-register-empty"><b>No hay asesoras activas disponibles para esta sucursal.</b><span>Activa una cuenta con el perfil Asesoras y confirma su acceso a la sucursal.</span>{canManageTeam ? <a className="button button-outline" href="/operaciones/equipo">Revisar accesos del equipo</a> : <span>Solicita esta revisión a una persona administradora del equipo.</span>}</div> : <>
          <label>Nombre de caja<input placeholder="Ej. Caja 1" value={newRegister.name} onChange={(event) => setNewRegister((current) => ({ ...current, name: event.target.value }))}/></label>
          <div className="finance-cash-register-form">
            <label>Sucursal<select value={newRegister.branch_id} disabled={!branches.length} onChange={(event) => setNewRegister((current) => ({ ...current, branch_id: event.target.value, assigned_advisor_id: '' }))}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label>Asesora asignada<select value={newRegister.assigned_advisor_id} disabled={branchAdvisorsPending || !eligibleBranchAdvisors.length} onChange={(event) => setNewRegister((current) => ({ ...current, assigned_advisor_id: event.target.value }))}><option value="">Selecciona asesora</option>{eligibleBranchAdvisors.map((advisor) => <option key={advisor.user_id} value={advisor.user_id}>{normalizePersonName(advisor.full_name) || `Usuario ${advisor.user_id.slice(0, 8)}`}</option>)}</select></label>
            <label>Meta semanal · USD<input type="number" min="0.01" step="0.01" required placeholder="Obligatoria para esta semana" value={newRegister.goal_amount} onChange={(event) => setNewRegister((current) => ({ ...current, goal_amount: event.target.value }))}/></label>
          </div>
          <button className="button button-dark" type="button" disabled={busy || branchAdvisorsPending || !newRegister.name.trim() || !newRegister.branch_id || !eligibleBranchAdvisors.some((advisor) => advisor.user_id === newRegister.assigned_advisor_id) || !newRegister.goal_amount.trim()} onClick={() => void createRegister()}><Banknote size={15}/> Crear caja y meta</button>
        </>}
      </div>}
      {!canManage && <p className="finance-cash-register-note">La administración completa corresponde a encargados del local y administración. Las asesoras gestionan solo sus cajas desde Mi semana.</p>}
    </>}
  </section>;
}
