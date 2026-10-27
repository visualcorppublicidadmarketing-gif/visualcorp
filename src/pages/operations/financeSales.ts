export type SaleReturnTotals = { returnedValue?: number };

export function netSaleAmount(
  sale: { id: string; total?: number | string | null },
  returnsBySale: ReadonlyMap<string, SaleReturnTotals>,
) {
  const total = Number(sale.total || 0);
  const returnedValue = Number(returnsBySale.get(sale.id)?.returnedValue || 0);
  return Math.max(0, total - returnedValue);
}
