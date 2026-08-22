import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

function runSeed(environment: Record<string, string | undefined>) {
  const executable = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  return spawnSync(executable, ["scripts/seed.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/cvg_synthetic_guard",
      DEMO_PASSWORD: "synthetic-seed-security-password",
      ...environment
    }
  });
}

function runDbSmoke(environment: Record<string, string | undefined>) {
  const executable = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  return spawnSync(executable, ["scripts/db-smoke.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/cvg_smoke_guard",
      ...environment
    }
  });
}

describe("synthetic seed safety guard", () => {
  it("requires an explicit destructive synthetic-seed opt-in before connecting", () => {
    const result = runSeed({ NODE_ENV: "development", ALLOW_SYNTHETIC_SEED: undefined });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/ALLOW_SYNTHETIC_SEED/i);
  });

  it("refuses the synthetic seed in production even with opt-in", () => {
    const result = runSeed({ NODE_ENV: "production", ALLOW_SYNTHETIC_SEED: "true" });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/produção|production/i);
  });
});

describe("database smoke safety guard", () => {
  it("requires explicit authorization before resetting a database", () => {
    const result = runDbSmoke({ NODE_ENV: "development", ALLOW_DB_SMOKE_RESET: undefined });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/ALLOW_DB_SMOKE_RESET/i);
  });

  it("refuses a reset in production even with authorization", () => {
    const result = runDbSmoke({ NODE_ENV: "production", ALLOW_DB_SMOKE_RESET: "true" });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/produção|production/i);
  });

  it("refuses non-loopback database targets", () => {
    const result = runDbSmoke({
      NODE_ENV: "development",
      ALLOW_DB_SMOKE_RESET: "true",
      DATABASE_URL: "postgresql://synthetic:synthetic@db.example.test:5432/cvg_smoke_guard"
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/loopback|local/i);
  });
});
