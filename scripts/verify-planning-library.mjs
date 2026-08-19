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
  await page.getByRole("heading", { name: "Planificaciones" }).waitFor();
  await page.getByText(/creada \d{2}\/\d{2}\/\d{4}/).waitFor();

  await page.getByRole("button", { name: "Nueva planificación" }).click();
  await page.getByLabel("Nombre de la planificación").fill("Velocidad y técnica");
  await page.getByLabel("Contenido de la planificación").fill("==técnica\nDrills\n\n==velocidad\n6 x 100 m");
  await page.getByRole("button", { name: "Guardar planificación" }).click();
  await page.getByRole("button", { name: /Velocidad y técnica/ }).waitFor();

  await page.getByLabel("Día de asignación").fill("2026-08-27");
  await page.getByRole("button", { name: "Seleccionar todos" }).click();
  await page.getByRole("button", { name: "Asignar a 2 atletas" }).click();

  await page.getByText("Sesión asignada a 2 atletas").waitFor();
  await page.getByRole("heading", { name: /jueves, 27 de agosto/i }).waitFor();

  console.log("Planning library verification passed: create, list, select date, select athletes, and assign.");
} finally {
  await browser?.close();
  await server.close();
}
