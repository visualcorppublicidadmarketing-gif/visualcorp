import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Printer,
  Package,
  Layers,
  Clock,
  MapPin,
  Phone,
  Tag
} from 'lucide-react';

export function POSCustomerDisplayPage() {
  const [displayData, setDisplayData] = useState(() => {
    try {
      const raw = localStorage.getItem('gigaprint_pos_customer_display');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let channel;
    try {
      channel = new BroadcastChannel('gigaprint_pos_display_channel');
      channel.onmessage = (event) => {
        if (event.data) {
          setDisplayData(event.data);
        }
      };
    } catch (e) {
      // BroadcastChannel not available in all contexts
    }

    const handleStorage = (e) => {
      if (e.key === 'gigaprint_pos_customer_display' && e.newValue) {
        try {
          setDisplayData(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const total = Number(displayData?.totalAmount || 0);
  const items = displayData?.cartItems || [];
  const advisorName = displayData?.advisorName || 'Ventas';
  const customerName = displayData?.customerName || '';
  const isCompleted = displayData?.status === 'completed';
  const lastOrderNumber = displayData?.orderNumber || '';

  // DeUna QR with formatted payment intent
  const deUnaQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(`DEUNA_GIGAPRINT_PAGO_USD_${total > 0 ? total.toFixed(2) : '0.00'}`)}&size=200&margin=1`;
  const trackingQrUrl = lastOrderNumber
    ? `https://quickchart.io/qr?text=${encodeURIComponent(`https://gigaprint-ec.github.io/gigaprint-webpage/seguimiento/${lastOrderNumber}`)}&size=160&margin=1`
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#090d16',
      color: '#fff',
      fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
      padding: '28px 36px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxSizing: 'border-box'
    }}>
      {/* Header Bar */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #1e293b',
        paddingBottom: '18px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #ea580c, #c2410c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            fontWeight: 900,
            boxShadow: '0 4px 15px rgba(234, 88, 12, 0.4)'
          }}>
            G
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, letterSpacing: '-0.02em' }}>
              GIGAPRINT
            </h1>
            <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600 }}>
              Tus ideas en grande • Pantalla de Atención al Cliente
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
              Asesora en Atención
            </span>
            <strong style={{ fontSize: '16px', color: '#ea580c' }}>{advisorName}</strong>
          </div>
        </div>
      </header>

      {/* Main Screen Content */}
      {isCompleted ? (
        /* Completed Order Screen */
        <main style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          flex: 1,
          padding: '40px 20px',
          animation: 'pos-zoom-in 0.3s ease'
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: '#10b98122',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            border: '2px solid #10b981'
          }}>
            <CheckCircle2 size={40} />
          </div>

          <h2 style={{ fontSize: '32px', fontWeight: 900, margin: '0 0 8px' }}>
            ¡Gracias por tu compra{customerName ? `, ${customerName}` : ''}!
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '16px', maxWidth: '500px', margin: '0 0 24px' }}>
            Tu orden <strong style={{ color: '#ea580c' }}>#{lastOrderNumber}</strong> ha sido ingresada a taller.
          </p>

          {trackingQrUrl && (
            <div style={{
              background: '#1e293b',
              padding: '20px 28px',
              borderRadius: '18px',
              border: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{ background: '#fff', padding: '10px', borderRadius: '12px' }}>
                <img src={trackingQrUrl} alt="Seguimiento QR" style={{ width: '130px', height: '130px', display: 'block' }} />
              </div>
              <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700 }}>
                Escanea para seguir la producción de tu trabajo en vivo
              </span>
            </div>
          )}
        </main>
      ) : (
        /* Live Order In-Progress Screen */
        <main style={{
          display: 'grid',
          gridTemplateColumns: '1.25fr 0.75fr',
          gap: '28px',
          margin: '24px 0',
          flex: 1
        }}>
          {/* Left Column: Cart items table */}
          <div style={{
            background: '#0f172a',
            borderRadius: '20px',
            border: '1px solid #1e293b',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingBag size={18} color="#ea580c" />
                Detalle de tu Pedido ({items.length})
              </h2>
              {customerName && (
                <span style={{ fontSize: '13px', background: '#1e293b', padding: '4px 12px', borderRadius: '8px', color: '#94a3b8' }}>
                  Cliente: <strong style={{ color: '#fff' }}>{customerName}</strong>
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: '10px', maxHeight: '420px' }}>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                  <Sparkles size={36} style={{ color: '#ea580c', margin: '0 auto 12px', opacity: 0.8 }} />
                  <p style={{ fontSize: '18px', fontWeight: 800, color: '#e2e8f0', margin: '0 0 6px' }}>
                    ¡Bienvenido a Gigaprint!
                  </p>
                  <small style={{ fontSize: '13px' }}>
                    Tu asesora está configurando tu presupuesto en tiempo real...
                  </small>
                </div>
              ) : (
                items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#1e293b',
                      borderRadius: '14px',
                      padding: '14px 18px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid #334155'
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '15px', color: '#f8fafc', display: 'block' }}>
                        {it.productName}
                      </strong>
                      <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px' }}>
                        {it.widthCm && it.heightCm ? (
                          <span>{it.widthCm} × {it.heightCm} cm ({it.areaM2} m²)</span>
                        ) : null}
                        <span>· Cant: <b>{it.quantity}</b></span>
                        {it.finishing && it.finishing !== 'none' ? (
                          <span style={{ color: '#ea580c', fontWeight: 700 }}>· {it.finishing}</span>
                        ) : null}
                      </span>
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', fontFamily: 'monospace' }}>
                      ${Number(it.totalPrice || 0).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Total Box & DeUna QR Payment */}
          <div style={{ display: 'grid', gap: '18px', alignContent: 'start' }}>
            {/* Total Box */}
            <div style={{
              background: '#0f172a',
              borderRadius: '20px',
              border: '1.5px solid #1e293b',
              padding: '24px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                TOTAL A CANCELAR
              </span>
              <div style={{
                fontSize: '48px',
                fontWeight: 900,
                color: '#ea580c',
                fontFamily: 'monospace',
                letterSpacing: '-0.02em',
                margin: '4px 0 8px'
              }}>
                ${total.toFixed(2)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '12px', color: '#10b981', fontWeight: 700 }}>
                <span>✓ Factura Electrónica SRI</span>
                <span>✓ IVA 15% Incluido</span>
              </div>
            </div>

            {/* DeUna / Pichincha QR Card */}
            <div style={{
              background: '#1e293b',
              borderRadius: '20px',
              border: '1.5px solid #334155',
              padding: '20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} color="#38bdf8" />
                <strong style={{ fontSize: '14px', color: '#f8fafc' }}>
                  Paga al instante con DeUna o Pichincha
                </strong>
              </div>

              <div style={{ background: '#fff', padding: '8px', borderRadius: '12px', boxShadow: '0 8px 25px rgba(0,0,0,0.3)' }}>
                <img src={deUnaQrUrl} alt="QR DeUna" style={{ width: '140px', height: '140px', display: 'block' }} />
              </div>

              <span style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '260px', lineHeight: '1.35' }}>
                Abre tu app <b>DeUna</b> o <b>Banca Móvil Pichincha</b>, escanea este QR y confirma tu pago en 3 segundos.
              </span>
            </div>
          </div>
        </main>
      )}

      {/* Footer Info */}
      <footer style={{
        textAlign: 'center',
        borderTop: '1px solid #1e293b',
        paddingTop: '14px',
        fontSize: '12px',
        color: '#64748b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>Gigaprint Ecuador • RUC: 0992345678001</span>
        <span>📍 Av. García Moreno y 9 de Octubre, Milagro, Guayas</span>
        <span>📞 +593 98 765 4321</span>
      </footer>
    </div>
  );
}
