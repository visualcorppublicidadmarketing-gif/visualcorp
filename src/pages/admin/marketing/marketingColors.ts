export const MARKETING_COLORS = ['#7141a6', '#2477a8', '#17846d', '#c28a13', '#d45a35', '#bc3e68', '#5966b3', '#697582'];

const normalizeColor = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLocaleLowerCase('en');
  return MARKETING_COLORS.find((color) => color === normalized) || '';
};

export const getMarketingTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => !!tag && !normalizeColor(tag));
};

export const getMarketingCalendarColor = (color: unknown, tags: unknown): string => {
  const savedColor = normalizeColor(color);
  if (savedColor) return savedColor;
  if (!Array.isArray(tags)) return '';
  return tags.map(normalizeColor).find(Boolean) || '';
};
