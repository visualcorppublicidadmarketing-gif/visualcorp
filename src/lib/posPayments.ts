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
