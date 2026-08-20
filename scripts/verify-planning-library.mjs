import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

process.env.VITE_DEMO_MODE = "true";
const webRoot = fileURLToPath(new URL("../apps/web/", import.meta.url));
const server = await createServer({
  root: webRoot,
  mode: "production",
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await server.listen();
  const appUrl = server.resolvedUrls?.local[0];
  if (!appUrl) throw new Error("Vite did not expose a local URL");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);

  await page.goto(appUrl);
  await page.getByRole("button", { name: "Planificaciones" }).click();
  await page.getByRole("heading", { name: "Planificaciones" }).waitFor();
  const libraryStyle = await page.locator(".coach-session-grid").evaluate((element) => { const style = getComputedStyle(element); return { maxHeight: style.maxHeight, overflowY: style.overflowY }; });
  if (libraryStyle.maxHeight === "none" || libraryStyle.overflowY !== "auto") throw new Error("Planning library is not contained in a scrollable rectangle");
  await page.getByText(/Creada \d{2}\/\d{2}\/\d{4}/).waitFor();
  await page.getByRole("button", { name: /Fuerza y AMRAP/ }).hover();
  await page.getByRole("tooltip").filter({ hasText: "Back squat 5 × 5" }).waitFor();

  await page.getByRole("button", { name: "Nueva planificación" }).click();
  await page.getByLabel("Nombre de la planificación").fill("Velocidad y técnica");
  await page.getByLabel("Contenido de la planificación").fill("==técnica\nDrills\n\n==velocidad\n6 x 100 m");
  await page.getByRole("button", { name: "Guardar planificación" }).click();
  await page.getByRole("button", { name: /Velocidad y técnica/ }).waitFor();
  await page.getByRole("heading", { name: "Velocidad y técnica" }).waitFor();
  await page.getByText("6 x 100 m", { exact: true }).waitFor();

  await page.getByLabel("Buscar planificaciones").fill("Velocidad");
  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByText("Resultados para “Velocidad”").waitFor();
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Editar nombre de la planificación").fill("Velocidad editada");
  await page.getByLabel("Editar contenido de la planificación").fill("==técnica\nDrills\n\n==velocidad\n8 x 100 m");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await page.getByRole("heading", { name: "Velocidad editada" }).waitFor();
  await page.getByText("8 x 100 m", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page.getByRole("heading", { name: "Velocidad editada (copia)" }).waitFor();

  await page.getByLabel("Día de asignación").fill("2026-08-27");
  const assignmentPanel = page.locator(".assign-panel");
  const headings = await assignmentPanel.locator(".assign-heading strong").allTextContents();
  if (headings.at(-1) !== "Atletas") throw new Error("Athlete heading is not placed directly before the athlete list");
  await page.getByRole("button", { name: "Seleccionar todos" }).click();
  await page.getByRole("button", { name: "Asignar planificación" }).click();

  await page.getByText("Sesión asignada a 2 atletas").waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar" }).click();
  await page.getByText("Planificación eliminada; las sesiones asignadas se conservaron").waitFor();
  if (await page.getByRole("button", { name: "Agregar sesión" }).count()) throw new Error("Legacy daily session editor is visible to the coach");
  if (await page.locator(".date-strip").count()) throw new Error("Daily calendar is visible to the coach");

  console.log("Planning library verification passed: focused coach planning and assignment workflow.");
} finally {
  await browser?.close();
  await server.close();
}
