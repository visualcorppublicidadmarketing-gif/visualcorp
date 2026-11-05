export type POSSearchProduct = {
  id: string;
  name: string;
  sku?: string;
  family?: string;
  unit?: string;
  image?: string;
  price?: number;
  confirmed?: boolean;
  published?: boolean;
};

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function rankPOSProducts<T extends POSSearchProduct>(products: T[], query: string, codesByProduct: Record<string, string[]>): T[] {
  const normalized = normalize(query);
  if (!normalized) return products;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return products.map((product) => {
    const sku = normalize(product.sku || product.id);
    const stockCodes = (codesByProduct[product.id] || []).map(normalize);
    const name = normalize(product.name);
    const combined = `${name} ${sku} ${normalize(product.family)} ${stockCodes.join(' ')}`;
    if (!tokens.every((token) => combined.includes(token))) return null;
    const exactCode = sku === normalized || stockCodes.includes(normalized);
    const codeStarts = sku.startsWith(normalized) || stockCodes.some((code) => code.startsWith(normalized));
    const score = exactCode ? 0 : codeStarts ? 1 : name === normalized ? 2 : name.startsWith(normalized) ? 3 : tokens.every((token) => name.includes(token)) ? 4 : 5;
    return { product, score };
  }).filter((entry): entry is { product: T; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score || a.product.name.localeCompare(b.product.name, 'es'))
    .map((entry) => entry.product);
}
