import React from 'react';
import {
  AlertCircle,
  Phone,
  MessageCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import { calculateDebtAgingMatrix } from '../../../lib/posStore';

export function POSDebtAgingWidget({ orders = [] }) {
  const aging = calculateDebtAgingMatrix(orders);
  const money = (val) => `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const cleanPhone = (phone = '') => {
    let p = (phone || '').replace(/[^0-9]/g, '');
    if (!p) return '';
    if (p.startsWith('0')) p = '593' + p.substring(1);
    if (!p.startsWith('593')) p = '593' + p;
    return p;
  };

  const handleWhatsAppDebtReminder = (order) => {
    const phone = cleanPhone(order.customerPhone || '');
    const msg = encodeURIComponent(
      `Hola *${order.customerName}*, te saludamos de *Gigaprint — Tus ideas en grande* 🚀.\n\n` +
      `Te recordamos amablemente que mantienes un saldo pendiente de *$${Number(order.balanceDue).toFixed(2)}* correspondiente al trabajo *"${order.jobName}"* (Orden #${order.orderNumber}).\n\n` +
      `Puedes realizar tu abono o liquidación mediante transferencia a Banco Pichincha o en nuestro mostrador.\n\n` +
      `¡Muchas gracias por tu preferencia!`
    );

    if (!phone || phone === '593') {
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    } else {
      window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    }
  };

  if (aging.totalDebt <= 0) {
    return (
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '16px',
        padding: '20px',
        textAlign: 'center',
        color: '#166534'
      }}>
        <h4 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 900 }}>
          🎉 ¡Cartera 100% al Día!
        </h4>
        <p style={{ margin: 0, fontSize: '13px' }}>
          No existen saldos pendientes ni órdenes con cuentas por cobrar en el período.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* 4-Bucket Aging Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {/* Bucket 1: 0-15 days */}
        <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '14px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a' }}>0 a 15 DÍAS (CORRIENTE)</span>
            <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>Bajo Riesgo</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
            {money(aging.bucket0to15)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            Trabajos en taller con 50% anticipo
          </div>
        </div>

        {/* Bucket 2: 16-30 days */}
        <div style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '14px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#ca8a04' }}>16 a 30 DÍAS (CRÉDITO)</span>
            <span style={{ fontSize: '10px', background: '#fef9c3', color: '#854d0e', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>Atención</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
            {money(aging.bucket16to30)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            Crédito comercial corporativo
          </div>
        </div>

        {/* Bucket 3: 31-60 days */}
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '14px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>31 a 60 DÍAS (VENCIDO)</span>
            <span style={{ fontSize: '10px', background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>Gestión Cobro</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#b91c1c', fontFamily: 'Space Grotesk' }}>
            {money(aging.bucket31to60)}
          </div>
          <div style={{ fontSize: '11px', color: '#991b1b', marginTop: '2px' }}>
            Recordatorio por WhatsApp sugerido
          </div>
        </div>

        {/* Bucket 4: +60 days */}
        <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '14px', padding: '14px', color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5' }}>+60 DÍAS (MORA CRÍTICA)</span>
            <span style={{ fontSize: '10px', background: '#ef4444', color: '#fff', padding: '2px 6px', borderRadius: '6px', fontWeight: 800 }}>Crítico</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', fontFamily: 'Space Grotesk' }}>
            {money(aging.bucketOver60)}
          </div>
          <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>
            Bloqueo de crédito preventivo
          </div>
        </div>
      </div>

      {/* Debtors List Table */}
      <div style={{ background: 'var(--paper)', borderRadius: '14px', border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--ink)' }}>
            Listado de Cuentas por Cobrar ({aging.count} clientes)
          </h4>
          <span style={{ fontSize: '13px', fontWeight: 900, color: '#dc2626' }}>
            Total por Cobrar: {money(aging.totalDebt)}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="pos-orders-table" style={{ width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Cliente</th>
                <th>Trabajo</th>
                <th>Antigüedad</th>
                <th>Total</th>
                <th>Saldo Pendiente</th>
                <th style={{ textAlign: 'right' }}>Acción de Cobranza</th>
              </tr>
            </thead>
            <tbody>
              {aging.debtorsList.slice(0, 10).map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong style={{ color: 'var(--orange-dark)' }}>#{d.orderNumber}</strong>
                  </td>
                  <td>
                    <div style={{ fontWeight: 800 }}>{d.customerName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{d.customerPhone || 'Sin teléfono'}</div>
                  </td>
                  <td>{d.jobName}</td>
                  <td>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: d.riskLevel === 'critical' ? '#fee2e2' : d.riskLevel === 'high' ? '#ffedd5' : '#f1f5f9',
                      color: d.riskLevel === 'critical' ? '#991b1b' : d.riskLevel === 'high' ? '#9a3412' : '#334155'
                    }}>
                      {d.daysOverdue} días ({d.debtBucket}d)
                    </span>
                  </td>
                  <td>{money(d.totalAmount)}</td>
                  <td>
                    <strong style={{ color: '#dc2626', fontFamily: 'Space Grotesk' }}>{money(d.balanceDue)}</strong>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleWhatsAppDebtReminder(d)}
                      style={{
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <MessageCircle size={13} /> Cobrar WhatsApp
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
