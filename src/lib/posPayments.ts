export type POSPaymentDraft = {
  id: string;
  method: string;
  amount: string | number;
  reference?: string;
  note?: string;
};

export type POSAppliedPayment = {
  method: 'cash' | 'transfer' | 'card' | 'other';
  amount: number;
  reference: string;
  note: string;
};

export type POSBalancePaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Otro';

/** Exact draft needed to safely replay a balance-payment RPC after a lost response. */
export type PendingPOSBalancePayment = {
  version: 2;
  idempotencyKey: string;
  saleId: string;
  method: POSBalancePaymentMethod;
  receivedCents: number;
  appliedCents: number;
  reference: string;
  note: string;
  createdAt: string;
};

const pendingBalancePaymentPrefix = (organizationId: string, userId: string) =>
  `visualcorp-pos-pending-payment-v2:${organizationId}:${userId}:`;

export function posBalancePaymentStorageKey(organizationId: string, userId: string, saleId: string) {
  return `${pendingBalancePaymentPrefix(organizationId, userId)}${saleId}`;
}

const isPendingPOSBalancePayment = (value: unknown): value is PendingPOSBalancePayment => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingPOSBalancePayment>;
  return candidate.version === 2
    && typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey.length >= 12
    && typeof candidate.saleId === 'string' && candidate.saleId.length >= 12
    && ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'].includes(String(candidate.method))
    && Number.isSafeInteger(candidate.receivedCents) && Number(candidate.receivedCents) > 0
    && Number.isSafeInteger(candidate.appliedCents) && Number(candidate.appliedCents) > 0
    && Number(candidate.appliedCents) <= Number(candidate.receivedCents)
    && typeof candidate.reference === 'string'
    && typeof candidate.note === 'string'
    && typeof candidate.createdAt === 'string' && Number.isFinite(Date.parse(candidate.createdAt));
};

export function loadPendingPOSBalancePayments(organizationId: string, userId: string): Record<string, PendingPOSBalancePayment> {
  if (typeof window === 'undefined') return {};
  const prefix = pendingBalancePaymentPrefix(organizationId, userId);
  const pending: Record<string, PendingPOSBalancePayment> = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('Hay un abono pendiente con datos ilegibles. No registres otro abono hasta resolverlo.');
    }
    if (!isPendingPOSBalancePayment(value) || key !== posBalancePaymentStorageKey(organizationId, userId, value.saleId)) {
      throw new Error('El abono pendiente está incompleto o no coincide con su venta. No registres otro abono hasta revisarlo.');
    }
    pending[value.saleId] = value;
  }
  return pending;
}

export function savePendingPOSBalancePayment(organizationId: string, userId: string, payment: PendingPOSBalancePayment): void {
  if (!isPendingPOSBalancePayment(payment)) throw new Error('El abono no tiene datos válidos para reintentar con seguridad.');
  if (typeof window === 'undefined') throw new Error('No está disponible el almacenamiento para proteger el abono.');
  const storageKey = posBalancePaymentStorageKey(organizationId, userId, payment.saleId);
  const existing = loadPendingPOSBalancePayments(organizationId, userId)[payment.saleId];
  if (existing && existing.idempotencyKey !== payment.idempotencyKey) {
    throw new Error('Ya existe un intento de abono pendiente para esta venta. Reintenta primero el mismo intento.');
  }
  if (existing && JSON.stringify(existing) !== JSON.stringify(payment)) {
    throw new Error('Los datos del abono pendiente cambiaron. Reintenta exactamente el intento guardado.');
  }
  window.localStorage.setItem(storageKey, JSON.stringify(payment));
  const saved = loadPendingPOSBalancePayments(organizationId, userId)[payment.saleId];
  if (saved?.idempotencyKey !== payment.idempotencyKey) {
    throw new Error('No se pudo verificar el guardado del intento de abono. No se envió el pago.');
  }
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(payment));
    window.sessionStorage.removeItem(`visualcorp-pos-payment-v1:${organizationId}:${userId}:${payment.saleId}`);
    window.sessionStorage.removeItem(`visualcorp-pos-payment-${payment.saleId}`);
  } catch {
    // localStorage is the durable recovery source; sessionStorage is only a compatibility cleanup.
  }
  try {
    window.localStorage.removeItem(`visualcorp-pos-payment-v1:${organizationId}:${userId}:${payment.saleId}`);
    window.localStorage.removeItem(`visualcorp-pos-payment-${payment.saleId}`);
  } catch {
    // Old string-only keys are deliberately never read by this recovery flow.
  }
}

export function clearPendingPOSBalancePayment(organizationId: string, userId: string, saleId: string): void {
  if (typeof window === 'undefined') return;
  const storageKey = posBalancePaymentStorageKey(organizationId, userId, saleId);
  window.localStorage.removeItem(storageKey);
  try { window.sessionStorage.removeItem(storageKey); } catch { /* localStorage is authoritative */ }
}

export function createPOSBalancePaymentKey(): string {
  return globalThis.crypto?.randomUUID?.() || `pos-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** A SQLSTATE means Postgres explicitly rolled back the RPC; transport/gateway errors remain ambiguous. */
export function isDefinitivePOSBalancePaymentError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: unknown }).code || '');
  return /^[0-9A-Z]{5}$/.test(code) && code !== '00000';
}

const toCents = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

const paymentMethods: Record<string, POSAppliedPayment['method']> = {
  Efectivo: 'cash',
  Transferencia: 'transfer',
  Tarjeta: 'card',
  Otro: 'other',
};

const paymentMethod = (method: string): POSAppliedPayment['method'] => paymentMethods[method] || 'other';

export function calculatePOSPaymentBreakdown(total: number, rows: POSPaymentDraft[]) {
  const totalCents = Math.max(0, toCents(total));
  const hasSingleBlankAmount = rows.length === 1 && String(rows[0].amount).trim() === '';
  const entries = rows.map((row) => ({
    row,
    receivedCents: hasSingleBlankAmount ? totalCents : toCents(row.amount),
    isCash: row.method === 'Efectivo',
  })).filter(({ receivedCents }) => receivedCents > 0);

  const nonCashCents = entries.reduce((sum, entry) => sum + (entry.isCash ? 0 : entry.receivedCents), 0);
  let cashToApply = Math.max(0, totalCents - nonCashCents);
  const cashReceived = entries.reduce((sum, entry) => sum + (entry.isCash ? entry.receivedCents : 0), 0);
  const payments: POSAppliedPayment[] = entries.flatMap(({ row, receivedCents, isCash }) => {
    const appliedCents = isCash ? Math.min(receivedCents, cashToApply) : receivedCents;
    if (isCash) cashToApply -= appliedCents;
    if (appliedCents <= 0) return [];
    return [{
      method: paymentMethod(row.method),
      amount: appliedCents / 100,
      reference: String(row.reference || '').trim(),
      note: String(row.note || '').trim(),
    }];
  });
  const appliedCents = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const receivedCents = entries.reduce((sum, entry) => sum + entry.receivedCents, 0);

  return {
    payments,
    received: receivedCents / 100,
    applied: appliedCents / 100,
    change: Math.max(0, cashReceived - payments.reduce((sum, payment) => sum + (payment.method === 'cash' ? toCents(payment.amount) : 0), 0)) / 100,
    balance: Math.max(0, totalCents - appliedCents) / 100,
    nonCashOverpayment: Math.max(0, nonCashCents - totalCents) / 100,
    cashWithoutBalance: cashReceived > 0 && nonCashCents >= totalCents,
  };
}
