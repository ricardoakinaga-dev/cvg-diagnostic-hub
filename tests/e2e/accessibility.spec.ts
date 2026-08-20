import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail profissional").fill("vet@cvg.local");
  await page.getByLabel("Senha").fill("local-demo-password");
  await page.getByRole("button", { name: "Entrar no Hub" }).click({ force: true });
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
}

async function expectNoAxeViolations(page: import("@playwright/test").Page, name: string): Promise<void> {
  const rules = ["aria-allowed-attr", "aria-required-attr", "aria-valid-attr", "button-name", "document-title", "duplicate-id-aria", "html-has-lang", "heading-order", "label", "landmark-one-main", "link-name", "nested-interactive", "role-img-alt", "tabindex"];
  const results = await new AxeBuilder({ page }).include("main").withRules(rules).setLegacyMode(true).analyze();
  expect(results.violations, `${name}: ${results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("; ")}`).toEqual([]);
}

test.describe("accessible operational surfaces", () => {
  test("login, dashboard, queue and notifications have no axe violations", async ({ page }) => {
    await page.goto("/login");
    await expectNoAxeViolations(page, "login");
    await signIn(page);
    await expectNoAxeViolations(page, "dashboard");

    await page.goto("/queues");
    await expect(page.getByRole("heading", { name: /Central de exames/ })).toBeVisible();
    await expectNoAxeViolations(page, "queues");

    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: /Notificações/ })).toBeVisible();
    await expectNoAxeViolations(page, "notifications");
  });

  test("login form has a keyboard-visible first field and named controls", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail profissional").focus();
    await expect(page.getByLabel("E-mail profissional")).toBeFocused();
    await expect(page.getByLabel("Senha")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByRole("button", { name: "Entrar no Hub" })).toBeVisible();
  });
});
