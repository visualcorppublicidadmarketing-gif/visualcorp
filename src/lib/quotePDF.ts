import { jsPDF } from 'jspdf';

/**
 * Genera y descarga una proforma comercial oficial en PDF para clientes B2B
 * @param {Object} params
 * @param {Object} params.client Datos del cliente (nombre, telefono, email, ciudad, empresa)
 * @param {Array} params.items Lista de productos/ítems cotizados con desglose
 * @param {Object} params.totals Subtotal, IVA (15%), Descuento, Total
 * @param {string} params.folio Código único de proforma (ej. GIGA-2026-0042)
 * @param {string} params.deliverySpeed Velocidad de entrega (standard, express, same_day)
 * @param {string} params.notes Notas adicionales del cliente
 */
export function generateQuotePDF({
  client = {},
  items = [],
  totals = {},
  folio = `GIGA-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
  deliverySpeed = 'standard',
  shippingOption = null,
  notes = ''
}: { client?: Record<string, any>; items?: Array<Record<string, any>>; totals?: Record<string, any>; folio?: string; deliverySpeed?: string; shippingOption?: { price?: number; name?: string } | null; notes?: string } = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - (margin * 2);

  // Palette
  const brandDark: [number, number, number] = [24, 24, 27];      // #18181b
  const brandOrange: [number, number, number] = [234, 88, 12];   // #ea580c
  const brandGray: [number, number, number] = [113, 113, 122];   // #71717a
  const brandLight: [number, number, number] = [244, 244, 245];  // #f4f4f5
  const textDark: [number, number, number] = [39, 39, 42];       // #27272a

  // 1. Header Banner & Branding
  doc.setFillColor(...brandDark);
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Orange accent stripe
  doc.setFillColor(...brandOrange);
  doc.rect(0, 37, pageWidth, 2, 'F');

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('GIGAPRINT', margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  doc.text('Tus ideas en grande · Publicidad & Gran Formato', margin, 24);
  doc.text('RUC: 0993356678001 · Matriz: Av. García Moreno y 9 de Octubre, Milagro, Guayas', margin, 29);

  // Right-aligned Document Tag
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...brandOrange);
  doc.text('PROFORMA COMERCIAL', pageWidth - margin, 17, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`N°: ${folio}`, pageWidth - margin, 24, { align: 'right' });

  const todayStr = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
  const validUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text(`Fecha: ${todayStr} · Validez: ${validUntil} (15 días)`, pageWidth - margin, 29, { align: 'right' });

  let y = 48;

  // 2. Client & Document Info Box
  doc.setFillColor(...brandLight);
  doc.roundedRect(margin, y, contentWidth, 26, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...brandDark);
  doc.text('DATOS DEL CLIENTE / EMPRESA', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textDark);

  const clientName = client.name || 'Cliente Particular';
  const clientPhone = client.phone || 'No especificado';
  const clientCity = client.city || 'Milagro / Guayas';
  const clientCompany = client.company || 'Venta directa';

  doc.text(`Nombre / Razón Social:`, margin + 4, y + 13);
  doc.setFont('helvetica', 'bold');
  doc.text(clientName, margin + 40, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.text(`Teléfono / WhatsApp:`, margin + 4, y + 19);
  doc.setFont('helvetica', 'bold');
  doc.text(clientPhone, margin + 40, y + 19);

  doc.setFont('helvetica', 'normal');
  doc.text(`Ciudad / Destino:`, margin + (contentWidth / 2) + 4, y + 13);
  doc.setFont('helvetica', 'bold');
  doc.text(clientCity, margin + (contentWidth / 2) + 32, y + 13);

  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa / Proyecto:`, margin + (contentWidth / 2) + 4, y + 19);
  doc.setFont('helvetica', 'bold');
  doc.text(clientCompany, margin + (contentWidth / 2) + 32, y + 19);

  y += 34;

  // 3. Items Table Header
  doc.setFillColor(...brandDark);
  doc.rect(margin, y, contentWidth, 7.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);

  doc.text('ÍTEM / ESPECIFICACIÓN TÉCNICA', margin + 3, y + 5);
  doc.text('CANT.', margin + 105, y + 5, { align: 'center' });
  doc.text('P. UNIT.', margin + 135, y + 5, { align: 'right' });
  doc.text('SUBTOTAL', pageWidth - margin - 3, y + 5, { align: 'right' });

  y += 7.5;

  // 4. Render Table Rows
  const safeItems = items.length > 0 ? items : [{
    name: 'Cotización Personalizada',
    variant: 'Especificaciones estándar',
    quantity: 1,
    price: totals.total || 0,
    total: totals.total || 0
  }];

  safeItems.forEach((item, index) => {
    const isEven = index % 2 === 0;
    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentWidth, 14, 'F');
    }

    doc.setDrawColor(230, 230, 230);
    doc.line(margin, y + 14, pageWidth - margin, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...brandDark);
    const itemName = item.name || 'Producto Publicitario';
    doc.text(itemName.substring(0, 55), margin + 3, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...brandGray);
    const variantDesc = item.variant || item.category || 'Especificaciones estándar';
    doc.text(variantDesc.substring(0, 75), margin + 3, y + 10);

    const qty = item.quantity || 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...textDark);
    doc.text(String(qty), margin + 105, y + 7, { align: 'center' });

    const unitPrice = Number(item.price || (item.total ? item.total / qty : 0)).toFixed(2);
    doc.setFont('helvetica', 'normal');
    doc.text(`$${unitPrice}`, margin + 135, y + 7, { align: 'right' });

    const rowTotal = Number(item.total || (qty * Number(unitPrice))).toFixed(2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...brandDark);
    doc.text(`$${rowTotal}`, pageWidth - margin - 3, y + 7, { align: 'right' });

    y += 14;
  });

  y += 4;

  // 5. Delivery Speed & Shipping info block (Left) + Totals Box (Right)
  const totalsBoxWidth = 72;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;

  // Left Info / Terms
  const leftInfoWidth = contentWidth - totalsBoxWidth - 8;
  doc.setFillColor(...brandLight);
  doc.roundedRect(margin, y, leftInfoWidth, 42, 2.5, 2.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...brandDark);
  doc.text('CONDICIONES COMERCIALES Y TIEMPOS:', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...textDark);

  const speedLabel = deliverySpeed === 'same_day'
    ? 'URGENTE MISMO DÍA (Entrega en el día)'
    : deliverySpeed === 'express'
      ? 'EXPRESS 24 HORAS (Entrega día siguiente)'
      : 'ESTÁNDAR (2 a 3 días laborables)';

  doc.text(`• Tiempo de Producción: ${speedLabel}`, margin + 4, y + 12);
  doc.text('• Forma de Pago: 50% anticipo para iniciar producción, 50% contra entrega.', margin + 4, y + 18);
  doc.text('• Facturación: Precios incluyen IVA 15% SRI con emisión electrónica inmediata.', margin + 4, y + 24);
  doc.text('• Cuentas: Banco Pichincha Cta. Cte. 2100234567 / Banco Guayaquil Cta. 12987654.', margin + 4, y + 30);
  doc.text('• Garantía: Tintas eco-solventes y UV con resistencia a exteriores e intemperie.', margin + 4, y + 36);

  // Right Totals
  const subtotal = Number(totals.subtotal || totals.total / 1.15 || 0).toFixed(2);
  const tax = Number(totals.taxAmount || (Number(totals.total) - Number(subtotal)) || 0).toFixed(2);
  const total = Number(totals.total || (Number(subtotal) + Number(tax))).toFixed(2);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(220, 220, 220);
  doc.roundedRect(totalsBoxX, y, totalsBoxWidth, 42, 2.5, 2.5, 'FD');

  let ty = y + 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...brandGray);
  doc.text('Subtotal Neto:', totalsBoxX + 4, ty);
  doc.setTextColor(...textDark);
  doc.text(`$${subtotal}`, pageWidth - margin - 4, ty, { align: 'right' });

  ty += 7;
  doc.setTextColor(...brandGray);
  doc.text('IVA SRI (15%):', totalsBoxX + 4, ty);
  doc.setTextColor(...textDark);
  doc.text(`$${tax}`, pageWidth - margin - 4, ty, { align: 'right' });

  if (shippingOption && shippingOption.price > 0) {
    ty += 7;
    doc.setTextColor(...brandGray);
    doc.text(`Envío (${shippingOption.name}):`, totalsBoxX + 4, ty);
    doc.setTextColor(...textDark);
    doc.text(`+$${Number(shippingOption.price).toFixed(2)}`, pageWidth - margin - 4, ty, { align: 'right' });
  }

  ty += 8;
  doc.setFillColor(...brandOrange);
  doc.rect(totalsBoxX, ty - 5, totalsBoxWidth, 12, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL A PAGAR:', totalsBoxX + 4, ty + 2);
  doc.text(`$${total}`, pageWidth - margin - 4, ty + 2, { align: 'right' });

  // 6. Notes if any
  if (notes) {
    y += 46;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...brandGray);
    doc.text(`Nota del cliente: "${notes.substring(0, 140)}"`, margin, y);
  }

  // 7. Footer
  const footerY = pageHeight - 12;
  doc.setDrawColor(230, 230, 230);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...brandGray);
  doc.text('Gigaprint Publicidad & Gigantografías · www.gigaprint.ec · WhatsApp: +593 98 765 4321', margin, footerY);
  doc.text('Documento informativo sin valor tributario directo · La factura electrónica oficial se emite al confirmar pago.', pageWidth - margin, footerY, { align: 'right' });

  // 8. Trigger Download
  const filename = `Proforma_${folio}_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
