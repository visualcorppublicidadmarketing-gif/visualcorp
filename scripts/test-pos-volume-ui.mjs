import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const organization = '10000000-0000-0000-0000-000000000001';
const user = { id: '10000000-0000-0000-0000-000000000002', aud: 'authenticated', role: 'authenticated', email: 'pos@example.test', app_metadata: {}, user_metadata: {} };
const origin = 'https://mock-pos.supabase.co';
let savedPrices;
const catalog = [
  { id: 'box', name: 'Caja', type: 'unit', calc_type: 'unit', price: 3, sku: 'A1' },
  { id: 'area', name: 'Lona', type: 'service', calc_type: 'm2', price: 10, sku: 'A2' },
  { id: 'dtf', name: 'Camiseta DTF A3 Colores', type: 'service', calc_type: 'scale', price: 18, sku: 'SV083',
    custom_options: { quantity_pricing: { legacy_skus: ['SV084', 'SV090'] } },
    price_scales: [
      { qty: 1, max_qty: 1, pvp: 18, option_prices: [{ option: 'S a XL', price: 18 }, { option: 'XXL a XXXL', price: 22 }] },
      { qty: 2, max_qty: 4, pvp: 12, option_prices: [{ option: 'S a XL', price: 12 }, { option: 'XXL a XXXL', price: 15 }] },
      { qty: 101, max_qty: 200, pvp: 8, option_prices: [{ option: 'S a XL', price: 8 }, { option: 'XXL a XXXL', price: 9 }] },
      { option: 'S a XL', price: 18 },
      { option: 'XXL a XXXL', price: 22 },
    ],
  },
].map((item) => ({ ...item, category: 'Ejemplos', is_published: true, product_kind: 'catalog' }));

process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_ANON_KEY = 'pos-ui-test-key';
const server = await createServer({ server: { host: '127.0.0.1', port: Number(process.env.POS_TEST_PORT || 0) } });
let browser;
try {
  await server.listen();
  const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({
    ...(process.env.POS_TEST_CHROME ? { executablePath: process.env.POS_TEST_CHROME } : {}),
    ...(process.env.POS_TEST_CDP ? { args: [`--remote-debugging-port=${process.env.POS_TEST_CDP}`] } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await page.addInitScript((authUser) => localStorage.setItem('sb-mock-pos-auth-token', JSON.stringify({
    access_token: 'fixture', refresh_token: 'fixture', token_type: 'bearer', expires_at: 4102444800, user: authUser,
  })), user);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(`${origin}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const end = pathname.split('/').at(-1);
    let payload = [];
    if (end === 'user') payload = user;
    if (end === 'get_my_visualcorp_access') payload = {
      organization_id: organization, roles: [{ key: 'owner', name: 'Propietario', role: 'owner' }],
      permissions: { sales: { view: true, edit: true }, catalog: { view: true, edit: true }, catalog_admin: { view: true, edit_prices: true } }, work_access_open: true,
    };
    if (end === 'branches') payload = [{ id: 'branch-pos', code: 'VIS', name: 'Mostrador' }];
    if (end === 'site_settings') payload = null;
    if (end === 'public_quote_catalog_products') payload = catalog;
    if (end === 'catalog_products' && route.request().method() === 'PATCH') {
      savedPrices = route.request().postDataJSON();
      const shirt = catalog.find((item) => item.id === 'dtf');
      Object.assign(shirt, savedPrices);
      payload = { id: shirt.id };
    }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    await route.fulfill({ json: payload, headers });
  });
  await page.goto(`${baseUrl}/operaciones/pos`);
  const products = page.getByRole('button', { name: 'Productos por cantidad (1)' });
  const area = page.getByRole('button', { name: 'Servicios por m² (1)' });
  const services = page.getByRole('button', { name: 'Servicios por cantidad (1)' });
  await expect(products).toHaveAttribute('aria-pressed', 'true');
  await area.click();
  await expect(area).toHaveAttribute('aria-pressed', 'true');
  await expect(products).toHaveText('Productos por cantidad (1)');
  await services.click();
  const search = page.getByRole('searchbox', { name: /buscar o escanear sku/i });
  await search.fill('SV090');
  await search.press('Enter');
  const quantity = page.locator('#pos-cart-quantity');
  await expect(quantity).toBeVisible();
  const unit = page.locator('.pos-entry-kind-note[aria-live]');
  for (const [count, amount] of [['1', '18'], ['4', '12'], ['101', '8']]) {
    await quantity.fill(count);
    await expect(unit).toContainText(new RegExp(`\\b${amount}[.,]00`));
  }
  await page.getByLabel('Talla u opción de producción').selectOption('XXL a XXXL');
  await expect(unit).toContainText(/\b9[.,]00/);
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.locator('.pos-cart-line-wrap')).toContainText('Camiseta DTF A3 Colores');
  await search.fill('SV090');
  await search.press('Enter');
  await quantity.fill('201');
  await expect(page.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();
  await page.getByText('Tarifas por cantidad (3)').click();
  for (const width of [320, 390, 768, 1280, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Overflow at ${width}px`);
  }
  await page.goto(`${baseUrl}/operaciones/catalogo`);
  await page.getByRole('button', { name: 'Ver catálogo completo (3)' }).click();
  await expect(page.getByText('Camiseta DTF A3 Colores', { exact: true }).first()).toBeVisible();
  await page.getByText('Tarifas por cantidad (3)').click();
  await expect(page.getByRole('table').filter({ has: page.getByText('101–200', { exact: true }) })).toBeVisible();
  const shirtEditor = page.locator('.catalog-pricing-editor').filter({ hasText: 'Tarifas por cantidad (3)' });
  await shirtEditor.getByText('Editar escalas (3)').click();
  await shirtEditor.getByRole('spinbutton', { name: 'S a XL, escala 2', exact: true }).fill('13');
  await shirtEditor.getByRole('button', { name: 'Guardar tarifas' }).click();
  await expect(shirtEditor.getByText(/Tarifas y escalas guardadas/)).toBeVisible();
  assert.equal(savedPrices.price_scales.find((scale) => scale.qty === 2).pvp, 13);
  await page.goto(`${baseUrl}/operaciones/pos`);
  await services.click();
  await search.fill('SV090');
  await search.press('Enter');
  await quantity.fill('4');
  await expect(unit).toContainText(/\b13[.,]00/);
  assert.deepEqual(errors, []);
  console.log('POS y catálogo verificados con navegación, SKU histórico, límites, carrito y 5 tamaños de pantalla.');
} finally {
  await browser?.close();
  await server.close();
}
