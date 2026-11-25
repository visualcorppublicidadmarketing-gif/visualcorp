export const FINANCE_TIME_ZONE = 'America/Guayaquil';

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Efectivo', color: '#17866f' },
  { id: 'transfer', label: 'Transferencia', color: '#3977c5' },
  { id: 'card', label: 'Tarjeta', color: '#8a59c4' },
  { id: 'cheque', label: 'Cheque', color: '#d08b31' },
  { id: 'other', label: 'Otros', color: '#718096' },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]['id'];

export function businessDate(value: string | Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: FINANCE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function mondayOf(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
  return parsed.toISOString().slice(0, 10);
}

export function addDays(date: string, count: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + count);
  return parsed.toISOString().slice(0, 10);
}

// Ecuador continental uses UTC-05:00. Querying this boundary keeps the
// database timestamp range aligned with the week shown in the interface.
export function businessDayBoundary(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 5)).toISOString();
}

export function cents(value: number | string | null | undefined) {
  return Math.round(Number(value || 0) * 100);
}

export function normalizePaymentMethod(value: string | null | undefined): PaymentMethodId {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'cash' || method === 'transfer' || method === 'card' || method === 'cheque') return method;
  if (method === 'check') return 'cheque';
  return 'other';
}

export function weekdayLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long' }) {
  return new Intl.DateTimeFormat('es-EC', { ...options, timeZone: FINANCE_TIME_ZONE })
    .format(new Date(`${date}T12:00:00Z`));
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('es-EC', { ...options, timeZone: FINANCE_TIME_ZONE })
    .format(new Date(`${date}T12:00:00Z`));
}

export function saleReturnedCents(sale: any, saleReturns: any[]) {
  const subtotal = Number(sale?.subtotal || 0);
  const discountRate = subtotal > 0
    ? Math.min(1, Math.max(0, Number(sale?.discount_total || 0) / subtotal))
    : 0;
  const returnedValue = saleReturns.reduce((sum, saleReturn) => {
    if (saleReturn.kind === 'cancellation') return sum;
    const lines = Array.isArray(saleReturn.sale_return_lines) ? saleReturn.sale_return_lines : [];
    return sum + lines.reduce((lineSum: number, line: any) => {
      const saleLine = Array.isArray(line.sale_lines) ? line.sale_lines[0] : line.sale_lines;
      return lineSum + Number(line.quantity || 0) * Number(saleLine?.unit_price || 0) * (1 - discountRate);
    }, 0);
  }, 0);
  return cents(returnedValue);
}
