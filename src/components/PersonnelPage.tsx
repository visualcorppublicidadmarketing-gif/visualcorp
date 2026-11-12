import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Calculator,
  CalendarCheck2,
  ClipboardList,
  Link2Off,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { PageHeading } from '../app/layout';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import { Avatar } from './ui/Avatar';
import { AnimatedTabs, type TabItem } from './ui/AnimatedTabs';
import { NumberTicker } from './magicui/NumberTicker';
import { EmptyState } from './feedback';
import { AttendanceStatusBadge, PersonnelStatusBadge, ReadinessBadge } from './personnel/personnelBadges';
import { PersonnelCreateEditDialog, type PersonnelFormValues } from './personnel/PersonnelCreateEditDialog';
import { PersonnelDailyRollCall } from './personnel/PersonnelDailyRollCall';
import {
  PersonnelDeductionTransitionDialog,
  type DeductionTransitionPayload,
} from './personnel/PersonnelDeductionTransitionDialog';
import { PersonnelDetailPanel, type DetailTabKey } from './personnel/PersonnelDetailPanel';
import { PersonnelPayrollOverview } from './personnel/PersonnelPayrollOverview';
import {
  buildAttendanceSummaryByMonth,
  ecuadorMonthIso,
  ecuadorTodayIso,
  evaluatePersonnelReadiness,
  resolveDayScheduleForMember,
  validateDeductionTransition,
} from './personnel/personnelDomain';
import type {
  AccessProfile,
  AttendanceEntry,
  CompensationEntry,
  DeductionStatus,
  GoogleAccount,
  OperationalMetricsState,
  PayrollDeduction,
  PersonnelEmploymentCompensation,
  PersonnelEmploymentCompensationStatus,
  PersonnelEmploymentExitType,
  PersonnelEmploymentPeriod,
  PersonnelEvent,
  PersonnelRecord,
  ProductionStepMetricRecord,
  QuoteMetricRecord,
  SalesMetricRecord,
  TeamAreaRotation,
  TeamWorkException,
  TeamWorkHour,
} from './personnel/personnelTypes';
import './personnel.css';

type WorkspaceMode = 'directory' | 'rollcall' | 'payroll';
type DirectoryQuickFilter = 'all' | 'active' | 'inactive' | 'unlinked' | 'incomplete';

export function PersonnelPage() {
  const { organizationId, user, roles, hasPermission } = useAuth();
  const { search: locationSearch } = useLocation();

  const canEdit = hasPermission('personnel', 'edit');
  const canViewCompensation = hasPermission('personnel', 'view_compensation');
  const canEditCompensation = hasPermission('personnel', 'edit_compensation');
  const canManageTeam = hasPermission('team', 'manage_members');
  const canViewSchedule =
    hasPermission('team_schedule', 'view') || roles.includes('owner') || roles.includes('admin');
  const isOwner = roles.includes('owner');

  const canViewSales = hasPermission('sales', 'view') || roles.includes('owner') || roles.includes('admin');
  const canViewQuotes = hasPermission('quotes', 'view') || roles.includes('owner') || roles.includes('admin');
  const canViewWorkshop =
    hasPermission('workshop', 'view') || roles.includes('owner') || roles.includes('admin');

  const attendanceStorageKey = organizationId
    ? `vc_personnel_attendance_v1_${organizationId}`
    : 'vc_personnel_attendance_v1';

  const [mode, setMode] = useState<WorkspaceMode>('directory');
  const [rollCallDate, setRollCallDate] = useState(() => ecuadorTodayIso());
  const [periodMonth, setPeriodMonth] = useState(() => ecuadorMonthIso());

  const [personnel, setPersonnel] = useState<PersonnelRecord[]>([]);
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccount[]>([]);
  const [accessProfiles, setAccessProfiles] = useState<AccessProfile[]>([]);
  const [workHours, setWorkHours] = useState<TeamWorkHour[]>([]);
  const [workExceptions, setWorkExceptions] = useState<TeamWorkException[]>([]);
  const [areaRotations, setAreaRotations] = useState<TeamAreaRotation[]>([]);

  const [allCompensation, setAllCompensation] = useState<CompensationEntry[]>([]);
  const [allDeductions, setAllDeductions] = useState<PayrollDeduction[]>([]);
  const [employmentPeriods, setEmploymentPeriods] = useState<PersonnelEmploymentPeriod[]>([]);
  const [employmentCompensation, setEmploymentCompensation] = useState<PersonnelEmploymentCompensation[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<PersonnelEvent[]>([]);

  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(locationSearch).get('ficha') || '');
  const [detailTab, setDetailTab] = useState<DetailTabKey>('ficha');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(() => Boolean(new URLSearchParams(locationSearch).get('ficha')));

  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<DirectoryQuickFilter>('active');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [accountBusy, setAccountBusy] = useState(false);
  const [compSaving, setCompSaving] = useState(false);
  const [deductionSaving, setDeductionSaving] = useState(false);
  const [employmentSaving, setEmploymentSaving] = useState(false);

  // Create / Edit Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [dialogSaving, setDialogSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');

  // Deduction transition Dialog state
  const [transitionDialog, setTransitionDialog] = useState<{
    open: boolean;
    deduction: PayrollDeduction | null;
    targetStatus: DeductionStatus | null;
    saving: boolean;
    error: string;
  }>({
    open: false,
    deduction: null,
    targetStatus: null,
    saving: false,
    error: '',
  });

  // Operational metrics across sales, quotes, production
  const [operationalMetrics, setOperationalMetrics] = useState<OperationalMetricsState>({
    loading: false,
    errors: [],
    sales: [],
    quotes: [],
    productionTasks: [],
  });

  // Attendance state (explicitly localStorage-backed per organization)
  const [attendanceByPersonnel, setAttendanceByPersonnel] = useState<Record<string, AttendanceEntry[]>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(attendanceStorageKey);
      if (!raw) {
        setAttendanceByPersonnel({});
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, AttendanceEntry[]>;
      if (parsed && typeof parsed === 'object') {
        setAttendanceByPersonnel(parsed);
      }
    } catch {
      setAttendanceByPersonnel({});
    }
  }, [attendanceStorageKey]);

  const persistAttendance = useCallback(
    (next: Record<string, AttendanceEntry[]>) => {
      setAttendanceByPersonnel(next);
      try {
        window.localStorage.setItem(attendanceStorageKey, JSON.stringify(next));
      } catch {
        // Private browsing or quota full; keep memory state active.
      }
    },
    [attendanceStorageKey],
  );

  // Sync deep-linked ?ficha=
  useEffect(() => {
    const paramFicha = new URLSearchParams(locationSearch).get('ficha');
    if (paramFicha) {
      setSelectedId(paramFicha);
      setMode('directory');
      setMobileDetailOpen(true);
    }
  }, [locationSearch]);

  const loadWorkspace = useCallback(async () => {
    if (!supabase || !organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage('');

    const personnelPromise = supabase
      .from('personnel_records')
      .select(
        'id,organization_id,full_name,email,phone,document_reference,home_address,home_city,home_maps_url,home_latitude,home_longitude,department,job_title,status,start_date,end_date,created_by,updated_by,created_at,updated_at',
      )
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true });

    const employmentPeriodsPromise = supabase
      .from('personnel_employment_periods')
      .select('id,organization_id,personnel_id,start_date,end_date,exit_type,exit_reason,source,created_by,created_at')
      .eq('organization_id', organizationId)
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    const employmentCompensationPromise = canViewCompensation
      ? supabase
          .from('personnel_employment_compensation')
          .select('period_id,organization_id,compensation_status,exit_notes,created_at')
          .eq('organization_id', organizationId)
      : Promise.resolve({ data: [] as PersonnelEmploymentCompensation[], error: null });

    const googlePromise =
      canManageTeam && canEdit
        ? supabase.rpc('list_visualcorp_personnel_accounts_with_avatars')
        : Promise.resolve({ data: [] as GoogleAccount[], error: null });

    const profilesPromise =
      canManageTeam && canEdit
        ? supabase.rpc('list_visualcorp_personnel_access_profiles')
        : Promise.resolve({ data: [] as AccessProfile[], error: null });

    const compPromise = canViewCompensation
      ? supabase
          .from('personnel_compensation_history')
          .select('id,organization_id,personnel_id,amount,currency_code,pay_period,effective_date,note,created_by,created_at')
          .eq('organization_id', organizationId)
          .order('effective_date', { ascending: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as CompensationEntry[], error: null });

    const dedPromise = canViewCompensation
      ? supabase
          .from('finance_payroll_deductions')
          .select(
            'id,organization_id,employee_user_id,personnel_id,description,amount,payroll_period,status,authorization_reference,evidence_reference,payroll_handoff_reference,payroll_handed_at,payroll_handed_by,note,created_by,created_at,reviewed_by,reviewed_at',
          )
          .eq('organization_id', organizationId)
          .order('payroll_period', { ascending: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as PayrollDeduction[], error: null });

    const hoursPromise = canViewSchedule
      ? supabase
          .from('team_work_hours')
          .select('organization_id,weekday,is_open,opens_at,closes_at')
          .eq('organization_id', organizationId)
          .order('weekday', { ascending: true })
      : Promise.resolve({ data: [] as TeamWorkHour[], error: null });

    const exceptionsPromise = canViewSchedule
      ? supabase
          .from('team_work_exceptions')
          .select('id,organization_id,work_date,user_id,kind,opens_at,closes_at,note')
          .eq('organization_id', organizationId)
          .gte('work_date', ecuadorTodayIso())
          .order('work_date', { ascending: true })
          .limit(80)
      : Promise.resolve({ data: [] as TeamWorkException[], error: null });

    const rotationsPromise = canViewSchedule
      ? supabase
          .from('team_area_rotations')
          .select('id,organization_id,area_name,task_name,weekday,starts_on,starts_at,ends_at,active,note')
          .eq('organization_id', organizationId)
          .eq('active', true)
      : Promise.resolve({ data: [] as TeamAreaRotation[], error: null });

    const rotationMembersPromise = canViewSchedule
      ? supabase
          .from('team_area_rotation_members')
          .select('rotation_id,user_id,position')
          .eq('organization_id', organizationId)
      : Promise.resolve({ data: [] as Array<{ rotation_id: string; user_id: string; position: number }>, error: null });

    const [
      personnelRes,
      employmentPeriodsRes,
      employmentCompensationRes,
      googleRes,
      profilesRes,
      compRes,
      dedRes,
      hoursRes,
      exceptionsRes,
      rotationsRes,
      rotationMembersRes,
    ] = await Promise.all([
      personnelPromise,
      employmentPeriodsPromise,
      employmentCompensationPromise,
      googlePromise,
      profilesPromise,
      compPromise,
      dedPromise,
      hoursPromise,
      exceptionsPromise,
      rotationsPromise,
      rotationMembersPromise,
    ]);

    const errors: string[] = [];
    if (personnelRes.error) errors.push(`Personal: ${personnelRes.error.message}`);
    if (employmentPeriodsRes.error) errors.push(`Historial laboral: ${employmentPeriodsRes.error.message}`);
    if (employmentCompensationRes.error) errors.push(`Liquidaciones de salida: ${employmentCompensationRes.error.message}`);
    if (googleRes.error) errors.push(`Cuentas Google: ${googleRes.error.message}`);
    if (profilesRes.error) errors.push(`Perfiles: ${profilesRes.error.message}`);
    if (compRes.error) errors.push(`Compensación: ${compRes.error.message}`);
    if (dedRes.error) errors.push(`Deducciones: ${dedRes.error.message}`);
    if (hoursRes.error) errors.push(`Horarios: ${hoursRes.error.message}`);
    if (errors.length > 0) {
      setErrorMessage(errors.join(' · '));
    }

    const loadedRecords = (personnelRes.data || []) as PersonnelRecord[];
    setPersonnel(loadedRecords);
    setEmploymentPeriods((employmentPeriodsRes.data || []) as PersonnelEmploymentPeriod[]);
    setEmploymentCompensation((employmentCompensationRes.data || []) as PersonnelEmploymentCompensation[]);
    setGoogleAccounts((googleRes.data || []) as GoogleAccount[]);
    setAccessProfiles((profilesRes.data || []) as AccessProfile[]);
    setAllCompensation((compRes.data || []) as CompensationEntry[]);
    setAllDeductions((dedRes.data || []) as PayrollDeduction[]);
    setWorkHours((hoursRes.data || []) as TeamWorkHour[]);
    setWorkExceptions((exceptionsRes.data || []) as TeamWorkException[]);

    const membersByRotation = new Map<string, Array<{ user_id: string; position: number }>>();
    for (const row of (rotationMembersRes.data || []) as Array<{ rotation_id: string; user_id: string; position: number }>) {
      const list = membersByRotation.get(row.rotation_id) || [];
      list.push({ user_id: row.user_id, position: row.position });
      membersByRotation.set(row.rotation_id, list);
    }
    setAreaRotations(
      ((rotationsRes.data || []) as TeamAreaRotation[]).map((rot) => ({
        ...rot,
        members: membersByRotation.get(rot.id) || [],
      })),
    );

    const urlFicha = new URLSearchParams(window.location.search).get('ficha');
    setSelectedId((prev) => {
      if (urlFicha && loadedRecords.some((item) => item.id === urlFicha)) return urlFicha;
      if (prev && loadedRecords.some((item) => item.id === prev)) return prev;
      return loadedRecords.find((item) => item.status === 'active')?.id || loadedRecords[0]?.id || '';
    });

    setLoading(false);
  }, [organizationId, canManageTeam, canEdit, canViewCompensation, canViewSchedule]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const loadOperationalMetrics = useCallback(async () => {
    if (!supabase || !organizationId) return;
    setOperationalMetrics((prev) => ({ ...prev, loading: true, errors: [] }));

    const salesPromise = canViewSales
      ? supabase
          .from('sales')
          .select(
            'id,sale_code,subtotal,discount_total,discount_reason,total,status,advisor_id,created_by,created_at,customers(full_name),sale_payments(amount)',
          )
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(300)
      : Promise.resolve({ data: null, error: null });

    const quotesPromise = canViewQuotes
      ? supabase
          .from('central_quotes')
          .select('id,quote_code,customer_name,status,chosen_tier,selected_total,created_by,created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(300)
      : Promise.resolve({ data: null, error: null });

    const jobsPromise = canViewWorkshop
      ? supabase
          .from('production_jobs')
          .select('id,title,status,sale_code,customer_name,due_at,updated_at')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: null, error: null });

    const stepsPromise = canViewWorkshop
      ? supabase
          .from('production_job_steps')
          .select('id,job_id,title,status,assigned_to,due_at,areas(name,code)')
          .eq('organization_id', organizationId)
          .limit(600)
      : Promise.resolve({ data: null, error: null });

    const legacyOrdersPromise = canViewWorkshop
      ? supabase
          .from('production_orders')
          .select('id,order_code,title,status,due_at,assigned_to,updated_at,areas(name,code)')
          .eq('organization_id', organizationId)
          .order('updated_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: null, error: null });

    const [salesRes, quotesRes, jobsRes, stepsRes, legacyRes] = await Promise.all([
      salesPromise,
      quotesPromise,
      jobsPromise,
      stepsPromise,
      legacyOrdersPromise,
    ]);

    const metricErrors: string[] = [];
    if (!canViewSales) metricErrors.push('Sin permiso para leer ventas (`sales.view`).');
    if (!canViewQuotes) metricErrors.push('Sin permiso para leer cotizaciones (`quotes.view`).');
    if (!canViewWorkshop) metricErrors.push('Sin permiso para leer taller (`workshop.view`).');
    if (salesRes.error) metricErrors.push(`Ventas: ${salesRes.error.message}`);
    if (quotesRes.error) metricErrors.push(`Cotizaciones: ${quotesRes.error.message}`);
    if (jobsRes.error) metricErrors.push(`Trabajos taller: ${jobsRes.error.message}`);
    if (stepsRes.error) metricErrors.push(`Pasos taller: ${stepsRes.error.message}`);
    if (legacyRes.error) metricErrors.push(`Órdenes heredadas: ${legacyRes.error.message}`);

    const parsedSales: SalesMetricRecord[] = ((salesRes.data || []) as any[]).map((row) => {
      const payments = Array.isArray(row.sale_payments) ? row.sale_payments : [];
      const paidTotal = payments.reduce((sum: number, p: any) => sum + (Number(p?.amount) || 0), 0);
      const totalNum = Number(row.total) || 0;
      const customerRel = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      return {
        id: row.id,
        sale_code: row.sale_code ?? null,
        customer_name: customerRel?.full_name || 'Cliente directo',
        subtotal: Number(row.subtotal) || 0,
        discount_total: Number(row.discount_total) || 0,
        discount_reason: row.discount_reason ?? null,
        total: totalNum,
        paid_total: paidTotal,
        balance_due: Math.max(0, totalNum - paidTotal),
        status: row.status,
        advisor_id: row.advisor_id ?? null,
        created_by: row.created_by ?? null,
        created_at: row.created_at,
      };
    });

    const parsedQuotes: QuoteMetricRecord[] = ((quotesRes.data || []) as any[]).map((row) => ({
      id: row.id,
      quote_code: row.quote_code ?? null,
      customer_name: row.customer_name ?? null,
      status: row.status,
      chosen_tier: row.chosen_tier ?? null,
      selected_total: Number(row.selected_total) || 0,
      created_by: row.created_by ?? null,
      created_at: row.created_at,
    }));

    const jobsMap = new Map<string, any>();
    for (const job of (jobsRes.data || []) as any[]) {
      jobsMap.set(job.id, job);
    }

    const parsedTasks: ProductionStepMetricRecord[] = [];
    for (const step of (stepsRes.data || []) as any[]) {
      const parentJob = jobsMap.get(step.job_id);
      const areaRel = Array.isArray(step.areas) ? step.areas[0] : step.areas;
      parsedTasks.push({
        id: step.id,
        job_id: step.job_id,
        job_title: parentJob?.title || step.title,
        job_status: parentJob?.status || step.status,
        sale_code: parentJob?.sale_code ?? null,
        customer_name: parentJob?.customer_name ?? null,
        step_title: step.title,
        area_code: areaRel?.code || '',
        area_name: areaRel?.name || '',
        status: step.status,
        assigned_to: step.assigned_to ?? null,
        due_at: step.due_at || parentJob?.due_at || null,
        updated_at: parentJob?.updated_at || '',
        source: 'workflow_step',
      });
    }

    for (const order of (legacyRes.data || []) as any[]) {
      const areaRel = Array.isArray(order.areas) ? order.areas[0] : order.areas;
      parsedTasks.push({
        id: order.id,
        job_id: order.id,
        job_title: order.title || order.order_code || 'Orden de taller',
        job_status: order.status,
        sale_code: order.order_code ?? null,
        customer_name: null,
        step_title: order.order_code ? `Orden ${order.order_code}` : 'Orden de producción',
        area_code: areaRel?.code || '',
        area_name: areaRel?.name || '',
        status: order.status,
        assigned_to: order.assigned_to ?? null,
        due_at: order.due_at ?? null,
        updated_at: order.updated_at || '',
        source: 'legacy_order',
      });
    }

    setOperationalMetrics({
      loading: false,
      errors: metricErrors,
      sales: parsedSales,
      quotes: parsedQuotes,
      productionTasks: parsedTasks,
    });
  }, [organizationId, canViewSales, canViewQuotes, canViewWorkshop]);

  useEffect(() => {
    void loadOperationalMetrics();
  }, [loadOperationalMetrics]);

  const loadSelectedEvents = useCallback(async () => {
    if (!supabase || !organizationId || !selectedId) {
      setSelectedEvents([]);
      return;
    }
    setDetailLoading(true);
    const { data, error } = await supabase
      .from('personnel_events')
      .select('id,organization_id,personnel_id,event_key,summary,changed_fields,salary_sensitive,actor_user_id,actor_label,created_at')
      .eq('organization_id', organizationId)
      .eq('personnel_id', selectedId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (!error && data) {
      setSelectedEvents(data as PersonnelEvent[]);
    }
    setDetailLoading(false);
  }, [organizationId, selectedId]);

  useEffect(() => {
    void loadSelectedEvents();
  }, [loadSelectedEvents]);

  // Derived maps
  const googleAccountByPersonnelId = useMemo(() => {
    const map = new Map<string, GoogleAccount>();
    for (const account of googleAccounts) {
      if (account.linked_personnel_id) {
        map.set(account.linked_personnel_id, account);
      }
    }
    return map;
  }, [googleAccounts]);

  const unlinkedGoogleAccounts = useMemo(
    () => googleAccounts.filter((account) => !account.linked_personnel_id),
    [googleAccounts],
  );

  const compensationByPersonnel = useMemo(() => {
    const map = new Map<string, CompensationEntry[]>();
    for (const entry of allCompensation) {
      const list = map.get(entry.personnel_id) || [];
      list.push(entry);
      map.set(entry.personnel_id, list);
    }
    return map;
  }, [allCompensation]);

  const deductionsByPersonnel = useMemo(() => {
    const map = new Map<string, PayrollDeduction[]>();
    for (const item of allDeductions) {
      if (!item.personnel_id) continue;
      const list = map.get(item.personnel_id) || [];
      list.push(item);
      map.set(item.personnel_id, list);
    }
    return map;
  }, [allDeductions]);

  const readinessByPersonnel = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluatePersonnelReadiness>>();
    for (const person of personnel) {
      const account = googleAccountByPersonnelId.get(person.id);
      const latestComp = (compensationByPersonnel.get(person.id) || [])[0];
      map.set(person.id, evaluatePersonnelReadiness(person, account, latestComp));
    }
    return map;
  }, [personnel, googleAccountByPersonnelId, compensationByPersonnel]);

  const departments = useMemo(
    () => [...new Set(personnel.map((item) => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [personnel],
  );

  // Actionable KPI computations
  const todayIso = ecuadorTodayIso();
  const kpiSummary = useMemo(() => {
    const activePeople = personnel.filter((p) => p.status === 'active');
    let checkedInToday = 0;
    let scheduledToday = 0;
    let monthIncidences = 0;
    let unlinkedCount = 0;
    let incompleteCount = 0;

    for (const person of activePeople) {
      const account = googleAccountByPersonnelId.get(person.id);
      if (!account) unlinkedCount += 1;
      const readiness = readinessByPersonnel.get(person.id);
      if (readiness && readiness.tier === 'incomplete') incompleteCount += 1;

      const schedule = resolveDayScheduleForMember(
        todayIso,
        account?.user_id,
        workHours,
        workExceptions,
        areaRotations,
      );
      if (!canViewSchedule || schedule.isWorkingDay) scheduledToday += 1;

      const entries = attendanceByPersonnel[person.id] || [];
      const todayEntry = entries.find((entry) => entry.date === todayIso);
      if (todayEntry && ['presente', 'en_campo', 'remoto', 'tardanza'].includes(todayEntry.status)) {
        checkedInToday += 1;
      }
      const monthStats = buildAttendanceSummaryByMonth(entries, periodMonth);
      monthIncidences += monthStats.lateCount + monthStats.absentCount;
    }

    const pendingDeductionsCount = allDeductions.filter((item) => item.status === 'pending_authorization').length;

    return {
      activeCount: activePeople.length,
      checkedInToday,
      scheduledToday,
      pendingDeductionsAndIncidences: pendingDeductionsCount + monthIncidences,
      pendingDeductionsCount,
      monthIncidences,
      unlinkedCount,
      incompleteCount,
    };
  }, [
    personnel,
    googleAccountByPersonnelId,
    readinessByPersonnel,
    todayIso,
    workHours,
    workExceptions,
    areaRotations,
    canViewSchedule,
    attendanceByPersonnel,
    periodMonth,
    allDeductions,
  ]);

  const filteredPersonnel = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return personnel.filter((person) => {
      if (quickFilter === 'active' && person.status !== 'active') return false;
      if (quickFilter === 'inactive' && person.status !== 'inactive') return false;
      if (quickFilter === 'unlinked' && (person.status !== 'active' || googleAccountByPersonnelId.has(person.id))) {
        return false;
      }
      if (quickFilter === 'incomplete' && (person.status !== 'active' || readinessByPersonnel.get(person.id)?.tier !== 'incomplete')) {
        return false;
      }
      if (departmentFilter !== 'all' && person.department !== departmentFilter) return false;
      if (!term) return true;
      return [
        person.full_name,
        person.department,
        person.job_title,
        person.email,
        person.phone,
        person.document_reference,
        person.home_address,
        person.home_city,
      ].some((val) =>
        val.toLowerCase().includes(term),
      );
    });
  }, [personnel, quickFilter, departmentFilter, searchTerm, googleAccountByPersonnelId, readinessByPersonnel]);

  const selected = useMemo(
    () => personnel.find((item) => item.id === selectedId) || null,
    [personnel, selectedId],
  );

  const selectedEmploymentPeriods = useMemo(
    () => employmentPeriods.filter((period) => period.personnel_id === selectedId),
    [employmentPeriods, selectedId],
  );
  const selectedEmploymentCompensation = useMemo(() => {
    const selectedPeriodIds = new Set(selectedEmploymentPeriods.map((period) => period.id));
    return employmentCompensation.filter((entry) => selectedPeriodIds.has(entry.period_id));
  }, [employmentCompensation, selectedEmploymentPeriods]);

  // Actions
  const handleSelectPerson = (personId: string, preferredTab?: DetailTabKey) => {
    setSelectedId(personId);
    if (preferredTab) setDetailTab(preferredTab);
    setMode('directory');
    setMobileDetailOpen(true);
  };

  const handleOpenCreateDialog = () => {
    setDialogMode('create');
    setDialogError('');
    setDialogOpen(true);
  };

  const handleOpenEditDialog = () => {
    if (!selected) return;
    setDialogMode('edit');
    setDialogError('');
    setDialogOpen(true);
  };

  const handleSubmitCreateEdit = async (values: PersonnelFormValues) => {
    if (!supabase || !organizationId) return;
    setDialogSaving(true);
    setDialogError('');
    setSuccessMessage('');

    const payload = {
      organization_id: organizationId,
      full_name: values.fullName,
      email: values.email,
      phone: values.phone,
      document_reference: values.documentReference,
      home_address: values.homeLocation.address,
      home_city: values.homeCity,
      home_maps_url: values.homeLocation.mapsUrl,
      home_latitude: values.homeLocation.latitude ? Number(values.homeLocation.latitude) : null,
      home_longitude: values.homeLocation.longitude ? Number(values.homeLocation.longitude) : null,
      department: values.department,
      job_title: values.jobTitle,
    };

    try {
      let savedPersonnelId = selected?.id || '';
      if (dialogMode === 'edit' && selected) {
        const { error } = await supabase
          .from('personnel_records')
          .update(payload)
          .eq('id', selected.id)
          .eq('organization_id', organizationId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('personnel_records')
          .insert({ ...payload, status: 'active', start_date: values.startDate || null, end_date: null })
          .select('id')
          .single();
        if (error) throw error;
        savedPersonnelId = data.id;
      }

      if (dialogMode === 'create' && savedPersonnelId && canManageTeam && canEdit) {
        if (values.googleUserId) {
          const { error: linkErr } = await supabase.rpc('link_visualcorp_personnel_google_account', {
            p_personnel_id: savedPersonnelId,
            p_user_id: values.googleUserId,
          });
          if (linkErr) throw linkErr;
        }
        const targetEmail =
          googleAccounts.find((g) => g.user_id === values.googleUserId)?.email || values.email;
        if (values.accessProfileId && targetEmail) {
          const { error: invErr } = await supabase.rpc('create_organization_access_invitation', {
            p_organization_id: organizationId,
            p_email: targetEmail,
            p_profile_id: values.accessProfileId,
          });
          if (invErr) throw invErr;
        }
      }

      setDialogOpen(false);
      await loadWorkspace();
      if (savedPersonnelId) setSelectedId(savedPersonnelId);
      await loadSelectedEvents();
      setSuccessMessage(
        dialogMode === 'create'
          ? `Ficha laboral creada para ${values.fullName}.`
          : `Ficha laboral actualizada para ${values.fullName}.`,
      );
    } catch (cause) {
      setDialogError(cause instanceof Error ? cause.message : 'No se pudo guardar la ficha de personal.');
    } finally {
      setDialogSaving(false);
    }
  };

  const handleCloseEmploymentPeriod = async (values: {
    endDate: string;
    exitType: PersonnelEmploymentExitType;
    exitReason: string;
    compensationStatus: PersonnelEmploymentCompensationStatus;
    exitNotes: string;
  }): Promise<boolean> => {
    if (!supabase || !organizationId || !selected) return false;
    const currentPeriod = selectedEmploymentPeriods.find((period) => period.end_date === null && period.exit_type === null);
    if (!currentPeriod) throw new Error('Esta ficha no tiene un período laboral vigente para cerrar.');
    setEmploymentSaving(true);
    try {
      const { error } = await supabase.rpc('close_visualcorp_personnel_employment_period', {
        p_period_id: currentPeriod.id,
        p_end_date: values.endDate,
        p_exit_type: values.exitType,
        p_exit_reason: values.exitReason.trim(),
        p_compensation_status: canEditCompensation ? values.compensationStatus : null,
        p_exit_notes: canEditCompensation ? values.exitNotes.trim() : null,
      });
      if (error) throw error;
      await loadWorkspace();
      await loadSelectedEvents();
      setSuccessMessage('Salida laboral registrada. El período anterior quedó guardado en el historial.');
      return true;
    } finally {
      setEmploymentSaving(false);
    }
  };

  const handleRehireEmployment = async (startDate: string): Promise<boolean> => {
    if (!supabase || !organizationId || !selected) return false;
    const lastEndDate = selectedEmploymentPeriods.reduce<string | null>((latest, period) => {
      if (!period.exit_type || !period.end_date) return latest;
      return !latest || period.end_date > latest ? period.end_date : latest;
    }, null);
    if (lastEndDate && startDate <= lastEndDate) {
      throw new Error('La fecha de reingreso debe ser posterior a la última salida registrada.');
    }
    setEmploymentSaving(true);
    try {
      const { error } = await supabase.from('personnel_employment_periods').insert({
        organization_id: organizationId,
        personnel_id: selected.id,
        start_date: startDate,
      });
      if (error) throw error;
      await loadWorkspace();
      await loadSelectedEvents();
      setSuccessMessage(`Reingreso de ${selected.full_name} registrado en un período nuevo.`);
      return true;
    } finally {
      setEmploymentSaving(false);
    }
  };

  const handleLinkGoogleAccount = async (userId: string) => {
    if (!supabase || !selected) return;
    setAccountBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    const { error } = await supabase.rpc('link_visualcorp_personnel_google_account', {
      p_personnel_id: selected.id,
      p_user_id: userId,
    });
    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage('Cuenta de Google vinculada correctamente a la ficha.');
      await loadWorkspace();
      await loadSelectedEvents();
    }
    setAccountBusy(false);
  };

  const handleUnlinkGoogleAccount = async () => {
    if (!supabase || !selected) return;
    setAccountBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    const { error } = await supabase.rpc('unlink_visualcorp_personnel_google_account', {
      p_personnel_id: selected.id,
    });
    if (error) {
      setErrorMessage(error.message);
    } else {
      setSuccessMessage('Cuenta de Google desvinculada de la ficha.');
      await loadWorkspace();
      await loadSelectedEvents();
    }
    setAccountBusy(false);
  };

  const handleInviteOrAssignProfile = async (email: string, profileId: string): Promise<boolean> => {
    if (!supabase || !organizationId) return false;
    setAccountBusy(true);
    setErrorMessage('');
    setSuccessMessage('');
    const { data, error } = await supabase.rpc('create_organization_access_invitation', {
      p_organization_id: organizationId,
      p_email: email,
      p_profile_id: profileId,
    });
    setAccountBusy(false);
    if (error) {
      setErrorMessage(error.message);
      return false;
    }
    const status = (data as { status?: string } | null)?.status;
    setSuccessMessage(
      status === 'assigned'
        ? `Perfil de acceso asignado inmediatamente a ${email}.`
        : `Invitación de acceso registrada para ${email} (se activará al iniciar sesión con Google).`,
    );
    await loadWorkspace();
    return true;
  };

  const handleSaveCompensation = async (payload: {
    amount: number;
    currencyCode: string;
    payPeriod: string;
    effectiveDate: string;
    note: string;
  }): Promise<boolean> => {
    if (!supabase || !organizationId || !selected) return false;
    setCompSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const { error } = await supabase.from('personnel_compensation_history').insert({
      organization_id: organizationId,
      personnel_id: selected.id,
      amount: payload.amount,
      currency_code: payload.currencyCode,
      pay_period: payload.payPeriod,
      effective_date: payload.effectiveDate,
      note: payload.note,
      created_by: user?.id,
    });
    setCompSaving(false);
    if (error) {
      setErrorMessage(
        error.message.includes('unique')
          ? `Ya existe un registro salarial para la fecha efectiva ${payload.effectiveDate}.`
          : error.message,
      );
      return false;
    }
    setSuccessMessage('Registro salarial agregado al historial inmutable.');
    await loadWorkspace();
    await loadSelectedEvents();
    return true;
  };

  const handleCreateDeduction = async (payload: {
    description: string;
    amount: number;
    payrollPeriod: string;
    note: string;
  }): Promise<boolean> => {
    if (!supabase || !organizationId || !selected) return false;
    setDeductionSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const { error } = await supabase.from('finance_payroll_deductions').insert({
      organization_id: organizationId,
      personnel_id: selected.id,
      description: payload.description,
      amount: payload.amount,
      payroll_period: payload.payrollPeriod,
      note: payload.note,
      status: 'pending_authorization',
      created_by: user?.id,
    });
    setDeductionSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return false;
    }
    setSuccessMessage('Solicitud de descuento registrada como "Por autorizar".');
    await loadWorkspace();
    return true;
  };

  const handleConfirmDeductionTransition = async (payload: DeductionTransitionPayload) => {
    const target = transitionDialog.deduction;
    const nextStatus = transitionDialog.targetStatus;
    if (!supabase || !organizationId || !target || !nextStatus) return;

    const validation = validateDeductionTransition(target.status, nextStatus, payload);
    if (validation.ok === false) {
      setTransitionDialog((prev) => ({ ...prev, error: validation.message }));
      return;
    }

    setTransitionDialog((prev) => ({ ...prev, saving: true, error: '' }));

    let updateBody: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'authorized') {
      updateBody = {
        status: 'authorized',
        authorization_reference: payload.authorizationReference,
        evidence_reference: payload.evidenceReference,
      };
    } else if (nextStatus === 'sent_to_payroll') {
      updateBody = {
        status: 'sent_to_payroll',
        payroll_handoff_reference: payload.payrollHandoffReference,
      };
    }

    const { error } = await supabase
      .from('finance_payroll_deductions')
      .update(updateBody)
      .eq('id', target.id)
      .eq('organization_id', organizationId);

    if (error) {
      setTransitionDialog((prev) => ({ ...prev, saving: false, error: error.message }));
      return;
    }

    setTransitionDialog({
      open: false,
      deduction: null,
      targetStatus: null,
      saving: false,
      error: '',
    });
    setSuccessMessage('Estado de deducción actualizado con referencias verificadas.');
    await loadWorkspace();
  };

  const handleRecordAttendance = (entry: Omit<AttendanceEntry, 'id' | 'recordedAt'>) => {
    if (!canEdit) return;
    const currentList = attendanceByPersonnel[entry.personnelId] || [];
    const nextEntry: AttendanceEntry = {
      ...entry,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      recordedAt: new Date().toISOString(),
    };
    const filtered = currentList.filter((item) => !(item.date === entry.date && entry.origin === 'roll_call_quick'));
    const nextList = [nextEntry, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
    persistAttendance({
      ...attendanceByPersonnel,
      [entry.personnelId]: nextList,
    });
    setSuccessMessage(`Marcación guardada para el ${entry.date}.`);
  };

  const handleDeleteAttendance = (entryId: string) => {
    if (!canEdit || !selected) return;
    const currentList = attendanceByPersonnel[selected.id] || [];
    persistAttendance({
      ...attendanceByPersonnel,
      [selected.id]: currentList.filter((item) => item.id !== entryId),
    });
  };

  const workspaceModeTabs: TabItem<WorkspaceMode>[] = useMemo(
    () => [
      { id: 'directory', label: 'Directorio y fichas', icon: <Users size={15} />, badge: personnel.length },
      { id: 'rollcall', label: 'Pase de lista hoy', icon: <CalendarCheck2 size={15} /> },
      {
        id: 'payroll',
        label: 'Pre-nómina EC y guía',
        icon: <Calculator size={15} />,
        disabled: !canViewCompensation,
        tooltip: !canViewCompensation ? 'Requiere permiso personnel.view_compensation' : undefined,
      },
    ],
    [personnel.length, canViewCompensation],
  );

  return (
    <div className="personnel-page">
      <PageHeading
        eyebrow="OPERACIONES · GESTIÓN DE EQUIPO"
        title="Personal, asistencia y pre-nómina"
        description="Directorio laboral separado del acceso digital, pase de lista sincronizado con horarios del local y trazabilidad de compensación y deducciones conforme al Código del Trabajo."
        action={
          <div className="personnel-header-actions">
            <button
              type="button"
              className="site-secondary-button"
              onClick={() => {
                void loadWorkspace();
                void loadOperationalMetrics();
              }}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'is-spinning' : ''} /> Actualizar
            </button>
            {canViewSchedule && (
              <Link className="site-secondary-button" to="/operaciones/equipo/horarios">
                <CalendarCheck2 size={14} /> Horarios y turnos
              </Link>
            )}
            {canEdit && (
              <button type="button" className="site-primary-button" onClick={handleOpenCreateDialog}>
                <Plus size={15} /> Nuevo colaborador
              </button>
            )}
          </div>
        }
      />

      {/* Actionable Clickable KPIs */}
      <section className="personnel-metrics" aria-label="Indicadores accionables de personal">
        <button
          type="button"
          className={`personnel-metric-card ${mode === 'rollcall' ? 'is-active' : ''}`}
          onClick={() => setMode('rollcall')}
        >
          <span className="personnel-metric-icon is-green">
            <CalendarCheck2 size={18} aria-hidden="true" />
          </span>
          <div>
            <span>Cobertura hoy (Ecuador)</span>
            <b className="tabular-nums">
              <NumberTicker value={kpiSummary.checkedInToday} /> / {kpiSummary.scheduledToday}
            </b>
            <small>
              {kpiSummary.activeCount} fichas activas · abrir pase de lista <ArrowUpRight size={11} />
            </small>
          </div>
        </button>

        <button
          type="button"
          className="personnel-metric-card"
          onClick={() => {
            if (kpiSummary.pendingDeductionsCount > 0 && canViewCompensation) {
              setMode('payroll');
            } else {
              setMode('rollcall');
            }
          }}
        >
          <span className="personnel-metric-icon is-amber">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div>
            <span>Incidencias y por autorizar</span>
            <b className="tabular-nums">
              <NumberTicker value={kpiSummary.pendingDeductionsAndIncidences} />
            </b>
            <small>
              {kpiSummary.pendingDeductionsCount} deducciones · {kpiSummary.monthIncidences} atrasos/faltas mes
            </small>
          </div>
        </button>

        <button
          type="button"
          className={`personnel-metric-card ${mode === 'directory' && quickFilter === 'unlinked' ? 'is-active' : ''}`}
          onClick={() => {
            setMode('directory');
            setQuickFilter((prev) => (prev === 'unlinked' ? 'active' : 'unlinked'));
          }}
        >
          <span className="personnel-metric-icon is-blue">
            <Link2Off size={18} aria-hidden="true" />
          </span>
          <div>
            <span>Fichas sin acceso Google</span>
            <b className="tabular-nums">
              <NumberTicker value={kpiSummary.unlinkedCount} />
            </b>
            <small>
              {quickFilter === 'unlinked' ? 'Filtro activo · clic para quitar' : 'Clic para filtrar y vincular cuentas'}
            </small>
          </div>
        </button>

        <button
          type="button"
          className={`personnel-metric-card ${mode === 'directory' && quickFilter === 'incomplete' ? 'is-active' : ''}`}
          onClick={() => {
            setMode('directory');
            setQuickFilter((prev) => (prev === 'incomplete' ? 'active' : 'incomplete'));
          }}
        >
          <span className="personnel-metric-icon is-magenta">
            <ClipboardList size={18} aria-hidden="true" />
          </span>
          <div>
            <span>Cumplimiento de ficha</span>
            <b className="tabular-nums">
              <NumberTicker value={kpiSummary.incompleteCount} />
            </b>
            <small>
              {kpiSummary.incompleteCount === 0
                ? 'Todas las fichas activas completas'
                : 'Faltan datos legales, ingreso o sueldo base'}
            </small>
          </div>
        </button>
      </section>

      {/* Alerts */}
      {errorMessage && (
        <div className="personnel-alert is-error" role="alert">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="personnel-success" role="status">
          <BadgeCheck size={15} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Unlinked Google Accounts Helper Banner */}
      {canManageTeam && canEdit && unlinkedGoogleAccounts.length > 0 && mode === 'directory' && (
        <div className="personnel-sync-callout">
          <div className="personnel-banner-copy">
            <UserPlus size={16} aria-hidden="true" />
            <div>
              <b>
                Hay {unlinkedGoogleAccounts.length} cuenta(s) con acceso a Suite que aún no están vinculadas a una ficha laboral
              </b>
              <small>
                Ej.: {unlinkedGoogleAccounts.slice(0, 3).map((acc) => acc.full_name || acc.email).join(', ')}. Vincúlalas en una ficha existente o crea una nueva para habilitar horarios y métricas por persona.
              </small>
            </div>
          </div>
          <Link className="site-secondary-button" to="/operaciones/equipo/usuarios">
            Ver usuarios del equipo <ArrowUpRight size={13} />
          </Link>
        </div>
      )}

      {/* Top Mode Switcher */}
      <div className="personnel-mode-bar">
        <AnimatedTabs
          tabs={workspaceModeTabs}
          activeId={mode}
          onChange={(nextId) => setMode(nextId as WorkspaceMode)}
          ariaLabel="Vistas principales de Personal"
          variant="pills"
          size="md"
          layoutId="personnel-workspace-mode"
        />
      </div>

      {/* MODE 1: DIRECTORY + DETAIL (Master-Detail) */}
      {mode === 'directory' && (
        <div className={`personnel-workspace ${mobileDetailOpen ? 'is-mobile-detail' : ''}`}>
          {/* Master Directory */}
          <aside className="personnel-directory" aria-label="Directorio de colaboradores">
            <div className="personnel-filters">
              <label className="personnel-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Buscar nombre, cargo, área o correo…"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>

              <div className="personnel-filter-row">
                <select
                  aria-label="Filtrar por estado de ficha"
                  value={quickFilter}
                  onChange={(event) => setQuickFilter(event.target.value as DirectoryQuickFilter)}
                >
                  <option value="active">Activos ({personnel.filter((p) => p.status === 'active').length})</option>
                  <option value="inactive">Inactivos ({personnel.filter((p) => p.status === 'inactive').length})</option>
                  <option value="unlinked">Sin cuenta Google ({kpiSummary.unlinkedCount})</option>
                  <option value="incomplete">Ficha incompleta ({kpiSummary.incompleteCount})</option>
                  <option value="all">Todos ({personnel.length})</option>
                </select>

                <select
                  aria-label="Filtrar por área"
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                >
                  <option value="all">Todas las áreas</option>
                  {departments.map((dep) => (
                    <option key={dep} value={dep}>
                      {dep}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <p className="personnel-inline-loading">Cargando fichas laborales…</p>
            ) : filteredPersonnel.length === 0 ? (
              <div className="personnel-empty">
                <EmptyState
                  icon={Users}
                  title={personnel.length === 0 ? 'Aún no hay fichas de personal' : 'Ninguna ficha coincide con el filtro'}
                  text={
                    personnel.length === 0
                      ? 'Crea la primera ficha laboral para administrar asistencia, horarios y trazabilidad de nómina.'
                      : 'Prueba limpiando la búsqueda o cambiando el filtro de estado.'
                  }
                />
                {personnel.length === 0 && canEdit && (
                  <button type="button" className="site-primary-button" onClick={handleOpenCreateDialog}>
                    <Plus size={15} /> Crear primera ficha
                  </button>
                )}
              </div>
            ) : (
              <div className="personnel-list" role="listbox" aria-label="Lista de personal">
                {filteredPersonnel.map((person) => {
                  const account = googleAccountByPersonnelId.get(person.id);
                  const readiness = readinessByPersonnel.get(person.id);
                  const todayAtt = (attendanceByPersonnel[person.id] || []).find((e) => e.date === todayIso);
                  const isSelected = person.id === selectedId;

                  return (
                    <button
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`personnel-list-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectPerson(person.id)}
                    >
                      <Avatar name={person.full_name} src={account?.avatar_url} size="sm" />
                      <div className="personnel-list-copy">
                        <div className="personnel-list-top">
                          <b>{person.full_name}</b>
                          <PersonnelStatusBadge status={person.status} />
                        </div>
                        <small>
                          <Briefcase size={11} aria-hidden="true" /> {person.job_title || 'Sin cargo'} ·{' '}
                          {person.department || 'Sin área'}
                        </small>
                        <div className="personnel-list-meta">
                          {todayAtt && <AttendanceStatusBadge status={todayAtt.status} compact />}
                          {readiness && (
                            <ReadinessBadge tier={readiness.tier} score={readiness.score} maxScore={readiness.maxScore} />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Detail Object Page */}
          <PersonnelDetailPanel
            selected={selected}
            activeTab={detailTab}
            onChangeTab={setDetailTab}
            readiness={selected ? readinessByPersonnel.get(selected.id) || null : null}
            linkedAccount={selected ? googleAccountByPersonnelId.get(selected.id) : undefined}
            unlinkedGoogleAccounts={unlinkedGoogleAccounts}
            accessProfiles={accessProfiles}
            events={selectedEvents}
            compensationHistory={selected ? compensationByPersonnel.get(selected.id) || [] : []}
            employmentPeriods={selectedEmploymentPeriods}
            employmentCompensation={selectedEmploymentCompensation}
            deductions={selected ? deductionsByPersonnel.get(selected.id) || [] : []}
            attendanceEntries={selected ? attendanceByPersonnel[selected.id] || [] : []}
            workHours={workHours}
            workExceptions={workExceptions}
            areaRotations={areaRotations}
            operationalMetrics={operationalMetrics}
            detailLoading={detailLoading}
            canEdit={canEdit}
            canViewCompensation={canViewCompensation}
            canEditCompensation={canEditCompensation}
            canManageTeam={canManageTeam}
            canViewSchedule={canViewSchedule}
            employmentSaving={employmentSaving}
            isOwner={isOwner}
            periodMonth={periodMonth}
            onChangePeriodMonth={setPeriodMonth}
            onBackToDirectory={() => setMobileDetailOpen(false)}
            onEditSelected={handleOpenEditDialog}
            onCloseEmploymentPeriod={handleCloseEmploymentPeriod}
            onRehireEmployment={handleRehireEmployment}
            onLinkGoogleAccount={handleLinkGoogleAccount}
            onUnlinkGoogleAccount={handleUnlinkGoogleAccount}
            onInviteOrAssignProfile={handleInviteOrAssignProfile}
            onSaveCompensation={handleSaveCompensation}
            onCreateDeduction={handleCreateDeduction}
            onRequestDeductionTransition={(deduction, targetStatus) =>
              setTransitionDialog({
                open: true,
                deduction,
                targetStatus,
                saving: false,
                error: '',
              })
            }
            onRecordAttendance={handleRecordAttendance}
            onDeleteAttendance={handleDeleteAttendance}
            accountBusy={accountBusy}
            compSaving={compSaving}
            deductionSaving={deductionSaving}
          />
        </div>
      )}

      {/* MODE 2: DAILY ROLL CALL */}
      {mode === 'rollcall' && (
        <PersonnelDailyRollCall
          dateIso={rollCallDate}
          onChangeDate={setRollCallDate}
          personnel={personnel}
          googleAccountByPersonnelId={googleAccountByPersonnelId}
          attendanceEntries={Object.values(attendanceByPersonnel).flat()}
          workHours={workHours}
          workExceptions={workExceptions}
          areaRotations={areaRotations}
          canViewSchedule={canViewSchedule}
          canEdit={canEdit}
          onQuickMark={({ personnelId, date, status, checkIn, lateMinutes, note }) =>
            handleRecordAttendance({
              personnelId,
              date,
              status,
              checkIn,
              lateMinutes,
              note: note || '',
              origin: 'roll_call_quick',
            })
          }
          onOpenPersonnel={(id, tab) => handleSelectPerson(id, tab)}
        />
      )}

      {/* MODE 3: ECUADOR PAYROLL OVERVIEW */}
      {mode === 'payroll' && (
        <PersonnelPayrollOverview
          periodMonth={periodMonth}
          onChangePeriodMonth={setPeriodMonth}
          personnel={personnel}
          compensationByPersonnel={compensationByPersonnel}
          deductions={allDeductions}
          canViewCompensation={canViewCompensation}
          onOpenPersonnel={(id, tab) => handleSelectPerson(id, tab)}
        />
      )}

      {/* DIALOGS */}
      <PersonnelCreateEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        editingRecord={dialogMode === 'edit' ? selected : null}
        availableGoogleAccounts={unlinkedGoogleAccounts}
        accessProfiles={accessProfiles}
        isOwner={isOwner}
        canManageTeam={canManageTeam && canEdit}
        saving={dialogSaving}
        errorMessage={dialogError}
        onSubmit={handleSubmitCreateEdit}
      />

      <PersonnelDeductionTransitionDialog
        open={transitionDialog.open}
        onOpenChange={(open) => setTransitionDialog((prev) => ({ ...prev, open }))}
        deduction={transitionDialog.deduction}
        targetStatus={transitionDialog.targetStatus}
        personName={
          personnel.find((p) => p.id === transitionDialog.deduction?.personnel_id)?.full_name ||
          selected?.full_name ||
          'Colaborador'
        }
        saving={transitionDialog.saving}
        errorMessage={transitionDialog.error}
        onConfirm={handleConfirmDeductionTransition}
      />
    </div>
  );
}
