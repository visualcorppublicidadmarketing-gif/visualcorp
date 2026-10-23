import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  X,
  Calculator,
  ShieldCheck,
  FileText,
  Sparkles
} from 'lucide-react';
import { recordBlindCashAudit, toISODate } from '../../../lib/posStore';

export function POSBlindCashCountModal({ store, advisor, shift, onClose, onAuditSaved }) {
  const [denominations, setDenominations] = useState({
    '100': '',
    '50': '',
    '20': '',
    '10': '',
    '5': '',
    '1': '',
    '1.00': '',
    '0.50': '',
    '0.25': '',
    '0.10': '',
    '0.05': '',
    '0.01': ''
  });

  const [notes, setNotes] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  const money = (val) => `$${(Number(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const totalDeclared = useMemo(() => {
    return Object.entries(denominations).reduce((sum, [denom, qty]) => {
      const count = Number(qty) || 0;
      return sum + (Number(denom) * count);
    }, 0);
  }, [denominations]);

  const expectedCash = useMemo(() => {
    const today = toISODate();
    const payments = (store.payments || []).filter(
      (p) => p.advisorId === advisor.id && p.paymentDate === today && p.paymentMethod === 'cash'
    );
    const expenses = (store.expenses || []).filter(
      (e) => e.advisorId === advisor.id && e.expenseDate === today
    );
    const openingFloat = shift ? Number(shift.openingCashAmount || 0) : 0;
    const cashCollected = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const cashExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return Math.max(0, openingFloat + cashCollected - cashExpenses);
  }, [store.payments, store.expenses, advisor.id, shift]);

  const handleDenomChange = (denom, val) => {
    const clean = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);
    setDenominations((prev) => ({ ...prev, [denom]: clean }));
  };

  const handleQuickAdd = (denom, amount = 1) => {
    setDenominations((prev) => {
      const current = Number(prev[denom]) || 0;
      return { ...prev, [denom]: current + amount };
    });
  };

  const handleClearAll = () => {
    const reset = {};
    Object.keys(denominations).forEach((k) => { reset[k] = ''; });
    setDenominations(reset);
  };

  const handleSubmitAudit = (e) => {
    e.preventDefault();
    if (totalDeclared <= 0 && !window.confirm('El monto contado es $0.00. ¿Deseas continuar con el arqueo?')) {
      return;
    }

    setIsAuditing(true);
    const res = recordBlindCashAudit(store, {
      advisorId: advisor.id,
      shiftId: shift?.id,
      denominations,
      declaredCash: totalDeclared,
      notes
    });

    setIsAuditing(false);
    if (res.ok) {
      setAuditResult(res.auditRecord);
      if (onAuditSaved) {
        onAuditSaved(res.updatedStore, res.auditRecord);
      }
    }
  };

  const bills = [
    { denom: '100', label: '$100 USD (Cien)', color: '#15803d' },
    { denom: '50', label: '$50 USD (Cincuenta)', color: '#0369a1' },
    { denom: '20', label: '$20 USD (Veinte)', color: '#4338ca' },
    { denom: '10', label: '$10 USD (Diez)', color: '#b45309' },
    { denom: '5', label: '$5 USD (Cinco)', color: '#c2410c' },
    { denom: '1', label: '$1 USD (Un Dólar)', color: '#475569' }
  ];

  const coins = [
    { denom: '1.00', label: '$1.00 Moneda Dorada', color: '#eab308' },
    { denom: '0.50', label: '$0.50 Cincuenta Centavos', color: '#94a3b8' },
    { denom: '0.25', label: '$0.25 Veinticinco Centavos', color: '#64748b' },
    { denom: '0.10', label: '$0.10 Diez Centavos', color: '#475569' },
    { denom: '0.05', label: '$0.05 Cinco Centavos', color: '#334155' },
    { denom: '0.01', label: '$0.01 Un Centavo', color: '#b45309' }
  ];

  return (
    <div className="pos-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(5px)' }}>
      <div className="pos-modal-card" style={{ maxWidth: '680px', width: '100%', maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px', padding: '24px', background: 'var(--paper)', border: '1px solid var(--line)', boxShadow: '0 25px 60px -15px rgba(0,0,0,0.35)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--line)', paddingBottom: '14px', marginBottom: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Calculator size={22} style={{ color: 'var(--orange)' }} />
              <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: 'var(--ink)' }}>
                Arqueo Ciego de Caja • {advisor.name}
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
              Conteo físico por denominaciones de billetes y monedas para auditoría de cuadre en vivo.
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
            <X size={22} />
          </button>
        </div>

        {auditResult ? (
          <div style={{ display: 'grid', gap: '16px', padding: '10px 0' }}>
            <div style={{
              background: auditResult.isBalanced ? '#f0fdf4' : auditResult.discrepancy > 0 ? '#eff6ff' : '#fef2f2',
              border: `1px solid ${auditResult.isBalanced ? '#86efac' : auditResult.discrepancy > 0 ? '#93c5fd' : '#fca5a5'}`,
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'center'
            }}>
              {auditResult.isBalanced ? (
                <CheckCircle2 size={44} style={{ color: '#16a34a', margin: '0 auto 8px' }} />
              ) : (
                <AlertTriangle size={44} style={{ color: auditResult.discrepancy > 0 ? '#2563eb' : '#dc2626', margin: '0 auto 8px' }} />
              )}
              <h3 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 900, color: auditResult.isBalanced ? '#166534' : auditResult.discrepancy > 0 ? '#1e40af' : '#991b1b' }}>
                {auditResult.isBalanced ? '¡Cuadre Perfecto de Caja!' : auditResult.discrepancy > 0 ? `Sobrante de Caja: +${money(auditResult.discrepancy)}` : `Faltante de Caja: ${money(auditResult.discrepancy)}`}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink)' }}>
                {auditResult.isBalanced
                  ? 'El dinero físico declarado coincide exactamente con las ventas y retiros del sistema.'
                  : auditResult.discrepancy > 0
                  ? 'Hay más efectivo en la gaveta del registrado. Se ha generado la nota de auditoría.'
                  : 'Falta dinero en la gaveta respecto al registro contable. La discrepancia ha sido auditada.'}
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>EFECTIVO ESPERADO</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--ink)', fontFamily: 'Space Grotesk' }}>
                  {money(auditResult.expectedCash)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>EFECTIVO DECLARADO</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--orange-dark)', fontFamily: 'Space Grotesk' }}>
                  {money(auditResult.totalDeclared)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 800 }}>DISCREPANCIA / VARIACIÓN</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: auditResult.isBalanced ? '#16a34a' : auditResult.discrepancy > 0 ? '#2563eb' : '#dc2626', fontFamily: 'Space Grotesk' }}>
                  {auditResult.discrepancy > 0 ? `+${money(auditResult.discrepancy)}` : money(auditResult.discrepancy)}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="pos-btn-primary"
              style={{ padding: '12px', fontSize: '15px', fontWeight: 800, marginTop: '8px' }}
              onClick={onClose}
            >
              Listo • Volver al Dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitAudit} style={{ display: 'grid', gap: '18px' }}>
            
            <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#fff', padding: '16px 20px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Efectivo Físico Contado:
                </span>
                <div style={{ fontSize: '28px', fontWeight: 900, fontFamily: 'Space Grotesk', color: '#38bdf8' }}>
                  {money(totalDeclared)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearAll}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Limpiar Conteo
              </button>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <DollarSign size={16} style={{ color: '#16a34a' }} />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>
                  Billetes (USD)
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {bills.map((b) => {
                  const qty = Number(denominations[b.denom]) || 0;
                  const subtotal = Number(b.denom) * qty;
                  return (
                    <div key={b.denom} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 900, fontSize: '13px', color: b.color }}>{b.label}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)' }}>= {money(subtotal)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Cant."
                          className="pos-input"
                          style={{ padding: '6px 8px', fontSize: '14px', fontWeight: 700, textAlign: 'center' }}
                          value={denominations[b.denom]}
                          onChange={(e) => handleDenomChange(b.denom, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(b.denom, 1)}
                          style={{ background: '#e2e8f0', border: 'none', borderRadius: '6px', padding: '0 8px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(b.denom, 5)}
                          style={{ background: '#e2e8f0', border: 'none', borderRadius: '6px', padding: '0 8px', fontWeight: 800, cursor: 'pointer', fontSize: '11px' }}
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Sparkles size={16} style={{ color: '#eab308' }} />
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--ink)' }}>
                  Monedas / Sueltos (USD)
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                {coins.map((c) => {
                  const qty = Number(denominations[c.denom]) || 0;
                  const subtotal = Number(c.denom) * qty;
                  return (
                    <div key={c.denom} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 800, fontSize: '12px', color: c.color }}>{c.label}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)' }}>= {money(subtotal)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Cant."
                          className="pos-input"
                          style={{ padding: '6px 8px', fontSize: '14px', fontWeight: 700, textAlign: 'center' }}
                          value={denominations[c.denom]}
                          onChange={(e) => handleDenomChange(c.denom, e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(c.denom, 1)}
                          style={{ background: '#e2e8f0', border: 'none', borderRadius: '6px', padding: '0 8px', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(c.denom, 10)}
                          style={{ background: '#e2e8f0', border: 'none', borderRadius: '6px', padding: '0 8px', fontWeight: 800, cursor: 'pointer', fontSize: '11px' }}
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="pos-label">Observaciones o Notas del Arqueo</label>
              <textarea
                className="pos-textarea"
                rows={2}
                placeholder="Ej. Cierre de turno vespertino sin novedades / Retiro de $100 a bóveda..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
              <button
                type="button"
                className="pos-btn-ghost"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="pos-btn-primary"
                disabled={isAuditing}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: 800 }}
              >
                <ShieldCheck size={18} />
                Confirmar y Registrar Arqueo ({money(totalDeclared)})
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
}
