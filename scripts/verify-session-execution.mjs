import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

process.env.VITE_DEMO_MODE = "true";
process.env.VITE_DEMO_ROLE = "athlete";
const webRoot = fileURLToPath(new URL("../apps/web/", import.meta.url));
const server = await createServer({ root: webRoot, mode: "production", server: { host: "127.0.0.1", port: 0 } });

let browser;
try {
  await server.listen();
  const appUrl = server.resolvedUrls?.local[0];
  if (!appUrl) throw new Error("Vite did not expose a local URL");

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(appUrl);

  const tracking = page.getByRole("region", { name: "Seguimiento de la sesión" });
  await tracking.getByText("Pendiente", { exact: true }).waitFor();
  await tracking.getByRole("button", { name: "Iniciar sesión" }).click();
  await tracking.getByText("En curso", { exact: true }).waitFor();
  await tracking.getByRole("button", { name: "Completar sesión" }).click();
  await tracking.getByRole("button", { name: "Agregar resultado" }).click();
  await tracking.getByLabel("Nombre del resultado").fill("Front squat");
  await tracking.getByLabel("Valor del resultado").fill("90");
  await tracking.getByLabel("RPE").selectOption("8");
  await tracking.getByLabel("Comentario final").fill("Buena sesión");
  await tracking.getByRole("button", { name: "Guardar como completada" }).click();

  await tracking.getByText("Completada", { exact: true }).waitFor();
  await tracking.getByText("90 kg", { exact: true }).waitFor();
  await tracking.getByText("8/10", { exact: true }).waitFor();
  await tracking.getByText("Buena sesión", { exact: true }).waitFor();
  await tracking.getByRole("button", { name: "Corregir resultado" }).click();
  await tracking.getByLabel("Valor del resultado").fill("95");
  await tracking.getByRole("button", { name: "Guardar como completada" }).click();
  await tracking.getByText("95 kg", { exact: true }).waitFor();

  console.log("Athlete session execution verification passed: start, complete, results, RPE, comment, and correction.");
} finally {
  await browser?.close();
  await server.close();
}
