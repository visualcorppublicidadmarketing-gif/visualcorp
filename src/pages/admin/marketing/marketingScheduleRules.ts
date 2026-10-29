const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function marketingDateKey(date = new Date()): string {
  return DATE_FORMATTER.format(date);
}

function dateFromKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) || dateKeyFromDate(date) !== value ? null : date;
}

function dateKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextWeekday(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  while (result.getDay() === 0 || result.getDay() === 6) result.setDate(result.getDate() + 1);
  return result;
}

function firstWeekdayOnOrAfter(date: Date): Date {
  const result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6) result.setDate(result.getDate() + 1);
  return result;
}

/** Rolls overdue work forward by one day, skipping Saturday and Sunday. */
export function nextMarketingPublicationDate(scheduledDate: string, today: string): string | null {
  const scheduled = dateFromKey(scheduledDate.slice(0, 10));
  const current = dateFromKey(today);
  if (!scheduled || !current || scheduled >= current) return null;

  const nextAfterSchedule = nextWeekday(scheduled);
  const target = nextAfterSchedule < current ? firstWeekdayOnOrAfter(current) : nextAfterSchedule;
  return dateKeyFromDate(target);
}

export function isTerminalMarketingStatus(status = ''): boolean {
  return /publicad|complet|terminad|finalizad|cancelad|anulad|archivad/i.test(status);
}

export function marketingWeekStart(dateKey: string): string {
  const date = dateFromKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateKeyFromDate(date);
}

export function addMarketingDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
}
