import React from 'react';
import {
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Clock,
  DollarSign,
  TrendingUp,
  CreditCard,
  Building2,
  ShieldCheck,
  UserCheck,
  ShoppingBag
} from 'lucide-react';
import { calculateMultiTerminalLiveStatus } from '../../../lib/posStore';

export function POSLiveTerminalCards({ store, onSelectAdvisorForAudit }) {
  const terminals = calculateMultiTerminalLiveStatus(store);
  const money = (val) => `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalCashAllDrawers = terminals.reduce((sum, t) => sum + t.currentDrawerCash, 0);
  const totalTransfersAll = terminals.reduce((sum, t) => sum + t.transfersCollected, 0);
  const activeTerminalsCount = terminals.filter((t) => t.status === 'open' || t.status === 'review_needed').length;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Top Telemetry Summary Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '16px',
        padding: '18px 24px',
        color: '#fff',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        border: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#38bdf8'
          }}>
            <Monitor size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#f8fafc' }}>
                Monitoreo Multi-Terminal en Tiempo Real
              </h3>
              <span style={{
                background: 'rgba(34, 197, 94, 0.2)',
                color: '#4ade80',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                ● {activeTerminalsCount} Cajas Activas
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
              Telemetría en vivo de gavetas de efectivo, ventas y estado de turnos por asesora.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>
              Total Efectivo en Gavetas
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#4ade80', fontFamily: 'Space Grotesk' }}>
              {money(totalCashAllDrawers)}
            </div>
          </div>
          <div style={{ width: '1px', height: '32px', background: '#334155' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>
              Total Transferencias Hoy
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#38bdf8', fontFamily: 'Space Grotesk' }}>
              {money(totalTransfersAll)}
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Cashier Terminal Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
        gap: '16px'
      }}>
        {terminals.map((t) => {
          const isOpen = t.status === 'open';
          const isReview = t.status === 'review_needed';
          const isClosedWithSales = t.status === 'closed_with_sales';

          let statusBg = '#f1f5f9';
          let statusColor = '#64748b';
          let borderColor = 'var(--line)';

          if (isOpen) {
            statusBg = '#ecfdf5';
            statusColor = '#059669';
            borderColor = '#a7f3d0';
          } else if (isReview) {
            statusBg = '#fffbeb';
            statusColor = '#d97706';
            borderColor = '#fde68a';
          } else if (isClosedWithSales) {
            statusBg = '#eff6ff';
            statusColor = '#2563eb';
            borderColor = '#bfdbfe';
          }

          return (
            <div
              key={t.advisorId}
              style={{
                background: 'var(--paper)',
                borderRadius: '16px',
                border: `1px solid ${borderColor}`,
                padding: '18px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
            >
              <div>
                {/* Header with Avatar & Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'var(--orange)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: '16px'
                    }}>
                      {t.advisorName.charAt(0)}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--ink)' }}>
                        {t.advisorName}
                      </h4>
                      <span style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'capitalize' }}>
                        {t.advisorRole} • PIN 6d
                      </span>
                    </div>
                  </div>

                  <span style={{
                    background: statusBg,
                    color: statusColor,
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 8px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {isOpen ? '● ' : ''}{t.statusLabel}
                  </span>
                </div>

                {/* Primary Metric: Current Cash in Drawer */}
                <div style={{
                  background: '#f8fafc',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  border: '1px solid var(--line)',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                      Efectivo en Gaveta
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 900, color: '#15803d', fontFamily: 'Space Grotesk' }}>
                      {money(t.currentDrawerCash)}
                    </span>
                  </div>
                  
                  {/* Subtle breakdown */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed var(--line)' }}>
                    <span>Fondo: {money(t.openingFloat)}</span>
                    <span>Cobrado: {money(t.cashCollected)}</span>
                    {t.pettyCashExpenses > 0 && <span style={{ color: '#dc2626' }}>Gastos: -{money(t.pettyCashExpenses)}</span>}
                  </div>
                </div>

                {/* Secondary Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px', fontSize: '12px' }}>
                  <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 800 }}>TRANSFERENCIAS</div>
                    <div style={{ fontWeight: 800, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
                      {money(t.transfersCollected)}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ color: 'var(--muted)', fontSize: '10px', fontWeight: 800 }}>TRABAJOS HOY</div>
                    <div style={{ fontWeight: 800, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
                      {t.ordersCount} ({money(t.totalSales)})
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => onSelectAdvisorForAudit(t)}
                style={{
                  width: '100%',
                  background: isOpen ? 'var(--orange)' : '#f1f5f9',
                  color: isOpen ? '#fff' : 'var(--ink)',
                  border: isOpen ? 'none' : '1px solid var(--line)',
                  padding: '9px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'background 0.15s ease'
                }}
              >
                <ShieldCheck size={15} />
                {isOpen ? 'Auditar Caja (Arqueo Ciego)' : 'Ver Detalle de Caja'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
