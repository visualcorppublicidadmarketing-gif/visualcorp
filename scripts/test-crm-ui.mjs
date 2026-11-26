import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const baseUrl = 'http://127.0.0.1:5197';
const userId = '10000000-0000-0000-0000-000000000002';
const teammateId = '10000000-0000-0000-0000-000000000003';
const now = '2026-11-26T16:00:00.000Z';
let nextId = 10;
let forceInboxError = false;
const rows = [
  { id: '10000000-0000-0000-0000-000000000101', request_type: 'contact', name: 'Alicia Moretti', company: 'Moretti Taller', phone: '0991234567', email: 'alicia@example.test', service: 'Rótulos', message: 'Necesito información para una fachada.', quote_data: {}, status: 'new', source: 'WhatsApp', assigned_to: null, assigned_name: '', follow_up_at: '2026-11-25T17:00:00.000Z', follow_up_action: 'Llamar para revisar el alcance', lost_reason: '', customer_id: null, created_at: now, updated_at: now },
  { id: '10000000-0000-0000-0000-000000000102', request_type: 'quote', name: 'Bruno Rivera', company: '', phone: '0997654321', email: 'bruno@example.test', service: 'Señalética', message: 'Consulta desde cotizador.', quote_data: { request: { project: 'Local comercial', quantity: 2 } }, status: 'quoted', source: 'Sitio web', assigned_to: userId, assigned_name: 'Asesora de prueba', follow_up_at: '2026-11-26T17:00:00.000Z', follow_up_action: 'Enviar propuesta', lost_reason: '', customer_id: null, created_at: now, updated_at: now },
  { id: '10000000-0000-0000-0000-000000000103', request_type: 'contact', name: 'Camila López', company: '', phone: '', email: 'camila@example.test', service: 'Diseño', message: '', quote_data: {}, status: 'won', source: 'Sitio web', assigned_to: teammateId, assigned_name: 'Equipo de prueba', follow_up_at: null, follow_up_action: '', lost_reason: '', customer_id: null, created_at: now, updated_at: now },
];
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'asesora@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: now };
const session = { access_token: 'mock-access-token', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'mock-refresh-token', user };
const activity = [];
const matchingCustomer = { id: '10000000-0000-0000-0000-000000000201', name: 'Alicia Moretti', phone: '0991234567', email: 'alicia@example.test' };

function response(body, status = 200) {
  return { status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) };
}

function inbox(args) {
  let found = [...rows];
  if (args.p_view === 'mine') found = found.filter((row) => row.assigned_to === userId && !['won', 'lost', 'closed'].includes(row.status));
  if (args.p_view === 'unassigned') found = found.filter((row) => !row.assigned_to && !['won', 'lost', 'closed'].includes(row.status));
  if (args.p_view === 'overdue') found = found.filter((row) => row.follow_up_at && row.follow_up_at < '2026-11-26T05:00:00.000Z');
  if (args.p_view === 'today') found = found.filter((row) => row.follow_up_at && row.follow_up_at >= '2026-11-26T05:00:00.000Z' && row.follow_up_at < '2026-11-27T05:00:00.000Z');
  if (args.p_stage !== 'all') found = found.filter((row) => row.status === args.p_stage);
  if (args.p_source !== 'all') found = found.filter((row) => row.source === args.p_source || (args.p_source === 'Cotizador público' && row.request_type === 'quote'));
  if (args.p_assignee === 'unassigned') found = found.filter((row) => !row.assigned_to);
  else if (args.p_assignee !== 'all') found = found.filter((row) => row.assigned_to === args.p_assignee);
  const term = (args.p_search || '').toLowerCase();
  if (term) found = found.filter((row) => `${row.name} ${row.company} ${row.phone} ${row.email} ${row.service} ${row.message}`.toLowerCase().includes(term));
  const pageSize = Number(args.p_page_size || 25);
  const page = Number(args.p_page || 1);
  return { items: found.slice((page - 1) * pageSize, page * pageSize), total: found.length, page, page_size: pageSize,
    metrics: { new: 1, unassigned: 1, overdue: 1, today: 1, won: 1, received: 3 },
    assignees: [{ id: userId, name: 'Asesora de prueba' }, { id: teammateId, name: 'Equipo de prueba' }] };
}

process.env.VITE_SUPABASE_URL = 'https://mock-crm.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'crm-ui-test-key';
const server = await createServer({ server: { host: '127.0.0.1', port: 5197, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
  await context.addInitScript((authSession) => localStorage.setItem('sb-mock-crm-auth-token', JSON.stringify(authSession)), session);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('https://mock-crm.supabase.co/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill(response(null, 204));
    const url = new URL(request.url());
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill(response(user));
    if (url.pathname.endsWith('/rpc/get_my_visualcorp_access')) return route.fulfill(response({ organization_id: '10000000-0000-0000-0000-000000000001', roles: [{ key: 'advisor', name: 'Asesora', role: 'advisor' }], permissions: { crm: { view: true, edit: true }, quotes: { view: true, edit: true }, dashboard: { view: true } }, work_access_open: true }));
    if (url.pathname.endsWith('/rpc/claim_organization_access_invitations')) return route.fulfill(response(null));
    if (url.pathname.endsWith('/rpc/get_visualcorp_crm_inbox')) {
      if (forceInboxError) return route.fulfill(response({ message: 'Error de conexión simulado.' }, 503));
      return route.fulfill(response(inbox(request.postDataJSON())));
    }
    if (url.pathname.endsWith('/rpc/create_visualcorp_manual_request')) {
      const payload = request.postDataJSON();
      const id = `10000000-0000-0000-0000-${String(nextId++).padStart(12, '0')}`;
      const row = { id, request_type: 'contact', name: payload.p_name, phone: payload.p_phone, email: payload.p_email, company: payload.p_company, service: payload.p_service, message: payload.p_message, quote_data: {}, status: 'new', source: payload.p_source, assigned_to: null, assigned_name: '', follow_up_at: null, follow_up_action: '', lost_reason: '', customer_id: null, created_at: now, updated_at: now };
      rows.unshift(row); activity[id] = [{ id: 'created', kind: 'created', details: { manual: true, source: row.source }, actor: 'Asesora de prueba', created_at: now }];
      return route.fulfill(response(id));
    }
    if (url.pathname.endsWith('/rpc/get_visualcorp_request_detail')) {
      const id = request.postDataJSON().p_request_id;
      const row = rows.find((item) => item.id === id);
      return route.fulfill(response({ ...row, activity: activity[id] || [], quotes: [], matches: id === rows.find((item) => item.name === 'Alicia Moretti')?.id ? [matchingCustomer] : [] }));
    }
    if (url.pathname.endsWith('/rpc/update_visualcorp_request')) {
      const payload = request.postDataJSON(); const row = rows.find((item) => item.id === payload.p_request_id);
      if (payload.p_status) row.status = payload.p_status;
      if (payload.p_update_assignment) { row.assigned_to = payload.p_assigned_to; row.assigned_name = payload.p_assigned_to ? 'Equipo de prueba' : ''; }
      if (payload.p_update_follow_up) { row.follow_up_at = payload.p_follow_up_at; row.follow_up_action = payload.p_follow_up_action; }
      if (payload.p_lost_reason) row.lost_reason = payload.p_lost_reason;
      if (payload.p_note) (activity[row.id] ||= []).unshift({ id: `note-${Date.now()}`, kind: 'note', details: { text: payload.p_note }, actor: 'Asesora de prueba', created_at: now });
      return route.fulfill(response(null));
    }
    if (url.pathname.endsWith('/rpc/log_visualcorp_request_contact')) return route.fulfill(response(null));
    if (url.pathname.endsWith('/rpc/link_visualcorp_request_customer') || url.pathname.endsWith('/rpc/convert_visualcorp_request_to_customer')) {
      return route.fulfill(response(matchingCustomer.id));
    }
    if (url.pathname.includes('/rest/v1/')) return route.fulfill(response([]));
    return route.fulfill(response(null));
  });

  await page.goto(`${baseUrl}/operaciones/crm`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Solicitudes y Prospectos CRM' }).waitFor();
  await page.getByRole('row', { name: /Alicia Moretti/ }).waitFor();
  assert.equal(await page.locator('.crm-table-row').count(), 3, 'la bandeja muestra las solicitudes remotas simuladas');
  assert.match(await page.locator('.crm-table-row').filter({ hasText: 'Alicia Moretti' }).innerText(), /Llamar para revisar el alcance/);

  const row = page.getByRole('row', { name: /Alicia Moretti/ });
  await row.focus(); await row.press('Enter');
  await page.getByRole('dialog').getByRole('heading', { name: 'Contacto' }).waitFor();
  await page.getByRole('button', { name: /Vincular$/ }).click();
  await page.getByRole('button', { name: 'Vincular cliente' }).click();
  await page.getByText('Solicitud vinculada al cliente').waitFor();
  await page.keyboard.press('Escape');
  if (await page.locator('.crm-detail-dialog').count()) await page.keyboard.press('Escape');
  await page.locator('.crm-detail-dialog').waitFor({ state: 'detached' });
  await row.click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Contacto' }).waitFor();
  await page.getByLabel('Próxima acción').fill('Enviar resumen de medidas');
  await page.getByLabel('Fecha y hora').fill('2026-11-27T09:30');
  await page.getByRole('button', { name: 'Guardar próxima acción' }).click();
  await page.getByText('Próxima acción guardada').waitFor();
  await page.keyboard.press('Escape');
  if (await page.locator('.crm-detail-dialog').count()) await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('row', { name: /Alicia Moretti/ }).evaluate((element) => document.activeElement === element), true, 'Escape devuelve el foco a la fila');

  await page.getByLabel('Buscar solicitudes').fill('Alicia');
  await page.getByLabel('Origen').selectOption('WhatsApp');
  await page.getByLabel('Etapa').selectOption('new');
  await page.waitForFunction(() => document.querySelectorAll('.crm-table-row').length === 1);
  assert.equal(await page.locator('.crm-table-row').count(), 1, 'búsqueda y filtros combinados reducen el resultado');
  await page.getByRole('tab', { name: 'Mis pendientes' }).click();
  await page.getByText('No hay coincidencias').waitFor();

  await page.getByRole('button', { name: 'Nueva solicitud' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Nuevo contacto de prueba');
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('0995554321');
  await page.getByRole('textbox', { name: 'Correo' }).fill('nuevo@example.test');
  await page.getByLabel('Servicio de interés').fill('Diseño gráfico');
  await page.getByRole('button', { name: 'Guardar solicitud' }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Nuevo contacto de prueba' }).waitFor();

  const viewportResults = [];
  const screenshots = [];
  for (const width of [320, 390, 768, 1280, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const measurement = await page.evaluate(() => ({
      width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      inboxRight: Math.round(document.querySelector('.crm-inbox-panel').getBoundingClientRect().right),
      dialogLeft: Math.round(document.querySelector('.crm-detail-dialog')?.getBoundingClientRect().left ?? 0),
      dialogRight: Math.round(document.querySelector('.crm-detail-dialog')?.getBoundingClientRect().right ?? window.innerWidth),
      viewport: document.documentElement.clientWidth,
    }));
    viewportResults.push(measurement);
    assert.ok(measurement.documentWidth <= measurement.viewport, `sin desbordamiento horizontal a ${width}px`);
    assert.ok(measurement.bodyWidth <= measurement.viewport, `body sin desbordamiento horizontal a ${width}px`);
    assert.ok(measurement.dialogLeft >= 0 && measurement.dialogRight <= measurement.viewport, `panel dentro del viewport a ${width}px`);
    if ([390, 1366].includes(width)) {
      const screenshot = path.join(os.tmpdir(), `visualcorp-crm-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      screenshots.push(screenshot);
    }
  }

  await page.keyboard.press('Escape');
  if (await page.locator('.crm-detail-dialog').count()) await page.keyboard.press('Escape');
  await page.locator('.crm-detail-dialog').waitFor({ state: 'detached' });
  const clearFilters = page.locator('.crm-filters').getByRole('button', { name: 'Limpiar filtros' });
  if (await clearFilters.count()) await clearFilters.click();
  await page.waitForFunction(() => document.querySelectorAll('.crm-table-row').length === 4);
  const inboxScreenshot = path.join(os.tmpdir(), 'visualcorp-crm-inbox.png');
  await page.screenshot({ path: inboxScreenshot, fullPage: false });
  screenshots.push(inboxScreenshot);

  forceInboxError = true;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Contraer barra lateral/ }).click();
  for (const width of [1280, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(viewport.scrollWidth <= viewport.width, `sin desbordamiento con barra compacta a ${width}px`);
  }
  await page.getByRole('button', { name: /Expandir barra lateral/ }).click();
  await page.getByRole('button', { name: 'Actualizar bandeja' }).click();
  await page.getByRole('alert').getByText('Error de conexión simulado.').waitFor();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByRole('alert').getByText('Error de conexión simulado.').waitFor();
  assert.deepEqual(pageErrors, [], 'sin errores de JavaScript');
  console.log(JSON.stringify({ result: 'PASS', viewportResults, compactSidebarWidths: [1280,1366], screenshots, tested: ['filtros combinados', 'historial y vínculo confirmado', 'teclado y retorno de foco', 'alta manual', 'error y reintento'] }, null, 2));
  await context.close();
} finally {
  if (browser) await browser.close();
  await server.close();
}
