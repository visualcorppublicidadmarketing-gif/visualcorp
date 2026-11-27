import { supabase } from './supabaseClient';

/** Reuse the database's POS rule: return valuation, settled refunds and balance. */
export async function withCommercialBalances<T extends { id: string }>(sales: T[]): Promise<Array<T & { adjusted_total: number; paid_total: number; balance_due: number; refunded: number; customer_credit: number }>> {
  if (!sales.length) return [];
  if (!supabase) throw new Error('No hay conexión para comprobar los saldos.');
  const { data, error } = await supabase.rpc('get_commercial_sale_balances', { p_sale_ids: sales.map(sale => sale.id) });
  if (error) throw error;
  const byId = new Map((data || []).map((balance: any) => [balance.id, balance]));
  return sales.map(sale => {
    const balance = byId.get(sale.id) as any;
    if (!balance) throw new Error('No se pudo comprobar el saldo de una venta.');
    return { ...sale, ...balance };
  });
}
