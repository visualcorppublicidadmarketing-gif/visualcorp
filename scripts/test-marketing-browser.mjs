import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { startMarketingTestServer } from "./lib/marketing-browser-server.mjs";
import { ORG, USERS } from "./lib/marketing-test-database.mjs";

const api = await startMarketingTestServer();
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5178",
    "--strictPort",
  ],
  {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "http://127.0.0.1:55821",
      VITE_SUPABASE_PUBLISHABLE_KEY: "local-test-key",
    },
    stdio: "pipe",
    windowsHide: true,
  },
);
let viteOutput = "";
vite.stdout.on("data", (chunk) => {
  viteOutput += chunk;
});
vite.stderr.on("data", (chunk) => {
  viteOutput += chunk;
});
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
const evidence = "docs/marketing-workflow/verification";
mkdirSync(evidence, { recursive: true });
const errors = [];
let checks = 0;
async function session(name, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ name, id, token }) => {
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "local-test-refresh",
          expires_in: 3600,
          expires_at: 4102444800,
          token_type: "bearer",
          user: {
            id,
            email: `${name}@example.invalid`,
            aud: "authenticated",
            role: "authenticated",
            user_metadata: { full_name: name },
          },
        }),
      );
    },
    { name, id: USERS[name], token: api.tokens[name] },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) =>
    console.error("Request failed:", r.url(), r.failure()?.errorText),
  );
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("55821"))
      console.error("Test API:", r.status(), r.url(), await r.text());
  });
  await page.clock.install({ time: new Date("2026-10-31T15:00:00Z") });
  await page.goto("http://127.0.0.1:5178/operaciones/marketing");
  await expect(
    page.getByRole("heading", { name: "Qué sigue y qué falta" }),
  ).toBeVisible({ timeout: 30000 });
  return { context, page };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:5178");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await wait(500);
  }
  if (!ready) throw Error(`Vite did not start: ${viteOutput}`);
  const { page, context } = await session("editor");
  await expect(
    page.locator(".mk-work-queues button").filter({ hasText: "En revisión" }),
  ).toContainText("1");
  checks++;
  await expect(
    page.locator(".vc-content-post-main strong", { hasText: "PLAN MENSUAL" }),
  ).toHaveCount(0);
  checks++;
  const card = page
    .locator("article.vc-content-post")
    .filter({ has: page.getByRole("button", { name: /Aviso de feriado/ }) });
  await card.getByRole("button", { name: "Revisar pieza" }).click();
  await expect(
    page.getByText("Archivo local · sin vista previa en la Suite"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Aprobar versión" }),
  ).toHaveCount(0);
  checks++;
  await page.getByRole("button", { name: "Editar ficha", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edita la publicación" });
  await dialog
    .getByLabel("Responsable", { exact: false })
    .selectOption(USERS.editor);
  await dialog.getByRole("tab", { name: /Producción/ }).click();
  await dialog.getByLabel("Portada", { exact: true }).selectOption("Sí");
  await dialog
    .getByLabel("Siguiente paso", { exact: false })
    .fill("Validar pieza antes del cierre");
  api.failNextSave();
  await dialog.getByRole("button", { name: "Guardar ficha" }).click();
  await expect(
    dialog.getByText("Conexión interrumpida de prueba. Reintenta."),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Siguiente paso", { exact: false }),
  ).toHaveValue("Validar pieza antes del cierre");
  checks++;
  await dialog.getByRole("button", { name: "Guardar ficha" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    card
      .getByRole("region", { name: "Pendientes de Aviso de feriado" })
      .getByText("editor", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("Validar pieza antes del cierre")).toBeVisible();
  checks++;
  await page
    .getByRole("checkbox", { name: "Seleccionar Legacy piece", exact: true })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Seleccionar Aviso de feriado",
      exact: true,
    })
    .check();
  await page.getByLabel("Asignar seleccionadas").selectOption(USERS.editor);
  api.failNextSave();
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  await expect(page.locator(".mk-bulk-report")).toContainText(
    "Legacy piece: Conexión interrumpida",
  );
  await expect(page.locator(".mk-bulk-report")).toContainText(
    "Aviso de feriado: asignada",
  );
  await expect(
    page.getByRole("checkbox", {
      name: "Seleccionar Legacy piece",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Seleccionar Aviso de feriado",
      exact: true,
    }),
  ).not.toBeChecked();
  checks++;
  await page.screenshot({
    path: `${evidence}/desktop-editor.png`,
    fullPage: true,
  });
  const before = (
    await api.db.query(`select scheduled_date from marketing_posts order by id`)
  ).rows;
  await page
    .getByRole("button", { name: /Calendario/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await page.reload();
  expect(
    (
      await api.db.query(
        `select scheduled_date from marketing_posts order by id`,
      )
    ).rows,
  ).toEqual(before);
  checks++;
  await page.getByRole("button", { name: "Resumen", exact: true }).click();
  await card.getByRole("button", { name: "Proponer nueva fecha" }).click();
  const dateDialog = page.getByRole("dialog", { name: "Proponer nueva fecha" });
  await expect(dateDialog.getByLabel("Fecha propuesta")).toHaveValue(
    "2026-11-04",
  );
  await dateDialog
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  expect(
    (
      await api.db.query(
        `select scheduled_date from marketing_posts order by id`,
      )
    ).rows,
  ).toEqual(before);
  checks++;
  await card.getByRole("button", { name: "Proponer nueva fecha" }).click();
  await page
    .getByRole("dialog", { name: "Proponer nueva fecha" })
    .getByRole("button", { name: "Confirmar nueva fecha" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await api.db.query(
        "select scheduled_date from marketing_posts where id=$1",
        [api.seed.id],
      )
    ).rows[0].scheduled_date,
  ).toBe("2026-11-04");
  checks++;
  await card
    .getByRole("button", { name: /Instagram/ })
    .first()
    .click();
  await page.getByRole("dialog").getByLabel("Etapa").selectOption("Programada");
  let warningShown = false;
  page.once("dialog", async (d) => {
    warningShown = d.message().includes("sin aprobación");
    await d.accept();
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar ficha" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(warningShown).toBeTruthy();
  expect(
    (await api.db.query("select count(*)::int n from marketing_reviews"))
      .rows[0].n,
  ).toBe(0);
  checks++;
  await context.close();
  const manager = await session("manager");
  manager.page.on("dialog", (d) => d.accept());
  const managerCard = manager.page.locator("article.vc-content-post").filter({
    has: manager.page.getByRole("button", { name: /Aviso de feriado/ }),
  });
  await managerCard.getByRole("button", { name: "Revisar pieza" }).click();
  await manager.page
    .getByRole("button", { name: "Aprobar versión", exact: true })
    .click();
  await expect(manager.page.getByRole("dialog")).toHaveCount(0);
  await expect(managerCard.getByText(/aprobada por manager/)).toBeVisible();
  checks++;
  await manager.page.screenshot({
    path: `${evidence}/desktop-approval.png`,
    fullPage: true,
  });
  await manager.context.close();
  const viewer = await session("viewer", { width: 390, height: 844 });
  await expect(
    viewer.page.getByRole("button", { name: "Nueva publicación" }),
  ).toHaveCount(0);
  const viewerCard = viewer.page.locator("article.vc-content-post").filter({
    has: viewer.page.getByRole("button", { name: /Aviso de feriado/ }),
  });
  await viewerCard.getByRole("button", { name: "Revisar pieza" }).click();
  await expect(
    viewer.page.getByRole("button", { name: "Aprobar versión" }),
  ).toHaveCount(0);
  checks++;
  expect(
    await viewer.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await viewer.page.keyboard.press("Tab");
  expect(
    await viewer.page.evaluate(() =>
      Boolean(document.activeElement?.closest("dialog")),
    ),
  ).toBeTruthy();
  await viewer.page.screenshot({
    path: `${evidence}/mobile-review.png`,
    fullPage: false,
  });
  await viewer.page.keyboard.press("Escape");
  await expect(viewer.page.getByRole("dialog")).toHaveCount(0);
  checks++;
  await viewer.context.close();
  expect(errors).toEqual([]);
  console.log(
    `PASS: ${checks} browser integration scenarios; editor, manager and viewer; desktop/mobile; actual PostgreSQL RPC/RLS with synthetic local sessions.`,
  );
} finally {
  await browser.close();
  vite.kill();
  await api.close();
}
