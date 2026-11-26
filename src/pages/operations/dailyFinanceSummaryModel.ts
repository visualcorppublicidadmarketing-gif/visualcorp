import { cents, FINANCE_TIME_ZONE, normalizePaymentMethod, PAYMENT_METHODS } from './weeklyFinanceSummaryModel.ts';
import type { PaymentRow, RefundRow, SaleRow } from './useFinancePeriod';

const clock = new Intl.DateTimeFormat('es-EC', {
  timeZone: FINANCE_TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
});

export const financeTime = (value: string | Date) => clock.format(new Date(value));
export const financeHour = (value: string | Date) => Number(financeTime(value).slice(0, 2));
export const unassignedAdvisor = 'unassigned';

export function summarizeFinanceDay(
  snapshot: { sales: SaleRow[]; payments: PaymentRow[]; refunds: RefundRow[]; saleContext: SaleRow[] },
  branch: string,
  advisor: string,
) {
  const salesById = new Map(snapshot.saleContext.map((sale) => [sale.id, sale]));
  const advisorOf = (sale: SaleRow) => sale.advisor_id || unassignedAdvisor;
  const matches = (sale: SaleRow, branchId = sale.branch_id) => (
    (branch === 'all' || branchId === branch) && (advisor === 'all' || advisorOf(sale) === advisor)
  );

  const sales = snapshot.sales.filter((sale) => matches(sale));
  const payments = snapshot.payments.flatMap((row) => {
    const sale = salesById.get(row.sale_id);
    if (!sale || !matches(sale)) return [];
    return [{ ...row, sale, amountCents: cents(row.amount), method: normalizePaymentMethod(row.method) }];
  });
  const refunds = snapshot.refunds.flatMap((row) => {
    const sale = salesById.get(row.sale_id);
    if (!sale || !matches(sale, row.branch_id)) return [];
    return [{ ...row, sale, amountCents: cents(row.amount), method: normalizePaymentMethod(row.method) }];
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0, collected: 0 }));
  const methods = new Map(PAYMENT_METHODS.map(({ id }) => [id, 0]));
  const advisors = new Map<string, { id: string; sales: number; collected: number }>();
  const advisorTotals = (sale: SaleRow) => {
    const id = advisorOf(sale);
    let row = advisors.get(id);
    if (!row) {
      row = { id, sales: 0, collected: 0 };
      advisors.set(id, row);
    }
    return row;
  };

  let salesCents = 0;
  let collectedCents = 0;
  for (const sale of sales) {
    const amount = cents(sale.total);
    salesCents += amount;
    hourly[financeHour(sale.created_at)].sales += amount;
    advisorTotals(sale).sales += amount;
  }
  for (const payment of payments) {
    const amount = payment.amountCents;
    collectedCents += amount;
    hourly[financeHour(payment.created_at)].collected += amount;
    methods.set(payment.method, (methods.get(payment.method) ?? 0) + amount);
    advisorTotals(payment.sale).collected += amount;
  }

  const movements = [
    ...payments.map((row) => ({ ...row, type: 'payment' as const, timestamp: row.created_at })),
    ...refunds.map((row) => ({ ...row, type: 'refund' as const, timestamp: row.settled_at })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id));

  return {
    salesCents, collectedCents, refundsCents: refunds.reduce((sum, row) => sum + row.amountCents, 0),
    saleCount: sales.length, paymentCount: payments.length, refundCount: refunds.length,
    hourly, methods, advisors: [...advisors.values()], movements,
  };
}
