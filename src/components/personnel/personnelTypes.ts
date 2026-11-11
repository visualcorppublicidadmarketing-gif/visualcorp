export type PersonnelStatus = 'active' | 'inactive';

export interface PersonnelRecord {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  job_title: string;
  status: PersonnelStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export type PersonnelEventKey =
  | 'record_created'
  | 'record_updated'
  | 'compensation_changed'
  | 'account_linked'
  | 'account_unlinked';

export interface PersonnelEvent {
  id: number;
  organization_id: string;
  personnel_id: string;
  event_key: PersonnelEventKey | string;
  summary: string;
  changed_fields: string[];
  salary_sensitive: boolean;
  actor_user_id: string | null;
  actor_label: string;
  created_at: string;
}

export interface CompensationEntry {
  id: string;
  organization_id: string;
  personnel_id: string;
  amount: number;
  currency_code: string;
  pay_period: string;
  effective_date: string;
  note: string;
  created_by: string;
  created_at: string;
}

export type DeductionStatus =
  | 'pending_authorization'
  | 'authorized'
  | 'sent_to_payroll'
  | 'applied_externally'
  | 'cancelled';

export interface PayrollDeduction {
  id: string;
  organization_id: string;
  employee_user_id: string | null;
  personnel_id: string | null;
  description: string;
  amount: number;
  payroll_period: string;
  status: DeductionStatus;
  authorization_reference: string;
  evidence_reference: string;
  payroll_handoff_reference?: string;
  payroll_handed_at?: string | null;
  payroll_handed_by?: string | null;
  note: string;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface GoogleAccount {
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
}

export interface AccessProfile {
  id: string;
  profile_key: string;
  name: string;
}

export type AttendanceStatus =
  | 'presente'
  | 'en_campo'
  | 'remoto'
  | 'tardanza'
  | 'permiso'
  | 'vacaciones'
  | 'falta';

export type AttendanceOrigin = 'manual_supervisor' | 'roll_call_quick' | 'imported_backup';

export interface AttendanceEntry {
  id: string;
  personnelId: string;
  date: string;
  status: AttendanceStatus;
  checkIn?: string;
  checkOut?: string;
  lateMinutes?: number;
  locationNote?: string;
  note: string;
  origin?: AttendanceOrigin;
  recordedAt: string;
}

export interface TeamWorkHour {
  organization_id: string;
  weekday: number;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
}

export interface TeamWorkException {
  id: string;
  organization_id: string;
  work_date: string;
  user_id: string | null;
  kind: 'open' | 'closed';
  opens_at: string | null;
  closes_at: string | null;
  note: string;
}

export interface TeamAreaRotation {
  id: string;
  organization_id: string;
  area_name: string;
  task_name: string;
  weekday: number;
  starts_on: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  note: string;
  members?: Array<{ user_id: string; position: number }>;
}

export interface SalesMetricRecord {
  id: string;
  sale_code: string | null;
  customer_name: string;
  subtotal: number;
  discount_total: number;
  discount_reason: string | null;
  total: number;
  paid_total: number;
  balance_due: number;
  status: string;
  advisor_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface QuoteMetricRecord {
  id: string;
  quote_code: string | null;
  customer_name: string | null;
  status: string;
  chosen_tier: string | null;
  selected_total: number;
  created_by: string | null;
  created_at: string;
}

export interface ProductionStepMetricRecord {
  id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  sale_code: string | null;
  customer_name: string | null;
  step_title: string;
  area_code: string;
  area_name: string;
  status: string;
  assigned_to: string | null;
  due_at: string | null;
  updated_at: string;
  source: 'workflow_step' | 'legacy_order';
}

export interface OperationalMetricsState {
  loading: boolean;
  errors: string[];
  sales: SalesMetricRecord[];
  quotes: QuoteMetricRecord[];
  productionTasks: ProductionStepMetricRecord[];
}

export type RoleFamily = 'commercial' | 'design' | 'production' | 'general';

export type ReadinessTier = 'complete' | 'attention' | 'incomplete';

export interface ProfileReadinessBreakdown {
  score: number;
  maxScore: number;
  percent: number;
  tier: ReadinessTier;
  legalPayrollComplete: number;
  legalPayrollTotal: number;
  operationalComplete: number;
  operationalTotal: number;
  missingItems: string[];
}

export interface DayScheduleResolution {
  isWorkingDay: boolean;
  source: 'member_exception' | 'org_exception' | 'weekly_hours' | 'unavailable';
  opensAt: string | null;
  closesAt: string | null;
  note: string;
  rotations: Array<{ areaName: string; taskName: string; startsAt: string; endsAt: string; position: number }>;
}

export interface EcuadorFiscalConfig {
  year: number;
  sbu: number;
  sbuResolution: string;
  iessPersonalRate: number;
  iessPatronalRate: number;
  reserveFundRate: number;
  maxWeeklyOvertimeHours: number;
  fineCapMonthlyRatio: number;
  costaDecimoCuartoDeadline: string;
  decimoTerceroDeadline: string;
}

export interface EcuadorEntitlementsEstimate {
  fiscalYear: number;
  sbu: number;
  monthsWorked: number;
  completedYears: number;
  reserveFundEligible: boolean;
  reserveFundMonthsRemaining: number;
  vacationDaysPerYear: number;
  monthlyBase: number;
  estimatedIessPersonal: number;
  estimatedIessPatronal: number;
  estimatedDecimoTerceroMonthly: number;
  estimatedDecimoCuartoMonthly: number;
  estimatedReserveFundMonthly: number;
  suggestedQuincenaAdvance: number;
}
