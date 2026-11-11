import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
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
  CheckSquare,
  Clock3,
  Coins,
  Edit3,
  Eye,
  FlaskConical,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { AppFrame, PageHeading } from '../../app/layout';
import { useAuth } from '../../auth/AuthProvider';
import { normalizePersonName } from '../../lib/personName';
import { supabase } from '../../lib/supabaseClient';
import { NumberTicker, PulsingBeacon } from '../../components/ui/MagicComponents';
import { useConfirm } from '../../components/ui/DialogSystem';
import { AdminDeleteRecordModal, type AdminDeleteTarget } from '../../components/AdminDeleteRecordModal';
import {
  canAdminDeleteCash,
  canAdminDeleteSales,
  canManageCashControl,
  formatAdminControlError,
  type CashMonitorSessionDetail,
} from '../../lib/adminCashSalesControl';
import { CashSessionInspectorModal } from './cash-monitor/CashSessionInspectorModal';
import { CashRegisterControlDrawer } from './cash-monitor/CashRegisterControlDrawer';
import { AdminDeletionAuditDrawer } from './cash-monitor/AdminDeletionAuditDrawer';
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
type CashRegister = {
  id: string;
  branch_id: string;
  name: string;
  assigned_advisor_id: string | null;
  active?: boolean;
};
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
  sales_count?: number;
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
const errorMessage = (error: unknown) => formatAdminControlError(error);

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
  const confirmDialog = useConfirm();
  const { organizationId, user, roles, hasPermission } = useAuth();
  const canManageCash = hasPermission('cash', 'manage_cash');
  const canViewAllCash = hasPermission('cash', 'view') || canManageCash;
  const canCloseOwnCash = hasPermission('sales', 'edit');
  const canViewCash = canViewAllCash || canCloseOwnCash;
  const canViewTeam = hasPermission('team', 'view');

  const canDeleteSales = canAdminDeleteSales(roles, hasPermission);
  const canDeleteCash = canAdminDeleteCash(roles, hasPermission);
  const canManageRegisters = canManageCashControl(roles, hasPermission);
  const canCleanupTests = canDeleteSales || canDeleteCash;

  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [closedSessions, setClosedSessions] = useState<CashSession[]>([]);
  const [liveBreakdowns, setLiveBreakdowns] = useState<Record<string, SessionBreakdown>>({});
  const [closedSalesCounts, setClosedSalesCounts] = useState<Record<string, number>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [auditCount, setAuditCount] = useState(0);

  // Filters
  const [branchFilter, setBranchFilter] = useState('all');
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false);

  // Bulk test cleanup mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

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
  const [editOpenReason, setEditOpenReason] = useState('Corrección administrativa de turno');

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
  const [reopenReason, setReopenReason] = useState('Reapertura de turno para ajuste o verificación');

  // Edit closed shift modal state
  const [editingClosedSession, setEditingClosedSession] = useState<CashSession | null>(null);
  const [editClosedOpening, setEditClosedOpening] = useState('0');
  const [editClosedCounted, setEditClosedCounted] = useState('0');
  const [editClosedNote, setEditClosedNote] = useState('');
  const [editClosedReason, setEditClosedReason] = useState('Corrección administrativa de arqueo cerrado');

  // Close Dialog & Denomination counting state
  const [dialog, setDialog] = useState<DialogState>(null);
  const [drafts, setDrafts] = useState<Record<string, CloseDraft>>({});
  const [expectedAmounts, setExpectedAmounts] = useState<Record<string, ExpectedAmount>>({});
  const [breakdowns, setBreakdowns] = useState<Record<string, SessionBreakdown>>({});
  const [showDenominations, setShowDenominations] = useState(false);
  const [denominations, setDenominations] = useState<Record<string, number>>({});
  const [confirmedAll, setConfirmedAll] = useState(false);

  // Overhaul drawers & admin delete modals
  const [inspectorSessionId, setInspectorSessionId] = useState<string | null>(null);
  const [registerDrawerOpen, setRegisterDrawerOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [adminDeleteTarget, setAdminDeleteTarget] = useState<AdminDeleteTarget | null>(null);

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
          .limit(30);
        if (!canViewAllCash && user?.id) closedQuery = closedQuery.eq('opened_by', user.id);

        const [sessionResult, closedResult, branchResult, registerResult, auditCountRes] = await Promise.all([
          sessionQuery.order('opened_at', { ascending: true }).order('id', { ascending: true }),
          closedQuery,
          supabase.from('branches').select('id,name').eq('organization_id', organizationId).order('name'),
          supabase
            .from('cash_registers')
            .select('id,branch_id,name,assigned_advisor_id,active')
            .eq('organization_id', organizationId)
            .order('name'),
          canCleanupTests
            ? supabase
                .from('admin_deletion_audits')
                .select('id', { count: 'exact', head: true })
                .eq('organization_id', organizationId)
            : Promise.resolve({ count: 0, error: null }),
        ]);

        if (sessionResult.error) throw sessionResult.error;
        if (branchResult.error) throw branchResult.error;

        const openRows = (sessionResult.data || []) as CashSession[];
        const closedRows = (!closedResult.error && closedResult.data ? closedResult.data : []) as CashSession[];
        const allIds = [...openRows, ...closedRows].map((s) => s.id);

        setSessions(openRows);
        setClosedSessions(closedRows);
        setBranches((branchResult.data || []) as Branch[]);
        setRegisters(!registerResult.error ? ((registerResult.data || []) as CashRegister[]) : []);
        setAuditCount(!auditCountRes.error && typeof auditCountRes.count === 'number' ? auditCountRes.count : 0);

        // Fetch batch movements + payments for live drawer telemetry without N+1 calls
        if (allIds.length > 0) {
          const [movesRes, paysRes] = await Promise.all([
            supabase
              .from('cash_session_movements')
              .select('session_id, direction, amount, voided')
              .eq('organization_id', organizationId)
              .in('session_id', allIds)
              .eq('voided', false),
            supabase
              .from('sale_payments')
              .select('cash_session_id, sale_id, method, amount')
              .eq('organization_id', organizationId)
              .in('cash_session_id', allIds),
          ]);

          const moveRows = (movesRes.data || []) as Array<{
            session_id: string;
            direction: string;
            amount: number;
          }>;
          const payRows = (paysRes.data || []) as Array<{
            cash_session_id: string;
            sale_id: string;
            method: string;
            amount: number;
          }>;

          const nextBreakdowns: Record<string, SessionBreakdown> = {};
          for (const s of openRows) {
            const opening = Number(s.opening_cash) || 0;
            const sMoves = moveRows.filter((m) => m.session_id === s.id);
            const movesIn = sMoves
              .filter((m) => m.direction === 'in')
              .reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
            const movesOut = sMoves
              .filter((m) => m.direction === 'out')
              .reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
            const sPays = payRows.filter((p) => p.cash_session_id === s.id);
            const cashSales = sPays
              .filter((p) => p.method === 'cash')
              .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const transferSales = sPays
              .filter((p) => p.method === 'transfer')
              .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const cardSales = sPays
              .filter((p) => p.method === 'card')
              .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
            const saleSet = new Set(sPays.map((p) => p.sale_id).filter(Boolean));
            nextBreakdowns[s.id] = {
              opening_cash: opening,
              movements_in: movesIn,
              movements_out: movesOut,
              cash_sales_total: cashSales,
              transfer_sales_total: transferSales,
              card_sales_total: cardSales,
              expected_cash: Math.round((opening + movesIn - movesOut + cashSales) * 100) / 100,
              sales_count: saleSet.size,
            };
          }
          setLiveBreakdowns(nextBreakdowns);

          const nextCounts: Record<string, number> = {};
          for (const s of [...openRows, ...closedRows]) {
            const saleSet = new Set(
              payRows
                .filter((p) => p.cash_session_id === s.id)
                .map((p) => p.sale_id)
                .filter(Boolean)
            );
            nextCounts[s.id] = saleSet.size;
          }
          setClosedSalesCounts(nextCounts);
        } else {
          setLiveBreakdowns({});
          setClosedSalesCounts({});
        }

        if (canViewTeam) {
          const { data, error: teamError } = await supabase.rpc('list_visualcorp_team_members');
          if (teamError) setTeam([]);
          else setTeam((data || []) as TeamMember[]);
        } else setTeam([]);

        setSelectedSessionIds((curr) => curr.filter((id) => allIds.includes(id)));
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
    [organizationId, canViewCash, canViewAllCash, canViewTeam, canCleanupTests, user?.id]
  );

  useEffect(() => {
    void loadOpenSessions();
  }, [loadOpenSessions]);

  useEffect(() => {
    if (!organizationId || !supabase || !canViewCash) return undefined;
    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadOpenSessions(true);
      }, 280);
    };

    const channel = supabase
      .channel(`open-cash-monitor-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_sessions', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_session_movements', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sale_payments', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_registers', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_deletion_audits', filter: `organization_id=eq.${organizationId}` },
        scheduleRefresh
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
    if (!node) return;
    if (dialog && !node.open) node.showModal();
    if (!dialog && node.open) node.close();
  }, [dialog]);

  useEffect(() => {
    const node = editDialogRef.current;
    if (!node) return;
    if (editingSession && !node.open) node.showModal();
    if (!editingSession && node.open) node.close();
  }, [editingSession]);

  useEffect(() => {
    const node = moveDialogRef.current;
    if (!node) return;
    if (movementSession && !node.open) node.showModal();
    if (!movementSession && node.open) node.close();
  }, [movementSession]);

  useEffect(() => {
    const node = reopenDialogRef.current;
    if (!node) return;
    if (reopeningSession && !node.open) node.showModal();
    if (!reopeningSession && node.open) node.close();
  }, [reopeningSession]);

  useEffect(() => {
    const node = editClosedDialogRef.current;
    if (!node) return;
    if (editingClosedSession && !node.open) node.showModal();
    if (!editingClosedSession && node.open) node.close();
  }, [editingClosedSession]);

  const branchName = useCallback(
    (branchId: string) => branches.find((b) => b.id === branchId)?.name || 'Sucursal sin nombre',
    [branches]
  );

  const registerName = useCallback(
    (registerId: string | null) =>
      (registerId && registers.find((r) => r.id === registerId)?.name) || 'Caja sin nombre fijo',
    [registers]
  );

  const openerName = useCallback(
    (userId: string) => {
      const member = team.find((m) => m.user_id === userId);
      if (member) {
        const personName = normalizePersonName(member.full_name || member.email);
        if (personName) return personName;
      }
      if (userId === user?.id) {
        const selfName = normalizePersonName(
          user.user_metadata?.full_name || user.user_metadata?.name || user.email
        );
        return selfName ? `${selfName} (tu sesión)` : 'Tu usuario';
      }
      return `Usuario ${shortId(userId)}`;
    },
    [team, user]
  );

  const sessionLabel = useCallback(
    (session: CashSession) => `${registerName(session.cash_register_id)} · ${branchName(session.branch_id)}`,
    [registerName, branchName]
  );

  const openRegisterIds = useMemo(
    () => new Set(sessions.map((s) => s.cash_register_id).filter((id): id is string => Boolean(id))),
    [sessions]
  );

  const matchesSearch = useCallback(
    (session: CashSession) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return `${registerName(session.cash_register_id)} ${branchName(session.branch_id)} ${openerName(
        session.opened_by
      )} ${shortId(session.id)} ${session.closing_note || ''}`
        .toLowerCase()
        .includes(q);
    },
    [searchQuery, registerName, branchName, openerName]
  );

  const visibleSessions = useMemo(
    () =>
      sessions.filter((session) => {
        if (branchFilter !== 'all' && session.branch_id !== branchFilter) return false;
        if (advisorFilter !== 'all' && session.opened_by !== advisorFilter) return false;
        return matchesSearch(session);
      }),
    [sessions, branchFilter, advisorFilter, matchesSearch]
  );

  const visibleClosedSessions = useMemo(
    () =>
      closedSessions.filter((session) => {
        if (branchFilter !== 'all' && session.branch_id !== branchFilter) return false;
        if (advisorFilter !== 'all' && session.opened_by !== advisorFilter) return false;
        if (onlyDiscrepancies && Math.abs(Number(session.difference) || 0) < 0.01) return false;
        return matchesSearch(session);
      }),
    [closedSessions, branchFilter, advisorFilter, onlyDiscrepancies, matchesSearch]
  );

  const closableVisible = useMemo(
    () =>
      visibleSessions.filter(
        (session) => canManageCash || (session.opened_by === user?.id && canCloseOwnCash)
      ),
    [visibleSessions, canManageCash, user?.id, canCloseOwnCash]
  );

  const totalOpening = useMemo(
    () => visibleSessions.reduce((sum, session) => sum + (Number(session.opening_cash) || 0), 0),
    [visibleSessions]
  );

  const totalExpectedLive = useMemo(
    () =>
      visibleSessions.reduce((sum, session) => {
        const b = liveBreakdowns[session.id];
        return sum + (b ? b.expected_cash : Number(session.opening_cash) || 0);
      }, 0),
    [visibleSessions, liveBreakdowns]
  );

  const totalCashSalesLive = useMemo(
    () =>
      visibleSessions.reduce(
        (sum, session) => sum + (liveBreakdowns[session.id]?.cash_sales_total || 0),
        0
      ),
    [visibleSessions, liveBreakdowns]
  );

  const activeBranchesCount = useMemo(
    () => new Set(visibleSessions.map((session) => session.branch_id)).size,
    [visibleSessions]
  );

  const activeAdvisorOptions = useMemo(() => {
    const ids = new Set<string>([...sessions, ...closedSessions].map((s) => s.opened_by));
    return [...ids].map((id) => ({ id, label: openerName(id) }));
  }, [sessions, closedSessions, openerName]);

  const applyQuickPreset = (value: number) => {
    setNewShiftOpening(String(value));
  };

  const defaultBranchForShift = branchFilter !== 'all' ? branchFilter : branches[0]?.id || '';
  const activeBranchId = newShiftBranch || defaultBranchForShift;

  const branchRegisters = useMemo(
    () =>
      (activeBranchId ? registers.filter((r) => r.branch_id === activeBranchId) : registers).filter(
        (r) => r.active !== false
      ),
    [registers, activeBranchId]
  );

  const toggleBulkSession = (sessionId: string) => {
    setSelectedSessionIds((curr) =>
      curr.includes(sessionId) ? curr.filter((id) => id !== sessionId) : [...curr, sessionId]
    );
  };

  // 1. INICIAR CAJA
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

      const { error: rpcError } = await supabase.rpc('open_pos_cash_session', {
        p_branch_id: branchToUse,
        p_opening_cash: openingVal,
        p_register_name: newShiftRegisterId ? null : regName,
        p_cash_register_id: newShiftRegisterId || null,
        p_opened_by: targetUser || null,
      });

      if (rpcError) {
        const isFuncMissing =
          rpcError.code === 'PGRST202' ||
          rpcError.code === '42883' ||
          /open_pos_cash_session/i.test(rpcError.message || '');
        if (isFuncMissing) {
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
            cash_register_id: matchedReg?.id || newShiftRegisterId || null,
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
      setNewShiftRegisterId('');
      setNewShiftRegisterName('');
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  // 2. EDICIÓN COMPLETA DE TURNO ABIERTO
  const openEditSessionModal = (session: CashSession) => {
    setEditingSession(session);
    setEditOpeningCash(String(session.opening_cash ?? 0));
    setEditRegisterId(session.cash_register_id || '');
    setEditOpenedBy(session.opened_by);
    setEditOpenReason('Corrección administrativa de fondo o responsable');
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
        p_reason: editOpenReason.trim() || 'Ajuste administrativo de caja abierta',
      });
      if (rpcErr) throw rpcErr;

      setFeedback({ kind: 'success', message: 'Detalles del turno actualizados y auditados con éxito.' });
      setEditingSession(null);
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  // 3. MOVIMIENTOS DE CAJA
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
      if (rpcErr) throw rpcErr;

      setMoveAmount('');
      setMoveReason('');
      setFeedback({
        kind: 'success',
        message: `${moveDirection === 'in' ? 'Entrada' : 'Retiro'} de ${money(amountVal)} registrado.`,
      });
      const { data } = await supabase
        .from('cash_session_movements')
        .select('*')
        .eq('session_id', movementSession.id)
        .order('created_at', { ascending: false });
      if (data) setMovements(data as CashMovement[]);
      await loadOpenSessions(true);
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
      if (rpcErr) throw rpcErr;

      setEditingMove(null);
      setFeedback({ kind: 'success', message: 'Movimiento modificado correctamente.' });
      const { data } = await supabase
        .from('cash_session_movements')
        .select('*')
        .eq('session_id', movementSession.id)
        .order('created_at', { ascending: false });
      if (data) setMovements(data as CashMovement[]);
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const voidMovement = async (move: CashMovement) => {
    if (!movementSession || !supabase) return;
    const confirmed = await confirmDialog({
      title: 'Anular movimiento de caja',
      description: `Se anulará el movimiento de ${money(move.amount)} ("${move.reason}") y se actualizará el esperado del turno.`,
      tone: 'warning',
      destructive: true,
      confirmLabel: 'Sí, anular movimiento',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('void_cash_session_movement', {
        p_movement_id: move.id,
        p_reason: 'Anulado desde Cajas abiertas',
      });
      if (rpcErr) throw rpcErr;

      setFeedback({ kind: 'success', message: 'Movimiento anulado.' });
      const { data } = await supabase
        .from('cash_session_movements')
        .select('*')
        .eq('session_id', movementSession.id)
        .order('created_at', { ascending: false });
      if (data) setMovements(data as CashMovement[]);
      await loadOpenSessions(true);
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

      const [rpcRes, movesRes, paymentsRes] = await Promise.all([
        supabase.rpc('close_cash_session', { p_session: session.id, p_counted_cash: null, p_note: '' }),
        supabase
          .from('cash_session_movements')
          .select('direction, amount')
          .eq('session_id', session.id)
          .eq('voided', false),
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

      const opening = Number(session.opening_cash) || 0;
      const movesIn =
        movesRes.data?.filter((m) => m.direction === 'in').reduce((sum, m) => sum + (Number(m.amount) || 0), 0) || 0;
      const movesOut =
        movesRes.data?.filter((m) => m.direction === 'out').reduce((sum, m) => sum + (Number(m.amount) || 0), 0) || 0;
      const cashSales =
        paymentsRes.data?.filter((p) => p.method === 'cash').reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const transferSales =
        paymentsRes.data
          ?.filter((p) => p.method === 'transfer')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const cardSales =
        paymentsRes.data?.filter((p) => p.method === 'card').reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
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
        const closePayload: Record<string, unknown> = {
          p_session: session.id,
          p_counted_cash: Number(draft.counted),
          p_note: draft.note.trim(),
        };
        const hasDenoms = Object.values(denominations).some((cnt) => (cnt || 0) > 0);
        if (hasDenoms && dialog.mode === 'single') {
          closePayload.p_denominations = denominations;
        }

        let { error: closeError } = await supabase.rpc('close_cash_session', closePayload);

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
          closeError = retryRes.error;
        }

        if (closeError) throw closeError;
        results.push({
          sessionId: session.id,
          label,
          success: true,
          message: `Cerrada con físico de ${money(draft.counted)}`,
        });
      } catch (cause) {
        results.push({ sessionId: session.id, label, success: false, message: errorMessage(cause) });
      }
    }

    const closed = results.filter((item) => item.success);
    const failed = results.filter((item) => !item.success);
    if (closed.length) {
      setDrafts((current) => {
        const next = { ...current };
        closed.forEach((item) => delete next[item.sessionId]);
        return next;
      });
    }
    await loadOpenSessions(true);

    if (failed.length) {
      setCloseResults(results);
      setConfirmedAll(false);
      setDialog((current) =>
        current
          ? {
              ...current,
              sessions: current.sessions.filter((session) =>
                failed.some((item) => item.sessionId === session.id)
              ),
            }
          : null
      );
      setFeedback({
        kind: 'error',
        message: `${closed.length} cerradas; ${failed.length} pendientes de revisión.`,
      });
    } else {
      setDialog(null);
      setFeedback({
        kind: 'success',
        message:
          closed.length === 1
            ? `Caja cerrada correctamente (${closed[0].label}).`
            : `Se cerraron correctamente ${closed.length} cajas abiertas.`,
      });
    }
    setBusy(false);
  };

  // 5. REAPERTURA & EDICIÓN DE CIERRES PASADOS
  const submitReopenSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!reopeningSession || !supabase) return;
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('reopen_cash_session', {
        p_session: reopeningSession.id,
        p_reason: reopenReason.trim(),
      });
      if (rpcErr) throw rpcErr;

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
    setEditClosedReason('Corrección administrativa de arqueo cerrado');
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
        p_reason: editClosedReason.trim() || 'Corrección administrativa de arqueo cerrado',
      });
      if (rpcErr) throw rpcErr;

      setFeedback({ kind: 'success', message: 'Arqueo y nota del turno cerrado actualizados con éxito.' });
      setEditingClosedSession(null);
      await loadOpenSessions(true);
    } catch (cause) {
      setFeedback({ kind: 'error', message: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const openSessionDeleteModal = (session: CashSession) => {
    setAdminDeleteTarget({
      kind: 'session',
      sessionId: session.id,
      registerName: registerName(session.cash_register_id),
      branchName: branchName(session.branch_id),
      advisorName: openerName(session.opened_by),
      openingCash: Number(session.opening_cash) || 0,
      status: session.status || 'open',
      salesCount: liveBreakdowns[session.id]?.sales_count ?? closedSalesCounts[session.id] ?? 0,
      openedAt: session.opened_at,
    });
  };

  const openSessionDeleteFromInspector = (detail: CashMonitorSessionDetail) => {
    setInspectorSessionId(null);
    setAdminDeleteTarget({
      kind: 'session',
      sessionId: detail.session.id,
      registerName: detail.session.register_name || 'Caja libre',
      branchName: detail.session.branch_name || 'Sucursal',
      advisorName: openerName(detail.session.opened_by),
      openingCash: Number(detail.session.opening_cash) || 0,
      status: detail.session.status || 'open',
      salesCount: detail.live_totals.sales_count || 0,
      movementsCount: detail.movements.length,
      openedAt: detail.session.opened_at,
    });
  };

  if (!canViewCash) {
    return (
      <AppFrame area="operations">
        <PageHeading
          eyebrow="OPERACIONES · CONTROL DE CAJA"
          title="Cajas abiertas"
          description="Control en vivo de cajas registradoras, ventas asociadas, arqueos y auditoría administrativa."
        />
        <div className="panel open-cash-alert" role="alert">
          <AlertCircle size={18} />
          <span>No tienes permisos asignados para acceder a esta sección de control de cajas.</span>
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame area="operations">
      <PageHeading
        eyebrow="OPERACIONES · CONTROL TOTAL DE CAJA"
        title="Cajas abiertas"
        description={
          canManageCash
            ? 'Supervisa en vivo todas las gavetas, inspecciona ventas cobradas, corrige fondos iniciales, gestiona cajas registradoras y limpia registros de prueba.'
            : 'Inicia tu turno de caja, registra movimientos de entrada/retiro, inspecciona tus ventas y ejecuta el arqueo de cierre.'
        }
        action={
          <div className="open-cash-heading-actions">
            <span className={`open-cash-live ${liveStatus}`}>
              <PulsingBeacon
                color={liveStatus === 'live' ? '#16a34a' : '#d97706'}
                size={8}
                numRipples={liveStatus === 'live' ? 2 : 0}
              />
              {liveStatus === 'live' ? 'En vivo' : liveStatus === 'connecting' ? 'Conectando' : 'Reconectando'}
            </span>
            <button
              type="button"
              className="button button-dark"
              onClick={() => setShowOpenBar((v) => !v)}
              disabled={busy}
            >
              <Plus size={15} /> {showOpenBar ? 'Cerrar formulario' : 'Iniciar caja'}
            </button>
            {canManageRegisters && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => setRegisterDrawerOpen(true)}
              >
                <Settings2 size={15} /> Cajas registradoras ({registers.length})
              </button>
            )}
            {canCleanupTests && (
              <>
                <button
                  type="button"
                  className={`button button-outline ${bulkMode ? 'is-active-filter' : ''}`}
                  onClick={() => {
                    setBulkMode((prev) => !prev);
                    setSelectedSessionIds([]);
                  }}
                >
                  <FlaskConical size={15} /> {bulkMode ? 'Salir limpieza' : 'Limpiar pruebas'}
                </button>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setAuditDrawerOpen(true)}
                >
                  <History size={15} /> Eliminaciones ({auditCount})
                </button>
              </>
            )}
            <Link to="/operaciones/finanzas?tab=cajas" className="button button-outline">
              <Wallet size={15} /> Finanzas cajas <ArrowUpRight size={13} />
            </Link>
            <button
              type="button"
              className="button button-outline"
              onClick={() => void loadOpenSessions(true)}
              disabled={loading || refreshing}
            >
              <RefreshCw size={15} className={refreshing ? 'open-cash-spin' : undefined} /> Actualizar
            </button>
          </div>
        }
      />

      {feedback && (
        <div className={`open-cash-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.kind === 'error' ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {error && (
        <div className="panel open-cash-alert" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Barra de limpieza en lote de datos de prueba / turnos erróneos */}
      {bulkMode && canCleanupTests && (
        <section className="open-cash-bulk-bar" role="region" aria-label="Limpieza masiva de pruebas">
          <div>
            <strong>
              <FlaskConical size={15} /> Modo limpieza de pruebas y turnos erróneos
            </strong>
            <span>
              Marca cualquier turno abierto o cerrado (por ejemplo cajas de prueba o con fondo incorrecto). También puedes
              entrar a «Inspeccionar» para limpiar ventas de ejemplo dentro de un turno.
            </span>
          </div>
          <div className="open-cash-bulk-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                const allIds = [...visibleSessions, ...visibleClosedSessions].map((s) => s.id);
                setSelectedSessionIds((curr) => (curr.length === allIds.length ? [] : allIds));
              }}
            >
              <CheckSquare size={14} />{' '}
              {selectedSessionIds.length > 0 ? 'Desmarcar turnos' : 'Marcar turnos visibles'}
            </button>
            <button
              type="button"
              className="button ocm-btn-danger"
              disabled={!selectedSessionIds.length || !canDeleteCash}
              onClick={() =>
                setAdminDeleteTarget({
                  kind: 'bulk_test',
                  saleIds: [],
                  sessionIds: selectedSessionIds,
                })
              }
            >
              <Trash2 size={14} /> Eliminar {selectedSessionIds.length} turno(s)
            </button>
          </div>
        </section>
      )}

      {/* Barra Rápida de Apertura de Turno */}
      {showOpenBar && (
        <section className="open-cash-start-panel" aria-label="Iniciar nuevo turno de caja">
          <div className="open-cash-start-header">
            <div>
              <span className="eyebrow">APERTURA RÁPIDA DE TURNO</span>
              <h3>Iniciar nueva caja en el local</h3>
              <p>Selecciona sucursal, caja física y el fondo inicial en efectivo para comenzar a cobrar sin fricción.</p>
            </div>
            <button type="button" className="open-cash-start-dismiss" onClick={() => setShowOpenBar(false)} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          <form className="open-cash-start-form" onSubmit={handleStartShift}>
            <div className="open-cash-start-fields">
              <label>
                <span>Sucursal</span>
                <select value={activeBranchId} onChange={(e) => setNewShiftBranch(e.target.value)} required>
                  <option value="">Selecciona una sucursal</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              {canManageCash && (
                <label>
                  <span>Asesor / Responsable</span>
                  <select value={newShiftUser || user?.id || ''} onChange={(e) => setNewShiftUser(e.target.value)}>
                    <option value={user?.id || ''}>Mi usuario actual</option>
                    {team
                      .filter((m) => m.user_id !== user?.id)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {normalizePersonName(m.full_name || m.email || m.user_id.slice(0, 8))}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <label>
                <span>Caja física / punto</span>
                {branchRegisters.length > 0 ? (
                  <select
                    value={newShiftRegisterId}
                    onChange={(e) => setNewShiftRegisterId(e.target.value)}
                  >
                    <option value="">Caja libre / automática</option>
                    {branchRegisters.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Ej. Mostrador Principal o Caja 1"
                    value={newShiftRegisterName}
                    onChange={(e) => setNewShiftRegisterName(e.target.value)}
                  />
                )}
              </label>

              <div className="open-cash-start-opening">
                <label>
                  <span>Fondo inicial en efectivo</span>
                  <div className="open-cash-quick-presets" role="group" aria-label="Montos rápidos">
                    {[0, 20, 50, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        className={`preset-pill ${Number(newShiftOpening) === val ? 'is-selected' : ''}`}
                        onClick={() => applyQuickPreset(val)}
                      >
                        ${val}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={newShiftOpening}
                    onChange={(e) => setNewShiftOpening(e.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>
            </div>

            <div className="open-cash-start-actions">
              <button type="button" className="button button-outline" onClick={() => setShowOpenBar(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="button button-dark" disabled={busy || !activeBranchId}>
                {busy ? <LoaderCircle size={15} className="open-cash-spin" /> : <Check size={15} />}
                {busy ? 'Iniciando turno…' : 'Confirmar e iniciar caja'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* KPIs de Resumen */}
      <section className={`open-cash-overview ${!canViewAllCash ? 'personal' : ''}`} aria-label="Resumen de cajas abiertas">
        <article className="open-cash-stat">
          <span className="open-cash-stat-icon">
            <Coins size={19} />
          </span>
          <div>
            <small>{canViewAllCash ? 'Cajas abiertas ahora' : 'Tu caja abierta'}</small>
            <b>
              <NumberTicker value={visibleSessions.length} />
            </b>
            <span>{canViewAllCash ? `${activeBranchesCount} sucursales activas` : 'Lista para operar'}</span>
          </div>
        </article>
        <article className="open-cash-stat">
          <span className="open-cash-stat-icon">
            <Wallet size={19} />
          </span>
          <div>
            <small>Efectivo esperado en gavetas</small>
            <b>{money(totalExpectedLive)}</b>
            <span>Incluye base ({money(totalOpening)}) + cobros y movimientos</span>
          </div>
        </article>
        <article className="open-cash-stat">
          <span className="open-cash-stat-icon">
            <Banknote size={19} />
          </span>
          <div>
            <small>Ventas en efectivo (turnos vivos)</small>
            <b>{money(totalCashSalesLive)}</b>
            <span>Calculado directo desde sale_payments</span>
          </div>
        </article>
        {canViewAllCash && (
          <article className="open-cash-stat">
            <span className="open-cash-stat-icon">
              <Clock3 size={19} />
            </span>
            <div>
              <small>Cierres recientes · Bitácora</small>
              <b>
                <NumberTicker value={visibleClosedSessions.length} />
              </b>
              <span>Actualizado {lastUpdated}</span>
            </div>
          </article>
        )}
      </section>

      {/* Sección Principal: Turnos Abiertos */}
      <section className="panel open-cash-panel">
        <div className="open-cash-panel-heading">
          <div>
            <span className="eyebrow">{canViewAllCash ? 'TURNOS ACTIVOS EN SUCURSALES' : 'TU TURNO ACTIVO'}</span>
            <h2>{canManageCash ? 'Control de cajas en vivo' : 'Cajas abiertas y movimientos'}</h2>
            <p>
              Inspecciona ventas y cobros de cada caja en tiempo real, ajusta fondos iniciales o asignaciones, registra
              entradas/salidas y ejecuta arqueos ciegos o con diferencia auditada.
            </p>
          </div>
          {canManageCash && closableVisible.length > 0 && (
            <button
              type="button"
              className="button button-dark open-cash-close-all"
              onClick={() => openAllClose(closableVisible)}
              disabled={busy}
            >
              Cerrar todas <span>{closableVisible.length}</span>
            </button>
          )}
        </div>

        <div className="open-cash-toolbar">
          <div className="open-cash-filter-group">
            <label className="ocm-search-field">
              <span>Buscar caja, asesor o código</span>
              <div className="ocm-search-box">
                <Search size={14} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Nombre de caja, asesor o nota…"
                />
              </div>
            </label>

            {branches.length > 1 && (
              <label>
                <span>Sucursal</span>
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                  <option value="all">Todas las sucursales</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {canViewAllCash && activeAdvisorOptions.length > 1 && (
              <label>
                <span>Asesor</span>
                <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)}>
                  <option value="all">Todos los asesores</option>
                  {activeAdvisorOptions.map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <span className="open-cash-refresh-note">
            <Activity size={15} /> {visibleSessions.length} activas · {lastUpdated}
          </span>
        </div>

        {loading ? (
          <div className="open-cash-empty">
            <LoaderCircle size={26} className="open-cash-spin" />
            <span>Cargando turnos abiertos y telemetría de ventas…</span>
          </div>
        ) : visibleSessions.length === 0 ? (
          <div className="open-cash-empty">
            <span className="open-cash-empty-icon">
              <CheckCircle2 size={22} />
            </span>
            <b>
              {branchFilter === 'all' && !searchQuery
                ? 'No hay cajas abiertas en este momento'
                : 'No hay cajas abiertas para este filtro'}
            </b>
            <span>
              Puedes iniciar un nuevo turno usando el botón superior «Iniciar caja» o desde la pantalla del POS.
            </span>
          </div>
        ) : (
          <div className="open-cash-grid">
            {visibleSessions.map((session) => {
              const canCloseThis = canManageCash || (session.opened_by === user?.id && canCloseOwnCash);
              const canEditThis = canManageCash || session.opened_by === user?.id;
              const live = liveBreakdowns[session.id];
              const isChecked = selectedSessionIds.includes(session.id);

              return (
                <article className={`open-cash-card ${isChecked ? 'is-selected' : ''}`} key={session.id}>
                  <div className="open-cash-card-top">
                    <div className="open-cash-card-top-left">
                      {bulkMode && canDeleteCash && (
                        <input
                          type="checkbox"
                          className="ocm-card-checkbox"
                          aria-label={`Seleccionar turno ${shortId(session.id)}`}
                          checked={isChecked}
                          onChange={() => toggleBulkSession(session.id)}
                        />
                      )}
                      <span className="open-cash-state">
                        <i aria-hidden="true" /> ABIERTA
                      </span>
                    </div>
                    <span className="open-cash-id">#{shortId(session.id)}</span>
                  </div>
                  <h3>{registerName(session.cash_register_id)}</h3>
                  <p className="open-cash-branch">{branchName(session.branch_id)}</p>

                  <div className="open-cash-meta">
                    <span>Responsable</span>
                    <b>{openerName(session.opened_by)}</b>
                  </div>
                  <div className="open-cash-meta">
                    <span>Apertura</span>
                    <b>{dateTime(session.opened_at)}</b>
                  </div>

                  {/* Telemetría en vivo de la gaveta */}
                  <div className="open-cash-live-drawer-box">
                    <div className="ocm-drawer-row">
                      <span>Base inicial</span>
                      <b>{money(session.opening_cash)}</b>
                    </div>
                    {live && (
                      <>
                        <div className="ocm-drawer-row">
                          <span>Ventas ({live.sales_count || 0}) · Efectivo</span>
                          <b className="val-in">+{money(live.cash_sales_total)}</b>
                        </div>
                        {(live.movements_in > 0 || live.movements_out > 0) && (
                          <div className="ocm-drawer-row">
                            <span>Movimientos manuales</span>
                            <b>
                              +{money(live.movements_in)} / −{money(live.movements_out)}
                            </b>
                          </div>
                        )}
                        <div className="ocm-drawer-expected">
                          <span>Esperado en gaveta</span>
                          <b>{money(live.expected_cash)}</b>
                        </div>
                        {(live.transfer_sales_total > 0 || live.card_sales_total > 0) && (
                          <small className="ocm-drawer-noncash">
                            Transf: {money(live.transfer_sales_total)} · Tarjeta: {money(live.card_sales_total)}
                          </small>
                        )}
                      </>
                    )}
                  </div>

                  <div className="open-cash-card-actions">
                    <button
                      type="button"
                      className="button button-outline open-cash-inspect-btn"
                      onClick={() => setInspectorSessionId(session.id)}
                    >
                      <Eye size={14} /> Inspeccionar y ventas ({live?.sales_count ?? 0})
                    </button>
                    <div className="open-cash-action-subrow">
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() => void openMovementsModal(session)}
                        disabled={busy}
                      >
                        <ArrowUpDown size={14} /> Movimientos
                      </button>
                      {canEditThis && (
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() => openEditSessionModal(session)}
                          disabled={busy}
                        >
                          <Edit3 size={14} /> Editar turno
                        </button>
                      )}
                    </div>
                    <div className="open-cash-action-bottom-row">
                      {canCloseThis && (
                        <button
                          type="button"
                          className="button button-dark open-cash-close-one"
                          onClick={() => void openSingleClose(session)}
                          disabled={busy}
                        >
                          Arqueo y cierre
                        </button>
                      )}
                      {canDeleteCash && (
                        <button
                          type="button"
                          className="button ocm-btn-danger-outline"
                          onClick={() => openSessionDeleteModal(session)}
                          disabled={busy}
                          title="Eliminar turno de caja (con opción de borrar ventas en cascada)"
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Sección Secundaria: Historial de Cierres Recientes */}
      <section className="panel open-cash-history-section">
        <div className="open-cash-panel-heading">
          <div>
            <span className="eyebrow">AUDITORÍA Y HISTORIAL RECIENTE</span>
            <h2>Últimos turnos cerrados</h2>
            <p>
              Revisa cuadres finalizados, ventas vinculadas, inspecciona diferencias, ajusta montos o elimina turnos de
              prueba que distorsionen tus métricas.
            </p>
          </div>
          <label className="ocm-discrepancy-toggle">
            <input
              type="checkbox"
              checked={onlyDiscrepancies}
              onChange={(e) => setOnlyDiscrepancies(e.target.checked)}
            />
            <span>Solo turnos con diferencia</span>
          </label>
        </div>

        {visibleClosedSessions.length === 0 ? (
          <p className="open-cash-history-empty">
            {onlyDiscrepancies
              ? 'No se encontraron cierres recientes con diferencia de efectivo.'
              : 'Aún no hay cierres registrados recientemente para este filtro.'}
          </p>
        ) : (
          <div className="open-cash-history-grid">
            {visibleClosedSessions.map((closed) => {
              const exp = Number(closed.expected_cash) || 0;
              const cnt = Number(closed.counted_cash) || 0;
              const diff = Number(closed.difference) || 0;
              const diffState = Math.abs(diff) < 0.01 ? 'exact' : diff > 0 ? 'surplus' : 'shortfall';
              const isChecked = selectedSessionIds.includes(closed.id);
              const salesCnt = closedSalesCounts[closed.id] ?? 0;

              return (
                <article className={`open-cash-history-card ${isChecked ? 'is-selected' : ''}`} key={closed.id}>
                  <header className="open-cash-history-card-header">
                    <div className="ocm-history-title-wrap">
                      {bulkMode && canDeleteCash && (
                        <input
                          type="checkbox"
                          className="ocm-card-checkbox"
                          aria-label={`Seleccionar cierre ${shortId(closed.id)}`}
                          checked={isChecked}
                          onChange={() => toggleBulkSession(closed.id)}
                        />
                      )}
                      <div>
                        <b>{registerName(closed.cash_register_id)}</b>
                        <span>{branchName(closed.branch_id)}</span>
                      </div>
                    </div>
                    <span className={`open-cash-diff-tag ${diffState}`}>
                      {diffState === 'exact'
                        ? 'Cuadre Exacto'
                        : diff > 0
                        ? `Sobrante +${money(diff)}`
                        : `Faltante ${money(diff)}`}
                    </span>
                  </header>

                  <div className="open-cash-history-meta">
                    <div>
                      <small>Cajero</small>
                      <span>{openerName(closed.opened_by)}</span>
                    </div>
                    <div>
                      <small>Cerrado por</small>
                      <span>{closed.closed_by ? openerName(closed.closed_by) : 'Sistema'}</span>
                    </div>
                  </div>

                  <div className="open-cash-history-dates">
                    <small>
                      Cerrado: {closed.closed_at ? dateTime(closed.closed_at) : '—'} · Ventas: <b>{salesCnt}</b>
                    </small>
                  </div>

                  <div className="open-cash-history-metrics">
                    <div>
                      <small>Fondo</small>
                      <b>{money(closed.opening_cash)}</b>
                    </div>
                    <div>
                      <small>Esperado</small>
                      <b>{money(exp)}</b>
                    </div>
                    <div>
                      <small>Contado</small>
                      <b>{money(cnt)}</b>
                    </div>
                    <div>
                      <small>Diferencia</small>
                      <b className={`diff-val ${diffState}`}>
                        {diff > 0 ? '+' : ''}
                        {money(diff)}
                      </b>
                    </div>
                  </div>

                  {closed.closing_note && <p className="open-cash-history-note">{closed.closing_note}</p>}

                  <div className="open-cash-history-actions-grid">
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => setInspectorSessionId(closed.id)}
                    >
                      <Eye size={13} /> Inspeccionar ({salesCnt})
                    </button>
                    {canManageCash && (
                      <>
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() => openEditClosedModal(closed)}
                        >
                          <Edit3 size={13} /> Editar arqueo
                        </button>
                        <button
                          type="button"
                          className="button button-outline"
                          onClick={() => setReopeningSession(closed)}
                        >
                          <RotateCcw size={13} /> Reabrir
                        </button>
                      </>
                    )}
                    {canDeleteCash && (
                      <button
                        type="button"
                        className="button ocm-btn-danger-outline"
                        onClick={() => openSessionDeleteModal(closed)}
                      >
                        <Trash2 size={13} /> Eliminar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* DIALOG 1: ARQUEO, CONTEO DE BILLETES/MONEDAS Y DESGLOSE DE CIERRE */}
      <dialog
        ref={dialogRef}
        className="open-cash-dialog open-cash-reconcile-dialog"
        aria-labelledby="open-cash-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setDialog(null);
        }}
      >
        {dialog && (
          <form onSubmit={submitClose}>
            <header className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <AlertTriangle size={20} />
              </span>
              <div>
                <span className="eyebrow">
                  {dialog.mode === 'single' ? 'ARQUEO Y CIERRE DE CAJA' : 'CIERRE MASIVO DE TURNOS'}
                </span>
                <h2 id="open-cash-dialog-title">
                  {dialog.mode === 'single'
                    ? 'Verificar efectivo y cerrar caja'
                    : `Cerrar ${dialog.sessions.length} cajas abiertas`}
                </h2>
              </div>
              <button
                type="button"
                className="open-cash-dialog-dismiss"
                onClick={() => !busy && setDialog(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </header>

            <p className="open-cash-dialog-copy">
              {canManageCash
                ? 'Cuenta el efectivo físico de la gaveta, compara contra lo esperado y anota observaciones antes de confirmar.'
                : 'Ingresa el efectivo físico contado en tu gaveta y agrega cualquier novedad de cierre.'}
            </p>

            {closeResults.length > 0 && (
              <ul className="open-cash-close-results" aria-label="Resultado del cierre">
                {closeResults.map((result) => (
                  <li key={result.sessionId} className={result.success ? 'ok' : 'fail'}>
                    <b>{result.label}</b>
                    <span>{result.message}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="open-cash-count-list">
              {dialog.sessions.map((session) => {
                const draft = drafts[session.id] || { counted: '', note: '' };
                const expected = expectedAmounts[session.id];
                const bd = breakdowns[session.id];
                const countedNum = countIsValid(draft.counted) ? Number(draft.counted) : null;
                const diffLive =
                  countedNum !== null && expected?.amount !== null && expected?.amount !== undefined
                    ? Math.round((countedNum - expected.amount) * 100) / 100
                    : null;

                return (
                  <div className="open-cash-count-item" key={session.id}>
                    <header>
                      <div>
                        <b>{sessionLabel(session)}</b>
                        <span>
                          {openerName(session.opened_by)} · Apertura {dateTime(session.opened_at)}
                        </span>
                      </div>
                      <span className="open-cash-id">#{shortId(session.id)}</span>
                    </header>

                    {dialog.mode === 'single' && canManageCash && (
                      <div className="open-cash-breakdown-card">
                        {expected?.loading ? (
                          <div className="breakdown-loading">
                            <LoaderCircle size={15} className="open-cash-spin" />
                            <span>Calculando desglose en vivo…</span>
                          </div>
                        ) : bd ? (
                          <>
                            <div className="breakdown-grid">
                              <div>
                                <small>Base inicial</small>
                                <b>{money(bd.opening_cash)}</b>
                              </div>
                              <div>
                                <small>+ Ventas efectivo</small>
                                <b className="val-in">+{money(bd.cash_sales_total)}</b>
                              </div>
                              <div>
                                <small>+ Entradas manuales</small>
                                <b className="val-in">+{money(bd.movements_in)}</b>
                              </div>
                              <div>
                                <small>− Retiros / Salidas</small>
                                <b className="val-out">−{money(bd.movements_out)}</b>
                              </div>
                              <div>
                                <small>Transferencias (Ref.)</small>
                                <span className="muted-val">{money(bd.transfer_sales_total)}</span>
                              </div>
                              <div>
                                <small>Tarjeta (Ref.)</small>
                                <span className="muted-val">{money(bd.card_sales_total)}</span>
                              </div>
                            </div>
                            <div className="breakdown-expected-bar">
                              <span>Efectivo esperado en gaveta:</span>
                              <b>{money(bd.expected_cash)}</b>
                            </div>
                          </>
                        ) : (
                          <div className="open-cash-expected-error">{expected?.error}</div>
                        )}
                      </div>
                    )}

                    {dialog.mode === 'single' && (
                      <div className="open-cash-denominations-section">
                        <button
                          type="button"
                          className="open-cash-toggle-denoms-btn"
                          onClick={() => setShowDenominations((v) => !v)}
                        >
                          <Banknote size={15} />{' '}
                          {showDenominations
                            ? 'Ocultar contador de billetes y monedas'
                            : 'Usar calculadora rápida de billetes y monedas'}
                        </button>

                        {showDenominations && (
                          <div className="open-cash-denoms-accordion">
                            <div className="denoms-group">
                              <h4>Billetes</h4>
                              <div className="denoms-grid">
                                {BILL_DENOMINATIONS.map((b) => (
                                  <label key={b.value} className="denom-card">
                                    <span className="denom-label">{b.label}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                      value={denominations[String(b.value)] || ''}
                                      onChange={(e) =>
                                        updateDenomination(String(b.value), Number(e.target.value) || 0, session.id)
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="denoms-group">
                              <h4>Monedas</h4>
                              <div className="denoms-grid">
                                {COIN_DENOMINATIONS.map((c) => (
                                  <label key={c.value} className="denom-card">
                                    <span className="denom-label">{c.label}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      placeholder="0"
                                      value={denominations[String(c.value)] || ''}
                                      onChange={(e) =>
                                        updateDenomination(String(c.value), Number(e.target.value) || 0, session.id)
                                      }
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="button button-outline reset-denoms-btn"
                              onClick={() => resetDenominations(session.id)}
                            >
                              Limpiar conteo a $0.00
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="open-cash-count-fields">
                      <label>
                        Efectivo físico contado *
                        <span>
                          {canManageCash ? 'Escribe el total o usa el contador' : 'Suma total del dinero contado'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          placeholder="0.00"
                          value={draft.counted}
                          onChange={(event) => editDraft(session.id, 'counted', event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <label>
                        Nota de cierre (opcional)
                        <span>Observación del turno o justificación de diferencia</span>
                        <input
                          type="text"
                          value={draft.note}
                          onChange={(event) => editDraft(session.id, 'note', event.target.value)}
                          placeholder="Ej. Sin novedades / vuelto pendiente"
                          disabled={busy}
                        />
                      </label>
                    </div>

                    {diffLive !== null && canManageCash && (
                      <div
                        className={`open-cash-live-diff ${
                          Math.abs(diffLive) < 0.01 ? 'exact' : diffLive > 0 ? 'surplus' : 'shortfall'
                        }`}
                      >
                        <ShieldCheck size={16} />
                        {Math.abs(diffLive) < 0.01 ? (
                          <span>Cuadre exacto (Diferencia $0.00). Todo coincide perfectamente.</span>
                        ) : diffLive > 0 ? (
                          <span>Sobrante detectado de +{money(diffLive)} por encima de lo esperado.</span>
                        ) : (
                          <span>Faltante detectado de {money(diffLive)} respecto a lo esperado en gaveta.</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {dialog.mode === 'all' && (
              <label className="open-cash-bulk-confirm">
                <input
                  type="checkbox"
                  checked={confirmedAll}
                  onChange={(event) => setConfirmedAll(event.target.checked)}
                  disabled={busy}
                />
                <span>
                  Confirmo el conteo ingresado para cerrar {dialog.sessions.length} caja
                  {dialog.sessions.length === 1 ? '' : 's'} abierta
                  {dialog.sessions.length === 1 ? '' : 's'}.
                </span>
              </label>
            )}

            <footer className="open-cash-dialog-footer">
              <button
                type="button"
                className="button button-outline"
                onClick={() => setDialog(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="button button-dark"
                disabled={busy || (dialog.mode === 'all' && !confirmedAll)}
              >
                {busy
                  ? 'Cerrando turnos…'
                  : dialog.mode === 'single'
                  ? 'Confirmar y cerrar caja'
                  : `Cerrar ${dialog.sessions.length} cajas`}
              </button>
            </footer>
          </form>
        )}
      </dialog>

      {/* DIALOG 2: EDICIÓN COMPLETA DE TURNO ABIERTO */}
      <dialog
        ref={editDialogRef}
        className="open-cash-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setEditingSession(null);
        }}
      >
        {editingSession && (
          <form onSubmit={submitEditSession}>
            <header className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <Edit3 size={20} />
              </span>
              <div>
                <span className="eyebrow">AJUSTE ADMINISTRATIVO DEL TURNO</span>
                <h2>Editar turno abierto #{shortId(editingSession.id)}</h2>
              </div>
              <button type="button" className="open-cash-dialog-dismiss" onClick={() => setEditingSession(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>
            <div className="open-cash-modal-body">
              <p className="open-cash-dialog-copy-plain">
                Corrige si el asesor se equivocó al ingresar el fondo inicial, asigna o cambia la caja registradora, o
                transfiere la titularidad del turno abierto.
              </p>
              <label>
                <span>Fondo inicial en efectivo ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editOpeningCash}
                  onChange={(e) => setEditOpeningCash(e.target.value)}
                />
              </label>
              <label>
                <span>Caja física asociada</span>
                <select value={editRegisterId} onChange={(e) => setEditRegisterId(e.target.value)}>
                  <option value="">Sin caja registradora fija</option>
                  {registers
                    .filter((r) => r.branch_id === editingSession.branch_id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              {canManageCash && (
                <label>
                  <span>Responsable del turno</span>
                  <select value={editOpenedBy} onChange={(e) => setEditOpenedBy(e.target.value)}>
                    <option value={editingSession.opened_by}>{openerName(editingSession.opened_by)}</option>
                    {team
                      .filter((m) => m.user_id !== editingSession.opened_by)
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {normalizePersonName(m.full_name || m.email || m.user_id.slice(0, 8))}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                <span>Motivo de auditoría *</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={editOpenReason}
                  onChange={(e) => setEditOpenReason(e.target.value)}
                  placeholder="Ej: Asesor digitó mal la base al abrir"
                />
              </label>
            </div>
            <footer className="open-cash-dialog-footer">
              <button type="button" className="button button-outline" onClick={() => setEditingSession(null)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="button button-dark" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </footer>
          </form>
        )}
      </dialog>

      {/* DIALOG 3: GESTIÓN DE MOVIMIENTOS */}
      <dialog
        ref={moveDialogRef}
        className="open-cash-dialog open-cash-movements-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setMovementSession(null);
        }}
      >
        {movementSession && (
          <div>
            <header className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <ArrowUpDown size={20} />
              </span>
              <div>
                <span className="eyebrow">ENTRADAS Y RETIROS MANUALES</span>
                <h2>Movimientos · {registerName(movementSession.cash_register_id)}</h2>
              </div>
              <button type="button" className="open-cash-dialog-dismiss" onClick={() => setMovementSession(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>

            <div className="open-cash-movements-body">
              <form className="open-cash-new-move-form" onSubmit={submitNewMovement}>
                <h3>Registrar nuevo movimiento</h3>
                <div className="open-cash-direction-toggle">
                  <button
                    type="button"
                    className={`direction-btn in ${moveDirection === 'in' ? 'active' : ''}`}
                    onClick={() => setMoveDirection('in')}
                  >
                    <ArrowDownToLine size={15} /> + Entrada de dinero
                  </button>
                  <button
                    type="button"
                    className={`direction-btn out ${moveDirection === 'out' ? 'active' : ''}`}
                    onClick={() => setMoveDirection('out')}
                  >
                    <ArrowUpFromLine size={15} /> − Salida o retiro
                  </button>
                </div>
                <div className="open-cash-move-fields">
                  <label>
                    <span>Monto ($)</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={moveAmount}
                      onChange={(e) => setMoveAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Motivo / concepto *</span>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Sencillo para cambio, compra de insumos, pago mensajería"
                      value={moveReason}
                      onChange={(e) => setMoveReason(e.target.value)}
                    />
                  </label>
                </div>
                <button type="submit" className="button button-dark" disabled={busy}>
                  <Plus size={14} /> {busy ? 'Guardando…' : 'Agregar movimiento'}
                </button>
              </form>

              <div className="open-cash-movements-list">
                <h3>Movimientos del turno ({movements.length})</h3>
                {loadingMovements ? (
                  <p>Cargando movimientos…</p>
                ) : movements.length === 0 ? (
                  <p className="muted-empty">No hay movimientos registrados en este turno todavía.</p>
                ) : (
                  <ul>
                    {movements.map((move) => {
                      const isVoided = move.voided || move.status === 'voided';
                      const isEditingThis = editingMove?.id === move.id;

                      return (
                        <li key={move.id} className={`move-item ${move.direction} ${isVoided ? 'is-voided' : ''}`}>
                          {isEditingThis ? (
                            <form className="move-edit-inline-form" onSubmit={submitEditMovement}>
                              <div className="move-edit-inputs">
                                <select
                                  value={editMoveDirection}
                                  onChange={(e) => setEditMoveDirection(e.target.value as 'in' | 'out')}
                                >
                                  <option value="in">+ Entrada</option>
                                  <option value="out">− Salida</option>
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
                                />
                              </div>
                              <div className="move-edit-actions">
                                <button type="submit" className="button button-dark" disabled={busy}>
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  className="button button-outline"
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
                                  {move.direction === 'in' ? '+ Entrada' : '− Salida'}
                                </span>
                                <b>{money(move.amount)}</b>
                                <span className="move-reason">
                                  {move.reason}
                                  {isVoided ? ' (ANULADO)' : ''}
                                </span>
                                {move.created_at && <span className="move-time">{dateTime(move.created_at)}</span>}
                              </div>
                              {!isVoided && (
                                <div className="move-actions">
                                  <button
                                    type="button"
                                    className="button-icon-subtle"
                                    title="Editar"
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
                                    title="Anular"
                                    onClick={() => void voidMovement(move)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <footer className="open-cash-dialog-footer">
              <button type="button" className="button button-outline" onClick={() => setMovementSession(null)}>
                Cerrar ventana
              </button>
            </footer>
          </div>
        )}
      </dialog>

      {/* DIALOG 4: REABRIR TURNO CERRADO */}
      <dialog
        ref={reopenDialogRef}
        className="open-cash-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setReopeningSession(null);
        }}
      >
        {reopeningSession && (
          <form onSubmit={submitReopenSession}>
            <header className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <RotateCcw size={20} />
              </span>
              <div>
                <span className="eyebrow">REAPERTURA AUDITADA</span>
                <h2>Reabrir caja cerrada #{shortId(reopeningSession.id)}</h2>
              </div>
              <button type="button" className="open-cash-dialog-dismiss" onClick={() => setReopeningSession(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>
            <div className="open-cash-modal-body">
              <p className="open-cash-dialog-copy-plain">
                Al reabrir esta caja volverá a aparecer como turno activo para corregir el conteo, agregar cobros o
                registrar movimientos olvidados.
              </p>
              <label>
                <span>Motivo de la reapertura *</span>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ej. Faltó ingresar un comprobante de retiro o error en el conteo"
                />
              </label>
            </div>
            <footer className="open-cash-dialog-footer">
              <button type="button" className="button button-outline" onClick={() => setReopeningSession(null)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="button button-dark" disabled={busy}>
                {busy ? 'Reabriendo…' : 'Confirmar reapertura'}
              </button>
            </footer>
          </form>
        )}
      </dialog>

      {/* DIALOG 5: EDICIÓN DE ARQUEO EN TURNO CERRADO */}
      <dialog
        ref={editClosedDialogRef}
        className="open-cash-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setEditingClosedSession(null);
        }}
      >
        {editingClosedSession && (
          <form onSubmit={submitEditClosed}>
            <header className="open-cash-dialog-heading">
              <span className="open-cash-dialog-icon">
                <Edit3 size={20} />
              </span>
              <div>
                <span className="eyebrow">EDICIÓN DE HISTORIAL CERRADO</span>
                <h2>Ajustar arqueo #{shortId(editingClosedSession.id)}</h2>
              </div>
              <button type="button" className="open-cash-dialog-dismiss" onClick={() => setEditingClosedSession(null)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>
            <div className="open-cash-modal-body">
              <label>
                <span>Fondo inicial ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editClosedOpening}
                  onChange={(e) => setEditClosedOpening(e.target.value)}
                />
              </label>
              <label>
                <span>Efectivo físico contado ($)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editClosedCounted}
                  onChange={(e) => setEditClosedCounted(e.target.value)}
                />
              </label>
              <label>
                <span>Nota u observación de cierre</span>
                <input
                  type="text"
                  value={editClosedNote}
                  onChange={(e) => setEditClosedNote(e.target.value)}
                  placeholder="Observación actualizada..."
                />
              </label>
              <label>
                <span>Motivo del ajuste de auditoría *</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={editClosedReason}
                  onChange={(e) => setEditClosedReason(e.target.value)}
                  placeholder="Ej: Corrección de monto contado al validar billetes"
                />
              </label>
            </div>
            <footer className="open-cash-dialog-footer">
              <button type="button" className="button button-outline" onClick={() => setEditingClosedSession(null)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className="button button-dark" disabled={busy}>
                {busy ? 'Actualizando…' : 'Guardar ajuste'}
              </button>
            </footer>
          </form>
        )}
      </dialog>

      {/* MODALES NUEVOS CONECTADOS: INSPECTOR, CAJAS REGISTRADORAS, BITÁCORA Y ELIMINACIÓN */}
      <CashSessionInspectorModal
        open={Boolean(inspectorSessionId)}
        sessionId={inspectorSessionId}
        organizationId={organizationId || ''}
        canManageCash={canManageCash}
        canEditSales={canCloseOwnCash}
        canDeleteSales={canDeleteSales}
        canDeleteCash={canDeleteCash}
        onOpenChange={(isOpen) => {
          if (!isOpen) setInspectorSessionId(null);
        }}
        onEditSession={(sid) => {
          const found = sessions.find((s) => s.id === sid);
          if (found) {
            setInspectorSessionId(null);
            openEditSessionModal(found);
          }
        }}
        onCloseOrReopenSession={(sid, status) => {
          setInspectorSessionId(null);
          if (status === 'open') {
            const found = sessions.find((s) => s.id === sid);
            if (found) void openSingleClose(found);
          } else {
            const found = closedSessions.find((s) => s.id === sid);
            if (found) setReopeningSession(found);
          }
        }}
        onDeleteSession={openSessionDeleteFromInspector}
        onDataChanged={async (msg) => {
          if (msg) setFeedback({ kind: 'success', message: msg });
          await loadOpenSessions(true);
        }}
      />

      <CashRegisterControlDrawer
        open={registerDrawerOpen}
        organizationId={organizationId || ''}
        branches={branches}
        team={team}
        openRegisterIds={openRegisterIds}
        canManageRegisters={canManageRegisters}
        canDeleteCash={canDeleteCash}
        onOpenChange={setRegisterDrawerOpen}
        onChanged={async (msg) => {
          setFeedback({ kind: 'success', message: msg });
          await loadOpenSessions(true);
        }}
      />

      <AdminDeletionAuditDrawer
        open={auditDrawerOpen}
        organizationId={organizationId || ''}
        onOpenChange={setAuditDrawerOpen}
      />

      <AdminDeleteRecordModal
        open={Boolean(adminDeleteTarget)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setAdminDeleteTarget(null);
        }}
        target={adminDeleteTarget}
        onDeleted={async (msg) => {
          setFeedback({ kind: 'success', message: msg });
          setSelectedSessionIds([]);
          setBulkMode(false);
          await loadOpenSessions(true);
        }}
      />
    </AppFrame>
  );
}
