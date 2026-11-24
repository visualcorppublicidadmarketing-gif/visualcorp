export type PendingPOSCashMovement = {
  version: 1;
  idempotencyKey: string;
  sessionId: string;
  direction: 'in' | 'out';
  amountCents: number;
  reason: string;
  createdAt: string;
};

const isPendingPOSCashMovement = (value: unknown): value is PendingPOSCashMovement => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingPOSCashMovement>;
  return candidate.version === 1
    && typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey.length >= 12
    && typeof candidate.sessionId === 'string' && candidate.sessionId.length >= 12
    && (candidate.direction === 'in' || candidate.direction === 'out')
    && typeof candidate.amountCents === 'number' && Number.isSafeInteger(candidate.amountCents) && candidate.amountCents > 0
    && typeof candidate.reason === 'string' && candidate.reason.trim().length >= 3 && candidate.reason.length <= 500
    && typeof candidate.createdAt === 'string' && Number.isFinite(Date.parse(candidate.createdAt));
};

export function loadPendingPOSCashMovement(storageKey: string): PendingPOSCashMovement | null {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Hay un movimiento de caja pendiente con datos ilegibles. No registres otro hasta resolverlo.');
  }
  if (!isPendingPOSCashMovement(value)) {
    throw new Error('El movimiento de caja pendiente está incompleto. No registres otro hasta revisarlo.');
  }
  return value;
}

export function savePendingPOSCashMovement(storageKey: string, movement: PendingPOSCashMovement): void {
  if (!isPendingPOSCashMovement(movement)) throw new Error('El movimiento de caja no tiene datos válidos para recuperación.');
  window.localStorage.setItem(storageKey, JSON.stringify(movement));
  const saved = loadPendingPOSCashMovement(storageKey);
  if (saved?.idempotencyKey !== movement.idempotencyKey) {
    throw new Error('No se pudo comprobar el guardado seguro del movimiento de caja.');
  }
}

export function clearPendingPOSCashMovement(storageKey: string): void {
  window.localStorage.removeItem(storageKey);
}

export function createPOSCashMovementKey(): string {
  return globalThis.crypto?.randomUUID?.() || `pos-cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
