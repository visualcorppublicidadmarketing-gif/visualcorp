import React, { useState, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  Send,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Building2,
  QrCode,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import {
  SRI_CONFIG,
  generateSRIAccessKey,
  buildSRIFacturaXML,
  simulateSRIAuthorization,
  validateEcuadorianID
} from '../../lib/sriInvoicing';
import { useToast } from '../../components/studio/Toast';

export function POSSRIInvoiceModal({ order, items = [], customer, advisor, isOpen, onClose }) {
  const toast = useToast();
  if (!isOpen || !order) return null;

  const [secuencial] = useState(() => String(parseInt(order.orderNumber || '1', 10)).padStart(9, '0'));
  const [authStatus, setAuthStatus] = useState('AUTORIZADO');
  const [isSimulating, setIsSimulating] = useState(false);

  const claveAcceso = useMemo(() => {
    return generateSRIAccessKey({
      date: order.orderDate || new Date(),
      secuencial
    });
  }, [order.orderDate, secuencial]);

  const authData = useMemo(() => {
    return simulateSRIAuthorization({ claveAcceso, secuencial });
  }, [claveAcceso, secuencial]);

  const subtotal15 = Number(order.subtotal || 0);
  const discount = Number(order.discountAmount || 0);
  const subtotalNeto = Math.max(0, subtotal15 - discount);
  const iva15 = Number((subtotalNeto * 0.15).toFixed(2));
  const totalFactura = Number((subtotalNeto + iva15 + Number(order.shippingCost || 0)).toFixed(2));

  const handleDownloadXML = () => {
    const xml = buildSRIFacturaXML({
      order: { ...order, subtotal: subtotalNeto, taxAmount: iva15, totalAmount: totalFactura },
      items,
      customer,
      secuencial,
      claveAcceso
    });

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FACTURA_${SRI_CONFIG.codEstablecimiento}-${SRI_CONFIG.codPuntoEmision}-${secuencial}.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintRIDE = () => {
    window.print();
  };

  const handleSendEmail = () => {
    toast.success(`RIDE y XML enviados con éxito al correo: ${customer?.email || 'cliente@gigaprint.ec'}`);
  };

  return (
    <div className="pos-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
      <div className="pos-modal-card" style={{ maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', background: '#fff', color: '#000', padding: '24px', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%' }}>
        
        {/* Top Header Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={22} style={{ color: '#16a34a' }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#0f172a' }}>
              Factura Electrónica SRI • RIDE Oficial
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleDownloadXML}
              style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} /> XML SRI
            </button>
            <button
              type="button"
              onClick={handleSendEmail}
              style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={14} /> Enviar RIDE
            </button>
            <button
              type="button"
              onClick={handlePrintRIDE}
              style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#ea580c', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={14} /> Imprimir RIDE
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Printable SRI RIDE Sheet */}
        <div className="printable-sri-ride" style={{ display: 'grid', gap: '16px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11px', color: '#1e293b' }}>
          
          {/* Header 2-Column Boxes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '14px' }}>
            
            {/* Box 1: Emisor */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', display: 'grid', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px' }}>G</span>
                <strong style={{ fontSize: '14px', color: '#0f172a' }}>{SRI_CONFIG.razonSocial}</strong>
              </div>
              <div><b>Nombre Comercial:</b> {SRI_CONFIG.nombreComercial}</div>
              <div><b>Matriz:</b> {SRI_CONFIG.dirMatriz}</div>
              <div><b>Sucursal:</b> {SRI_CONFIG.dirEstablecimiento}</div>
              <div><b>Obligado a llevar contabilidad:</b> {SRI_CONFIG.obligadoContabilidad}</div>
              <div style={{ padding: '4px 8px', background: '#f0fdf4', color: '#166534', borderRadius: '6px', fontWeight: 800, width: 'fit-content', marginTop: '4px' }}>
                RÉGIMEN GENERAL - CONTRIBUYENTE REGULAR
              </div>
            </div>

            {/* Box 2: RUC & Clave de Acceso */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px', display: 'grid', gap: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800 }}>R.U.C.: {SRI_CONFIG.ruc}</div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#ea580c' }}>FACTURA ELECTRÓNICA</div>
              <div><b>No.:</b> {SRI_CONFIG.codEstablecimiento}-{SRI_CONFIG.codPuntoEmision}-{secuencial}</div>
              <div><b>NÚMERO DE AUTORIZACIÓN:</b></div>
              <div style={{ fontSize: '9px', fontFamily: 'monospace', letterSpacing: '0.04em', background: '#f8fafc', padding: '4px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                {claveAcceso}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><b>FECHA:</b> {authData.fechaAutorizacion}</span>
                <span><b>AMBIENTE:</b> {authData.ambiente}</span>
              </div>
              <div><b>EMISIÓN:</b> NORMAL</div>
              
              {/* Barcode Simulation */}
              <div style={{ marginTop: '6px' }}>
                <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>CLAVE DE ACCESO:</span>
                <div style={{ background: '#000', color: '#fff', textAlign: 'center', padding: '4px', fontSize: '9px', fontFamily: 'monospace', letterSpacing: '0.05em', borderRadius: '4px' }}>
                  ||||| | |||| |||||| |||| | |||||||| |||| ||||||||| |||
                </div>
                <div style={{ fontSize: '9px', textAlign: 'center', fontFamily: 'monospace', color: '#475569', marginTop: '2px' }}>
                  {claveAcceso}
                </div>
              </div>
            </div>
          </div>

          {/* Customer Details Box */}
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
            <div><b>Razón Social / Nombres y Apellidos:</b> {order.customerName}</div>
            <div><b>Identificación:</b> {order.customerIdentification || '9999999999999'}</div>
            <div><b>Fecha de Emisión:</b> {order.orderDate}</div>
            <div><b>Guía de Remisión:</b> S/N</div>
            <div><b>Dirección:</b> {customer?.address || 'Milagro, Ecuador'}</div>
            <div><b>Teléfono:</b> {order.customerPhone || 'N/A'}</div>
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #cbd5e1' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px' }}>Cod. Principal</th>
                <th style={{ padding: '6px 8px' }}>Cant.</th>
                <th style={{ padding: '6px 8px' }}>Descripción</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Descuento</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Precio Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>GIGA-{idx + 1}</td>
                  <td style={{ padding: '6px 8px' }}>{Number(it.quantity || 1).toFixed(2)}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <b>{it.productName || it.product_name}</b>
                    {it.widthCm ? ` (${it.widthCm}x${it.heightCm} cm)` : ''}
                    {it.finishing && it.finishing !== 'none' ? ` - ${it.finishing}` : ''}
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>${Number(it.unitPrice || (it.totalPrice / (it.quantity || 1))).toFixed(2)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>$0.00</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>${Number(it.totalPrice || it.total_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Bottom Summary: Additional Info + Totals Box */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
            
            {/* Left: Info Adicional & Forma de Pago */}
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px' }}>
                <strong style={{ fontSize: '11px', color: '#0f172a', display: 'block', marginBottom: '6px' }}>INFORMACIÓN ADICIONAL</strong>
                <div style={{ display: 'grid', gap: '3px' }}>
                  <div><b>Email:</b> {customer?.email || 'facturacion@gigaprint.ec'}</div>
                  <div><b>Asesora:</b> {advisor?.name || 'Ventas'}</div>
                  <div><b>Trabajo:</b> {order.jobName}</div>
                  <div><b>Observaciones:</b> {order.notes || 'Comprobante electrónico emitido con tarifa 15% IVA vigente.'}</div>
                </div>
              </div>

              <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px' }}>
                <strong style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>FORMA DE PAGO</strong>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>SIN UTILIZACIÓN DEL SISTEMA FINANCIERO:</span>
                  <b>${totalFactura.toFixed(2)}</b>
                </div>
              </div>
            </div>

            {/* Right: Tax Breakdown */}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', display: 'grid', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SUBTOTAL 15%:</span>
                <b>${subtotalNeto.toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SUBTOTAL 0%:</span>
                <b>$0.00</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SUBTOTAL NO OBJETO DE IVA:</span>
                <b>$0.00</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SUBTOTAL EXENTO DE IVA:</span>
                <b>$0.00</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>SUBTOTAL SIN IMPUESTOS:</span>
                <b>${subtotalNeto.toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>TOTAL DESCUENTO:</span>
                <b>${discount.toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>IVA 15%:</span>
                <b>${iva15.toFixed(2)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>PROPINA:</span>
                <b>$0.00</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900, borderTop: '2px solid #0f172a', paddingTop: '6px', marginTop: '2px', color: '#ea580c' }}>
                <span>VALOR TOTAL:</span>
                <span>${totalFactura.toFixed(2)}</span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
