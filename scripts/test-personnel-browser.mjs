import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const ORG_ID = "10000000-0000-0000-0000-000000000001";
const OWNER_ID = "20000000-0000-0000-0000-000000000001";
const ADVISOR_ID = "20000000-0000-0000-0000-000000000002";
const INSTALLER_ID = "20000000-0000-0000-0000-000000000003";
const UNLINKED_USER_ID = "20000000-0000-0000-0000-000000000004";

const VALERIA_ID = "30000000-0000-0000-0000-000000000001";
const MATEO_ID = "30000000-0000-0000-0000-000000000002";
const CARLA_ID = "30000000-0000-0000-0000-000000000003";

const API_PORT = 55829;
const VITE_PORT = 5179;
const SCRATCH_DIR = process.env.PERSONNEL_SCREENSHOT_DIR || "";

function createSeedState() {
  const personnelRecords = [
    {
      id: VALERIA_ID,
      organization_id: ORG_ID,
      full_name: "Valeria Gómez",
      email: "valeria.gomez@visualcorp.ec",
      phone: "0991112233",
      department: "Comercial / Ventas",
      job_title: "Asesora Comercial",
      status: "active",
      start_date: "2025-05-01",
      end_date: null,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
      created_at: "2025-05-01T14:00:00Z",
      updated_at: "2026-11-10T15:00:00Z",
    },
    {
      id: MATEO_ID,
      organization_id: ORG_ID,
      full_name: "Mateo Paredes",
      email: "mateo.paredes@visualcorp.ec",
      phone: "0982223344",
      department: "Taller e Instalación",
      job_title: "Rotulista e Instalador",
      status: "active",
      start_date: "2026-08-15",
      end_date: null,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
      created_at: "2026-08-15T14:00:00Z",
      updated_at: "2026-11-10T15:00:00Z",
    },
    {
      id: CARLA_ID,
      organization_id: ORG_ID,
      full_name: "Carla Mendoza",
      email: "carla.mendoza@visualcorp.ec",
      phone: "",
      department: "Diseño Gráfico",
      job_title: "Diseñadora Sr.",
      status: "active",
      start_date: null,
      end_date: null,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
      created_at: "2026-10-01T14:00:00Z",
      updated_at: "2026-11-10T15:00:00Z",
    },
  ];

  const googleAccounts = [
    {
      user_id: ADVISOR_ID,
      email: "valeria.gomez@visualcorp.ec",
      full_name: "Valeria Gómez",
      last_sign_in_at: "2026-11-11T13:10:00Z",
      linked_personnel_id: VALERIA_ID,
      linked_personnel_name: "Valeria Gómez",
      roles: ["ventas"],
      access_profiles: ["Asesor comercial"],
      access_active: true,
      avatar_url: null,
    },
    {
      user_id: INSTALLER_ID,
      email: "mateo.paredes@visualcorp.ec",
      full_name: "Mateo Paredes",
      last_sign_in_at: "2026-11-11T12:45:00Z",
      linked_personnel_id: MATEO_ID,
      linked_personnel_name: "Mateo Paredes",
      roles: ["taller"],
      access_profiles: ["Taller / Producción"],
      access_active: true,
      avatar_url: null,
    },
    {
      user_id: UNLINKED_USER_ID,
      email: "esteban.aux@visualcorp.ec",
      full_name: "Esteban Auxiliar",
      last_sign_in_at: "2026-11-10T18:20:00Z",
      linked_personnel_id: null,
      linked_personnel_name: null,
      roles: ["taller"],
      access_profiles: ["Operaciones"],
      access_active: true,
      avatar_url: null,
    },
  ];

  const accessProfiles = [
    { id: "prof-owner", profile_key: "owner", name: "Dueño / Dirección" },
    { id: "prof-admin", profile_key: "admin", name: "Administrador Suite" },
    { id: "prof-gerencia", profile_key: "gerencia", name: "Gerencia Operativa" },
    { id: "prof-ventas", profile_key: "ventas", name: "Asesor Comercial" },
    { id: "prof-taller", profile_key: "taller", name: "Taller / Producción" },
  ];

  const compensationHistory = [
    {
      id: "comp-1",
      organization_id: ORG_ID,
      personnel_id: VALERIA_ID,
      amount: 720,
      currency_code: "USD",
      pay_period: "Mensual",
      effective_date: "2026-01-01",
      note: "Contrato comercial 2026 + comisiones",
      created_by: OWNER_ID,
      created_at: "2026-01-02T14:00:00Z",
    },
    {
      id: "comp-2",
      organization_id: ORG_ID,
      personnel_id: MATEO_ID,
      amount: 520,
      currency_code: "USD",
      pay_period: "Mensual",
      effective_date: "2026-08-15",
      note: "Ingreso taller e instalación Milagro",
      created_by: OWNER_ID,
      created_at: "2026-08-15T14:00:00Z",
    },
  ];

  const deductions = [
    {
      id: "ded-1",
      organization_id: ORG_ID,
      employee_user_id: ADVISOR_ID,
      personnel_id: VALERIA_ID,
      description: "Anticipo de quincena noviembre",
      amount: 12.5,
      payroll_period: "2026-11-01",
      status: "pending_authorization",
      authorization_reference: "",
      evidence_reference: "",
      payroll_handoff_reference: "",
      payroll_handed_at: null,
      payroll_handed_by: null,
      note: "Comprobante interno #A-110",
      created_by: OWNER_ID,
      created_at: "2026-11-05T15:00:00Z",
      reviewed_by: null,
      reviewed_at: null,
    },
    {
      id: "ded-2",
      organization_id: ORG_ID,
      employee_user_id: ADVISOR_ID,
      personnel_id: VALERIA_ID,
      description: "Descuento proporcional ausencia 2h no justificada",
      amount: 18,
      payroll_period: "2026-11-01",
      status: "authorized",
      authorization_reference: "AUTH-NOV-02",
      evidence_reference: "ACTA-NOV-02",
      payroll_handoff_reference: "",
      payroll_handed_at: null,
      payroll_handed_by: null,
      note: "Tiempo no trabajado",
      created_by: OWNER_ID,
      created_at: "2026-11-07T16:00:00Z",
      reviewed_by: OWNER_ID,
      reviewed_at: "2026-11-08T10:00:00Z",
    },
  ];

  const personnelEvents = [
    {
      id: 1,
      organization_id: ORG_ID,
      personnel_id: VALERIA_ID,
      event_key: "record_created",
      summary: "Ficha laboral creada para Valeria Gómez",
      changed_fields: ["full_name", "department", "job_title"],
      salary_sensitive: false,
      actor_user_id: OWNER_ID,
      actor_label: "Dirección General",
      created_at: "2025-05-01T14:00:00Z",
    },
    {
      id: 2,
      organization_id: ORG_ID,
      personnel_id: MATEO_ID,
      event_key: "account_linked",
      summary: "Cuenta Google vinculada: mateo.paredes@visualcorp.ec",
      changed_fields: ["linked_user_id"],
      salary_sensitive: false,
      actor_user_id: OWNER_ID,
      actor_label: "Dirección General",
      created_at: "2026-08-15T15:00:00Z",
    },
  ];

  const workHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    organization_id: ORG_ID,
    weekday,
    is_open: weekday >= 1 && weekday <= 6,
    opens_at: weekday === 6 ? "09:00:00" : "08:30:00",
    closes_at: weekday === 6 ? "13:00:00" : "17:30:00",
  }));

  const areaRotations = [
    {
      id: "rot-1",
      organization_id: ORG_ID,
      area_name: "Plotter e Impresión",
      task_name: "Revisión de calibración y tintas",
      weekday: 3, // Wednesday 2026-11-11
      starts_on: "2026-11-01",
      starts_at: "08:30",
      ends_at: "10:00",
      active: true,
      note: "Turno matutino",
    },
  ];

  const areaRotationMembers = [
    {
      organization_id: ORG_ID,
      rotation_id: "rot-1",
      user_id: INSTALLER_ID,
      position: 1,
    },
  ];

  const sales = [
    {
      id: "sale-1",
      organization_id: ORG_ID,
      sale_code: "VTA-2026-041",
      subtotal: 650,
      discount_total: 25,
      discount_reason: "Cliente frecuente",
      total: 625,
      status: "confirmed",
      advisor_id: ADVISOR_ID,
      created_by: ADVISOR_ID,
      created_at: "2026-11-09T15:30:00Z",
      customers: { full_name: "Farmacia Santa Elena" },
      sale_payments: [{ amount: 625 }],
    },
  ];

  const centralQuotes = [
    {
      id: "quote-1",
      organization_id: ORG_ID,
      quote_code: "COT-2026-102",
      customer_name: "Ferretería El Pacífico",
      status: "accepted",
      chosen_tier: "Premium",
      selected_total: 890,
      created_by: ADVISOR_ID,
      created_at: "2026-11-10T10:00:00Z",
    },
  ];

  const productionJobs = [
    {
      id: "job-1",
      organization_id: ORG_ID,
      title: "Rótulo luminoso Farmacia Santa Elena",
      status: "in_progress",
      sale_code: "VTA-2026-041",
      customer_name: "Farmacia Santa Elena",
      due_at: "2026-11-12T17:00:00Z",
      updated_at: "2026-11-11T14:00:00Z",
    },
  ];

  const productionJobSteps = [
    {
      id: "step-1",
      organization_id: ORG_ID,
      job_id: "job-1",
      title: "Instalación fachada principal",
      status: "in_progress",
      assigned_to: INSTALLER_ID,
      due_at: "2026-11-12T17:00:00Z",
      areas: { name: "Instalación", code: "INS" },
    },
  ];

  return {
    personnelRecords,
    googleAccounts,
    accessProfiles,
    compensationHistory,
    deductions,
    personnelEvents,
    workHours,
    workExceptions: [],
    areaRotations,
    areaRotationMembers,
    sales,
    centralQuotes,
    productionJobs,
    productionJobSteps,
    productionOrders: [],
  };
}

function parseEqFilters(searchParams) {
  const filters = [];
  for (const [key, val] of searchParams.entries()) {
    if (key === "select" || key === "order" || key === "limit") continue;
    if (val.startsWith("eq.")) {
      filters.push({ key, op: "eq", val: val.slice(3) });
    } else if (val.startsWith("gte.")) {
      filters.push({ key, op: "gte", val: val.slice(4) });
    }
  }
  return filters;
}

function applyFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every((f) => {
      const cell = row[f.key];
      if (f.op === "eq") {
        if (f.val === "true") return cell === true;
        if (f.val === "false") return cell === false;
        return String(cell ?? "") === f.val;
      }
      if (f.op === "gte") {
        return String(cell ?? "") >= f.val;
      }
      return true;
    }),
  );
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function startMockSupabaseServer() {
  const db = createSeedState();
  let seq = 100;

  const server = createServer(async (req, res) => {
    const requestedHeaders = req.headers["access-control-request-headers"];
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": requestedHeaders
        ? String(requestedHeaders)
        : "authorization,apikey,content-type,prefer,x-client-info,x-supabase-api-version,accept,accept-profile,content-profile",
      "Access-Control-Expose-Headers": "content-range,preference-applied",
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || "/", `http://127.0.0.1:${API_PORT}`);
    const pathname = reqUrl.pathname;
    const isSingle = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");

    const sendJson = (status, data) => {
      res.writeHead(status, {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };

    try {
      if (pathname === "/auth/v1/user") {
        return sendJson(200, {
          id: OWNER_ID,
          email: "owner@visualcorp.ec",
          aud: "authenticated",
          role: "authenticated",
          user_metadata: { full_name: "Dirección General" },
        });
      }

      if (pathname === "/rest/v1/rpc/claim_organization_access_invitations") {
        return sendJson(200, { claimed: 0 });
      }

      if (pathname === "/rest/v1/rpc/get_my_visualcorp_access") {
        return sendJson(200, {
          organization_id: ORG_ID,
          work_access_open: true,
          roles: [{ key: "owner", name: "Dueño / Dirección", role: "owner" }],
          permissions: {
            personnel: { view: true, edit: true, view_compensation: true, edit_compensation: true },
            team: { view: true, manage_members: true, manage_profiles: true },
            team_schedule: { view: true },
            sales: { view: true },
            quotes: { view: true },
            workshop: { view: true },
          },
        });
      }

      if (pathname === "/rest/v1/rpc/list_visualcorp_personnel_accounts_with_avatars") {
        return sendJson(200, db.googleAccounts);
      }

      if (pathname === "/rest/v1/rpc/list_visualcorp_personnel_access_profiles") {
        return sendJson(200, db.accessProfiles);
      }

      if (pathname === "/rest/v1/rpc/link_visualcorp_personnel_google_account") {
        const body = await readJsonBody(req);
        const person = db.personnelRecords.find((p) => p.id === body.p_personnel_id);
        for (const acc of db.googleAccounts) {
          if (acc.linked_personnel_id === body.p_personnel_id) {
            acc.linked_personnel_id = null;
            acc.linked_personnel_name = null;
          }
          if (acc.user_id === body.p_user_id) {
            acc.linked_personnel_id = body.p_personnel_id;
            acc.linked_personnel_name = person?.full_name || null;
          }
        }
        return sendJson(200, null);
      }

      if (pathname === "/rest/v1/rpc/unlink_visualcorp_personnel_google_account") {
        const body = await readJsonBody(req);
        for (const acc of db.googleAccounts) {
          if (acc.linked_personnel_id === body.p_personnel_id) {
            acc.linked_personnel_id = null;
            acc.linked_personnel_name = null;
          }
        }
        return sendJson(200, null);
      }

      const tableMatch = pathname.match(/^\/rest\/v1\/([a-zA-Z0-9_]+)$/);
      if (tableMatch) {
        const table = tableMatch[1];
        const filters = parseEqFilters(reqUrl.searchParams);

        if (req.method === "GET") {
          const tableMap = {
            personnel_records: db.personnelRecords,
            personnel_events: db.personnelEvents,
            personnel_compensation_history: db.compensationHistory,
            finance_payroll_deductions: db.deductions,
            team_work_hours: db.workHours,
            team_work_exceptions: db.workExceptions,
            team_area_rotations: db.areaRotations,
            team_area_rotation_members: db.areaRotationMembers,
            sales: db.sales,
            central_quotes: db.centralQuotes,
            production_jobs: db.productionJobs,
            production_job_steps: db.productionJobSteps,
            production_orders: db.productionOrders,
          };
          const rows = tableMap[table] ? applyFilters(tableMap[table], filters) : [];
          return sendJson(200, isSingle ? rows[0] || {} : rows);
        }

        if (req.method === "POST") {
          const body = await readJsonBody(req);
          if (table === "personnel_records") {
            const newId = `30000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;
            const row = {
              id: newId,
              created_by: OWNER_ID,
              updated_by: OWNER_ID,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...body,
            };
            db.personnelRecords.push(row);
            return sendJson(201, isSingle ? row : [row]);
          }
          if (table === "personnel_compensation_history") {
            const newId = `comp-${++seq}`;
            const row = { id: newId, created_at: new Date().toISOString(), ...body };
            db.compensationHistory.unshift(row);
            return sendJson(201, isSingle ? row : [row]);
          }
          if (table === "finance_payroll_deductions") {
            const newId = `ded-${++seq}`;
            const row = {
              id: newId,
              employee_user_id: null,
              authorization_reference: "",
              evidence_reference: "",
              payroll_handoff_reference: "",
              payroll_handed_at: null,
              payroll_handed_by: null,
              created_at: new Date().toISOString(),
              reviewed_by: null,
              reviewed_at: null,
              ...body,
            };
            db.deductions.unshift(row);
            return sendJson(201, isSingle ? row : [row]);
          }
          return sendJson(201, isSingle ? body : [body]);
        }

        if (req.method === "PATCH") {
          const body = await readJsonBody(req);
          if (table === "personnel_records") {
            const matches = applyFilters(db.personnelRecords, filters);
            for (const item of matches) {
              Object.assign(item, body, { updated_at: new Date().toISOString() });
            }
            return sendJson(200, isSingle ? matches[0] || {} : matches);
          }
          if (table === "finance_payroll_deductions") {
            const matches = applyFilters(db.deductions, filters);
            for (const item of matches) {
              Object.assign(item, body);
              if (body.status === "sent_to_payroll") {
                item.payroll_handed_at = new Date().toISOString();
                item.payroll_handed_by = OWNER_ID;
              }
            }
            return sendJson(200, isSingle ? matches[0] || {} : matches);
          }
          return sendJson(200, isSingle ? {} : []);
        }
      }

      return sendJson(200, isSingle ? {} : []);
    } catch (err) {
      return sendJson(500, { message: err instanceof Error ? err.message : "Mock server error" });
    }
  });

  return new Promise((resolve) => {
    server.listen(API_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function saveShot(page, filename) {
  if (!SCRATCH_DIR) return;
  mkdirSync(SCRATCH_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SCRATCH_DIR, filename), fullPage: false });
}

async function assertZeroOverflow(page, label, { allowSharedTopbarAt320 = false } = {}) {
  const metrics = await page.evaluate(() => {
    const docEl = document.documentElement;
    const personnelEl = document.querySelector(".personnel-page");
    const viewportW = window.innerWidth;
    const docScrollW = docEl.scrollWidth;
    const personnelScrollW = personnelEl ? personnelEl.scrollWidth : 0;
    const personnelClientW = personnelEl ? personnelEl.clientWidth : viewportW;

    const personnelOffenders = [];
    if (personnelEl) {
      for (const el of personnelEl.querySelectorAll("*")) {
        if (el.closest(".table-wrap")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > viewportW + 2) {
          const cls = typeof el.className === "string" ? el.className : "";
          personnelOffenders.push(`${el.tagName}.${cls.slice(0, 45)} right=${Math.round(rect.right)} vs ${viewportW}`);
          if (personnelOffenders.length >= 6) break;
        }
      }
    }
    return {
      viewportW,
      docScrollW,
      personnelScrollW,
      personnelClientW,
      personnelOffenders,
    };
  });

  expect(
    metrics.personnelOffenders,
    `Personnel DOM overflow at ${label}: ${metrics.personnelOffenders.join("; ")}`,
  ).toEqual([]);
  expect(
    metrics.personnelScrollW,
    `Personnel scrollWidth overflow at ${label}: ${metrics.personnelScrollW} > ${metrics.personnelClientW}`,
  ).toBeLessThanOrEqual(metrics.personnelClientW + 1);

  if (!allowSharedTopbarAt320 || metrics.viewportW >= 375) {
    expect(
      metrics.docScrollW,
      `Document horizontal overflow at ${label}: scrollWidth=${metrics.docScrollW}, viewport=${metrics.viewportW}`,
    ).toBeLessThanOrEqual(metrics.viewportW);
  }
}

const apiServer = await startMockSupabaseServer();
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(VITE_PORT), "--strictPort"],
  {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${API_PORT}`,
      VITE_SUPABASE_PUBLISHABLE_KEY: "local-test-key",
    },
    stdio: "pipe",
    windowsHide: true,
  },
);

let viteLog = "";
vite.stdout.on("data", (d) => (viteLog += d));
vite.stderr.on("data", (d) => (viteLog += d));

const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});

const consoleErrors = [];
const pageErrors = [];
const httpErrors = [];

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${VITE_PORT}`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await wait(400);
  }
  if (!ready) throw new Error(`Vite failed to start:\n${viteLog}`);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });

  await context.addInitScript(
    ({ ownerId }) => {
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: "mock-owner-jwt",
          refresh_token: "mock-refresh",
          expires_in: 3600,
          expires_at: 4102444800,
          token_type: "bearer",
          user: {
            id: ownerId,
            email: "owner@visualcorp.ec",
            aud: "authenticated",
            role: "authenticated",
            user_metadata: { full_name: "Dirección General" },
          },
        }),
      );
    },
    { ownerId: OWNER_ID },
  );

  const page = await context.newPage();
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage(() => {});
  });
  page.on("pageerror", (err) => {
    console.error("PAGEERROR:", err.message);
    pageErrors.push(err.message);
  });
  page.on("requestfailed", (req) => {
    console.error("REQUESTFAILED:", req.url(), req.failure()?.errorText);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("CONSOLE.ERROR:", msg.text());
      consoleErrors.push(msg.text());
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("favicon.ico")) {
      console.error("HTTP ERROR:", res.status(), res.url());
      httpErrors.push(`${res.status()} ${res.url()}`);
    }
  });

  // Freeze wall-clock date to deterministic Wednesday 2026-11-11 in Guayaquil (UTC-5)
  await page.clock.install({ time: new Date("2026-11-11T15:00:00Z") });
  await page.goto(`http://127.0.0.1:${VITE_PORT}/operaciones/personal`);

  await expect(page.getByRole("heading", { name: /Personal, asistencia y pre-nómina/i })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole("option", { name: /Valeria Gómez/ })).toBeVisible();
  await expect(page.getByText(/Hay 1 cuenta\(s\) con acceso a Suite/)).toBeVisible();

  // Check initial Light desktop layout + overflow
  await assertZeroOverflow(page, "desktop-1440-light-directory");
  await saveShot(page, "01-desktop-1440-light-directory.png");

  // Flow 1: Actionable KPI click toggles unlinked filter
  await page.getByRole("button", { name: /Fichas sin acceso Google/ }).click();
  await expect(page.getByRole("option", { name: /Carla Mendoza/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Valeria Gómez/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Fichas sin acceso Google/ }).click();
  await expect(page.getByRole("option", { name: /Valeria Gómez/ })).toBeVisible();

  // Flow 2: Create/Edit Dialog opens and closes cleanly on Escape
  await page.getByRole("button", { name: /Nuevo colaborador/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Flow 3: Object Page tabs, Mask-and-Reveal salary privacy, and 4-stage deduction transition Dialog
  await page.getByRole("option", { name: /Valeria Gómez/ }).click();
  await page.getByRole("tab", { name: /Compensación y deducciones/ }).click();

  // Salaries masked initially
  await expect(page.getByRole("button", { name: /Mostrar cifras/ })).toBeVisible();
  await expect(page.locator(".personnel-netpay-banner")).toContainText("••••");
  await page.getByRole("button", { name: /Mostrar cifras/ }).click();
  await expect(page.locator(".personnel-netpay-banner")).toContainText(/\$720[.,]00/);
  await expect(page.locator(".personnel-netpay-banner")).toContainText(/\u2212\$18[.,]00/);

  // Deduction authorize dialog validation + transition
  await page.getByRole("button", { name: "Autorizar con respaldo" }).first().click();
  const dedDialog = page.getByRole("dialog");
  await expect(dedDialog).toBeVisible();
  await dedDialog.getByLabel(/Referencia de autorización/i).fill("OK");
  await dedDialog.getByLabel(/Referencia de evidencia/i).fill("SI");
  await dedDialog.locator('button[type="submit"]').click();
  await expect(dedDialog).toContainText(/referencia|detalle|genérica|válida/i);
  await dedDialog.getByLabel(/Referencia de autorización/i).fill("AUTH-NOV-2026-09");
  await dedDialog.getByLabel(/Referencia de evidencia/i).fill("RECIBO-QUINCENA-11");
  await dedDialog.locator('button[type="submit"]').click();
  await expect(dedDialog).toHaveCount(0);
  await expect(page.getByText(/Estado de deducción actualizado/)).toBeVisible();

  // Transition authorized deduction to sent_to_payroll
  await page.getByRole("button", { name: "Entregar a nómina externa" }).first().click();
  const handoffDialog = page.getByRole("dialog");
  await expect(handoffDialog).toBeVisible();
  await handoffDialog.locator("input[type='text']").first().fill("LOTE-ROL-2026-11-Q1");
  await handoffDialog.locator('button[type="submit"]').click();
  await expect(handoffDialog).toHaveCount(0);
  await expect(page.getByText("LOTE-ROL-2026-11-Q1")).toBeVisible();

  // Flow 4: Operational metrics for Commercial vs Workshop roles
  await page.getByRole("tab", { name: /Carga y rendimiento/ }).click();
  await expect(page.getByText("VTA-2026-041")).toBeVisible();
  await page.getByRole("option", { name: /Mateo Paredes/ }).click();
  await expect(page.getByText(/Instalación fachada principal/)).toBeVisible();

  // Flow 5: Pase de lista hoy -> quick check-in updates live KPI
  await page.getByRole("tab", { name: /Pase de lista hoy/ }).click();
  await expect(page.getByText(/Asistencia en sesión local/)).toBeVisible();
  await assertZeroOverflow(page, "desktop-1440-rollcall");
  await page.getByRole("button", { name: /Presente/ }).first().click();
  await expect(page.getByText(/Marcación guardada/)).toBeVisible();

  // Flow 6: Pre-nómina EC y guía -> Mask-and-Reveal + Fiscal Year guide + Dark Theme screenshot
  await page.getByRole("tab", { name: /Pre-nómina EC y guía/ }).click();
  await expect(page.getByRole("button", { name: /Mostrar montos/ })).toBeVisible();
  await page.getByRole("button", { name: /Mostrar montos/ }).click();
  await page.getByRole("button", { name: /Parámetros Ecuador 2026/ }).click();
  await expect(page.getByText(/MDT-2025-195/)).toBeVisible();

  // Switch theme to DARK via real topbar toggle
  await page.getByRole("button", { name: "Oscuro" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertZeroOverflow(page, "desktop-1440-dark-payroll");
  await saveShot(page, "02-desktop-1440-dark-payroll.png");

  // Flow 7: Responsive & Sidebar-Open Laptop Checks across all mandatory widths
  const viewports = [
    { width: 1280, height: 800, label: "laptop-1280-dark-directory", shot: "03-laptop-1280-dark-directory.png" },
    { width: 768, height: 1024, label: "tablet-768-dark-directory" },
    { width: 390, height: 844, label: "mobile-390-dark-directory", shot: "04-mobile-390-dark-directory.png" },
    { width: 320, height: 700, label: "mobile-320-dark-directory" },
  ];

  for (const vp of viewports) {
    const opts = { allowSharedTopbarAt320: vp.width <= 320 };
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.getByRole("tab", { name: /Directorio y fichas/ }).click();
    await assertZeroOverflow(page, vp.label, opts);
    if (vp.shot) await saveShot(page, vp.shot);

    if (vp.width <= 768) {
      const backBtn = page.getByRole("button", { name: /Volver al directorio/i });
      if ((await backBtn.count()) > 0 && (await backBtn.isVisible())) {
        await backBtn.click();
        await assertZeroOverflow(page, `${vp.label}-mobile-list`, opts);
        await page.getByRole("option", { name: /Valeria Gómez/ }).click();
        await assertZeroOverflow(page, `${vp.label}-mobile-detail`, opts);
      }
    }

    await page.getByRole("tab", { name: /Pase de lista hoy/ }).click();
    await assertZeroOverflow(page, `${vp.label}-rollcall`, opts);

    await page.getByRole("tab", { name: /Pre-nómina EC y guía/ }).click();
    await assertZeroOverflow(page, `${vp.label}-payroll`, opts);
  }

  expect(pageErrors, `Uncaught page errors: ${pageErrors.join(" | ")}`).toEqual([]);
  expect(httpErrors, `HTTP >=400 errors: ${httpErrors.join(" | ")}`).toEqual([]);
  expect(consoleErrors, `Console errors: ${consoleErrors.join(" | ")}`).toEqual([]);

  console.log("ALL PERSONNEL BROWSER VERIFICATIONS PASSED (0 page/http/console errors, 0 horizontal overflow across 1440/1280/768/390/320 in light+dark).");
} finally {
  await browser.close();
  vite.kill();
  apiServer.close();
}
