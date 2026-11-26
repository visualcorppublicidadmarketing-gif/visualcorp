import { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { businessDayBoundary } from './weeklyFinanceSummaryModel';

const PAGE_SIZE = 500;

async function readAllRows(createQuery: () => any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await createQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export type SaleRow = {
  id: string;
  sale_code: string | null;
  status: string;
  total: number | string;
  created_at: string;
  branch_id: string | null;
  advisor_id: string | null;
};

export type PaymentRow = {
  id: string;
  sale_id: string;
  amount: number | string;
  method: string | null;
  reference: string | null;
  created_at: string;
};

export type RefundRow = {
  id: string;
  return_code: string;
  sale_id: string;
  branch_id: string;
  amount: number | string;
  method: string | null;
  reference: string | null;
  settled_at: string;
};

type FinancePeriodOptions = {
  organizationId?: string | null;
  start: string;
  end: string;
  branchFilter: string;
  canSeeRefunds: boolean;
  canSeeTeam: boolean;
  scope: 'daily' | 'weekly';
};

export function useFinancePeriod({
  organizationId, start, end, branchFilter, canSeeRefunds, canSeeTeam, scope,
}: FinancePeriodOptions) {
  const instanceId = useId();
  const [reloadCount, setReloadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rosterError, setRosterError] = useState('');
  const refreshTimer = useRef<number | null>(null);
  const [snapshot, setSnapshot] = useState<{
    sales: SaleRow[];
    payments: PaymentRow[];
    refunds: RefundRow[];
    saleContext: SaleRow[];
    branches: { id: string; code: string; name: string }[];
    team: { active: boolean; role: string; access_profile_key?: string; user_id: string; full_name: string | null }[];
  }>({ sales: [], payments: [], refunds: [], saleContext: [], branches: [], team: [] });

  useEffect(() => {
    if (!supabase || !organizationId) return undefined;
    const channel = supabase.channel(`finance-${scope}-${organizationId}-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`);
    const scheduleRefresh = () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => setReloadCount((value) => value + 1), 350);
    };
    ['sales', 'sale_payments', 'sale_refund_settlements'].forEach((table) => {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}`,
      }, scheduleRefresh);
    });
    channel.subscribe();
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [organizationId, scope, instanceId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      setRosterError('');
      if (!supabase) {
        setError('La conexión con la base de datos no está disponible.');
        setLoading(false);
        return;
      }
      if (!organizationId) {
        setError('Esta cuenta no tiene una organización asignada.');
        setLoading(false);
        return;
      }

      const startAt = businessDayBoundary(start);
      const endAt = businessDayBoundary(end);
      try {
        const salesQuery = () => {
          let query = supabase!
            .from('sales')
            .select('id,sale_code,status,total,created_at,branch_id,advisor_id')
            .eq('organization_id', organizationId)
            .eq('status', 'confirmed')
            .gte('created_at', startAt)
            .lt('created_at', endAt)
            .order('created_at', { ascending: true })
            .order('id');
          if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter);
          return query;
        };
        const paymentsQuery = () => supabase!
          .from('sale_payments')
          .select('id,sale_id,amount,method,reference,created_at')
          .eq('organization_id', organizationId)
          .gte('created_at', startAt)
          .lt('created_at', endAt)
          .order('created_at', { ascending: true })
          .order('id');
        const refundsQuery = () => {
          let query = supabase!
            .from('sale_refund_settlements')
            .select('id,return_code,sale_id,branch_id,amount,method,reference,settled_at')
            .eq('organization_id', organizationId)
            .gte('settled_at', startAt)
            .lt('settled_at', endAt)
            .order('settled_at', { ascending: true })
            .order('id');
          if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter);
          return query;
        };

        const [sales, payments, refunds, branchesResult, teamResult] = await Promise.all([
          readAllRows(salesQuery),
          readAllRows(paymentsQuery),
          canSeeRefunds ? readAllRows(refundsQuery) : Promise.resolve([]),
          supabase.from('branches').select('id,code,name').eq('organization_id', organizationId).eq('active', true).order('name'),
          canSeeTeam ? supabase.rpc('list_visualcorp_team_members') : Promise.resolve({ data: [], error: null }),
        ]);
        if (branchesResult.error) throw branchesResult.error;

        const knownSales = new Map<string, SaleRow>(sales.map((sale: SaleRow) => [sale.id, sale]));
        const extraIds = [...new Set<string>([
          ...payments.map((payment: PaymentRow) => payment.sale_id),
          ...refunds.map((refund: RefundRow) => refund.sale_id),
        ])].filter((id) => !knownSales.has(id));
        const saleBatches: string[][] = [];
        for (let index = 0; index < extraIds.length; index += 250) saleBatches.push(extraIds.slice(index, index + 250));
        const extraSaleRows = await Promise.all(saleBatches.map((ids) => readAllRows(() => {
          let query = supabase!
            .from('sales')
            .select('id,sale_code,status,total,created_at,branch_id,advisor_id')
            .eq('organization_id', organizationId)
            .in('id', ids)
            .order('id');
          if (branchFilter !== 'all') query = query.eq('branch_id', branchFilter);
          return query;
        })));
        extraSaleRows.flat().forEach((sale: SaleRow) => knownSales.set(sale.id, sale));

        if (!active) return;
        setSnapshot({
          sales: sales as SaleRow[],
          payments: payments as PaymentRow[],
          refunds: refunds as RefundRow[],
          saleContext: [...knownSales.values()],
          branches: branchesResult.data || [],
          team: teamResult.data || [],
        });
        if (teamResult.error) {
          setRosterError('No se pudo cargar el directorio completo de asesoras. Se muestran las personas con movimientos en este periodo.');
        }
      } catch (loadError: any) {
        if (active) {
          setSnapshot({ sales: [], payments: [], refunds: [], saleContext: [], branches: [], team: [] });
          setError(loadError?.message || 'No se pudieron cargar las ventas y los cobros del periodo.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [organizationId, start, end, branchFilter, reloadCount, canSeeRefunds, canSeeTeam]);

  return { snapshot, loading, error, rosterError, refresh: () => setReloadCount((value) => value + 1) };
}
