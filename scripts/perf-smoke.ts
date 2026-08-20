const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const totalRequests = positiveInteger(process.env.PERF_REQUESTS, 100);
const concurrency = positiveInteger(process.env.PERF_CONCURRENCY, 10);
const warmupRequests = positiveInteger(process.env.PERF_WARMUP, 10);
const targetP95Ms = positiveNumber(process.env.PERF_TARGET_P95_MS, 500);
const enforce = process.env.PERF_ENFORCE !== "false";

async function main(): Promise<void> {
  const cookie = await login();
  await runBatch(warmupRequests, concurrency, cookie);
  const samples = await runBatch(totalRequests, concurrency, cookie);
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const errors = samples.filter((sample) => sample.status < 200 || sample.status >= 300);
  const report = {
    endpoint: "/api/v1/diagnostic-services",
    requests: samples.length,
    concurrency,
    errors: errors.length,
    errorRate: Number((errors.length / Math.max(1, samples.length)).toFixed(4)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.at(-1) ?? 0,
    targetP95Ms
  };
  console.log(JSON.stringify(report, null, 2));
  if (enforce && (report.errors > 0 || report.p95Ms > targetP95Ms)) throw new Error("Performance smoke não atingiu o alvo configurado.");
}

async function login(): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/session/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.PERF_EMAIL ?? "vet@cvg.local", password: process.env.PERF_PASSWORD ?? process.env.DEMO_PASSWORD ?? "local-demo-password" })
  });
  if (!response.ok) throw new Error(`Login de performance falhou com HTTP ${response.status}.`);
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") ?? ""];
  const cookies = setCookies.map((value) => value.split(";", 1)[0]).filter((value) => value.startsWith("cvg_session=") || value.startsWith("cvg_csrf=")).join("; ");
  if (!cookies.includes("cvg_session=") || !cookies.includes("cvg_csrf=")) throw new Error("Login de performance não retornou cookies esperados.");
  return cookies;
}

async function runBatch(count: number, workers: number, cookie: string): Promise<Array<{ status: number; durationMs: number }>> {
  const results: Array<{ status: number; durationMs: number }> = [];
  await Promise.all(Array.from({ length: Math.min(workers, count) }, async (_, worker) => {
    for (let index = worker; index < count; index += workers) {
      const started = performance.now();
      const response = await fetch(`${baseUrl}/api/v1/diagnostic-services`, { headers: { cookie } });
      results.push({ status: response.status, durationMs: round(performance.now() - started) });
      await response.arrayBuffer();
    }
  }));
  return results;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Performance smoke falhou.");
  process.exitCode = 1;
});
