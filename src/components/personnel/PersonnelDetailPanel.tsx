import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeDollarSign,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  History,
  Info,
  Link2,
  Mail,
  OctagonAlert,
  Phone,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Unlink,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimatedTabs, type TabItem } from '../ui/AnimatedTabs';
import { Avatar } from '../ui/Avatar';
import { SelectDropdown, type SelectDropdownOption } from '../ui/SelectDropdown';
import { EmptyState } from '../feedback';
import {
  AttendanceStatusBadge,
  DeductionStatusBadge,
  PersonnelStatusBadge,
  ReadinessBadge,
} from './personnelBadges';
import {
  ATTENDANCE_META,
  buildAttendanceSummaryByMonth,
  buildCsvDocument,
  calculateEcuadorLaborEntitlements,
  calculateMonthlyEquivalent,
  calculateProportionalTimeDeduction,
  computeLateMinutes,
  DEDUCTION_STATUS_META,
  ecuadorNowTime,
  ecuadorTodayIso,
  evaluateArt44FineLimit,
  formatEcuadorDate,
  formatEcuadorDateTime,
  formatMoney,
  getAllowedDeductionTransitions,
  getEcuadorFiscalConfig,
  PAY_PERIOD_OPTIONS,
  resolveDayScheduleForMember,
  resolveRoleFamily,
  summarizeDeductionsByPeriod,
} from './personnelDomain';
import type {
  AccessProfile,
  AttendanceEntry,
  AttendanceStatus,
  CompensationEntry,
  DeductionStatus,
  GoogleAccount,
  OperationalMetricsState,
  PayrollDeduction,
  PersonnelEvent,
  PersonnelRecord,
  ProfileReadinessBreakdown,
  TeamAreaRotation,
  TeamWorkException,
  TeamWorkHour,
} from './personnelTypes';

export type DetailTabKey = 'ficha' | 'salarios' | 'asistencia' | 'metricas';

interface PersonnelDetailPanelProps {
  selected: PersonnelRecord | null;
  activeTab: DetailTabKey;
  onChangeTab: (tab: DetailTabKey) => void;
  readiness: ProfileReadinessBreakdown | null;
  linkedAccount: GoogleAccount | undefined;
  unlinkedGoogleAccounts: GoogleAccount[];
  accessProfiles: AccessProfile[];
  events: PersonnelEvent[];
  compensationHistory: CompensationEntry[];
  deductions: PayrollDeduction[];
  attendanceEntries: AttendanceEntry[];
  workHours: TeamWorkHour[];
  workExceptions: TeamWorkException[];
  areaRotations: TeamAreaRotation[];
  operationalMetrics: OperationalMetricsState;
  detailLoading: boolean;
  canEdit: boolean;
  canViewCompensation: boolean;
  canEditCompensation: boolean;
  canManageTeam: boolean;
  canViewSchedule: boolean;
  isOwner: boolean;
  periodMonth: string;
  onChangePeriodMonth: (month: string) => void;
  onBackToDirectory?: () => void;
  onEditSelected: () => void;
  onLinkGoogleAccount: (userId: string) => Promise<void>;
  onUnlinkGoogleAccount: () => Promise<void>;
  onInviteOrAssignProfile: (email: string, profileId: string) => Promise<boolean>;
  onSaveCompensation: (payload: {
    amount: number;
    currencyCode: string;
    payPeriod: string;
    effectiveDate: string;
    note: string;
  }) => Promise<boolean>;
  onCreateDeduction: (payload: {
    description: string;
    amount: number;
    payrollPeriod: string;
    note: string;
  }) => Promise<boolean>;
  onRequestDeductionTransition: (deduction: PayrollDeduction, targetStatus: DeductionStatus) => void;
  onRecordAttendance: (entry: Omit<AttendanceEntry, 'id' | 'recordedAt'>) => void;
  onDeleteAttendance: (entryId: string) => void;
  accountBusy: boolean;
  compSaving: boolean;
  deductionSaving: boolean;
}

const ADMIN_PROFILE_KEYS = new Set(['owner', 'admin', 'website_admin']);

export function PersonnelDetailPanel({
  selected,
  activeTab,
  onChangeTab,
  readiness,
  linkedAccount,
  unlinkedGoogleAccounts,
  accessProfiles,
  events,
  compensationHistory,
  deductions,
  attendanceEntries,
  workHours,
  workExceptions,
  areaRotations,
  operationalMetrics,
  detailLoading,
  canEdit,
  canViewCompensation,
  canEditCompensation,
  canManageTeam,
  canViewSchedule,
  isOwner,
  periodMonth,
  onChangePeriodMonth,
  onBackToDirectory,
  onEditSelected,
  onLinkGoogleAccount,
  onUnlinkGoogleAccount,
  onInviteOrAssignProfile,
  onSaveCompensation,
  onCreateDeduction,
  onRequestDeductionTransition,
  onRecordAttendance,
  onDeleteAttendance,
  accountBusy,
  compSaving,
  deductionSaving,
}: PersonnelDetailPanelProps) {
  const todayIso = ecuadorTodayIso();
  const fiscalConfig = getEcuadorFiscalConfig(Number(periodMonth.slice(0, 4)) || undefined);

  // Privacy toggle for sensitive salary values (auto-hides after 60s)
  const [revealSalary, setRevealSalary] = useState(false);
  useEffect(() => {
    setRevealSalary(false);
  }, [selected?.id]);
  useEffect(() => {
    if (!revealSalary) return undefined;
    const timer = window.setTimeout(() => setRevealSalary(false), 60_000);
    return () => window.clearTimeout(timer);
  }, [revealSalary]);

  // Account & profile linking controls
  const [googleUserIdInput, setGoogleUserIdInput] = useState('');
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [inviteProfileIdInput, setInviteProfileIdInput] = useState('');

  useEffect(() => {
    setGoogleUserIdInput('');
    setInviteProfileIdInput('');
    setInviteEmailInput(linkedAccount?.email || selected?.email || '');
  }, [selected?.id, linkedAccount?.email, selected?.email]);

  // Compensation form state
  const [compAmount, setCompAmount] = useState('');
  const [compCurrency, setCompCurrency] = useState('USD');
  const [compPayPeriod, setCompPayPeriod] = useState<string>('Mensual');
  const [compEffectiveDate, setCompEffectiveDate] = useState(() => ecuadorTodayIso());
  const [compNote, setCompNote] = useState('');

  // Deduction form state
  const [dedDesc, setDedDesc] = useState('');
  const [dedAmount, setDedAmount] = useState('');
  const [dedPeriod, setDedPeriod] = useState(() => `${ecuadorTodayIso().slice(0, 7)}-01`);
  const [dedNote, setDedNote] = useState('');
  const [dedStatusFilter, setDedStatusFilter] = useState<'all' | DeductionStatus>('all');
  const [dedIsDisciplinaryFine, setDedIsDisciplinaryFine] = useState(false);
  const [hasApprovedInternalReg, setHasApprovedInternalReg] = useState(false);
  const [dedLocalWarning, setDedLocalWarning] = useState('');

  useEffect(() => {
    setDedPeriod(`${periodMonth.slice(0, 7)}-01`);
  }, [periodMonth]);

  // Attendance form state
  const [attDate, setAttDate] = useState(() => ecuadorTodayIso());
  const [attStatus, setAttStatus] = useState<AttendanceStatus>('presente');
  const [attCheckIn, setAttCheckIn] = useState('08:00');
  const [attCheckOut, setAttCheckOut] = useState('17:30');
  const [attLateMinutes, setAttLateMinutes] = useState('0');
  const [attLocationNote, setAttLocationNote] = useState('');
  const [attNote, setAttNote] = useState('');
  const [attConversionNotice, setAttConversionNotice] = useState('');

  const assignableProfiles = useMemo(
    () =>
      accessProfiles.filter((profile) =>
        isOwner ? profile.profile_key !== 'owner' : !ADMIN_PROFILE_KEYS.has(profile.profile_key),
      ),
    [accessProfiles, isOwner],
  );

  const googleAccountOptions: SelectDropdownOption[] = useMemo(
    () =>
      unlinkedGoogleAccounts.map((account) => ({
        value: account.user_id,
        label: account.full_name || account.email,
        description: account.email,
        badge: account.access_profiles[0] || 'Sin perfil',
      })),
    [unlinkedGoogleAccounts],
  );

  const profileOptions: SelectDropdownOption[] = useMemo(
    () =>
      assignableProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name,
        description: profile.profile_key,
      })),
    [assignableProfiles],
  );

  const latestCompensation = compensationHistory[0] || null;
  const monthlyEquivalentSalary = latestCompensation
    ? calculateMonthlyEquivalent(Number(latestCompensation.amount), latestCompensation.pay_period)
    : null;

  const periodDeductionSummary = useMemo(
    () => summarizeDeductionsByPeriod(deductions, periodMonth),
    [deductions, periodMonth],
  );

  const estimatedNetPay =
    monthlyEquivalentSalary != null
      ? Math.max(0, monthlyEquivalentSalary - periodDeductionSummary.deductibleTotal)
      : null;

  const entitlements = useMemo(
    () =>
      calculateEcuadorLaborEntitlements(
        selected?.start_date,
        todayIso,
        monthlyEquivalentSalary ?? 0,
        fiscalConfig,
      ),
    [selected?.start_date, todayIso, monthlyEquivalentSalary, fiscalConfig],
  );

  const todaySchedule = useMemo(
    () =>
      resolveDayScheduleForMember(
        todayIso,
        linkedAccount?.user_id,
        workHours,
        workExceptions,
        areaRotations,
      ),
    [todayIso, linkedAccount?.user_id, workHours, workExceptions, areaRotations],
  );

  const attendanceMonthSummary = useMemo(
    () => buildAttendanceSummaryByMonth(attendanceEntries, periodMonth),
    [attendanceEntries, periodMonth],
  );

  const consecutiveAbsencesWarning = useMemo(() => {
    const absents = attendanceMonthSummary.monthEntries
      .filter((entry) => entry.status === 'falta')
      .map((entry) => entry.date)
      .sort();
    if (absents.length < 3) return false;
    let streak = 1;
    for (let i = 1; i < absents.length; i += 1) {
      const prev = new Date(`${absents[i - 1]}T12:00:00-05:00`).getTime();
      const curr = new Date(`${absents[i]}T12:00:00-05:00`).getTime();
      if (Math.round((curr - prev) / 86_400_000) <= 1) {
        streak += 1;
        if (streak >= 3) return true;
      } else {
        streak = 1;
      }
    }
    return false;
  }, [attendanceMonthSummary.monthEntries]);

  const roleFamily = useMemo(
    () =>
      selected
        ? resolveRoleFamily(selected.department, selected.job_title, linkedAccount?.access_profiles || [])
        : 'general',
    [selected, linkedAccount?.access_profiles],
  );

  const workerMetrics = useMemo(() => {
    const userId = linkedAccount?.user_id;
    const personNameNorm = (selected?.full_name || '').trim().toLowerCase();
    if (!selected) {
      return {
        sales: [],
        quotes: [],
        acceptedQuotes: [],
        salesTotal: 0,
        collectedTotal: 0,
        avgTicket: 0,
        discountTotal: 0,
        conversionRate: 0,
        productionTasks: [],
        activeTasks: 0,
        blockedTasks: 0,
        completedTasks: 0,
      };
    }

    const sales = userId
      ? operationalMetrics.sales.filter(
          (sale) =>
            sale.status !== 'cancelled' &&
            (sale.advisor_id === userId || sale.created_by === userId),
        )
      : [];

    const quotes = userId
      ? operationalMetrics.quotes.filter((quote) => quote.created_by === userId)
      : [];

    const acceptedQuotes = quotes.filter(
      (quote) => quote.status === 'accepted' || quote.status === 'converted',
    );

    const salesTotal = sales.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const collectedTotal = sales.reduce((sum, item) => sum + (Number(item.paid_total) || 0), 0);
    const discountTotal = sales.reduce((sum, item) => sum + (Number(item.discount_total) || 0), 0);
    const avgTicket = sales.length > 0 ? salesTotal / sales.length : 0;
    const conversionRate = quotes.length > 0 ? Math.round((acceptedQuotes.length / quotes.length) * 100) : 0;

    const productionTasks = operationalMetrics.productionTasks.filter((task) => {
      if (userId && task.assigned_to === userId) return true;
      if (personNameNorm && task.assigned_to && task.assigned_to.toLowerCase().includes(personNameNorm)) {
        return true;
      }
      return false;
    });

    const completedTasks = productionTasks.filter((task) => task.status === 'completed').length;
    const blockedTasks = productionTasks.filter(
      (task) => task.status === 'blocked' || task.status === 'needs_review',
    ).length;
    const activeTasks = productionTasks.filter(
      (task) => task.status !== 'completed' && task.status !== 'cancelled',
    ).length;

    return {
      sales,
      quotes,
      acceptedQuotes,
      salesTotal,
      collectedTotal,
      avgTicket,
      discountTotal,
      conversionRate,
      productionTasks,
      activeTasks,
      blockedTasks,
      completedTasks,
    };
  }, [selected, linkedAccount?.user_id, operationalMetrics]);

  const filteredDeductions = useMemo(() => {
    if (dedStatusFilter === 'all') return deductions;
    return deductions.filter((item) => item.status === dedStatusFilter);
  }, [deductions, dedStatusFilter]);

  const detailTabs: TabItem<DetailTabKey>[] = useMemo(
    () => [
      { id: 'ficha', label: 'Ficha, cuenta y turnos', icon: <UserCheck size={14} /> },
      {
        id: 'salarios',
        label: 'Compensación y deducciones',
        icon: <BadgeDollarSign size={14} />,
        badge: deductions.filter((d) => d.status === 'pending_authorization').length || undefined,
      },
      {
        id: 'asistencia',
        label: 'Asistencia e incidencias',
        icon: <Clock size={14} />,
        badge: attendanceMonthSummary.lateCount + attendanceMonthSummary.absentCount || undefined,
      },
      { id: 'metricas', label: 'Carga y rendimiento', icon: <TrendingUp size={14} /> },
    ],
    [deductions, attendanceMonthSummary.lateCount, attendanceMonthSummary.absentCount],
  );

  if (!selected) {
    return (
      <section className="personnel-detail-panel personnel-detail-placeholder">
        <EmptyState
          icon={Users}
          title="Selecciona un colaborador del directorio"
          text="Elige una ficha para revisar su cumplimiento laboral, horarios del día, compensación, asistencias y carga operativa por área."
        />
      </section>
    );
  }

  const parsedDedAmount = Number(dedAmount);
  const fineCheck = evaluateArt44FineLimit(monthlyEquivalentSalary ?? 0, parsedDedAmount || 0, fiscalConfig);

  const handleSaveComp = async (event: React.FormEvent) => {
    event.preventDefault();
    const numeric = Number(compAmount);
    if (!Number.isFinite(numeric) || numeric < 0) return;
    const ok = await onSaveCompensation({
      amount: numeric,
      currencyCode: compCurrency.trim().toUpperCase() || 'USD',
      payPeriod: compPayPeriod,
      effectiveDate: compEffectiveDate,
      note: compNote.trim(),
    });
    if (ok) {
      setCompAmount('');
      setCompNote('');
    }
  };

  const handleCreateDed = async (event: React.FormEvent) => {
    event.preventDefault();
    setDedLocalWarning('');
    const numeric = Number(dedAmount);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setDedLocalWarning('Ingresa un monto mayor a $0.00.');
      return;
    }
    if (dedIsDisciplinaryFine && !hasApprovedInternalReg) {
      setDedLocalWarning(
        'Código del Trabajo Art. 44 literal a: las multas disciplinarias requieren Reglamento Interno aprobado por el Ministerio del Trabajo/SUT. Si corresponde a atraso/ausencia, desmarca "Multa disciplinaria" y usa descuento proporcional de tiempo no trabajado.',
      );
      return;
    }
    if (dedIsDisciplinaryFine && fineCheck.exceedsTenPercentCap) {
      setDedLocalWarning(
        `Art. 44 literal b: una multa no puede superar el 10% de la remuneración mensual (máximo sugerido ${formatMoney(fineCheck.maxAllowedFine)}).`,
      );
      return;
    }

    const ok = await onCreateDeduction({
      description: dedDesc.trim(),
      amount: numeric,
      payrollPeriod: dedPeriod,
      note: dedNote.trim(),
    });
    if (ok) {
      setDedDesc('');
      setDedAmount('');
      setDedNote('');
      setDedLocalWarning('');
      setDedIsDisciplinaryFine(false);
    }
  };

  const handleSubmitAttendance = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const expectsTime = ATTENDANCE_META[attStatus].expectsTime;
    onRecordAttendance({
      personnelId: selected.id,
      date: attDate,
      status: attStatus,
      checkIn: expectsTime ? attCheckIn : undefined,
      checkOut: expectsTime && attCheckOut ? attCheckOut : undefined,
      lateMinutes: attStatus === 'tardanza' ? Math.max(0, Number(attLateMinutes) || 0) : 0,
      locationNote: attLocationNote.trim() || undefined,
      note: attNote.trim(),
      origin: 'manual_supervisor',
    });
    setAttNote('');
    setAttLocationNote('');
  };

  const handleQuickLocalCheckin = (status: AttendanceStatus) => {
    if (!canEdit) return;
    const nowHm = ecuadorNowTime();
    const expectedStart = todaySchedule.opensAt || '08:00';
    const lateMins = status === 'tardanza' ? Math.max(5, computeLateMinutes(nowHm, expectedStart)) : 0;
    onRecordAttendance({
      personnelId: selected.id,
      date: todayIso,
      status,
      checkIn: ATTENDANCE_META[status].expectsTime ? nowHm : undefined,
      lateMinutes: lateMins,
      note: `Marcación rápida (${ecuadorNowTime()} EC)`,
      origin: 'roll_call_quick',
    });
  };

  const handleConvertAttendanceToDeduction = (entry: AttendanceEntry) => {
    setAttConversionNotice('');
    if (!canViewCompensation || !canEditCompensation) {
      setAttConversionNotice('Necesitas el permiso Editar compensación para crear solicitudes de descuento.');
      return;
    }

    let computedAmount = 0;
    let formulaSummary = '';

    if (monthlyEquivalentSalary != null && monthlyEquivalentSalary > 0) {
      if (entry.status === 'falta') {
        computedAmount = calculateProportionalTimeDeduction(monthlyEquivalentSalary, { daysAbsent: 1 });
        formulaSummary = `Cálculo proporcional (1 día no trabajado sobre base ${formatMoney(monthlyEquivalentSalary)} / 30 días)`;
      } else if (entry.lateMinutes && entry.lateMinutes > 0) {
        computedAmount = calculateProportionalTimeDeduction(monthlyEquivalentSalary, {
          minutesLate: entry.lateMinutes,
        });
        formulaSummary = `Cálculo proporcional (${entry.lateMinutes} min no trabajados sobre ${formatMoney(monthlyEquivalentSalary)} / 240h)`;
      }
    }

    setDedDesc(
      entry.status === 'falta'
        ? `Descuento proporcional por ausencia del ${entry.date}`
        : `Descuento proporcional por atraso del ${entry.date} (${entry.lateMinutes || 0} min)`,
    );
    setDedAmount(computedAmount > 0 ? computedAmount.toFixed(2) : '');
    setDedPeriod(`${entry.date.slice(0, 7)}-01`);
    setDedNote(
      formulaSummary
        ? `${formulaSummary}. ${entry.note ? `Detalle: ${entry.note}` : ''}`.trim()
        : `Requiere salario base mensual para cálculo proporcional automático. ${entry.note || ''}`.trim(),
    );
    setDedIsDisciplinaryFine(false);
    setDedLocalWarning(
      computedAmount <= 0
        ? 'No existe salario base mensual equivalente para calcular el tiempo no trabajado automáticamente; ingresa el importe proporcional exacto antes de enviar.'
        : '',
    );
    onChangeTab('salarios');
  };

  const handleExportAttendanceCsv = () => {
    const csv = buildCsvDocument(
      ['Colaborador', 'Fecha', 'Estado', 'Entrada', 'Salida', 'Minutos atraso', 'Ubicación', 'Observación'],
      attendanceEntries.map((entry) => [
        selected.full_name,
        entry.date,
        ATTENDANCE_META[entry.status].label,
        entry.checkIn || '',
        entry.checkOut || '',
        entry.lateMinutes ?? 0,
        entry.locationNote || '',
        entry.note,
      ]),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `asistencia-${selected.full_name.toLowerCase().replace(/\s+/g, '-')}-${periodMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="personnel-detail-panel" aria-label={`Ficha laboral de ${selected.full_name}`}>
      {onBackToDirectory && (
        <button type="button" className="personnel-mobile-back" onClick={onBackToDirectory}>
          <ArrowLeft size={15} /> Volver al directorio
        </button>
      )}

      <header className="personnel-detail-heading">
        <div className="personnel-detail-identity">
          <Avatar
            name={selected.full_name}
            src={linkedAccount?.avatar_url}
            size="lg"
            badge={
              linkedAccount?.avatar_url ? <span className="vc-google-avatar-mark">G</span> : undefined
            }
          />
          <div className="personnel-detail-title-wrap">
            <div className="personnel-detail-badges">
              <PersonnelStatusBadge status={selected.status} />
              {readiness && (
                <ReadinessBadge tier={readiness.tier} score={readiness.score} maxScore={readiness.maxScore} />
              )}
              {linkedAccount ? (
                <span className="vc-semiotic-badge is-brand is-pill">
                  <Link2 size={12} aria-hidden="true" />
                  <span>Cuenta vinculada</span>
                </span>
              ) : (
                <span className="vc-semiotic-badge is-neutral is-dashed is-pill">
                  <Unlink size={12} aria-hidden="true" />
                  <span>Sin acceso digital vinculado</span>
                </span>
              )}
            </div>
            <h2>{selected.full_name}</h2>
            <p>
              {selected.job_title || 'Cargo por definir'} · {selected.department || 'Área por definir'}
              {selected.start_date ? ` · Ingreso ${formatEcuadorDate(selected.start_date, 'medium')}` : ''}
            </p>
          </div>
        </div>

        <div className="personnel-detail-actions">
          {canEdit && (
            <button type="button" className="site-secondary-button" onClick={onEditSelected}>
              <Edit3 size={14} /> Editar ficha
            </button>
          )}
          {canEditCompensation && (
            <button
              type="button"
              className="site-secondary-button"
              onClick={() => onChangeTab('salarios')}
            >
              <DollarSign size={14} /> Compensación
            </button>
          )}
        </div>
      </header>

      {readiness && readiness.missingItems.length > 0 && (
        <div className="personnel-readiness-strip" aria-label="Pendientes de cumplimiento de ficha">
          <div className="personnel-readiness-progress">
            <span>
              Completitud ({readiness.legalPayrollComplete}/{readiness.legalPayrollTotal} legal/nómina ·{' '}
              {readiness.operationalComplete}/{readiness.operationalTotal} operativa)
            </span>
            <div className="personnel-progress-track" role="progressbar" aria-valuenow={readiness.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="personnel-progress-bar" style={{ width: `${readiness.percent}%` }} />
            </div>
          </div>
          <div className="personnel-missing-chips">
            {readiness.missingItems.map((missing) => (
              <span key={missing} className="personnel-missing-chip">
                Falta: {missing}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="personnel-tabs-wrap">
        <AnimatedTabs
          tabs={detailTabs}
          activeId={activeTab}
          onChange={onChangeTab}
          ariaLabel="Secciones de la ficha laboral"
          variant="segmented"
          size="md"
          layoutId="personnel-detail-tabs"
        />
      </div>

      {/* TAB 1: FICHA, CUENTA Y TURNOS */}
      {activeTab === 'ficha' && (
        <div className="personnel-tab-body" role="tabpanel">
          <div className="personnel-contact-grid">
            <article className="personnel-contact-card">
              <span>
                <Mail size={13} aria-hidden="true" /> Correo laboral / contacto
              </span>
              <b>{selected.email || 'Pendiente de registrar'}</b>
            </article>
            <article className="personnel-contact-card">
              <span>
                <Phone size={13} aria-hidden="true" /> Teléfono / WhatsApp
              </span>
              <b>{selected.phone || 'Pendiente de registrar'}</b>
            </article>
            <article className="personnel-contact-card">
              <span>
                <Briefcase size={13} aria-hidden="true" /> Área y antigüedad
              </span>
              <b>{selected.department || 'Sin área'}</b>
              <small>
                {selected.start_date
                  ? `${entitlements.monthsWorked} mes(es) desde ${formatEcuadorDate(selected.start_date, 'medium')}`
                  : 'Registra fecha de ingreso para calcular vacaciones y Fondos de Reserva'}
              </small>
            </article>
            <article className="personnel-contact-card">
              <span>
                <CalendarClock size={13} aria-hidden="true" /> Turno de hoy ({formatEcuadorDate(todayIso, 'short')})
              </span>
              {!canViewSchedule ? (
                <>
                  <b>Sin permiso de Horarios</b>
                  <small>Habilita `team_schedule` para sincronizar horarios.</small>
                </>
              ) : todaySchedule.isWorkingDay ? (
                <>
                  <b className="tabular-nums">
                    {todaySchedule.opensAt} – {todaySchedule.closesAt}
                  </b>
                  <small>
                    {todaySchedule.note}
                    {todaySchedule.rotations.length > 0
                      ? ` · Rotación: ${todaySchedule.rotations.map((r) => `${r.areaName} (${r.taskName})`).join(', ')}`
                      : ''}
                  </small>
                </>
              ) : (
                <>
                  <b>Cerrado / descanso</b>
                  <small>{todaySchedule.note}</small>
                </>
              )}
            </article>
          </div>

          {/* Account & Access Linking */}
          <section className="personnel-account-panel" aria-label="Cuenta Google y acceso a Visual Corp Suite">
            <header className="personnel-section-header">
              <div>
                <h3>Cuenta Google y permisos en Suite</h3>
                <p>Vincular la ficha permite seguir sus horarios, rotaciones, ventas o pasos de taller.</p>
              </div>
              {canViewSchedule && (
                <Link className="site-secondary-button" to="/operaciones/equipo/horarios">
                  <CalendarClock size={14} /> Abrir Horarios
                </Link>
              )}
            </header>

            {linkedAccount ? (
              <div className="personnel-linked-account">
                <div className="personnel-linked-account-main">
                  <Avatar name={linkedAccount.full_name} src={linkedAccount.avatar_url} size="md" />
                  <div>
                    <b>{linkedAccount.full_name}</b>
                    <small>{linkedAccount.email}</small>
                    <small>Último ingreso: {formatEcuadorDateTime(linkedAccount.last_sign_in_at)}</small>
                    <div className="personnel-profile-pills">
                      {linkedAccount.access_profiles.length > 0 ? (
                        linkedAccount.access_profiles.map((profileName) => (
                          <span key={profileName} className="vc-semiotic-badge is-brand is-pill">
                            <ShieldCheck size={11} /> {profileName}
                          </span>
                        ))
                      ) : (
                        <span className="vc-semiotic-badge is-warning is-dashed is-pill">Sin perfil asignado</span>
                      )}
                    </div>
                  </div>
                </div>
                {canManageTeam && canEdit && (
                  <button
                    type="button"
                    className="personnel-unlink-button"
                    disabled={accountBusy}
                    onClick={() => void onUnlinkGoogleAccount()}
                  >
                    <Unlink size={14} /> Desvincular cuenta
                  </button>
                )}
              </div>
            ) : canManageTeam && canEdit ? (
              <div className="personnel-account-actions">
                <div className="personnel-account-card">
                  <h4>Vincular cuenta Google ya registrada</h4>
                  {unlinkedGoogleAccounts.length > 0 ? (
                    <div className="personnel-inline-control-row">
                      <SelectDropdown
                        ariaLabel="Seleccionar cuenta Google libre"
                        value={googleUserIdInput}
                        options={googleAccountOptions}
                        onChange={setGoogleUserIdInput}
                        searchable={unlinkedGoogleAccounts.length > 4}
                        size="form"
                        fullWidth
                      />
                      <button
                        type="button"
                        className="site-primary-button"
                        disabled={!googleUserIdInput || accountBusy}
                        onClick={() => {
                          if (googleUserIdInput) void onLinkGoogleAccount(googleUserIdInput);
                        }}
                      >
                        <Link2 size={14} /> Vincular
                      </button>
                    </div>
                  ) : (
                    <small className="personnel-muted-note">
                      Todas las cuentas Google que ya iniciaron sesión en Suite ya tienen ficha vinculada (o invita una nueva abajo).
                    </small>
                  )}
                </div>

                <div className="personnel-account-card">
                  <h4>Asignar perfil o invitar por correo</h4>
                  <div className="personnel-invite-grid">
                    <input
                      type="email"
                      aria-label="Correo para asignar o invitar"
                      placeholder="correo@visualcorp.ec"
                      value={inviteEmailInput}
                      onChange={(event) => setInviteEmailInput(event.target.value)}
                    />
                    <SelectDropdown
                      ariaLabel="Perfil de acceso a asignar"
                      value={inviteProfileIdInput}
                      options={profileOptions}
                      onChange={setInviteProfileIdInput}
                      searchable={profileOptions.length > 5}
                      size="form"
                      fullWidth
                    />
                    <button
                      type="button"
                      className="site-secondary-button"
                      disabled={!inviteEmailInput.trim() || !inviteProfileIdInput || accountBusy}
                      onClick={() => {
                        void onInviteOrAssignProfile(inviteEmailInput.trim(), inviteProfileIdInput);
                      }}
                    >
                      <UserPlus size={14} /> Asignar / invitar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="personnel-muted-note">
                No hay cuenta Google vinculada. Necesitas permisos de <b>Equipo</b> y <b>Editar personal</b> para vincularla.
              </p>
            )}
          </section>

          {/* Ecuador Reference Entitlements Card */}
          <section className="personnel-ec-card" aria-label="Referencia laboral Ecuador">
            <header className="personnel-section-header">
              <div>
                <h3>
                  <Scale size={15} aria-hidden="true" /> Referencia laboral Ecuador {fiscalConfig.year} (Región Costa)
                </h3>
                <p>
                  Parámetros calculados según fecha de ingreso {selected.start_date ? formatEcuadorDate(selected.start_date, 'medium') : 'no registrada'} y SBU ${fiscalConfig.sbu}.
                </p>
              </div>
              <span className="vc-semiotic-badge is-neutral is-rounded">Solo referencial</span>
            </header>

            <div className="personnel-ec-grid">
              <article>
                <span>Fondos de Reserva (8,33%)</span>
                <b>{entitlements.reserveFundEligible ? 'Elegible (>= mes 13)' : `En ${entitlements.reserveFundMonthsRemaining} mes(es)`}</b>
                <small>Se aporta desde el mes 13 continuo en la misma empresa.</small>
              </article>
              <article>
                <span>Vacaciones anuales (Art. 69)</span>
                <b className="tabular-nums">{entitlements.vacationDaysPerYear} días / año</b>
                <small>15 días base + 1 día adicional por año desde el 6.º año.</small>
              </article>
              <article>
                <span>Décimo Cuarto Costa</span>
                <b className="tabular-nums">{formatMoney(fiscalConfig.sbu)} / año</b>
                <small>Fecha límite acumulado: 15 de marzo (1 SBU vigente).</small>
              </article>
              <article>
                <span>Rotación de áreas hoy</span>
                <b>
                  {todaySchedule.rotations.length > 0
                    ? todaySchedule.rotations.map((r) => `${r.areaName}`).join(', ')
                    : 'Sin rotación hoy'}
                </b>
                <small>
                  {todaySchedule.rotations[0]
                    ? `${todaySchedule.rotations[0].taskName} (${todaySchedule.rotations[0].startsAt}–${todaySchedule.rotations[0].endsAt})`
                    : 'Configurado en Operaciones → Equipo → Horarios'}
                </small>
              </article>
            </div>
          </section>

          {/* Audit Timeline */}
          <section className="personnel-history" aria-label="Historial de auditoría">
            <header className="personnel-section-header">
              <div>
                <h3>
                  <History size={15} aria-hidden="true" /> Bitácora de cambios en ficha
                </h3>
                <p>Eventos automáticos registrados en Supabase (`personnel_events`).</p>
              </div>
            </header>

            {detailLoading ? (
              <p className="personnel-inline-loading">Cargando historial…</p>
            ) : events.length === 0 ? (
              <p className="personnel-inline-empty">Sin eventos registrados todavía.</p>
            ) : (
              <ul className="personnel-history-list">
                {events.map((item) => (
                  <li key={item.id}>
                    <span className="personnel-history-icon">
                      <FileText size={13} aria-hidden="true" />
                    </span>
                    <div>
                      <b>{item.summary}</b>
                      <small>
                        {item.actor_label} · {formatEcuadorDateTime(item.created_at)}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: COMPENSACIÓN Y DEDUCCIONES */}
      {activeTab === 'salarios' && (
        <div className="personnel-tab-body" role="tabpanel">
          {!canViewCompensation ? (
            <EmptyState
              icon={ShieldCheck}
              title="Acceso restringido a compensación"
              text="Solo los perfiles con `personnel.view_compensation` pueden revisar salarios base o solicitudes de descuento."
            />
          ) : (
            <>
              <div className="personnel-privacy-toolbar">
                <div className="personnel-private-note">
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>
                    Historial salarial append-only y trazabilidad de descuentos para entrega a nómina externa.
                  </span>
                </div>
                <div className="personnel-privacy-controls">
                  <label className="personnel-inline-month">
                    <span>Período</span>
                    <input
                      type="month"
                      value={periodMonth}
                      onChange={(event) => onChangePeriodMonth(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="site-secondary-button"
                    aria-pressed={revealSalary}
                    onClick={() => setRevealSalary((prev) => !prev)}
                  >
                    {revealSalary ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{revealSalary ? 'Ocultar cifras (60s)' : 'Mostrar cifras'}</span>
                  </button>
                </div>
              </div>

              <div className="personnel-netpay-banner" aria-live="polite">
                <article className="personnel-netpay-card">
                  <span>Base mensual equivalente</span>
                  <b className="tabular-nums">
                    {monthlyEquivalentSalary != null
                      ? formatMoney(monthlyEquivalentSalary, latestCompensation?.currency_code, {
                          masked: !revealSalary,
                        })
                      : latestCompensation
                        ? `${formatMoney(latestCompensation.amount, latestCompensation.currency_code, { masked: !revealSalary })} (${latestCompensation.pay_period})`
                        : 'Sin definir'}
                  </b>
                  <small>
                    {latestCompensation
                      ? `Vigente desde ${formatEcuadorDate(latestCompensation.effective_date, 'medium')}`
                      : 'Registra sueldo base para calcular anticipos y proporcionales'}
                  </small>
                </article>

                <article className="personnel-netpay-card is-deduction">
                  <span>Deducciones del período ({periodMonth})</span>
                  <b className="tabular-nums">
                    {formatMoney(periodDeductionSummary.deductibleTotal, 'USD', {
                      masked: !revealSalary,
                      signedMinus: periodDeductionSummary.deductibleTotal > 0,
                    })}
                  </b>
                  <small>
                    Autorizadas ({formatMoney(periodDeductionSummary.authorizedTotal, 'USD', { masked: !revealSalary })}) · En nómina ({formatMoney(periodDeductionSummary.sentToPayrollTotal, 'USD', { masked: !revealSalary })}) · Aplicadas ({formatMoney(periodDeductionSummary.appliedTotal, 'USD', { masked: !revealSalary })})
                  </small>
                </article>

                <article className="personnel-netpay-card is-net">
                  <span>Estimado neto post-deducciones</span>
                  <b className="tabular-nums">
                    {estimatedNetPay != null
                      ? formatMoney(estimatedNetPay, latestCompensation?.currency_code, {
                          masked: !revealSalary,
                        })
                      : 'Pendiente de base mensual'}
                  </b>
                  <small>
                    IESS personal ref. (9,45%):{' '}
                    {monthlyEquivalentSalary != null
                      ? formatMoney(entitlements.estimatedIessPersonal, 'USD', { masked: !revealSalary })
                      : '—'}
                  </small>
                </article>

                <article className="personnel-netpay-card">
                  <span>Quincena anticipo ref. (50%)</span>
                  <b className="tabular-nums">
                    {monthlyEquivalentSalary != null
                      ? formatMoney(entitlements.suggestedQuincenaAdvance, latestCompensation?.currency_code, {
                          masked: !revealSalary,
                        })
                      : '—'}
                  </b>
                  <small>Art. 83 · Anticipo configurable a cuenta del rol mensual</small>
                </article>
              </div>

              {canEditCompensation && (
                <form className="personnel-pay-form" onSubmit={handleSaveComp}>
                  <header>
                    <h3>Registrar nueva compensación base</h3>
                    <small>Los registros salariales son inmutables (append-only); una fecha efectiva nueva crea una entrada histórica.</small>
                  </header>
                  <div className="personnel-form-grid">
                    <label>
                      <span>Monto *</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="482.00"
                        value={compAmount}
                        onChange={(event) => setCompAmount(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Moneda</span>
                      <input
                        type="text"
                        maxLength={3}
                        value={compCurrency}
                        onChange={(event) => setCompCurrency(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Periodicidad</span>
                      <select
                        value={compPayPeriod}
                        onChange={(event) => setCompPayPeriod(event.target.value)}
                      >
                        {PAY_PERIOD_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Fecha efectiva</span>
                      <input
                        type="date"
                        required
                        value={compEffectiveDate}
                        onChange={(event) => setCompEffectiveDate(event.target.value)}
                      />
                    </label>
                    <label className="personnel-span-2">
                      <span>Motivo / acuerdo</span>
                      <input
                        type="text"
                        maxLength={500}
                        placeholder="Ej. Sueldo base contrato indefinido / Revisión anual"
                        value={compNote}
                        onChange={(event) => setCompNote(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="personnel-form-footer">
                    <button type="submit" className="site-primary-button" disabled={compSaving}>
                      <Plus size={14} /> {compSaving ? 'Guardando…' : 'Agregar registro salarial'}
                    </button>
                  </div>
                </form>
              )}

              <section className="personnel-compensation">
                <h3>Historial salarial registrado</h3>
                {compensationHistory.length === 0 ? (
                  <p className="personnel-inline-empty">Sin entradas salariales registradas.</p>
                ) : (
                  <div className="personnel-compensation-list">
                    {compensationHistory.map((item, idx) => (
                      <article key={item.id}>
                        <div>
                          <div className="personnel-comp-headline">
                            <b className="tabular-nums">
                              {formatMoney(Number(item.amount), item.currency_code, { masked: !revealSalary })}
                            </b>
                            <span>{item.pay_period}</span>
                            {idx === 0 && (
                              <span className="vc-semiotic-badge is-positive is-pill">Vigente</span>
                            )}
                          </div>
                          {item.note && <small>{item.note}</small>}
                        </div>
                        <time>Efectivo desde {formatEcuadorDate(item.effective_date, 'medium')}</time>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* Deductions Lifecycle Section */}
              <section className="personnel-deductions-section">
                <header className="personnel-section-header">
                  <div>
                    <h3>Solicitudes de descuento y entrega a nómina</h3>
                    <p>
                      Flujo oficial en 4 etapas verificadas: Por autorizar → Autorizada (con respaldo) → Entregada a nómina → Aplicada en rol.
                    </p>
                  </div>
                  <select
                    aria-label="Filtrar deducciones por estado"
                    value={dedStatusFilter}
                    onChange={(event) => setDedStatusFilter(event.target.value as 'all' | DeductionStatus)}
                  >
                    <option value="all">Todos los estados</option>
                    {(['pending_authorization', 'authorized', 'sent_to_payroll', 'applied_externally', 'cancelled'] as DeductionStatus[]).map(
                      (statusKey) => (
                        <option key={statusKey} value={statusKey}>
                          {DEDUCTION_STATUS_META[statusKey].label}
                        </option>
                      ),
                    )}
                  </select>
                </header>

                {canEditCompensation ? (
                  <form className="personnel-deduction-form" onSubmit={handleCreateDed}>
                    <div className="personnel-form-grid">
                      <label className="personnel-span-2">
                        <span>Concepto / motivo del descuento *</span>
                        <input
                          type="text"
                          required
                          maxLength={240}
                          placeholder="Ej. Anticipo de quincena / Descuento proporcional tiempo no trabajado"
                          value={dedDesc}
                          onChange={(event) => setDedDesc(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Monto (USD) *</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          placeholder="25.00"
                          value={dedAmount}
                          onChange={(event) => setDedAmount(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Período de nómina *</span>
                        <input
                          type="date"
                          required
                          value={dedPeriod}
                          onChange={(event) => setDedPeriod(event.target.value)}
                        />
                      </label>
                      <label className="personnel-span-2">
                        <span>Nota / detalle de soporte</span>
                        <input
                          type="text"
                          maxLength={300}
                          placeholder="Base de cálculo, fecha de incidencia o documento de anticipo"
                          value={dedNote}
                          onChange={(event) => setDedNote(event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="personnel-legal-checks">
                      <label className="personnel-checkbox">
                        <input
                          type="checkbox"
                          checked={dedIsDisciplinaryFine}
                          onChange={(event) => setDedIsDisciplinaryFine(event.target.checked)}
                        />
                        <span>Marcar como multa disciplinaria (Art. 44 Código del Trabajo)</span>
                      </label>
                      {dedIsDisciplinaryFine && (
                        <label className="personnel-checkbox">
                          <input
                            type="checkbox"
                            checked={hasApprovedInternalReg}
                            onChange={(event) => setHasApprovedInternalReg(event.target.checked)}
                          />
                          <span>Confirmo Reglamento Interno de Trabajo vigente aprobado en el SUT (máx. 10% mensual)</span>
                        </label>
                      )}
                      {monthlyEquivalentSalary != null &&
                        parsedDedAmount > 0 &&
                        fineCheck.exceedsTenPercentCap && (
                          <div className="personnel-alert is-warning" role="status">
                            <AlertTriangle size={14} aria-hidden="true" />
                            <span>
                              Este monto equivale al {fineCheck.ratioPercent}% del salario mensual. Para multas disciplinarias el Art. 44 literal b prohíbe exceder el 10% ({formatMoney(fineCheck.maxAllowedFine)}); para anticipos o tiempo no trabajado documenta autorización expresa y respaldo.
                            </span>
                          </div>
                        )}
                      {dedLocalWarning && (
                        <div className="personnel-alert is-error" role="alert">
                          <OctagonAlert size={14} aria-hidden="true" />
                          <span>{dedLocalWarning}</span>
                        </div>
                      )}
                    </div>

                    <div className="personnel-form-footer">
                      <button type="submit" className="site-primary-button" disabled={deductionSaving}>
                        <Plus size={14} /> {deductionSaving ? 'Registrando…' : 'Registrar solicitud por autorizar'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="personnel-inline-empty">
                    Solo lectura: crear o avanzar estados de deducción exige el permiso <b>Editar compensación</b> (`personnel.edit_compensation`).
                  </p>
                )}

                {filteredDeductions.length === 0 ? (
                  <p className="personnel-inline-empty">No hay solicitudes de descuento en este filtro.</p>
                ) : (
                  <div className="personnel-deduction-list">
                    {filteredDeductions.map((item) => {
                      const nextTransitions = getAllowedDeductionTransitions(item.status);
                      return (
                        <article key={item.id} className="personnel-deduction-card">
                          <div className="personnel-deduction-top">
                            <div>
                              <DeductionStatusBadge status={item.status} />
                              <b>{item.description}</b>
                              <small>
                                Período: {item.payroll_period.slice(0, 7)} · Creada {formatEcuadorDateTime(item.created_at)}
                              </small>
                            </div>
                            <strong className="tabular-nums is-deduction-amount">
                              {formatMoney(Number(item.amount), 'USD', {
                                masked: !revealSalary,
                                signedMinus: true,
                              })}
                            </strong>
                          </div>

                          {(item.note || item.authorization_reference || item.evidence_reference || item.payroll_handoff_reference) && (
                            <dl className="personnel-deduction-refs">
                              {item.note && (
                                <div>
                                  <dt>Nota</dt>
                                  <dd>{item.note}</dd>
                                </div>
                              )}
                              {item.authorization_reference && (
                                <div>
                                  <dt>Autorización</dt>
                                  <dd>{item.authorization_reference}</dd>
                                </div>
                              )}
                              {item.evidence_reference && (
                                <div>
                                  <dt>Evidencia</dt>
                                  <dd>{item.evidence_reference}</dd>
                                </div>
                              )}
                              {item.payroll_handoff_reference && (
                                <div>
                                  <dt>Entrega a nómina</dt>
                                  <dd>
                                    {item.payroll_handoff_reference}
                                    {item.payroll_handed_at ? ` (${formatEcuadorDateTime(item.payroll_handed_at)})` : ''}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          )}

                          {canEditCompensation && nextTransitions.length > 0 && (
                            <div className="personnel-deduction-btns">
                              {nextTransitions.includes('authorized') && (
                                <button
                                  type="button"
                                  className="site-secondary-button"
                                  onClick={() => onRequestDeductionTransition(item, 'authorized')}
                                >
                                  Autorizar con respaldo
                                </button>
                              )}
                              {nextTransitions.includes('sent_to_payroll') && (
                                <button
                                  type="button"
                                  className="site-secondary-button"
                                  onClick={() => onRequestDeductionTransition(item, 'sent_to_payroll')}
                                >
                                  Entregar a nómina externa
                                </button>
                              )}
                              {nextTransitions.includes('applied_externally') && (
                                <button
                                  type="button"
                                  className="site-primary-button"
                                  onClick={() => onRequestDeductionTransition(item, 'applied_externally')}
                                >
                                  Confirmar aplicada en rol
                                </button>
                              )}
                              {nextTransitions.includes('cancelled') && (
                                <button
                                  type="button"
                                  className="personnel-danger-link-btn"
                                  onClick={() => onRequestDeductionTransition(item, 'cancelled')}
                                >
                                  Anular
                                </button>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {/* TAB 3: ASISTENCIA E INCIDENCIAS */}
      {activeTab === 'asistencia' && (
        <div className="personnel-tab-body" role="tabpanel">
          <div className="personnel-rollcall-banner">
            <div className="personnel-banner-copy">
              <Info size={16} aria-hidden="true" />
              <div>
                <b>Registro local por navegador (pendiente tabla en Supabase)</b>
                <p>
                  Las marcaciones se guardan localmente para agilizar el seguimiento diario. Descarga el CSV del mes para respaldo administrativo.
                </p>
              </div>
            </div>
            <div className="personnel-banner-actions">
              <button type="button" className="site-secondary-button" onClick={handleExportAttendanceCsv}>
                <Download size={14} /> Exportar asistencias CSV
              </button>
            </div>
          </div>

          {canEdit ? (
            <>
              <div className="personnel-quick-checkin-bar">
                <div className="personnel-quick-checkin-meta">
                  <b>Marcación rápida para hoy ({formatEcuadorDate(todayIso, 'short')})</b>
                  <small>
                    {canViewSchedule
                      ? todaySchedule.isWorkingDay
                        ? `Horario esperado: ${todaySchedule.opensAt} – ${todaySchedule.closesAt}`
                        : `Hoy figura como ${todaySchedule.note}`
                      : `Hora actual Ecuador: ${ecuadorNowTime()}`}
                  </small>
                </div>
                <div className="personnel-quick-checkin-chips">
                  <button type="button" className="personnel-chip-btn" onClick={() => handleQuickLocalCheckin('presente')}>
                    <CheckCircle2 size={13} /> A tiempo
                  </button>
                  <button type="button" className="personnel-chip-btn" onClick={() => handleQuickLocalCheckin('en_campo')}>
                    <Building2 size={13} /> En campo
                  </button>
                  <button type="button" className="personnel-chip-btn" onClick={() => handleQuickLocalCheckin('remoto')}>
                    <Briefcase size={13} /> Remoto
                  </button>
                  <button type="button" className="personnel-chip-btn" onClick={() => handleQuickLocalCheckin('tardanza')}>
                    <Clock size={13} /> Atraso (auto min)
                  </button>
                  <button type="button" className="personnel-chip-btn" onClick={() => handleQuickLocalCheckin('permiso')}>
                    <Calendar size={13} /> Permiso
                  </button>
                  <button type="button" className="personnel-chip-btn is-danger" onClick={() => handleQuickLocalCheckin('falta')}>
                    <OctagonAlert size={13} /> Falta
                  </button>
                </div>
              </div>

              <form className="personnel-attendance-form" onSubmit={handleSubmitAttendance}>
                <div className="personnel-form-grid">
                  <label>
                    <span>Fecha</span>
                    <input
                      type="date"
                      required
                      value={attDate}
                      onChange={(event) => setAttDate(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Estado de jornada</span>
                    <select
                      value={attStatus}
                      onChange={(event) => setAttStatus(event.target.value as AttendanceStatus)}
                    >
                      {(Object.keys(ATTENDANCE_META) as AttendanceStatus[]).map((key) => (
                        <option key={key} value={key}>
                          {ATTENDANCE_META[key].label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {ATTENDANCE_META[attStatus].expectsTime && (
                    <>
                      <label>
                        <span>Hora de entrada</span>
                        <input
                          type="time"
                          value={attCheckIn}
                          onChange={(event) => {
                            const nextIn = event.target.value;
                            setAttCheckIn(nextIn);
                            if (attStatus === 'tardanza') {
                              setAttLateMinutes(String(computeLateMinutes(nextIn, todaySchedule.opensAt || '08:00')));
                            }
                          }}
                        />
                      </label>
                      <label>
                        <span>Hora de salida</span>
                        <input
                          type="time"
                          value={attCheckOut}
                          onChange={(event) => setAttCheckOut(event.target.value)}
                        />
                      </label>
                    </>
                  )}

                  {attStatus === 'tardanza' && (
                    <label>
                      <span>Minutos de atraso</span>
                      <input
                        type="number"
                        min="1"
                        max="480"
                        value={attLateMinutes}
                        onChange={(event) => setAttLateMinutes(event.target.value)}
                      />
                    </label>
                  )}

                  <label>
                    <span>Ubicación / ruta (opcional)</span>
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="Ej. Taller matriz / Instalación Norte"
                      value={attLocationNote}
                      onChange={(event) => setAttLocationNote(event.target.value)}
                    />
                  </label>

                  <label className="personnel-span-2">
                    <span>Observación / justificativo</span>
                    <input
                      type="text"
                      maxLength={240}
                      placeholder="Ej. Retraso en entrega previa o permiso médico"
                      value={attNote}
                      onChange={(event) => setAttNote(event.target.value)}
                    />
                  </label>
                </div>
                <div className="personnel-form-footer">
                  <button type="submit" className="site-primary-button">
                    <Plus size={14} /> Guardar marcación
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="personnel-alert is-warning" role="status">
              <Info size={14} aria-hidden="true" />
              <span>Tu perfil solo tiene acceso de lectura (`personnel.view`); no puedes modificar marcaciones.</span>
            </div>
          )}

          {consecutiveAbsencesWarning && (
            <div className="personnel-alert is-warning" role="status">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>
                Alerta Art. 172 num. 1 (Ecuador): se registran 3 o más días consecutivos de ausencia en {periodMonth}. Verifica justificativos médicos o calamidad antes de cualquier trámite laboral.
              </span>
            </div>
          )}

          {attConversionNotice && (
            <div className="personnel-alert is-warning" role="status">
              <Info size={14} aria-hidden="true" />
              <span>{attConversionNotice}</span>
            </div>
          )}

          <div className="personnel-att-kpis">
            <article className="personnel-att-kpi">
              <span>Presentes / campo / remoto ({periodMonth})</span>
              <b className="tabular-nums">
                {attendanceMonthSummary.presentCount + attendanceMonthSummary.fieldCount + attendanceMonthSummary.remoteCount}
              </b>
            </article>
            <article className="personnel-att-kpi">
              <span>Atrasos registrados</span>
              <b className="tabular-nums">
                {attendanceMonthSummary.lateCount} ({attendanceMonthSummary.lateMinutesTotal} min)
              </b>
            </article>
            <article className="personnel-att-kpi">
              <span>Permisos / vacaciones</span>
              <b className="tabular-nums">{attendanceMonthSummary.leaveCount}</b>
            </article>
            <article className="personnel-att-kpi">
              <span>Faltas sin respaldo</span>
              <b className="tabular-nums">{attendanceMonthSummary.absentCount}</b>
            </article>
          </div>

          {attendanceEntries.length === 0 ? (
            <p className="personnel-inline-empty">Sin registros de asistencia guardados para este colaborador.</p>
          ) : (
            <div className="personnel-att-list">
              {attendanceEntries.map((entry) => {
                const canConvertToDeduction =
                  canEditCompensation && (entry.status === 'tardanza' || entry.status === 'falta');

                return (
                  <article key={entry.id} className="personnel-att-row">
                    <div>
                      <div className="personnel-att-row-top">
                        <b>{formatEcuadorDate(entry.date, 'medium')}</b>
                        <AttendanceStatusBadge status={entry.status} />
                        {entry.checkIn && (
                          <span className="personnel-att-time tabular-nums">
                            {entry.checkIn}
                            {entry.checkOut ? ` – ${entry.checkOut}` : ''}
                          </span>
                        )}
                        {entry.lateMinutes ? (
                          <span className="personnel-att-time tabular-nums">{entry.lateMinutes} min atraso</span>
                        ) : null}
                      </div>
                      {(entry.locationNote || entry.note) && (
                        <small>
                          {entry.locationNote ? `${entry.locationNote} · ` : ''}
                          {entry.note}
                        </small>
                      )}
                    </div>

                    <div className="personnel-att-row-actions">
                      {canConvertToDeduction && (
                        <button
                          type="button"
                          className="site-secondary-button"
                          onClick={() => handleConvertAttendanceToDeduction(entry)}
                        >
                          Calcular descuento proporcional →
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="personnel-danger-link-btn"
                          aria-label={`Eliminar marcación del ${entry.date}`}
                          onClick={() => onDeleteAttendance(entry.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CARGA Y RENDIMIENTO POR ÁREA */}
      {activeTab === 'metricas' && (
        <div className="personnel-tab-body" role="tabpanel">
          <div className="personnel-role-banner">
            <Wrench size={16} aria-hidden="true" />
            <div>
              <b>
                Enfoque justo por área:{' '}
                {roleFamily === 'commercial'
                  ? 'Comercial y POS (cotizaciones, cierres y cobros)'
                  : roleFamily === 'design'
                    ? 'Diseño y Pre-prensa (entregas y seguimiento de producción)'
                    : roleFamily === 'production'
                      ? 'Taller, Impresión e Instalaciones (etapas asignadas y cumplimiento)'
                      : 'Operación integral (taller y actividad comercial asociada)'}
              </b>
              <small>
                Los resultados operativos se atribuyen únicamente cuando la ficha está vinculada a su cuenta Google y se consultan columnas reales de Supabase. No se califica a taller ni diseño con metas de caja POS.
              </small>
            </div>
          </div>

          {operationalMetrics.errors.length > 0 && (
            <div className="personnel-alert is-warning" role="status">
              <AlertTriangle size={15} aria-hidden="true" />
              <div>
                <b>Lectura parcial por permisos o consulta ({operationalMetrics.errors.length} aviso(s)):</b>
                <small>{operationalMetrics.errors.join(' · ')}</small>
              </div>
            </div>
          )}

          {!linkedAccount ? (
            <EmptyState
              icon={Link2}
              title="Vincula una cuenta Google para medir carga operativa real"
              text="Sin enlace a usuario de Visual Corp Suite no es posible atribuir cotizaciones, ventas POS ni pasos de taller a esta ficha."
            />
          ) : operationalMetrics.loading ? (
            <p className="personnel-inline-loading">Consultando actividad operativa en Supabase…</p>
          ) : (
            <>
              {(roleFamily === 'commercial' || roleFamily === 'general') && (
                <section className="personnel-perf-block">
                  <h3>Desempeño comercial y cotizaciones</h3>
                  <div className="personnel-perf-grid">
                    <article className="personnel-perf-card">
                      <span>Ventas confirmadas</span>
                      <b className="tabular-nums">{workerMetrics.sales.length}</b>
                      <small>Facturado: {formatMoney(workerMetrics.salesTotal)}</small>
                    </article>
                    <article className="personnel-perf-card">
                      <span>Recaudación registrada</span>
                      <b className="tabular-nums">{formatMoney(workerMetrics.collectedTotal)}</b>
                      <small>Ticket promedio: {formatMoney(workerMetrics.avgTicket)}</small>
                    </article>
                    <article className="personnel-perf-card">
                      <span>Cotizaciones emitidas</span>
                      <b className="tabular-nums">{workerMetrics.quotes.length}</b>
                      <small>Aceptadas/convertidas: {workerMetrics.acceptedQuotes.length}</small>
                    </article>
                    <article className="personnel-perf-card">
                      <span>Conversión estimada</span>
                      <b className="tabular-nums">{workerMetrics.conversionRate}%</b>
                      <small>Descuentos aplicados: {formatMoney(workerMetrics.discountTotal)}</small>
                    </article>
                  </div>

                  {workerMetrics.sales.length > 0 && (
                    <div className="table-wrap">
                      <table className="personnel-metrics-table">
                        <thead>
                          <tr>
                            <th scope="col">Código</th>
                            <th scope="col">Cliente</th>
                            <th scope="col">Estado</th>
                            <th scope="col" className="is-right">Cobrado</th>
                            <th scope="col" className="is-right">Total</th>
                            <th scope="col">Fecha</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workerMetrics.sales.slice(0, 8).map((sale) => (
                            <tr key={sale.id}>
                              <td>{sale.sale_code || sale.id.slice(0, 8)}</td>
                              <td>{sale.customer_name || 'Cliente directo'}</td>
                              <td>{sale.status}</td>
                              <td className="is-right tabular-nums">{formatMoney(sale.paid_total)}</td>
                              <td className="is-right tabular-nums">{formatMoney(sale.total)}</td>
                              <td>{formatEcuadorDate(sale.created_at, 'short')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              <section className="personnel-perf-block">
                <h3>
                  <ClipboardCheck size={15} aria-hidden="true" /> Carga asignada en producción y entregas
                </h3>
                <div className="personnel-perf-grid">
                  <article className="personnel-perf-card">
                    <span>Tareas / pasos asignados</span>
                    <b className="tabular-nums">{workerMetrics.productionTasks.length}</b>
                    <small>Flujos activos + órdenes históricas</small>
                  </article>
                  <article className="personnel-perf-card">
                    <span>En curso / pendientes</span>
                    <b className="tabular-nums">{workerMetrics.activeTasks}</b>
                    <small>Carga abierta asignada</small>
                  </article>
                  <article className="personnel-perf-card">
                    <span>Bloqueadas o en revisión</span>
                    <b className="tabular-nums">{workerMetrics.blockedTasks}</b>
                    <small>Requieren desbloqueo de archivo o material</small>
                  </article>
                  <article className="personnel-perf-card">
                    <span>Completadas</span>
                    <b className="tabular-nums">{workerMetrics.completedTasks}</b>
                    <small>Finalizadas en taller o campo</small>
                  </article>
                </div>

                {workerMetrics.productionTasks.length === 0 ? (
                  <p className="personnel-inline-empty">
                    No existen pasos de producción ni órdenes asignadas directamente a esta cuenta en el rango reciente.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="personnel-metrics-table">
                      <thead>
                        <tr>
                          <th scope="col">Trabajo / paso</th>
                          <th scope="col">Área</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Entrega prevista</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workerMetrics.productionTasks.slice(0, 10).map((task) => (
                          <tr key={task.id}>
                            <td>
                              <b>{task.job_title}</b>
                              <small className="personnel-cell-sub">
                                {task.step_title}
                                {task.customer_name ? ` · ${task.customer_name}` : ''}
                              </small>
                            </td>
                            <td>{task.area_name || task.area_code || 'Taller'}</td>
                            <td>{task.status}</td>
                            <td>{task.due_at ? formatEcuadorDate(task.due_at, 'short') : 'Sin fecha límite'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </section>
  );
}
