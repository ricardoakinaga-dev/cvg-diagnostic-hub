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
    await page.getByLabel("Atendimento").selectOption(scenario.patient === "patient-thor" ? "encounter-thor" : "encounter-mel");
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

  test("opens the patient context without exposing an unscoped list", async ({ page }) => {
    await signIn(page);
    await page.getByRole("link", { name: /Meus pacientes/ }).click({ force: true });
    await expect(page).toHaveURL(/\/patients$/);
    await expect(page.getByRole("heading", { name: /Meus pacientes/ })).toBeVisible();
    await page.goto("/patients/patient-thor/diagnostics");
    await expect(page).toHaveURL(/\/patients\/patient-thor\/diagnostics$/);
    await expect(page.getByRole("heading", { name: /Thor/ })).toBeVisible();
  });

  test("keeps the dashboard useful when one resource is unavailable", async ({ page }) => {
    await page.route("**/api/v1/notifications**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("filter") === "UNREAD") await route.abort("failed");
      else await route.continue();
    });
    await signIn(page);
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível atualizar as notificações." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solicitações em andamento" })).toBeVisible();
  });
});
