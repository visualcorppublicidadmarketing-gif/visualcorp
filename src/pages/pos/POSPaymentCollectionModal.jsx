import React, { useState } from 'react';
import {
  DollarSign,
  CreditCard,
  Building2,
  FileText,
  Save,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { addOrderPayment } from '../../lib/posStore';
import { useToast } from '../../components/studio/Toast';

export function POSPaymentCollectionModal({ order, store, advisorId, onClose, onSuccess }) {
  const toast = useToast();
  const balanceDue = Number(order?.balanceDue || 0);
  const [payAmount, setPayAmount] = useState(balanceDue);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [bankName, setBankName] = useState('Banco Pichincha');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amountNum = Number(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.warning('Ingresa un monto válido mayor a 0');
      return;
    }
    if (amountNum > balanceDue) {
      if (!confirm(`El monto ingresado ($${amountNum}) es mayor al saldo pendiente ($${balanceDue}). ¿Deseas continuar?`)) {
        return;
      }
    }

    setIsSubmitting(true);
    const res = addOrderPayment(store, {
      orderId: order.id,
      advisorId,
      amount: amountNum,
      paymentMethod,
      bankName: paymentMethod === 'transfer' || paymentMethod === 'check' ? bankName : '',
      referenceNumber,
      notes: notes.trim() || 'Abono / Cobro de saldo en cartera'
    });

    setIsSubmitting(false);
    if (res.ok) {
      toast.success(`Abono de $${amountNum.toFixed(2)} registrado correctamente`);
      onSuccess(res.updatedStore, res.order);
      onClose();
    } else {
      toast.error(res.error || 'Error al registrar el cobro');
    }
  };

  return (
    <div className="pos-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
      <div className="pos-modal-card" style={{ maxWidth: '480px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DollarSign size={22} style={{ color: '#16a34a' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>
              Cobrar Saldo • Orden #{order.orderNumber}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Order Balance Overview */}
        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--line)', marginBottom: '16px', display: 'grid', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted)' }}>Cliente:</span>
            <strong style={{ color: 'var(--ink)' }}>{order.customerName}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted)' }}>Trabajo:</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{order.jobName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted)' }}>Total Orden:</span>
            <strong style={{ color: 'var(--ink)' }}>${Number(order.totalAmount).toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--muted)' }}>Abonado Anteriormente:</span>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>${Number(order.depositAmount).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', borderTop: '1px solid var(--line)', paddingTop: '6px', marginTop: '2px' }}>
            <strong style={{ color: '#dc2626' }}>Saldo Pendiente:</strong>
            <strong style={{ color: '#dc2626', fontFamily: 'Space Grotesk', fontSize: '17px' }}>${balanceDue.toFixed(2)}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, margin: 0 }}>Monto a Cobrar / Abonar ($) *</label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setPayAmount(balanceDue)}
                  style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Saldo Total (${balanceDue.toFixed(2)})
                </button>
                {balanceDue > 5 && (
                  <button
                    type="button"
                    onClick={() => setPayAmount(Number((balanceDue / 2).toFixed(2)))}
                    style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                  >
                    50% (${(balanceDue / 2).toFixed(2)})
                  </button>
                )}
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '10px', fontWeight: 900, color: 'var(--muted)' }}>$</span>
              <input
                type="number"
                step="0.01"
                className="pos-input"
                style={{ paddingLeft: '28px', fontSize: '16px', fontWeight: 900 }}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 800 }}>Método de Pago</label>
            <select
              className="pos-input"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash">💵 Efectivo</option>
              <option value="transfer">🏦 Transferencia Bancaria</option>
              <option value="card">💳 Tarjeta de Débito / Crédito</option>
              <option value="check">📜 Cheque</option>
            </select>
          </div>

          {(paymentMethod === 'transfer' || paymentMethod === 'check') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Banco Destino</label>
                <select
                  className="pos-input"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                >
                  <option value="Banco Pichincha">Banco Pichincha</option>
                  <option value="Banco Guayaquil">Banco Guayaquil</option>
                  <option value="Produbanco">Produbanco</option>
                  <option value="Banco Internacional">Banco Internacional</option>
                  <option value="Banco del Pacífico">Banco del Pacífico</option>
                  <option value="Cooperativa JEP">Cooperativa JEP</option>
                  <option value="DeUna">DeUna / Pichincha QR</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800 }}>Nº Comprobante / Lote</label>
                <input
                  type="text"
                  className="pos-input"
                  placeholder="# Transferencia"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', fontWeight: 800 }}>Notas de Cobro</label>
            <input
              type="text"
              className="pos-input"
              placeholder="Ej. Cancelación total para retiro de lona"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" className="pos-nav-tab" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="pos-submit-order-btn" style={{ background: '#16a34a' }} disabled={isSubmitting}>
              <CheckCircle2 size={16} /> Confirmar Cobro de ${Number(payAmount || 0).toFixed(2)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
