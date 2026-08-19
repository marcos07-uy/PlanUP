import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

process.env.VITE_DEMO_MODE = "true";
process.env.VITE_DEMO_ROLE = "athlete";
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
  const coachSelector = page.getByLabel("Coach seleccionado");
  await coachSelector.waitFor();
  await page.getByRole("heading", { name: "Invitaciones de coaches" }).waitFor();
  await page.getByText("12 min AMRAP").waitFor();

  await coachSelector.selectOption("coach-2");
  await page.getByText("Trabajo de cadera y tobillo.").waitFor();

  await page.getByRole("button", { name: "Aceptar" }).click();
  await page.getByText("Diego ahora es tu coach").waitFor();
  if (await coachSelector.inputValue() !== "coach-3") throw new Error("Accepted coach was not selected");
  await page.getByRole("heading", { name: "Día libre de momento" }).waitFor();

  console.log("Athlete coach verification passed: invitations, selection, and isolated sessions.");
} finally {
  await browser?.close();
  await server.close();
}
