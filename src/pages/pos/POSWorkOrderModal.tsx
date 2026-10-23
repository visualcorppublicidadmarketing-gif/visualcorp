import React, { useState } from 'react';
import { X, Printer, Wrench, Download, ExternalLink, Tag, Eye } from 'lucide-react';
import { POSPackageLabelModal } from './POSPackageLabelModal';
import { getGoogleMapsEmbedUrl, getGoogleMapsOpenUrl } from '../../lib/maps';

export function POSWorkOrderModal({ order, items = [], advisor, isOpen, onClose }) {
  const [selectedMachine, setSelectedMachine] = useState('plotter_320_solvente');
  const [showLabelModal, setShowLabelModal] = useState(false);

  if (!isOpen || !order) return null;

  const trackingToken = order.trackingToken || order.orderNumber;
  const trackingUrl = `https://gigaprint-ec.github.io/gigaprint-webpage/seguimiento/${trackingToken}`;
  const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(trackingUrl)}&size=90&margin=1`;
  const installationMapUrl = getGoogleMapsOpenUrl(order.installationMapsUrl, order.installationAddress);
  const installationMapEmbedUrl = getGoogleMapsEmbedUrl(order.installationMapsUrl, order.installationAddress);

  const machines = [
    { id: 'plotter_320_solvente', name: 'Plotter Gran Formato 3.20m (Solvente)' },
    { id: 'roland_160_ecosolvente', name: 'Roland TrueVIS 1.60m (Ecosolvente)' },
    { id: 'uv_flatbed_mimaki', name: 'Cama Plana UV Mimaki (Rígidos / Sintra)' },
    { id: 'laser_digital_konica', name: 'Prensa Digital Láser Konica Minolta' },
    { id: 'dtf_textil', name: 'Plotter Textil DTF 60cm' }
  ];

  const handlePrint = () => {
    window.print();
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
          background: '#fff',
          color: '#000',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '760px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          display: 'grid',
          gap: '16px'
        }}>
          {/* Top Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wrench size={20} color="#ea580c" />
              <strong style={{ fontSize: '16px', color: '#0f172a' }}>Hoja de Producción & Taller (Work Order)</strong>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowLabelModal(true)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#ea580c',
                  fontWeight: '800',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Tag size={15} /> Etiqueta Bulto
              </button>
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 0,
                  background: '#ea580c',
                  color: '#fff',
                  fontWeight: '800',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={15} /> Imprimir Hoja
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Printable Production Sheet */}
          <div className="printable-work-order" style={{ display: 'grid', gap: '14px', fontFamily: 'Arial, sans-serif' }}>
            {/* Header Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', letterSpacing: '-0.02em' }}>GIGAPRINT — TALLER</h1>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: 'bold' }}>ORDEN DE TRABAJO & ESPECIFICACIONES TÉCNICAS</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={qrCodeUrl}
                  alt="QR Tracking"
                  style={{ width: '65px', height: '65px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px' }}
                />
                <div style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>NRO. DE ORDEN</span>
                  <strong style={{ fontSize: '22px', fontWeight: '900', color: '#ea580c' }}>#{order.orderNumber}</strong>
                </div>
              </div>
            </div>

            {/* Job Details Meta Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>TRABAJO</span>
                <strong style={{ fontSize: '14px', color: '#0f172a' }}>{order.jobName}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>CLIENTE</span>
                <strong style={{ fontSize: '14px', color: '#0f172a' }}>{order.customerName}</strong>
                {order.customerPhone && <span style={{ fontSize: '11.5px', color: '#16a34a', display: 'block' }}>📞 {order.customerPhone}</span>}
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>ÁREA DE PRODUCCIÓN</span>
                <strong style={{ fontSize: '13px', color: '#6366f1', textTransform: 'capitalize' }}>
                  {order.assignedArea === 'sublimacion' ? '👕 Sublimación & DTF' : order.assignedArea === 'corte_laser' ? '⚡ Corte Láser & CNC' : '🖨️ Impresión Gran Formato'}
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>FECHA DE EJECUCIÓN (TALLER)</span>
                <strong style={{ fontSize: '13px', color: '#0f172a' }}>{order.executionDate || order.orderDate}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>FECHA DE ENTREGA / MONTAJE</span>
                <strong style={{ fontSize: '13.5px', color: '#dc2626' }}>{order.installationDate || order.deliveryDate || 'Por coordinar'}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>MÁQUINA & TÉCNICO</span>
                <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 'bold' }}>
                  ⚙️ {order.machineAssigned || 'Plotter Solvente 3.20m'} · 👷 {order.technicianAssigned || 'Operario'}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>ASESORA COMERCIAL</span>
                <span style={{ fontSize: '13px', color: '#0f172a' }}>{advisor?.name || 'Ventas'}</span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', display: 'block' }}>ESTADO DE ARTE</span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: order.artApproved ? '#16a34a' : '#d97706' }}>
                  {order.artApproved ? '✓ ARTE APROBADO' : '⚠ ARTE PENDIENTE DE REVISIÓN'}
                </span>
              </div>
            </div>

            {/* On-Site Installation & Measurements Box */}
            {order.requiresInstallation && (
              <div style={{ background: '#ecfeff', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #a5f3fc', display: 'grid', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0891b2', fontWeight: 900, fontSize: '12px' }}>
                  🚚 <span>MONTAJE & INSTALACIÓN EN SITIO REQUERIDA:</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#0e7490' }}>
                  <strong>Dirección:</strong> {order.installationAddress || 'Por confirmar con cliente'}
                </div>
                {installationMapUrl && (
                  <a href={installationMapUrl} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontSize: '11.5px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <ExternalLink size={12} /> Abrir ruta en Google Maps
                  </a>
                )}
                {order.fieldMeasurementsNotes && (
                  <div style={{ fontSize: '12px', color: '#155e75' }}>
                    <strong>Notas de Medidas / Cuadrilla:</strong> {order.fieldMeasurementsNotes}
                  </div>
                )}
                {installationMapEmbedUrl && (
                  <iframe
                    title="Mapa de instalación"
                    src={installationMapEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    style={{ width: '100%', height: '190px', border: '1px solid #a5f3fc', borderRadius: '7px', marginTop: '6px' }}
                  />
                )}
              </div>
            )}

            {/* Artwork Attachment Link Box (Workshop RIP access) */}
            {order.artUrl && (
              <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: '12px', color: '#1e40af', display: 'block' }}>📁 ARCHIVO DE ARTE / VECTOR PARA RIP:</strong>
                  <span style={{ fontSize: '11px', color: '#3b82f6', wordBreak: 'break-all' }}>{order.artUrl}</span>
                </div>
                <a
                  href={order.artUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Download size={13} /> Abrir Arte
                </a>
              </div>
            )}

            {/* Technical Items Table */}
            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: '800', textTransform: 'uppercase' }}>
                Productos & Acabados a Fabricar:
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#fff' }}>
                    <th style={{ padding: '7px', border: '1px solid #0f172a' }}>#</th>
                    <th style={{ padding: '7px', border: '1px solid #0f172a' }}>Producto / Sustrato</th>
                    <th style={{ padding: '7px', border: '1px solid #0f172a' }}>Medidas (cm)</th>
                    <th style={{ padding: '7px', border: '1px solid #0f172a' }}>Área m²</th>
                    <th style={{ padding: '7px', border: '1px solid #0f172a' }}>Cant.</th>
                    <th style={{ padding: '7px', border: '1px solid #0f172a' }}>Acabados / Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>{idx + 1}</td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                        {it.product_name || it.productName}
                      </td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1' }}>
                        {it.width_cm && it.height_cm ? `${it.width_cm} × ${it.height_cm} cm` : it.widthCm && it.heightCm ? `${it.widthCm} × ${it.heightCm} cm` : 'Unidad'}
                      </td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1' }}>
                        {it.area_m2 ? `${Number(it.area_m2).toFixed(2)} m²` : it.areaM2 ? `${Number(it.areaM2).toFixed(2)} m²` : '-'}
                      </td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                        {it.quantity || 1}
                      </td>
                      <td style={{ padding: '7px', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                        <span style={{ fontWeight: 'bold', color: '#ea580c' }}>
                          {it.finishing || 'Sin acabados'}
                        </span>
                        {it.notes && (
                          <div style={{ fontSize: '10.5px', color: '#0369a1', fontStyle: 'italic', marginTop: '2px' }}>
                            Nota: {it.notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Special Instructions */}
            {order.productionNotes && (
              <div style={{ background: '#fffbeb', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '11.5px' }}>
                <strong style={{ color: '#b45309', display: 'block', marginBottom: '2px' }}>INSTRUCCIONES ESPECIALES DE TALLER:</strong>
                {order.productionNotes}
              </div>
            )}

            {/* Machine Operator Sign-off checkboxes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '8px', paddingTop: '10px', borderTop: '2px dashed #cbd5e1', fontSize: '11px' }}>
              <div style={{ border: '1px solid #cbd5e1', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ display: 'block', fontWeight: 'bold' }}>1. IMPRESIÓN</span>
                <div style={{ height: '22px' }}></div>
                <span style={{ color: '#64748b' }}>Firma / Operador</span>
              </div>
              <div style={{ border: '1px solid #cbd5e1', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ display: 'block', fontWeight: 'bold' }}>2. CONFECCIÓN</span>
                <div style={{ height: '22px' }}></div>
                <span style={{ color: '#64748b' }}>Firma / Acabados</span>
              </div>
              <div style={{ border: '1px solid #cbd5e1', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ display: 'block', fontWeight: 'bold' }}>3. CALIDAD</span>
                <div style={{ height: '22px' }}></div>
                <span style={{ color: '#64748b' }}>Firma / Inspector</span>
              </div>
              <div style={{ border: '1px solid #cbd5e1', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                <span style={{ display: 'block', fontWeight: 'bold' }}>4. DESPACHO</span>
                <div style={{ height: '22px' }}></div>
                <span style={{ color: '#64748b' }}>Firma / Entrega</span>
              </div>
            </div>
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
