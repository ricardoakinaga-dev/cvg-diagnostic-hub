import { describe, expect, it } from "vitest";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";
import { assertCsrf, authenticateRequest, loginUser, revokeSession } from "./session";

describe("secure server sessions", () => {
  it("creates an opaque session and authenticates it through a cookie", async () => {
    const store = new MemoryStore(createDemoState("test-password"));
    const login = await loginUser(store, "vet@cvg.local", "test-password");
    const request = new Request("http://localhost/api/v1/me", {
      headers: { cookie: `cvg_session=${login.sessionToken}` }
    });

    const user = await authenticateRequest(store, request);

    expect(user.email).toBe("vet@cvg.local");
    expect(login.sessionToken).not.toContain(user.id);
  });

  it("rejects wrong credentials and revoked sessions", async () => {
    const store = new MemoryStore(createDemoState("test-password"));
    await expect(loginUser(store, "vet@cvg.local", "wrong-password")).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    const login = await loginUser(store, "vet@cvg.local", "test-password");
    await revokeSession(store, login.sessionToken);
    await expect(
      authenticateRequest(store, new Request("http://localhost", { headers: { cookie: `cvg_session=${login.sessionToken}` } }))
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 401 });
  });

  it("requires the double-submit CSRF token for cookie-authenticated mutations", async () => {
    const request = new Request("http://localhost/api/v1/diagnostic-requests", {
      headers: { cookie: "cvg_session=session; cvg_csrf=csrf-cookie", "x-csrf-token": "csrf-header" }
    });

    expect(() => assertCsrf(request)).toThrowError(expect.objectContaining({ code: "CSRF_INVALID" }));
    const validRequest = new Request("http://localhost/api/v1/diagnostic-requests", {
      headers: { cookie: "cvg_session=session; cvg_csrf=csrf-value", "x-csrf-token": "csrf-value" }
    });
    expect(() => assertCsrf(validRequest)).not.toThrow();
  });
});
