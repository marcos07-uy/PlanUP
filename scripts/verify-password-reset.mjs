import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

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
  const cognitoOperations = [];

  await page.route("https://cognito-idp.sa-east-1.amazonaws.com/", async (route) => {
    const operation = route.request().headers()["x-amz-target"]?.split(".").pop();
    cognitoOperations.push(operation);

    const body = operation === "ForgotPassword"
      ? { CodeDeliveryDetails: { AttributeName: "email", DeliveryMedium: "EMAIL", Destination: "m***@example.com" } }
      : {};

    await route.fulfill({
      status: 200,
      contentType: "application/x-amz-json-1.1",
      headers: { "access-control-allow-origin": appUrl.replace(/\/$/, "") },
      body: JSON.stringify(body),
    });
  });

  await page.goto(appUrl);
  await page.getByRole("button", { name: "Olvidé mi contraseña" }).click();
  await page.getByLabel("Email").fill("marcos@example.com");
  await page.getByRole("button", { name: "Enviar código" }).click();

  await page.getByRole("heading", { name: "Creá una contraseña" }).waitFor();
  await page.getByText("Si existe una cuenta con ese email").waitFor();
  await page.getByLabel("Código de verificación").fill("123456");
  await page.getByLabel("Nueva contraseña").fill("NuevaClave1");
  await page.getByRole("button", { name: "Cambiar contraseña" }).click();

  await page.getByRole("heading", { name: "Inicia sesión" }).waitFor();
  await page.getByText("Contraseña actualizada").waitFor();

  const expectedOperations = ["ForgotPassword", "ConfirmForgotPassword"];
  if (JSON.stringify(cognitoOperations) !== JSON.stringify(expectedOperations)) {
    throw new Error(`Unexpected Cognito operations: ${cognitoOperations.join(", ")}`);
  }

  console.log("Password reset verification passed: request code and confirm new password.");
} finally {
  await browser?.close();
  await server.close();
}
