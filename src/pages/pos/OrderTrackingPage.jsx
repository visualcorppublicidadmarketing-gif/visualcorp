import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Layout,
  Eye,
  Printer,
  Scissors,
  CheckSquare,
  Package,
  CheckCircle2,
  Clock,
  MapPin,
  Calendar,
  MessageCircle,
  AlertCircle,
  FileCheck,
  ShieldCheck,
  Building2,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Search,
  ArrowRight,
  Phone,
  QrCode
} from 'lucide-react';
import { calculateLiveScheduleStatus } from '../../lib/scheduleEngine';
import {
  loadPOSStore,
  fetchPublicPOSOrder,
  getOrderPublicTracking,
  submitPublicArtDecision
} from '../../lib/posStore';
import { useToast } from '../../components/studio/Toast';
import { useSite } from '../../store';
import { buildWhatsAppUrl, resolveQuoteWhatsAppRoute } from '../../lib/whatsapp';

export function OrderTrackingPage() {
  const toast = useToast();
  const { data } = useSite();
  const supportNumber = resolveQuoteWhatsAppRoute(data.settings, [])?.number;
  const { trackingToken: urlToken } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState(loadPOSStore());
  const [searchQuery, setSearchQuery] = useState(urlToken || '');
  const [activeSearchToken, setActiveSearchToken] = useState(urlToken || '');
  const [isApproving, setIsApproving] = useState(false);
  const [approvalName, setApprovalName] = useState('');
  const [approvedSuccess, setApprovedSuccess] = useState(false);

  useEffect(() => {
    if (!activeSearchToken) return;
    fetchPublicPOSOrder(activeSearchToken)
      .then(setStore)
      .catch(() => setStore({ ...loadPOSStore(), orders: [], orderItems: [], advisors: [] }));
  }, [activeSearchToken]);

  useEffect(() => {
    if (urlToken) {
      setActiveSearchToken(urlToken);
      setSearchQuery(urlToken);
    }
  }, [urlToken]);

  const orderData = useMemo(() => {
    if (!activeSearchToken) return null;
    return getOrderPublicTracking(store, activeSearchToken);
  }, [store, activeSearchToken]);

  const liveSchedule = useMemo(() => {
    return calculateLiveScheduleStatus();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const clean = searchQuery.trim();
    if (!clean) return;
    setActiveSearchToken(clean);
  };

  const stages = [
    { id: 'preprensa', label: '1. Diseño & Pre-prensa', icon: Layout, desc: 'Revisión técnica de archivos y preparación para máquinas' },
    { id: 'aprobacion_arte', label: '2. Aprobación de Boceto', icon: Eye, desc: 'Esperando visto bueno de arte o boceto digital' },
    { id: 'impresion', label: '3. En Cola de Impresión', icon: Printer, desc: 'Imprimiendo en plotter gran formato / cama plana' },
    { id: 'acabados', label: '4. Acabados & Confección', icon: Scissors, desc: 'Ojales, dobladillos, laminado o corte' },
    { id: 'control_calidad', label: '5. Control de Calidad', icon: CheckSquare, desc: 'Inspección de color, medidas y embalaje' },
    { id: 'listo', label: '6. Listo para Retirar', icon: Package, desc: 'Disponible en mostrador o preparado para despacho' },
    { id: 'entregado', label: '7. Entregado con Éxito', icon: CheckCircle2, desc: 'Trabajo retirado o entregado a satisfacción' }
  ];

  const currentStageIndex = orderData ? stages.findIndex((s) => s.id === orderData.productionStage) : 0;
  const isReady = orderData?.productionStage === 'listo' || orderData?.productionStage === 'entregado';

  const handleApproveArt = async (e) => {
    e.preventDefault();
    if (!approvalName.trim()) {
      toast.warning('Por favor ingresa tu nombre para registrar la aprobación.');
      return;
    }

    const order = (store.orders || []).find(
      (o) => String(o.trackingToken).toLowerCase() === String(activeSearchToken).toLowerCase() || String(o.orderNumber) === String(activeSearchToken)
    );

    if (!order) return;

    const res = await submitPublicArtDecision(order.trackingToken || activeSearchToken, {
      approverName: approvalName.trim(),
      decision: 'approved',
    });
    if (res.ok) {
      setStore(res.updatedStore);
      setApprovedSuccess(true);
      setIsApproving(false);
      toast.success('¡Aprobación de arte registrada con éxito!');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 16px', color: 'var(--ink)' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto', display: 'grid', gap: '24px' }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'var(--paper)', padding: '8px 24px', borderRadius: '999px', border: '1px solid var(--line)', boxShadow: '0 4px 15px rgba(0,0,0,0.03)' }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--orange)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px' }}>G</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--ink)' }}>Gigaprint • Seguimiento de Trabajos</span>
            </div>
          </Link>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted)', maxWidth: '480px' }}>
            Consulta el estado en vivo de tu orden de impresión, revisa bocetos y verifica la fecha de entrega en taller.
          </p>
        </div>

        {/* Global Search Bar */}
        <div style={{ background: 'var(--paper)', borderRadius: '20px', border: '1px solid var(--line)', padding: '16px 20px', boxShadow: '0 10px 25px rgba(0,0,0,0.02)' }}>
          <form onSubmit={handleSearchSubmit} className="tracking-search-form" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--muted)' }} />
              <input
                type="text"
                className="pos-input"
                placeholder="Ingresa tu Nº de Orden (ej. 61930) o Código de Seguimiento..."
                style={{ paddingLeft: '42px', fontSize: '14px', height: '46px', borderRadius: '12px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="pos-submit-order-btn"
              style={{ padding: '0 24px', height: '46px', fontSize: '14px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Search size={16} /> Consultar Estado
            </button>
          </form>
        </div>

        {/* No Order / Empty State */}
        {!orderData && (
          <div style={{ background: 'var(--paper)', borderRadius: '20px', border: '1px solid var(--line)', padding: '40px 24px', textAlign: 'center', display: 'grid', gap: '16px', justifyItems: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--orange-soft)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <QrCode size={32} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 6px' }}>
                {activeSearchToken ? 'No encontramos una orden con ese código' : 'Ingresa tu número de orden arriba'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, maxWidth: '420px', lineHeight: '1.5' }}>
                {activeSearchToken
                  ? `Verifica que el número "${activeSearchToken}" sea correcto. También puedes escanear el código QR impreso en tu comprobante.`
                  : 'Encuentra el número de 5 dígitos en tu comprobante físico o en el mensaje de WhatsApp que te envió tu asesora.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <a
                href={buildWhatsAppUrl(supportNumber, 'Hola Gigaprint, deseo consultar el estado de mi pedido.')}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none', padding: '10px 18px', borderRadius: '10px', background: '#25d366', color: '#fff', fontSize: '13px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <MessageCircle size={16} /> Consultar por WhatsApp
              </a>
              <Link
                to="/cotizador"
                style={{ textDecoration: 'none', padding: '10px 18px', borderRadius: '10px', background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink)', fontSize: '13px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                Cotizar Nuevo Trabajo ➔
              </Link>
            </div>
          </div>
        )}

        {/* ORDER FOUND: FULL 7-STAGE STEPPER & DETAILS */}
        {orderData && (
          <div style={{ display: 'grid', gap: '20px' }}>
            
            {/* Main Order Status Header Card */}
            <div style={{ background: 'var(--paper)', borderRadius: '20px', border: '1px solid var(--line)', padding: '24px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', display: 'grid', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ORDEN DE PRODUCCIÓN #{orderData.orderNumber}
                  </span>
                  <h1 style={{ margin: '4px 0 0', fontSize: '24px', fontWeight: 900, color: 'var(--ink)' }}>
                    {orderData.jobName}
                  </h1>
                  <span style={{ fontSize: '14px', color: 'var(--muted)', fontWeight: 600 }}>
                    Cliente: <b>{orderData.customerName}</b> • Asesora: <b>{orderData.advisorName}</b>
                  </span>
                </div>

                <div style={{
                  padding: '8px 16px',
                  borderRadius: '999px',
                  background: isReady ? '#dcfce7' : 'var(--orange-soft)',
                  color: isReady ? '#166534' : 'var(--orange-dark)',
                  fontSize: '13px',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Clock size={15} />
                  <span>{stages.find((s) => s.id === orderData.productionStage)?.label || orderData.productionStage}</span>
                </div>
              </div>

              {/* Delivery Estimate Box */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--bg)', padding: '16px', borderRadius: '14px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Calendar size={20} style={{ color: 'var(--orange)' }} />
                  <div>
                    <small style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: 800 }}>FECHA ESTIMADA DE ENTREGA</small>
                    <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{orderData.deliveryDate || 'Por confirmar'}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck size={20} style={{ color: '#16a34a' }} />
                  <div>
                    <small style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: 800 }}>ESTADO DE PAGO</small>
                    <strong style={{ fontSize: '14px', color: orderData.balanceDue > 0 ? '#d97706' : '#16a34a' }}>
                      {orderData.balanceDue > 0 ? `Abonado $${Number(orderData.depositAmount).toFixed(2)} (Saldo: $${Number(orderData.balanceDue).toFixed(2)})` : '100% Pagado'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 7-Stage Visual Progress Stepper */}
              <div style={{ display: 'grid', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--ink)' }}>Progreso en Taller</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {stages.map((st, idx) => {
                    const isPassed = idx < currentStageIndex;
                    const isCurrent = idx === currentStageIndex;
                    const Icon = st.icon;

                    return (
                      <div
                        key={st.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          background: isCurrent ? 'var(--paper)' : (isPassed ? '#f0fdf4' : 'var(--bg)'),
                          border: isCurrent ? '2px solid var(--orange)' : (isPassed ? '1px solid #bbf7d0' : '1px solid var(--line)'),
                          opacity: isPassed || isCurrent ? 1 : 0.65
                        }}
                      >
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: isCurrent ? 'var(--orange)' : (isPassed ? '#16a34a' : 'var(--line)'),
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Icon size={18} />
                        </div>

                        <div style={{ flex: '1' }}>
                          <strong style={{ fontSize: '13px', color: isCurrent ? 'var(--orange-dark)' : (isPassed ? '#166534' : 'var(--ink)'), display: 'block' }}>
                            {st.label}
                          </strong>
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{st.desc}</span>
                        </div>

                        <div>
                          {isPassed && <CheckCircle2 size={18} style={{ color: '#16a34a' }} />}
                          {isCurrent && <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--orange)', background: 'var(--orange-soft)', padding: '2px 8px', borderRadius: '999px' }}>EN CURSO</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ARTWORK PROOFING & APPROVAL CARD */}
            {orderData.artUrl && (
              <div style={{ background: 'var(--paper)', borderRadius: '20px', border: '1px solid var(--line)', padding: '24px', display: 'grid', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Eye size={18} style={{ color: 'var(--orange)' }} /> Boceto & Arte para Aprobación
                  </h3>
                  {orderData.artApproved ? (
                    <span style={{ padding: '4px 10px', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontSize: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FileCheck size={14} /> Arte Aprobado por {orderData.artApprovedBy || 'Cliente'}
                    </span>
                  ) : (
                    <span style={{ padding: '4px 10px', borderRadius: '999px', background: '#fef3c7', color: '#b45309', fontSize: '12px', fontWeight: 800 }}>
                      Pendiente de Aprobación
                    </span>
                  )}
                </div>

                <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--line)', maxHeight: '380px', background: '#000', textAlign: 'center' }}>
                  <img src={orderData.artUrl} alt="Boceto de trabajo" style={{ maxWidth: '100%', maxHeight: '380px', objectFit: 'contain' }} />
                </div>

                {!orderData.artApproved && !approvedSuccess && (
                  <div>
                    {!isApproving ? (
                      <button
                        type="button"
                        onClick={() => setIsApproving(true)}
                        className="pos-submit-order-btn"
                        style={{ width: '100%', padding: '12px', fontSize: '14px', background: '#16a34a' }}
                      >
                        <CheckCircle2 size={16} /> Aprobar este Boceto para Impresión
                      </button>
                    ) : (
                      <form onSubmit={handleApproveArt} style={{ display: 'grid', gap: '10px', background: 'var(--bg)', padding: '16px', borderRadius: '12px', border: '1px solid var(--line)' }}>
                        <label style={{ fontSize: '12px', fontWeight: 800 }}>Ingresa tu Nombre y Apellido para autorizar:</label>
                        <input
                          type="text"
                          className="pos-input"
                          placeholder="Ej. Juan Pérez (Gerente de Marketing)"
                          value={approvalName}
                          onChange={(e) => setApprovalName(e.target.value)}
                          required
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button type="button" className="pos-nav-tab" onClick={() => setIsApproving(false)}>Cancelar</button>
                          <button type="submit" className="pos-submit-order-btn" style={{ background: '#16a34a' }}>
                            Confirmar y Autorizar Producción
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {approvedSuccess && (
                  <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#166534', borderRadius: '10px', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={18} /> ¡Excelente! Tu autorización ha sido registrada en el taller. Iniciamos la producción de inmediato.
                  </div>
                )}
              </div>
            )}

            {/* PICKUP & WORKSHOP LOCATION CARD */}
            <div style={{ background: 'var(--paper)', borderRadius: '20px', border: '1px solid var(--line)', padding: '24px', display: 'grid', gap: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={18} style={{ color: 'var(--orange)' }} /> Punto de Retiro & Taller Matriz
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                <div>
                  <strong style={{ fontSize: '14px', display: 'block', color: 'var(--ink)' }}>Gigaprint Publicidad & Impresión</strong>
                  <span style={{ fontSize: '13px', color: 'var(--muted)', display: 'block', margin: '4px 0' }}>
                    {orderData.pickupLocation || 'Av. García Moreno y 9 de Octubre, Milagro, Guayas'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: liveSchedule.badgeColor,
                      display: 'inline-block'
                    }} />
                    <strong style={{ color: liveSchedule.badgeColor }}>{liveSchedule.badgeLabel}</strong>
                    <span style={{ color: 'var(--muted)' }}>· Hoy: {liveSchedule.todayHoursStr}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                  <a
                    href="https://maps.google.com/?q=-0.1557,-78.4907"
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none', padding: '10px 16px', borderRadius: '10px', background: 'var(--orange)', color: '#fff', fontSize: '13px', fontWeight: 800, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <MapPin size={15} /> Abrir en Google Maps
                  </a>
                  <a
                    href={buildWhatsAppUrl(supportNumber, `Hola ${orderData.advisorName}, tengo una consulta sobre mi orden #${orderData.orderNumber}`)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none', padding: '10px 16px', borderRadius: '10px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontSize: '13px', fontWeight: 800, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <MessageCircle size={15} /> Contactar a mi Asesora ({orderData.advisorName})
                  </a>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
