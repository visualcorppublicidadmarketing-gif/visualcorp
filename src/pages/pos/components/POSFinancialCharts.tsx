import React from 'react';
import { TrendingUp, PieChart as PieIcon } from 'lucide-react';

export function POSFinancialCharts({ dailyBreakdown = [], paymentMethods = {} }: { dailyBreakdown?: Array<{ totalSales?: number; totalDeposits?: number; date?: string; label?: string; dayName?: string }>; paymentMethods?: Record<string, number> }) {
  const money = (val) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(val) || 0);

  // Prepare Daily Trend Data
  const days = dailyBreakdown.slice(-7);
  const maxAmount = Math.max(1, ...days.flatMap((day) => [day.totalSales || 0, day.totalDeposits || 0]));

  // Prepare Payment Methods Donut Data
  const methodLabels: Record<string, string> = {
    cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque', other: 'Otro medio',
  };
  const methodColors = ['#16a34a', '#0284c7', '#ea580c', '#64748b', '#6366f1'];
  const methods = Object.entries(paymentMethods)
    .map(([key, rawValue], index) => ({ label: methodLabels[key] || key, value: Number(rawValue) || 0, color: methodColors[index % methodColors.length] }))
    .filter((method) => method.value > 0);

  const totalPayments = methods.reduce((sum, m) => sum + m.value, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
      
      {/* Chart 1: Daily Sales & Collections Bar Trend */}
      <div style={{
        background: 'var(--paper)',
        borderRadius: '16px',
        border: '1px solid var(--line)',
        padding: '20px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <TrendingUp size={18} style={{ color: 'var(--orange)' }} />
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--ink)' }}>
            Tendencia de ventas y abonos
          </h4>
        </div>

        {days.length === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            No hay registros suficientes en este período.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', height: '140px', paddingTop: '20px' }}>
            {days.map((d, idx) => {
              const salesHeight = (d.totalSales || 0) > 0 ? Math.max(3, ((d.totalSales || 0) / maxAmount) * 110) : 2;
              const depositsHeight = (d.totalDeposits || 0) > 0 ? Math.max(3, ((d.totalDeposits || 0) / maxAmount) * 110) : 2;
              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '110px' }}>
                    {/* Sales Bar */}
                    <div
                      title={`Ventas: ${money(d.totalSales)}`}
                      style={{
                        width: '12px',
                        height: `${salesHeight}px`,
                        background: 'var(--orange)',
                        borderRadius: '4px 4px 0 0'
                      }}
                    />
                    {/* Deposits Bar */}
                    <div
                      title={`Cobrado: ${money(d.totalDeposits)}`}
                      style={{
                        width: '12px',
                        height: `${depositsHeight}px`,
                        background: '#22c55e',
                        borderRadius: '4px 4px 0 0'
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)' }}>
                    {d.dayName ? d.dayName.substring(0, 3) : `D${idx + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--line)', fontSize: '11px', fontWeight: 800 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'var(--orange)' }} />
            <span>Ventas</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: '#22c55e' }} />
            <span>Abonos</span>
          </div>
        </div>
      </div>

      {/* Chart 2: Payment Methods Breakdown */}
      <div style={{
        background: 'var(--paper)',
        borderRadius: '16px',
        border: '1px solid var(--line)',
        padding: '20px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <PieIcon size={18} style={{ color: '#0284c7' }} />
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--ink)' }}>
            Recaudación por medio de pago
          </h4>
        </div>

        {totalPayments === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            No hay cobros registrados en este período.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {methods.map((m, idx) => {
              const pct = totalPayments > 0 ? ((m.value / totalPayments) * 100).toFixed(1) : 0;
              return (
                <div key={idx} style={{ display: 'grid', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: m.color }} />
                      {m.label}
                    </span>
                    <span style={{ fontWeight: 800, fontFamily: 'Space Grotesk', color: 'var(--ink)' }}>
                      {money(m.value)} <span style={{ color: 'var(--muted)', fontSize: '11px' }}>({pct}%)</span>
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: m.color, borderRadius: '3px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
