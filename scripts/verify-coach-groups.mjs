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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  page.setDefaultTimeout(10_000);
  await page.goto(appUrl);

  await page.getByRole("button", { name: "Grupos" }).click();
  await page.getByLabel("Nombre del grupo").fill("CrossFit avanzados");
  await page.getByRole("button", { name: "Crear" }).click();
  await page.getByRole("heading", { name: "CrossFit avanzados" }).waitFor();
  await page.getByLabel("Sofia Rodriguez").check();
  await page.getByLabel("Martin Silva").check();

  await page.getByRole("button", { name: "Planificaciones" }).click();
  await page.getByRole("heading", { name: "Planificaciones" }).waitFor();
  await page.getByLabel("CrossFit avanzados").check();
  await page.getByRole("button", { name: "Asignar planificación" }).waitFor();

  console.log("Coach groups verification passed: create group, multi-membership selection, and assignment target.");
} finally {
  await browser?.close();
  await server.close();
}
