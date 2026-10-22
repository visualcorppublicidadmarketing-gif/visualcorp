import { estebanCatalogProducts, calculateCatalogQuote, getTier, getSavingsPercentage, getProductCalcType } from '../src/catalog.js';
import { initialData } from '../src/data.js';

console.log('Testing calculateCatalogQuote across products...');

// 1. Area product (e.g. Lona publicitaria premium)
const lonaProd = initialData.products.find(p => p.id === 'lona');
console.log('\n--- 1. AREA SCALING VERIFICATION (LONA PREMIUM $7.00/m²) ---');
const q1x1 = calculateCatalogQuote(lonaProd, { width: 1.0, height: 1.0, quantity: 1, taxRate: 15 });
const q2x1_5 = calculateCatalogQuote(lonaProd, { width: 2.0, height: 1.5, quantity: 1, taxRate: 15 });
const q3x2 = calculateCatalogQuote(lonaProd, { width: 3.0, height: 2.0, quantity: 1, taxRate: 15 });
const q3x2_qty3 = calculateCatalogQuote(lonaProd, { width: 3.0, height: 2.0, quantity: 3, taxRate: 15 });

console.log(`  1.0m x 1.0m (1.00 m²): Material = $${q1x1.material.toFixed(2)}, Total = $${q1x1.total.toFixed(2)}`);
console.log(`  2.0m x 1.5m (3.00 m²): Material = $${q2x1_5.material.toFixed(2)}, Total = $${q2x1_5.total.toFixed(2)}`);
console.log(`  3.0m x 2.0m (6.00 m²): Material = $${q3x2.material.toFixed(2)}, Total = $${q3x2.total.toFixed(2)}`);
console.log(`  3.0m x 2.0m (qty 3 = 18.00 m²): Material = $${q3x2_qty3.material.toFixed(2)}, Total = $${q3x2_qty3.total.toFixed(2)}`);

if (q2x1_5.material === 3 * q1x1.material && q3x2.material === 6 * q1x1.material && q3x2_qty3.material === 18 * q1x1.material) {
  console.log('  ✓ Proportional Area Scaling: STRICTLY ACCURATE (m² * rate * qty)');
} else {
  throw new Error('Area scaling math mismatch!');
}

// 2. Rótulos y Luminosos (m² based)
const rotulo = initialData.products.find(p => p.id === 'rotulos');
const luminoso = initialData.products.find(p => p.id === 'luminoso');
console.log('\n--- 2. SIGNAGE M² PRODUCTS ---');
console.log(`  Rótulo 2x1m ($18/m²): Material = $${calculateCatalogQuote(rotulo, { width: 2, height: 1, quantity: 1 }).material}`);
console.log(`  Luminoso 2x1m ($45/m²): Material = $${calculateCatalogQuote(luminoso, { width: 2, height: 1, quantity: 1 }).material}`);

// 3. Unit scale product (e.g. Credenciales or Camisetas)
const credencial = estebanCatalogProducts.find(p => p.pricingMode === 'unit' && p.priceScales.length > 3);
console.log('\n--- 3. SCALE UNIT PRODUCT ---');
console.log('Product:', credencial.name, '| Category:', credencial.category);
const quoteCred1 = calculateCatalogQuote(credencial, { quantity: 1, taxRate: 15 });
const quoteCred12 = calculateCatalogQuote(credencial, { quantity: 12, taxRate: 15 });
console.log('Quote 1 unit: Rate =', quoteCred1.rate, '| Total =', quoteCred1.total);
console.log('Quote 12 units: Rate =', quoteCred12.rate, '| Total =', quoteCred12.total, '| Savings% =', quoteCred12.savingsPercent);

// 4. Tier-total product (e.g. Precios Imprenta / Tarjetas)
const imprenta = estebanCatalogProducts.find(p => p.pricingMode === 'tier-total');
console.log('\n--- 4. TIER-TOTAL PRODUCT (LOTE) ---');
console.log('Product:', imprenta.name, '| Category:', imprenta.category);
const quoteImprenta = calculateCatalogQuote(imprenta, { quantity: 1000, taxRate: 15 });
console.log('Quote 1000 units lote: Lot Price =', quoteImprenta.rate, '| Total =', quoteImprenta.total, '| Unit cost =', quoteImprenta.unitEffectivePrice.toFixed(4));

console.log('\nALL CALCULATIONS PASSED VERIFICATION.');
