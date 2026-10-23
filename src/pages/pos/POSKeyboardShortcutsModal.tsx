import React from 'react';
import { X, Keyboard, Sparkles, Command } from 'lucide-react';

export function POSKeyboardShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'F1', desc: 'Enfocar buscador de cliente / RUC en mostrador' },
    { key: 'F2', desc: 'Cobro rápido: Efectivo Exacto' },
    { key: 'F3', desc: 'Cobro rápido: Transferencia / Tarjeta Exacta' },
    { key: 'F4', desc: '+ Ítem Libre / Servicio Especial no catalogado' },
    { key: 'F6', desc: 'Pausar venta actual (Guardar en espera / Parked Sale)' },
    { key: 'F9 / Ctrl + ↵', desc: 'Registrar orden, liquidar y abrir comprobante' },
    { key: 'Lector Óptico', desc: 'Escaneo global de código de barras (SKU, Orden o RUC)' },
    { key: 'Alt + P', desc: 'Imprimir comprobante / ticket térmico' },
    { key: 'Esc', desc: 'Cerrar cualquier ventana emergente o modal activo' },
    { key: '? / F12', desc: 'Abrir esta guía de atajos de teclado' }
  ];

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
        maxWidth: '520px',
        width: '100%',
        padding: '24px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        border: '1.5px solid var(--pos-border)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#fff7ed', padding: '8px', borderRadius: '10px', color: '#ea580c' }}>
              <Keyboard size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#0f172a' }}>
                Atajos Rápidos de Teclado (POS)
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Agiliza la atención en mostrador sin usar el mouse
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          {shortcuts.map((sc, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                {sc.desc}
              </span>
              <kbd style={{
                background: '#0f172a',
                color: '#f8fafc',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                fontFamily: 'monospace',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                whiteSpace: 'nowrap'
              }}>
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            className="pos-btn-primary"
            style={{
              padding: '10px 24px',
              width: 'auto',
              margin: '0 auto',
              background: '#ea580c',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            onClick={onClose}
          >
            Entendido (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
