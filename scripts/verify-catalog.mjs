import fs from 'node:fs';

const rawCatalog = JSON.parse(fs.readFileSync(new URL('../src/data/estebanCatalog.json', import.meta.url), 'utf8'));

const numberFromLabel = (value) => {
  const match = String(value ?? '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const quantityLabel = (value) => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || !/\d/.test(text)) return false;
  if (/^precio\s*\d/i.test(text)) return false;
  if (/^pvp/i.test(text)) return false;
  return /^\d+(?:[.,]\d+)?(?:\s*(?:-|–|—|a|x|\/|hasta)\s*\d+(?:[.,]\d+)?)?(?:\s*(?:m2|m²|cm|unidades?|uds?|millar|millares|resma|resmas))?$/i.test(text);
};

function isAreaProduct(category, text) {
  const haystack = `${category} ${text}`.toLowerCase();
  return /campana\s+lonas|\bm2\b|m²|gran formato/.test(haystack) || /lona|vinil|microperforado|panaflex|tela.*bandera/.test(haystack);
}

function isTotalTierProduct(category) {
  return /imprenta|precios imprenta|radiografia|boutique|fundas camiseta/.test(String(category).toLowerCase());
}

function buildGroupKey(row) {
  const cat = String(row.categoria).trim();
  const productIsQuantity = quantityLabel(row.producto);
  const variantIsQuantity = quantityLabel(row.variante);
  
  if (['Extras', 'Precios Imprenta', 'Souvenirs'].includes(cat)) {
    return `${cat}::${row.producto}`;
  }
  
  if (productIsQuantity && !variantIsQuantity) return cat;
  if (productIsQuantity && variantIsQuantity) return cat;
  return `${cat}::${row.producto}`;
}

const grouped = new Map();
rawCatalog.forEach((row) => {
  const key = buildGroupKey(row);
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
});

console.log(`Total rows in catalog: ${rawCatalog.length}`);
console.log(`Total grouped products: ${grouped.size}`);

let areaCount = 0;
let tierTotalCount = 0;
let unitCount = 0;

for (const [key, rows] of grouped.entries()) {
  const cat = rows[0].categoria;
  const isArea = isAreaProduct(cat, rows[0].producto);
  const isTotal = isTotalTierProduct(cat);
  const mode = isTotal ? 'tier-total' : isArea ? 'area' : 'unit';
  if (mode === 'area') areaCount++;
  else if (mode === 'tier-total') tierTotalCount++;
  else unitCount++;
}

console.log(`Modes distribution: ${areaCount} area (m²), ${tierTotalCount} tier-total (lotes), ${unitCount} unit (escalas)`);
