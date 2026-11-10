import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Award,
  BadgeDollarSign,
  Banknote,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  ContactRound,
  Edit3,
  FileText,
  History,
  Link2,
  Mail,
  Percent,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Unlink,
  UserCheck,
  UserRound,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from './ui/Avatar';
import { supabase } from '../lib/supabaseClient';
import { normalizePersonName } from '../lib/personName';
import './personnel.css';

type PersonnelRecord = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  job_title: string;
  status: 'active' | 'inactive';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};
type PersonnelEvent = {
  id: number;
  event_key: string;
  summary: string;
  changed_fields: string[];
  salary_sensitive: boolean;
  actor_label: string;
  created_at: string;
};
type Compensation = {
  id: string;
  amount: number;
  currency_code: string;
  pay_period: string;
  effective_date: string;
  note: string;
  created_at: string;
  created_by: string;
};
type PayrollDeduction = {
  id: string;
  description: string;
  amount: number;
  payroll_period: string;
  status: string;
  authorization_reference: string;
  evidence_reference: string;
  payroll_handoff_reference: string;
  payroll_handed_at: string | null;
  created_at: string;
  reviewed_at: string | null;
};
type RecordDraft = Pick<
  PersonnelRecord,
  'full_name' | 'email' | 'phone' | 'department' | 'job_title' | 'status' | 'start_date' | 'end_date'
>;
type GoogleAccount = {
  user_id: string;
  email: string;
  full_name: string;
  last_sign_in_at: string | null;
  linked_personnel_id: string | null;
  linked_personnel_name: string | null;
  roles: string[];
  access_profiles: string[];
  access_active: boolean;
  avatar_url?: string | null;
};

type AttendanceStatus = 'presente' | 'tardanza' | 'falta' | 'permiso' | 'vacaciones' | 'remoto';
type AttendanceEntry = {
  id: string;
  personnel_id: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  check_in: string;
  check_out: string;
  late_minutes: number;
  note: string;
  updated_at: string;
};

const ATTENDANCE_LABELS: Record<AttendanceStatus, { label: string; tone: string }> = {
  presente: { label: 'Presente a tiempo', tone: 'presente' },
  tardanza: { label: 'Atraso registrado', tone: 'tardanza' },
  falta: { label: 'Falta injustificada', tone: 'falta' },
  permiso: { label: 'Permiso justificado', tone: 'permiso' },
  vacaciones: { label: 'Vacaciones', tone: 'vacaciones' },
  remoto: { label: 'Campo / Instalación', tone: 'remoto' },
};

const DEDUCTION_PRESETS = [
  'Anticipo de quincena / sueldo',
  'Préstamo interno autorizado',
  'Descuento por atrasos / inasistencia',
  'Reposición de material o merma',
  'Consumo o pedido personal en tienda',
];

const DEPARTMENT_SUGGESTIONS = [
  'Comercial y POS',
  'Diseño Gráfico',
  'Impresión y Gran Formato',
  'Taller y Acabados',
  'Sublimación y Corte Láser',
  'Instalaciones en Sitio',
  'Administración y Finanzas',
];

const emptyDraft: RecordDraft = {
  full_name: '',
  email: '',
  phone: '',
  department: '',
  job_title: '',
  status: 'active',
  start_date: '',
  end_date: '',
};
const fieldLabels: Record<string, string> = {
  full_name: 'nombre',
  email: 'correo',
  phone: 'teléfono',
  department: 'área',
  job_title: 'cargo',
  status: 'estado',
  start_date: 'fecha de ingreso',
  end_date: 'fecha de salida',
  google_account: 'cuenta Google',
};
const dateLabel = (value?: string | null) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const dateTimeLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const payrollPeriodLabel = (value: string) =>
  new Date(`${value.slice(0, 7)}-01T12:00:00`).toLocaleDateString('es-EC', { year: 'numeric', month: 'long' });
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'No se pudo completar la operación.');
const formatUsd = (amount: number) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
const formatCompensation = (item: Compensation) => {
  try {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: item.currency_code }).format(Number(item.amount));
  } catch {
    return `${Number(item.amount).toFixed(2)} ${item.currency_code}`;
  }
};

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PersonnelPage() {
  const { search } = useLocation();
  const { organizationId, user, roles, hasPermission } = useAuth();
  const canEdit = hasPermission('personnel', 'edit');
  const canManageTeam = hasPermission('team', 'manage_members');
  const canLinkAccount = canEdit && canManageTeam;
  const canViewCompensation = hasPermission('personnel', 'view_compensation');
  const canEditCompensation = hasPermission('personnel', 'edit_compensation');
  const canManageDeductions =
    canEditCompensation || hasPermission('finance', 'manage_finance') || roles.includes('owner') || roles.includes('admin');

  const [records, setRecords] = useState<PersonnelRecord[]>([]);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(search).get('ficha') || '');
  const [detailTab, setDetailTab] = useState<'ficha' | 'salarios' | 'asistencia' | 'metricas'>('ficha');
  const [events, setEvents] = useState<PersonnelEvent[]>([]);
  const [compensation, setCompensation] = useState<Compensation[]>([]);
  const [payrollDeductions, setPayrollDeductions] = useState<PayrollDeduction[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [googleAccountsLoaded, setGoogleAccountsLoaded] = useState(false);
  const [accessProfiles, setAccessProfiles] = useState<any[]>([]);
  const [accountUserId, setAccountUserId] = useState('');
  const [accountProfileId, setAccountProfileId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [googleLinkFilter, setGoogleLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountListLoading, setAccountListLoading] = useState(false);
  const [newGoogleAccountId, setNewGoogleAccountId] = useState('');
  const [newGoogleProfileId, setNewGoogleProfileId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PersonnelRecord | null>(null);
  const [draft, setDraft] = useState<RecordDraft>(emptyDraft);
  const [salaryDraft, setSalaryDraft] = useState({
    amount: '',
    currency_code: 'USD',
    pay_period: 'Mensual',
    effective_date: todayIso(),
    note: '',
  });

  // Payroll deduction creation & filter state
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(currentMonthIso());
  const [deductionStatusFilter, setDeductionStatusFilter] = useState('all');
  const [deductionDraft, setDeductionDraft] = useState({
    description: '',
    amount: '',
    payroll_period: currentMonthIso(),
    authorization_reference: '',
    evidence_reference: '',
  });

  // Attendance state (persisted per organization in localStorage + synced to UI)
  const attendanceStorageKey = `vc_personnel_attendance_v1_${organizationId || 'default'}`;
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([]);
  const [attendanceMonth, setAttendanceMonth] = useState(currentMonthIso());
  const [attendanceDraft, setAttendanceDraft] = useState<{
    date: string;
    status: AttendanceStatus;
    check_in: string;
    check_out: string;
    late_minutes: string;
    note: string;
  }>({
    date: todayIso(),
    status: 'presente',
    check_in: '08:30',
    check_out: '17:30',
    late_minutes: '0',
    note: '',
  });

  // Organizational operational data for Worker Metrics (Sales, Quotes, Workshop)
  const [orgSales, setOrgSales] = useState<any[]>([]);
  const [orgQuotes, setOrgQuotes] = useState<any[]>([]);
  const [orgProduction, setOrgProduction] = useState<any[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(attendanceStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setAttendanceEntries(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [attendanceStorageKey]);

  const saveAttendanceList = useCallback(
    (next: AttendanceEntry[]) => {
      setAttendanceEntries(next);
      try {
        window.localStorage.setItem(attendanceStorageKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    [attendanceStorageKey],
  );

  // Sync URL ?ficha= parameter if navigated from TeamAccess
  useEffect(() => {
    const paramFicha = new URLSearchParams(search).get('ficha');
    if (paramFicha && records.some((r) => r.id === paramFicha)) {
      setSelectedId(paramFicha);
    }
  }, [search, records]);

  const loadRecords = useCallback(
    async (preferredId?: string) => {
      if (!supabase || !organizationId) {
        setRecords([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const { data, error: resultError } = await supabase
          .from('personnel_records')
          .select('id,organization_id,full_name,email,phone,department,job_title,status,start_date,end_date,created_at,updated_at')
          .eq('organization_id', organizationId)
          .order('full_name');
        if (resultError) throw resultError;
        const rows = ((data || []) as PersonnelRecord[]).map((row) => ({ ...row, full_name: normalizePersonName(row.full_name) }));
        setRecords(rows);
        setSelectedId((current) => {
          const urlFicha = new URLSearchParams(window.location.search).get('ficha');
          const wanted = preferredId || urlFicha || current;
          return rows.some((row) => row.id === wanted) ? wanted : rows[0]?.id || '';
        });
      } catch (loadError) {
        setError(errorText(loadError));
      } finally {
        setLoading(false);
      }
    },
    [organizationId],
  );

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const loadGoogleAccounts = useCallback(async () => {
    if (!supabase || !canLinkAccount) {
      setGoogleAccounts([]);
      setAccessProfiles([]);
      setGoogleAccountsLoaded(false);
      setGoogleLinkFilter('all');
      return;
    }
    setGoogleAccountsLoaded(false);
    setAccountListLoading(true);
    try {
      const [accountsResult, profilesResult] = await Promise.all([
        supabase.rpc('list_visualcorp_personnel_accounts_with_avatars'),
        supabase.rpc('list_visualcorp_personnel_access_profiles'),
      ]);
      if (accountsResult.error) {
        setError(accountsResult.error.message);
        return;
      }
      if (profilesResult.error) {
        setError(profilesResult.error.message);
        return;
      }
      setGoogleAccounts(
        ((accountsResult.data || []) as GoogleAccount[]).map((account) => ({
          ...account,
          full_name: normalizePersonName(account.full_name),
          linked_personnel_name: normalizePersonName(account.linked_personnel_name),
        })),
      );
      setAccessProfiles(profilesResult.data || []);
      setGoogleAccountsLoaded(true);
    } catch (loadError) {
      setError(errorText(loadError));
    } finally {
      setAccountListLoading(false);
    }
  }, [canLinkAccount]);

  useEffect(() => {
    void loadGoogleAccounts();
  }, [loadGoogleAccounts]);

  // Load operational datasets for Worker Performance Metrics
  useEffect(() => {
    if (!supabase || !organizationId) return;
    let active = true;
    setMetricsLoading(true);
    Promise.all([
      supabase
        .from('sales')
        .select('id,sale_number,customer_name,subtotal,discount_total,discount_reason,total,paid_total,balance_due,status,sold_by,created_by,sold_at')
        .eq('organization_id', organizationId)
        .order('sold_at', { ascending: false })
        .limit(400),
      supabase
        .from('central_quotes')
        .select('id,quote_code,customer_name,status,selected_mode,totals,created_by,created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('production_orders')
        .select('id,order_code,title,stage,status,assigned_to,responsible_name,created_at,updated_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(300),
    ])
      .then(([salesRes, quotesRes, prodRes]) => {
        if (!active) return;
        setOrgSales(salesRes.data || []);
        setOrgQuotes(quotesRes.data || []);
        setOrgProduction(prodRes.data || []);
      })
      .catch(() => {
        // non-blocking for personnel view
      })
      .finally(() => {
        if (active) setMetricsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!supabase || !organizationId || !selectedId) {
      setEvents([]);
      setCompensation([]);
      setPayrollDeductions([]);
      return;
    }
    let active = true;
    const loadDetail = async () => {
      setDetailLoading(true);
      setError('');
      try {
        const requests: any[] = [
          supabase
            .from('personnel_events')
            .select('id,event_key,summary,changed_fields,salary_sensitive,actor_label,created_at')
            .eq('organization_id', organizationId)
            .eq('personnel_id', selectedId)
            .order('created_at', { ascending: false })
            .limit(80),
        ];
        if (canViewCompensation)
          requests.push(
            supabase
              .from('personnel_compensation_history')
              .select('id,amount,currency_code,pay_period,effective_date,note,created_at,created_by')
              .eq('organization_id', organizationId)
              .eq('personnel_id', selectedId)
              .order('effective_date', { ascending: false })
              .limit(40),
          );
        if (canViewCompensation)
          requests.push(
            supabase
              .from('finance_payroll_deductions')
              .select(
                'id,description,amount,payroll_period,status,authorization_reference,evidence_reference,payroll_handoff_reference,payroll_handed_at,created_at,reviewed_at',
              )
              .eq('organization_id', organizationId)
              .eq('personnel_id', selectedId)
              .order('payroll_period', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(80),
          );
        const results = await Promise.all(requests);
        const eventResult = results[0];
        if (eventResult.error) throw eventResult.error;
        const payResult = canViewCompensation ? results[1] : null;
        if (payResult?.error) throw payResult.error;
        const deductionResult = canViewCompensation ? results[2] : null;
        if (deductionResult?.error) throw deductionResult.error;
        if (!active) return;
        setEvents((eventResult.data || []) as PersonnelEvent[]);
        setCompensation((payResult?.data || []) as Compensation[]);
        setPayrollDeductions((deductionResult?.data || []) as PayrollDeduction[]);
      } catch (loadError) {
        if (active) setError(errorText(loadError));
      } finally {
        if (active) setDetailLoading(false);
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [organizationId, selectedId, canViewCompensation]);

  const departments = useMemo(
    () => [...new Set(records.map((record) => record.department.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [records],
  );
  const linkedGooglePersonnelIds = useMemo(
    () => new Set(googleAccounts.flatMap((account) => (account.linked_personnel_id ? [account.linked_personnel_id] : []))),
    [googleAccounts],
  );
  const canFilterGoogleAccounts = canLinkAccount && googleAccountsLoaded;
  const effectiveGoogleLinkFilter = canFilterGoogleAccounts ? googleLinkFilter : 'all';
  const filteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const matchesQuery = `${record.full_name} ${record.email} ${record.phone} ${record.department} ${record.job_title}`
          .toLocaleLowerCase('es')
          .includes(query.trim().toLocaleLowerCase('es'));
        const hasGoogleLink = linkedGooglePersonnelIds.has(record.id);
        return (
          matchesQuery &&
          (statusFilter === 'all' || record.status === statusFilter) &&
          (departmentFilter === 'all' || record.department === departmentFilter) &&
          (effectiveGoogleLinkFilter === 'all' || (effectiveGoogleLinkFilter === 'linked' ? hasGoogleLink : !hasGoogleLink))
        );
      }),
    [records, query, statusFilter, departmentFilter, effectiveGoogleLinkFilter, linkedGooglePersonnelIds],
  );
  useEffect(() => {
    if (!canFilterGoogleAccounts || effectiveGoogleLinkFilter === 'all' || !filteredRecords.length) return;
    if (!filteredRecords.some((record) => record.id === selectedId)) setSelectedId(filteredRecords[0].id);
  }, [canFilterGoogleAccounts, effectiveGoogleLinkFilter, filteredRecords, selectedId]);
  const hasActivePersonnelFilters = Boolean(
    query.trim() || statusFilter !== 'all' || departmentFilter !== 'all' || googleLinkFilter !== 'all',
  );
  const selected =
    filteredRecords.find((record) => record.id === selectedId) ||
    (effectiveGoogleLinkFilter === 'all' ? records.find((record) => record.id === selectedId) : null) ||
    null;
  const activeCount = records.filter((record) => record.status === 'active').length;
  const linkedAccount = googleAccounts.find((account) => account.linked_personnel_id === selected?.id) || null;
  const chosenAccount = googleAccounts.find((account) => account.user_id === accountUserId) || null;

  // Today's global attendance summary
  const todayAttendanceStats = useMemo(() => {
    const today = todayIso();
    const todayRows = attendanceEntries.filter((e) => e.date === today);
    const presentCount = todayRows.filter((e) => e.status === 'presente' || e.status === 'remoto').length;
    const lateCount = todayRows.filter((e) => e.status === 'tardanza').length;
    const absentOrLeaveCount = todayRows.filter((e) => e.status === 'falta' || e.status === 'permiso' || e.status === 'vacaciones').length;
    return { todayRows, presentCount, lateCount, absentOrLeaveCount };
  }, [attendanceEntries]);

  // Selected worker's compensation & net salary calculation
  const salarySummary = useMemo(() => {
    const latestComp = compensation[0] || null;
    const baseSalary = latestComp ? Number(latestComp.amount) || 0 : 0;
    const periodDeductions = payrollDeductions.filter(
      (d) => d.payroll_period.slice(0, 7) === selectedPayrollMonth && d.status !== 'cancelled',
    );
    const totalDeductionsMonth = periodDeductions.reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
    const authorizedDeductionsMonth = periodDeductions
      .filter((d) => d.status !== 'pending_authorization')
      .reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
    const pendingDeductionsMonth = periodDeductions
      .filter((d) => d.status === 'pending_authorization')
      .reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
    const estimatedNetPay = Math.max(0, baseSalary - totalDeductionsMonth);
    return {
      latestComp,
      baseSalary,
      periodDeductions,
      totalDeductionsMonth,
      authorizedDeductionsMonth,
      pendingDeductionsMonth,
      estimatedNetPay,
    };
  }, [compensation, payrollDeductions, selectedPayrollMonth]);

  const filteredDeductions = useMemo(() => {
    return payrollDeductions.filter((item) => {
      if (deductionStatusFilter !== 'all' && item.status !== deductionStatusFilter) return false;
      return true;
    });
  }, [payrollDeductions, deductionStatusFilter]);

  // Selected worker's attendance metrics for attendanceMonth
  const workerAttendanceStats = useMemo(() => {
    if (!selected) return { entries: [], presentDays: 0, lateDays: 0, absentDays: 0, leaveDays: 0, totalLateMinutes: 0, punctualityRate: 100 };
    const entries = attendanceEntries
      .filter((e) => e.personnel_id === selected.id && e.date.startsWith(attendanceMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
    const presentDays = entries.filter((e) => e.status === 'presente' || e.status === 'remoto').length;
    const lateDays = entries.filter((e) => e.status === 'tardanza').length;
    const absentDays = entries.filter((e) => e.status === 'falta').length;
    const leaveDays = entries.filter((e) => e.status === 'permiso' || e.status === 'vacaciones').length;
    const totalLateMinutes = entries.reduce((acc, e) => acc + (Number(e.late_minutes) || 0), 0);
    const attendedTotal = presentDays + lateDays;
    const punctualityRate = attendedTotal > 0 ? Math.round((presentDays / attendedTotal) * 100) : 100;
    return { entries, presentDays, lateDays, absentDays, leaveDays, totalLateMinutes, punctualityRate };
  }, [attendanceEntries, selected, attendanceMonth]);

  // Selected worker's performance metrics (Sales, Commercial Discounts, Quotes, Workshop)
  const workerPerformance = useMemo(() => {
    if (!selected) {
      return {
        salesCount: 0,
        salesMonthCount: 0,
        revenueTotal: 0,
        revenueMonth: 0,
        avgTicket: 0,
        discountsGrantedTotal: 0,
        discountedSalesCount: 0,
        avgDiscountPct: 0,
        quotesTotal: 0,
        quotesConverted: 0,
        quoteConversionRate: 0,
        workshopTotal: 0,
        workshopCompleted: 0,
        recentSales: [] as any[],
        recentQuotes: [] as any[],
      };
    }
    const targetUserId = linkedAccount?.user_id || '';
    const targetNameNorm = selected.full_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const firstLastTokens = targetNameNorm.split(/\s+/).filter((t) => t.length > 2);
    const currentMonth = currentMonthIso();

    const matchesPerson = (userIdField?: string | null, nameField?: string | null) => {
      if (targetUserId && userIdField && userIdField === targetUserId) return true;
      if (nameField) {
        const norm = String(nameField).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (norm === targetNameNorm) return true;
        if (firstLastTokens.length >= 2 && norm.includes(firstLastTokens[0]) && norm.includes(firstLastTokens[1])) return true;
      }
      return false;
    };

    const workerSales = orgSales.filter(
      (s) => s.status !== 'void' && (matchesPerson(s.sold_by, null) || matchesPerson(s.created_by, null)),
    );
    const salesMonth = workerSales.filter((s) => String(s.sold_at || '').startsWith(currentMonth));
    const revenueTotal = workerSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const revenueMonth = salesMonth.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const avgTicket = workerSales.length > 0 ? revenueTotal / workerSales.length : 0;

    const discountedSales = workerSales.filter((s) => Number(s.discount_total) > 0);
    const discountsGrantedTotal = discountedSales.reduce((acc, s) => acc + (Number(s.discount_total) || 0), 0);
    const avgDiscountPct =
      discountedSales.length > 0
        ? discountedSales.reduce((acc, s) => {
            const sub = Number(s.subtotal) || 0;
            const disc = Number(s.discount_total) || 0;
            return acc + (sub > 0 ? (disc / sub) * 100 : 0);
          }, 0) / discountedSales.length
        : 0;

    const workerQuotes = orgQuotes.filter((q) => matchesPerson(q.created_by, null));
    const quotesConverted = workerQuotes.filter(
      (q) => q.status === 'approved' || q.status === 'converted' || q.status === 'won',
    ).length;
    const quoteConversionRate = workerQuotes.length > 0 ? Math.round((quotesConverted / workerQuotes.length) * 100) : 0;

    const workerProd = orgProduction.filter(
      (p) => matchesPerson(p.assigned_to, p.responsible_name),
    );
    const workshopCompleted = workerProd.filter(
      (p) => p.status === 'completed' || p.stage === 'entregado' || p.stage === 'terminado',
    ).length;

    return {
      salesCount: workerSales.length,
      salesMonthCount: salesMonth.length,
      revenueTotal,
      revenueMonth,
      avgTicket,
      discountsGrantedTotal,
      discountedSalesCount: discountedSales.length,
      avgDiscountPct,
      quotesTotal: workerQuotes.length,
      quotesConverted,
      quoteConversionRate,
      workshopTotal: workerProd.length,
      workshopCompleted,
      recentSales: workerSales.slice(0, 6),
      recentQuotes: workerQuotes.slice(0, 5),
    };
  }, [selected, linkedAccount, orgSales, orgQuotes, orgProduction]);

  const openNew = () => {
    setEditingRecord(null);
    setDraft(emptyDraft);
    setNewGoogleAccountId('');
    setNewGoogleProfileId('');
    setError('');
    setMessage('');
    setModalOpen(true);
    void loadGoogleAccounts();
  };
  const openEdit = (record: PersonnelRecord) => {
    setEditingRecord(record);
    setDraft({
      full_name: normalizePersonName(record.full_name),
      email: record.email,
      phone: record.phone,
      department: record.department,
      job_title: record.job_title,
      status: record.status,
      start_date: record.start_date || '',
      end_date: record.end_date || '',
    });
    setError('');
    setMessage('');
    setModalOpen(true);
  };

  const saveRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !canEdit || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    const payload = {
      ...draft,
      full_name: normalizePersonName(draft.full_name),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      department: draft.department.trim(),
      job_title: draft.job_title.trim(),
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      organization_id: organizationId,
      updated_by: user.id,
    };
    try {
      const result = editingRecord
        ? await supabase
            .from('personnel_records')
            .update(payload)
            .eq('id', editingRecord.id)
            .eq('organization_id', organizationId)
            .select('id')
            .single()
        : await supabase.from('personnel_records').insert(payload).select('id').single();
      if (result.error) throw result.error;
      if (!editingRecord && newGoogleAccountId) {
        let profileAssignment: any = null;
        try {
          const { error: linkError } = await supabase.rpc('link_visualcorp_personnel_google_account', {
            p_personnel_id: result.data.id,
            p_user_id: newGoogleAccountId,
          });
          if (linkError) throw linkError;
          if (newGoogleProfileId) {
            const linked = googleAccounts.find((account) => account.user_id === newGoogleAccountId);
            if (!linked) throw new Error('La cuenta se vinculó, pero no se pudo identificar su correo para asignar el perfil.');
            const { data, error: profileError } = await supabase.rpc('create_organization_access_invitation', {
              p_organization_id: organizationId,
              p_email: linked.email,
              p_profile_id: newGoogleProfileId,
            });
            if (profileError) throw profileError;
            profileAssignment = data;
            if (profileAssignment?.status === 'pending')
              setMessage(
                `Ficha y cuenta vinculadas. Invitación de acceso pendiente para ${profileAssignment.email}; vence en 7 días y debes comunicarla por un canal seguro.`,
              );
          }
          await loadGoogleAccounts();
          setModalOpen(false);
          await loadRecords(result.data.id);
          if (newGoogleProfileId && profileAssignment?.status !== 'pending')
            setMessage('Ficha creada, cuenta Google vinculada y perfil de acceso asignado.');
          else if (!newGoogleProfileId) setMessage('Ficha creada y cuenta Google vinculada.');
        } catch (followupError) {
          setModalOpen(false);
          await loadRecords(result.data.id);
          setError(
            `La ficha se creó, pero no se completó la vinculación o el permiso: ${errorText(
              followupError,
            )}. Puedes terminarlo desde la ficha del personal.`,
          );
          await loadGoogleAccounts();
        }
      } else {
        setModalOpen(false);
        await loadRecords(result.data.id);
        setMessage(editingRecord ? 'Ficha actualizada.' : 'Ficha creada.');
      }
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const addCompensation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !selected || !canEditCompensation || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: insertError } = await supabase.from('personnel_compensation_history').insert({
        organization_id: organizationId,
        personnel_id: selected.id,
        amount: Number(salaryDraft.amount),
        currency_code: salaryDraft.currency_code.trim().toUpperCase(),
        pay_period: salaryDraft.pay_period.trim(),
        effective_date: salaryDraft.effective_date,
        note: salaryDraft.note.trim(),
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setSalaryDraft({ amount: '', currency_code: 'USD', pay_period: 'Mensual', effective_date: todayIso(), note: '' });
      await reloadDetail();
      setMessage('Cambio de remuneración registrado en el historial.');
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const addPayrollDeduction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !organizationId || !user || !selected || !canManageDeductions || saving) return;
    const numericAmount = Number(deductionDraft.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Ingresa un monto de descuento válido mayor a $0,00.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: insertError } = await supabase.from('finance_payroll_deductions').insert({
        organization_id: organizationId,
        personnel_id: selected.id,
        description: deductionDraft.description.trim(),
        amount: numericAmount,
        payroll_period: `${deductionDraft.payroll_period.slice(0, 7)}-01`,
        status: 'pending_authorization',
        authorization_reference: deductionDraft.authorization_reference.trim(),
        evidence_reference: deductionDraft.evidence_reference.trim(),
        created_by: user.id,
      });
      if (insertError) throw insertError;
      setDeductionDraft({
        description: '',
        amount: '',
        payroll_period: selectedPayrollMonth,
        authorization_reference: '',
        evidence_reference: '',
      });
      await reloadDetail();
      setMessage('Descuento / deducción de nómina registrado correctamente.');
    } catch (saveError) {
      setError(errorText(saveError));
    } finally {
      setSaving(false);
    }
  };

  const updateDeductionStatus = async (item: PayrollDeduction, nextStatus: 'authorized' | 'applied_externally' | 'cancelled') => {
    if (!supabase || !organizationId || !canManageDeductions || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const authRef = item.authorization_reference?.trim() || `AUT-${new Date().toISOString().slice(0, 10)}`;
      const evidRef = item.evidence_reference?.trim() || `REG-RRHH-${item.id.slice(0, 6).toUpperCase()}`;
      const updatePayload: any = { status: nextStatus };
      if (nextStatus === 'authorized') {
        updatePayload.authorization_reference = authRef;
        updatePayload.evidence_reference = evidRef;
      }
      const { error: updateError } = await supabase
        .from('finance_payroll_deductions')
        .update(updatePayload)
        .eq('id', item.id)
        .eq('organization_id', organizationId);
      if (updateError) throw updateError;
      await reloadDetail();
      setMessage(
        nextStatus === 'authorized'
          ? 'Deducción autorizada para nómina.'
          : nextStatus === 'applied_externally'
            ? 'Deducción marcada como aplicada en rol de pagos.'
            : 'Deducción cancelada.',
      );
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const recordAttendance = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const entry: AttendanceEntry = {
      id: `${selected.id}_${attendanceDraft.date}`,
      personnel_id: selected.id,
      date: attendanceDraft.date,
      status: attendanceDraft.status,
      check_in: attendanceDraft.check_in,
      check_out: attendanceDraft.check_out,
      late_minutes: attendanceDraft.status === 'tardanza' ? Math.max(1, Number(attendanceDraft.late_minutes) || 15) : 0,
      note: attendanceDraft.note.trim(),
      updated_at: new Date().toISOString(),
    };
    const next = [entry, ...attendanceEntries.filter((e) => !(e.personnel_id === selected.id && e.date === attendanceDraft.date))];
    saveAttendanceList(next);
    setMessage(`Asistencia del ${dateLabel(attendanceDraft.date)} guardada para ${selected.full_name}.`);
  };

  const quickMarkTodayAttendance = (person: PersonnelRecord, status: AttendanceStatus) => {
    const today = todayIso();
    const entry: AttendanceEntry = {
      id: `${person.id}_${today}`,
      personnel_id: person.id,
      date: today,
      status,
      check_in: status === 'tardanza' ? '08:45' : status === 'falta' || status === 'vacaciones' ? '—' : '08:30',
      check_out: status === 'falta' || status === 'vacaciones' ? '—' : '17:30',
      late_minutes: status === 'tardanza' ? 15 : 0,
      note: status === 'tardanza' ? 'Atraso registrado en marcación rápida' : '',
      updated_at: new Date().toISOString(),
    };
    const next = [entry, ...attendanceEntries.filter((e) => !(e.personnel_id === person.id && e.date === today))];
    saveAttendanceList(next);
    setMessage(`Marcación de hoy (${ATTENDANCE_LABELS[status].label}) registrada para ${person.full_name}.`);
  };

  const removeAttendanceEntry = (entryId: string) => {
    const next = attendanceEntries.filter((e) => e.id !== entryId);
    saveAttendanceList(next);
    setMessage('Registro de asistencia eliminado.');
  };

  const saveAccountLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !supabase ||
      !selected ||
      !chosenAccount ||
      !canLinkAccount ||
      (chosenAccount.linked_personnel_id && chosenAccount.linked_personnel_id !== selected.id) ||
      accountSaving
    )
      return;
    setAccountSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: linkError } = await supabase.rpc('link_visualcorp_personnel_google_account', {
        p_personnel_id: selected.id,
        p_user_id: chosenAccount.user_id,
      });
      if (linkError) throw linkError;
      await loadGoogleAccounts();
      await loadRecords(selected.id);
      setMessage('Cuenta Google vinculada a la ficha. Los permisos se gestionan por separado.');
    } catch (linkError) {
      setError(errorText(linkError));
    } finally {
      setAccountSaving(false);
    }
  };

  const removeAccountLink = async () => {
    if (!supabase || !selected || !canLinkAccount || !linkedAccount || accountSaving) return;
    setAccountSaving(true);
    setError('');
    setMessage('');
    try {
      const { error: unlinkError } = await supabase.rpc('unlink_visualcorp_personnel_google_account', { p_personnel_id: selected.id });
      if (unlinkError) throw unlinkError;
      await loadGoogleAccounts();
      await loadRecords(selected.id);
      setMessage('Cuenta desvinculada. Su acceso actual se conserva.');
    } catch (unlinkError) {
      setError(errorText(unlinkError));
    } finally {
      setAccountSaving(false);
    }
  };

  const assignAccountProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !linkedAccount || !accountProfileId || !canLinkAccount || accountSaving) return;
    setAccountSaving(true);
    setError('');
    setMessage('');
    try {
      const { data, error: assignError } = await supabase.rpc('create_organization_access_invitation', {
        p_organization_id: organizationId,
        p_email: linkedAccount.email,
        p_profile_id: accountProfileId,
      });
      if (assignError) throw assignError;
      setAccountProfileId('');
      await loadGoogleAccounts();
      setMessage(
        data?.status === 'assigned'
          ? 'Perfil de acceso asignado.'
          : `Invitación pendiente para ${data?.email || linkedAccount.email}. Comunícala por un canal seguro; la aplicación no envía correos.`,
      );
    } catch (assignError) {
      setError(errorText(assignError));
    } finally {
      setAccountSaving(false);
    }
  };

  const reloadDetail = async () => {
    if (!supabase || !organizationId || !selectedId) return;
    const requests: any[] = [
      supabase
        .from('personnel_events')
        .select('id,event_key,summary,changed_fields,salary_sensitive,actor_label,created_at')
        .eq('organization_id', organizationId)
        .eq('personnel_id', selectedId)
        .order('created_at', { ascending: false })
        .limit(80),
    ];
    if (canViewCompensation)
      requests.push(
        supabase
          .from('personnel_compensation_history')
          .select('id,amount,currency_code,pay_period,effective_date,note,created_at,created_by')
          .eq('organization_id', organizationId)
          .eq('personnel_id', selectedId)
          .order('effective_date', { ascending: false })
          .limit(40),
      );
    if (canViewCompensation)
      requests.push(
        supabase
          .from('finance_payroll_deductions')
          .select(
            'id,description,amount,payroll_period,status,authorization_reference,evidence_reference,payroll_handoff_reference,payroll_handed_at,created_at,reviewed_at',
          )
          .eq('organization_id', organizationId)
          .eq('personnel_id', selectedId)
          .order('payroll_period', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(80),
      );
    const results = await Promise.all(requests);
    if (results[0].error) throw results[0].error;
    if (results[1]?.error) throw results[1].error;
    if (results[2]?.error) throw results[2].error;
    setEvents((results[0].data || []) as PersonnelEvent[]);
    setCompensation((results[1]?.data || []) as Compensation[]);
    setPayrollDeductions((results[2]?.data || []) as PayrollDeduction[]);
  };

  return (
    <div className="personnel-page">
      <header className="personnel-heading">
        <div>
          <span className="eyebrow">OPERACIONES · EQUIPO, SALARIOS, ASISTENCIA Y RENDIMIENTO</span>
          <h1>Personal, Nómina y Métricas</h1>
          <p>
            Gestiona fichas laborales, cuentas vinculadas, salarios base, descuentos de nómina, control de asistencia y métricas operativas por colaborador.
          </p>
        </div>
        <div className="personnel-heading-actions">
          <Link className="button button-outline" to="/operaciones/equipo/usuarios">
            <ShieldCheck size={15} /> Usuarios y Permisos
          </Link>
          {canEdit && (
            <button className="button button-dark" type="button" onClick={openNew}>
              <Plus size={16} /> Nueva ficha
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="personnel-alert" role="alert">
          <ShieldAlert size={16} />
          {error}
        </p>
      )}
      {message && (
        <p className="personnel-success" role="status">
          <Check size={16} />
          {message}
        </p>
      )}

      <section className="personnel-metrics personnel-metrics-5" aria-label="Resumen ejecutivo de personal y asistencia">
        <article className="panel personnel-metric">
          <span className="personnel-metric-icon">
            <Users size={18} />
          </span>
          <div>
            <small>FICHAS REGISTRADAS</small>
            <b>{records.length}</b>
          </div>
        </article>
        <article className="panel personnel-metric">
          <span className="personnel-metric-icon active">
            <Check size={18} />
          </span>
          <div>
            <small>PERSONAL ACTIVO</small>
            <b>{activeCount}</b>
          </div>
        </article>
        <article className="panel personnel-metric">
          <span className="personnel-metric-icon is-blue">
            <CalendarCheck2 size={18} />
          </span>
          <div>
            <small>PRESENTES HOY</small>
            <b>
              {todayAttendanceStats.presentCount + todayAttendanceStats.lateCount} / {activeCount || records.length}
            </b>
          </div>
        </article>
        <article className="panel personnel-metric">
          <span className="personnel-metric-icon is-amber">
            <Clock3 size={18} />
          </span>
          <div>
            <small>ATRASOS / PERMISOS HOY</small>
            <b>
              {todayAttendanceStats.lateCount} atr. · {todayAttendanceStats.absentOrLeaveCount} aus.
            </b>
          </div>
        </article>
        <article className="panel personnel-metric">
          <span className="personnel-metric-icon">
            <History size={18} />
          </span>
          <div>
            <small>TRAZABILIDAD Y MÉTRICAS</small>
            <b>360° por colaborador</b>
          </div>
        </article>
      </section>

      {loading || records.length > 0 ? (
        <div className="personnel-workspace">
          <section className="panel personnel-directory">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DIRECTORIO LABORAL</span>
                <h2>Equipo Visual Corp</h2>
              </div>
              <span className="muted-count">{filteredRecords.length} resultados</span>
            </div>
            <div className={`personnel-filters${canFilterGoogleAccounts ? ' has-google-filter' : ''}`}>
              <label className="personnel-search">
                <Search size={16} />
                <input
                  aria-label="Buscar personal"
                  placeholder="Buscar nombre, correo, cargo o área…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Estado</span>
                <select aria-label="Filtrar por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Área</span>
                <select
                  aria-label="Filtrar por área"
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                >
                  <option value="all">Todas las áreas</option>
                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
              {canFilterGoogleAccounts && (
                <label>
                  <span className="sr-only">Vinculación de Google</span>
                  <select
                    aria-label="Filtrar por vínculo de Google"
                    value={googleLinkFilter}
                    onChange={(event) => setGoogleLinkFilter(event.target.value as typeof googleLinkFilter)}
                  >
                    <option value="all">Todas las cuentas</option>
                    <option value="linked">Con Google vinculado</option>
                    <option value="unlinked">Sin Google vinculado</option>
                  </select>
                </label>
              )}
            </div>

            {loading ? (
              <div className="personnel-empty" role="status">
                Cargando fichas…
              </div>
            ) : !filteredRecords.length ? (
              <div className="personnel-empty">
                <CircleUserRound size={25} />
                <b>
                  {records.length
                    ? effectiveGoogleLinkFilter === 'linked'
                      ? 'No hay fichas vinculadas a una cuenta Google con estos filtros.'
                      : effectiveGoogleLinkFilter === 'unlinked'
                        ? 'Todo el personal visible tiene una cuenta Google vinculada.'
                        : 'No encontramos personal con estos filtros.'
                    : 'Aún no hay fichas de personal.'}
                </b>
                <span>
                  {records.length
                    ? 'Prueba otra búsqueda o restablece los filtros para volver a ver el directorio.'
                    : 'Crea la primera ficha cuando tengas los datos confirmados.'}
                </span>
                {records.length > 0 && hasActivePersonnelFilters && (
                  <button
                    className="button button-outline"
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setStatusFilter('all');
                      setDepartmentFilter('all');
                      setGoogleLinkFilter('all');
                    }}
                  >
                    <RefreshCw size={14} /> Restablecer filtros
                  </button>
                )}
                {!records.length && canEdit && (
                  <button className="button button-outline" type="button" onClick={openNew}>
                    <Plus size={15} /> Crear ficha
                  </button>
                )}
              </div>
            ) : (
              <div className="personnel-list">
                {filteredRecords.map((record) => {
                  const todayEntry = attendanceEntries.find((e) => e.personnel_id === record.id && e.date === todayIso());
                  const hasGoogle = linkedGooglePersonnelIds.has(record.id);
                  return (
                    <button
                      type="button"
                      className={`personnel-list-row ${record.id === selectedId ? 'selected' : ''}`}
                      key={record.id}
                      onClick={() => setSelectedId(record.id)}
                      aria-pressed={record.id === selectedId}
                    >
                      <Avatar
                        name={record.full_name}
                        src={googleAccounts.find((account) => account.linked_personnel_id === record.id)?.avatar_url}
                        size="sm"
                        badge={hasGoogle ? <span className="vc-google-avatar-mark">G</span> : undefined}
                      />
                      <span className="personnel-list-copy">
                        <b>{record.full_name}</b>
                        <small>
                          {record.job_title || 'Cargo pendiente'}
                          {record.department ? ` · ${record.department}` : ''}
                        </small>
                        {todayEntry && (
                          <span className={`personnel-mini-attendance is-${todayEntry.status}`}>
                            Hoy: {ATTENDANCE_LABELS[todayEntry.status].label}
                          </span>
                        )}
                      </span>
                      <span className={`personnel-status ${record.status}`}>
                        {record.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel personnel-detail-panel" aria-live="polite">
            {!selected ? (
              <div className="personnel-detail-placeholder">
                <span>
                  <CircleUserRound size={22} />
                </span>
                <div>
                  <small>DIRECTORIO DE PERSONAL</small>
                  <b>
                    {records.length
                      ? filteredRecords.length
                        ? 'Elige una ficha para continuar'
                        : 'No hay fichas que coincidan'
                      : 'Aquí verás el perfil de cada persona'}
                  </b>
                  <p>
                    {records.length
                      ? filteredRecords.length
                        ? 'Selecciona un colaborador del directorio para gestionar su ficha, salarios, descuentos, asistencia y métricas.'
                        : 'Ajusta la búsqueda o los filtros para volver a mostrar las fichas.'
                      : 'Crea una ficha para reunir los datos laborales, el área, el cargo y el historial en un solo lugar.'}
                  </p>
                </div>
                {!records.length && canEdit && (
                  <button className="button button-outline" type="button" onClick={openNew}>
                    <Plus size={15} /> Crear primera ficha
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="personnel-detail-heading">
                  <Avatar
                    name={selected.full_name}
                    src={linkedAccount?.avatar_url}
                    size="lg"
                    badge={linkedAccount?.avatar_url ? <span className="vc-google-avatar-mark">G</span> : undefined}
                  />
                  <div>
                    <span className="eyebrow">FICHA DEL COLABORADOR</span>
                    <h2>{selected.full_name}</h2>
                    <p>
                      {selected.job_title || 'Cargo pendiente'}
                      {selected.department ? ` · ${selected.department}` : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <button className="button button-outline personnel-edit-button" type="button" onClick={() => openEdit(selected)}>
                      <Edit3 size={15} />
                      <span>Editar ficha</span>
                    </button>
                  )}
                </div>

                <div className="personnel-status-line">
                  <span className={`personnel-status ${selected.status}`}>
                    {selected.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                  <span>
                    <CalendarDays size={14} /> Ingreso: {dateLabel(selected.start_date)}
                  </span>
                  {selected.end_date && <span>Salida: {dateLabel(selected.end_date)}</span>}
                  {linkedAccount && (
                    <span className="personnel-linked-pill">
                      <UserCheck size={13} /> Google: {linkedAccount.email}
                    </span>
                  )}
                </div>

                <nav className="personnel-tabs" aria-label="Secciones de la ficha del trabajador">
                  <button
                    type="button"
                    className={detailTab === 'ficha' ? 'active' : ''}
                    onClick={() => setDetailTab('ficha')}
                  >
                    <ContactRound size={15} />
                    <span>Ficha y Accesos</span>
                  </button>
                  <button
                    type="button"
                    className={detailTab === 'salarios' ? 'active' : ''}
                    onClick={() => setDetailTab('salarios')}
                  >
                    <Banknote size={15} />
                    <span>Salarios y Descuentos</span>
                    {payrollDeductions.filter((d) => d.status === 'pending_authorization').length > 0 && (
                      <em className="personnel-tab-badge">
                        {payrollDeductions.filter((d) => d.status === 'pending_authorization').length}
                      </em>
                    )}
                  </button>
                  <button
                    type="button"
                    className={detailTab === 'asistencia' ? 'active' : ''}
                    onClick={() => setDetailTab('asistencia')}
                  >
                    <CalendarCheck2 size={15} />
                    <span>Asistencia y Horarios</span>
                  </button>
                  <button
                    type="button"
                    className={detailTab === 'metricas' ? 'active' : ''}
                    onClick={() => setDetailTab('metricas')}
                  >
                    <TrendingUp size={15} />
                    <span>Métricas y Rendimiento</span>
                  </button>
                </nav>

                {detailTab === 'ficha' && (
                  <>
                    <div className="personnel-contact-grid">
                      <div>
                        <Mail size={15} />
                        <span>
                          <small>Correo</small>
                          <b>{selected.email || 'Sin registrar'}</b>
                        </span>
                      </div>
                      <div>
                        <Phone size={15} />
                        <span>
                          <small>Teléfono</small>
                          <b>{selected.phone || 'Sin registrar'}</b>
                        </span>
                      </div>
                      <div>
                        <BriefcaseBusiness size={15} />
                        <span>
                          <small>Área</small>
                          <b>{selected.department || 'Sin asignar'}</b>
                        </span>
                      </div>
                      <div>
                        <ContactRound size={15} />
                        <span>
                          <small>Cargo</small>
                          <b>{selected.job_title || 'Sin registrar'}</b>
                        </span>
                      </div>
                    </div>

                    <section className="personnel-subsection personnel-account-panel">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">IDENTIDAD Y ACCESO AL SISTEMA</span>
                          <h3>Cuenta de Google y Roles vinculados</h3>
                        </div>
                        <Link2 size={18} />
                      </div>
                      {linkedAccount ? (
                        <div className="personnel-linked-account">
                          <Avatar
                            name={linkedAccount.full_name}
                            src={linkedAccount.avatar_url}
                            size="sm"
                            className="personnel-google-avatar"
                            badge={linkedAccount.avatar_url ? <span className="vc-google-avatar-mark">G</span> : undefined}
                          />
                          <div className="personnel-linked-copy">
                            <b>{linkedAccount.full_name}</b>
                            <span>{linkedAccount.email}</span>
                            <small>
                              {linkedAccount.roles.length ? `Roles base: ${linkedAccount.roles.join(', ')}` : 'Sin rol base'}
                              {linkedAccount.access_profiles.length ? ` · Perfiles: ${linkedAccount.access_profiles.join(', ')}` : ''}
                            </small>
                            <small>
                              {linkedAccount.access_active ? 'Acceso activo' : 'Acceso sin activar o pausado'} · Último ingreso:{' '}
                              {dateTimeLabel(linkedAccount.last_sign_in_at)}
                            </small>
                          </div>
                          {canLinkAccount && (
                            <button
                              className="button button-outline personnel-unlink-button"
                              type="button"
                              onClick={removeAccountLink}
                              disabled={accountSaving}
                            >
                              <Unlink size={14} />
                              {accountSaving ? 'Guardando…' : 'Desvincular'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="personnel-inline-empty">Esta ficha no tiene una cuenta de acceso vinculada.</p>
                      )}
                      {canLinkAccount ? (
                        <>
                          {!linkedAccount && (
                            <form className="personnel-account-form" onSubmit={saveAccountLink}>
                              <label>
                                Cuenta registrada con Google
                                <select required value={accountUserId} onChange={(event) => setAccountUserId(event.target.value)}>
                                  <option value="">Selecciona una cuenta Google</option>
                                  {googleAccounts.map((account) => (
                                    <option
                                      key={account.user_id}
                                      value={account.user_id}
                                      disabled={Boolean(account.linked_personnel_id)}
                                    >
                                      {account.full_name} · {account.email}
                                      {account.linked_personnel_id ? ` · Vinculada a ${account.linked_personnel_name}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <p className="personnel-privacy-hint">
                                Solo aparecen cuentas que ya iniciaron sesión con Google. Vincularlas identifica a la persona en ventas, caja y producción.
                              </p>
                              <button
                                className="button button-outline"
                                type="submit"
                                disabled={accountSaving || !chosenAccount || Boolean(chosenAccount.linked_personnel_id)}
                              >
                                <Link2 size={15} />
                                {accountSaving ? 'Vinculando…' : 'Vincular cuenta'}
                              </button>
                            </form>
                          )}
                          {linkedAccount && !linkedAccount.roles.includes('owner') && (
                            <form className="personnel-account-form" onSubmit={assignAccountProfile}>
                              <label>
                                Añadir perfil de acceso al colaborador
                                <select required value={accountProfileId} onChange={(event) => setAccountProfileId(event.target.value)}>
                                  <option value="">Selecciona un perfil</option>
                                  {accessProfiles
                                    .filter((profile) => roles.includes('owner') || !['admin', 'website_admin'].includes(profile.profile_key))
                                    .map((profile) => (
                                      <option key={profile.id} value={profile.id}>
                                        {profile.name}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <p className="personnel-privacy-hint">
                                Área laboral: {selected.department || 'sin asignar'}. El perfil se añadirá a los accesos actuales de la cuenta.
                              </p>
                              <button className="button button-outline" type="submit" disabled={accountSaving || !accountProfileId}>
                                <ShieldCheck size={15} />
                                {accountSaving ? 'Asignando…' : 'Añadir perfil de acceso'}
                              </button>
                            </form>
                          )}
                        </>
                      ) : (
                        <p className="personnel-privacy-hint">
                          Para vincular cuentas necesitas permisos de edición de Personal y gestión de accesos del Equipo.
                        </p>
                      )}
                    </section>

                    <div className="personnel-subsection">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">TRAZABILIDAD</span>
                          <h3>Historial auditable de la ficha</h3>
                        </div>
                        <Clock3 size={18} />
                      </div>
                      {detailLoading ? (
                        <p className="personnel-inline-loading">Cargando historial…</p>
                      ) : !events.length ? (
                        <p className="personnel-inline-empty">Aún no hay cambios registrados.</p>
                      ) : (
                        <ol className="personnel-history-list">
                          {events
                            .filter((item) => !item.salary_sensitive || canViewCompensation)
                            .map((item) => (
                              <li key={item.id}>
                                <span className="personnel-history-icon">
                                  {item.event_key === 'compensation_changed' ? <Banknote size={14} /> : <History size={14} />}
                                </span>
                                <div>
                                  <b>{item.summary}</b>
                                  <small>
                                    {item.changed_fields.map((field) => fieldLabels[field] || field).join(', ') || 'Registro creado'} ·{' '}
                                    {item.actor_label}
                                  </small>
                                  <time>{dateTimeLabel(item.created_at)}</time>
                                </div>
                              </li>
                            ))}
                        </ol>
                      )}
                    </div>
                  </>
                )}

                {detailTab === 'salarios' && (
                  <>
                    {!canViewCompensation ? (
                      <div className="personnel-subsection">
                        <p className="personnel-private-note">
                          <ShieldAlert size={15} /> Información restringida. Tu perfil no tiene permiso para consultar salarios ni deducciones de nómina.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="personnel-subsection personnel-netpay-banner">
                          <div className="personnel-netpay-header">
                            <div>
                              <span className="eyebrow">RESUMEN DE NÓMINA Y LÍQUIDO ESTIMADO</span>
                              <h3>Calculadora de Salario y Descuentos del Periodo</h3>
                            </div>
                            <label className="personnel-month-picker">
                              <span>Mes de nómina:</span>
                              <input
                                type="month"
                                value={selectedPayrollMonth}
                                onChange={(e) => {
                                  const nextMonth = e.target.value || currentMonthIso();
                                  setSelectedPayrollMonth(nextMonth);
                                  setDeductionDraft((prev) => ({ ...prev, payroll_period: nextMonth }));
                                }}
                              />
                            </label>
                          </div>

                          <div className="personnel-netpay-cards">
                            <div className="personnel-netpay-card">
                              <small>SALARIO BASE VIGENTE</small>
                              <b>{salarySummary.latestComp ? formatCompensation(salarySummary.latestComp) : '$0,00'}</b>
                              <span>
                                {salarySummary.latestComp
                                  ? `${salarySummary.latestComp.pay_period} · desde ${dateLabel(salarySummary.latestComp.effective_date)}`
                                  : 'Sin sueldo base registrado'}
                              </span>
                            </div>
                            <div className="personnel-netpay-card is-deduction">
                              <small>DESCUENTOS / ANTICIPOS ({payrollPeriodLabel(selectedPayrollMonth)})</small>
                              <b>- {formatUsd(salarySummary.totalDeductionsMonth)}</b>
                              <span>
                                { formatUsd(salarySummary.authorizedDeductionsMonth) } autorizados · { formatUsd(salarySummary.pendingDeductionsMonth) } por autorizar
                              </span>
                            </div>
                            <div className="personnel-netpay-card is-net">
                              <small>LÍQUIDO ESTIMADO A RECIBIR</small>
                              <b>{formatUsd(salarySummary.estimatedNetPay)}</b>
                              <span>Salario base menos deducciones activas del periodo</span>
                            </div>
                          </div>
                        </div>

                        <div className="personnel-subsection">
                          <div className="panel-heading">
                            <div>
                              <span className="eyebrow">REMUNERACIÓN BASE</span>
                              <h3>Historial de Salarios y Ajustes</h3>
                            </div>
                            <Banknote size={18} />
                          </div>
                          {canEditCompensation && (
                            <form className="personnel-pay-form" onSubmit={addCompensation}>
                              <label>
                                Sueldo / Valor
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required
                                  value={salaryDraft.amount}
                                  onChange={(event) => setSalaryDraft((current) => ({ ...current, amount: event.target.value }))}
                                  placeholder="Ej. 550.00"
                                />
                              </label>
                              <label>
                                Moneda
                                <input
                                  required
                                  maxLength={3}
                                  pattern="[A-Za-z]{3}"
                                  value={salaryDraft.currency_code}
                                  onChange={(event) => setSalaryDraft((current) => ({ ...current, currency_code: event.target.value }))}
                                  aria-label="Código ISO de moneda"
                                />
                              </label>
                              <label>
                                Modalidad / Periodo
                                <input
                                  required
                                  maxLength={40}
                                  value={salaryDraft.pay_period}
                                  onChange={(event) => setSalaryDraft((current) => ({ ...current, pay_period: event.target.value }))}
                                  placeholder="Mensual / Quincenal"
                                />
                              </label>
                              <label>
                                Vigente desde
                                <input
                                  type="date"
                                  required
                                  value={salaryDraft.effective_date}
                                  onChange={(event) => setSalaryDraft((current) => ({ ...current, effective_date: event.target.value }))}
                                />
                              </label>
                              <label className="personnel-pay-note">
                                Motivo / Observación salarial
                                <input
                                  maxLength={500}
                                  value={salaryDraft.note}
                                  onChange={(event) => setSalaryDraft((current) => ({ ...current, note: event.target.value }))}
                                  placeholder="Ej. Salario inicial de contratación o ajuste por desempeño"
                                />
                              </label>
                              <button className="button button-dark" type="submit" disabled={saving}>
                                <Plus size={15} />
                                {saving ? 'Guardando…' : 'Guardar salario'}
                              </button>
                            </form>
                          )}
                          {detailLoading ? (
                            <p className="personnel-inline-loading">Cargando remuneración…</p>
                          ) : !compensation.length ? (
                            <p className="personnel-inline-empty">No hay registros de remuneración para esta ficha.</p>
                          ) : (
                            <div className="personnel-compensation-list">
                              {compensation.map((item, idx) => (
                                <article key={item.id} className={idx === 0 ? 'is-current-salary' : ''}>
                                  <div>
                                    <b>
                                      {formatCompensation(item)} {idx === 0 && <em className="personnel-current-badge">Vigente</em>}
                                    </b>
                                    <small>
                                      {item.pay_period} · Vigente desde {dateLabel(item.effective_date)}
                                    </small>
                                    {item.note && <span>{item.note}</span>}
                                  </div>
                                  <time>{dateTimeLabel(item.created_at)}</time>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="personnel-subsection">
                          <div className="panel-heading">
                            <div>
                              <span className="eyebrow">DESCUENTOS Y DEDUCCIONES DE NÓMINA</span>
                              <h3>Anticipos, Préstamos, Atrasos y Cargos al Trabajador</h3>
                            </div>
                            <BadgeDollarSign size={18} />
                          </div>

                          {canManageDeductions && selected.status === 'active' && (
                            <form className="personnel-deduction-form" onSubmit={addPayrollDeduction}>
                              <div className="personnel-deduction-presets">
                                <span>Conceptos frecuentes:</span>
                                {DEDUCTION_PRESETS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    className="personnel-chip-btn"
                                    onClick={() => setDeductionDraft((prev) => ({ ...prev, description: preset }))}
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                              <div className="personnel-deduction-grid">
                                <label className="personnel-deduction-desc">
                                  Concepto o motivo del descuento
                                  <input
                                    required
                                    maxLength={240}
                                    value={deductionDraft.description}
                                    onChange={(e) => setDeductionDraft((prev) => ({ ...prev, description: e.target.value }))}
                                    placeholder="Ej. Anticipo de quincena, descuento por atraso o reposición…"
                                  />
                                </label>
                                <label>
                                  Monto a descontar ($)
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    required
                                    value={deductionDraft.amount}
                                    onChange={(e) => setDeductionDraft((prev) => ({ ...prev, amount: e.target.value }))}
                                    placeholder="0.00"
                                  />
                                </label>
                                <label>
                                  Mes de descuento
                                  <input
                                    type="month"
                                    required
                                    value={deductionDraft.payroll_period}
                                    onChange={(e) => setDeductionDraft((prev) => ({ ...prev, payroll_period: e.target.value }))}
                                  />
                                </label>
                                <label>
                                  Ref. autorización (opcional)
                                  <input
                                    maxLength={120}
                                    value={deductionDraft.authorization_reference}
                                    onChange={(e) => setDeductionDraft((prev) => ({ ...prev, authorization_reference: e.target.value }))}
                                    placeholder="Vale firmado / acuerdo"
                                  />
                                </label>
                                <label>
                                  Ref. comprobante / evidencia
                                  <input
                                    maxLength={120}
                                    value={deductionDraft.evidence_reference}
                                    onChange={(e) => setDeductionDraft((prev) => ({ ...prev, evidence_reference: e.target.value }))}
                                    placeholder="Comprobante caja / OT"
                                  />
                                </label>
                                <button className="button button-dark" type="submit" disabled={saving}>
                                  <Plus size={15} />
                                  {saving ? 'Registrando…' : 'Registrar descuento'}
                                </button>
                              </div>
                            </form>
                          )}

                          <div className="personnel-deduction-toolbar">
                            <span className="personnel-privacy-hint">
                              Las deducciones quedan vinculadas a la ficha laboral y a Finanzas → Nómina con trazabilidad completa.
                            </span>
                            <select
                              aria-label="Filtrar estado de deducciones"
                              value={deductionStatusFilter}
                              onChange={(e) => setDeductionStatusFilter(e.target.value)}
                            >
                              <option value="all">Todos los estados ({payrollDeductions.length})</option>
                              <option value="pending_authorization">Pendientes de autorización</option>
                              <option value="authorized">Autorizadas</option>
                              <option value="applied_externally">Aplicadas en rol</option>
                              <option value="cancelled">Canceladas</option>
                            </select>
                          </div>

                          {detailLoading ? (
                            <p className="personnel-inline-loading">Cargando deducciones…</p>
                          ) : !filteredDeductions.length ? (
                            <p className="personnel-inline-empty">No hay descuentos ni deducciones registrados con este filtro.</p>
                          ) : (
                            <div className="personnel-compensation-list">
                              {filteredDeductions.map((item) => {
                                const statusLabel =
                                  item.status === 'pending_authorization'
                                    ? 'Pendiente de autorización'
                                    : item.status === 'authorized'
                                      ? 'Autorizada · lista para rol'
                                      : item.status === 'sent_to_payroll'
                                        ? 'Entregada a nómina'
                                        : item.status === 'applied_externally'
                                          ? 'Aplicada en rol de pagos'
                                          : item.status === 'cancelled'
                                            ? 'Cancelada'
                                            : item.status;
                                return (
                                  <article key={item.id} className={`personnel-deduction-row is-${item.status}`}>
                                    <div>
                                      <b>{formatUsd(Number(item.amount) || 0)}</b>
                                      <small>
                                        {payrollPeriodLabel(item.payroll_period)} · <em>{statusLabel}</em>
                                      </small>
                                      <span>{item.description}</span>
                                      {item.authorization_reference && <small>Autorización: {item.authorization_reference}</small>}
                                      {item.evidence_reference && <small>Evidencia: {item.evidence_reference}</small>}
                                      {item.payroll_handoff_reference && (
                                        <small>
                                          Entrega a nómina: {item.payroll_handoff_reference}
                                          {item.payroll_handed_at ? ` · ${dateTimeLabel(item.payroll_handed_at)}` : ''}
                                        </small>
                                      )}
                                    </div>
                                    <div className="personnel-deduction-actions">
                                      <time>{dateTimeLabel(item.reviewed_at || item.created_at)}</time>
                                      {canManageDeductions && (
                                        <div className="personnel-deduction-btns">
                                          {item.status === 'pending_authorization' && (
                                            <button
                                              type="button"
                                              className="button button-outline"
                                              disabled={saving}
                                              onClick={() => void updateDeductionStatus(item, 'authorized')}
                                            >
                                              Autorizar
                                            </button>
                                          )}
                                          {item.status === 'authorized' && (
                                            <button
                                              type="button"
                                              className="button button-outline"
                                              disabled={saving}
                                              onClick={() => void updateDeductionStatus(item, 'applied_externally')}
                                            >
                                              Marcar aplicada
                                            </button>
                                          )}
                                          {(item.status === 'pending_authorization' || item.status === 'authorized') && (
                                            <button
                                              type="button"
                                              className="button button-outline is-danger-text"
                                              disabled={saving}
                                              onClick={() => void updateDeductionStatus(item, 'cancelled')}
                                            >
                                              Cancelar
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {detailTab === 'asistencia' && (
                  <>
                    <div className="personnel-subsection">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">CONTROL DIARIO Y MENSUAL</span>
                          <h3>Asistencia, Puntualidad y Horarios de {selected.full_name}</h3>
                        </div>
                        <label className="personnel-month-picker">
                          <span>Mes:</span>
                          <input type="month" value={attendanceMonth} onChange={(e) => setAttendanceMonth(e.target.value || currentMonthIso())} />
                        </label>
                      </div>

                      <div className="personnel-attendance-kpis">
                        <div className="personnel-att-kpi is-green">
                          <small>DÍAS ASISTIDOS</small>
                          <b>{workerAttendanceStats.presentDays + workerAttendanceStats.lateDays}</b>
                          <span>{workerAttendanceStats.presentDays} a tiempo</span>
                        </div>
                        <div className="personnel-att-kpi is-violet">
                          <small>PUNTUALIDAD</small>
                          <b>{workerAttendanceStats.punctualityRate}%</b>
                          <span>Índice del mes</span>
                        </div>
                        <div className="personnel-att-kpi is-amber">
                          <small>ATRASOS ACUMULADOS</small>
                          <b>{workerAttendanceStats.lateDays} días</b>
                          <span>{workerAttendanceStats.totalLateMinutes} min en total</span>
                        </div>
                        <div className="personnel-att-kpi is-rose">
                          <small>FALTAS / PERMISOS</small>
                          <b>{workerAttendanceStats.absentDays} faltas</b>
                          <span>{workerAttendanceStats.leaveDays} permisos o vac.</span>
                        </div>
                      </div>

                      <div className="personnel-quick-checkin-bar">
                        <span>Marcación rápida de hoy ({dateLabel(todayIso())}):</span>
                        <div className="personnel-quick-checkin-btns">
                          {(['presente', 'tardanza', 'remoto', 'permiso', 'vacaciones', 'falta'] as AttendanceStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              className={`personnel-att-pill is-${st}`}
                              onClick={() => quickMarkTodayAttendance(selected, st)}
                            >
                              {ATTENDANCE_LABELS[st].label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <form className="personnel-attendance-form" onSubmit={recordAttendance}>
                        <label>
                          Fecha
                          <input
                            type="date"
                            required
                            value={attendanceDraft.date}
                            onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, date: e.target.value }))}
                          />
                        </label>
                        <label>
                          Estado de asistencia
                          <select
                            value={attendanceDraft.status}
                            onChange={(e) =>
                              setAttendanceDraft((prev) => ({
                                ...prev,
                                status: e.target.value as AttendanceStatus,
                              }))
                            }
                          >
                            {(Object.keys(ATTENDANCE_LABELS) as AttendanceStatus[]).map((st) => (
                              <option key={st} value={st}>
                                {ATTENDANCE_LABELS[st].label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Hora entrada
                          <input
                            type="time"
                            value={attendanceDraft.check_in}
                            onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, check_in: e.target.value }))}
                          />
                        </label>
                        <label>
                          Hora salida
                          <input
                            type="time"
                            value={attendanceDraft.check_out}
                            onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, check_out: e.target.value }))}
                          />
                        </label>
                        {attendanceDraft.status === 'tardanza' && (
                          <label>
                            Minutos de atraso
                            <input
                              type="number"
                              min="1"
                              max="480"
                              value={attendanceDraft.late_minutes}
                              onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, late_minutes: e.target.value }))}
                            />
                          </label>
                        )}
                        <label className="personnel-att-note-field">
                          Observación / Justificación
                          <input
                            maxLength={200}
                            value={attendanceDraft.note}
                            onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, note: e.target.value }))}
                            placeholder="Ej. Salida a instalación en sitio, cita médica IESS, etc."
                          />
                        </label>
                        <button className="button button-dark" type="submit">
                          <Check size={15} /> Guardar asistencia
                        </button>
                      </form>

                      {!workerAttendanceStats.entries.length ? (
                        <p className="personnel-inline-empty">
                          No hay registros de asistencia en {payrollPeriodLabel(attendanceMonth)}. Usa la marcación rápida de hoy o el formulario superior.
                        </p>
                      ) : (
                        <div className="personnel-compensation-list">
                          {workerAttendanceStats.entries.map((entry) => (
                            <article key={entry.id} className="personnel-attendance-row">
                              <div>
                                <b>
                                  {dateLabel(entry.date)}{' '}
                                  <span className={`personnel-att-badge is-${entry.status}`}>
                                    {ATTENDANCE_LABELS[entry.status].label}
                                  </span>
                                </b>
                                <small>
                                  Entrada: {entry.check_in || '—'} · Salida: {entry.check_out || '—'}
                                  {entry.late_minutes > 0 ? ` · ${entry.late_minutes} min de atraso` : ''}
                                </small>
                                {entry.note && <span>{entry.note}</span>}
                              </div>
                              <div className="personnel-att-row-actions">
                                {entry.status === 'tardanza' && canManageDeductions && (
                                  <button
                                    type="button"
                                    className="button button-outline"
                                    onClick={() => {
                                      setDeductionDraft({
                                        description: `Descuento por atraso (${entry.late_minutes} min) del ${dateLabel(entry.date)}`,
                                        amount: '5.00',
                                        payroll_period: entry.date.slice(0, 7),
                                        authorization_reference: `ASIST-${entry.date}`,
                                        evidence_reference: `Entrada ${entry.check_in}`,
                                      });
                                      setDetailTab('salarios');
                                    }}
                                  >
                                    Pasar a descuento
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="button button-outline"
                                  onClick={() => removeAttendanceEntry(entry.id)}
                                >
                                  Quitar
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {detailTab === 'metricas' && (
                  <>
                    <div className="personnel-subsection">
                      <div className="panel-heading">
                        <div>
                          <span className="eyebrow">RENDIMIENTO OPERATIVO Y COMERCIAL</span>
                          <h3>Métricas de {selected.full_name}</h3>
                        </div>
                        <Award size={18} />
                      </div>
                      <p className="personnel-privacy-hint">
                        Indicadores calculados en tiempo real a partir de ventas confirmadas en POS, descuentos comerciales otorgados, cotizaciones y órdenes de producción asociadas a este colaborador.
                      </p>

                      {metricsLoading ? (
                        <p className="personnel-inline-loading">Calculando métricas operativas…</p>
                      ) : (
                        <>
                          <div className="personnel-perf-grid">
                            <div className="personnel-perf-card">
                              <div className="personnel-perf-head">
                                <ShoppingBag size={15} />
                                <small>VENTAS CONFIRMADAS</small>
                              </div>
                              <b>{workerPerformance.salesCount} ventas</b>
                              <span>
                                {workerPerformance.salesMonthCount} en este mes · Total: {formatUsd(workerPerformance.revenueTotal)}
                              </span>
                            </div>

                            <div className="personnel-perf-card">
                              <div className="personnel-perf-head">
                                <TrendingUp size={15} />
                                <small>TICKET PROMEDIO Y MES</small>
                              </div>
                              <b>{formatUsd(workerPerformance.avgTicket)}</b>
                              <span>Facturación del mes: {formatUsd(workerPerformance.revenueMonth)}</span>
                            </div>

                            <div className="personnel-perf-card">
                              <div className="personnel-perf-head">
                                <Percent size={15} />
                                <small>DESCUENTOS COMERCIALES POS</small>
                              </div>
                              <b>{formatUsd(workerPerformance.discountsGrantedTotal)}</b>
                              <span>
                                {workerPerformance.discountedSalesCount} ventas con desc. · Promedio:{' '}
                                {workerPerformance.avgDiscountPct.toFixed(1)}%
                              </span>
                            </div>

                            <div className="personnel-perf-card">
                              <div className="personnel-perf-head">
                                <FileText size={15} />
                                <small>COTIZACIONES Y CONVERSIÓN</small>
                              </div>
                              <b>{workerPerformance.quotesTotal} propuestas</b>
                              <span>
                                {workerPerformance.quotesConverted} aprobadas ({workerPerformance.quoteConversionRate}% conversión)
                              </span>
                            </div>

                            <div className="personnel-perf-card">
                              <div className="personnel-perf-head">
                                <Wrench size={15} />
                                <small>ÓRDENES DE PRODUCCIÓN / TALLER</small>
                              </div>
                              <b>{workerPerformance.workshopTotal} órdenes</b>
                              <span>{workerPerformance.workshopCompleted} finalizadas / entregadas</span>
                            </div>

                            <div className="personnel-perf-card">
                              <div className="personnel-perf-head">
                                <Activity size={15} />
                                <small>PUNTUALIDAD Y ASISTENCIA</small>
                              </div>
                              <b>{workerAttendanceStats.punctualityRate}% puntual</b>
                              <span>
                                {workerAttendanceStats.presentDays + workerAttendanceStats.lateDays} asistencias registradas este mes
                              </span>
                            </div>
                          </div>

                          <div className="personnel-perf-lists">
                            <div>
                              <h4>Últimas ventas y descuentos aplicados</h4>
                              {!workerPerformance.recentSales.length ? (
                                <p className="personnel-inline-empty">
                                  Sin ventas vinculadas todavía. Asegúrate de vincular la cuenta Google del colaborador en la pestaña "Ficha y Accesos".
                                </p>
                              ) : (
                                <div className="personnel-compensation-list">
                                  {workerPerformance.recentSales.map((s) => (
                                    <article key={s.id}>
                                      <div>
                                        <b>
                                          {s.sale_number || 'Venta POS'} · {s.customer_name || 'Consumidor Final'}
                                        </b>
                                        <small>
                                          Total: {formatUsd(s.total)} · Cobrado: {formatUsd(s.paid_total)}
                                          {Number(s.discount_total) > 0
                                            ? ` · Descuento: ${formatUsd(s.discount_total)} (${s.discount_reason || 'sin motivo'})`
                                            : ''}
                                        </small>
                                      </div>
                                      <time>{dateTimeLabel(s.sold_at)}</time>
                                    </article>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}

                <p className="personnel-footnote">
                  <UserRound size={14} /> La ficha laboral y el acceso Google están vinculados. Cambiar o quitar el vínculo no pausa ni elimina los permisos; eso se gestiona desde Equipo y permisos.
                </p>
              </>
            )}
          </section>
        </div>
      ) : (
        <section className="panel personnel-first-record" aria-labelledby="personnel-first-record-title">
          <span className="personnel-first-record-icon">
            <CircleUserRound size={24} />
          </span>
          <span className="eyebrow">DIRECTORIO DE PERSONAL</span>
          <h2 id="personnel-first-record-title">Aún no hay fichas de personal</h2>
          <p>Crea una ficha para reunir los datos laborales, el acceso Google vinculado y el historial de cada persona en un solo lugar.</p>
          {canEdit && (
            <button className="button button-outline" type="button" onClick={openNew}>
              <Plus size={15} /> Crear primera ficha
            </button>
          )}
        </section>
      )}

      {modalOpen && (
        <div
          className="personnel-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <section className="personnel-modal panel" role="dialog" aria-modal="true" aria-labelledby="personnel-modal-title">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">FICHA LABORAL</span>
                <h2 id="personnel-modal-title">{editingRecord ? 'Editar ficha' : 'Nueva ficha de personal'}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveRecord}>
              <div className="personnel-form-grid">
                <label className="personnel-field-wide">
                  Nombre completo
                  <input
                    required
                    maxLength={160}
                    autoComplete="name"
                    value={draft.full_name}
                    onChange={(event) => setDraft((current) => ({ ...current, full_name: normalizePersonName(event.target.value) }))}
                  />
                </label>
                <label>
                  Correo de contacto
                  <input
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={draft.email}
                    onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    type="tel"
                    maxLength={40}
                    autoComplete="tel"
                    inputMode="tel"
                    value={draft.phone}
                    onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                  />
                </label>
                <label>
                  Área operativa
                  <input
                    maxLength={100}
                    value={draft.department}
                    onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))}
                    placeholder="Escribe o elige un área abajo"
                  />
                </label>
                <label>
                  Cargo
                  <input
                    maxLength={120}
                    value={draft.job_title}
                    onChange={(event) => setDraft((current) => ({ ...current, job_title: event.target.value }))}
                  />
                </label>
                <div className="personnel-field-wide personnel-dept-chips">
                  <span>Áreas sugeridas:</span>
                  {DEPARTMENT_SUGGESTIONS.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      className="personnel-chip-btn"
                      onClick={() => setDraft((current) => ({ ...current, department: dept }))}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
                <label>
                  Estado
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as RecordDraft['status'] }))}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </label>
                <label>
                  Fecha de ingreso
                  <input
                    type="date"
                    value={draft.start_date || ''}
                    onChange={(event) => setDraft((current) => ({ ...current, start_date: event.target.value }))}
                  />
                </label>
                <label>
                  Fecha de salida
                  <input
                    type="date"
                    value={draft.end_date || ''}
                    onChange={(event) => setDraft((current) => ({ ...current, end_date: event.target.value }))}
                  />
                </label>
              </div>
              {!editingRecord && canLinkAccount && (
                <section className="personnel-new-account">
                  <div className="personnel-new-account-heading">
                    <div>
                      <b>Cuenta del sistema</b>
                      <small>Vincula una cuenta de Google registrada y, si corresponde, define sus permisos.</small>
                    </div>
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => void loadGoogleAccounts()}
                      disabled={accountListLoading}
                    >
                      <RefreshCw size={14} />
                      Actualizar lista
                    </button>
                  </div>
                  <label>
                    Perfil de Google
                    <select
                      value={newGoogleAccountId}
                      onChange={(event) => {
                        const id = event.target.value;
                        const account = googleAccounts.find((row) => row.user_id === id);
                        setNewGoogleAccountId(id);
                        setNewGoogleProfileId('');
                        if (account)
                          setDraft((current) => ({ ...current, full_name: normalizePersonName(account.full_name), email: account.email }));
                      }}
                    >
                      <option value="">Crear ficha sin vincular por ahora</option>
                      {googleAccounts.map((account) => (
                        <option key={account.user_id} value={account.user_id} disabled={Boolean(account.linked_personnel_id)}>
                          {account.full_name} · {account.email}
                          {account.linked_personnel_id ? ` · Vinculada a ${account.linked_personnel_name}` : ''}
                          {account.access_profiles.length ? ` · ${account.access_profiles.join(', ')}` : ' · Sin perfil de acceso'}
                          {account.last_sign_in_at ? ` · ${dateTimeLabel(account.last_sign_in_at)}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {newGoogleAccountId && (
                    <label>
                      Permisos del sistema
                      <select value={newGoogleProfileId} onChange={(event) => setNewGoogleProfileId(event.target.value)}>
                        <option value="">Conservar permisos actuales</option>
                        {accessProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="personnel-privacy-hint">
                    <ShieldAlert size={15} /> Solo aparecen cuentas que ya iniciaron sesión con Google. Área y cargo describen el trabajo; los permisos se asignan por separado y se agregan a los accesos existentes.{' '}
                    {accountListLoading ? 'Sincronizando…' : `${googleAccounts.length} cuentas disponibles.`}
                  </p>
                </section>
              )}
              <p className="personnel-privacy-hint">
                <ShieldAlert size={15} /> Registra solo los datos necesarios para identificar y organizar la relación laboral. Esta ficha no almacena documentos de identidad, dirección domiciliaria ni datos de salud.
              </p>
              {error && (
                <p className="personnel-alert" role="alert">
                  {error}
                </p>
              )}
              <div className="personnel-modal-actions">
                <button type="button" className="button button-outline" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="button button-dark" disabled={saving || accountListLoading}>
                  <Check size={15} />
                  {saving ? 'Guardando…' : 'Guardar ficha'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
