import type {
  AttendanceEntry,
  AttendanceStatus,
  CompensationEntry,
  DayScheduleResolution,
  DeductionStatus,
  EcuadorEntitlementsEstimate,
  EcuadorFiscalConfig,
  GoogleAccount,
  PayrollDeduction,
  PersonnelRecord,
  ProfileReadinessBreakdown,
  RoleFamily,
  TeamAreaRotation,
  TeamWorkException,
  TeamWorkHour,
} from './personnelTypes';

export const ECUADOR_TIMEZONE = 'America/Guayaquil';

export const DEPARTMENT_PRESETS = [
  'Comercial / POS',
  'Diseño Gráfico',
  'Impresión Gran Formato',
  'Sublimación',
  'Corte Láser',
  'Instalaciones y Campo',
  'Taller y Acabados',
  'Bodega e Inventario',
  'Administración y Gerencia',
  'Marketing y Contenido',
] as const;

export const PAY_PERIOD_OPTIONS = ['Mensual', 'Quincenal', 'Semanal', 'Por hora', 'Por proyecto'] as const;

export const ATTENDANCE_META: Record<
  AttendanceStatus,
  {
    label: string;
    shortLabel: string;
    tone: 'positive' | 'info' | 'warning' | 'danger' | 'neutral';
    expectsTime: boolean;
  }
> = {
  presente: { label: 'Presente (taller/oficina)', shortLabel: 'Presente', tone: 'positive', expectsTime: true },
  en_campo: { label: 'En campo / instalación', shortLabel: 'En campo', tone: 'info', expectsTime: true },
  remoto: { label: 'Trabajo remoto', shortLabel: 'Remoto', tone: 'info', expectsTime: true },
  tardanza: { label: 'Atraso registrado', shortLabel: 'Atraso', tone: 'warning', expectsTime: true },
  permiso: { label: 'Permiso / justificación', shortLabel: 'Permiso', tone: 'info', expectsTime: false },
  vacaciones: { label: 'Vacaciones / descanso', shortLabel: 'Vacaciones', tone: 'neutral', expectsTime: false },
  falta: { label: 'Ausencia / falta', shortLabel: 'Falta', tone: 'danger', expectsTime: false },
};

export const DEDUCTION_STATUS_META: Record<
  DeductionStatus,
  {
    label: string;
    description: string;
    tone: 'warning' | 'info' | 'brand' | 'positive' | 'neutral';
  }
> = {
  pending_authorization: {
    label: 'Por autorizar',
    description: 'Requiere autorización expresa del colaborador y referencia documental antes de pasar a nómina.',
    tone: 'warning',
  },
  authorized: {
    label: 'Autorizada',
    description: 'Lista para entregar formalmente al proceso externo de nómina.',
    tone: 'info',
  },
  sent_to_payroll: {
    label: 'Entregada a nómina',
    description: 'Ya remitida al rol externo; confirmar aquí solo cuando el pago quede liquidado.',
    tone: 'brand',
  },
  applied_externally: {
    label: 'Aplicada en rol',
    description: 'Descuento confirmado como aplicado en la nómina externa del período.',
    tone: 'positive',
  },
  cancelled: {
    label: 'Anulada',
    description: 'Solicitud cancelada; no debe descontarse del rol de pagos.',
    tone: 'neutral',
  },
};

export const ECUADOR_FISCAL_CONFIGS: Record<number, EcuadorFiscalConfig> = {
  2025: {
    year: 2025,
    sbu: 470,
    sbuResolution: 'Acuerdo Ministerial MDT-2024-300',
    iessPersonalRate: 0.0945,
    iessPatronalRate: 0.1215,
    reserveFundRate: 1 / 12,
    maxWeeklyOvertimeHours: 12,
    fineCapMonthlyRatio: 0.1,
    costaDecimoCuartoDeadline: '15 de marzo (Región Costa / Galápagos)',
    decimoTerceroDeadline: '24 de diciembre (si se acumula por escrito)',
  },
  2026: {
    year: 2026,
    sbu: 482,
    sbuResolution: 'Acuerdo Ministerial MDT-2025-195 (vigente desde 1 ene 2026)',
    iessPersonalRate: 0.0945,
    iessPatronalRate: 0.1215,
    reserveFundRate: 1 / 12,
    maxWeeklyOvertimeHours: 12,
    fineCapMonthlyRatio: 0.1,
    costaDecimoCuartoDeadline: '15 de marzo (Región Costa / Galápagos)',
    decimoTerceroDeadline: '24 de diciembre (si se acumula por escrito)',
  },
};

export function getEcuadorFiscalConfig(year?: number): EcuadorFiscalConfig {
  const targetYear = year ?? Number(ecuadorTodayIso().slice(0, 4));
  if (ECUADOR_FISCAL_CONFIGS[targetYear]) {
    return ECUADOR_FISCAL_CONFIGS[targetYear];
  }
  const availableYears = Object.keys(ECUADOR_FISCAL_CONFIGS)
    .map(Number)
    .sort((a, b) => b - a);
  return ECUADOR_FISCAL_CONFIGS[availableYears[0] ?? 2026];
}

export function ecuadorTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function ecuadorMonthIso(now: Date = new Date()): string {
  return ecuadorTodayIso(now).slice(0, 7);
}

export function ecuadorNowTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ECUADOR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

export function ecuadorWeekday(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  if (!y || !m || !d) return 1;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

export function formatEcuadorDate(value: string | null | undefined, style: 'short' | 'medium' = 'medium'): string {
  if (!value) return 'Pendiente';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-05:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: ECUADOR_TIMEZONE,
    dateStyle: style,
  }).format(date);
}

export function formatEcuadorDateTime(value: string | null | undefined): string {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: ECUADOR_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatMoney(
  value: number,
  currencyCode = 'USD',
  options?: { masked?: boolean; signedMinus?: boolean },
): string {
  if (options?.masked) {
    return `${currencyCode === 'USD' ? '$' : `${currencyCode} `}•••••`;
  }
  const numeric = Number.isFinite(value) ? value : 0;
  const absFormatted = new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: currencyCode || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(numeric));
  if (options?.signedMinus || numeric < 0) {
    return `\u2212${absFormatted}`;
  }
  return absFormatted;
}

export function trimTimeToHm(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 5);
}

export function computeLateMinutes(checkInHm: string, expectedStartHm: string): number {
  const [inH, inM] = checkInHm.split(':').map(Number);
  const [expH, expM] = expectedStartHm.split(':').map(Number);
  if (
    !Number.isFinite(inH) ||
    !Number.isFinite(inM) ||
    !Number.isFinite(expH) ||
    !Number.isFinite(expM)
  ) {
    return 0;
  }
  const diff = inH * 60 + inM - (expH * 60 + expM);
  return diff > 0 ? diff : 0;
}

export function calculateMonthlyEquivalent(amount: number, payPeriod: string): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  const normalized = payPeriod.trim().toLowerCase();
  if (normalized === 'mensual') return roundCurrency(amount);
  if (normalized === 'quincenal') return roundCurrency(amount * 2);
  if (normalized === 'semanal') return roundCurrency((amount * 52) / 12);
  return null;
}

export function calculateProportionalTimeDeduction(
  monthlyBaseSalary: number,
  params: { minutesLate?: number; daysAbsent?: number },
): number {
  if (!Number.isFinite(monthlyBaseSalary) || monthlyBaseSalary <= 0) return 0;
  const minutes = Math.max(0, Number(params.minutesLate || 0));
  const days = Math.max(0, Number(params.daysAbsent || 0));
  if (days > 0) {
    return roundCurrency((monthlyBaseSalary / 30) * days);
  }
  if (minutes > 0) {
    // 240 monthly hours (30 days * 8h Ecuador payroll convention) = 14,400 minutes
    return roundCurrency((monthlyBaseSalary / 240 / 60) * minutes);
  }
  return 0;
}

export function evaluateArt44FineLimit(
  monthlyBaseSalary: number,
  amount: number,
  fiscalConfig: EcuadorFiscalConfig = getEcuadorFiscalConfig(),
): {
  maxAllowedFine: number;
  exceedsTenPercentCap: boolean;
  ratioPercent: number;
} {
  if (!Number.isFinite(monthlyBaseSalary) || monthlyBaseSalary <= 0) {
    return { maxAllowedFine: 0, exceedsTenPercentCap: false, ratioPercent: 0 };
  }
  const maxAllowedFine = roundCurrency(monthlyBaseSalary * fiscalConfig.fineCapMonthlyRatio);
  const ratioPercent = roundCurrency((Math.max(0, amount) / monthlyBaseSalary) * 100);
  return {
    maxAllowedFine,
    exceedsTenPercentCap: amount > maxAllowedFine + 0.001,
    ratioPercent,
  };
}

export function calculateEcuadorLaborEntitlements(
  startDate: string | null | undefined,
  asOfDateIso: string,
  monthlyBaseSalary: number,
  fiscalConfig: EcuadorFiscalConfig = getEcuadorFiscalConfig(),
): EcuadorEntitlementsEstimate {
  let monthsWorked = 0;
  let completedYears = 0;
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ay, am, ad] = asOfDateIso.split('-').map(Number);
    if (sy && sm && sd && ay && am && ad) {
      let totalMonths = (ay - sy) * 12 + (am - sm);
      if (ad < sd) totalMonths -= 1;
      monthsWorked = Math.max(0, totalMonths);
      completedYears = Math.floor(monthsWorked / 12);
    }
  }
  const reserveFundEligible = monthsWorked >= 12;
  const reserveFundMonthsRemaining = reserveFundEligible ? 0 : Math.max(0, 12 - monthsWorked);
  // Código del Trabajo Art. 69: 15 días + 1 día adicional desde el sexto año (completados >= 5) hasta máximo 30
  const extraVacationDays = Math.min(15, Math.max(0, completedYears - 5));
  const vacationDaysPerYear = 15 + extraVacationDays;
  const safeBase = Number.isFinite(monthlyBaseSalary) && monthlyBaseSalary > 0 ? monthlyBaseSalary : 0;

  return {
    fiscalYear: fiscalConfig.year,
    sbu: fiscalConfig.sbu,
    monthsWorked,
    completedYears,
    reserveFundEligible,
    reserveFundMonthsRemaining,
    vacationDaysPerYear,
    monthlyBase: roundCurrency(safeBase),
    estimatedIessPersonal: roundCurrency(safeBase * fiscalConfig.iessPersonalRate),
    estimatedIessPatronal: roundCurrency(safeBase * fiscalConfig.iessPatronalRate),
    estimatedDecimoTerceroMonthly: roundCurrency(safeBase / 12),
    estimatedDecimoCuartoMonthly: roundCurrency(fiscalConfig.sbu / 12),
    estimatedReserveFundMonthly: reserveFundEligible ? roundCurrency(safeBase * fiscalConfig.reserveFundRate) : 0,
    suggestedQuincenaAdvance: roundCurrency(safeBase * 0.5),
  };
}

export function evaluatePersonnelReadiness(
  person: PersonnelRecord,
  linkedAccount: GoogleAccount | undefined,
  latestComp: CompensationEntry | undefined,
): ProfileReadinessBreakdown {
  const checksLegal: Array<[boolean, string]> = [
    [Boolean(person.full_name.trim() && (person.job_title.trim() || person.department.trim())), 'Cargo o área operativa'],
    [Boolean(person.start_date), 'Fecha de ingreso laboral'],
    [Boolean(person.document_reference.trim()), 'Cédula / documento de identidad'],
    [Boolean(person.home_address.trim()), 'Domicilio del colaborador'],
    [Boolean(latestComp), 'Salario base / compensación'],
    [Boolean(person.email.trim() || person.phone.trim()), 'Correo o teléfono de contacto'],
  ];
  const checksOps: Array<[boolean, string]> = [
    [Boolean(linkedAccount), 'Cuenta Google vinculada'],
    [Boolean(linkedAccount && linkedAccount.access_profiles.length > 0 && linkedAccount.access_active), 'Perfil de acceso activo'],
  ];

  const legalPayrollComplete = checksLegal.filter(([ok]) => ok).length;
  const operationalComplete = checksOps.filter(([ok]) => ok).length;
  const score = legalPayrollComplete + operationalComplete;
  const maxScore = checksLegal.length + checksOps.length;
  const percent = Math.round((score / maxScore) * 100);
  const missingItems = [...checksLegal, ...checksOps].filter(([ok]) => !ok).map(([, label]) => label);

  let tier: ProfileReadinessBreakdown['tier'] = 'complete';
  if (legalPayrollComplete < checksLegal.length) {
    tier = 'incomplete';
  } else if (operationalComplete < checksOps.length) {
    tier = 'attention';
  }

  return {
    score,
    maxScore,
    percent,
    tier,
    legalPayrollComplete,
    legalPayrollTotal: checksLegal.length,
    operationalComplete,
    operationalTotal: checksOps.length,
    missingItems,
  };
}

export function resolveRoleFamily(
  department: string,
  jobTitle: string,
  accessProfiles: string[] = [],
): RoleFamily {
  const haystack = `${department} ${jobTitle} ${accessProfiles.join(' ')}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/(asesor|venta|comercial|caja|pos|encargado del local)/.test(haystack)) return 'commercial';
  if (/(disen|pre-prensa|preprensa|arte|branding|contenido|marketing)/.test(haystack)) return 'design';
  if (/(impres|sublim|laser|taller|instal|producc|bodega|troquel|neon|rotul)/.test(haystack)) return 'production';
  return 'general';
}

export function resolveDayScheduleForMember(
  dateIso: string,
  userId: string | null | undefined,
  workHours: TeamWorkHour[],
  exceptions: TeamWorkException[],
  rotations: TeamAreaRotation[],
): DayScheduleResolution {
  const weekday = ecuadorWeekday(dateIso);
  const dayRotations = rotations
    .filter((rot) => {
      if (!rot.active || rot.weekday !== weekday || rot.starts_on > dateIso || !userId) return false;
      return Boolean(rot.members?.some((m) => m.user_id === userId));
    })
    .map((rot) => {
      const memberPos = rot.members?.find((m) => m.user_id === userId)?.position ?? 1;
      return {
        areaName: rot.area_name,
        taskName: rot.task_name,
        startsAt: trimTimeToHm(rot.starts_at),
        endsAt: trimTimeToHm(rot.ends_at),
        position: memberPos,
      };
    });

  const memberException = userId
    ? exceptions.find((ex) => ex.work_date === dateIso && ex.user_id === userId)
    : undefined;
  if (memberException) {
    return {
      isWorkingDay: memberException.kind === 'open',
      source: 'member_exception',
      opensAt: trimTimeToHm(memberException.opens_at),
      closesAt: trimTimeToHm(memberException.closes_at),
      note: memberException.note || (memberException.kind === 'closed' ? 'Excepción individual: día libre' : 'Horario especial asignado'),
      rotations: dayRotations,
    };
  }

  const orgException = exceptions.find((ex) => ex.work_date === dateIso && ex.user_id === null);
  if (orgException) {
    return {
      isWorkingDay: orgException.kind === 'open',
      source: 'org_exception',
      opensAt: trimTimeToHm(orgException.opens_at),
      closesAt: trimTimeToHm(orgException.closes_at),
      note: orgException.note || (orgException.kind === 'closed' ? 'Cierre general programado' : 'Jornada especial general'),
      rotations: dayRotations,
    };
  }

  const dayHour = workHours.find((item) => item.weekday === weekday);
  if (dayHour) {
    return {
      isWorkingDay: dayHour.is_open,
      source: 'weekly_hours',
      opensAt: trimTimeToHm(dayHour.opens_at),
      closesAt: trimTimeToHm(dayHour.closes_at),
      note: dayHour.is_open ? 'Horario regular de atención/taller' : 'Descanso semanal regular',
      rotations: dayRotations,
    };
  }

  return {
    isWorkingDay: false,
    source: 'unavailable',
    opensAt: null,
    closesAt: null,
    note: 'Sin permiso para consultar horarios o sin configuración semanal',
    rotations: dayRotations,
  };
}

export function getAllowedDeductionTransitions(current: DeductionStatus): DeductionStatus[] {
  if (current === 'pending_authorization') return ['authorized', 'cancelled'];
  if (current === 'authorized') return ['sent_to_payroll', 'cancelled'];
  if (current === 'sent_to_payroll') return ['applied_externally'];
  return [];
}

export function validateDeductionTransition(
  current: DeductionStatus,
  next: DeductionStatus,
  refs: {
    authorizationReference?: string;
    evidenceReference?: string;
    payrollHandoffReference?: string;
  },
): { ok: true } | { ok: false; message: string } {
  const allowed = getAllowedDeductionTransitions(current);
  if (!allowed.includes(next)) {
    return {
      ok: false,
      message: `No se puede pasar directamente de "${DEDUCTION_STATUS_META[current].label}" a "${DEDUCTION_STATUS_META[next].label}".`,
    };
  }
  const isMeaningfulReference = (raw?: string): boolean => {
    const clean = (raw || '').trim();
    if (clean.length < 4) return false;
    return !/^(ok|si|sí|no|n\/a|na|test|prueba|pendiente|\.+|-+)$/i.test(clean);
  };

  if (next === 'authorized') {
    if (!refs.authorizationReference?.trim() || !refs.evidenceReference?.trim()) {
      return {
        ok: false,
        message:
          'Para autorizar debes ingresar la referencia de autorización expresa del colaborador y la referencia de evidencia.',
      };
    }
    if (!isMeaningfulReference(refs.authorizationReference) || !isMeaningfulReference(refs.evidenceReference)) {
      return {
        ok: false,
        message:
          'Ingresa referencias reales y descriptivas (mínimo 4 caracteres; evita abreviaturas genéricas como "ok" o "si").',
      };
    }
  }
  if (next === 'sent_to_payroll') {
    if (!refs.payrollHandoffReference?.trim()) {
      return {
        ok: false,
        message: 'Registra la referencia real de entrega al proceso externo de nómina (ej. correo, lote o folio).',
      };
    }
    if (!isMeaningfulReference(refs.payrollHandoffReference)) {
      return {
        ok: false,
        message:
          'La referencia de entrega a nómina debe identificar el lote, correo o folio (mínimo 4 caracteres).',
      };
    }
  }
  return { ok: true };
}

export function summarizeDeductionsByPeriod(
  deductions: PayrollDeduction[],
  periodMonth: string,
): {
  authorizedTotal: number;
  sentToPayrollTotal: number;
  appliedTotal: number;
  pendingTotal: number;
  deductibleTotal: number;
  periodItems: PayrollDeduction[];
} {
  const prefix = periodMonth.slice(0, 7);
  const periodItems = deductions.filter((item) => item.payroll_period.startsWith(prefix));
  let authorizedTotal = 0;
  let sentToPayrollTotal = 0;
  let appliedTotal = 0;
  let pendingTotal = 0;

  for (const item of periodItems) {
    const amt = Number(item.amount) || 0;
    if (item.status === 'pending_authorization') pendingTotal += amt;
    else if (item.status === 'authorized') authorizedTotal += amt;
    else if (item.status === 'sent_to_payroll') sentToPayrollTotal += amt;
    else if (item.status === 'applied_externally') appliedTotal += amt;
  }

  return {
    authorizedTotal: roundCurrency(authorizedTotal),
    sentToPayrollTotal: roundCurrency(sentToPayrollTotal),
    appliedTotal: roundCurrency(appliedTotal),
    pendingTotal: roundCurrency(pendingTotal),
    deductibleTotal: roundCurrency(authorizedTotal + sentToPayrollTotal + appliedTotal),
    periodItems,
  };
}

export function escapeCsvCell(raw: string | number | null | undefined): string {
  const value = raw == null ? '' : String(raw);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsvDocument(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function buildAttendanceSummaryByMonth(
  entries: AttendanceEntry[],
  monthIso: string,
): {
  monthEntries: AttendanceEntry[];
  presentCount: number;
  fieldCount: number;
  remoteCount: number;
  lateCount: number;
  lateMinutesTotal: number;
  leaveCount: number;
  absentCount: number;
} {
  const monthEntries = entries.filter((entry) => entry.date.startsWith(monthIso));
  let presentCount = 0;
  let fieldCount = 0;
  let remoteCount = 0;
  let lateCount = 0;
  let lateMinutesTotal = 0;
  let leaveCount = 0;
  let absentCount = 0;

  for (const entry of monthEntries) {
    if (entry.status === 'presente') presentCount += 1;
    else if (entry.status === 'en_campo') fieldCount += 1;
    else if (entry.status === 'remoto') remoteCount += 1;
    else if (entry.status === 'tardanza') {
      lateCount += 1;
      lateMinutesTotal += Number(entry.lateMinutes || 0);
    } else if (entry.status === 'permiso' || entry.status === 'vacaciones') {
      leaveCount += 1;
    } else if (entry.status === 'falta') {
      absentCount += 1;
    }
  }

  return {
    monthEntries,
    presentCount,
    fieldCount,
    remoteCount,
    lateCount,
    lateMinutesTotal,
    leaveCount,
    absentCount,
  };
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
