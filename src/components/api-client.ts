export interface ApiEnvelope<T> {
  data: T;
  meta: { correlationId: string; requestId: string; [key: string]: unknown };
}

export interface ApiFailure {
  error?: { code?: string; message?: string; details?: Record<string, unknown>; correlationId?: string };
}

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith("cvg_csrf="))?.slice("cvg_csrf=".length);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") {
    const token = csrfToken();
    if (token) headers.set("x-csrf-token", token);
    if (!headers.has("idempotency-key")) headers.set("idempotency-key", crypto.randomUUID());
  }
  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "include" });
  const body = (await response.json()) as ApiEnvelope<T> & ApiFailure;
  if (!response.ok) {
    const error = new Error(body.error?.message ?? "Não foi possível concluir a operação.") as Error & { code?: string; correlationId?: string };
    error.code = body.error?.code;
    error.correlationId = body.error?.correlationId;
    throw error;
  }
  return body.data;
}

export function formatRelativeTime(value: string): string {
  const elapsedMinutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (elapsedMinutes < 1) return "agora";
  if (elapsedMinutes < 60) return `há ${elapsedMinutes} min`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `há ${elapsedHours} h`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
