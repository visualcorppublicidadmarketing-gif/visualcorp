import React, { useState } from 'react';
import {
  X,
  Printer,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  QrCode,
  ExternalLink,
  Tag,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { POSPackageLabelModal } from './POSPackageLabelModal';

export function POSReceiptModal({ order, items = [], advisor, isOpen, onClose }) {
  const [receiptWidth, setReceiptWidth] = useState('80mm'); // '80mm' | '58mm'
  const [showLabelModal, setShowLabelModal] = useState(false);

  if (!isOpen || !order) return null;

  const money = (val) => `$${(Number(val) || 0).toFixed(2)}`;
  const trackingToken = order.trackingToken || order.orderNumber;
  const trackingUrl = `https://gigaprint-ec.github.io/gigaprint-webpage/seguimiento/${trackingToken}`;
  const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(trackingUrl)}&size=140&margin=1`;

  const handlePrint = () => {
    window.print();
  };

  const cleanPhone = (phone = '') => {
    let p = (phone || '').replace(/[^0-9]/g, '');
    if (!p) return '';
    if (p.startsWith('0')) p = '593' + p.substring(1);
    if (!p.startsWith('593')) p = '593' + p;
    return p;
  };

  const getWhatsAppMessage = () => {
    const lines = [
      `*GIGAPRINT — COMPROBANTE DE VENTA # ${order.orderNumber}*`,
      `================================`,
      `*Cliente:* ${order.customerName}`,
      order.customerIdentification ? `*RUC/CI:* ${order.customerIdentification}` : null,
      `*Trabajo:* ${order.jobName}`,
      `*Fecha:* ${order.orderDate} | *Entrega:* ${order.deliveryDate || 'Por coordinar'}`,
      `*Asesora:* ${advisor?.name || 'Ventas'}`,
      `================================`,
      `*DETALLE:*`
    ];

    items.forEach((it, idx) => {
      const dim = it.width_cm && it.height_cm ? ` (${it.width_cm}x${it.height_cm} cm)` : it.widthCm && it.heightCm ? ` (${it.widthCm}x${it.heightCm} cm)` : '';
      const finish = it.finishing && it.finishing !== 'none' ? ` [${it.finishing}]` : '';
      const notes = it.notes ? ` {Nota: ${it.notes}}` : '';
      lines.push(`${idx + 1}. ${it.product_name || it.productName}${dim}${finish}${notes} x${it.quantity || 1} -> ${money(it.total_price || it.totalPrice)}`);
    });

    lines.push(`================================`);
    lines.push(`*Total Venta:* ${money(order.totalAmount)}`);
    lines.push(`*Abonado:* ${money(order.depositAmount)}`);
    lines.push(`*Saldo por Pagar:* ${money(order.balanceDue)}`);
    lines.push(`================================`);
    lines.push(`📱 *Sigue el estado de tu trabajo en vivo aquí:*`);
    lines.push(`${trackingUrl}`);
    lines.push(`================================`);
    lines.push(`¡Gracias por confiar en Gigaprint — Tus ideas en grande! 🚀`);

    return encodeURIComponent(lines.filter(Boolean).join('\n'));
  };

  const handleWhatsApp = () => {
    const phone = cleanPhone(order.customerPhone || '');
    const msg = getWhatsAppMessage();
    if (!phone || phone === '593') {
      window.open(`https://wa.me/?text=${msg}`, '_blank');
    } else {
      window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    }
  };

  return (
    <>
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
        <div className="pos-modal-content" style={{
          background: 'var(--paper)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid var(--line)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Modal Top Actions */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--line)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--orange-dark)', textTransform: 'uppercase' }}>
                Ticket #{order.orderNumber}
              </span>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg)', padding: '2px 4px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setReceiptWidth('80mm')}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    borderRadius: '4px',
                    border: 0,
                    background: receiptWidth === '80mm' ? 'var(--orange)' : 'transparent',
                    color: receiptWidth === '80mm' ? '#fff' : 'var(--muted)',
                    cursor: 'pointer'
                  }}
                >
                  80mm
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptWidth('58mm')}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    borderRadius: '4px',
                    border: 0,
                    background: receiptWidth === '58mm' ? 'var(--orange)' : 'transparent',
                    color: receiptWidth === '58mm' ? '#fff' : 'var(--muted)',
                    cursor: 'pointer'
                  }}
                >
                  58mm
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Printable Ticket Area */}
          <div
            className={`pos-printable-receipt printable-receipt ${receiptWidth === '58mm' ? 'receipt-58mm' : ''}`}
            style={{
              padding: receiptWidth === '58mm' ? '14px 10px' : '22px 20px',
              background: '#fff',
              color: '#18181b',
              fontFamily: 'monospace',
              maxWidth: receiptWidth === '58mm' ? '240px' : '360px',
              margin: '0 auto',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: receiptWidth === '58mm' ? '18px' : '22px', fontWeight: 900, color: '#ea580c' }}>GIGAPRINT</h2>
              <p style={{ margin: '2px 0', fontSize: '10px', fontWeight: 700 }}>Tus ideas en grande</p>
              <p style={{ margin: '2px 0', fontSize: '10px' }}>Milagro, Guayas - Ecuador · Tel: +593 98 765 4321</p>
              <p style={{ margin: '4px 0 0', fontSize: '12px', fontWeight: 800 }}>ORDEN # {order.orderNumber}</p>
            </div>

            <div style={{ borderTop: '1px dashed #71717a', borderBottom: '1px dashed #71717a', padding: '8px 0', fontSize: '10.5px', display: 'grid', gap: '3px' }}>
              <div><b>Cliente:</b> {order.customerName}</div>
              {order.customerIdentification && <div><b>CI/RUC:</b> {order.customerIdentification}</div>}
              {order.customerPhone && <div><b>Tel:</b> {order.customerPhone}</div>}
              <div><b>Trabajo:</b> {order.jobName}</div>
              <div><b>Fecha:</b> {order.orderDate} | <b>Entrega:</b> {order.deliveryDate || 'Por coordinar'}</div>
              <div><b>Asesora:</b> {advisor?.name || 'Ventas'}</div>
            </div>

            <div style={{ margin: '12px 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #d4d4d8', textAlign: 'left' }}>
                    <th style={{ paddingBottom: '4px' }}>Cant</th>
                    <th style={{ paddingBottom: '4px' }}>Descripción</th>
                    <th style={{ paddingBottom: '4px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px dotted #e4e4e7' }}>
                      <td style={{ padding: '5px 0', verticalAlign: 'top' }}>{it.quantity || 1}</td>
                      <td style={{ padding: '5px 0' }}>
                        <b>{it.product_name || it.productName}</b>
                        {it.width_cm && it.height_cm && <div style={{ fontSize: '9.5px', color: '#71717a' }}>{it.width_cm} × {it.height_cm} cm</div>}
                        {it.finishing && it.finishing !== 'none' && <div style={{ fontSize: '9.5px', color: '#ea580c' }}>Acabado: {it.finishing}</div>}
                        {it.notes && <div style={{ fontSize: '9px', color: '#0284c7', fontStyle: 'italic' }}>Nota: {it.notes}</div>}
                      </td>
                      <td style={{ padding: '5px 0', textAlign: 'right', verticalAlign: 'top', fontWeight: 700 }}>
                        {money(it.total_price || it.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: '1px dashed #71717a', paddingTop: '8px', fontSize: '11px', display: 'grid', gap: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal:</span>
                <b>{money(order.subtotal)}</b>
              </div>
              {Number(order.taxAmount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>IVA (15%):</span>
                  <b>{money(order.taxAmount)}</b>
                </div>
              )}
              {Number(order.shippingCost) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Envío:</span>
                  <b>{money(order.shippingCost)}</b>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900, borderTop: '1px solid #18181b', paddingTop: '5px' }}>
                <span>TOTAL:</span>
                <span style={{ color: '#ea580c' }}>{money(order.totalAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a', fontWeight: 700 }}>
                <span>Abonado:</span>
                <span>{money(order.depositAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: Number(order.balanceDue) > 0 ? '#dc2626' : '#16a34a', fontWeight: 800 }}>
                <span>SALDO:</span>
                <span>{money(order.balanceDue)}</span>
              </div>
            </div>

            {/* QR Code for Client Tracking */}
            <div style={{ textAlign: 'center', marginTop: '14px', borderTop: '1px dashed #71717a', paddingTop: '10px' }}>
              <img
                src={qrCodeUrl}
                alt="QR Seguimiento"
                style={{ width: receiptWidth === '58mm' ? '85px' : '105px', height: receiptWidth === '58mm' ? '85px' : '105px', margin: '0 auto', display: 'block' }}
              />
              <p style={{ margin: '3px 0 1px', fontSize: '9px', fontWeight: 800 }}>
                ESCANEA PARA SEGUIR TU PEDIDO
              </p>
              <span style={{ fontSize: '8px', color: '#71717a' }}>
                gigaprint-ec.github.io/gigaprint-webpage/seguimiento/{trackingToken}
              </span>
            </div>

            <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '9px', color: '#71717a' }}>
              <p style={{ margin: 0 }}>Valores sujetos a confirmación técnica.</p>
              <p style={{ margin: '2px 0 0', fontWeight: 700 }}>¡Gracias por su preferencia!</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--line)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            background: 'var(--bg)'
          }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                padding: '10px 8px',
                borderRadius: '10px',
                border: '1.5px solid var(--line)',
                background: 'var(--paper)',
                color: 'var(--ink)',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Printer size={15} /> Imprimir
            </button>

            <button
              type="button"
              onClick={() => setShowLabelModal(true)}
              style={{
                padding: '10px 8px',
                borderRadius: '10px',
                border: '1.5px solid var(--line)',
                background: '#fff7ed',
                color: '#ea580c',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Tag size={15} /> Etiqueta
            </button>

            <button
              type="button"
              onClick={handleWhatsApp}
              style={{
                padding: '10px 8px',
                borderRadius: '10px',
                border: 'none',
                background: '#16a34a',
                color: '#fff',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <MessageCircle size={15} /> WhatsApp
            </button>
          </div>
        </div>
      </div>

      {showLabelModal && (
        <POSPackageLabelModal
          order={order}
          items={items}
          isOpen={showLabelModal}
          onClose={() => setShowLabelModal(false)}
        />
      )}
    </>
  );
}
