import type { StoreState } from "../domain/models";

type HttpMetric = { count: number; totalDurationMs: number; maxDurationMs: number };

const httpMetrics = new Map<string, HttpMetric>();
const durationMetrics = new Map<string, HttpMetric>();
const gauges = new Map<string, number>();
const allowedGauges = new Set(["outbox_pending", "outbox_oldest_age_seconds", "readiness_failures", "sse_connections"]);

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
  const safeMethod = method.toUpperCase().replaceAll(/[^A-Z]/g, "").slice(0, 12) || "UNKNOWN";
  const safeRoute = normalizeRoute(route);
  const safeStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? String(status) : "500";
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, Math.min(durationMs, 600_000)) : 0;
  addMetric(httpMetrics, `${safeMethod}|${safeRoute}|${safeStatus}`, safeDuration);
  addMetric(durationMetrics, `${safeMethod}|${safeRoute}`, safeDuration);
}

export function setGauge(name: string, value: number): void {
  if (!allowedGauges.has(name) || !Number.isFinite(value)) return;
  gauges.set(name, Math.max(0, Math.min(value, Number.MAX_SAFE_INTEGER)));
}

export function incrementGauge(name: string, delta = 1): void {
  if (!Number.isFinite(delta)) return;
  setGauge(name, (gauges.get(name) ?? 0) + delta);
}

export function recordReadinessFailure(): void {
  incrementGauge("readiness_failures");
}

export function refreshOperationalMetrics(state: StoreState, now = new Date()): void {
  const pending = state.outbox.filter((message) => message.status === "PENDING" || message.status === "PROCESSING");
  setGauge("outbox_pending", pending.length);
  const oldestAvailableAt = pending
    .map((message) => Date.parse(message.availableAt))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => left - right)[0];
  const oldestAgeSeconds = oldestAvailableAt === undefined ? 0 : Math.max(0, (now.getTime() - oldestAvailableAt) / 1_000);
  setGauge("outbox_oldest_age_seconds", oldestAgeSeconds);
}

export function renderPrometheus(): string {
  const lines = [
    "# HELP http_requests_total Total HTTP requests handled by the application.",
    "# TYPE http_requests_total counter"
  ];
  for (const [key, metric] of [...httpMetrics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [method, route, status] = key.split("|");
    lines.push(`http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${status}"} ${metric.count}`);
  }
  lines.push("# HELP http_request_duration_ms HTTP request duration summary counters.", "# TYPE http_request_duration_ms summary");
  for (const [key, metric] of [...durationMetrics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [method, route] = key.split("|");
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
    lines.push(`http_request_duration_ms_sum{${labels}} ${metric.totalDurationMs.toFixed(3)}`);
    lines.push(`http_request_duration_ms_count{${labels}} ${metric.count}`);
    lines.push(`http_request_duration_ms_max{${labels}} ${metric.maxDurationMs.toFixed(3)}`);
  }
  for (const [name, value] of [...gauges.entries()].sort(([left], [right]) => left.localeCompare(right))) lines.push(`cvg_${name} ${value}`);
  return `${lines.join("\n")}\n`;
}

export function resetMetrics(): void {
  httpMetrics.clear();
  durationMetrics.clear();
  gauges.clear();
}

export function routeMetricLabel(path: readonly string[]): string {
  const first = path[0]?.replaceAll(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || "root";
  return `/api/v1/${first}`;
}

function addMetric(target: Map<string, HttpMetric>, key: string, durationMs: number): void {
  const current = target.get(key) ?? { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
  target.set(key, { count: current.count + 1, totalDurationMs: current.totalDurationMs + durationMs, maxDurationMs: Math.max(current.maxDurationMs, durationMs) });
}

function normalizeRoute(route: string): string {
  const candidate = route.split("?")[0].trim();
  if (!candidate || candidate.length > 120) return "/unknown";
  return candidate.replaceAll(/\b(?:patient|encounter|admission|request|item|sample|procedure|result|attachment|session|outbox|corr|req|EX)-[A-Za-z0-9_-]+\b/g, "[id]");
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}
