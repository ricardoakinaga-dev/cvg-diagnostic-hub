import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail profissional").fill("vet@cvg.local");
  await page.getByLabel("Senha").fill("local-demo-password");
  await page.getByRole("button", { name: "Entrar no Hub" }).click({ force: true });
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
}

test.describe("operational hub journeys", () => {
  test("authenticates and renders the attention dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("region", { name: "Indicadores de atenção" })).toBeVisible();
    await expect(page.getByText("Solicitações em andamento")).toBeVisible();
    await expect(page.getByRole("link", { name: /Central de exames/ })).toBeVisible();
  });

  test("creates a contextual multi-service request through the UI", async ({ page }, testInfo) => {
    const scenario = {
      chromium: { patient: "patient-thor", services: ["Hemograma", "RX de tórax"] },
      tablet: { patient: "patient-mel", services: ["Proteína C reativa", "Ultrassom abdominal"] },
      mobile: { patient: "patient-mel", services: ["Hemograma", "RX de tórax"] }
    }[testInfo.project.name] ?? { patient: "patient-thor", services: ["Hemograma", "RX de tórax"] };
    await signIn(page);
    await page.getByRole("button", { name: /Nova solicitação/ }).click({ force: true });
    await expect(page.getByRole("dialog", { name: "Solicitar exames" })).toBeVisible();
    await page.getByLabel("Paciente").selectOption(scenario.patient);
    for (const service of scenario.services) await page.getByText(service, { exact: true }).click({ force: true });
    await page.getByRole("button", { name: /Confirmar solicitação/ }).click({ force: true });
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("EX-", { exact: false }).first()).toBeVisible();
  });

  test("keeps navigation usable on a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
    await page.getByRole("link", { name: /Abrir notificações/ }).click({ force: true });
    await expect(page).toHaveURL(/notifications/);
    await expect(page.getByRole("heading", { name: /Notificações/ })).toBeVisible();
  });
});
