import { supabase, hasSupabase } from './supabase';
import { estebanCatalogProducts, imageFor } from '../catalog';
import { buildProductionPlan, recalculateOperationReadiness, PRODUCTION_AREAS } from './productionWorkflow';
import { findExactPOSCustomer } from './posSearch';
import { extractGoogleMapsCoordinates } from './maps';

export const POS_STORAGE_KEY = 'gigaprint-pos-v1';
export const POS_SESSION_KEY = 'gigaprint-pos-session-v1';
export const POS_ACCESS_TOKEN_KEY = 'gigaprint-pos-access-token-v1';
export const POS_DEVICE_ID_KEY = 'gigaprint-pos-device-id-v1';

export const DAYS_SPANISH = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Production Kanban Stages Definition
export const PRODUCTION_STAGES = [
  { id: 'preprensa', label: 'Pre-prensa / Diseño', icon: 'Layout', color: '#6366f1', description: 'Revisión técnica, medidas y preparación de archivos' },
  { id: 'aprobacion_arte', label: 'Aprobación de Arte', icon: 'Eye', color: '#f59e0b', description: 'Enviado al cliente para visto bueno' },
  { id: 'impresion', label: 'Cola de Impresión', icon: 'Printer', color: '#3b82f6', description: 'En máquina / RIP de impresión' },
  { id: 'acabados', label: 'Acabados & Confección', icon: 'Scissors', color: '#8b5cf6', description: 'Ojales, dobladillos, laminado, corte o estructura' },
  { id: 'control_calidad', label: 'Control de Calidad', icon: 'CheckSquare', color: '#ec4899', description: 'Inspección visual y embalaje' },
  { id: 'listo', label: 'Listo para Entrega', icon: 'Package', color: '#10b981', description: 'Listo en mostrador o para despacho' },
  { id: 'entregado', label: 'Entregado / Despachado', icon: 'CheckCircle2', color: '#059669', description: 'Cliente recibió el trabajo a satisfacción' }
];

// Helper to format ISO date to YYYY-MM-DD
export function toISODate(date = new Date()) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

// Helper to get day name in Spanish
export function getDayNameSpanish(dateStr) {
  if (!dateStr) return 'lunes';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return DAYS_SPANISH[date.getDay()] || 'lunes';
}

// Helper to get Monday of the current or given week
export function getMondayOfWeek(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return toISODate(monday);
}

// Helper to calculate ISO Week code (e.g., 2026-W34)
export function getISOWeekCode(d = new Date()) {
  const date = new Date(d);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `${target.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Helper to generate deterministic weekly 4-digit PIN per advisor
export function generateAdvisorWeeklyPin(advisorId, weekCode) {
  let hash = 0;
  const str = `${advisorId}:${weekCode}:gigaprint2026`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const pinNum = 100000 + (positive % 900000);
  return String(pinNum);
}

// Helper to generate readable weekly password
export function generateAdvisorWeeklyPassword(advisorName, pin) {
  const clean = advisorName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${clean || 'asesora'}-${pin}`;
}

// Helper to rotate advisor credentials on Monday
export function rotateAdvisorsCredentials(advisors = [], force = false, targetDate = new Date()) {
  const currentWeek = getISOWeekCode(targetDate);
  const monday = getMondayOfWeek(targetDate);

  return advisors.map((adv) => {
    if (!getRoleCapabilities(adv.role).canOpenCash) return adv;
    if (adv.currentWeekCode !== currentWeek || force || !adv.weeklyPin || String(adv.weeklyPin).length < 6) {
      const pin = force
        ? String(Math.floor(100000 + Math.random() * 900000))
        : generateAdvisorWeeklyPin(adv.id, currentWeek);
      const password = generateAdvisorWeeklyPassword(adv.name, pin);
      return {
        ...adv,
        pin,
        weeklyPin: pin,
        weeklyPassword: password,
        currentWeekCode: currentWeek,
        pinLastRotatedAt: monday
      };
    }
    return adv;
  });
}

// Helper to format all credentials into WhatsApp/copyable text
export function formatWeeklyCredentialsForWhatsApp(advisors = []) {
  const weekCode = getISOWeekCode();
  const monday = getMondayOfWeek();
  const activeAdvisors = advisors.filter((a) => a.isActive !== false && getRoleCapabilities(a.role).canOpenCash);

  let text = `🔐 *GIGAPRINT — CREDENCIALES SEMANALES DE PUNTO DE VENTA (POS)*\n`;
  text += `📅 *Semana:* ${weekCode} (Válidas desde Lun ${monday})\n`;
  text += `-------------------------------------------\n\n`;

  activeAdvisors.forEach((adv, index) => {
    text += `👤 *Caja ${index + 1}: ${adv.name}*\n`;
    text += `   • PIN de Caja (6 dígitos): *${adv.weeklyPin || adv.pin || '123456'}*\n`;
    text += `   • Clave: *${adv.weeklyPassword || `${adv.name.toLowerCase()}-123456`}*\n`;
    if (getRoleCapabilities(adv.role).hasSalesGoal) text += `   • Meta Semanal: $${Number(adv.weeklyGoal || 0).toFixed(2)}\n`;
    text += '\n';
  });
  text += `-------------------------------------------\n`;
  text += `⚠️ *Aviso:* Las credenciales se renuevan automáticamente cada LUNES a las 00:00 para control y seguridad de las ventas.`;
  return text;
}

export const formatWeeklyCredentialsText = formatWeeklyCredentialsForWhatsApp;

export const SYSTEM_ROLES = [
  { id: 'super_admin', label: '⭐ Superadministrador', area: 'gerencia', color: '#c2410c' },
  { id: 'admin', label: '👑 Administrador General', area: 'gerencia', color: '#ea580c' },
  { id: 'encargado_local', label: '🏬 Encargado de Local', area: 'sucursal', color: '#d97706' },
  { id: 'coordinador_taller', label: '📋 Coordinador/a de Taller', area: 'taller', color: '#6366f1' },
  { id: 'disenador', label: '🎨 Diseñador/a', area: 'diseno', color: '#7c3aed' },
  { id: 'operador_impresion', label: '🖨️ Operador Impresión (Gran Formato & Digital)', area: 'impresion', color: '#3b82f6' },
  { id: 'operador_sublimacion', label: '👕 Operador Sublimación & Textil DTF', area: 'sublimacion', color: '#ec4899' },
  { id: 'operador_corte_laser', label: '⚡ Operador Corte Láser & CNC', area: 'corte_laser', color: '#8b5cf6' },
  { id: 'operador_taller', label: '🔧 Operador/a de Taller y Armado', area: 'taller', color: '#ea580c' },
  { id: 'instalador', label: '🚚 Instalador/a', area: 'entrega', color: '#334155' },
  { id: 'asesora', label: '💼 Asesora Comercial & Caja', area: 'ventas', color: '#10b981' }
];

export function getRoleCapabilities(role = 'asesora') {
  const normalizedRole = role || 'asesora';
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'super_admin';
  const canOpenCash = isAdmin || normalizedRole === 'asesora';
  const hasSalesGoal = normalizedRole === 'asesora';
  const maxDiscountPercent = isAdmin ? 100 : normalizedRole === 'encargado_local' ? 15 : normalizedRole === 'asesora' ? 5 : 0;
  const roleWorkspaces = {
    asesora: ['cashier', 'crm', 'orders', 'products'],
    encargado_local: ['billboard', 'flow', 'kanban', 'orders', 'inventory', 'purchases', 'products', 'crm'],
    coordinador_taller: ['billboard', 'flow', 'stations', 'kanban', 'orders', 'inventory'],
    disenador: ['flow', 'kanban'],
    operador_impresion: ['flow', 'stations'],
    operador_sublimacion: ['flow', 'stations'],
    operador_corte_laser: ['flow', 'stations'],
    operador_taller: ['flow', 'kanban'],
    instalador: ['flow', 'kanban'],
  };
  const roleAreas = {
    encargado_local: ['calidad', 'entrega'],
    coordinador_taller: ['diseno', 'aprobacion', 'impresion', 'corte_laser', 'sublimacion', 'taller', 'calidad', 'entrega'],
    disenador: ['diseno', 'aprobacion'],
    operador_impresion: ['impresion'],
    operador_sublimacion: ['sublimacion'],
    operador_corte_laser: ['corte_laser'],
    operador_taller: ['taller', 'calidad'],
    instalador: ['entrega'],
    asesora: ['asesoria'],
  };
  const allowedTabs = isAdmin
    ? ['cashier', 'flow', 'billboard', 'stations', 'kanban', 'crm', 'products', 'orders', 'inventory', 'purchases', 'weekly', 'expenses', 'advisors']
    : (roleWorkspaces[normalizedRole] || ['flow']);
  const defaultTabs = {
    asesora: 'cashier', encargado_local: 'billboard', coordinador_taller: 'billboard', disenador: 'flow',
    operador_impresion: 'stations', operador_sublimacion: 'stations', operador_corte_laser: 'stations',
    operador_taller: 'flow', instalador: 'flow', admin: 'cashier', super_admin: 'cashier',
  };
  return {
    isAdmin,
    isStoreManager: normalizedRole === 'encargado_local' || isAdmin,
    isWorkshopCoordinator: normalizedRole === 'coordinador_taller' || isAdmin,
    isDesigner: normalizedRole === 'disenador' || isAdmin,
    isPrintOperator: normalizedRole === 'operador_impresion' || normalizedRole === 'coordinador_taller' || isAdmin,
    isSublimationOperator: normalizedRole === 'operador_sublimacion' || normalizedRole === 'coordinador_taller' || isAdmin,
    isLaserOperator: normalizedRole === 'operador_corte_laser' || normalizedRole === 'coordinador_taller' || isAdmin,
    isAdvisor: normalizedRole === 'asesora' || isAdmin,
    canOpenCash,
    hasSalesGoal,
    maxDiscountPercent,
    canManageCash: isAdmin,
    canEditMasterCatalog: ['encargado_local'].includes(normalizedRole) || isAdmin,
    canManageExpenses: isAdmin,
    canCreatePurchaseOrders: ['encargado_local'].includes(normalizedRole) || isAdmin,
    canAuditCash: isAdmin,
    canDispatchWorkshop: ['coordinador_taller', 'encargado_local'].includes(normalizedRole) || isAdmin,
    canManageAssignments: normalizedRole === 'coordinador_taller' || isAdmin,
    allowedTabs,
    defaultTab: defaultTabs[normalizedRole] || 'flow',
    managedAreas: isAdmin ? PRODUCTION_AREAS.map((area) => area.id) : (roleAreas[normalizedRole] || []),
  };
}

export const DEFAULT_WORKSTATIONS = [
  { id: 'ws-flora-320', code: 'FLORA-01', name: 'Plotter Flora Solvente 3.20m', area: 'impresion', model: 'Flora LJ-320P', maxWidthM: 3.20, status: 'active', notes: 'Cabezales Konica 512i alta velocidad para lonas.' },
  { id: 'ws-roland-160', code: 'ROLAND-01', name: 'Plotter Roland TrueVIS 1.60m', area: 'impresion', model: 'TrueVIS VG3-640', maxWidthM: 1.60, status: 'active', notes: 'Tinta eco-solvente para viniles y adhesivos.' },
  { id: 'ws-prensa-dtf', code: 'DTF-01', name: 'Plotter Textil DTF 60cm', area: 'sublimacion', model: 'DTF Pro 60', maxWidthM: 0.60, status: 'active', notes: 'Impresión y poliamida para prendas textiles.' },
  { id: 'ws-plancha-neum', code: 'HEAT-01', name: 'Plancha Térmica Neumática 40x60', area: 'sublimacion', model: 'HeatPress Auto 4060', maxWidthM: 0.60, status: 'active', notes: 'Planchado de camisetas y almohadas a 180°C-200°C.' },
  { id: 'ws-laser-co2', code: 'LASER-01', name: 'Cortadora Láser CO2 130W 130x90', area: 'corte_laser', model: 'RedSail 1390 CO2', maxWidthM: 1.30, status: 'active', notes: 'Corte y grabado de acrílico, MDF y Sintra.' },
  { id: 'ws-router-cnc', code: 'CNC-01', name: 'Ruteadora CNC 1.30x2.50m', area: 'corte_laser', model: 'CNC HeavyDuty 1325', maxWidthM: 1.30, status: 'active', notes: 'Corte de PVC espumado, Alucobond y madera.' }
];

// Default initial advisors with 6-digit PINs & multi-role support
export const DEFAULT_ADVISORS = [
  // Encargado de Local
  { id: 'adv-encargado', name: 'Esteban (Encargado Local)', email: 'esteban@gigaprint.ec', pin: '654321', weeklyPin: '654321', weeklyPassword: 'esteban-654321', phone: '0990000100', role: 'encargado_local', assignedArea: 'sucursal', weeklyGoal: 0, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  // Coordinador de Taller
  { id: 'adv-coordinador', name: 'Mauricio (Coordinador Taller)', email: 'taller@gigaprint.ec', pin: '456789', weeklyPin: '456789', weeklyPassword: 'taller-456789', phone: '0990000101', role: 'coordinador_taller', assignedArea: 'taller', weeklyGoal: 0, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  // Operadores de Estaciones
  { id: 'adv-carlos-print', name: 'Carlos M. (Impresión)', email: 'carlos.print@gigaprint.ec', pin: '112233', weeklyPin: '112233', weeklyPassword: 'carlos-112233', phone: '0990000102', role: 'operador_impresion', assignedArea: 'impresion', weeklyGoal: 0, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-anita-subli', name: 'Anita R. (Sublimación & DTF)', email: 'anita.textil@gigaprint.ec', pin: '223344', weeklyPin: '223344', weeklyPassword: 'anita-223344', phone: '0990000103', role: 'operador_sublimacion', assignedArea: 'sublimacion', weeklyGoal: 0, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-jorge-laser', name: 'Jorge L. (Corte Láser & CNC)', email: 'jorge.laser@gigaprint.ec', pin: '334455', weeklyPin: '334455', weeklyPassword: 'jorge-334455', phone: '0990000104', role: 'operador_corte_laser', assignedArea: 'corte_laser', weeklyGoal: 0, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  // Asesoras Comerciales
  { id: 'adv-vicky', name: 'Vicky', email: 'vicky@gigaprint.ec', pin: '842190', weeklyPin: '842190', weeklyPassword: 'vicky-842190', phone: '0990000001', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3200, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-karla', name: 'Karla', email: 'karla@gigaprint.ec', pin: '395214', weeklyPin: '395214', weeklyPassword: 'karla-395214', phone: '0990000002', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3200, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-mariela', name: 'Mariela', email: 'mariela@gigaprint.ec', pin: '618472', weeklyPin: '618472', weeklyPassword: 'mariela-618472', phone: '0990000003', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3200, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-karen', name: 'Karen', email: 'karen@gigaprint.ec', pin: '749153', weeklyPin: '749153', weeklyPassword: 'karen-749153', phone: '0990000004', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3200, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-amy', name: 'Amy', email: 'amy@gigaprint.ec', pin: '283506', weeklyPin: '283506', weeklyPassword: 'amy-283506', phone: '0990000005', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3200, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-fernando', name: 'Fernando', email: 'fernando@gigaprint.ec', pin: '916328', weeklyPin: '916328', weeklyPassword: 'fernando-916328', phone: '0990000006', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3200, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() },
  { id: 'adv-otros', name: 'Ventas Externas / Otros', email: 'externas@gigaprint.ec', pin: '530841', weeklyPin: '530841', weeklyPassword: 'ventas-530841', phone: '0990000007', role: 'asesora', assignedArea: 'ventas', weeklyGoal: 3500, isActive: true, currentWeekCode: getISOWeekCode(), pinLastRotatedAt: getMondayOfWeek() }
];

// Default Customers with rich CRM metadata
export const DEFAULT_CUSTOMERS = [
  { id: 'cust-1', name: 'Agrofunción', identification: '0990012345001', phone: '0987654321', email: 'agrofuncion@gmail.com', city: 'Milagro', address: 'Av. 17 de Septiembre', companyName: 'Agrofunción S.A.', isVip: true, creditLimit: 2500, creditDays: 15, tags: ['Empresarial', 'Factura', 'Crédito 15d'], notes: 'Solicita siempre lonas con dobladillo y ojales reforzados cada 30cm.' },
  { id: 'cust-2', name: 'Mauro Peñafiel', identification: '0912345678', phone: '0991234567', email: 'mauro.p@hotmail.com', city: 'Milagro', address: 'Cdla. Los Vergeles', companyName: '', isVip: false, creditLimit: 500, creditDays: 0, tags: ['Frecuente', 'Viniles'], notes: 'Prefiere vinil brillante con laminado mate.' },
  { id: 'cust-3', name: 'Jhony Gaspar', identification: '0923456789', phone: '0983456789', email: 'jgaspar@gmail.com', city: 'Milagro', address: 'Sector Centro', companyName: 'Gaspar Publicidad', isVip: true, creditLimit: 1500, creditDays: 30, tags: ['Agencia', 'Mayorista'], notes: 'Diseñador independiente, envía artes listos en PDF.' },
  { id: 'cust-4', name: 'Juan Carlos', identification: '0909876543', phone: '0978901234', email: 'jc@outlook.com', city: 'Milagro', address: 'Av. Los Chirijos', companyName: '', isVip: false, creditLimit: 300, creditDays: 0, tags: ['Puntual'], notes: 'Paga 100% por transferencia antes de retirar.' },
  { id: 'cust-5', name: 'Melissa Andrade', identification: '0918293041', phone: '0998765432', email: 'melissa.a@gmail.com', city: 'Milagro', address: 'Cdla. Las Piñas', companyName: 'Eventos & Bodas', isVip: false, creditLimit: 600, creditDays: 0, tags: ['Eventos', 'Roll-Ups'], notes: 'Pide respaldos de estructura de araña y roll-up.' },
  { id: 'cust-6', name: 'Escuela El Rosario', identification: '0992345678001', phone: '042711234', email: 'elrosario@edu.ec', city: 'Milagro', address: 'Sector La Pradera', companyName: 'U.E. El Rosario', isVip: true, creditLimit: 3000, creditDays: 30, tags: ['Institución', 'Factura'], notes: 'Requiere comprobante de retención y orden de compra formal.' },
  { id: 'cust-7', name: 'Karen Rodas', identification: '0929485721', phone: '0961234567', email: 'karen.r@gmail.com', city: 'Milagro', address: 'Sector San Miguel', companyName: '', isVip: false, creditLimit: 400, creditDays: 0, tags: ['Rótulos'], notes: 'Cotizaciones de letras 3D y acrílico.' }
];

// Default Initial Products (derived from catalog)
export const DEFAULT_PRODUCTS = estebanCatalogProducts.map((p, idx) => ({
  id: p.id || `prod-${idx + 1}`,
  sku: `GIGA-${String(idx + 1).padStart(3, '0')}`,
  name: p.name,
  category: p.category || 'Gran Formato',
  calcType: p.calcType || (p.pricingMode === 'area' || p.pricingMode === 'm2' || p.type === 'm2' || p.unit === 'm2' || p.category === 'Lonas y banners' || p.category === 'Viniles' || p.category === 'Gran Formato' ? 'area' : 'unit'),
  basePrice: Number(p.price || p.priceScales?.[0]?.price || 7.50),
  minPrice: Number(p.minPrice || p.priceScales?.[p.priceScales?.length - 1]?.price || 5.00),
  unit: p.unit || (p.pricingMode === 'area' || p.pricingMode === 'm2' || p.type === 'm2' ? 'm2' : 'unidad'),
  priceTiers: p.priceScales || [],
  isActive: true,
  image: p.image || null,
  leadTimeDays: p.leadTimeDays || 2,
  description: p.description || `${p.name} con acabados profesionales Gigaprint.`
}));

// Default Materials Inventory
export const DEFAULT_MATERIALS = [
  { id: 'mat-lona-front-13', name: 'Lona Frontlit 13oz 3.20m', category: 'lona', unit: 'm2', currentStock: 250.00, minStockAlert: 20.00, widthM: 3.20, lengthM: 50.00, costPerUnit: 1.25, supplierName: 'Importadora Gráfica' },
  { id: 'mat-lona-front-10', name: 'Lona Frontlit 10oz Económica 3.20m', category: 'lona', unit: 'm2', currentStock: 180.00, minStockAlert: 15.00, widthM: 3.20, lengthM: 50.00, costPerUnit: 0.95, supplierName: 'Importadora Gráfica' },
  { id: 'mat-lona-mesh', name: 'Lona Mesh Microperforada con Liner 3.20m', category: 'lona', unit: 'm2', currentStock: 90.00, minStockAlert: 10.00, widthM: 3.20, lengthM: 50.00, costPerUnit: 1.80, supplierName: 'Suministros Visuales' },
  { id: 'mat-lona-backlit', name: 'Lona Backlit para Rótulos Luminosos 3.20m', category: 'lona', unit: 'm2', currentStock: 120.00, minStockAlert: 15.00, widthM: 3.20, lengthM: 50.00, costPerUnit: 2.10, supplierName: 'Suministros Visuales' },
  { id: 'mat-vinil-brillo', name: 'Vinil Adhesivo Blanco Brillante 1.52m', category: 'vinil', unit: 'm2', currentStock: 150.00, minStockAlert: 15.00, widthM: 1.52, lengthM: 50.00, costPerUnit: 1.10, supplierName: 'Avery / Ritrama' },
  { id: 'mat-vinil-mate', name: 'Vinil Adhesivo Blanco Mate 1.52m', category: 'vinil', unit: 'm2', currentStock: 120.00, minStockAlert: 15.00, widthM: 1.52, lengthM: 50.00, costPerUnit: 1.15, supplierName: 'Avery / Ritrama' },
  { id: 'mat-vinil-micro', name: 'Vinil Microperforado para Vidrios 1.52m', category: 'vinil', unit: 'm2', currentStock: 85.00, minStockAlert: 10.00, widthM: 1.52, lengthM: 50.00, costPerUnit: 2.20, supplierName: 'Suministros Visuales' },
  { id: 'mat-vinil-trans', name: 'Vinil Transparente Brillante 1.52m', category: 'vinil', unit: 'm2', currentStock: 60.00, minStockAlert: 10.00, widthM: 1.52, lengthM: 50.00, costPerUnit: 1.30, supplierName: 'Ritrama' },
  { id: 'mat-lam-frio', name: 'Laminado en Frío Mate/Brillo 1.52m', category: 'vinil', unit: 'm2', currentStock: 110.00, minStockAlert: 15.00, widthM: 1.52, lengthM: 50.00, costPerUnit: 0.85, supplierName: 'Avery' },
  { id: 'mat-sintra-3mm', name: 'Plancha Sintra / PVC 3mm (1.22x2.44m)', category: 'rigido', unit: 'm2', currentStock: 45.00, minStockAlert: 8.00, widthM: 1.22, lengthM: 2.44, costPerUnit: 4.50, supplierName: 'Plásticos Industriales' },
  { id: 'mat-acrilico-3mm', name: 'Plancha Acrílico Cristal 3mm (1.22x2.44m)', category: 'rigido', unit: 'm2', currentStock: 25.00, minStockAlert: 5.00, widthM: 1.22, lengthM: 2.44, costPerUnit: 9.50, supplierName: 'Acrílicos Ecuador' },
  { id: 'mat-ojales-peq', name: 'Ojales Niquelados Pequeños #3', category: 'accesorio', unit: 'unid', currentStock: 2500.00, minStockAlert: 200.00, widthM: null, lengthM: null, costPerUnit: 0.04, supplierName: 'Ferretería Industrial' },
  { id: 'mat-ojales-gran', name: 'Ojales Reforzados Grandes #5', category: 'accesorio', unit: 'unid', currentStock: 1800.00, minStockAlert: 150.00, widthM: null, lengthM: null, costPerUnit: 0.07, supplierName: 'Ferretería Industrial' }
];

// Default Suppliers Directory
export const DEFAULT_SUPPLIERS = [
  { id: 'sup-1', name: 'Importadora Gráfica Ecuador', identification: '1791234567001', contactName: 'Carlos Morales', phone: '0981112233', email: 'ventas@importadoragrafica.ec', city: 'Guayaquil', address: 'Av. Juan Tanca Marengo', materialsSupplied: ['Lona Frontlit 13oz', 'Lona 10oz', 'Lona Mesh'], paymentTerms: 'Crédito 30d', notes: 'Entrega en Milagro los días martes y jueves.' },
  { id: 'sup-2', name: 'Suministros Visuales del Austro', identification: '1792223334001', contactName: 'Patricia Vélez', phone: '0994445566', email: 'suministros@visuales.com.ec', city: 'Guayaquil', address: 'Sector El Inca', materialsSupplied: ['Lona Backlit', 'Vinil Microperforado'], paymentTerms: 'Crédito 15d', notes: 'Descuento 5% por pronto pago en 8 días.' },
  { id: 'sup-3', name: 'Distribuidora Avery / Ritrama', identification: '1793334445001', contactName: 'Ing. David Salazar', phone: '0977778899', email: 'dsalazar@viniles.ec', city: 'Guayaquil', address: 'Vía Daule Km 8.5', materialsSupplied: ['Vinil Adhesivo Blanco', 'Vinil Mate', 'Laminado en Frío'], paymentTerms: 'Contado', notes: 'Excelente calidad de adhesivo para exteriores.' },
  { id: 'sup-4', name: 'Plásticos & Rígidos Industriales', identification: '1794445556001', contactName: 'Roberto Campana', phone: '0988889900', email: 'rcampana@plasticos.com.ec', city: 'Milagro', address: 'Sector El Chorrillo', materialsSupplied: ['Planchas Sintra 3mm', 'Acrílico Cristal'], paymentTerms: 'Crédito 15d', notes: 'Corte a medida con sierra de banco sin costo adicional.' }
];

// Helper to generate Next Order Number (e.g., 61930)
export function generateOrderNumber(existingOrders = []) {
  const now = new Date();
  const date = now.toISOString().slice(2, 10).replaceAll('-', '');
  const time = now.toTimeString().slice(0, 8).replaceAll(':', '');
  const suffix = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `GP-${date}-${time}-${suffix}`;
}

// Global Sync Status State & Listeners
let currentSyncStatus = hasSupabase ? 'synced' : 'offline';
const syncListeners = new Set();

export function setSyncStatus(status) {
  currentSyncStatus = status;
  syncListeners.forEach((fn) => {
    try { fn(status); } catch (e) { console.error('Sync listener err:', e); }
  });
}

export function onSyncStatusChange(callback) {
  syncListeners.add(callback);
  callback(currentSyncStatus);
  return () => syncListeners.delete(callback);
}

// Initial Local Storage State
export const INITIAL_POS_STORE = {
  advisors: DEFAULT_ADVISORS,
  customers: DEFAULT_CUSTOMERS,
  products: DEFAULT_PRODUCTS,
  orders: [],
  orderItems: [],
  payments: [],
  expenses: [],
  shifts: [],
  cashAudits: [],
  materials: DEFAULT_MATERIALS,
  materialLogs: [],
  customerLogs: [],
  suppliers: DEFAULT_SUPPLIERS,
  workstations: DEFAULT_WORKSTATIONS,
  productionOperations: [],
  parkedSales: [],
  auditEvents: [],
  lastUpdated: new Date().toISOString()
};

// Safe JSON Parse with Fallback
export function safeJSONParse(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch (e) {
    return fallback;
  }
}

function withBackfilledProductionPlans(store) {
  let operations = [...(store.productionOperations || [])];
  (store.orders || []).filter((order) => order.status !== 'cancelled').forEach((order) => {
    if (operations.some((operation) => operation.orderId === order.id)) return;
    const items = (store.orderItems || []).filter((item) => item.orderId === order.id);
    const plan = buildProductionPlan(order, items, {
      involvedAreas: order.involvedAreas,
      advisors: store.advisors || [],
      existingOperations: operations,
      startAt: order.executionDate ? `${order.executionDate}T08:00:00` : undefined
    });
    operations = [...operations, ...plan.operations];
  });
  return { ...store, productionOperations: operations };
}

// Load Store from LocalStorage with auto-rotation
export function loadPOSStore() {
  if (typeof window === 'undefined') return INITIAL_POS_STORE;
  const raw = localStorage.getItem(POS_STORAGE_KEY);
  if (!raw) {
    const fresh = {
      ...INITIAL_POS_STORE,
      advisors: rotateAdvisorsCredentials(DEFAULT_ADVISORS)
    };
    savePOSStoreLocal(fresh);
    return fresh;
  }

  const parsed = safeJSONParse(raw, INITIAL_POS_STORE);
  const rotatedAdvisors = rotateAdvisorsCredentials(parsed.advisors || DEFAULT_ADVISORS);

  const parsedProducts = (parsed.products && parsed.products.length > 0) ? parsed.products : DEFAULT_PRODUCTS;
  const enrichedProducts = parsedProducts.map((p) => {
    if (!p.image || p.image.includes('stickers.png') || p.image.includes('tazita.webp')) {
      return { ...p, image: imageFor(p.category, p.name) };
    }
    return p;
  });

  const merged = {
    advisors: rotatedAdvisors,
    customers: (parsed.customers && parsed.customers.length > 0) ? parsed.customers : DEFAULT_CUSTOMERS,
    products: enrichedProducts,
    orders: parsed.orders || [],
    orderItems: parsed.orderItems || [],
    payments: parsed.payments || [],
    expenses: parsed.expenses || [],
    shifts: parsed.shifts || [],
    cashAudits: parsed.cashAudits || [],
    materials: (parsed.materials && parsed.materials.length > 0) ? parsed.materials : DEFAULT_MATERIALS,
    materialLogs: parsed.materialLogs || [],
    customerLogs: parsed.customerLogs || [],
    suppliers: (parsed.suppliers && parsed.suppliers.length > 0) ? parsed.suppliers : DEFAULT_SUPPLIERS,
    workstations: (parsed.workstations && parsed.workstations.length > 0) ? parsed.workstations : DEFAULT_WORKSTATIONS,
    productionOperations: parsed.productionOperations || [],
    parkedSales: parsed.parkedSales || [],
    auditEvents: parsed.auditEvents || [],
    lastUpdated: parsed.lastUpdated || new Date().toISOString()
  };

  return withBackfilledProductionPlans(merged);
}

// Save Store directly to LocalStorage
export function savePOSStoreLocal(store) {
  if (typeof window === 'undefined') return;
  const dataToSave = {
    ...store,
    advisors: (store.advisors || []).map(({ pin, weeklyPin, weeklyPassword, pinHash, ...advisor }) => advisor),
    lastUpdated: new Date().toISOString()
  };
  localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(dataToSave));
}

export const savePOSStore = savePOSStoreLocal;

export function getPOSAccessToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(POS_ACCESS_TOKEN_KEY) || '';
}

export function getPOSDeviceId() {
  if (typeof window === 'undefined') return 'server';
  let deviceId = localStorage.getItem(POS_DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(POS_DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function appendPOSAuditEvent(store, event) {
  const auditEvent = {
    id: event.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: event.type || 'unknown',
    entity: event.entity || null,
    entityId: event.entityId || null,
    actorId: event.actorId || getPOSSession()?.id || null,
    actorName: event.actorName || getPOSSession()?.name || 'Sistema',
    metadata: event.metadata || {},
    createdAt: event.createdAt || new Date().toISOString(),
  };
  return { ...store, auditEvents: [auditEvent, ...(store.auditEvents || [])].slice(0, 2000) };
}

// Helper to convert camelCase object keys to snake_case for Supabase
export function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const n = {};
  Object.keys(obj).forEach((k) => {
    const sk = k.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    n[sk] = obj[k];
  });
  return n;
}

// Helper to convert snake_case object keys to camelCase for React
export function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const n = {};
  Object.keys(obj).forEach((k) => {
    const ck = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    n[ck] = obj[k];
  });
  return n;
}

export const POS_SYNC_QUEUE_KEY = 'gigaprint-pos-sync-queue-v1';

// Offline Sync Queue Helper
export function getSyncQueue() {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(POS_SYNC_QUEUE_KEY);
  return safeJSONParse(raw, []);
}

export function saveSyncQueue(queue = []) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(POS_SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueSyncAction(actionType, tableName, payload) {
  const queue = getSyncQueue();
  const entityId = typeof payload === 'object' ? payload.id : payload;
  const nextAction = {
    id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    actionType, // 'upsert' | 'delete'
    tableName,
    payload,
    timestamp: new Date().toISOString(),
    retries: 0
  };
  const duplicateIndex = queue.findIndex((item) => item.actionType === actionType && item.tableName === tableName && (typeof item.payload === 'object' ? item.payload.id : item.payload) === entityId);
  if (duplicateIndex >= 0) queue[duplicateIndex] = nextAction;
  else queue.push(nextAction);
  saveSyncQueue(queue);
}

// Flush pending sync actions when back online
export async function flushSyncQueue() {
  if (!hasSupabase || !supabase) return;
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  const remaining = [];
  setSyncStatus('syncing');

  for (const item of queue) {
    try {
      const accessToken = getPOSAccessToken();
      const { data: authData } = await supabase.auth.getSession();
      if (!accessToken && !authData.session) throw new Error('Sesión POS requerida para sincronizar.');
      if (item.actionType === 'sale_bundle') {
        const bundle = item.payload || {};
        const { error } = await supabase.rpc('pos_create_sale', {
          p_token: accessToken || null,
          p_idempotency_key: bundle.idempotencyKey,
          p_customer: toSnakeCase(bundle.customer),
          p_order: toSnakeCase(bundle.order),
          p_items: (bundle.items || []).map(toSnakeCase),
          p_payments: (bundle.payments || []).map(toSnakeCase),
          p_operations: (bundle.operations || []).map(toSnakeCase),
          p_material_logs: (bundle.materialLogs || []).map(toSnakeCase),
          p_materials: (bundle.materials || []).map(toSnakeCase),
        });
        if (error) throw error;
      } else if (item.actionType === 'upsert') {
        const snake = toSnakeCase(item.payload);
        const { error } = await supabase.rpc('pos_secure_upsert', { p_token: accessToken || null, p_table: item.tableName, p_payload: snake });
        if (error) throw error;
      } else if (item.actionType === 'delete') {
        const { error } = await supabase.rpc('pos_secure_delete', { p_token: accessToken || null, p_table: item.tableName, p_id: item.payload.id || item.payload });
        if (error) throw error;
      }
    } catch (err) {
      console.warn(`[Sync Queue Flush Retry] Error syncing ${item.tableName}:`, err);
      if ((item.retries || 0) < 5) {
        remaining.push({ ...item, retries: (item.retries || 0) + 1 });
      }
    }
  }

  saveSyncQueue(remaining);
  setSyncStatus(remaining.length === 0 ? 'synced' : 'offline');
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushSyncQueue();
  });
}

// Async Remote Sync Engine for individual entities with offline queue fallback
export async function syncEntityRemote(tableName, record) {
  if (!hasSupabase || !supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    enqueueSyncAction('upsert', tableName, record);
    setSyncStatus('offline');
    return { ok: true, queued: true };
  }
  try {
    setSyncStatus('syncing');
    const snake = toSnakeCase(record);
    const accessToken = getPOSAccessToken();
    const { data: authData } = await supabase.auth.getSession();
    const response = accessToken
      ? await supabase.rpc('pos_secure_upsert', { p_token: accessToken, p_table: tableName, p_payload: snake })
      : authData.session
        ? await supabase.rpc('pos_secure_upsert', { p_token: null, p_table: tableName, p_payload: snake })
        : { data: null, error: { message: 'Inicia sesión en el POS para sincronizar.' } };
    const { data, error } = response;

    if (error) {
      console.warn(`[Supabase Sync Warn] ${tableName}:`, error.message);
      enqueueSyncAction('upsert', tableName, record);
      setSyncStatus('error');
      return { ok: false, error: error.message, queued: true };
    }
    setSyncStatus('synced');
    return { ok: true, data };
  } catch (e) {
    console.error(`[Supabase Sync Exception] ${tableName}:`, e);
    enqueueSyncAction('upsert', tableName, record);
    setSyncStatus('error');
    return { ok: false, error: e.message, queued: true };
  }
}

// Async Remote Delete Engine for individual entities with offline queue fallback
export async function deleteEntityRemote(tableName, id) {
  if (!hasSupabase || !supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    enqueueSyncAction('delete', tableName, { id });
    setSyncStatus('offline');
    return { ok: true, queued: true };
  }
  try {
    setSyncStatus('syncing');
    const accessToken = getPOSAccessToken();
    const { data: authData } = await supabase.auth.getSession();
    const { error } = accessToken || authData.session
      ? await supabase.rpc('pos_secure_delete', { p_token: accessToken || null, p_table: tableName, p_id: id })
      : { error: { message: 'Inicia sesión en el POS para sincronizar.' } };

    if (error) {
      console.warn(`[Supabase Delete Warn] ${tableName}:`, error.message);
      enqueueSyncAction('delete', tableName, { id });
      setSyncStatus('error');
      return { ok: false, error: error.message, queued: true };
    }
    setSyncStatus('synced');
    return { ok: true };
  } catch (e) {
    console.error(`[Supabase Delete Exception] ${tableName}:`, e);
    enqueueSyncAction('delete', tableName, { id });
    setSyncStatus('error');
    return { ok: false, error: e.message, queued: true };
  }
}

let remoteTablesAvailable = true;

async function safeQuery(fn) {
  if (!remoteTablesAvailable) return { data: null, error: null };
  try {
    const res = await fn();
    if (res.error) {
      if (res.error.code === '42P01' || res.error.message?.includes('does not exist') || res.status === 404) {
        remoteTablesAvailable = false;
      }
      return { data: null, error: res.error };
    }
    return res;
  } catch (e) {
    return { data: null, error: e };
  }
}

// Remote Batch Fetch Engine to hydrate and merge from Supabase
export async function fetchRemotePOSStore() {
  if (!hasSupabase || !supabase || !remoteTablesAvailable) return loadPOSStore();
  try {
    setSyncStatus('syncing');
    const local = loadPOSStore();
    const accessToken = getPOSAccessToken();
    const { data: authData } = await supabase.auth.getSession();

    if (!accessToken && !authData.session) {
      const { data: directory, error } = await supabase.rpc('pos_team_directory');
      if (error) throw error;
      const publicStore = { ...local, advisors: (directory || []).map(toCamelCase) };
      savePOSStoreLocal(publicStore);
      setSyncStatus('synced');
      return publicStore;
    }

    const { data: payload, error } = await supabase.rpc('pos_fetch_store', { p_token: accessToken || null });
    if (error) throw error;
    const rows = (key) => (payload?.[key] || []).map(toCamelCase);
    const remoteAdvisors = rows('advisors');
    const remoteCustomers = rows('customers');
    const remoteOrders = rows('orders');
    const remoteItems = rows('order_items');
    const remotePayments = rows('payments');
    const remoteExpenses = rows('expenses');
    const remoteShifts = rows('shifts');
    const remoteMaterials = rows('materials');
    const remoteUsageLogs = rows('material_logs');
    const remoteCustLogs = rows('customer_logs');
    const remoteSuppliers = rows('suppliers');
    const remoteParked = rows('parked_sales');
    const remoteProducts = rows('products');
    const remoteOperations = rows('production_operations');
    const remoteWorkstations = rows('workstations');

    const merged = {
      advisors: remoteAdvisors.length ? remoteAdvisors : local.advisors,
      customers: remoteCustomers.length ? remoteCustomers : local.customers,
      products: remoteProducts.length ? remoteProducts : local.products,
      orders: remoteOrders.length ? remoteOrders : local.orders,
      orderItems: remoteItems.length ? remoteItems : local.orderItems,
      payments: remotePayments.length ? remotePayments : local.payments,
      expenses: remoteExpenses.length ? remoteExpenses : local.expenses,
      shifts: remoteShifts.length ? remoteShifts : local.shifts,
      materials: remoteMaterials.length ? remoteMaterials : local.materials,
      materialLogs: remoteUsageLogs.length ? remoteUsageLogs : local.materialLogs,
      customerLogs: remoteCustLogs.length ? remoteCustLogs : local.customerLogs,
      suppliers: remoteSuppliers.length ? remoteSuppliers : local.suppliers,
      parkedSales: remoteParked.length ? remoteParked : local.parkedSales,
      productionOperations: remoteOperations.length ? remoteOperations : local.productionOperations,
      workstations: remoteWorkstations.length ? remoteWorkstations : local.workstations,
      auditEvents: local.auditEvents || [],
      lastUpdated: new Date().toISOString()
    };

    const hydrated = withBackfilledProductionPlans(merged);
    const remoteOperationIds = new Set(remoteOperations.map((operation) => operation.id));
    hydrated.productionOperations
      .filter((operation) => !remoteOperationIds.has(operation.id))
      .forEach((operation) => syncEntityRemote('pos_production_operations', operation));
    savePOSStoreLocal(hydrated);
    setSyncStatus('synced');
    return hydrated;
  } catch (e) {
    setSyncStatus('offline');
    return loadPOSStore();
  }
}

// Realtime Subscriptions Handler for Multi-device live sync
export function subscribePOSRealtime(onUpdate) {
  if (!hasSupabase || !supabase) return () => {};

  // PIN sessions are application sessions rather than Supabase JWTs. Polling
  // keeps them synchronized without reopening direct table policies.
  if (getPOSAccessToken()) {
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchRemotePOSStore().then(onUpdate);
    }, 10000);
    return () => window.clearInterval(poll);
  }

  const channelName = `pos-realtime-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_orders' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_payments' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_cash_shifts' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_customers' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_products' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_expenses' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_customer_activity_logs' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_advisors' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_production_operations' }, () => {
      fetchRemotePOSStore().then(onUpdate);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Advisor CRUD & Realtime Sync Engine
export function createPOSAdvisor(store, advisorData) {
  const currentMonday = getMondayOfWeek();
  const currentWeekCode = getISOWeekCode();
  const rawName = String(advisorData.name || '').trim();
  const firstName = rawName.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const pin = String(advisorData.pin || advisorData.weeklyPin || Math.floor(100000 + Math.random() * 900000)).trim();
  const weeklyPassword = advisorData.weeklyPassword || `${firstName || 'asesora'}-${pin}`;

  const role = advisorData.role || 'asesora';
  const capabilities = getRoleCapabilities(role);
  const roleDefinition = SYSTEM_ROLES.find((item) => item.id === role);
  const newAdvisor = {
    id: advisorData.id || `adv-${Date.now()}`,
    name: rawName,
    email: advisorData.email ? advisorData.email.trim() : `${firstName || 'asesora'}@gigaprint.ec`,
    phone: advisorData.phone ? advisorData.phone.trim() : '',
    role,
    assignedArea: advisorData.assignedArea || roleDefinition?.area || 'ventas',
    pin,
    weeklyPin: pin,
    weeklyPassword,
    weeklyGoal: capabilities.hasSalesGoal ? (Number(advisorData.weeklyGoal) || 3200) : 0,
    canOpenCash: capabilities.canOpenCash,
    hasSalesGoal: capabilities.hasSalesGoal,
    isActive: advisorData.isActive !== false,
    currentWeekCode,
    pinLastRotatedAt: currentMonday
  };

  const updatedAdvisors = [...(store.advisors || []), newAdvisor];
  const nextStore = {
    ...store,
    advisors: updatedAdvisors,
    lastUpdated: new Date().toISOString()
  };

  savePOSStoreLocal(nextStore);
  syncEntityRemote('pos_advisors', newAdvisor);
  return { nextStore, newAdvisor };
}

export function updatePOSAdvisor(store, advisorId, updates) {
  let updatedAdvisor = null;
  const currentMonday = getMondayOfWeek();
  const currentWeekCode = getISOWeekCode();

  const updatedAdvisors = (store.advisors || []).map((adv) => {
    if (adv.id === advisorId) {
      const pin = updates.pin || updates.weeklyPin || adv.weeklyPin || adv.pin;
      const firstName = (updates.name || adv.name).split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const weeklyPassword = updates.weeklyPassword || `${firstName || 'asesora'}-${pin}`;

      const nextRole = updates.role || adv.role || 'asesora';
      const capabilities = getRoleCapabilities(nextRole);
      const roleDefinition = SYSTEM_ROLES.find((item) => item.id === nextRole);
      const merged = {
        ...adv,
        ...updates,
        pin,
        weeklyPin: pin,
        weeklyPassword,
        assignedArea: updates.assignedArea || (updates.role ? roleDefinition?.area : adv.assignedArea) || roleDefinition?.area,
        weeklyGoal: capabilities.hasSalesGoal ? (updates.weeklyGoal !== undefined ? Number(updates.weeklyGoal) : Number(adv.weeklyGoal ?? 3200)) : 0,
        canOpenCash: capabilities.canOpenCash,
        hasSalesGoal: capabilities.hasSalesGoal,
        isActive: updates.isActive !== undefined ? updates.isActive : adv.isActive,
        currentWeekCode: adv.currentWeekCode || currentWeekCode,
        pinLastRotatedAt: adv.pinLastRotatedAt || currentMonday
      };
      updatedAdvisor = merged;
      return merged;
    }
    return adv;
  });

  const nextStore = {
    ...store,
    advisors: updatedAdvisors,
    lastUpdated: new Date().toISOString()
  };

  savePOSStoreLocal(nextStore);
  if (updatedAdvisor) {
    syncEntityRemote('pos_advisors', updatedAdvisor);
  }
  return { nextStore, updatedAdvisor };
}

export function deletePOSAdvisor(store, advisorId) {
  const updatedAdvisors = (store.advisors || []).filter((adv) => adv.id !== advisorId);
  const nextStore = {
    ...store,
    advisors: updatedAdvisors,
    lastUpdated: new Date().toISOString()
  };

  savePOSStoreLocal(nextStore);
  deleteEntityRemote('pos_advisors', advisorId);
  return nextStore;
}

export function regeneratePOSAdvisorPIN(store, advisorId) {
  const newPin = String(Math.floor(100000 + Math.random() * 900000));
  return updatePOSAdvisor(store, advisorId, { pin: newPin, weeklyPin: newPin });
}

// POS Session Management
export function getPOSSession() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(POS_SESSION_KEY);
  if (raw) {
    const session = safeJSONParse(raw, null);
    if (session) {
      const hasRequiredAccessToken = !hasSupabase || session.isAdmin || Boolean(getPOSAccessToken());
      if (hasRequiredAccessToken && (!session.expiresAt || new Date(session.expiresAt).getTime() >= Date.now())) {
        return session;
      }
      localStorage.removeItem(POS_SESSION_KEY);
      sessionStorage.removeItem(POS_ACCESS_TOKEN_KEY);
    }
  }

  // Fallback: If logged in as admin in global store, provide immediate admin session
  if (localStorage.getItem('gigaprint-admin') === 'true') {
    return {
      id: 'adv-admin',
      name: 'Administrador General',
      email: localStorage.getItem('gigaprint-admin-email') || 'admin@gigaprint.ec',
      role: 'super_admin',
      isAdmin: true,
      canOpenCash: true,
      hasSalesGoal: false,
      weeklyGoal: 0,
      unlockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  return null;
}

export function setPOSSession(advisorOrAdmin) {
  if (typeof window === 'undefined') return;
  const expiresAt = advisorOrAdmin.expiresAt || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const session = {
    ...advisorOrAdmin,
    unlockedAt: new Date().toISOString(),
    expiresAt
  };
  localStorage.setItem(POS_SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function authenticateAdvisor(advisors, advisorId, pinOrPassword) {
  const advisor = advisors.find((a) => a.id === advisorId && a.isActive !== false);
  if (!advisor) return { ok: false, error: 'Integrante no encontrado o inactivo.' };

  if (hasSupabase && supabase) {
    const { data, error } = await supabase.rpc('pos_login_with_pin', {
      p_advisor_id: advisorId,
      p_pin: String(pinOrPassword).trim(),
      p_device_id: getPOSDeviceId(),
    });
    if (error || !data?.length) return { ok: false, error: error?.message || 'PIN incorrecto.' };
    const access = toCamelCase(data[0]);
    sessionStorage.setItem(POS_ACCESS_TOKEN_KEY, access.accessToken);
    const capabilities = getRoleCapabilities(access.advisorRole);
    const session = setPOSSession({
      id: access.advisorId,
      name: access.advisorName,
      email: access.advisorEmail,
      role: access.advisorRole,
      isAdmin: capabilities.isAdmin,
      canOpenCash: access.canOpenCash,
      hasSalesGoal: access.hasSalesGoal,
      assignedArea: access.assignedArea,
      defaultTab: capabilities.defaultTab,
      weeklyGoal: Number(access.weeklyGoal || 0),
      expiresAt: access.sessionExpiresAt,
    });
    return { ok: true, session };
  }

  const cleanInput = String(pinOrPassword).trim().toLowerCase();
  const validPin = String(advisor.weeklyPin || advisor.pin || '').trim().toLowerCase();
  const validPass = String(advisor.weeklyPassword || '').trim().toLowerCase();

  if (
    cleanInput === validPin ||
    cleanInput === validPass
  ) {
    const capabilities = getRoleCapabilities(advisor.role);
    const session = setPOSSession({
      id: advisor.id,
      name: advisor.name,
      email: advisor.email,
      role: advisor.role || 'asesora',
      isAdmin: capabilities.isAdmin,
      canOpenCash: capabilities.canOpenCash,
      hasSalesGoal: capabilities.hasSalesGoal,
      assignedArea: advisor.assignedArea || SYSTEM_ROLES.find((item) => item.id === advisor.role)?.area || null,
      defaultTab: capabilities.defaultTab,
      weeklyGoal: capabilities.hasSalesGoal ? Number(advisor.weeklyGoal || 0) : 0,
    });
    return { ok: true, session };
  }

  return { ok: false, error: 'PIN o contraseña incorrecta para esta semana.' };
}

export function authenticateAdmin(password) {
  const clean = String(password).trim();
  if (!hasSupabase && clean === 'gigaprint') {
    const session = setPOSSession({
      id: 'adv-admin',
      name: 'Administrador General',
      email: 'admin@gigaprint.ec',
      role: 'super_admin',
      isAdmin: true,
      weeklyGoal: 0
    });
    return { ok: true, session };
  }
  return { ok: false, error: 'Contraseña de Administrador incorrecta.' };
}

// A sale is one business transaction: customer, order, lines, payments,
// production tasks and material deductions either all persist or none do.
export async function syncPOSOrderBundle(bundle) {
  if (!hasSupabase || !supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    enqueueSyncAction('sale_bundle', 'pos_sales', bundle);
    setSyncStatus('offline');
    return { ok: true, queued: true };
  }

  try {
    setSyncStatus('syncing');
    const accessToken = getPOSAccessToken();
    const { data: authData } = await supabase.auth.getSession();
    if (!accessToken && !authData.session) throw new Error('Inicia sesión en el POS para sincronizar la venta.');
    const { data, error } = await supabase.rpc('pos_create_sale', {
      p_token: accessToken || null,
      p_idempotency_key: bundle.idempotencyKey,
      p_customer: toSnakeCase(bundle.customer),
      p_order: toSnakeCase(bundle.order),
      p_items: (bundle.items || []).map(toSnakeCase),
      p_payments: (bundle.payments || []).map(toSnakeCase),
      p_operations: (bundle.operations || []).map(toSnakeCase),
      p_material_logs: (bundle.materialLogs || []).map(toSnakeCase),
      p_materials: (bundle.materials || []).map(toSnakeCase),
    });
    if (error) throw error;
    setSyncStatus('synced');
    return { ok: true, data };
  } catch (error) {
    enqueueSyncAction('sale_bundle', 'pos_sales', bundle);
    setSyncStatus('error');
    return { ok: false, error: error.message, queued: true };
  }
}

export function getSyncHealth() {
  const queue = getSyncQueue();
  return {
    pending: queue.length,
    failed: queue.filter((item) => Number(item.retries || 0) >= 5).length,
    oldestAt: queue.reduce((oldest, item) => !oldest || item.timestamp < oldest ? item.timestamp : oldest, null),
  };
}

export function createAdminPOSSession(adminUser = {}) {
  return setPOSSession({
    id: 'adv-admin',
    authUserId: adminUser.id || null,
    name: adminUser.name || adminUser.user_metadata?.display_name || 'Administrador General',
    email: adminUser.email || 'admin@gigaprint.ec',
    role: 'super_admin',
    isAdmin: true,
    canOpenCash: true,
    hasSalesGoal: false,
    assignedArea: 'gerencia',
    defaultTab: 'cashier',
    weeklyGoal: 0
  });
}

export function logoutPOSSession() {
  if (typeof window === 'undefined') return;
  const accessToken = getPOSAccessToken();
  if (accessToken && hasSupabase && supabase) {
    supabase.rpc('pos_logout', { p_token: accessToken }).catch(() => {});
  }
  sessionStorage.removeItem(POS_ACCESS_TOKEN_KEY);
  localStorage.removeItem(POS_SESSION_KEY);
}

// Cash Shift Management
export function getActiveCashShift(shifts = [], advisorId) {
  const today = toISODate();
  return shifts.find((s) => s.advisorId === advisorId && s.status === 'open');
}

export function openCashShift(store, advisorId, openingCash = 0, notes = '') {
  const advisor = (store.advisors || []).find((person) => person.id === advisorId);
  const role = advisor?.role || (advisorId === 'adv-admin' ? 'super_admin' : '');
  if (!getRoleCapabilities(role).canOpenCash) {
    return { ok: false, error: 'Este rol no tiene permiso para abrir caja. Debe ingresar a coordinación de trabajos.', updatedStore: store };
  }
  const today = toISODate();
  const shiftId = `shf-${Date.now()}`;
  const newShift = {
    id: shiftId,
    advisorId,
    date: today,
    shiftDate: today,
    openingCash: Number(openingCash) || 0,
    closingCash: null,
    expectedCash: null,
    difference: null,
    status: 'open',
    openedAt: new Date().toISOString(),
    closedAt: null,
    notes: notes || 'Apertura de turno regular'
  };

  const updatedShifts = [newShift, ...(store.shifts || [])];
  const updatedStore = { ...store, shifts: updatedShifts };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_cash_shifts', newShift);
  return { ok: true, updatedStore, shift: newShift };
}

export function closeCashShift(store, shiftId, closingCash = 0, notes = '') {
  const shift = (store.shifts || []).find((s) => s.id === shiftId);
  if (!shift) return { ok: false, error: 'Turno no encontrado.' };

  const shiftStartTime = shift.openedAt ? new Date(shift.openedAt).getTime() : 0;

  const cashPayments = (store.payments || []).filter((p) => {
    if (p.advisorId !== shift.advisorId || p.paymentMethod !== 'cash') return false;
    const pTime = p.createdAt ? new Date(p.createdAt).getTime() : new Date(p.paymentDate).getTime();
    return pTime >= shiftStartTime;
  }).reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const cashExpenses = (store.expenses || []).filter((e) => {
    if (e.advisorId !== shift.advisorId) return false;
    const eTime = e.createdAt ? new Date(e.createdAt).getTime() : new Date(e.expenseDate).getTime();
    return eTime >= shiftStartTime;
  }).reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const expectedCash = (Number(shift.openingCash) || 0) + cashPayments - cashExpenses;
  const counted = Number(closingCash) || 0;
  const difference = counted - expectedCash;

  const closedShift = {
    ...shift,
    closingCash: counted,
    expectedCash,
    difference,
    status: 'closed',
    closedAt: new Date().toISOString(),
    notes: notes ? `${shift.notes || ''} | Cierre: ${notes}` : shift.notes
  };

  const updatedShifts = (store.shifts || []).map((s) => (s.id === shiftId ? closedShift : s));
  const updatedStore = { ...store, shifts: updatedShifts };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_cash_shifts', closedShift);
  return { ok: true, updatedStore, shift: closedShift };
}

// Master Function to Create Order with local deduction and remote sync
export function createPOSOrder(store, orderData) {
  const orderId = `ord-${Date.now()}`;
  const trackingToken = crypto.randomUUID ? crypto.randomUUID() : `trk-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const orderNumber = generateOrderNumber(store.orders || []);
  const today = toISODate();
  const dayOfWeek = getDayNameSpanish(today);
  const weekCode = getISOWeekCode();
  const now = new Date().toISOString();
  const matchedCustomer = findExactPOSCustomer(store.customers || [], {
    id: orderData.customerId,
    name: orderData.customerName,
    identification: orderData.customerIdentification,
    phone: orderData.customerPhone,
  });
  const customerId = matchedCustomer?.id || `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const customerRecord = {
    ...(matchedCustomer || {}),
    id: customerId,
    name: orderData.customerName || matchedCustomer?.name || 'Cliente Mostrador',
    identification: orderData.customerIdentification || matchedCustomer?.identification || '',
    phone: orderData.customerPhone || matchedCustomer?.phone || '',
    email: matchedCustomer?.email || '',
    companyName: matchedCustomer?.companyName || '',
    city: matchedCustomer?.city || 'Milagro',
    address: matchedCustomer?.address || orderData.installationAddress || '',
    isVip: Boolean(matchedCustomer?.isVip),
    creditLimit: Number(matchedCustomer?.creditLimit || 0),
    creditDays: Number(matchedCustomer?.creditDays || 0),
    tags: Array.isArray(matchedCustomer?.tags) ? matchedCustomer.tags : ['POS'],
    notes: matchedCustomer?.notes || '',
    totalSpent: Number((Number(matchedCustomer?.totalSpent || 0) + Number(orderData.totalAmount || 0)).toFixed(2)),
    ordersCount: Number(matchedCustomer?.ordersCount || 0) + 1,
    createdAt: matchedCustomer?.createdAt || now,
    updatedAt: now,
  };
  const mapCoordinates = extractGoogleMapsCoordinates(orderData.installationMapsUrl);

  const stageHistory = [
    { stage: orderData.productionStage || 'preprensa', timestamp: new Date().toISOString(), advisorId: orderData.advisorId, note: 'Creación de orden en POS' }
  ];

  const newOrder = {
    id: orderId,
    trackingToken,
    orderNumber,
    sourceQuoteRequestId: orderData.sourceQuoteRequestId || null,
    sourceQuoteNumber: orderData.sourceQuoteNumber || null,
    advisorId: orderData.advisorId,
    customerId,
    customerName: orderData.customerName || 'Cliente Mostrador',
    customerIdentification: orderData.customerIdentification || '',
    customerPhone: orderData.customerPhone || '',
    jobName: orderData.jobName || `Trabajo #${orderNumber}`,
    orderDate: today,
    deliveryDate: orderData.deliveryDate || today,
    pickupLocation: orderData.pickupLocation || 'Matriz Gigaprint - Av. García Moreno y 9 de Octubre, Milagro',
    pickupPin: String(Math.floor(1000 + Math.random() * 9000)),
    dayOfWeek,
    productionStage: orderData.productionStage || 'preprensa',
    productionPriority: orderData.productionPriority || 'normal',
    productionNotes: orderData.productionNotes || '',
    assignedArea: orderData.assignedArea || 'impresion',
    involvedAreas: orderData.involvedAreas || [],
    executionDate: orderData.executionDate || orderData.deliveryDate || today,
    installationDate: orderData.installationDate || null,
    requiresInstallation: Boolean(orderData.requiresInstallation),
    installationAddress: orderData.installationAddress || '',
    installationMapsUrl: orderData.installationMapsUrl || '',
    installationLatitude: mapCoordinates?.lat ?? null,
    installationLongitude: mapCoordinates?.lng ?? null,
    fieldMeasurementsNotes: orderData.fieldMeasurementsNotes || '',
    workflowStatus: 'planned',
    stageHistory,
    artUrl: orderData.artUrl || '',
    artApproved: Boolean(orderData.artApproved),
    artApprovedAt: orderData.artApproved ? new Date().toISOString() : null,
    artApprovedBy: orderData.artApproved ? orderData.customerName : null,
    status: 'active',
    paymentStatus: Number(orderData.balanceDue) <= 0 ? 'paid' : (Number(orderData.depositAmount) > 0 ? 'partial' : 'pending'),
    subtotal: Number(orderData.subtotal || 0),
    taxRate: Number(orderData.taxRate || 0),
    taxAmount: Number(orderData.taxAmount || 0),
    discountPercent: Number(orderData.discountPercent || 0),
    discountAmount: Number(orderData.discountAmount || 0),
    discountReason: orderData.discountReason || '',
    shippingCost: Number(orderData.shippingCost || 0),
    totalAmount: Number(orderData.totalAmount || 0),
    depositAmount: Number(orderData.depositAmount || 0),
    balanceDue: Number(orderData.balanceDue || 0),
    notes: orderData.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const newItems = (orderData.items || []).map((item, idx) => ({
    id: `itm-${Date.now()}-${idx}`,
    orderId,
    productId: item.productId || null,
    productName: item.productName || 'Impresión / Servicio',
    category: item.category || 'Gran Formato',
    calcType: item.calcType || 'area',
    widthCm: Number(item.widthCm) || null,
    heightCm: Number(item.heightCm) || null,
    areaM2: Number(item.areaM2) || null,
    quantity: Number(item.quantity) || 1,
    unitPrice: Number(item.unitPrice) || 0,
    finishing: item.finishing || 'Sin acabados',
    eyeletCount: Number(item.eyeletCount) || 0,
    eyeletType: item.eyeletType || 'ninguno',
    totalPrice: Number(item.totalPrice) || 0,
    customDetails: item.customDetails || {}
  }));

  const newPayments = (orderData.payments || []).filter((p) => Number(p.amount) > 0).map((p, idx) => ({
    id: `pay-${Date.now()}-${idx}`,
    orderId,
    advisorId: orderData.advisorId,
    paymentDate: today,
    paymentMethod: p.method || 'cash',
    amount: Number(p.amount) || 0,
    bankName: p.bankName || '',
    referenceNumber: p.referenceNumber || '',
    tenderedAmount: Number(p.tenderedAmount || p.amount) || 0,
    changeGiven: Number(p.changeGiven || 0) || 0,
    notes: p.notes || '',
    createdAt: new Date().toISOString()
  }));

  const plan = buildProductionPlan(newOrder, newItems, {
    involvedAreas: orderData.involvedAreas,
    advisors: store.advisors || [],
    existingOperations: store.productionOperations || [],
    startAt: orderData.executionDate ? `${orderData.executionDate}T08:00:00` : undefined
  });
  newOrder.involvedAreas = plan.involvedAreas;

  // Auto-deduct inventory materials if matched
  let updatedMaterials = (store.materials || []).map((material) => ({ ...material }));
  const newMaterialLogs = [];
  const changedMaterialIds = new Set();

  newItems.forEach((itm) => {
    if (itm.areaM2 && itm.areaM2 > 0) {
      const neededM2 = itm.areaM2 * (itm.quantity || 1);
      const matched = updatedMaterials.find((m) =>
        m.name.toLowerCase().includes(itm.productName.toLowerCase().split(' ')[0]) ||
        (itm.category === 'Gran Formato' && m.id === 'mat-lona-front-13')
      );

      if (matched) {
        matched.currentStock = Math.max(0, Number((matched.currentStock - neededM2).toFixed(2)));
        matched.updatedAt = now;
        changedMaterialIds.add(matched.id);
        newMaterialLogs.push({
          id: `mlog-${Date.now()}-${matched.id}`,
          materialId: matched.id,
          orderId,
          quantityUsed: neededM2,
          costApplied: Number((neededM2 * matched.costPerUnit).toFixed(2)),
          notes: `Consumo automático por Orden #${orderNumber} (${itm.productName})`,
          createdAt: new Date().toISOString()
        });
      }
    }
  });

  const updatedStore = appendPOSAuditEvent({
    ...store,
    customers: matchedCustomer
      ? (store.customers || []).map((customer) => customer.id === customerId ? customerRecord : customer)
      : [customerRecord, ...(store.customers || [])],
    orders: [newOrder, ...(store.orders || [])],
    orderItems: [...newItems, ...(store.orderItems || [])],
    payments: [...newPayments, ...(store.payments || [])],
    materials: updatedMaterials,
    materialLogs: [...newMaterialLogs, ...(store.materialLogs || [])],
    productionOperations: [...plan.operations, ...(store.productionOperations || [])]
  }, {
    type: 'order_created',
    entity: 'order',
    entityId: orderId,
    actorId: orderData.advisorId,
    actorName: orderData.advisorName || null,
    metadata: { orderNumber, totalAmount: newOrder.totalAmount, itemCount: newItems.length, sourceQuoteNumber: newOrder.sourceQuoteNumber },
  });

  savePOSStoreLocal(updatedStore);

  // One idempotent cloud transaction prevents partial sales and duplicates.
  syncPOSOrderBundle({
    id: orderId,
    idempotencyKey: `sale:${orderId}`,
    customer: customerRecord,
    order: newOrder,
    items: newItems,
    payments: newPayments,
    operations: plan.operations,
    materialLogs: newMaterialLogs,
    materials: updatedMaterials.filter((material) => changedMaterialIds.has(material.id)),
  });

  return { ok: true, updatedStore, order: newOrder, items: newItems, payments: newPayments, operations: plan.operations };
}

export function updateProductionOperation(store, operationId, updates = {}, advisorId = '') {
  const operation = (store.productionOperations || []).find((item) => item.id === operationId);
  if (!operation) return { ok: false, error: 'Operación no encontrada.' };

  const now = new Date().toISOString();
  const nextStatus = updates.status || operation.status;
  const normalizedUpdates = { ...updates };
  if (updates.estimatedMinutes && !updates.scheduledEnd && operation.scheduledStart) {
    normalizedUpdates.scheduledEnd = new Date(new Date(operation.scheduledStart).getTime() + Number(updates.estimatedMinutes) * 60000).toISOString();
  }
  const updatedOperation = {
    ...operation,
    ...normalizedUpdates,
    startedAt: nextStatus === 'in_progress' && !operation.startedAt ? now : operation.startedAt,
    completedAt: nextStatus === 'done' ? now : (nextStatus !== 'done' ? null : operation.completedAt),
    updatedAt: now,
    metadata: { ...(operation.metadata || {}), ...(normalizedUpdates.metadata || {}), lastUpdatedBy: advisorId || null }
  };

  let operations = (store.productionOperations || []).map((item) => item.id === operationId ? updatedOperation : item);
  operations = recalculateOperationReadiness(operations);
  const changed = operations.filter((item) => {
    const previous = (store.productionOperations || []).find((old) => old.id === item.id);
    return !previous || previous.status !== item.status || item.id === operationId;
  });
  const orderOperations = operations.filter((item) => item.orderId === operation.orderId);
  const workflowStatus = orderOperations.every((item) => item.status === 'done')
    ? 'completed'
    : orderOperations.some((item) => item.status === 'in_progress') ? 'in_progress' : 'planned';
  const nextOperation = [...orderOperations]
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
    .find((item) => !['done', 'cancelled'].includes(item.status));
  const stageByArea = {
    asesoria: 'preprensa', diseno: 'preprensa', aprobacion: 'aprobacion_arte',
    impresion: 'impresion', corte_laser: 'acabados', sublimacion: 'impresion',
    taller: 'acabados', calidad: 'control_calidad', entrega: 'listo'
  };
  const productionStage = workflowStatus === 'completed' ? 'entregado' : (stageByArea[nextOperation?.area] || 'preprensa');
  const order = (store.orders || []).find((item) => item.id === operation.orderId);
  const updatedOrder = order ? { ...order, workflowStatus, productionStage, updatedAt: now } : null;
  const updatedStore = {
    ...store,
    productionOperations: operations,
    orders: updatedOrder ? (store.orders || []).map((item) => item.id === updatedOrder.id ? updatedOrder : item) : store.orders
  };
  savePOSStoreLocal(updatedStore);
  changed.forEach((item) => syncEntityRemote('pos_production_operations', item));
  if (updatedOrder) syncEntityRemote('pos_orders', updatedOrder);
  return { ok: true, updatedStore, operation: updatedOperation };
}

// Function to update production stage on Kanban board
export function updateOrderProductionStage(store, orderId, newStage, note = '', advisorId = '') {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const history = Array.isArray(order.stageHistory) ? [...order.stageHistory] : [];
  history.push({
    stage: newStage,
    timestamp: new Date().toISOString(),
    advisorId: advisorId || order.advisorId,
    note: note || `Cambio de etapa a ${newStage}`
  });

  const updatedOrder = {
    ...order,
    productionStage: newStage,
    stageHistory: history,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = { ...store, orders: updatedOrders };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, order: updatedOrder };
}

// Function to cancel an order and restore allocated inventory materials
export function cancelPOSOrder(store, orderId, reason = '', advisorId = '') {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const history = Array.isArray(order.stageHistory) ? [...order.stageHistory] : [];
  history.push({
    stage: 'cancelado',
    timestamp: new Date().toISOString(),
    advisorId,
    note: `Cancelado: ${reason}`
  });

  const updatedOrder = {
    ...order,
    status: 'cancelled',
    cancellationReason: reason || 'Cancelado por cliente/taller',
    cancelledAt: new Date().toISOString(),
    stageHistory: history,
    updatedAt: new Date().toISOString()
  };

  // Restore inventory for materials used in this order
  let updatedMaterials = [...(store.materials || [])];
  const newMaterialLogs = [];
  const relatedLogs = (store.materialLogs || []).filter((l) => l.orderId === orderId);

  relatedLogs.forEach((log) => {
    const mat = updatedMaterials.find((m) => m.id === log.materialId);
    if (mat && log.quantityUsed > 0) {
      mat.currentStock = Number((mat.currentStock + log.quantityUsed).toFixed(2));
      const reversalLog = {
        id: `mlog-rev-${Date.now()}-${mat.id}`,
        materialId: mat.id,
        orderId,
        quantityUsed: -log.quantityUsed,
        costApplied: -Number(log.costApplied || 0),
        notes: `Restauración de stock por anulación de Orden #${order.orderNumber}`,
        createdAt: new Date().toISOString()
      };
      newMaterialLogs.push(reversalLog);
      syncEntityRemote('pos_material_usage_logs', reversalLog);
      syncEntityRemote('pos_materials_inventory', mat);
    }
  });

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = {
    ...store,
    orders: updatedOrders,
    materials: updatedMaterials,
    materialLogs: [...newMaterialLogs, ...(store.materialLogs || [])]
  };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, order: updatedOrder };
}

// Function to add a payment to an existing order (Cobro de saldo posterior)
export function addOrderPayment(store, { orderId, advisorId, amount, paymentMethod = 'cash', bankName = '', referenceNumber = '', notes = '' }) {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const payAmount = Number(amount) || 0;
  if (payAmount <= 0) return { ok: false, error: 'El monto debe ser mayor a 0.' };

  const newDeposit = Number((Number(order.depositAmount || 0) + payAmount).toFixed(2));
  const newBalance = Number((Number(order.totalAmount || 0) - newDeposit).toFixed(2));
  const newPaymentStatus = newBalance <= 0 ? 'paid' : 'partial';

  const newPayment = {
    id: `pay-${Date.now()}`,
    orderId,
    advisorId: advisorId || order.advisorId,
    paymentDate: toISODate(),
    paymentMethod,
    amount: payAmount,
    bankName,
    referenceNumber,
    notes: notes || 'Abono posterior registrado en cartera',
    createdAt: new Date().toISOString()
  };

  const updatedOrder = {
    ...order,
    depositAmount: newDeposit,
    balanceDue: Math.max(0, newBalance),
    paymentStatus: newPaymentStatus,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedPayments = [newPayment, ...(store.payments || [])];
  const updatedStore = { ...store, orders: updatedOrders, payments: updatedPayments };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);
  syncEntityRemote('pos_payments', newPayment);

  return { ok: true, updatedStore, order: updatedOrder, payment: newPayment };
}

// Function to clone/reorder past job (1-Click Reorder)
export function clonePOSOrder(store, sourceOrderId) {
  const order = (store.orders || []).find((o) => o.id === sourceOrderId);
  if (!order) return null;

  const items = (store.orderItems || []).filter((i) => i.orderId === sourceOrderId);
  return {
    customerName: order.customerName,
    customerIdentification: order.customerIdentification,
    customerPhone: order.customerPhone,
    customerId: order.customerId,
    jobName: `${order.jobName} (Reorden)`,
    items: items.map((itm) => ({
      productName: itm.productName,
      category: itm.category,
      calcType: itm.calcType,
      widthCm: itm.widthCm,
      heightCm: itm.heightCm,
      areaM2: itm.areaM2,
      quantity: itm.quantity,
      unitPrice: itm.unitPrice,
      finishing: itm.finishing,
      eyeletCount: itm.eyeletCount,
      eyeletType: itm.eyeletType,
      totalPrice: itm.totalPrice
    }))
  };
}

// Function to approve art proof with signature, pins and metadata
export function approveOrderArtProof(store, orderId, approvedBy = 'Cliente', artUrl = null, signatureDataUrl = null, pins = null) {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const history = Array.isArray(order.stageHistory) ? [...order.stageHistory] : [];
  history.push({
    stage: 'impresion',
    timestamp: new Date().toISOString(),
    advisorId: order.advisorId,
    note: `Arte aprobado por ${approvedBy}. Avanzado a Impresión.`
  });

  const updatedOrder = {
    ...order,
    artUrl: artUrl || order.artUrl,
    artApproved: true,
    artApprovedAt: new Date().toISOString(),
    artApprovedBy: approvedBy,
    artProofSignature: signatureDataUrl || order.artProofSignature,
    artProofPins: Array.isArray(pins) ? pins : (order.artProofPins || []),
    productionStage: order.productionStage === 'aprobacion_arte' || order.productionStage === 'preprensa' ? 'impresion' : order.productionStage,
    stageHistory: history,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const approvalTime = new Date().toISOString();
  let updatedOperations = (store.productionOperations || []).map((operation) => {
    if (operation.orderId !== orderId || !['diseno', 'aprobacion'].includes(operation.area)) return operation;
    return { ...operation, status: 'done', completedAt: approvalTime, updatedAt: approvalTime };
  });
  updatedOperations = recalculateOperationReadiness(updatedOperations);
  const updatedStore = { ...store, orders: updatedOrders, productionOperations: updatedOperations };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);
  updatedOperations
    .filter((operation) => operation.orderId === orderId)
    .forEach((operation) => syncEntityRemote('pos_production_operations', operation));

  return { ok: true, updatedStore, order: updatedOrder };
}

// Function to add a visual feedback pin to an order art proof
export function addArtProofPin(store, orderId, pinData) {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const existingPins = Array.isArray(order.artProofPins) ? [...order.artProofPins] : [];
  const newPin = {
    id: `pin-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    number: existingPins.length + 1,
    x: Number(pinData.x) || 0, // percentage 0 - 100
    y: Number(pinData.y) || 0, // percentage 0 - 100
    comment: pinData.comment || '',
    author: pinData.author || 'Cliente',
    createdAt: new Date().toISOString(),
    resolved: false
  };

  const updatedPins = [...existingPins, newPin];
  const updatedOrder = {
    ...order,
    artProofPins: updatedPins,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = { ...store, orders: updatedOrders };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, pin: newPin, order: updatedOrder };
}

// Function to assign machine and technician resources to an order in production
export function assignOrderProductionResource(store, orderId, { machine, technician, advisorId = '' }) {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const history = Array.isArray(order.stageHistory) ? [...order.stageHistory] : [];
  if (machine || technician) {
    history.push({
      stage: order.productionStage || 'impresion',
      timestamp: new Date().toISOString(),
      advisorId: advisorId || order.advisorId,
      note: `Asignado a Máquina: ${machine || 'N/A'} | Técnico: ${technician || 'N/A'}`
    });
  }

  const updatedOrder = {
    ...order,
    machineAssigned: machine !== undefined ? machine : order.machineAssigned,
    technicianAssigned: technician !== undefined ? technician : order.technicianAssigned,
    stageHistory: history,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = { ...store, orders: updatedOrders };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, order: updatedOrder };
}

// Function for Barcode Scan-to-Advance on Floor / Kanban
export function advanceOrderProductionStageByScan(store, scanCode, advisorId = '') {
  if (!scanCode) return { ok: false, error: 'Código de escaneo vacío' };

  const clean = scanCode.trim().toUpperCase();
  // Find order by exact match or barcode / orderNumber
  const order = (store.orders || []).find((o) => {
    return (
      (o.orderNumber || '').toUpperCase() === clean ||
      (o.id || '').toUpperCase() === clean ||
      clean.includes((o.orderNumber || '').toUpperCase())
    );
  });

  if (!order) {
    return { ok: false, error: `No se encontró trabajo con código ${scanCode}` };
  }

  const stages = ['preprensa', 'aprobacion_arte', 'impresion', 'acabados', 'control_calidad', 'listo', 'entregado'];
  const currentIdx = stages.indexOf(order.productionStage || 'preprensa');
  if (currentIdx >= stages.length - 1) {
    return { ok: true, message: `La orden #${order.orderNumber} ya está en etapa final (${order.productionStage}).`, order, updatedStore: store };
  }

  const nextStage = stages[currentIdx + 1];
  return updateOrderProductionStage(store, order.id, nextStage, `Avance por escaneo de código de barras: ${scanCode}`, advisorId);
}

// Full Workshop Coordination Assignment
export function assignOrderToWorkstation(store, orderId, {
  assignedArea,
  machine,
  technician,
  executionDate,
  installationDate,
  requiresInstallation,
  installationAddress,
  installationMapsUrl,
  fieldMeasurementsNotes,
  notes,
  advisorId = ''
}) {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const history = Array.isArray(order.stageHistory) ? [...order.stageHistory] : [];
  history.push({
    stage: order.productionStage || 'preprensa',
    timestamp: new Date().toISOString(),
    advisorId: advisorId || order.advisorId,
    note: notes || `Coordinación Taller: Área [${assignedArea || order.assignedArea || 'impresion'}] | Máquina [${machine || order.machineAssigned || 'N/A'}] | Técnico [${technician || order.technicianAssigned || 'N/A'}]`
  });

  const updatedOrder = {
    ...order,
    assignedArea: assignedArea !== undefined ? assignedArea : (order.assignedArea || 'impresion'),
    machineAssigned: machine !== undefined ? machine : order.machineAssigned,
    technicianAssigned: technician !== undefined ? technician : order.technicianAssigned,
    executionDate: executionDate !== undefined ? executionDate : (order.executionDate || order.orderDate),
    installationDate: installationDate !== undefined ? installationDate : (order.installationDate || order.deliveryDate),
    requiresInstallation: requiresInstallation !== undefined ? Boolean(requiresInstallation) : Boolean(order.requiresInstallation),
    installationAddress: installationAddress !== undefined ? installationAddress : (order.installationAddress || ''),
    installationMapsUrl: installationMapsUrl !== undefined ? installationMapsUrl : (order.installationMapsUrl || ''),
    fieldMeasurementsNotes: fieldMeasurementsNotes !== undefined ? fieldMeasurementsNotes : (order.fieldMeasurementsNotes || ''),
    stageHistory: history,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = { ...store, orders: updatedOrders };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, order: updatedOrder };
}

// Update specific workstation stage ('en_cola', 'en_maquina', 'en_secado', 'armado', 'aprobado_qc')
export function updateOrderStationStage(store, orderId, newStationStage, note = '', advisorId = '') {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  let kanbanStage = order.productionStage;
  if (newStationStage === 'en_maquina') kanbanStage = 'impresion';
  else if (newStationStage === 'en_secado' || newStationStage === 'armado') kanbanStage = 'acabados';
  else if (newStationStage === 'aprobado_qc') kanbanStage = 'control_calidad';
  else if (newStationStage === 'listo_entrega') kanbanStage = 'listo';

  const history = Array.isArray(order.stageHistory) ? [...order.stageHistory] : [];
  history.push({
    stage: kanbanStage,
    stationStage: newStationStage,
    timestamp: new Date().toISOString(),
    advisorId: advisorId || order.advisorId,
    note: note || `Estación ${order.assignedArea || 'Taller'}: Estado actualizado a [${newStationStage}]`
  });

  const updatedOrder = {
    ...order,
    stationStage: newStationStage,
    productionStage: kanbanStage,
    stageHistory: history,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = { ...store, orders: updatedOrders };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, order: updatedOrder };
}

// Toggle individual item check within workstation (e.g. Lona 3x2m printed)
export function toggleOrderItemStationCheck(store, orderId, itemKey, advisorId = '') {
  const order = (store.orders || []).find((o) => o.id === orderId);
  if (!order) return { ok: false, error: 'Orden no encontrada.' };

  const printedItems = { ...(order.printedItems || {}) };
  printedItems[itemKey] = !printedItems[itemKey];

  const updatedOrder = {
    ...order,
    printedItems,
    updatedAt: new Date().toISOString()
  };

  const updatedOrders = (store.orders || []).map((o) => (o.id === orderId ? updatedOrder : o));
  const updatedStore = { ...store, orders: updatedOrders };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_orders', updatedOrder);

  return { ok: true, updatedStore, order: updatedOrder, isChecked: printedItems[itemKey] };
}

// Helper to filter orders for a specific workstation area
export function filterOrdersByWorkstationArea(orders = [], area = 'impresion') {
  return orders.filter((o) => {
    if (o.status === 'cancelled' || o.productionStage === 'entregado') return false;
    const assigned = (o.assignedArea || '').toLowerCase();
    if (assigned === area) return true;

    // Automatic area inference from order job name / items if not explicitly set
    const text = `${o.jobName || ''} ${(o.items || []).map((i) => `${i.productName} ${i.category}`).join(' ')}`.toLowerCase();
    if (area === 'impresion') {
      return !assigned || assigned === 'impresion' || text.includes('lona') || text.includes('vinil') || text.includes('banner') || text.includes('afiche') || text.includes('microperforado');
    }
    if (area === 'sublimacion') {
      return assigned === 'sublimacion' || text.includes('almohada') || text.includes('camiseta') || text.includes('taza') || text.includes('gorra') || text.includes('textil') || text.includes('dtf') || text.includes('cojin');
    }
    if (area === 'corte_laser') {
      return assigned === 'corte_laser' || text.includes('acrilico') || text.includes('acrílico') || text.includes('mdf') || text.includes('sintra') || text.includes('laser') || text.includes('láser') || text.includes('cnc') || text.includes('neon') || text.includes('neón') || text.includes('rotulo') || text.includes('rótulo');
    }
    return true;
  });
}

// Helper to generate Weekly Dispatch Billboard Matrix (Monday to Saturday)
export function getWorkshopWeeklyDispatchMatrix(orders = [], mondayDate = getMondayOfWeek(), { groupBy = 'executionDate', area = 'all' } = {}) {
  const start = new Date(mondayDate);
  const days = [];

  const activeOrders = orders.filter((o) => o.status !== 'cancelled' && o.productionStage !== 'entregado');

  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = toISODate(d);

    const dayOrders = activeOrders.filter((o) => {
      const matchDate = groupBy === 'installationDate'
        ? (o.installationDate || o.deliveryDate) === dateStr
        : (o.executionDate || o.deliveryDate || o.orderDate) === dateStr;

      if (!matchDate) return false;
      if (area !== 'all') {
        return (o.assignedArea || 'impresion') === area;
      }
      return true;
    });

    days.push({
      date: dateStr,
      dayName: DAYS_SPANISH[d.getDay()],
      orders: dayOrders,
      orderCount: dayOrders.length,
      installationCount: dayOrders.filter((o) => o.requiresInstallation).length,
      urgentCount: dayOrders.filter((o) => o.productionPriority === 'urgente' || o.priority === 'urgente').length
    });
  }

  return {
    weekCode: getISOWeekCode(start),
    mondayDate,
    groupBy,
    days
  };
}

// Function to log material scrap / waste
export function logMaterialScrap(store, { materialId, quantityM2, reason = 'Falla técnica', notes = '', advisorId = '' }) {
  const material = (store.materials || []).find((m) => m.id === materialId);
  if (!material) return { ok: false, error: 'Sustrato no encontrado en inventario.' };

  const scrapQty = Math.max(0.1, Number(quantityM2) || 0);
  const now = new Date().toISOString();

  // Deduct from current stock
  const newStock = Math.max(0, Number((material.currentStock - scrapQty).toFixed(2)));
  const updatedMaterial = {
    ...material,
    currentStock: newStock,
    updatedAt: now
  };

  const scrapLog = {
    id: `scrap-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    materialId,
    materialName: material.name,
    quantityM2: scrapQty,
    costEstimated: Number((scrapQty * (material.costPerUnit || 1.5)).toFixed(2)),
    reason,
    notes,
    advisorId,
    createdAt: now
  };

  const updatedMaterials = (store.materials || []).map((m) => (m.id === materialId ? updatedMaterial : m));
  const existingScraps = Array.isArray(store.scraps) ? store.scraps : [];
  const updatedStore = {
    ...store,
    materials: updatedMaterials,
    scraps: [scrapLog, ...existingScraps]
  };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_materials_inventory', updatedMaterial);

  return { ok: true, updatedStore, scrapLog };
}

// Function to upsert/edit Customer in CRM
export function upsertCustomer(store, customerData) {
  const isNew = !customerData.id;
  const customerId = customerData.id || `cust-${Date.now()}`;
  const now = new Date().toISOString();

  const customerRecord = {
    id: customerId,
    name: customerData.name || 'Cliente Sin Nombre',
    identification: customerData.identification || '',
    phone: customerData.phone || '',
    email: customerData.email || '',
    city: customerData.city || 'Milagro',
    address: customerData.address || '',
    companyName: customerData.companyName || '',
    isVip: Boolean(customerData.isVip),
    creditLimit: Number(customerData.creditLimit) || 0,
    creditDays: Number(customerData.creditDays) || 0,
    tags: Array.isArray(customerData.tags) ? customerData.tags : ['General'],
    notes: customerData.notes || '',
    createdAt: customerData.createdAt || now,
    updatedAt: now
  };

  let updatedCustomers;
  if (isNew) {
    updatedCustomers = [customerRecord, ...(store.customers || [])];
  } else {
    updatedCustomers = (store.customers || []).map((c) => (c.id === customerId ? customerRecord : c));
  }

  const updatedStore = { ...store, customers: updatedCustomers };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_customers', customerRecord);

  return { ok: true, updatedStore, customer: customerRecord };
}

// Delete Customer
export function deleteCustomer(store, customerId) {
  const hasOrders = (store.orders || []).some((o) => o.customerId === customerId);
  if (hasOrders) {
    return { ok: false, error: 'No se puede eliminar el cliente porque tiene órdenes históricas asociadas.' };
  }

  const updatedCustomers = (store.customers || []).filter((c) => c.id !== customerId);
  const updatedStore = { ...store, customers: updatedCustomers };
  savePOSStoreLocal(updatedStore);

  if (hasSupabase && supabase) {
    supabase.from('pos_customers').delete().eq('id', customerId).then(() => {});
  }

  return { ok: true, updatedStore };
}

// CRM Activity Logs
export function logCustomerActivity(store, { customerId, advisorId, activityType, title = '', description, metadata = {} }) {
  const logId = `clog-${Date.now()}`;
  const newLog = {
    id: logId,
    customerId,
    advisorId: advisorId || null,
    activityType: activityType || 'note',
    title: title || 'Registro de actividad',
    description: description || '',
    metadata,
    createdAt: new Date().toISOString()
  };

  const updatedLogs = [newLog, ...(store.customerLogs || [])];
  const updatedStore = { ...store, customerLogs: updatedLogs };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_customer_activity_logs', newLog);

  return { ok: true, updatedStore, log: newLog };
}

// Products Catalog CRUD
export function upsertProduct(store, productData) {
  const isNew = !productData.id;
  const productId = productData.id || `prod-${Date.now()}`;
  const now = new Date().toISOString();

  const record = {
    id: productId,
    sku: productData.sku || `GIGA-${Math.floor(100 + Math.random() * 900)}`,
    name: productData.name || 'Nuevo Producto',
    category: productData.category || 'Gran Formato',
    parentCategory: productData.parentCategory || productData.category || 'Gran Formato',
    calcType: productData.calcType || 'area',
    basePrice: Number(productData.basePrice || 0),
    minPrice: Number(productData.minPrice || 0),
    unit: productData.unit || 'm2',
    priceTiers: Array.isArray(productData.priceTiers) ? productData.priceTiers : [],
    isActive: productData.isActive !== false,
    leadTimeDays: Number(productData.leadTimeDays || 2),
    description: productData.description || '',
    createdAt: productData.createdAt || now,
    updatedAt: now
  };

  let updatedProducts;
  if (isNew) {
    updatedProducts = [record, ...(store.products || [])];
  } else {
    updatedProducts = (store.products || []).map((p) => (p.id === productId ? record : p));
  }

  const updatedStore = { ...store, products: updatedProducts };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_products', record);

  return { ok: true, updatedStore, product: record };
}

export function deleteProduct(store, productId) {
  const updatedProducts = (store.products || []).filter((p) => p.id !== productId);
  const updatedStore = { ...store, products: updatedProducts };
  savePOSStoreLocal(updatedStore);

  if (hasSupabase && supabase) {
    supabase.from('pos_products').delete().eq('id', productId).then(() => {});
  }

  return { ok: true, updatedStore };
}

// Expenses CRUD
export function createPOSExpense(store, { advisorId, expenseDate, description, amount, category = 'General' }) {
  const expenseId = `exp-${Date.now()}`;
  const newExp = {
    id: expenseId,
    advisorId,
    expenseDate: expenseDate || toISODate(),
    description: description || 'Gasto no especificado',
    amount: Number(amount) || 0,
    category,
    createdAt: new Date().toISOString()
  };

  const updatedExpenses = [newExp, ...(store.expenses || [])];
  const updatedStore = { ...store, expenses: updatedExpenses };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_expenses', newExp);

  return { ok: true, updatedStore, expense: newExp };
}

export function deletePOSExpense(store, expenseId) {
  const updatedExpenses = (store.expenses || []).filter((e) => e.id !== expenseId);
  const updatedStore = { ...store, expenses: updatedExpenses };
  savePOSStoreLocal(updatedStore);

  if (hasSupabase && supabase) {
    supabase.from('pos_expenses').delete().eq('id', expenseId).then(() => {});
  }

  return { ok: true, updatedStore };
}

// Materials Inventory CRUD
export function createMaterial(store, matData) {
  const matId = matData.id || `mat-${Date.now()}`;
  const newMat = {
    id: matId,
    name: matData.name || 'Nuevo Sustrato',
    category: matData.category || 'lona',
    unit: matData.unit || 'm2',
    currentStock: Number(matData.currentStock || 0),
    minStockAlert: Number(matData.minStockAlert || 10),
    widthM: Number(matData.widthM) || null,
    lengthM: Number(matData.lengthM) || null,
    costPerUnit: Number(matData.costPerUnit || 0),
    supplierName: matData.supplierName || 'Proveedor General'
  };

  const updatedMaterials = [newMat, ...(store.materials || [])];
  const updatedStore = { ...store, materials: updatedMaterials };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_materials_inventory', newMat);

  return { ok: true, updatedStore, material: newMat };
}

export function updateMaterial(store, matData) {
  const updatedMaterials = (store.materials || []).map((m) => (m.id === matData.id ? { ...m, ...matData } : m));
  const updatedStore = { ...store, materials: updatedMaterials };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_materials_inventory', matData);

  return { ok: true, updatedStore, material: matData };
}

// Suppliers CRUD
export function upsertSupplier(store, supData) {
  const isNew = !supData.id;
  const supId = supData.id || `sup-${Date.now()}`;
  const now = new Date().toISOString();

  const record = {
    id: supId,
    name: supData.name || 'Proveedor General',
    identification: supData.identification || '',
    contactName: supData.contactName || '',
    phone: supData.phone || '',
    email: supData.email || '',
    city: supData.city || 'Milagro',
    address: supData.address || '',
    materialsSupplied: Array.isArray(supData.materialsSupplied) ? supData.materialsSupplied : [],
    paymentTerms: supData.paymentTerms || 'Contado',
    notes: supData.notes || '',
    isActive: supData.isActive !== false,
    createdAt: supData.createdAt || now,
    updatedAt: now
  };

  let updatedSuppliers;
  if (isNew) {
    updatedSuppliers = [record, ...(store.suppliers || [])];
  } else {
    updatedSuppliers = (store.suppliers || []).map((s) => (s.id === supId ? record : s));
  }

  const updatedStore = { ...store, suppliers: updatedSuppliers };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_suppliers', record);

  return { ok: true, updatedStore, supplier: record };
}

// Parked Sales (Tickets en espera)
export function parkPOSSale(store, { advisorId, customerName, customerPhone, cartData, totalAmount, notes = '' }) {
  const parkId = `park-${Date.now()}`;
  const record = {
    id: parkId,
    advisorId,
    customerName: customerName || 'Cliente en espera',
    customerPhone: customerPhone || '',
    cartData,
    totalAmount: Number(totalAmount || 0),
    notes,
    createdAt: new Date().toISOString()
  };

  const updatedParked = [record, ...(store.parkedSales || [])];
  const updatedStore = { ...store, parkedSales: updatedParked };
  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_parked_sales', record);

  return { ok: true, updatedStore, parkedSale: record };
}

export function deleteParkedSale(store, parkId) {
  const updatedParked = (store.parkedSales || []).filter((p) => p.id !== parkId);
  const updatedStore = { ...store, parkedSales: updatedParked };
  savePOSStoreLocal(updatedStore);

  if (hasSupabase && supabase) {
    supabase.from('pos_parked_sales').delete().eq('id', parkId).then(() => {});
  }

  return { ok: true, updatedStore };
}

export async function fetchPublicPOSOrder(reference) {
  const fallback = loadPOSStore();
  if (!reference) return fallback;
  if (!hasSupabase || !supabase) return fallback;

  const { data, error } = await supabase.rpc('pos_public_order', { p_reference: String(reference).trim() });
  if (error) throw error;
  if (!data?.order) return { ...fallback, orders: [], orderItems: [], advisors: [] };
  return {
    ...fallback,
    orders: [toCamelCase(data.order)],
    orderItems: (data.items || []).map(toCamelCase),
    advisors: data.advisor ? [toCamelCase(data.advisor)] : [],
  };
}

export async function submitPublicArtDecision(reference, {
  approverName,
  decision,
  pins = [],
  signature = null,
}) {
  if (!hasSupabase || !supabase) return { ok: false, error: 'La aprobación en línea requiere conexión.' };
  const { data, error } = await supabase.rpc('pos_submit_art_decision', {
    p_reference: String(reference).trim(),
    p_approver_name: String(approverName || '').trim(),
    p_decision: decision,
    p_pins: pins,
    p_signature: signature,
  });
  if (error) return { ok: false, error: error.message };
  const updatedStore = {
    ...loadPOSStore(),
    orders: data?.order ? [toCamelCase(data.order)] : [],
    orderItems: (data?.items || []).map(toCamelCase),
    advisors: data?.advisor ? [toCamelCase(data.advisor)] : [],
  };
  return { ok: true, updatedStore, order: updatedStore.orders[0] || null };
}

// Public Order Tracking by Token
export function getOrderPublicTracking(store, trackingTokenOrOrderNumber) {
  const query = String(trackingTokenOrOrderNumber).trim().toLowerCase();
  const order = (store.orders || []).find(
    (o) => String(o.trackingToken).toLowerCase() === query || String(o.orderNumber) === query || String(o.id).toLowerCase() === query
  );
  if (!order) return null;

  const items = (store.orderItems || []).filter((i) => i.orderId === order.id);
  const advisor = (store.advisors || []).find((a) => a.id === order.advisorId);

  return {
    orderNumber: order.orderNumber,
    jobName: order.jobName,
    customerName: order.customerName,
    orderDate: order.orderDate,
    deliveryDate: order.deliveryDate,
    productionStage: order.productionStage,
    stageHistory: order.stageHistory || [],
    artUrl: order.artUrl,
    artApproved: order.artApproved,
    pickupLocation: order.pickupLocation,
    pickupPin: order.pickupPin,
    paymentStatus: order.paymentStatus,
    depositAmount: Number(order.depositAmount || 0),
    balanceDue: Number(order.balanceDue || 0),
    advisorName: advisor?.name || 'Asesora Gigaprint',
    items: items.map((i) => ({
      productName: i.productName,
      category: i.category,
      widthCm: i.widthCm,
      heightCm: i.heightCm,
      quantity: i.quantity,
      finishing: i.finishing
    }))
  };
}

// Calculate due date alerts
export function calculateDueAlerts(orders = []) {
  const today = toISODate();
  const activeOrders = orders.filter((o) => o.status === 'active' && o.productionStage !== 'entregado');

  const overdue = activeOrders.filter((o) => o.deliveryDate && o.deliveryDate < today);
  const dueToday = activeOrders.filter((o) => o.deliveryDate && o.deliveryDate === today);
  const urgent = activeOrders.filter((o) => o.productionPriority === 'urgente');

  return {
    overdueCount: overdue.length,
    dueTodayCount: dueToday.length,
    urgentCount: urgent.length,
    overdueOrders: overdue,
    dueTodayOrders: dueToday,
    urgentOrders: urgent
  };
}

// Estimate Order Profit Margin (Job Costing)
export function calculateOrderMargin(order, items = [], materials = []) {
  const revenue = Number(order.totalAmount || 0);
  let estimatedMaterialCost = 0;

  items.forEach((itm) => {
    if (itm.areaM2 && itm.areaM2 > 0) {
      const area = itm.areaM2 * (itm.quantity || 1);
      const mat = materials.find((m) => m.name.toLowerCase().includes(itm.productName.toLowerCase().split(' ')[0]));
      const unitCost = mat ? mat.costPerUnit : 1.20;
      estimatedMaterialCost += area * unitCost;
    }
  });

  const estimatedLaborCost = items.length * 2.50; // $2.50 labor handling per item
  const totalCost = Number((estimatedMaterialCost + estimatedLaborCost).toFixed(2));
  const grossProfit = Number((revenue - totalCost).toFixed(2));
  const marginPercent = revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(1)) : 0;

  return {
    revenue,
    materialCost: Number(estimatedMaterialCost.toFixed(2)),
    laborCost: estimatedLaborCost,
    totalCost,
    grossProfit,
    marginPercent
  };
}

// Calculate Daily Cash Reconciliation for specific date and advisor
export function calculateDailyReconciliation(store, dateStr = toISODate(), advisorId = 'all') {
  const orders = (store.orders || []).filter(
    (o) => o.orderDate === dateStr && (advisorId === 'all' || o.advisorId === advisorId) && o.status !== 'cancelled'
  );
  const payments = (store.payments || []).filter(
    (p) => p.paymentDate === dateStr && (advisorId === 'all' || p.advisorId === advisorId)
  );
  const expenses = (store.expenses || []).filter(
    (e) => e.expenseDate === dateStr && (advisorId === 'all' || e.advisorId === advisorId)
  );

  const totalSales = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const totalDeposits = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalBalanceDue = orders.reduce((sum, o) => sum + Number(o.balanceDue || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const cashAmount = payments.filter((p) => p.paymentMethod === 'cash').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const transferAmount = payments.filter((p) => p.paymentMethod === 'transfer').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const checkAmount = payments.filter((p) => p.paymentMethod === 'check').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const cardAmount = payments.filter((p) => p.paymentMethod === 'card').reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const netCash = cashAmount - totalExpenses;

  return {
    date: dateStr,
    dayName: getDayNameSpanish(dateStr),
    orderCount: orders.length,
    totalSales,
    totalDeposits,
    totalBalanceDue,
    totalExpenses,
    cashAmount,
    transferAmount,
    checkAmount,
    cardAmount,
    netCash,
    netTotal: totalDeposits - totalExpenses,
    orders,
    payments,
    expenses
  };
}

// Calculate Weekly Balance Matrix (Monday to Saturday)
export function calculateWeeklyBalance(store, mondayDate = getMondayOfWeek(), advisorId = 'all') {
  const days = [];
  const start = new Date(mondayDate);

  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = toISODate(d);
    days.push(calculateDailyReconciliation(store, dateStr, advisorId));
  }

  const totals = days.reduce(
    (acc, day) => ({
      orderCount: acc.orderCount + day.orderCount,
      totalSales: acc.totalSales + day.totalSales,
      totalDeposits: acc.totalDeposits + day.totalDeposits,
      totalBalanceDue: acc.totalBalanceDue + day.totalBalanceDue,
      totalExpenses: acc.totalExpenses + day.totalExpenses,
      cashAmount: acc.cashAmount + day.cashAmount,
      transferAmount: acc.transferAmount + day.transferAmount,
      checkAmount: acc.checkAmount + day.checkAmount,
      cardAmount: acc.cardAmount + day.cardAmount,
      netCash: acc.netCash + day.netCash,
      netTotal: acc.netTotal + day.netTotal
    }),
    {
      orderCount: 0,
      totalSales: 0,
      totalDeposits: 0,
      totalBalanceDue: 0,
      totalExpenses: 0,
      cashAmount: 0,
      transferAmount: 0,
      checkAmount: 0,
      cardAmount: 0,
      netCash: 0,
      netTotal: 0
    }
  );

  return {
    weekCode: getISOWeekCode(start),
    mondayDate,
    days,
    totals
  };
}

// Export Orders to CSV format
export function exportOrdersToCSV(orders = [], advisors = []) {
  const headers = [
    'Numero Orden', 'Fecha', 'Asesora', 'Cliente', 'RUC/CI', 'Telefono',
    'Nombre Trabajo', 'Etapa', 'Estado Pago', 'Total ($)', 'Abono ($)', 'Saldo ($)', 'Notas'
  ];

  const rows = orders.map((o) => {
    const adv = advisors.find((a) => a.id === o.advisorId);
    return [
      o.orderNumber,
      o.orderDate,
      adv ? adv.name : o.advisorId,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.customerIdentification || ''}"`,
      `"${o.customerPhone || ''}"`,
      `"${(o.jobName || '').replace(/"/g, '""')}"`,
      o.productionStage || 'preprensa',
      o.paymentStatus || 'pending',
      Number(o.totalAmount || 0).toFixed(2),
      Number(o.depositAmount || 0).toFixed(2),
      Number(o.balanceDue || 0).toFixed(2),
      `"${(o.notes || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `gigaprint_ventas_${toISODate()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -----------------------------------------------------------------------------
// ADVANCED FINANCIAL & MULTI-TERMINAL ENGINE
// -----------------------------------------------------------------------------

// Calculate Multi-Terminal Live Status for all Cashiers / Points of Sale
export function calculateMultiTerminalLiveStatus(store, targetDate = toISODate()) {
  const advisors = store.advisors || [];
  const shifts = store.shifts || [];
  const payments = store.payments || [];
  const expenses = store.expenses || [];
  const orders = store.orders || [];

  return advisors.map((adv) => {
    // Find today's shift for this advisor
    const todayShifts = shifts.filter((s) => s.advisorId === adv.id && s.shiftDate === targetDate);
    const activeShift = todayShifts.find((s) => s.status === 'open') || todayShifts[todayShifts.length - 1] || null;

    // Filter today's transactions for this advisor
    const todayPayments = payments.filter((p) => p.advisorId === adv.id && p.paymentDate === targetDate);
    const todayExpenses = expenses.filter((e) => e.advisorId === adv.id && e.expenseDate === targetDate);
    const todayOrders = orders.filter((o) => o.advisorId === adv.id && o.orderDate === targetDate && o.status !== 'cancelled');

    const openingFloat = activeShift ? Number(activeShift.openingCashAmount || 0) : 0;
    const cashCollected = todayPayments.filter((p) => p.paymentMethod === 'cash').reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const transfersCollected = todayPayments.filter((p) => p.paymentMethod === 'transfer').reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const cardsCollected = todayPayments.filter((p) => p.paymentMethod === 'card').reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const pettyCashExpenses = todayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    // Live Cash in Drawer = Opening + Cash Collections - Cash Expenses
    const currentDrawerCash = Math.max(0, openingFloat + cashCollected - pettyCashExpenses);
    const totalCollected = cashCollected + transfersCollected + cardsCollected;
    const totalSales = todayOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    // Calculate Shift Elapsed Time & Status
    let status = 'closed';
    let statusLabel = 'Turno Cerrado';
    let openTimeFormatted = null;
    let hoursOpen = 0;

    if (activeShift && activeShift.status === 'open') {
      status = 'open';
      statusLabel = 'Turno Abierto';
      if (activeShift.openedAt) {
        const openedAtDate = new Date(activeShift.openedAt);
        openTimeFormatted = openedAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        hoursOpen = Math.max(0, (Date.now() - openedAtDate.getTime()) / 3600000);
        if (hoursOpen > 9) {
          status = 'review_needed';
          statusLabel = 'Por Cuadrar (>9h)';
        }
      }
    } else if (todayOrders.length > 0 || todayPayments.length > 0) {
      status = 'closed_with_sales';
      statusLabel = 'Caja Cuadrada';
    }

    return {
      advisorId: adv.id,
      advisorName: adv.name,
      advisorRole: adv.role || 'asesora',
      phone: adv.phone || '',
      isActive: adv.isActive !== false,
      weeklyGoal: Number(adv.weeklyGoal) || 3200,
      shift: activeShift,
      status,
      statusLabel,
      openTimeFormatted,
      hoursOpen: Number(hoursOpen.toFixed(1)),
      openingFloat,
      cashCollected,
      transfersCollected,
      cardsCollected,
      pettyCashExpenses,
      currentDrawerCash,
      totalCollected,
      totalSales,
      ordersCount: todayOrders.length
    };
  });
}

// Calculate Debt Aging Matrix (Cuentas por Cobrar & Antigüedad de Cartera)
export function calculateDebtAgingMatrix(orders = []) {
  const activeUnpaidOrders = orders.filter(
    (o) => Number(o.balanceDue || 0) > 0.05 && o.status !== 'cancelled'
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return new Date();
    if (typeof dateStr === 'string' && dateStr.includes('-') && !dateStr.includes('T')) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(dateStr);
  };

  let bucket0to15 = 0;
  let bucket16to30 = 0;
  let bucket31to60 = 0;
  let bucketOver60 = 0;
  let totalDebt = 0;

  const enrichedDebtors = activeUnpaidOrders.map((order) => {
    const orderDate = parseLocalDate(order.orderDate || order.createdAt);
    orderDate.setHours(0, 0, 0, 0);
    const diffDays = Math.max(0, Math.floor((today.getTime() - orderDate.getTime()) / 86400000));
    const balance = Number(order.balanceDue || 0);

    totalDebt += balance;

    let bucket = '0-15';
    let riskLevel = 'low'; // low, medium, high, critical
    if (diffDays <= 15) {
      bucket0to15 += balance;
      bucket = '0-15';
      riskLevel = 'low';
    } else if (diffDays <= 30) {
      bucket16to30 += balance;
      bucket = '16-30';
      riskLevel = 'medium';
    } else if (diffDays <= 60) {
      bucket31to60 += balance;
      bucket = '31-60';
      riskLevel = 'high';
    } else {
      bucketOver60 += balance;
      bucket = '+60';
      riskLevel = 'critical';
    }

    return {
      ...order,
      daysOverdue: diffDays,
      debtBucket: bucket,
      riskLevel
    };
  });

  // Sort by highest balance due and days overdue
  enrichedDebtors.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balanceDue - a.balanceDue);

  return {
    totalDebt: Number(totalDebt.toFixed(2)),
    bucket0to15: Number(bucket0to15.toFixed(2)),
    bucket16to30: Number(bucket16to30.toFixed(2)),
    bucket31to60: Number(bucket31to60.toFixed(2)),
    bucketOver60: Number(bucketOver60.toFixed(2)),
    count: activeUnpaidOrders.length,
    debtorsList: enrichedDebtors
  };
}

// Record Blind Cash Audit with denominations breakdown
export function recordBlindCashAudit(store, { advisorId, shiftId, denominations = {}, notes = '', declaredCash = 0 }) {
  const advisor = (store.advisors || []).find((a) => a.id === advisorId);
  const shifts = store.shifts || [];
  const shift = shifts.find((s) => s.id === shiftId) || null;

  const today = toISODate();
  // Calculate expected cash in drawer
  const payments = (store.payments || []).filter((p) => p.advisorId === advisorId && p.paymentDate === today && p.paymentMethod === 'cash');
  const expenses = (store.expenses || []).filter((e) => e.advisorId === advisorId && e.expenseDate === today);
  const openingFloat = shift ? Number(shift.openingCashAmount || 0) : 0;
  const cashCollected = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const cashExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const expectedCash = Number((openingFloat + cashCollected - cashExpenses).toFixed(2));

  const totalDeclared = Number((Number(declaredCash) || Object.entries(denominations).reduce((sum, [denom, qty]) => {
    return sum + (Number(denom) * (Number(qty) || 0));
  }, 0)).toFixed(2));

  const discrepancy = Number((totalDeclared - expectedCash).toFixed(2));
  const isBalanced = Math.abs(discrepancy) <= 0.05;

  const auditRecord = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    date: today,
    timestamp: new Date().toISOString(),
    advisorId,
    advisorName: advisor ? advisor.name : 'Asesora',
    shiftId: shiftId || null,
    denominations,
    totalDeclared,
    expectedCash,
    discrepancy,
    isBalanced,
    status: isBalanced ? 'balanced' : discrepancy > 0 ? 'surplus' : 'shortage',
    notes: notes.trim()
  };

  const updatedAudits = [auditRecord, ...(store.cashAudits || [])];
  const updatedStore = { ...store, cashAudits: updatedAudits };

  savePOSStoreLocal(updatedStore);
  syncEntityRemote('pos_cash_audits', auditRecord);

  return { ok: true, updatedStore, auditRecord };
}

// Calculate High-Speed Dynamic Print Item Price, Finishings, Design, Installation & Override
export function calculatePrintItemPrice({
  product,
  widthCm = 0,
  heightCm = 0,
  quantity = 1,
  finishingType = 'none',
  eyeletCount = 0,
  designService = 'none', // 'none' | 'adaptation' | 'scratch'
  installationService = 'none', // 'none' | 'standard' | 'height' | 'custom'
  customInstallationCost = 0,
  customPriceOverride = null,
  customerVipTier = null
}) {
  if (!product) {
    return {
      areaM2: 0,
      perimeterM: 0,
      unitRate: 0,
      effectiveUnitPrice: 0,
      baseItemSubtotal: 0,
      finishingSubtotal: 0,
      designCost: 0,
      installationCost: 0,
      systemCalculatedTotal: 0,
      totalItemPrice: 0,
      finalItemPrice: 0,
      isOverridden: false,
      priceAdjustment: 0
    };
  }

  const qty = Math.max(1, Number(quantity) || 1);
  const isArea = product.calcType === 'area';
  const widthM = Number(widthCm) / 100;
  const heightM = Number(heightCm) / 100;
  const areaM2 = isArea && widthM > 0 && heightM > 0 ? widthM * heightM : 0;
  const perimeterM = isArea && widthM > 0 && heightM > 0 ? 2 * (widthM + heightM) : 0;

  // 1. Pricing Tier resolution
  let unitRate = Number(product.basePrice || 7.50);

  if (customerVipTier === 'mayorista' && product.wholesalePrice) {
    unitRate = Number(product.wholesalePrice);
  } else if (customerVipTier === 'agencia' && product.agencyPrice) {
    unitRate = Number(product.agencyPrice);
  }

  // 2. Finishing calculation (Gran Formato, Textil, Viniles, Rígidos, Imprenta)
  let finishingUnitCost = 0;
  if (finishingType === 'ojales_pequenos') {
    finishingUnitCost += (Number(eyeletCount) || 4) * 0.30;
  } else if (finishingType === 'ojales_grandes' || finishingType === 'ojales_reforzados') {
    finishingUnitCost += (Number(eyeletCount) || 4) * 0.50;
  } else if (finishingType === 'bolsillo' || finishingType === 'bolsillo_tubo') {
    finishingUnitCost += 4.00;
  } else if (finishingType === 'dobladillo_perimetral') {
    finishingUnitCost += perimeterM * 0.75;
  } else if (finishingType === 'laminado_protector' || finishingType === 'laminado_brillante' || finishingType === 'laminado_mate') {
    finishingUnitCost += areaM2 > 0 ? areaM2 * 3.50 : 3.50;
  } else if (finishingType === 'troquelado_silueta') {
    finishingUnitCost += areaM2 > 0 ? areaM2 * 2.00 : 2.00;
  } else if (finishingType === 'papel_transfer') {
    finishingUnitCost += areaM2 > 0 ? areaM2 * 1.50 : 1.50;
  } else if (finishingType === 'corte_cnc') {
    finishingUnitCost += areaM2 > 0 ? areaM2 * 4.00 : 4.00;
  } else if (finishingType === 'separadores_pared') {
    finishingUnitCost += 6.00;
  } else if (finishingType === 'cinta_doble_faz') {
    finishingUnitCost += perimeterM > 0 ? perimeterM * 2.50 : 2.50;
  } else if (finishingType === 'estampado_doble') {
    finishingUnitCost += 3.00;
  } else if (finishingType === 'empaque_individual') {
    finishingUnitCost += 0.50;
  } else if (finishingType === 'relleno_extra') {
    finishingUnitCost += 2.50;
  } else if (finishingType === 'plastificado_mate') {
    finishingUnitCost += 0.05;
  } else if (finishingType === 'plastificado_brillo') {
    finishingUnitCost += 0.04;
  } else if (finishingType === 'puntas_redondas' || finishingType === 'doblado') {
    finishingUnitCost += 2.00 / Math.max(1, qty);
  }

  // 3. Design Service Cost
  let designCost = 0;
  if (designService === 'adaptation') {
    designCost = 5.00;
  } else if (designService === 'scratch') {
    designCost = 15.00;
  }

  // 4. Installation in Site Cost
  let installationCost = 0;
  if (installationService === 'standard') {
    installationCost = 15.00;
  } else if (installationService === 'height') {
    installationCost = 30.00;
  } else if (installationService === 'custom') {
    installationCost = Math.max(0, Number(customInstallationCost) || 0);
  }

  // 5. System Suggested Subtotals
  const baseItemSubtotal = isArea ? (areaM2 * unitRate * qty) : (unitRate * qty);
  const finishingSubtotal = finishingUnitCost * qty;
  const systemCalculatedTotal = Number((baseItemSubtotal + finishingSubtotal + designCost + installationCost).toFixed(2));

  // 6. Manual Commercial Override Resolution
  const hasOverride = customPriceOverride !== null &&
    customPriceOverride !== undefined &&
    String(customPriceOverride).trim() !== '' &&
    !isNaN(Number(customPriceOverride)) &&
    Number(customPriceOverride) >= 0;

  const finalItemPrice = hasOverride
    ? Number(Number(customPriceOverride).toFixed(2))
    : systemCalculatedTotal;

  const priceAdjustment = Number((finalItemPrice - systemCalculatedTotal).toFixed(2));

  return {
    areaM2: Number(areaM2.toFixed(3)),
    perimeterM: Number(perimeterM.toFixed(2)),
    unitRate,
    effectiveUnitPrice: unitRate,
    baseItemSubtotal: Number(baseItemSubtotal.toFixed(2)),
    finishingSubtotal: Number(finishingSubtotal.toFixed(2)),
    designCost: Number(designCost.toFixed(2)),
    installationCost: Number(installationCost.toFixed(2)),
    systemCalculatedTotal,
    totalItemPrice: finalItemPrice,
    finalItemPrice,
    isOverridden: hasOverride,
    priceAdjustment
  };
}

// Export Full Comprehensive Financial Report to CSV
export function exportFullFinancialReportToCSV(metrics, orders = [], advisors = [], agingData = {}) {
  const lines = [];
  lines.push('=== GIGAPRINT — REPORTE FINANCIERO Y EJECUTIVO DE VENTAS ===');
  lines.push(`Fecha de Emisión:,${new Date().toLocaleString()}`);
  lines.push(`Rango de Análisis:,${metrics.dateRangeLabel || 'Período Seleccionado'}`);
  lines.push('');
  
  lines.push('--- RESUMEN EJECUTIVO (KPIs) ---');
  lines.push(`Facturación Bruta:,$${Number(metrics.grossSales || 0).toFixed(2)}`);
  lines.push(`Recaudación Real (Cobros):,$${Number(metrics.totalDeposited || 0).toFixed(2)}`);
  lines.push(`Cartera por Cobrar (Saldos):,$${Number(metrics.balanceDue || 0).toFixed(2)}`);
  lines.push(`Gastos de Caja Menor:,$${Number(metrics.totalExpenses || 0).toFixed(2)}`);
  lines.push(`Margen Bruto Estimado:,$${Number(metrics.grossProfit || 0).toFixed(2)} (${metrics.marginPercent || 0}%)`);
  lines.push(`Ticket Promedio:,$${Number(metrics.averageTicket || 0).toFixed(2)}`);
  lines.push(`Total Trabajos / Órdenes:,${metrics.orderCount || orders.length}`);
  lines.push('');

  lines.push('--- RECAUDACIÓN POR MÉTODO DE PAGO ---');
  lines.push(`Efectivo en Gavetas:,$${Number(metrics.paymentMethods?.cash || 0).toFixed(2)}`);
  lines.push(`Transferencias Bancarias:,$${Number(metrics.paymentMethods?.transfer || 0).toFixed(2)}`);
  lines.push(`Tarjetas Datafast / Medianet:,$${Number(metrics.paymentMethods?.card || 0).toFixed(2)}`);
  lines.push(`Cheques:,$${Number(metrics.paymentMethods?.check || 0).toFixed(2)}`);
  lines.push('');

  if (agingData && agingData.totalDebt > 0) {
    lines.push('--- ANTIGÜEDAD DE CARTERA (CUENTAS POR COBRAR) ---');
    lines.push(`Corriente (0-15 días):,$${Number(agingData.bucket0to15 || 0).toFixed(2)}`);
    lines.push(`Crédito Corto (16-30 días):,$${Number(agingData.bucket16to30 || 0).toFixed(2)}`);
    lines.push(`Vencido (31-60 días):,$${Number(agingData.bucket31to60 || 0).toFixed(2)}`);
    lines.push(`Mora Crítica (+60 días):,$${Number(agingData.bucketOver60 || 0).toFixed(2)}`);
    lines.push(`Total Cartera Activa:,$${Number(agingData.totalDebt || 0).toFixed(2)}`);
    lines.push('');
  }

  lines.push('--- LIBRO DETALLADO DE ÓRDENES ---');
  lines.push('Numero,Fecha,Asesora,Cliente,RUC/CI,Telefono,Trabajo,Etapa,Total ($),Abono ($),Saldo ($)');
  orders.forEach((o) => {
    const adv = advisors.find((a) => a.id === o.advisorId);
    lines.push([
      o.orderNumber,
      o.orderDate,
      adv ? adv.name : (o.advisorId || 'Ventas'),
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.customerIdentification || ''}"`,
      `"${o.customerPhone || ''}"`,
      `"${(o.jobName || '').replace(/"/g, '""')}"`,
      o.productionStage || 'preprensa',
      Number(o.totalAmount || 0).toFixed(2),
      Number(o.depositAmount || 0).toFixed(2),
      Number(o.balanceDue || 0).toFixed(2)
    ].join(','));
  });

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `gigaprint_reporte_financiero_${toISODate()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

