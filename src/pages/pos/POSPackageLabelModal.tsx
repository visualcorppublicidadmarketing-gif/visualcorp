import React, { useState } from 'react';
import { X, Printer, Tag, Package, QrCode, Sparkles } from 'lucide-react';

export function POSPackageLabelModal({ order, items = [], isOpen, onClose }) {
  if (!isOpen || !order) return null;

  const [labelSize, setLabelSize] = useState('70x50'); // '70x50' | '50x30'
  const [totalPackages, setTotalPackages] = useState(1);
  const [packageIndex, setPackageIndex] = useState(1);

  const trackingToken = order.trackingToken || order.orderNumber;
  const trackingUrl = `https://gigaprint-ec.github.io/gigaprint-webpage/seguimiento/${trackingToken}`;
  const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(trackingUrl)}&size=80&margin=0`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="pos-modal-overlay" style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="pos-modal-card" style={{
        background: '#fff',
        borderRadius: '20px',
        maxWidth: '460px',
        width: '100%',
        padding: '24px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        border: '1.5px solid var(--pos-border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag size={20} style={{ color: '#ea580c' }} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
              Etiqueta Térmica de Empaque
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <div>
            <label className="pos-label" style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Formato de Etiqueta
            </label>
            <select
              className="pos-select"
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', fontSize: '13px', fontWeight: 700 }}
            >
              <option value="70x50">70 × 50 mm (Estándar Rollo / Caja)</option>
              <option value="50x30">50 × 30 mm (Mini Adhesivo)</option>
            </select>
          </div>
          <div>
            <label className="pos-label" style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '4px' }}>
              Bulto / Paquete
            </label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                className="pos-input"
                value={packageIndex}
                onChange={(e) => setPackageIndex(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: '55px', textAlign: 'center', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 800 }}
              />
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>de</span>
              <input
                type="number"
                min="1"
                className="pos-input"
                value={totalPackages}
                onChange={(e) => setTotalPackages(Math.max(1, Number(e.target.value) || 1))}
                style={{ width: '55px', textAlign: 'center', padding: '8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 800 }}
              />
            </div>
          </div>
        </div>

        {/* Printable Thermal Label Preview Box */}
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'center' }}>
          <div
            className={`printable-thermal-label label-${labelSize}`}
            style={{
              background: '#fff',
              color: '#000',
              border: '2px solid #000',
              borderRadius: '6px',
              padding: labelSize === '70x50' ? '8px 10px' : '5px 8px',
              fontFamily: 'monospace',
              width: labelSize === '70x50' ? '280px' : '210px',
              height: labelSize === '70x50' ? '190px' : '125px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1.5px solid #000', paddingBottom: '3px' }}>
              <div>
                <strong style={{ fontSize: '13px', display: 'block', letterSpacing: '-0.02em', fontWeight: 900 }}>
                  GIGAPRINT
                </strong>
                <span style={{ fontSize: '9px', fontWeight: 700 }}>TALLER & PRODUCCIÓN</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ fontSize: '15px', color: '#000' }}>#{order.orderNumber}</strong>
                <div style={{ fontSize: '9px', fontWeight: 900 }}>BULTO {packageIndex}/{totalPackages}</div>
              </div>
            </div>

            {/* Content Body */}
            <div style={{ margin: '3px 0', fontSize: '10px', lineHeight: '1.25' }}>
              <div style={{ fontWeight: 900, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {order.customerName}
              </div>
              <div style={{ color: '#222', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>
                {order.jobName}
              </div>
              {items[0] && (
                <div style={{ fontSize: '9.5px', fontWeight: 800, marginTop: '2px', color: '#111' }}>
                  {items[0].productName || items[0].product_name} {items[0].widthCm ? `(${items[0].widthCm}x${items[0].heightCm}cm)` : ''}
                  {items[0].finishing && items[0].finishing !== 'none' ? ` · ${items[0].finishing}` : ''}
                </div>
              )}
            </div>

            {/* Footer with barcode/QR and balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #000', paddingTop: '3px' }}>
              <div>
                <span style={{ fontSize: '8.5px', display: 'block', fontWeight: 700 }}>ENTREGA: {order.deliveryDate || 'Hoy'}</span>
                <span style={{ fontSize: '9.5px', fontWeight: 900, color: Number(order.balanceDue) > 0 ? '#b91c1c' : '#047857' }}>
                  {Number(order.balanceDue) > 0 ? `SALDO: $${Number(order.balanceDue).toFixed(2)}` : 'PAGADO TOTAL ✓'}
                </span>
              </div>
              <img
                src={qrUrl}
                alt="QR"
                style={{
                  width: labelSize === '70x50' ? '44px' : '32px',
                  height: labelSize === '70x50' ? '44px' : '32px',
                  display: 'block'
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            className="pos-btn-ghost"
            style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 800, cursor: 'pointer' }}
            onClick={onClose}
          >
            Cerrar
          </button>
          <button
            type="button"
            className="pos-btn-primary"
            style={{ flex: 1.5, padding: '10px', borderRadius: '10px', border: 'none', background: '#ea580c', color: '#fff', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={handlePrint}
          >
            <Printer size={16} /> Imprimir Etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}
