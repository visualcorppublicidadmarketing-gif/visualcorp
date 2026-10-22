/**
 * GIGAPRINT - SRI ELECTRONIC INVOICING ENGINE (ECUADOR)
 * Conforms to SRI Technical Specification for Comprobantes Electrónicos v2.1.0 (IVA 15%)
 */

// SRI Environment: 1 = Pruebas / Sandbox, 2 = Producción
export const SRI_CONFIG = {
  ruc: '0992345678001',
  razonSocial: 'GIGAPRINT PUBLICIDAD & IMPRESIÓN S.A.S.',
  nombreComercial: 'GIGAPRINT',
  dirMatriz: 'Av. García Moreno y 9 de Octubre, Milagro, Guayas - Ecuador',
  dirEstablecimiento: 'Av. García Moreno y 9 de Octubre, Milagro, Guayas - Ecuador',
  codEstablecimiento: '001',
  codPuntoEmision: '001',
  contribuyenteEspecial: '',
  obligadoContabilidad: 'SI',
  ambiente: '1', // '1' = Pruebas, '2' = Producción
  tipoEmision: '1', // '1' = Normal
  tarifaIVA: 15.00,
  codigoPorcentajeIVA: '4' // 4 = 15% IVA vigente en Ecuador
};

/**
 * Modulo 11 Algorithm (Official SRI Verification Digit Calculation)
 * @param {string} digits48 - 48 digits string
 * @returns {number} Verification digit (0-9)
 */
export function calculateModulo11(digits48) {
  let factor = 2;
  let sum = 0;
  for (let i = digits48.length - 1; i >= 0; i--) {
    sum += parseInt(digits48.charAt(i), 10) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const remainder = sum % 11;
  const result = 11 - remainder;
  if (result === 11) return 0;
  if (result === 10) return 1;
  return result;
}

/**
 * Generate official 49-digit SRI Access Key (Clave de Acceso)
 * Structure:
 * 1. Fecha de Emisión (8d: DDMMAAAA)
 * 2. Tipo de Comprobante (2d: 01 = Factura, 04 = Nota de Crédito, 05 = Nota de Débito, 06 = Guía de Remisión, 07 = Retención)
 * 3. Número de RUC (13d)
 * 4. Tipo de Ambiente (1d: 1 = Pruebas, 2 = Producción)
 * 5. Serie (Establecimiento 3d + Punto Emisión 3d: 001001)
 * 6. Número Secuencial (9d)
 * 7. Código Numérico Aleatorio (8d)
 * 8. Tipo de Emisión (1d: 1 = Normal)
 * 9. Dígito Verificador (1d: Módulo 11)
 */
export function generateSRIAccessKey({
  date = new Date(),
  tipoComprobante = '01',
  ruc = SRI_CONFIG.ruc,
  ambiente = SRI_CONFIG.ambiente,
  establecimiento = SRI_CONFIG.codEstablecimiento,
  puntoEmision = SRI_CONFIG.codPuntoEmision,
  secuencial = '000000001',
  codigoNumerico = '12345678',
  tipoEmision = SRI_CONFIG.tipoEmision
}) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear());
  const fechaEmision = `${day}${month}${year}`;

  const cleanSecuencial = String(secuencial).padStart(9, '0');
  const cleanCodigoNum = String(codigoNumerico).padStart(8, '0');
  const serie = `${establecimiento}${puntoEmision}`;

  const partialKey = `${fechaEmision}${tipoComprobante}${ruc}${ambiente}${serie}${cleanSecuencial}${cleanCodigoNum}${tipoEmision}`;
  const verificador = calculateModulo11(partialKey);

  return `${partialKey}${verificador}`;
}

/**
 * Validate Ecuadorian RUC or Cédula using Modulo 10 algorithm
 */
export function validateEcuadorianID(idNumber) {
  const clean = String(idNumber || '').trim();
  if (clean === '9999999999999') return { valid: true, type: '07', label: 'Consumidor Final' };
  
  if (clean.length === 10) {
    // Cédula validation Modulo 10
    const province = parseInt(clean.substring(0, 2), 10);
    if (province < 1 || province > 24) return { valid: false, error: 'Código de provincia inválido' };
    const thirdDigit = parseInt(clean.charAt(2), 10);
    if (thirdDigit >= 6) return { valid: false, error: 'Tercer dígito no corresponde a persona natural' };

    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let val = parseInt(clean.charAt(i), 10);
      if (i % 2 === 0) {
        val *= 2;
        if (val > 9) val -= 9;
      }
      sum += val;
    }
    const verifier = (10 - (sum % 10)) % 10;
    if (verifier === parseInt(clean.charAt(9), 10)) {
      return { valid: true, type: '05', label: 'Cédula de Identidad' };
    }
    return { valid: false, error: 'Dígito verificador de cédula incorrecto' };
  }

  if (clean.length === 13) {
    if (clean.endsWith('001')) {
      return { valid: true, type: '04', label: 'RUC' };
    }
    return { valid: false, error: 'El RUC debe terminar en 001' };
  }

  return { valid: true, type: '06', label: 'Pasaporte / Identificación Extranjera' };
}

/**
 * Build official SRI Factura XML String conforming to schema v2.1.0
 */
export function buildSRIFacturaXML({
  order,
  items = [],
  customer,
  secuencial = '000000001',
  claveAcceso
}) {
  const d = new Date(order.orderDate || new Date());
  const fechaEmision = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  
  const idValidation = validateEcuadorianID(order.customerIdentification);
  const tipoIdentificacionComprador = idValidation.type;
  const razonSocialComprador = (order.customerName || 'CONSUMIDOR FINAL').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const identificacionComprador = order.customerIdentification || '9999999999999';

  const hasIVA = Number(order.taxRate || 0) > 0 || Number(order.taxAmount || 0) > 0;
  const totalSinImpuestos = Number(order.subtotal || 0).toFixed(2);
  const totalDescuento = Number(order.discountAmount || 0).toFixed(2);
  const valorIVA = Number(order.taxAmount || 0).toFixed(2);
  const importeTotal = Number(order.totalAmount || 0).toFixed(2);

  // Group bases by 15% and 0%
  const baseImponible15 = hasIVA ? (Number(order.subtotal || 0) - Number(order.discountAmount || 0)).toFixed(2) : '0.00';
  const baseImponible0 = !hasIVA ? (Number(order.subtotal || 0) - Number(order.discountAmount || 0)).toFixed(2) : '0.00';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<factura id="comprobante" version="2.1.0">\n`;
  
  // infoTributaria
  xml += `  <infoTributaria>\n`;
  xml += `    <ambiente>${SRI_CONFIG.ambiente}</ambiente>\n`;
  xml += `    <tipoEmision>${SRI_CONFIG.tipoEmision}</tipoEmision>\n`;
  xml += `    <razonSocial>${SRI_CONFIG.razonSocial}</razonSocial>\n`;
  xml += `    <nombreComercial>${SRI_CONFIG.nombreComercial}</nombreComercial>\n`;
  xml += `    <ruc>${SRI_CONFIG.ruc}</ruc>\n`;
  xml += `    <claveAcceso>${claveAcceso}</claveAcceso>\n`;
  xml += `    <codDoc>01</codDoc>\n`;
  xml += `    <estab>${SRI_CONFIG.codEstablecimiento}</estab>\n`;
  xml += `    <ptoEmi>${SRI_CONFIG.codPuntoEmision}</ptoEmi>\n`;
  xml += `    <secuencial>${String(secuencial).padStart(9, '0')}</secuencial>\n`;
  xml += `    <dirMatriz>${SRI_CONFIG.dirMatriz}</dirMatriz>\n`;
  xml += `  </infoTributaria>\n`;

  // infoFactura
  xml += `  <infoFactura>\n`;
  xml += `    <fechaEmision>${fechaEmision}</fechaEmision>\n`;
  xml += `    <dirEstablecimiento>${SRI_CONFIG.dirEstablecimiento}</dirEstablecimiento>\n`;
  xml += `    <obligadoContabilidad>${SRI_CONFIG.obligadoContabilidad}</obligadoContabilidad>\n`;
  xml += `    <tipoIdentificacionComprador>${tipoIdentificacionComprador}</tipoIdentificacionComprador>\n`;
  xml += `    <razonSocialComprador>${razonSocialComprador}</razonSocialComprador>\n`;
  xml += `    <identificacionComprador>${identificacionComprador}</identificacionComprador>\n`;
  xml += `    <totalSinImpuestos>${totalSinImpuestos}</totalSinImpuestos>\n`;
  xml += `    <totalDescuento>${totalDescuento}</totalDescuento>\n`;
  xml += `    <totalConImpuestos>\n`;

  if (hasIVA && Number(baseImponible15) > 0) {
    xml += `      <totalImpuesto>\n`;
    xml += `        <codigo>2</codigo>\n`; // 2 = IVA
    xml += `        <codigoPorcentaje>${SRI_CONFIG.codigoPorcentajeIVA}</codigoPorcentaje>\n`; // 4 = 15%
    xml += `        <baseImponible>${baseImponible15}</baseImponible>\n`;
    xml += `        <tarifa>${SRI_CONFIG.tarifaIVA}</tarifa>\n`;
    xml += `        <valor>${valorIVA}</valor>\n`;
    xml += `      </totalImpuesto>\n`;
  }

  if (!hasIVA || Number(baseImponible0) > 0) {
    xml += `      <totalImpuesto>\n`;
    xml += `        <codigo>2</codigo>\n`;
    xml += `        <codigoPorcentaje>0</codigoPorcentaje>\n`; // 0 = 0% IVA
    xml += `        <baseImponible>${baseImponible0}</baseImponible>\n`;
    xml += `        <tarifa>0.00</tarifa>\n`;
    xml += `        <valor>0.00</valor>\n`;
    xml += `      </totalImpuesto>\n`;
  }

  xml += `    </totalConImpuestos>\n`;
  xml += `    <propina>0.00</propina>\n`;
  xml += `    <importeTotal>${importeTotal}</importeTotal>\n`;
  xml += `    <moneda>DOLAR</moneda>\n`;
  xml += `    <pagos>\n`;
  xml += `      <pago>\n`;
  xml += `        <formaPago>01</formaPago>\n`; // 01 = Sin utilización del sistema financiero
  xml += `        <total>${importeTotal}</total>\n`;
  xml += `      </pago>\n`;
  xml += `    </pagos>\n`;
  xml += `  </infoFactura>\n`;

  // detalles
  xml += `  <detalles>\n`;
  items.forEach((it, idx) => {
    const itemTotal = Number(it.totalPrice || it.total_price || 0).toFixed(2);
    const itemUnitPrice = Number(it.unitPrice || it.unit_price || itemTotal).toFixed(2);
    const itemQty = Number(it.quantity || 1).toFixed(2);
    const desc = (it.productName || it.product_name || 'Servicio Gráfico').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const itemIVA = hasIVA ? (Number(itemTotal) * 0.15).toFixed(2) : '0.00';
    const itemCodIVA = hasIVA ? SRI_CONFIG.codigoPorcentajeIVA : '0';
    const itemTarifaIVA = hasIVA ? SRI_CONFIG.tarifaIVA : '0.00';

    xml += `    <detalle>\n`;
    xml += `      <codigoPrincipal>GIGA-${idx + 1}</codigoPrincipal>\n`;
    xml += `      <descripcion>${desc}</descripcion>\n`;
    xml += `      <cantidad>${itemQty}</cantidad>\n`;
    xml += `      <precioUnitario>${itemUnitPrice}</precioUnitario>\n`;
    xml += `      <descuento>0.00</descuento>\n`;
    xml += `      <precioTotalSinImpuesto>${itemTotal}</precioTotalSinImpuesto>\n`;
    xml += `      <impuestos>\n`;
    xml += `        <impuesto>\n`;
    xml += `          <codigo>2</codigo>\n`;
    xml += `          <codigoPorcentaje>${itemCodIVA}</codigoPorcentaje>\n`;
    xml += `          <tarifa>${itemTarifaIVA}</tarifa>\n`;
    xml += `          <baseImponible>${itemTotal}</baseImponible>\n`;
    xml += `          <valor>${itemIVA}</valor>\n`;
    xml += `        </impuesto>\n`;
    xml += `      </impuestos>\n`;
    xml += `    </detalle>\n`;
  });
  xml += `  </detalles>\n`;

  // infoAdicional
  xml += `  <infoAdicional>\n`;
  xml += `    <campoAdicional nombre="Email">${customer?.email || 'facturacion@gigaprint.ec'}</campoAdicional>\n`;
  xml += `    <campoAdicional nombre="Telefono">${order.customerPhone || '0990000000'}</campoAdicional>\n`;
  xml += `    <campoAdicional nombre="Direccion">${customer?.address || 'Milagro, Ecuador'}</campoAdicional>\n`;
  xml += `    <campoAdicional nombre="Trabajo">${order.jobName || 'Publicidad y Gran Formato'}</campoAdicional>\n`;
  xml += `  </infoAdicional>\n`;

  xml += `</factura>`;
  return xml;
}

/**
 * Simulate SRI Electronic Authorization response
 */
export function simulateSRIAuthorization({ claveAcceso, secuencial }) {
  const now = new Date();
  const authDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  return {
    estado: 'AUTORIZADO',
    numeroAutorizacion: claveAcceso,
    fechaAutorizacion: authDate,
    ambiente: SRI_CONFIG.ambiente === '1' ? 'PRUEBAS' : 'PRODUCCION',
    comprobante: `001-001-${String(secuencial).padStart(9, '0')}`,
    mensajes: []
  };
}
