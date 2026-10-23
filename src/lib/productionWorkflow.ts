export const PRODUCTION_AREAS = [
  { id: 'asesoria', label: 'Asesoría', icon: 'Handshake', color: '#0f766e', capacityMinutes: 480 },
  { id: 'diseno', label: 'Diseño', icon: 'Palette', color: '#7c3aed', capacityMinutes: 480 },
  { id: 'aprobacion', label: 'Aprobación', icon: 'BadgeCheck', color: '#d97706', capacityMinutes: 480 },
  { id: 'impresion', label: 'Impresión', icon: 'Printer', color: '#2563eb', capacityMinutes: 480 },
  { id: 'corte_laser', label: 'Corte láser / CNC', icon: 'ScanLine', color: '#9333ea', capacityMinutes: 480 },
  { id: 'sublimacion', label: 'Sublimación / DTF', icon: 'Shirt', color: '#db2777', capacityMinutes: 480 },
  { id: 'taller', label: 'Taller / Armado', icon: 'Hammer', color: '#ea580c', capacityMinutes: 480 },
  { id: 'calidad', label: 'Control de calidad', icon: 'ShieldCheck', color: '#059669', capacityMinutes: 480 },
  { id: 'entrega', label: 'Entrega / Instalación', icon: 'Truck', color: '#334155', capacityMinutes: 480 }
];

export const AREA_BY_ID = Object.fromEntries(PRODUCTION_AREAS.map((area) => [area.id, area]));

const AREA_KEYWORDS = {
  impresion: ['lona', 'vinil', 'banner', 'afiche', 'flyer', 'volante', 'tarjeta', 'adhesiv', 'microperfor', 'impresi', 'gigantograf', 'backlit'],
  corte_laser: ['laser', 'láser', 'acril', 'mdf', 'sintra', 'pvc', 'cnc', 'grabado', 'corte', 'corpóre', 'corpore', 'lámpara', 'lampara'],
  sublimacion: ['sublima', 'dtf', 'camiseta', 'textil', 'taza', 'gorra', 'almohada', 'cojín', 'cojin', 'jarro', 'prenda'],
  taller: ['rótulo', 'rotulo', 'letrero', 'luminos', 'neón', 'neon', 'estructura', 'caja de luz', 'lámpara', 'lampara', 'armado', 'instalación', 'instalacion']
};

const unique = (values) => [...new Set(values.filter(Boolean))];

function itemText(item = {}) {
  return `${item.productName || item.name || ''} ${item.category || ''} ${item.finishing || ''} ${item.notes || ''} ${JSON.stringify(item.customDetails || {})}`.toLowerCase();
}

function matchesArea(text, area) {
  return (AREA_KEYWORDS[area] || []).some((keyword) => text.includes(keyword));
}

export function inferProductionAreas(items = [], options = {}) {
  const detected = [];
  items.forEach((item) => {
    const text = itemText(item);
    Object.keys(AREA_KEYWORDS).forEach((area) => {
      if (matchesArea(text, area)) detected.push(area);
    });
  });

  if (!detected.length && items.length) detected.push(options.assignedArea || 'impresion');
  if (options.assignedArea && options.assignedArea !== 'mixto') detected.push(options.assignedArea);
  if (options.requiresInstallation) detected.push('taller');

  return unique(detected).sort((a, b) => {
    const order = ['impresion', 'corte_laser', 'sublimacion', 'taller'];
    return order.indexOf(a) - order.indexOf(b);
  });
}

export function estimateAreaMinutes(area, items = []) {
  const quantity = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
  const squareMeters = items.reduce((sum, item) => sum + Number(item.areaM2 || 0) * Math.max(1, Number(item.quantity || 1)), 0);
  const complex = items.some((item) => /ne[oó]n|luminos|corp[oó]re|estructura|l[aá]mpara/i.test(itemText(item)));

  const estimates = {
    asesoria: 15,
    diseno: Math.max(30, 25 + quantity * 10),
    aprobacion: 15,
    impresion: Math.max(30, Math.ceil(squareMeters * 8 + quantity * 5)),
    corte_laser: Math.max(45, quantity * 20 + (complex ? 60 : 0)),
    sublimacion: Math.max(35, quantity * 12),
    taller: Math.max(60, quantity * 25 + (complex ? 120 : 0)),
    calidad: Math.max(15, quantity * 5),
    entrega: 30
  };
  return Math.min(1440, estimates[area] || 30);
}

function nextWorkingStart(value) {
  const date = new Date(value);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  if (date.getHours() < 8) date.setHours(8, 0, 0, 0);
  if (date.getHours() >= 17) {
    date.setDate(date.getDate() + 1);
    date.setHours(8, 0, 0, 0);
    return nextWorkingStart(date);
  }
  return date;
}

function addWorkingMinutes(startValue, minutes) {
  let current = nextWorkingStart(startValue);
  let remaining = Math.max(1, Number(minutes || 1));
  while (remaining > 0) {
    const endOfDay = new Date(current);
    endOfDay.setHours(17, 0, 0, 0);
    const available = Math.max(0, (endOfDay - current) / 60000);
    const used = Math.min(remaining, available);
    current = new Date(current.getTime() + used * 60000);
    remaining -= used;
    if (remaining > 0) {
      current.setDate(current.getDate() + 1);
      current.setHours(8, 0, 0, 0);
      current = nextWorkingStart(current);
    }
  }
  return current;
}

export function isEligibleForProductionArea(person, area) {
  const roleAreas = {
    diseno: ['disenador'],
    impresion: ['operador_impresion'],
    corte_laser: ['operador_corte_laser'],
    sublimacion: ['operador_sublimacion'],
    taller: ['coordinador_taller', 'operador_taller'],
    calidad: ['coordinador_taller', 'encargado_local'],
    entrega: ['instalador', 'coordinador_taller']
  };
  if (['admin', 'super_admin'].includes(person.role)) return true;
  return person.assignedArea === area || (roleAreas[area] || []).includes(person.role);
}

function selectLeastLoadedStaff(advisors, operations, area) {
  const candidates = advisors.filter((person) => person.isActive !== false && isEligibleForProductionArea(person, area));
  if (!candidates.length) return null;
  const load = Object.fromEntries(candidates.map((person) => [person.id, 0]));
  operations.forEach((operation) => {
    if (operation.assignedTo && load[operation.assignedTo] !== undefined && !['done', 'cancelled'].includes(operation.status)) {
      load[operation.assignedTo] += Number(operation.estimatedMinutes || 0);
    }
  });
  return candidates.sort((a, b) => load[a.id] - load[b.id])[0];
}

export function buildProductionPlan(order, items = [], options = {}) {
  const idBase = order.id || `ord-${Date.now()}`;
  const now = options.startAt ? new Date(options.startAt) : new Date();
  const selectedAreas = unique(options.involvedAreas?.length
    ? options.involvedAreas
    : inferProductionAreas(items, { assignedArea: order.assignedArea, requiresInstallation: order.requiresInstallation }));
  const existing = options.existingOperations || [];
  const advisors = options.advisors || [];
  const operations = [];

  const add = (area, title, dependencies = [], extra = {}) => {
    const estimatedMinutes = extra.estimatedMinutes || estimateAreaMinutes(area, items);
    const dependencyEnds = dependencies
      .map((id) => operations.find((operation) => operation.id === id)?.scheduledEnd)
      .filter(Boolean)
      .map((date) => new Date(date));
    const areaEnds = [...existing, ...operations]
      .filter((operation) => operation.area === area && !['done', 'cancelled'].includes(operation.status) && operation.scheduledEnd)
      .map((operation) => new Date(operation.scheduledEnd));
    const candidates = [now, ...dependencyEnds, ...areaEnds];
    const start = nextWorkingStart(new Date(Math.max(...candidates.map((date) => date.getTime()))));
    const end = addWorkingMinutes(start, estimatedMinutes);
    const assignee = selectLeastLoadedStaff(advisors, [...existing, ...operations], area);
    const operation = {
      id: `op-${idBase}-${area}`,
      orderId: idBase,
      area,
      title,
      sequence: operations.length + 1,
      dependsOn: dependencies,
      status: extra.status || (dependencies.every((id) => operations.find((operation) => operation.id === id)?.status === 'done') ? 'ready' : 'blocked'),
      assignedTo: extra.assignedTo || assignee?.id || null,
      estimatedMinutes,
      actualMinutes: 0,
      scheduledStart: start.toISOString(),
      scheduledEnd: end.toISOString(),
      startedAt: null,
      completedAt: extra.status === 'done' ? new Date().toISOString() : null,
      requiresApproval: Boolean(extra.requiresApproval),
      notes: extra.notes || '',
      metadata: { itemIds: items.map((item) => item.id).filter(Boolean), automatic: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    operations.push(operation);
    return operation.id;
  };

  const adviceId = add('asesoria', 'Venta y levantamiento del requerimiento', [], {
    status: 'done', assignedTo: order.advisorId, estimatedMinutes: 15
  });
  const designId = add('diseno', 'Diseño y preparación de archivos', [adviceId]);
  const approvalId = add('aprobacion', 'Aprobación de arte por el cliente', [designId], { requiresApproval: true });
  const productionIds = selectedAreas.filter((area) => area !== 'taller').map((area) => add(area, AREA_BY_ID[area]?.label || area, [approvalId]));
  const workshopNeeded = selectedAreas.includes('taller');
  const workshopId = workshopNeeded ? add('taller', 'Fabricación, armado y acabados', productionIds.length ? productionIds : [approvalId]) : null;
  const qualityDependencies = workshopId ? [workshopId] : (productionIds.length ? productionIds : [approvalId]);
  const qualityId = add('calidad', 'Control de calidad y embalaje', qualityDependencies);
  add('entrega', order.requiresInstallation ? 'Instalación y cierre con el cliente' : 'Entrega y cierre con el cliente', [qualityId]);

  return { involvedAreas: selectedAreas, operations };
}

export function recalculateOperationReadiness(operations = []) {
  const byId = Object.fromEntries(operations.map((operation) => [operation.id, operation]));
  return operations.map((operation) => {
    if (['done', 'in_progress', 'cancelled'].includes(operation.status)) return operation;
    const dependenciesDone = (operation.dependsOn || []).every((id) => byId[id]?.status === 'done');
    return { ...operation, status: dependenciesDone ? 'ready' : 'blocked' };
  });
}

export function getAreaCapacity(operations = [], date, area) {
  const day = typeof date === 'string' ? date : new Date(date).toISOString().slice(0, 10);
  const usedMinutes = operations
    .filter((operation) => operation.area === area && !['done', 'cancelled'].includes(operation.status) && operation.scheduledStart?.slice(0, 10) === day)
    .reduce((sum, operation) => sum + Number(operation.estimatedMinutes || 0), 0);
  const capacityMinutes = AREA_BY_ID[area]?.capacityMinutes || 480;
  return { usedMinutes, capacityMinutes, percentage: Math.round((usedMinutes / capacityMinutes) * 100) };
}
