/** Normalize staff names for consistent display and storage. */
export function normalizePersonName(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-EC')
    .replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase('es-EC'));
}
