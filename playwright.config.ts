import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const systemChrome = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(systemChrome ? { launchOptions: { executablePath: systemChrome } } : {}),
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The shared system Chrome is used in this workspace; emulate the tablet viewport
    // without the touch profile, which exits before launch on the available host.
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1194 } } },
    { name: "mobile", use: { ...devices["Pixel 5"] } }
  ],
  webServer: {
    command: "APP_DATA_MODE=memory DEMO_PASSWORD=e2e-local-password-2026 LOGIN_RATE_LIMIT=100 STORAGE_SCAN_MODE=local npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
