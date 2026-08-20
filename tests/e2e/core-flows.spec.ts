import { expect, test } from "@playwright/test";

async function signInAs(page: import("@playwright/test").Page, email: string, expectedHeading: RegExp): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail profissional").fill(email);
  await page.getByLabel("Senha").fill("local-demo-password");
  await page.getByRole("button", { name: "Entrar no Hub" }).click({ force: true });
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: expectedHeading })).toBeVisible();
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await signInAs(page, "vet@cvg.local", /Bom dia/);
}

test.describe("operational hub journeys", () => {
  test("authenticates and renders the attention dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("region", { name: "Indicadores de atenção" })).toBeVisible();
    await expect(page.getByText("Solicitações em andamento")).toBeVisible();
    await expect(page.getByRole("link", { name: /Central de exames/ })).toBeVisible();
  });

  test("renders a useful technical home for an administrator", async ({ page }) => {
    await signInAs(page, "admin@cvg.local", /Administração técnica/);
    await expect(page.getByText("Você não tem acesso a este recurso.")).toHaveCount(0);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Administração" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Central de exames" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Notificações" })).toHaveCount(0);
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

  test("keeps request actions inside the items panel", async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1260, height: 720 });
    await page.route("**/api/v1/diagnostic-requests/request-layout", async (route) => {
      await route.fulfill({
        json: {
          data: {
            id: "request-layout",
            requestCode: "EX-LAYOUT-0001",
            priority: "URGENT",
            aggregateStatus: "REQUESTED",
            createdAt: "2026-08-20T12:00:00.000Z",
            patient: { displayName: "Thor", species: "Canino", sex: "Macho", externalId: "HIS-THOR-001", ownerLabel: "A. Oliveira" },
            items: [
              { id: "item-layout-lab", status: "REQUESTED", workflowType: "LABORATORY", priority: "URGENT", dueAt: "2026-08-20T13:00:00.000Z", version: 1, service: { name: "Hemograma", workflowType: "LABORATORY" } },
              { id: "item-layout-us", status: "REQUESTED", workflowType: "ULTRASOUND", priority: "URGENT", dueAt: "2026-08-20T13:00:00.000Z", version: 1, service: { name: "Ultrassom abdominal", workflowType: "ULTRASOUND" } }
            ]
          },
          meta: { correlationId: "e2e-layout", requestId: "e2e-layout" }
        }
      });
    });
    await page.route("**/api/v1/timeline**", async (route) => {
      await route.fulfill({ json: { data: [{ id: "event-layout", eventType: "Diagnostic Request Created", newState: "REQUESTED", occurredAt: "2026-08-20T12:00:00.000Z" }], meta: { correlationId: "e2e-layout", requestId: "e2e-layout" } } });
    });

    await page.goto("/requests/request-layout");
    await expect(page.getByRole("heading", { name: /Thor em acompanhamento/ })).toBeVisible();
    const itemsPanel = await page.locator(".detail-items").boundingBox();
    const timelinePanel = await page.locator(".timeline-panel").boundingBox();
    const action = await page.getByRole("button", { name: "Receber amostra" }).boundingBox();
    if (!itemsPanel || !timelinePanel || !action) throw new Error("Não foi possível medir os painéis da solicitação.");
    expect(action.x + action.width).toBeLessThanOrEqual(itemsPanel.x + itemsPanel.width + 1);
    expect(action.x + action.width).toBeLessThanOrEqual(timelinePanel.x - 8);
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
