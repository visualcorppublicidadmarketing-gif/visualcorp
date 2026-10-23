import React, { useState, useRef } from 'react';
import {
  X,
  Eye,
  Check,
  MessageCircle,
  Link,
  CheckCircle2,
  Sparkles,
  PenTool,
  RotateCcw,
  ShieldCheck,
  Download,
  MapPin,
  Plus,
  Trash2,
  Copy,
  ExternalLink
} from 'lucide-react';
import { approveOrderArtProof, addArtProofPin } from '../../lib/posStore';

export function POSArtProofModal({ order, store, setStore, isOpen, onClose }) {
  if (!isOpen || !order) return null;

  const [artUrl, setArtUrl] = useState(order.artUrl || '');
  const [approverName, setApproverName] = useState(order.customerName || '');
  const [confirmedSpecs, setConfirmedSpecs] = useState(true);
  const [confirmedSpelling, setConfirmedSpelling] = useState(true);
  const [hasSignature, setHasSignature] = useState(Boolean(order.artProofSignature));
  const [pins, setPins] = useState(order.artProofPins || []);
  const [activePinComment, setActivePinComment] = useState('');
  const [tempPinCoord, setTempPinCoord] = useState(null);

  const canvasRef = useRef(null);
  const imageContainerRef = useRef(null);
  const isDrawing = useRef(false);

  const startDrawing = (e) => {
    isDrawing.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
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
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.lineWidth = 2.5;
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

  // Image Pin Drop Handler
  const handleImageClick = (e) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const xPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((e.clientY - rect.top) / rect.height) * 100;
    setTempPinCoord({ x: Number(xPercent.toFixed(1)), y: Number(yPercent.toFixed(1)) });
  };

  const handleAddPin = () => {
    if (!tempPinCoord || !activePinComment.trim()) return;
    const newPin = {
      id: `pin-${Date.now()}`,
      number: pins.length + 1,
      x: tempPinCoord.x,
      y: tempPinCoord.y,
      comment: activePinComment.trim(),
      author: 'Diseño / Cliente',
      createdAt: new Date().toISOString(),
      resolved: false
    };
    const updated = [...pins, newPin];
    setPins(updated);
    setActivePinComment('');
    setTempPinCoord(null);
  };

  const handleRemovePin = (pinId) => {
    setPins(pins.filter((p) => p.id !== pinId));
  };

  const handleTogglePinResolved = (pinId) => {
    setPins(pins.map((p) => (p.id === pinId ? { ...p, resolved: !p.resolved } : p)));
  };

  const publicProofUrl = `${window.location.origin}${window.location.pathname}#/prueba-arte/${order.trackingToken || order.id}`;

  const handleSaveAndApprove = () => {
    let signatureUrl = order.artProofSignature || null;
    if (hasSignature && canvasRef.current) {
      try {
        signatureUrl = canvasRef.current.toDataURL('image/png');
      } catch (e) {}
    }

    const res = approveOrderArtProof(store, order.id, approverName, artUrl, signatureUrl, pins);
    if (res.ok) {
      setStore(res.updatedStore);
      onClose();
    }
  };

  const handleSendWhatsAppProof = () => {
    const phone = (order.customerPhone || '').replace(/[^0-9]/g, '');
    const clean = phone.startsWith('0') ? '593' + phone.substring(1) : phone.startsWith('593') ? phone : '593' + phone;

    let msg = '*GIGAPRINT — APROBACIÓN DE ARTE & DISEÑO*\n';
    msg += '================================\n';
    msg += `Hola *${order.customerName}*, adjuntamos la vista previa interactiva para tu trabajo: *${order.jobName}* (Orden #${order.orderNumber}).\n\n`;
    msg += `📱 *Portal de Aprobación y Firma en Vivo:* ${publicProofUrl}\n\n`;
    if (artUrl) {
      msg += `🔗 *Ver Boceto en Alta Calidad:* ${artUrl}\n\n`;
    }
    msg += 'Por favor abre el portal desde tu celular para verificar textos, medidas y firmar la aprobación con tu dedo para iniciar la impresión.\n\n';
    msg += '¡Gracias por confiar en Gigaprint! 🚀';

    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
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
      <div className="pos-modal-content" style={{
        background: 'var(--paper)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px',
        border: '1px solid var(--line)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        display: 'grid',
        gap: '14px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={20} color="var(--orange)" />
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '900', color: 'var(--ink)' }}>
              Aprobación de Arte — #{order.orderNumber}
            </h3>
          </div>
          <button onClick={onClose} style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--bg)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <div>
          <strong style={{ fontSize: '14px', color: 'var(--ink)', display: 'block' }}>{order.jobName}</strong>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Cliente: {order.customerName}</span>
        </div>

        {/* Current status pill */}
        <div style={{
          padding: '10px 14px',
          borderRadius: '10px',
          background: order.artApproved ? '#dcfce7' : '#fef3c7',
          border: '1px solid ' + (order.artApproved ? '#86efac' : '#fde68a'),
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: order.artApproved ? '#166534' : '#92400e',
          fontWeight: '700'
        }}>
          {order.artApproved ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
          <span>
            {order.artApproved
              ? `Arte aprobado por ${order.artApprovedBy || 'Cliente'} (${order.artApprovedAt ? order.artApprovedAt.substring(0, 10) : 'Registrado'})`
              : 'Arte pendiente de aprobación del cliente'}
          </span>
        </div>

        {/* Art URL input */}
        <div style={{ display: 'grid', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)' }}>
            URL del Arte / Boceto (Cloud Storage, Drive, Enlace directo):
          </label>
          <div style={{ position: 'relative' }}>
            <Link size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--muted)' }} />
            <input
              type="text"
              value={artUrl}
              onChange={(e) => setArtUrl(e.target.value)}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                borderRadius: '8px',
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Artwork Image Viewer with Interactive Pin Dropper */}
        {artUrl && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} color="var(--orange)" /> Vista Previa del Arte (Haz clic para clavar un pin de corrección):
              </label>
              <a
                href={artUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '11px', color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}
              >
                <ExternalLink size={12} /> Abrir HD
              </a>
            </div>

            <div
              ref={imageContainerRef}
              onClick={handleImageClick}
              style={{
                position: 'relative',
                maxHeight: '220px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1.5px solid var(--line)',
                background: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'crosshair'
              }}
            >
              <img
                src={artUrl}
                alt="Boceto de arte"
                style={{ maxWidth: '100%', maxHeight: '220px', objectFit: 'contain', display: 'block' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />

              {/* Render Pins */}
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
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 900,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    border: '2px solid #fff',
                    pointerEvents: 'none'
                  }}
                  title={p.comment}
                >
                  {p.number}
                </div>
              ))}

              {/* Temporary Pin Marker */}
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
                    width: '26px',
                    height: '26px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 900,
                    boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.4)',
                    border: '2px solid #fff'
                  }}
                >
                  +
                </div>
              )}
            </div>

            {/* Pin Creation Input */}
            {tempPinCoord && (
              <div style={{ marginTop: '8px', padding: '10px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Escribe la corrección para este pin (ej. Corregir número de teléfono)..."
                  value={activePinComment}
                  onChange={(e) => setActivePinComment(e.target.value)}
                  className="pos-input"
                  style={{ fontSize: '12px', padding: '6px 10px', background: '#fff' }}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddPin(); }}
                />
                <button
                  type="button"
                  onClick={handleAddPin}
                  className="pos-submit-order-btn"
                  style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  Guardar Pin
                </button>
                <button
                  type="button"
                  onClick={() => setTempPinCoord(null)}
                  className="pos-cat-pill"
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Pins List */}
            {pins.length > 0 && (
              <div style={{ marginTop: '8px', display: 'grid', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                {pins.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      background: p.resolved ? '#f0fdf4' : '#fff7ed',
                      border: `1px solid ${p.resolved ? '#bbf7d0' : '#fed7aa'}`,
                      fontSize: '11.5px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ color: p.resolved ? '#166534' : '#c2410c' }}>Pin {p.number}:</strong>
                      <span style={{ textDecoration: p.resolved ? 'line-through' : 'none', color: p.resolved ? '#64748b' : '#1e293b' }}>
                        {p.comment}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleTogglePinResolved(p.id)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: p.resolved ? '#166534' : '#c2410c' }}
                      >
                        {p.resolved ? '✓ Resuelto' : 'Marcar Resuelto'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePin(p.id)}
                        style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Public Proof Magic Link */}
        <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} color="var(--orange)" />
            <span><strong>Portal de Firma Móvil para Cliente:</strong></span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(publicProofUrl);
              alert('Enlace copiado al portapapeles.');
            }}
            className="pos-cat-pill"
            style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Copy size={12} /> Copiar Link
          </button>
        </div>

        {/* In-Person Verification Checklist */}
        <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--line)', display: 'grid', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)' }}>
            ✓ Checklist de Conformidad Técnica:
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmedSpecs}
              onChange={(e) => setConfirmedSpecs(e.target.checked)}
            />
            <span>Medidas (m²), orientación y sustrato verificados y correctos.</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={confirmedSpelling}
              onChange={(e) => setConfirmedSpelling(e.target.checked)}
            />
            <span>Textos, números telefónicos, ortografía y colores revisados.</span>
          </label>
        </div>

        {/* Digital Signature Canvas for in-person customer approval */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PenTool size={14} color="var(--orange)" /> Firma Digital del Cliente (Táctil / Mouse):
            </label>
            <button
              type="button"
              onClick={clearSignature}
              style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RotateCcw size={12} /> Limpiar Firma
            </button>
          </div>

          <canvas
            ref={canvasRef}
            width={480}
            height={100}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{
              width: '100%',
              height: '100px',
              background: '#fff',
              border: '1.5px dashed var(--line)',
              borderRadius: '10px',
              touchAction: 'none',
              cursor: 'crosshair',
              display: 'block'
            }}
          />
        </div>

        {/* Approver Name */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>
            Nombre de la Persona que Aprueba:
          </label>
          <input
            type="text"
            value={approverName}
            onChange={(e) => setApproverName(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
          <button
            type="button"
            onClick={handleSendWhatsAppProof}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: 0,
              background: '#25D366',
              color: '#fff',
              fontWeight: '800',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <MessageCircle size={16} /> Enviar Boceto por WhatsApp al Cliente
          </button>

          <button
            type="button"
            onClick={handleSaveAndApprove}
            disabled={!confirmedSpecs || !confirmedSpelling}
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: 0,
              background: confirmedSpecs && confirmedSpelling ? 'var(--orange)' : '#94a3b8',
              color: '#fff',
              fontWeight: '900',
              fontSize: '13px',
              cursor: confirmedSpecs && confirmedSpelling ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Check size={16} /> Confirmar Aprobación & Pasar a Cola de Impresión
          </button>
        </div>
      </div>
    </div>
  );
}
