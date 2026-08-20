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

  await page.getByRole("heading", { name: /—/ }).waitFor();
  await page.getByText("Cumplimiento semanal").waitFor();
  await page.getByText("Completadas", { exact: true }).waitFor();
  await page.getByText("Pendientes", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Duplicar semana" }).click();
  await page.getByLabel("Semana destino").waitFor();
  await page.getByRole("button", { name: "Confirmar copia" }).click();
  await page.getByText("Semana duplicada en modo demostración").waitFor();
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await page.getByRole("button", { name: "Planificaciones" }).click();
  await page.getByRole("heading", { name: "Planificaciones" }).waitFor();
  await page.getByRole("button", { name: "Semana" }).click();
  await page.getByText("Cumplimiento semanal").waitFor();

  console.log("Coach compliance verification passed: weekly summary, week duplication, navigation, and planning switch.");
} finally {
  await browser?.close();
  await server.close();
}
