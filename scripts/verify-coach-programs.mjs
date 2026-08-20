import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

process.env.VITE_DEMO_MODE = "true";
process.env.VITE_DEMO_ROLE = "coach";
const webRoot = fileURLToPath(new URL("../apps/web/", import.meta.url));
const server = await createServer({ root: webRoot, mode: "production", server: { host: "127.0.0.1", port: 0 } });

let browser;
try {
  await server.listen();
  const appUrl = server.resolvedUrls?.local[0];
  if (!appUrl) throw new Error("Vite did not expose a local URL");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  page.setDefaultTimeout(10_000);
  await page.goto(appUrl);
  await page.getByRole("button", { name: "Programas" }).click();
  await page.getByRole("button", { name: "Nuevo programa" }).click();
  await page.getByLabel("Nombre del programa").fill("Base de fuerza");
  await page.getByLabel("Planificación del programa").selectOption({ label: "Fuerza y AMRAP" });
  await page.getByRole("button", { name: "Agregar día" }).click();
  await page.getByLabel("Semana del día").selectOption("2");
  await page.getByLabel("Día de la semana").selectOption("2");
  await page.getByRole("button", { name: "Agregar día" }).click();
  await page.getByRole("button", { name: "Guardar programa" }).click();
  await page.getByRole("heading", { name: "Base de fuerza" }).waitFor();
  await page.getByLabel("Inicio del programa").fill("2026-08-24");
  await page.getByRole("button", { name: "Seleccionar todos" }).click();
  await page.getByRole("button", { name: "Asignar programa" }).click();
  const notice = page.locator(".toast");
  await notice.waitFor();
  const noticeText = await notice.textContent();
  if (noticeText?.trim() !== "4 sesiones asignadas") throw new Error(`Unexpected assignment notice: ${noticeText}`);
  console.log("Coach programs verification passed: create relative days and assign a multi-week program.");
} finally {
  await browser?.close();
  await server.close();
}
