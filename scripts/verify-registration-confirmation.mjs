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
  const cognitoOperations = [];

  await page.route("https://cognito-idp.sa-east-1.amazonaws.com/", async (route) => {
    const operation = route.request().headers()["x-amz-target"]?.split(".").pop();
    cognitoOperations.push(operation);
    const rejectedSignIn = operation === "InitiateAuth";
    const body = operation === "SignUp"
      ? { UserConfirmed: false, UserSub: "athlete-id" }
      : operation === "ResendConfirmationCode"
        ? { CodeDeliveryDetails: { AttributeName: "email", DeliveryMedium: "EMAIL", Destination: "a***@gmail.com" } }
        : rejectedSignIn
          ? { __type: "UserNotConfirmedException", message: "User is not confirmed." }
          : {};
    await route.fulfill({
      status: rejectedSignIn ? 400 : 200,
      contentType: "application/x-amz-json-1.1",
      headers: { "access-control-allow-origin": appUrl.replace(/\/$/, "") },
      body: JSON.stringify(body),
    });
  });

  await page.goto(appUrl);
  await page.getByRole("button", { name: "No tengo cuenta" }).click();
  await page.getByLabel("Nombre").fill("Atleta Prueba");
  await page.getByLabel("Email").fill("atleta@gmail.com");
  await page.getByLabel("Contraseña").fill("ClaveSegura1");
  await page.getByRole("button", { name: "Atleta" }).click();
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await page.getByRole("heading", { name: "Revisá tu correo" }).waitFor();
  await page.getByRole("button", { name: "Reenviar código", exact: true }).click();
  await page.getByText("Enviamos un nuevo código de verificación").waitFor();
  await page.getByRole("button", { name: /Reenviar código en 60s/ }).waitFor();

  await page.getByRole("button", { name: "Volver al inicio de sesión" }).click();
  await page.getByLabel("Contraseña").fill("ClaveSegura1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Tu cuenta todavía no está confirmada").waitFor();
  await page.getByRole("button", { name: "Reenviar código", exact: true }).click();
  await page.getByText("Enviamos un nuevo código de verificación").waitFor();

  const expected = ["SignUp", "ResendConfirmationCode", "InitiateAuth", "ResendConfirmationCode"];
  if (JSON.stringify(cognitoOperations) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected Cognito operations: ${cognitoOperations.join(", ")}`);
  }

  console.log("Registration confirmation verification passed: sign up, unconfirmed sign-in, resend, and cooldown.");
} finally {
  await browser?.close();
  await server.close();
}
