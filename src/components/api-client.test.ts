/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { apiFetch, formatRelativeTime } from "./api-client";

describe("browser API client", () => {
  it("adds cookie CSRF/idempotency headers and unwraps a successful envelope", async () => {
    document.cookie = "cvg_csrf=csrf-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { ok: true }, meta: { correlationId: "c", requestId: "r" } }), { status: 200 }));
    await expect(apiFetch<{ ok: boolean }>("/diagnostic-requests", { method: "POST", body: "{}" })).resolves.toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("x-csrf-token")).toBe("csrf-test");
    expect(headers.get("idempotency-key")).toBeTruthy();
    fetchMock.mockRestore();
  });

  it("turns safe API failures into useful client errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "SCOPE_DENIED", message: "Sem acesso", correlationId: "c" } }), { status: 404 }));
    await expect(apiFetch("/patients/patient-secret")).rejects.toMatchObject({ code: "SCOPE_DENIED", correlationId: "c" });
    fetchMock.mockRestore();
  });

  it("formats recent and old timestamps without exposing internal details", () => {
    expect(formatRelativeTime(new Date(Date.now() - 10_000).toISOString())).toBe("agora");
    expect(formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())).toBe("há 2 h");
  });
});
