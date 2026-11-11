import { supabase } from './supabaseClient';

export const ADMIN_CONTROL_BASE_ROLES = new Set(['owner', 'admin', 'manager']);

export type HasPermissionFn = (module: string, action: string) => boolean;

export function hasAdminControlRole(roles: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => ADMIN_CONTROL_BASE_ROLES.has(role));
}

export function canAdminDeleteSales(
  roles: readonly string[] | null | undefined,
  hasPermission: HasPermissionFn
): boolean {
  return hasAdminControlRole(roles) && hasPermission('sales', 'delete_records');
}

export function canAdminDeleteCash(
  roles: readonly string[] | null | undefined,
  hasPermission: HasPermissionFn
): boolean {
  return hasAdminControlRole(roles) && hasPermission('cash', 'delete_records');
}

export function canManageCashControl(
  roles: readonly string[] | null | undefined,
  hasPermission: HasPermissionFn
): boolean {
  return (
    hasAdminControlRole(roles) &&
    (hasPermission('cash', 'manage_cash') || hasPermission('finance', 'manage_finance'))
  );
}

export function isMissingAdminRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; details?: string; hint?: string };
  const haystack = `${err.code || ''} ${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();
  return (
    err.code === '42883' ||
    err.code === 'PGRST202' ||
    haystack.includes('could not find the function') ||
    (haystack.includes('function') && haystack.includes('does not exist'))
  );
}

export function formatAdminControlError(error: unknown, fallback = 'No se pudo completar la operación.'): string {
  if (isMissingAdminRpcError(error)) {
    return 'Falta aplicar la migración SQL de borrado administrativo (20261111180500_cash_sales_admin_delete_rpcs.sql) en Supabase SQL Editor para habilitar eliminaciones permanentes y limpieza masiva.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    const msg = ((error as { message: string }).message || '').trim();
    if (msg) return msg;
  }
  return fallback;
}

export function formatMoneyUsd(value: unknown): string {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `$${safe.toFixed(2)}`;
}

export interface CashMonitorLiveTotals {
  opening_cash: number;
  movements_in: number;
  movements_out: number;
  cash_sales_total: number;
  transfer_sales_total: number;
  card_sales_total: number;
  other_sales_total: number;
  sales_count: number;
  expected_cash: number;
}

export interface CashMonitorMovementRow {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  reason: string;
  voided: boolean;
  void_reason?: string | null;
  created_by: string | null;
  created_at: string;
  voided_by?: string | null;
  voided_at?: string | null;
  created_by_name: string;
}

export interface CashMonitorLinkedSaleRow {
  id: string;
  sale_code: string;
  status: string;
  total: number;
  subtotal: number;
  discount_total: number;
  tax_amount: number;
  payment_method: string;
  note: string | null;
  advisor_id: string | null;
  created_by: string | null;
  created_at: string;
  customer_name: string;
  advisor_name: string;
  cash_in_session: number;
  non_cash_total: number;
  payment_methods: string[];
}

export interface CashMonitorAuditRow {
  id: string;
  action: string;
  reason: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  created_by_name: string;
}

export interface CashMonitorSessionDetail {
  session: {
    id: string;
    organization_id: string;
    branch_id: string;
    cash_register_id: string | null;
    opened_by: string;
    opened_at: string;
    opening_cash: number;
    closed_by: string | null;
    closed_at: string | null;
    closing_cash: number | null;
    expected_cash: number | null;
    cash_difference: number | null;
    status: string;
    note: string | null;
    branch_name: string;
    register_name: string;
  };
  live_totals: CashMonitorLiveTotals;
  movements: CashMonitorMovementRow[];
  linked_sales: CashMonitorLinkedSaleRow[];
  audits: CashMonitorAuditRow[];
}

export interface AdminDeletionAuditRecord {
  id: string;
  organization_id: string;
  branch_id: string | null;
  entity_type: 'sale' | 'cash_session' | 'cash_register' | 'cash_movement' | 'test_batch';
  entity_id: string;
  entity_code: string | null;
  action: string;
  reason: string;
  is_test_cleanup: boolean;
  restore_inventory: boolean;
  cascade_sales: boolean;
  affected_session_ids: string[];
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  created_by_name?: string;
  branch_name?: string;
}

function requireClient() {
  if (!supabase) throw new Error('Supabase no está configurado en esta sesión.');
  return supabase;
}

export async function fetchCashMonitorSessionDetail(sessionId: string): Promise<CashMonitorSessionDetail> {
  const client = requireClient();
  const { data, error } = await client.rpc('get_cash_monitor_session_detail', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as CashMonitorSessionDetail;
}

export async function updateCashRegisterControl(params: {
  registerId: string;
  name: string;
  branchId: string;
  assignedAdvisorId?: string | null;
  active?: boolean;
  weekStart?: string | null;
  goalAmount?: number | null;
}) {
  const client = requireClient();
  const { data, error } = await client.rpc('update_cash_register_control', {
    p_register_id: params.registerId,
    p_name: params.name.trim(),
    p_branch_id: params.branchId,
    p_assigned_advisor_id: params.assignedAdvisorId || null,
    p_active: params.active ?? true,
    p_week_start: params.weekStart || null,
    p_goal_amount: params.goalAmount ?? null,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function deletePosSale(params: {
  saleId: string;
  reason: string;
  restoreInventory?: boolean;
  isTest?: boolean;
}) {
  const client = requireClient();
  const { data, error } = await client.rpc('delete_pos_sale', {
    p_sale_id: params.saleId,
    p_reason: params.reason.trim(),
    p_restore_inventory: params.restoreInventory ?? true,
    p_is_test: params.isTest ?? false,
  });
  if (error) throw error;
  return data as {
    deleted: boolean;
    sale_id: string;
    sale_code: string;
    total: number;
    restored_inventory_variants: number;
    restored_rolls: number;
    quote_reverted: boolean;
    recalculated_session_ids: string[];
    is_test_cleanup: boolean;
  };
}

export async function deleteCashSession(params: {
  sessionId: string;
  reason: string;
  cascadeSales?: boolean;
  restoreInventory?: boolean;
  isTest?: boolean;
}) {
  const client = requireClient();
  const { data, error } = await client.rpc('delete_cash_session', {
    p_session_id: params.sessionId,
    p_reason: params.reason.trim(),
    p_cascade_sales: params.cascadeSales ?? false,
    p_restore_inventory: params.restoreInventory ?? true,
    p_is_test: params.isTest ?? false,
  });
  if (error) throw error;
  return data as {
    deleted: boolean;
    session_id: string;
    cascade_sales: boolean;
    deleted_sales_count: number;
    detached_payments_count: number;
    reverted_refunds_count: number;
    deleted_movements_count: number;
    is_test_cleanup: boolean;
  };
}

export async function deleteCashRegister(params: {
  registerId: string;
  reason: string;
  detachSessions?: boolean;
}) {
  const client = requireClient();
  const { data, error } = await client.rpc('delete_cash_register', {
    p_register_id: params.registerId,
    p_reason: params.reason.trim(),
    p_detach_sessions: params.detachSessions ?? true,
  });
  if (error) throw error;
  return data as {
    deleted: boolean;
    register_id: string;
    name: string;
    detached_sessions_count: number;
    deleted_goals_count: number;
  };
}

export async function bulkCleanupTestRecords(params: {
  saleIds?: string[];
  sessionIds?: string[];
  reason: string;
  restoreInventory?: boolean;
}) {
  const client = requireClient();
  const { data, error } = await client.rpc('bulk_cleanup_test_records', {
    p_sale_ids: params.saleIds ?? [],
    p_session_ids: params.sessionIds ?? [],
    p_reason: params.reason.trim(),
    p_restore_inventory: params.restoreInventory ?? true,
  });
  if (error) throw error;
  return data as {
    deleted_sales_count: number;
    deleted_sessions_count: number;
    sales: Array<Record<string, unknown>>;
    sessions: Array<Record<string, unknown>>;
  };
}

export async function fetchAdminDeletionAudits(
  organizationId: string,
  limit = 60
): Promise<AdminDeletionAuditRecord[]> {
  if (!supabase || !organizationId) return [];
  const { data, error } = await supabase
    .from('admin_deletion_audits')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data || []) as AdminDeletionAuditRecord[];
  const userIds = Array.from(
    new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))
  );
  const branchIds = Array.from(
    new Set(rows.map((r) => r.branch_id).filter((id): id is string => Boolean(id)))
  );

  const [profilesRes, branchesRes] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('user_id, full_name').in('user_id', userIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
    branchIds.length
      ? supabase.from('branches').select('id, name').in('id', branchIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);

  const userMap = new Map(
    (profilesRes.data || []).map((p) => [p.user_id, p.full_name?.trim() || 'Administrador'])
  );
  const branchMap = new Map((branchesRes.data || []).map((b) => [b.id, b.name]));

  return rows.map((row) => ({
    ...row,
    created_by_name: row.created_by ? userMap.get(row.created_by) || 'Administrador' : 'Sistema',
    branch_name: row.branch_id ? branchMap.get(row.branch_id) || 'Sucursal' : 'Global',
  }));
}
