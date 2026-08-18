import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Sesión del día" }).waitFor();

const dateButtons = page.locator(".date-strip button");
await dateButtons.nth(3).click();
await page.getByText("Día libre de momento").waitFor();
await dateButtons.nth(2).click();
await page.getByRole("heading", { name: "WOD" }).waitFor();

await page.getByRole("button", { name: "Editar sesión" }).click();
const editor = page.getByRole("textbox", { name: "Contenido de la sesión" });
await editor.waitFor();
await editor.fill(await editor.inputValue());
await page.getByRole("button", { name: "Guardar sesión" }).click();
await page.getByText("Sesión guardada").waitFor();

await page.waitForTimeout(2300);
await page.screenshot({ path: "/tmp/planup-mobile-viewport.png" });
await page.screenshot({ path: "/tmp/planup-mobile-final.png", fullPage: true });

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UI verification passed: date navigation, empty state, editor, save confirmation, and console.");
}

await browser.close();
