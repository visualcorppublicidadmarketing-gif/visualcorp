import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  PenTool,
  RotateCcw,
  Sparkles,
  MapPin,
  Plus,
  Trash2,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  MessageCircle,
  ArrowLeft
} from 'lucide-react';
import {
  fetchPublicPOSOrder,
  submitPublicArtDecision
} from '../../lib/posStore';

export function POSArtProofPublicPage() {
  const { orderId } = useParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);

  // Interaction States
  const [pins, setPins] = useState([]);
  const [tempPinCoord, setTempPinCoord] = useState(null);
  const [activeComment, setActiveComment] = useState('');
  const [approverName, setApproverName] = useState('');
  const [approverCedula, setApproverCedula] = useState('');
  const [confirmedChecklist, setConfirmedChecklist] = useState(false);
  const [isApprovedSuccess, setIsApprovedSuccess] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [imageScale, setImageScale] = useState(1);

  const canvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    fetchPublicPOSOrder(orderId).then((st) => {
      setStore(st);
      const found = (st.orders || [])[0];
      if (found) {
        setOrder(found);
        setPins(found.artProofPins || []);
        setApproverName(found.customerName || '');
        setApproverCedula(found.customerIdentification || '');
        if (found.artApproved) setIsApprovedSuccess(true);
      }
      setLoading(false);
    });
  }, [orderId]);

  // Touch & Mouse Canvas Signature
  const startDrawing = (e) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasSignature(true);
  };

  const draw = (e) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Image Pin Interaction
  const handleImageClick = (e) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    setTempPinCoord({ x: Number(xPercent.toFixed(1)), y: Number(yPercent.toFixed(1)) });
  };

  const handleAddPin = () => {
    if (!tempPinCoord || !activeComment.trim()) return;
    const newPin = {
      id: `pin-${Date.now()}`,
      number: pins.length + 1,
      x: tempPinCoord.x,
      y: tempPinCoord.y,
      comment: activeComment.trim(),
      author: approverName || 'Cliente',
      createdAt: new Date().toISOString(),
      resolved: false
    };
    const updated = [...pins, newPin];
    setPins(updated);
    setActiveComment('');
    setTempPinCoord(null);
  };

  const handleRemovePin = (pinId) => {
    setPins(pins.filter((p) => p.id !== pinId));
  };

  // Final Action: Client Approves with E-Signature
  const handleConfirmApproval = async () => {
    if (!confirmedChecklist) {
      alert('Por favor marca la casilla de verificación de conformidad técnica.');
      return;
    }
    if (!hasSignature && !order.artProofSignature) {
      alert('Por favor dibuja tu firma en el recuadro para formalizar la aprobación.');
      return;
    }

    let signatureUrl = order.artProofSignature || null;
    if (hasSignature && canvasRef.current) {
      try {
        signatureUrl = canvasRef.current.toDataURL('image/png');
      } catch (e) {}
    }

    const res = await submitPublicArtDecision(order.trackingToken || orderId, {
      approverName: approverName || 'Cliente',
      decision: 'approved',
      signature: signatureUrl,
      pins,
    });
    if (res.ok) {
      setStore(res.updatedStore);
      setOrder(res.order);
      setIsApprovedSuccess(true);
    } else {
      alert('Ocurrió un error al guardar la aprobación: ' + res.error);
    }
  };

  // Request Changes with Pins
  const handleRequestCorrections = async () => {
    if (pins.length === 0) {
      alert('Haz clic sobre el boceto para clavar al menos un pin con la corrección deseada.');
      return;
    }
    const res = await submitPublicArtDecision(order.trackingToken || orderId, {
      approverName: approverName || 'Cliente',
      decision: 'changes_requested',
      pins,
    });
    if (res.ok) {
      alert('Tus observaciones fueron enviadas al equipo de diseño de Gigaprint. ¡Te contactaremos en breve!');
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff' }}>
        <p>Cargando prueba digital...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#fff', padding: '20px', textAlign: 'center' }}>
        <h2>No se encontró la orden de trabajo</h2>
        <p style={{ color: '#94a3b8' }}>Verifica que el enlace sea el correcto o comunícate con tu asesor de Gigaprint.</p>
        <Link to="/" style={{ marginTop: '16px', color: '#ea580c', fontWeight: 800, textDecoration: 'none' }}>
          Volver a Gigaprint
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f8fafc', padding: '20px 12px 60px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Top Brand Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#ea580c', width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '20px' }}>
              G
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>Gigaprint</h1>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Portal Oficial de Aprobación de Pruebas Digitales</span>
            </div>
          </div>
          <span style={{ background: '#1e293b', border: '1px solid #475569', padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, color: '#f97316' }}>
            Orden #{order.orderNumber}
          </span>
        </div>

        {/* Order Details Header */}
        <div style={{ background: '#1e293b', padding: '16px 18px', borderRadius: '16px', border: '1px solid #334155', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Trabajo / Proyecto
              </span>
              <h2 style={{ margin: '4px 0 2px', fontSize: '17px', fontWeight: 900, color: '#fff' }}>
                {order.jobName}
              </h2>
              <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Cliente: <strong>{order.customerName}</strong></span>
            </div>

            <div style={{
              background: order.artApproved ? '#064e3b' : '#78350f',
              color: order.artApproved ? '#6ee7b7' : '#fde68a',
              border: `1px solid ${order.artApproved ? '#059669' : '#d97706'}`,
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {order.artApproved ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
              {order.artApproved ? 'ARTE APROBADO' : 'PENDIENTE DE TU APROBACIÓN'}
            </div>
          </div>
        </div>

        {/* Artwork Viewer & Interactive Pin Canvas */}
        <div style={{ background: '#1e293b', padding: '16px', borderRadius: '16px', border: '1px solid #334155', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={16} color="#ea580c" />
              <span style={{ fontSize: '13px', fontWeight: 800 }}>Boceto de Impresión (Toca para poner un pin de corrección):</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setImageScale((s) => Math.max(0.8, s - 0.2))}
                style={{ background: '#334155', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
                title="Alejar"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                onClick={() => setImageScale((s) => Math.min(2.5, s + 0.2))}
                style={{ background: '#334155', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
                title="Acercar"
              >
                <ZoomIn size={14} />
              </button>
              {order.artUrl && (
                <a
                  href={order.artUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: '#ea580c', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', textDecoration: 'none', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <ExternalLink size={12} /> Ver HD
                </a>
              )}
            </div>
          </div>

          {order.artUrl ? (
            <div
              ref={imageContainerRef}
              onClick={handleImageClick}
              style={{
                position: 'relative',
                background: '#090d16',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1.5px solid #475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '260px',
                cursor: 'crosshair'
              }}
            >
              <img
                src={order.artUrl}
                alt={order.jobName}
                style={{
                  maxWidth: '100%',
                  maxHeight: '420px',
                  objectFit: 'contain',
                  transform: `scale(${imageScale})`,
                  transition: 'transform 0.2s ease',
                  display: 'block'
                }}
              />

              {/* Pins Placed */}
              {pins.map((p) => (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    transform: 'translate(-50%, -100%)',
                    background: p.resolved ? '#10b981' : '#ea580c',
                    color: '#fff',
                    borderRadius: '999px',
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 900,
                    boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
                    border: '2px solid #fff',
                    pointerEvents: 'none'
                  }}
                >
                  {p.number}
                </div>
              ))}

              {/* Temporary Pin */}
              {tempPinCoord && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${tempPinCoord.x}%`,
                    top: `${tempPinCoord.y}%`,
                    transform: 'translate(-50%, -100%)',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: '999px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 900,
                    boxShadow: '0 0 0 5px rgba(59, 130, 246, 0.5)',
                    border: '2px solid #fff'
                  }}
                >
                  +
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#090d16', borderRadius: '12px' }}>
              <p style={{ color: '#94a3b8' }}>El boceto visual está siendo generado por el diseñador.</p>
            </div>
          )}

          {/* Add Pin Comment Dialog */}
          {tempPinCoord && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#090d16', borderRadius: '12px', border: '1px solid #3b82f6', display: 'grid', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#60a5fa' }}>
                Agregar corrección en el punto seleccionado:
              </span>
              <input
                type="text"
                placeholder="Ej. Modificar este número telefónico / cambiar fondo a negro..."
                value={activeComment}
                onChange={(e) => setActiveComment(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #475569', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddPin(); }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTempPinCoord(null)}
                  style={{ background: '#334155', color: '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddPin}
                  style={{ background: '#ea580c', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}
                >
                  Guardar Anotación
                </button>
              </div>
            </div>
          )}

          {/* Pins List */}
          {pins.length > 0 && (
            <div style={{ marginTop: '14px', display: 'grid', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Anotaciones y Observaciones Realizadas:</span>
              {pins.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#090d16',
                    border: '1px solid #334155',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: p.resolved ? '#10b981' : '#ea580c', color: '#fff', padding: '2px 8px', borderRadius: '999px', fontWeight: 900, fontSize: '11px' }}>
                      #{p.number}
                    </span>
                    <span style={{ color: '#f8fafc' }}>{p.comment}</span>
                  </div>
                  {!order.artApproved && (
                    <button
                      type="button"
                      onClick={() => handleRemovePin(p.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approval Form and E-Signature Section */}
        {isApprovedSuccess ? (
          <div style={{ background: '#064e3b', padding: '24px', borderRadius: '16px', border: '1.5px solid #10b981', textAlign: 'center' }}>
            <CheckCircle2 size={44} color="#34d399" style={{ margin: '0 auto 10px' }} />
            <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 900, color: '#ecfdf5' }}>
              ¡Arte Aprobado con Éxito!
            </h3>
            <p style={{ margin: 0, color: '#a7f3d0', fontSize: '14px' }}>
              Tu orden ha sido enviada automáticamente a la cola de producción e impresión de Gigaprint.
            </p>
            {order.artProofSignature && (
              <div style={{ marginTop: '16px', display: 'inline-block', background: '#fff', padding: '8px', borderRadius: '10px' }}>
                <img src={order.artProofSignature} alt="Firma registrada" style={{ height: '60px', display: 'block' }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#1e293b', padding: '18px', borderRadius: '16px', border: '1px solid #334155', display: 'grid', gap: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="#ea580c" /> Declaración de Conformidad Técnica
            </h3>

            {/* Checklist */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', background: '#090d16', padding: '12px', borderRadius: '10px', border: '1px solid #334155' }}>
              <input
                type="checkbox"
                checked={confirmedChecklist}
                onChange={(e) => setConfirmedChecklist(e.target.checked)}
                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#ea580c' }}
              />
              <span style={{ color: '#cbd5e1' }}>
                He revisado detalladamente el boceto adjunto y confirmo que los <strong>textos, teléfonos, ortografía, diseño, orientación y dimensiones</strong> son correctos. Entiendo que una vez aprobada, la orden entrará a impresión directa.
              </span>
            </label>

            {/* Customer Approver Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Nombre y Apellido
                </label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#090d16', border: '1px solid #475569', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                  Cédula / RUC
                </label>
                <input
                  type="text"
                  value={approverCedula}
                  onChange={(e) => setApproverCedula(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: '#090d16', border: '1px solid #475569', color: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Signature Pad */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PenTool size={14} color="#ea580c" /> Firma Digital (Dibuja con tu dedo o mouse):
                </label>
                <button
                  type="button"
                  onClick={clearSignature}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RotateCcw size={12} /> Borrar Firma
                </button>
              </div>

              <canvas
                ref={canvasRef}
                width={600}
                height={120}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{
                  width: '100%',
                  height: '120px',
                  background: '#fff',
                  borderRadius: '10px',
                  touchAction: 'none',
                  cursor: 'crosshair',
                  display: 'block'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '12px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleRequestCorrections}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: '#334155',
                  color: '#f8fafc',
                  fontWeight: 800,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                ⚠️ Solicitar Correcciones
              </button>

              <button
                type="button"
                onClick={handleConfirmApproval}
                disabled={!confirmedChecklist}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: confirmedChecklist ? '#ea580c' : '#475569',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: '14px',
                  border: 'none',
                  cursor: confirmedChecklist ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: confirmedChecklist ? '0 10px 25px rgba(234, 88, 12, 0.4)' : 'none'
                }}
              >
                <CheckCircle2 size={18} /> APROBAR Y AUTORIZAR IMPRESIÓN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
