import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpDown,
  ArrowUpFromLine,
  ArrowUpRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  Coins,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { normalizePersonName } from '../../lib/personName';
import { supabase } from '../../lib/supabaseClient';
import './open-cash-monitor.css';

type CashSession = {
  id: string;
  organization_id?: string;
  branch_id: string;
  cash_register_id: string | null;
  opened_by: string;
  opened_at: string;
  opening_cash: number | string;
  status?: string;
  closed_by?: string | null;
  closed_at?: string | null;
  expected_cash?: number | string | null;
  counted_cash?: number | string | null;
  difference?: number | string | null;
  closing_note?: string | null;
};

type Branch = { id: string; name: string };
type CashRegister = { id: string; branch_id: string; name: string; assigned_advisor_id: string | null };
type TeamMember = { user_id: string; full_name?: string | null; email?: string | null };
type CloseDraft = { counted: string; note: string };
type CloseResult = { sessionId: string; label: string; success: boolean; message: string };
type ExpectedAmount = { loading: boolean; amount: number | null; error: string };
type DialogState = { mode: 'single' | 'all'; sessions: CashSession[] } | null;

type SessionBreakdown = {
  opening_cash: number;
  movements_in: number;
  movements_out: number;
  cash_sales_total: number;
  transfer_sales_total: number;
  card_sales_total: number;
  expected_cash: number;
};

type CashMovement = {
  id: string;
  organization_id?: string;
  session_id: string;
  direction: 'in' | 'out';
  amount: number;
  reason: string;
  created_by?: string;
  created_at?: string;
  status?: string;
  voided?: boolean;
};

const TIME_ZONE = 'America/Guayaquil';
const money = (value: number | string) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
const dateTime = (value: string) =>
  new Intl.DateTimeFormat('es-EC', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const shortId = (value: string) => value.slice(0, 8).toUpperCase();
const countIsValid = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'No se pudo completar la operación.');

const BILL_DENOMINATIONS = [
  { value: 100, label: '$100' },
  { value: 50, label: '$50' },
  { value: 20, label: '$20' },
  { value: 10, label: '$10' },
  { value: 5, label: '$5' },
  { value: 1, label: '$1' },
];

const COIN_DENOMINATIONS = [
  { value: 1.0, label: '$1.00' },
  { value: 0.5, label: '$0.50' },
  { value: 0.25, label: '$0.25' },
  { value: 0.1, label: '$0.10' },
  { value: 0.05, label: '$0.05' },
  { value: 0.01, label: '$0.01' },
];

export function OpenCashMonitor() {
  const { organizationId, user, hasPermission } = useAuth();
  const canManageCash = hasPermission('cash', 'manage_cash');
  const canViewAllCash = hasPermission('cash', 'view') || canManageCash;
  const canCloseOwnCash = hasPermission('sales', 'edit');
  const canViewCash = canViewAllCash || canCloseOwnCash;
  const canViewTeam = hasPermission('team', 'view');

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [closedSessions, setClosedSessions] = useState<CashSession[]>([]);
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

  // Quick Open Bar state
  const [showOpenBar, setShowOpenBar] = useState(false);
  const [newShiftBranch, setNewShiftBranch] = useState('');
  const [newShiftUser, setNewShiftUser] = useState('');
  const [newShiftRegisterId, setNewShiftRegisterId] = useState('');
  const [newShiftRegisterName, setNewShiftRegisterName] = useState('');
  const [newShiftOpening, setNewShiftOpening] = useState('0');

  // Edit Open Shift Modal state
  const [editingSession, setEditingSession] = useState<CashSession | null>(null);
  const [editOpeningCash, setEditOpeningCash] = useState('0');
  const [editRegisterId, setEditRegisterId] = useState('');
  const [editOpenedBy, setEditOpenedBy] = useState('');

  // Movements Drawer/Modal state
  const [movementSession, setMovementSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [moveDirection, setMoveDirection] = useState<'in' | 'out'>('in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [editingMove, setEditingMove] = useState<CashMovement | null>(null);
  const [editMoveAmount, setEditMoveAmount] = useState('');
  const [editMoveReason, setEditMoveReason] = useState('');
  const [editMoveDirection, setEditMoveDirection] = useState<'in' | 'out'>('in');

  // Reopen shift modal state
  const [reopeningSession, setReopeningSession] = useState<CashSession | null>(null);
  const [reopenReason, setReopenReason] = useState('Reapertura de turno');

  // Edit closed shift modal state
  const [editingClosedSession, setEditingClosedSession] = useState<CashSession | null>(null);
  const [editClosedOpening, setEditClosedOpening] = useState('0');
  const [editClosedCounted, setEditClosedCounted] = useState('0');
  const [editClosedNote, setEditClosedNote] = useState('');

  // Close Dialog & Denomination counting state
  const [dialog, setDialog] = useState<DialogState>(null);
  const [drafts, setDrafts] = useState<Record<string, CloseDraft>>({});
  const [expectedAmounts, setExpectedAmounts] = useState<Record<string, ExpectedAmount>>({});
  const [breakdowns, setBreakdowns] = useState<Record<string, SessionBreakdown>>({});
  const [showDenominations, setShowDenominations] = useState(false);
  const [denominations, setDenominations] = useState<Record<string, number>>({});
  const [confirmedAll, setConfirmedAll] = useState(false);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const moveDialogRef = useRef<HTMLDialogElement>(null);
  const reopenDialogRef = useRef<HTMLDialogElement>(null);
  const editClosedDialogRef = useRef<HTMLDialogElement>(null);

  const loadedOnce = useRef(false);
  const loadPending = useRef(false);

  const loadOpenSessions = useCallback(
    async (manual = false) => {
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
        let sessionQuery = supabase
          .from('cash_sessions')
          .select('id,branch_id,cash_register_id,opened_by,opened_at,opening_cash,status,closed_by,closed_at,expected_cash,counted_cash,difference,closing_note')
          .eq('organization_id', organizationId)
          .eq('status', 'open');
        if (!canViewAllCash && user?.id) sessionQuery = sessionQuery.eq('opened_by', user.id);

        let closedQuery = supabase
          .from('cash_sessions')
          .select('id,branch_id,cash_register_id,opened_by,opened_at,opening_cash,status,closed_by,closed_at,expected_cash,counted_cash,difference,closing_note')
          .eq('organization_id', organizationId)
          .eq('status', 'closed')
          .order('closed_at', { ascending: false })
          .limit(15);
        if (!canViewAllCash && user?.id) closedQuery = closedQuery.eq('opened_by', user.id);

        const [sessionResult, closedResult, branchResult, registerResult] = await Promise.all([
          sessionQuery.order('opened_at', { ascending: true }).order('id', { ascending: true }),
          closedQuery,
          supabase.from('branches').select('id,name').eq('organization_id', organizationId).order('name'),
          supabase
            .from('cash_registers')
            .select('id,branch_id,name,assigned_advisor_id')
            .eq('organization_id', organizationId)
            .order('name'),
        ]);

        if (sessionResult.error) throw sessionResult.error;
        if (branchResult.error) throw branchResult.error;

        setSessions((sessionResult.data || []) as CashSession[]);
        if (!closedResult.error && closedResult.data) {
          setClosedSessions(closedResult.data as CashSession[]);
        }
        setBranches((branchResult.data || []) as Branch[]);
        if (!registerResult.error) setRegisters((registerResult.data || []) as CashRegister[]);
        else setRegisters([]);

        if (canViewTeam) {
          const { data, error: teamError } = await supabase.rpc('list_visualcorp_team_members');
          if (teamError) setTeam([]);
          else setTeam((data || []) as TeamMember[]);
        } else setTeam([]);

        setLastUpdated(
          new Date().toLocaleTimeString('es-EC', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
        );
        loadedOnce.current = true;
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        loadPending.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [organizationId, canViewCash, canViewAllCash, canViewTeam, user?.id]
  );

  useEffect(() => {
    void loadOpenSessions();
  }, [loadOpenSessions]);

  useEffect(() => {
    if (!organizationId || !supabase || !canViewCash) return undefined;
    let refreshTimer: number | undefined;
    const channel = supabase
      .channel(`open-cash-monitor-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_sessions',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          if (refreshTimer) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => {
            void loadOpenSessions(true);
          }, 250);
        }
      )
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

  // Modal show/close effects
  useEffect(() => {
    const node = dialogRef.current;
    if (dialog && node && !node.open) node.showModal();
    if (!dialog && node?.open) node.close();
  }, [dialog]);

  useEffect(() => {
    const node = editDialogRef.current;
    if (editingSession && node && !node.open) node.showModal();
    if (!editingSession && node?.open) node.close();
  }, [editingSession]);

  useEffect(() => {
    const node = moveDialogRef.current;
    if (movementSession && node && !node.open) node.showModal();
    if (!movementSession && node?.open) node.close();
  }, [movementSession]);

  useEffect(() => {
    const node = reopenDialogRef.current;
    if (reopeningSession && node && !node.open) node.showModal();
    if (!reopeningSession && node?.open) node.close();
  }, [reopeningSession]);

  useEffect(() => {
    const node = editClosedDialogRef.current;
    if (editingClosedSession && node && !node.open) node.showModal();
    if (!editingClosedSession && node?.open) node.close();
  }, [editingClosedSession]);

  useEffect(() => {
    if (dialog?.mode === 'all' && !busy)
      setDialog((current) => (current?.mode === 'all' ? { ...current, sessions } : current));
  }, [sessions, dialog?.mode, busy]);

  const branchNames = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const registerById = useMemo(() => new Map(registers.map((register) => [register.id, register])), [registers]);
  const people = useMemo(
    () =>
      new Map(
        team.map((member) => [
          member.user_id,
          normalizePersonName(member.full_name) || member.email || `Usuario ${member.user_id.slice(0, 8)}`,
        ])
      ),
    [team]
  );

  const visibleSessions = useMemo(
    () => (branchFilter === 'all' ? sessions : sessions.filter((session) => session.branch_id === branchFilter)),
    [sessions, branchFilter]
  );

  const visibleClosedSessions = useMemo(
    () =>
      branchFilter === 'all'
        ? closedSessions
        : closedSessions.filter((session) => session.branch_id === branchFilter),
    [closedSessions, branchFilter]
  );

  const visibleOpeningTotal = useMemo(
    () => visibleSessions.reduce((total, session) => total + Number(session.opening_cash || 0), 0),
    [visibleSessions]
  );

  const branchName = (id: string) => branchNames.get(id) || 'Sucursal';
  const registerName = (session: CashSession) =>
    session.cash_register_id
      ? registerById.get(session.cash_register_id)?.name || 'Caja asignada'
      : 'Turno sin caja asignada';
  const openedBy = (session: CashSession) =>
    session.opened_by === user?.id ? 'Tú' : people.get(session.opened_by) || `Usuario ${shortId(session.opened_by)}`;
  const closedBy = (session: CashSession) =>
    session.closed_by
      ? session.closed_by === user?.id
        ? 'Tú'
        : people.get(session.closed_by) || `Usuario ${shortId(session.closed_by)}`
      : '—';
  const sessionLabel = (session: CashSession) => `${registerName(session)} · ${branchName(session.branch_id)}`;

  // Quick initial cash presets
  const applyQuickPreset = (value: number) => {
    setNewShiftOpening(String(value));
  };

  // Preselect branch for new shift
  const defaultBranchForShift = branchFilter !== 'all' ? branchFilter : branches[0]?.id || '';
  const activeBranchId = newShiftBranch || defaultBranchForShift;

  const branchRegisters = useMemo(
    () => (activeBranchId ? registers.filter((r) => r.branch_id === activeBranchId) : registers),
    [registers, activeBranchId]
  );

  // 1. INICIAR CAJA (Apertura súper fácil)
  const handleStartShift = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!supabase || !organizationId) {
      setFeedback({ kind: 'error', message: 'No hay conexión con la base de datos.' });
      return;
    }
    const branchToUse = activeBranchId;
    if (!branchToUse) {
      setFeedback({ kind: 'error', message: 'Selecciona una sucursal para abrir el turno.' });
      return;
    }
    const openingVal = Number(newShiftOpening);
    if (!Number.isFinite(openingVal) || openingVal < 0) {
      setFeedback({ kind: 'error', message: 'Ingresa un fondo inicial válido (0 o mayor).' });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const targetUser = canManageCash && newShiftUser ? newShiftUser : user?.id || '';
      const regName = newShiftRegisterName.trim() || null;

      // Invocar RPC open_pos_cash_session con fallback a insert
      const { data: rpcData, error: rpcError } = await supabase.rpc('open_pos_cash_session', {
        p_branch_id: branchToUse,
        p_opening_cash: openingVal,
        p_register_name: regName,
        p_opened_by: targetUser || null,
      });

      if (rpcError) {
        const isFuncMissing =
          rpcError.code === 'PGRST202' ||
          rpcError.code === '42883' ||
          /open_pos_cash_session/i.test(rpcError.message || '');
        if (isFuncMissing) {
          // Fallback directo a insert en cash_sessions
          const matchedReg = registers.find(
            (r) =>
              r.branch_id === branchToUse &&
              (r.id === newShiftRegisterId || (targetUser && r.assigned_advisor_id === targetUser))
          );
          const { error: insertError } = await supabase.from('cash_sessions').insert({
            organization_id: organizationId,
            branch_id: branchToUse,
            opening_cash: openingVal,
            opened_by: targetUser,
            cash_register_id: matchedReg?.id || (newShiftRegisterId || null),
            status: 'open',
          });
          if (insertError) throw insertError;
        } else {
          throw rpcError;
        }
      }

      setFeedback({
        kind: 'success',
        message: `Turno iniciado con éxito en ${branchName(branchToUse)} con fondo de ${money(openingVal)}.`,
      });
      setShowOpenBar(false);
      setNewShiftOpening('0');
      setNewShiftRegisterName('');
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  // 2. EDICIÓN COMPLETA DE TURNO ABIERTO (Fondo inicial, Caja, Responsable)
  const openEditSessionModal = (session: CashSession) => {
    setEditingSession(session);
    setEditOpeningCash(String(session.opening_cash ?? 0));
    setEditRegisterId(session.cash_register_id || '');
    setEditOpenedBy(session.opened_by);
  };

  const submitEditSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSession || !supabase) return;
    const openingVal = Number(editOpeningCash);
    if (!Number.isFinite(openingVal) || openingVal < 0) {
      setFeedback({ kind: 'error', message: 'Ingresa un fondo inicial válido.' });
      return;
    }

    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_details', {
        p_session: editingSession.id,
        p_opening_cash: openingVal,
        p_cash_register_id: editRegisterId || null,
        p_opened_by: editOpenedBy || editingSession.opened_by,
      });

      if (rpcErr) {
        const isFuncMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /update_cash_session_details/i.test(rpcErr.message || '');
        if (isFuncMissing) {
          const { error: updErr } = await supabase
            .from('cash_sessions')
            .update({
              opening_cash: openingVal,
              cash_register_id: editRegisterId || null,
              opened_by: editOpenedBy || editingSession.opened_by,
            })
            .eq('id', editingSession.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      setFeedback({ kind: 'success', message: 'Detalles del turno actualizados con éxito.' });
      setEditingSession(null);
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  // 3. MOVIMIENTOS DE CAJA (Entradas / Retiros, Editar, Anular)
  const openMovementsModal = async (session: CashSession) => {
    setMovementSession(session);
    setMovements([]);
    setMoveDirection('in');
    setMoveAmount('');
    setMoveReason('');
    setEditingMove(null);
    setLoadingMovements(true);

    if (supabase) {
      try {
        const { data, error: moveErr } = await supabase
          .from('cash_session_movements')
          .select('*')
          .eq('session_id', session.id)
          .order('created_at', { ascending: false });
        if (!moveErr && data) {
          setMovements(data as CashMovement[]);
        }
      } catch (e) {
        console.error('Error loading movements', e);
      } finally {
        setLoadingMovements(false);
      }
    }
  };

  const submitNewMovement = async (event: FormEvent) => {
    event.preventDefault();
    if (!movementSession || !supabase || !organizationId) return;
    const amountVal = Number(moveAmount);
    if (!Number.isFinite(amountVal) || amountVal <= 0 || moveReason.trim().length < 3) {
      setFeedback({ kind: 'error', message: 'Indica un monto mayor a 0 y un motivo de al menos 3 caracteres.' });
      return;
    }

    setBusy(true);
    const key = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const { error: rpcErr } = await supabase.rpc('record_cash_session_movement', {
        p_session: movementSession.id,
        p_direction: moveDirection,
        p_amount: amountVal,
        p_reason: moveReason.trim(),
        p_key: key,
      });

      if (rpcErr) {
        const isFuncMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /record_cash_session_movement/i.test(rpcErr.message || '');
        if (isFuncMissing) {
          const { error: insErr } = await supabase.from('cash_session_movements').insert({
            organization_id: organizationId,
            session_id: movementSession.id,
            direction: moveDirection,
            amount: amountVal,
            reason: moveReason.trim(),
            idempotency_key: key,
            created_by: user?.id,
          });
          if (insErr) throw insErr;
        } else {
          throw rpcErr;
        }
      }

      setMoveAmount('');
      setMoveReason('');
      setFeedback({
        kind: 'success',
        message: `${moveDirection === 'in' ? 'Entrada' : 'Retiro'} de ${money(amountVal)} registrado.`,
      });
      // Recargar movimientos
      const { data } = await supabase
        .from('cash_session_movements')
        .select('*')
        .eq('session_id', movementSession.id)
        .order('created_at', { ascending: false });
      if (data) setMovements(data as CashMovement[]);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const submitEditMovement = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingMove || !movementSession || !supabase) return;
    const amountVal = Number(editMoveAmount);
    if (!Number.isFinite(amountVal) || amountVal <= 0 || editMoveReason.trim().length < 3) {
      setFeedback({ kind: 'error', message: 'Indica un monto válido y motivo de al menos 3 caracteres.' });
      return;
    }

    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_movement', {
        p_movement_id: editingMove.id,
        p_amount: amountVal,
        p_reason: editMoveReason.trim(),
        p_direction: editMoveDirection,
      });

      if (rpcErr) {
        const isFuncMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /update_cash_session_movement/i.test(rpcErr.message || '');
        if (isFuncMissing) {
          const { error: updErr } = await supabase
            .from('cash_session_movements')
            .update({
              amount: amountVal,
              reason: editMoveReason.trim(),
              direction: editMoveDirection,
            })
            .eq('id', editingMove.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      setEditingMove(null);
      setFeedback({ kind: 'success', message: 'Movimiento modificado correctamente.' });
      const { data } = await supabase
        .from('cash_session_movements')
        .select('*')
        .eq('session_id', movementSession.id)
        .order('created_at', { ascending: false });
      if (data) setMovements(data as CashMovement[]);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const voidMovement = async (move: CashMovement) => {
    if (!movementSession || !supabase) return;
    if (!window.confirm(`¿Estás seguro de anular este movimiento de ${money(move.amount)}?`)) return;

    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('void_cash_session_movement', {
        p_movement_id: move.id,
        p_reason: 'Anulado por usuario',
      });

      if (rpcErr) {
        const isFuncMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /void_cash_session_movement/i.test(rpcErr.message || '');
        if (isFuncMissing) {
          const { error: delErr } = await supabase.from('cash_session_movements').delete().eq('id', move.id);
          if (delErr) throw delErr;
        } else {
          throw rpcErr;
        }
      }

      setFeedback({ kind: 'success', message: 'Movimiento anulado.' });
      const { data } = await supabase
        .from('cash_session_movements')
        .select('*')
        .eq('session_id', movementSession.id)
        .order('created_at', { ascending: false });
      if (data) setMovements(data as CashMovement[]);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  // 4. ARQUEO VISUAL, DESGLOSE MULTI-MÉTODO Y CONTADOR DE BILLETES/MONEDAS
  const editDraft = (sessionId: string, key: keyof CloseDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [sessionId]: { counted: '', note: '', ...current[sessionId], [key]: value },
    }));
  };

  const updateDenomination = (valKey: string, count: number, activeSessionId?: string) => {
    const nextDenoms = { ...denominations, [valKey]: Math.max(0, count) };
    setDenominations(nextDenoms);

    // Sumar billetes y monedas automáticamente
    let total = 0;
    for (const [k, c] of Object.entries(nextDenoms)) {
      total += Number(k) * (c || 0);
    }

    if (activeSessionId) {
      editDraft(activeSessionId, 'counted', total.toFixed(2));
    }
  };

  const resetDenominations = (activeSessionId?: string) => {
    setDenominations({});
    if (activeSessionId) {
      editDraft(activeSessionId, 'counted', '0.00');
    }
  };

  const openSingleClose = async (session: CashSession) => {
    setCloseResults([]);
    setConfirmedAll(false);
    setShowDenominations(false);
    setDenominations({});
    setDialog({ mode: 'single', sessions: [session] });

    if (supabase) {
      setExpectedAmounts((current) => ({ ...current, [session.id]: { loading: true, amount: null, error: '' } }));

      // Consultar preview del RPC + desglose de movimientos y pagos
      const [rpcRes, movesRes, paymentsRes] = await Promise.all([
        supabase.rpc('close_cash_session', { p_session: session.id, p_counted_cash: null, p_note: '' }),
        supabase.from('cash_session_movements').select('direction, amount').eq('session_id', session.id),
        supabase.from('sale_payments').select('method, amount').eq('cash_session_id', session.id),
      ]);

      const expectedVal = Number(rpcRes.data?.expected_cash);
      setExpectedAmounts((current) => ({
        ...current,
        [session.id]:
          rpcRes.error || !Number.isFinite(expectedVal)
            ? { loading: false, amount: null, error: rpcRes.error?.message || 'No se pudo calcular el esperado.' }
            : { loading: false, amount: expectedVal, error: '' },
      }));

      // Desglose multi-método
      const opening = Number(session.opening_cash) || 0;
      const movesIn =
        movesRes.data
          ?.filter((m) => m.direction === 'in')
          .reduce((sum, m) => sum + (Number(m.amount) || 0), 0) || 0;
      const movesOut =
        movesRes.data
          ?.filter((m) => m.direction === 'out')
          .reduce((sum, m) => sum + (Number(m.amount) || 0), 0) || 0;
      const cashSales =
        paymentsRes.data
          ?.filter((p) => p.method === 'cash')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const transferSales =
        paymentsRes.data
          ?.filter((p) => p.method === 'transfer')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const cardSales =
        paymentsRes.data
          ?.filter((p) => p.method === 'card')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const finalExpected = Number.isFinite(expectedVal) ? expectedVal : opening + movesIn - movesOut + cashSales;

      setBreakdowns((current) => ({
        ...current,
        [session.id]: {
          opening_cash: opening,
          movements_in: movesIn,
          movements_out: movesOut,
          cash_sales_total: cashSales,
          transfer_sales_total: transferSales,
          card_sales_total: cardSales,
          expected_cash: finalExpected,
        },
      }));
    }
  };

  const openAllClose = (items = sessions) => {
    setCloseResults([]);
    setConfirmedAll(false);
    setShowDenominations(false);
    setDialog({ mode: 'all', sessions: items });
  };

  const submitClose = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || !supabase) return;
    const pendingSessions = dialog.sessions.filter((session) => sessions.some((row) => row.id === session.id));
    if (!pendingSessions.length) {
      setFeedback({
        kind: 'error',
        message: 'Estas cajas ya no están abiertas. Actualicé la lista para confirmar su estado.',
      });
      setDialog(null);
      void loadOpenSessions(true);
      return;
    }
    if (pendingSessions.some((session) => !countIsValid(drafts[session.id]?.counted || ''))) {
      setFeedback({ kind: 'error', message: 'Ingresa el efectivo físico contado en cada caja antes de continuar.' });
      return;
    }
    if (pendingSessions.some((session) => !canManageCash && (session.opened_by !== user?.id || !canCloseOwnCash))) {
      setFeedback({
        kind: 'error',
        message: 'Solo puedes cerrar tu propia caja. Actualicé la lista para confirmar el turno.',
      });
      void loadOpenSessions(true);
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
        let closePayload: any = {
          p_session: session.id,
          p_counted_cash: Number(draft.counted),
          p_note: draft.note.trim(),
        };

        // Enviar p_denominations si existen conteos
        const hasDenoms = Object.values(denominations).some((cnt) => (cnt || 0) > 0);
        if (hasDenoms && dialog.mode === 'single') {
          closePayload.p_denominations = denominations;
        }

        let { data, error: closeError } = await supabase.rpc('close_cash_session', closePayload);

        // Si falla por parámetro p_denominations desconocido, reintentar sin él
        if (
          closeError &&
          (closeError.code === 'PGRST202' ||
            closeError.code === '42883' ||
            /p_denominations/i.test(closeError.message || ''))
        ) {
          const retryRes = await supabase.rpc('close_cash_session', {
            p_session: session.id,
            p_counted_cash: Number(draft.counted),
            p_note: draft.note.trim(),
          });
          data = retryRes.data;
          closeError = retryRes.error;
        }

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
    setFeedback(
      failures
        ? {
            kind: 'error',
            message: `${successes} ${successes === 1 ? 'caja cerrada' : 'cajas cerradas'} y ${failures} ${failures === 1 ? 'pendiente' : 'pendientes'}. Revisa el resultado de cada caja.`,
          }
        : {
            kind: 'success',
            message: `${successes} ${successes === 1 ? 'caja conciliada y cerrada' : 'cajas conciliadas y cerradas'}.`,
          }
    );
    await loadOpenSessions(true);
    setDialog(null);
  };

  // 5. HISTORIAL DE TURNOS CERRADOS (Reapertura y Edición de Arqueo)
  const openReopenModal = (session: CashSession) => {
    setReopeningSession(session);
    setReopenReason('Reapertura para corregir ventas o arqueo');
  };

  const submitReopen = async (event: FormEvent) => {
    event.preventDefault();
    if (!reopeningSession || !supabase) return;
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('reopen_cash_session', {
        p_session: reopeningSession.id,
        p_reason: reopenReason.trim(),
      });

      if (rpcErr) {
        const isFuncMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /reopen_cash_session/i.test(rpcErr.message || '');
        if (isFuncMissing) {
          const { error: updErr } = await supabase
            .from('cash_sessions')
            .update({
              status: 'open',
              closed_at: null,
              closed_by: null,
              difference: null,
              counted_cash: null,
            })
            .eq('id', reopeningSession.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      setFeedback({ kind: 'success', message: 'Turno reabierto con éxito. Ahora aparece en turnos activos.' });
      setReopeningSession(null);
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const openEditClosedModal = (session: CashSession) => {
    setEditingClosedSession(session);
    setEditClosedOpening(String(session.opening_cash ?? 0));
    setEditClosedCounted(String(session.counted_cash ?? 0));
    setEditClosedNote(session.closing_note || '');
  };

  const submitEditClosed = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingClosedSession || !supabase) return;
    const openingVal = Number(editClosedOpening);
    const countedVal = Number(editClosedCounted);
    if (!Number.isFinite(openingVal) || openingVal < 0 || !Number.isFinite(countedVal) || countedVal < 0) {
      setFeedback({ kind: 'error', message: 'Ingresa valores numéricos válidos para fondo y efectivo contado.' });
      return;
    }

    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('update_cash_session_details', {
        p_session: editingClosedSession.id,
        p_opening_cash: openingVal,
        p_counted_cash: countedVal,
        p_closing_note: editClosedNote.trim(),
      });

      if (rpcErr) {
        const isFuncMissing =
          rpcErr.code === 'PGRST202' ||
          rpcErr.code === '42883' ||
          /update_cash_session_details/i.test(rpcErr.message || '');
        if (isFuncMissing) {
          const exp = Number(editingClosedSession.expected_cash) || 0;
          const newDiff = Math.round((countedVal - exp) * 100) / 100;
          const { error: updErr } = await supabase
            .from('cash_sessions')
            .update({
              opening_cash: openingVal,
              counted_cash: countedVal,
              difference: newDiff,
              closing_note: editClosedNote.trim(),
            })
            .eq('id', editingClosedSession.id);
          if (updErr) throw updErr;
        } else {
          throw rpcErr;
        }
      }

      setFeedback({ kind: 'success', message: 'Arqueo y nota del turno cerrado actualizados con éxito.' });
      setEditingClosedSession(null);
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  if (!canViewCash) {
    return (
      <main className="access-screen">
        <section className="access-card">
          <span className="site-eyebrow">
            <i /> PERMISOS
          </span>
          <h1>Tu perfil no tiene acceso a las cajas.</h1>
          <p>
            Esta pantalla requiere permiso de consulta de Caja o permiso de edición de ventas para ver tu propio turno.
          </p>
        </section>
      </main>
    );
  }

  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow={canViewAllCash ? 'OPERACIONES · CONTROL DE CAJA' : 'OPERACIONES · TU TURNO'}
        title={canViewAllCash ? 'Cajas abiertas' : 'Mi caja'}
        description={
          canViewAllCash
            ? 'Monitorea, inicia y edita los turnos activos de todas las sucursales. Los movimientos y cierres se reflejan en tiempo real.'
            : 'Inicia, consulta y cierra tu propio turno con arqueo visual, contador de billetes y registro de movimientos.'
        }
        action={
          <div className="open-cash-heading-actions">
            <span className={`open-cash-live ${liveStatus}`} role="status">
              <i aria-hidden="true" />
              {liveStatus === 'live' ? 'En vivo' : liveStatus === 'connecting' ? 'Conectando' : 'Sin conexión en vivo'}
            </span>
            <button
              className="button button-primary open-cash-quick-start-btn"
              type="button"
              onClick={() => setShowOpenBar((prev) => !prev)}
            >
              <Plus size={16} /> Iniciar turno de caja
            </button>
            <button
              className="button button-outline"
              type="button"
              onClick={() => void loadOpenSessions(true)}
              disabled={loading || refreshing}
            >
              <RefreshCw size={15} className={refreshing ? 'open-cash-spin' : ''} /> Actualizar
            </button>
          </div>
        }
      />

      {error && (
        <p className="open-cash-alert" role="alert">
          <AlertTriangle size={16} />
          {error}
        </p>
      )}
      {feedback && (
        <div className={`open-cash-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.kind === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {closeResults.length > 0 && (
        <section className="open-cash-results" aria-label="Resultado de los cierres">
          <h2>Resultado de conciliación</h2>
          <ul>
            {closeResults.map((result) => (
              <li className={result.success ? 'success' : 'error'} key={result.sessionId}>
                <b>{result.label}</b>
                <span>{result.message}</span>
              </li>
            ))}
          </ul>
          {closeResults.some((result) => !result.success) && (
            <button
              className="button button-outline"
              type="button"
              onClick={() =>
                openAllClose(
                  sessions.filter((session) =>
                    closeResults.some((result) => result.sessionId === session.id && !result.success)
                  )
                )
              }
            >
              Reintentar las cajas pendientes
            </button>
          )}
        </section>
      )}

      {/* KPI Overview Cards */}
      <section className={`open-cash-overview ${canViewAllCash ? '' : 'personal'}`} aria-label="Resumen de cajas abiertas">
        <article className="open-cash-stat">
          <span className="open-cash-stat-icon">
            <Wallet size={19} />
          </span>
          <div>
            <small>{branchFilter === 'all' ? 'Turnos abiertos' : 'Turnos abiertos en sucursal'}</small>
            <b>{visibleSessions.length}</b>
            <span>{branchFilter === 'all' ? 'en toda la organización' : branchName(branchFilter)}</span>
          </div>
        </article>
        {canViewAllCash && (
          <article className="open-cash-stat">
            <span className="open-cash-stat-icon">
              <Banknote size={19} />
            </span>
            <div>
              <small>Fondo inicial visible</small>
              <b>{money(visibleOpeningTotal)}</b>
              <span>Capital de apertura, no saldo actual</span>
            </div>
          </article>
        )}
        <article className="open-cash-stat">
          <span className="open-cash-stat-icon">
            <Activity size={19} />
          </span>
          <div>
            <small>Última actualización</small>
            <b>{lastUpdated}</b>
            <span>
              {liveStatus === 'live'
                ? 'Sincronización automática activa'
                : 'Actualización automática de respaldo cada 30 s'}
            </span>
          </div>
        </article>
      </section>

      {/* Panel Superior Directo: Iniciar Turno de Caja (ultra-fácil en 1 clic) */}
      {(showOpenBar || (!loading && visibleSessions.length === 0)) && (
        <section className="open-cash-start-panel" aria-label="Iniciar turno de caja">
          <div className="open-cash-start-header">
            <div>
              <span className="eyebrow">APERTURA INSTANTÁNEA</span>
              <h3>Iniciar turno de caja</h3>
              <p>Elige sucursal, fondo inicial y presiona iniciar. Tu turno quedará activo de inmediato.</p>
            </div>
            {visibleSessions.length > 0 && (
              <button
                type="button"
                className="open-cash-start-dismiss"
                onClick={() => setShowOpenBar(false)}
                aria-label="Ocultar barra de apertura"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <form className="open-cash-start-form" onSubmit={handleStartShift}>
            <div className="open-cash-start-fields">
              <label>
                Sucursal
                <select
                  value={activeBranchId}
                  onChange={(e) => setNewShiftBranch(e.target.value)}
                  disabled={busy}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              {canManageCash && team.length > 0 && (
                <label>
                  Cajero / Responsable
                  <select
                    value={newShiftUser || user?.id || ''}
                    onChange={(e) => setNewShiftUser(e.target.value)}
                    disabled={busy}
                  >
                    <option value={user?.id || ''}>Tú (usuario actual)</option>
                    {team
                      .filter((m) => m.user_id !== user?.id)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {normalizePersonName(m.full_name) || m.email || `Usuario ${shortId(m.user_id)}`}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label>
                Caja asignada
                <select
                  value={newShiftRegisterId}
                  onChange={(e) => {
                    setNewShiftRegisterId(e.target.value);
                    const selected = branchRegisters.find((r) => r.id === e.target.value);
                    if (selected) setNewShiftRegisterName(selected.name);
                  }}
                  disabled={busy}
                >
                  <option value="">Automática / Sin caja específica</option>
                  {branchRegisters.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="open-cash-start-opening">
                <label htmlFor="new-shift-opening">Fondo inicial ($)</label>
                <div className="open-cash-quick-presets">
                  {[0, 20, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`preset-pill ${Number(newShiftOpening) === amt ? 'is-selected' : ''}`}
                      onClick={() => applyQuickPreset(amt)}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <input
                  id="new-shift-opening"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={newShiftOpening}
                  onChange={(e) => setNewShiftOpening(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="open-cash-start-actions">
              <button className="button button-primary" type="submit" disabled={busy || !activeBranchId}>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="open-cash-spin" /> Abriendo caja…
                  </>
                ) : (
                  <>
                    <Banknote size={16} /> Iniciar caja ahora
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Panel Principal: Turnos Activos */}
      <section className="panel open-cash-panel">
        <div className="open-cash-panel-heading">
          <div>
            <span className="eyebrow">{canViewAllCash ? 'TURNOS ACTIVOS' : 'TU TURNO'}</span>
            <h2>{canViewAllCash ? 'Cajas de todas las sucursales' : 'Tu caja abierta'}</h2>
            <p>
              {canViewAllCash
                ? 'Monitorea, edita fondos iniciales, registra movimientos auditados y concilia arqueos.'
                : 'El esperado se calcula en vivo con el fondo inicial, movimientos y pagos registrados.'}
            </p>
          </div>
          {canManageCash && sessions.length > 0 && (
            <button type="button" className="button button-dark open-cash-close-all" onClick={() => openAllClose()}>
              <ShieldCheck size={16} /> Cerrar todas las cajas · Todas las sucursales <span>{sessions.length}</span>
            </button>
          )}
        </div>

        {canViewAllCash && (
          <div className="open-cash-toolbar">
            <label htmlFor="open-cash-branch">
              Sucursal
              <select
                id="open-cash-branch"
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
              >
                <option value="all">Todas las sucursales</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="open-cash-refresh-note">
              <Clock3 size={14} /> Actualizado {lastUpdated}
              {refreshing ? ' · sincronizando' : ''}
            </span>
          </div>
        )}

        {loading ? (
          <div className="open-cash-empty" role="status">
            <LoaderCircle size={22} className="open-cash-spin" />
            <b>Cargando turnos abiertos…</b>
          </div>
        ) : !visibleSessions.length ? (
          <div className="open-cash-empty">
            <span className="open-cash-empty-icon">
              <Check size={22} />
            </span>
            <b>{sessions.length ? 'No hay cajas abiertas en esta sucursal' : 'No hay cajas abiertas'}</b>
            <span>
              {sessions.length
                ? 'Elige otra sucursal o inicia un nuevo turno en esta sucursal con el panel superior.'
                : 'Usa el botón "Iniciar turno de caja" para abrir tu caja en 1 clic.'}
            </span>
          </div>
        ) : (
          <div className="open-cash-grid">
            {visibleSessions.map((session) => {
              const register = session.cash_register_id ? registerById.get(session.cash_register_id) : undefined;
              const isAssigned = Boolean(register?.assigned_advisor_id);
              const canEditThis = canManageCash || session.opened_by === user?.id;
              const canCloseThis = canManageCash || (canCloseOwnCash && session.opened_by === user?.id);

              return (
                <article className="open-cash-card" key={session.id}>
                  <div className="open-cash-card-top">
                    <span className="open-cash-state">
                      <i aria-hidden="true" /> ABIERTA
                    </span>
                    <span className="open-cash-id">#{shortId(session.id)}</span>
                  </div>
                  <h3>{registerName(session)}</h3>
                  <p className="open-cash-branch">
                    {branchName(session.branch_id)}
                    {register?.assigned_advisor_id ? ` · ${people.get(register.assigned_advisor_id) || 'Asesora asignada'}` : ''}
                  </p>
                  <div className="open-cash-meta">
                    <span>Responsable</span>
                    <b>
                      {openedBy(session)}
                      {isAssigned && register?.assigned_advisor_id !== session.opened_by ? (
                        <small>Caja asignada a otra persona</small>
                      ) : null}
                    </b>
                  </div>
                  <div className="open-cash-meta">
                    <span>Abierta desde</span>
                    <b>{dateTime(session.opened_at)}</b>
                  </div>
                  <div className="open-cash-opening">
                    <span>Fondo inicial</span>
                    <b>{money(session.opening_cash)}</b>
                  </div>

                  {/* Acciones claras: Editar turno, Movimientos, Conciliar y cerrar */}
                  <div className="open-cash-card-actions">
                    {canEditThis && (
                      <div className="open-cash-action-subrow">
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          onClick={() => openEditSessionModal(session)}
                          title="Editar fondo inicial, caja asignada o responsable"
                        >
                          <Edit3 size={14} /> Editar turno
                        </button>
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          onClick={() => void openMovementsModal(session)}
                          title="Ver y registrar entradas (+) o retiros (-)"
                        >
                          <ArrowUpDown size={14} /> Movimientos
                        </button>
                      </div>
                    )}
                    {canCloseThis && (
                      <button
                        type="button"
                        className="button button-dark open-cash-close-one"
                        onClick={() => void openSingleClose(session)}
                      >
                        <Wallet size={15} /> {canManageCash ? 'Conciliar y cerrar' : 'Cerrar mi caja'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Historial de Turnos Cerrados Recientes (con Reapertura y Edición de Arqueo) */}
      <section className="panel open-cash-history-section">
        <div className="open-cash-panel-heading">
          <div>
            <span className="eyebrow">CIERRES AUDITADOS</span>
            <h2>Historial de turnos recientes</h2>
            <p>
              Últimos {visibleClosedSessions.length} turnos cerrados. Si un turno se cerró por error, puedes reabrirlo o
              corregir su arqueo y notas de conciliación.
            </p>
          </div>
        </div>

        {!visibleClosedSessions.length ? (
          <p className="open-cash-history-empty">Aún no hay turnos cerrados registrados.</p>
        ) : (
          <div className="open-cash-history-grid">
            {visibleClosedSessions.map((session) => {
              const diffNum = Number(session.difference) || 0;
              const isExact = Math.abs(diffNum) < 0.005;
              const isSurplus = diffNum > 0.005;
              const diffClass = isExact ? 'exact' : isSurplus ? 'surplus' : 'shortfall';

              return (
                <article className="open-cash-history-card" key={session.id}>
                  <header className="open-cash-history-card-header">
                    <div>
                      <b>{registerName(session)}</b>
                      <span>
                        {branchName(session.branch_id)} · #{shortId(session.id)}
                      </span>
                    </div>
                    <span className={`open-cash-diff-tag ${diffClass}`}>
                      {isExact ? 'Exacto' : isSurplus ? `+${money(diffNum)}` : money(diffNum)}
                    </span>
                  </header>

                  <div className="open-cash-history-meta">
                    <div>
                      <small>Abierta por</small>
                      <span>{openedBy(session)}</span>
                    </div>
                    <div>
                      <small>Cerrada por</small>
                      <span>{closedBy(session)}</span>
                    </div>
                  </div>

                  <div className="open-cash-history-dates">
                    <small>Cierre: {session.closed_at ? dateTime(session.closed_at) : '—'}</small>
                  </div>

                  <div className="open-cash-history-metrics">
                    <div>
                      <small>Fondo inicial</small>
                      <b>{money(session.opening_cash)}</b>
                    </div>
                    <div>
                      <small>Esperado</small>
                      <b>{money(session.expected_cash ?? 0)}</b>
                    </div>
                    <div>
                      <small>Contado</small>
                      <b>{money(session.counted_cash ?? 0)}</b>
                    </div>
                    <div>
                      <small>Diferencia</small>
                      <b className={`diff-val ${diffClass}`}>{money(session.difference ?? 0)}</b>
                    </div>
                  </div>

                  {session.closing_note && (
                    <p className="open-cash-history-note">
                      <strong>Nota:</strong> {session.closing_note}
                    </p>
                  )}

                  <div className="open-cash-history-actions">
                    {(canManageCash || session.opened_by === user?.id) && (
                      <>
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          onClick={() => openReopenModal(session)}
                          title="Reabrir este turno para seguir registrando ventas o movimientos"
                        >
                          <RotateCcw size={13} /> Reabrir turno
                        </button>
                        <button
                          type="button"
                          className="button button-outline button-sm"
                          onClick={() => openEditClosedModal(session)}
                          title="Modificar efectivo contado, fondo o nota de cierre"
                        >
                          <Edit3 size={13} /> Editar arqueo
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal 1: Editar Turno Abierto */}
      <dialog
        ref={editDialogRef}
        className="open-cash-dialog open-cash-edit-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setEditingSession(null);
        }}
      >
        {editingSession && (
          <form onSubmit={submitEditSession}>
            <div className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <Edit3 size={19} />
              </span>
              <button
                type="button"
                className="open-cash-dialog-dismiss"
                disabled={busy}
                onClick={() => setEditingSession(null)}
              >
                <X size={18} />
              </button>
              <div>
                <span className="eyebrow">MODIFICAR TURNO ACTIVO</span>
                <h2>Editar turno #{shortId(editingSession.id)}</h2>
              </div>
            </div>

            <div className="open-cash-modal-body">
              <label>
                Fondo inicial ($)
                <div className="open-cash-quick-presets">
                  {[0, 20, 50, 100].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`preset-pill ${Number(editOpeningCash) === amt ? 'is-selected' : ''}`}
                      onClick={() => setEditOpeningCash(String(amt))}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={editOpeningCash}
                  onChange={(e) => setEditOpeningCash(e.target.value)}
                />
              </label>

              <label>
                Caja asignada
                <select value={editRegisterId} onChange={(e) => setEditRegisterId(e.target.value)}>
                  <option value="">Sin caja específica / Automática</option>
                  {registers
                    .filter((r) => r.branch_id === editingSession.branch_id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>

              {canManageCash && team.length > 0 && (
                <label>
                  Transferir turno a otro responsable
                  <select value={editOpenedBy} onChange={(e) => setEditOpenedBy(e.target.value)}>
                    <option value={editingSession.opened_by}>
                      {people.get(editingSession.opened_by) || `Usuario ${shortId(editingSession.opened_by)}`} (actual)
                    </option>
                    {team
                      .filter((m) => m.user_id !== editingSession.opened_by)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {normalizePersonName(m.full_name) || m.email || `Usuario ${shortId(m.user_id)}`}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            <div className="open-cash-dialog-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setEditingSession(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? <LoaderCircle size={15} className="open-cash-spin" /> : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </dialog>

      {/* Modal 2: Movimientos de Caja (Entradas / Retiros) */}
      <dialog
        ref={moveDialogRef}
        className="open-cash-dialog open-cash-movements-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setMovementSession(null);
        }}
      >
        {movementSession && (
          <div>
            <div className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <ArrowUpDown size={19} />
              </span>
              <button
                type="button"
                className="open-cash-dialog-dismiss"
                disabled={busy}
                onClick={() => setMovementSession(null)}
              >
                <X size={18} />
              </button>
              <div>
                <span className="eyebrow">MOVIMIENTOS AUDITADOS</span>
                <h2>Entradas y retiros · #{shortId(movementSession.id)}</h2>
              </div>
            </div>

            <div className="open-cash-modal-body open-cash-movements-body">
              {/* Formulario nuevo movimiento */}
              <form className="open-cash-new-move-form" onSubmit={submitNewMovement}>
                <h3>Registrar nuevo movimiento</h3>
                <div className="open-cash-direction-toggle">
                  <button
                    type="button"
                    className={`direction-btn in ${moveDirection === 'in' ? 'active' : ''}`}
                    onClick={() => setMoveDirection('in')}
                  >
                    <ArrowDownToLine size={15} /> Entrada de efectivo (+)
                  </button>
                  <button
                    type="button"
                    className={`direction-btn out ${moveDirection === 'out' ? 'active' : ''}`}
                    onClick={() => setMoveDirection('out')}
                  >
                    <ArrowUpFromLine size={15} /> Retiro de efectivo (-)
                  </button>
                </div>

                <div className="open-cash-move-fields">
                  <label>
                    Monto ($)
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Motivo
                    <input
                      type="text"
                      minLength={3}
                      maxLength={500}
                      required
                      placeholder="Ej. Cambio para caja chica / pago a proveedor"
                      value={moveReason}
                      onChange={(e) => setMoveReason(e.target.value)}
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy || Number(moveAmount) <= 0 || moveReason.trim().length < 3}
                >
                  {busy ? <LoaderCircle size={15} className="open-cash-spin" /> : 'Guardar movimiento'}
                </button>
              </form>

              {/* Lista de movimientos */}
              <div className="open-cash-movements-list">
                <h3>Movimientos registrados ({movements.length})</h3>
                {loadingMovements ? (
                  <p className="muted">Cargando movimientos…</p>
                ) : !movements.length ? (
                  <p className="muted">Aún no hay entradas ni retiros registrados en este turno.</p>
                ) : (
                  <ul>
                    {movements.map((move) => {
                      const isEditingThis = editingMove?.id === move.id;
                      return (
                        <li key={move.id} className={`move-item ${move.direction}`}>
                          {isEditingThis ? (
                            <form className="move-edit-inline-form" onSubmit={submitEditMovement}>
                              <div className="move-edit-inputs">
                                <select
                                  value={editMoveDirection}
                                  onChange={(e) => setEditMoveDirection(e.target.value as 'in' | 'out')}
                                >
                                  <option value="in">Entrada (+)</option>
                                  <option value="out">Retiro (-)</option>
                                </select>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  required
                                  value={editMoveAmount}
                                  onChange={(e) => setEditMoveAmount(e.target.value)}
                                />
                                <input
                                  type="text"
                                  required
                                  value={editMoveReason}
                                  onChange={(e) => setEditMoveReason(e.target.value)}
                                  placeholder="Motivo"
                                />
                              </div>
                              <div className="move-edit-actions">
                                <button type="submit" className="button button-sm button-primary" disabled={busy}>
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  className="button button-sm button-outline"
                                  onClick={() => setEditingMove(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <div className="move-info">
                                <span className={`move-badge ${move.direction}`}>
                                  {move.direction === 'in' ? '+ Entrada' : '- Retiro'}
                                </span>
                                <b>{money(move.amount)}</b>
                                <span className="move-reason">{move.reason}</span>
                                <small className="move-time">
                                  {move.created_at ? dateTime(move.created_at) : '—'}
                                </small>
                              </div>
                              <div className="move-actions">
                                <button
                                  type="button"
                                  className="button-icon-subtle"
                                  title="Editar movimiento"
                                  onClick={() => {
                                    setEditingMove(move);
                                    setEditMoveAmount(String(move.amount));
                                    setEditMoveReason(move.reason);
                                    setEditMoveDirection(move.direction);
                                  }}
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="button-icon-subtle danger"
                                  title="Anular movimiento"
                                  onClick={() => void voidMovement(move)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="open-cash-dialog-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setMovementSession(null)}
                disabled={busy}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </dialog>

      {/* Modal 3: Reabrir Turno Cerrado */}
      <dialog
        ref={reopenDialogRef}
        className="open-cash-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setReopeningSession(null);
        }}
      >
        {reopeningSession && (
          <form onSubmit={submitReopen}>
            <div className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <RotateCcw size={19} />
              </span>
              <button
                type="button"
                className="open-cash-dialog-dismiss"
                disabled={busy}
                onClick={() => setReopeningSession(null)}
              >
                <X size={18} />
              </button>
              <div>
                <span className="eyebrow">REAPERTURA AUDITADA</span>
                <h2>Reabrir turno #{shortId(reopeningSession.id)}</h2>
              </div>
            </div>

            <div className="open-cash-modal-body">
              <p className="open-cash-dialog-copy" style={{ padding: 0 }}>
                El turno de <b>{registerName(reopeningSession)}</b> volverá al estado <b>ABIERTO</b>. Podrás seguir
                registrando ventas, abonos en efectivo y realizar un nuevo arqueo de cierre.
              </p>
              <label style={{ marginTop: '12px', display: 'grid', gap: '6px' }}>
                Motivo de reapertura
                <input
                  type="text"
                  required
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ej. Cierre accidental / cobro pendiente en efectivo"
                />
              </label>
            </div>

            <div className="open-cash-dialog-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setReopeningSession(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? <LoaderCircle size={15} className="open-cash-spin" /> : 'Confirmar reapertura'}
              </button>
            </div>
          </form>
        )}
      </dialog>

      {/* Modal 4: Editar Arqueo de Turno Cerrado */}
      <dialog
        ref={editClosedDialogRef}
        className="open-cash-dialog"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setEditingClosedSession(null);
        }}
      >
        {editingClosedSession && (
          <form onSubmit={submitEditClosed}>
            <div className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <Edit3 size={19} />
              </span>
              <button
                type="button"
                className="open-cash-dialog-dismiss"
                disabled={busy}
                onClick={() => setEditingClosedSession(null)}
              >
                <X size={18} />
              </button>
              <div>
                <span className="eyebrow">CORRECCIÓN DE ARQUEO</span>
                <h2>Editar cierre #{shortId(editingClosedSession.id)}</h2>
              </div>
            </div>

            <div className="open-cash-modal-body">
              <label>
                Fondo inicial ($)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={editClosedOpening}
                  onChange={(e) => setEditClosedOpening(e.target.value)}
                />
              </label>
              <label>
                Efectivo físico contado ($)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  value={editClosedCounted}
                  onChange={(e) => setEditClosedCounted(e.target.value)}
                />
              </label>
              <label>
                Nota u observación de cierre
                <input
                  type="text"
                  maxLength={1000}
                  value={editClosedNote}
                  onChange={(e) => setEditClosedNote(e.target.value)}
                  placeholder="Explicación del arqueo o novedades"
                />
              </label>
            </div>

            <div className="open-cash-dialog-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setEditingClosedSession(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? <LoaderCircle size={15} className="open-cash-spin" /> : 'Guardar corrección'}
              </button>
            </div>
          </form>
        )}
      </dialog>

      {/* Modal 5: Arqueo, Desglose Multi-Método, Billetes/Monedas y Cierre */}
      <dialog
        ref={dialogRef}
        className="open-cash-dialog open-cash-reconcile-dialog"
        aria-labelledby="open-cash-dialog-title"
        aria-describedby="open-cash-dialog-description"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setDialog(null);
        }}
      >
        {dialog && (
          <form onSubmit={submitClose}>
            <div className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <ShieldCheck size={19} />
              </span>
              <button
                type="button"
                className="open-cash-dialog-dismiss"
                aria-label="Cerrar ventana"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                <X size={18} />
              </button>
              <div>
                <span className="eyebrow">{dialog.mode === 'all' ? 'CIERRE MASIVO' : 'ARQUEO DE CAJA'}</span>
                <h2 id="open-cash-dialog-title">
                  {dialog.mode === 'all' ? 'Conciliar todas las cajas' : 'Cerrar turno de caja'}
                </h2>
              </div>
            </div>

            <p id="open-cash-dialog-description" className="open-cash-dialog-copy">
              {dialog.mode === 'all'
                ? `Se procesarán ${dialog.sessions.length} cajas en secuencia. Ingresa el efectivo físico contado para cada una; cada cierre guarda su propio arqueo y queda auditado.`
                : 'Ingresa el efectivo físico contado o usa el contador de billetes y monedas. El servidor conciliará y guardará el arqueo.'}
            </p>

            <div className="open-cash-count-list">
              {dialog.sessions.map((session) => {
                const draft = drafts[session.id] || { counted: '', note: '' };
                const expected = expectedAmounts[session.id];
                const breakdown = breakdowns[session.id];
                const countedNum = Number(draft.counted);
                const hasValidCounted = draft.counted.trim() !== '' && Number.isFinite(countedNum);
                const expAmount = expected?.amount ?? breakdown?.expected_cash ?? null;
                const difference = hasValidCounted && expAmount != null ? countedNum - expAmount : null;

                return (
                  <section className="open-cash-count-item" key={session.id}>
                    <header>
                      <div>
                        <b>{registerName(session)}</b>
                        <span>
                          {branchName(session.branch_id)} · {openedBy(session)}
                        </span>
                      </div>
                      <small>Fondo inicial {money(session.opening_cash)}</small>
                    </header>

                    {/* Resumen Multi-Método Detallado (en modo individual) */}
                    {dialog.mode === 'single' && breakdown && (
                      <div className="open-cash-breakdown-card" aria-label="Desglose multi-método">
                        <div className="breakdown-grid">
                          <div>
                            <small>Fondo inicial</small>
                            <b>{money(breakdown.opening_cash)}</b>
                          </div>
                          <div>
                            <small>Entradas (+)</small>
                            <b className="val-in">{money(breakdown.movements_in)}</b>
                          </div>
                          <div>
                            <small>Retiros (-)</small>
                            <b className="val-out">{money(breakdown.movements_out)}</b>
                          </div>
                          <div>
                            <small>Ventas efectivo (+)</small>
                            <b>{money(breakdown.cash_sales_total)}</b>
                          </div>
                          <div>
                            <small>Ventas transferencia</small>
                            <span className="muted-val">{money(breakdown.transfer_sales_total)}</span>
                          </div>
                          <div>
                            <small>Ventas tarjeta</small>
                            <span className="muted-val">{money(breakdown.card_sales_total)}</span>
                          </div>
                        </div>
                        <div className="breakdown-expected-bar">
                          <span>Total efectivo esperado en caja</span>
                          <b>{money(breakdown.expected_cash)}</b>
                        </div>
                      </div>
                    )}

                    {/* Contador de Billetes y Monedas (acordeón interactivo) */}
                    {dialog.mode === 'single' && (
                      <div className="open-cash-denominations-section">
                        <button
                          type="button"
                          className="open-cash-toggle-denoms-btn"
                          onClick={() => setShowDenominations((prev) => !prev)}
                        >
                          <Coins size={16} />
                          <span>{showDenominations ? 'Ocultar contador de billetes y monedas' : 'Contar por billetes y monedas'}</span>
                        </button>

                        {showDenominations && (
                          <div className="open-cash-denoms-accordion">
                            <div className="denoms-group">
                              <h4>Billetes</h4>
                              <div className="denoms-grid">
                                {BILL_DENOMINATIONS.map((bill) => (
                                  <label key={bill.value} className="denom-card">
                                    <span className="denom-label">{bill.label}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                      value={denominations[String(bill.value)] || ''}
                                      onChange={(e) =>
                                        updateDenomination(String(bill.value), parseInt(e.target.value, 10) || 0, session.id)
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="denoms-group">
                              <h4>Monedas</h4>
                              <div className="denoms-grid">
                                {COIN_DENOMINATIONS.map((coin) => (
                                  <label key={coin.value} className="denom-card">
                                    <span className="denom-label">{coin.label}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                      value={denominations[String(coin.value)] || ''}
                                      onChange={(e) =>
                                        updateDenomination(String(coin.value), parseInt(e.target.value, 10) || 0, session.id)
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>

                            <button
                              type="button"
                              className="button button-outline button-sm reset-denoms-btn"
                              onClick={() => resetDenominations(session.id)}
                            >
                              Limpiar desglose
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Campos de Efectivo Contado y Nota */}
                    <div className="open-cash-count-fields">
                      <label htmlFor={`counted-${session.id}`}>
                        Efectivo físico contado ($)
                        <input
                          id={`counted-${session.id}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          required
                          value={draft.counted}
                          onChange={(event) => editDraft(session.id, 'counted', event.target.value)}
                          placeholder="0.00"
                        />
                      </label>
                      <label htmlFor={`note-${session.id}`}>
                        Nota de cierre <span>(opcional)</span>
                        <input
                          id={`note-${session.id}`}
                          type="text"
                          maxLength={1000}
                          value={draft.note}
                          onChange={(event) => editDraft(session.id, 'note', event.target.value)}
                          placeholder="Explica una diferencia o novedad"
                        />
                      </label>
                    </div>

                    {/* Indicador de Cuadre en Tiempo Real */}
                    {difference !== null && (
                      <div
                        className={`open-cash-live-diff ${Math.abs(difference) < 0.005 ? 'exact' : difference > 0 ? 'surplus' : 'shortfall'}`}
                      >
                        {Math.abs(difference) < 0.005 ? (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Cuadre exacto ($0.00) · El efectivo físico coincide con lo esperado.</span>
                          </>
                        ) : difference > 0 ? (
                          <>
                            <ArrowUpRight size={16} />
                            <span>Sobrante de +{money(difference)} sobre el efectivo esperado.</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={16} />
                            <span>Faltante de {money(difference)} respecto al esperado.</span>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {dialog.mode === 'all' && (
              <label className="open-cash-bulk-confirm">
                <input
                  type="checkbox"
                  checked={confirmedAll}
                  onChange={(event) => setConfirmedAll(event.target.checked)}
                />
                <span>Confirmo que estos montos corresponden al efectivo contado físicamente en cada caja.</span>
              </label>
            )}

            <div className="open-cash-dialog-footer">
              <button type="button" className="button button-outline" onClick={() => setDialog(null)} disabled={busy}>
                Cancelar
              </button>
              <button
                type="submit"
                className="button button-dark"
                disabled={
                  busy ||
                  (dialog.mode === 'all' && !confirmedAll) ||
                  dialog.sessions.some((session) => !countIsValid(drafts[session.id]?.counted || ''))
                }
              >
                {busy ? (
                  <>
                    <LoaderCircle size={15} className="open-cash-spin" /> Conciliando…
                  </>
                ) : dialog.mode === 'all' ? (
                  `Cerrar ${dialog.sessions.length} cajas`
                ) : (
                  'Conciliar y cerrar caja'
                )}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </AppFrame>
  );
}
