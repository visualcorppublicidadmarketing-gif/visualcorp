/**
 * Schedule & Business Hours Engine for Gigaprint
 * Handles dynamic live business status, timezone calculations (America/Guayaquil UTC-5),
 * weekly recurring schedules, lunch pauses, and holiday/special date overrides.
 */

export const DEFAULT_BUSINESS_SCHEDULE = {
  enabled: true,
  timezone: 'America/Guayaquil',
  noticeMessage: 'Atención presencial en taller y pedidos online.',
  emergencyWhatsAppText: 'Hola Gigaprint, les escribo fuera de horario para coordinar una cotización urgente.',
  days: {
    1: { id: 1, name: 'Lunes', short: 'Lun', isOpen: true, open: '10:00', close: '18:00', note: 'Apertura 10:00 am' },
    2: { id: 2, name: 'Martes', short: 'Mar', isOpen: true, open: '08:30', close: '18:00', note: 'Jornada continua' },
    3: { id: 3, name: 'Miércoles', short: 'Mié', isOpen: true, open: '08:30', close: '18:00', note: 'Jornada continua' },
    4: { id: 4, name: 'Jueves', short: 'Jue', isOpen: true, open: '08:30', close: '18:00', note: 'Jornada continua' },
    5: { id: 5, name: 'Viernes', short: 'Vie', isOpen: true, open: '08:30', close: '18:00', note: 'Jornada continua' },
    6: { id: 6, name: 'Sábado', short: 'Sáb', isOpen: true, open: '08:30', close: '12:30', note: 'Mostrador y entregas' },
    0: { id: 0, name: 'Domingo', short: 'Dom', isOpen: false, open: '09:00', close: '13:00', note: 'Solo citas / WhatsApp' }
  },
  holidays: [
    { id: 'hol-1', date: '2026-01-01', name: 'Año Nuevo', isOpen: false, note: 'Cerrado por feriado nacional' },
    { id: 'hol-2', date: '2026-02-16', name: 'Carnaval (Día 1)', isOpen: false, note: 'Feriado nacional' },
    { id: 'hol-3', date: '2026-02-17', name: 'Carnaval (Día 2)', isOpen: false, note: 'Feriado nacional' },
    { id: 'hol-4', date: '2026-04-03', name: 'Viernes Santo', isOpen: false, note: 'Semana Santa' },
    { id: 'hol-5', date: '2026-05-01', name: 'Día del Trabajo', isOpen: false, note: 'Feriado nacional' },
    { id: 'hol-6', date: '2026-05-24', name: 'Batalla de Pichincha', isOpen: false, note: 'Feriado cívico' },
    { id: 'hol-7', date: '2026-08-10', name: 'Primer Grito de Independencia', isOpen: false, note: 'Feriado nacional' },
    { id: 'hol-8', date: '2026-10-09', name: 'Independencia de Guayaquil', isOpen: false, note: 'Feriado nacional' },
    { id: 'hol-10', date: '2026-09-17', name: 'Cantonización de Milagro', isOpen: false, note: 'Feriado local Milagro' },
    { id: 'hol-11', date: '2026-11-03', name: 'Independencia de Cuenca', isOpen: false, note: 'Feriado nacional' },
    { id: 'hol-12', date: '2026-12-25', name: 'Navidad', isOpen: false, note: 'Cerrado por Navidad' }
  ]
};

/**
 * Formats time string 'HH:MM' into minutes from midnight
 */
export function timeStrToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Converts minutes from midnight to 12h/24h formatted string
 */
export function minutesToTimeStr(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Returns formatted 12-hour string (e.g. '08:30 am', '06:00 pm')
 */
export function formatTime12h(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  let h = Number(hStr);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Normalizes ISO date string 'YYYY-MM-DD'
 */
export function getISODateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculates current live business status based on current schedule configuration
 */
export function calculateLiveScheduleStatus(scheduleConfig = DEFAULT_BUSINESS_SCHEDULE, referenceDate = new Date()) {
  const config = { ...DEFAULT_BUSINESS_SCHEDULE, ...(scheduleConfig || {}) };
  const days = config.days || DEFAULT_BUSINESS_SCHEDULE.days;
  const holidays = Array.isArray(config.holidays) ? config.holidays : DEFAULT_BUSINESS_SCHEDULE.holidays;

  const currentISODate = getISODateString(referenceDate);
  const currentDayOfWeek = referenceDate.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
  const currentMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const currentSeconds = referenceDate.getSeconds();

  // Check if today matches any special holiday override
  const matchedHoliday = holidays.find((h) => h.date === currentISODate);

  let todayConfig = days[currentDayOfWeek] || { isOpen: false, open: '09:00', close: '18:00', name: 'Hoy' };
  let isHolidayOverride = false;

  if (matchedHoliday) {
    isHolidayOverride = true;
    todayConfig = {
      ...todayConfig,
      name: matchedHoliday.name || todayConfig.name,
      isOpen: Boolean(matchedHoliday.isOpen),
      open: matchedHoliday.open || todayConfig.open,
      close: matchedHoliday.close || todayConfig.close,
      note: matchedHoliday.note || (matchedHoliday.isOpen ? 'Horario especial de feriado' : 'Cerrado por feriado')
    };
  }

  const openMinutes = timeStrToMinutes(todayConfig.open);
  const closeMinutes = timeStrToMinutes(todayConfig.close);

  let status = 'closed'; // 'open' | 'closing_soon' | 'closed' | 'holiday'
  let badgeLabel = 'Cerrado Ahora';
  let badgeColor = '#dc2626'; // Red
  let statusMessage = '';
  let timeRemainingMinutes = 0;

  if (!todayConfig.isOpen) {
    if (isHolidayOverride) {
      status = 'holiday';
      badgeLabel = `Feriado: ${matchedHoliday.name}`;
      badgeColor = '#7c3aed'; // Purple
      statusMessage = matchedHoliday.note || 'Cerrado por feriado nacional';
    } else {
      status = 'closed';
      badgeLabel = 'Cerrado Hoy';
      badgeColor = '#64748b'; // Slate
      statusMessage = todayConfig.note || 'No hay atención presencial hoy';
    }
  } else if (currentMinutes < openMinutes) {
    status = 'closed';
    badgeLabel = 'Cerrado Ahora';
    badgeColor = '#ea580c'; // Orange
    statusMessage = `Abrimos hoy a las ${todayConfig.open} (${formatTime12h(todayConfig.open)})`;
    timeRemainingMinutes = openMinutes - currentMinutes;
  } else if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    timeRemainingMinutes = closeMinutes - currentMinutes;
    if (timeRemainingMinutes <= 45) {
      status = 'closing_soon';
      badgeLabel = 'Cierra Pronto';
      badgeColor = '#d97706'; // Amber
      statusMessage = `Cierra en ${timeRemainingMinutes} min (a las ${todayConfig.close})`;
    } else {
      status = 'open';
      badgeLabel = 'Abierto Ahora';
      badgeColor = '#16a34a'; // Green
      statusMessage = `Atendiendo hoy hasta las ${todayConfig.close} (${formatTime12h(todayConfig.close)})`;
    }
  } else {
    // Already closed for the day
    status = 'closed';
    badgeLabel = 'Cerrado por Hoy';
    badgeColor = '#dc2626';
    statusMessage = `Cerró a las ${todayConfig.close}`;
  }

  // Calculate Next Opening Day and Time
  let nextOpenInfo = null;
  if (status === 'closed' || status === 'holiday') {
    for (let offset = (currentMinutes < openMinutes && todayConfig.isOpen ? 0 : 1); offset <= 7; offset++) {
      const nextDate = new Date(referenceDate);
      nextDate.setDate(referenceDate.getDate() + offset);
      const nextISO = getISODateString(nextDate);
      const nextDayIdx = nextDate.getDay();
      
      const hol = holidays.find((h) => h.date === nextISO);
      let dayConf = days[nextDayIdx];
      if (hol) {
        dayConf = { ...dayConf, isOpen: Boolean(hol.isOpen), open: hol.open || dayConf.open, close: hol.close || dayConf.close, name: hol.name };
      }

      if (dayConf && dayConf.isOpen) {
        const dayLabel = offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `el ${dayConf.name}`;
        nextOpenInfo = {
          dayLabel,
          dayName: dayConf.name,
          openTime: dayConf.open,
          dateISO: nextISO,
          message: `Abre ${dayLabel} a las ${dayConf.open} (${formatTime12h(dayConf.open)})`
        };
        break;
      }
    }
  }

  // Build the 7-day visual list (starting on Monday: 1, 2, 3, 4, 5, 6, 0)
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const weeklyScheduleList = dayOrder.map((dayIdx) => {
    const d = days[dayIdx] || DEFAULT_BUSINESS_SCHEDULE.days[dayIdx];
    const isToday = dayIdx === currentDayOfWeek;
    
    // Check if upcoming day has holiday
    const checkDate = new Date(referenceDate);
    const diffDays = (dayIdx - currentDayOfWeek + 7) % 7;
    checkDate.setDate(referenceDate.getDate() + diffDays);
    const targetISO = getISODateString(checkDate);
    const hol = holidays.find((h) => h.date === targetISO);

    let displayOpen = d.isOpen;
    let displayHours = d.isOpen ? `${d.open} — ${d.close}` : 'Cerrado';
    let displayNote = d.note || '';

    if (hol) {
      if (!hol.isOpen) {
        displayHours = `Feriado: ${hol.name}`;
        displayOpen = false;
        displayNote = hol.note || 'Cerrado';
      } else {
        displayHours = `${hol.open} — ${hol.close} (Feriado)`;
        displayOpen = true;
      }
    }

    return {
      dayIndex: dayIdx,
      name: d.name,
      short: d.short,
      isOpen: displayOpen,
      hours: displayHours,
      open: d.open,
      close: d.close,
      note: displayNote,
      isToday,
      holiday: hol || null
    };
  });

  return {
    status, // 'open' | 'closing_soon' | 'closed' | 'holiday'
    badgeLabel,
    badgeColor,
    statusMessage,
    currentTimeStr: `${String(referenceDate.getHours()).padStart(2, '0')}:${String(referenceDate.getMinutes()).padStart(2, '0')}`,
    currentSecondsStr: String(currentSeconds).padStart(2, '0'),
    currentDayName: todayConfig.name,
    todayHoursStr: todayConfig.isOpen ? `${todayConfig.open} — ${todayConfig.close}` : 'Cerrado',
    todayConfig,
    isHoliday: isHolidayOverride,
    holidayName: matchedHoliday?.name || null,
    timeRemainingMinutes,
    nextOpenInfo,
    weeklyScheduleList,
    timezone: config.timezone || 'America/Guayaquil',
    emergencyWhatsAppText: config.emergencyWhatsAppText || DEFAULT_BUSINESS_SCHEDULE.emergencyWhatsAppText
  };
}
