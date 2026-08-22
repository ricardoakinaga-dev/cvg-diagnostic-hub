import { describe, expect, it } from "vitest";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";
import { authenticateRequest, loginUser, reauthenticateUser, revokeSession } from "./session";

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

  it("authenticates against the fresh read boundary instead of a stale inspection cache", async () => {
    const store = new MemoryStore(createDemoState("fresh-session-password"));
    const login = await loginUser(store, "vet@cvg.local", "fresh-session-password");
    const staleState = store.getState();
    await revokeSession(store, login.sessionToken);
    const freshnessBoundary = {
      getState: () => structuredClone(staleState),
      readState: () => store.readState(),
      transaction: store.transaction.bind(store)
    };
    const request = new Request("http://localhost/api/v1/me", {
      headers: { cookie: `cvg_session=${login.sessionToken}` }
    });

    await expect(authenticateRequest(freshnessBoundary, request)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
      status: 401
    });
  });

  it("records a recent password reauthentication on the opaque session", async () => {
    const store = new MemoryStore(createDemoState("test-password"));
    const login = await loginUser(store, "admin@cvg.local", "test-password");
    const request = new Request("http://localhost/api/v1/session/reauth", {
      headers: { cookie: `cvg_session=${login.sessionToken}` }
    });

    const reauthenticated = await reauthenticateUser(store, request, "test-password");
    expect(reauthenticated.reauthenticatedAt).toEqual(expect.any(String));
    expect((await authenticateRequest(store, request)).reauthenticatedAt).toBe(reauthenticated.reauthenticatedAt);
    await expect(reauthenticateUser(store, request, "wrong-password")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("requires the double-submit CSRF token for cookie-authenticated mutations", async () => {
    const store = new MemoryStore(createDemoState("test-password"));
    const login = await loginUser(store, "vet@cvg.local", "test-password");
    const request = new Request("http://localhost/api/v1/diagnostic-requests", {
      headers: { cookie: `cvg_session=${login.sessionToken}; cvg_csrf=${login.csrfToken}`, "x-csrf-token": "csrf-header" }
    });

    await expect(authenticateRequest(store, request, { requireCsrf: true })).rejects.toMatchObject({ code: "CSRF_INVALID" });
    const validRequest = new Request("http://localhost/api/v1/diagnostic-requests", {
      headers: { cookie: `cvg_session=${login.sessionToken}; cvg_csrf=${login.csrfToken}`, "x-csrf-token": login.csrfToken }
    });
    await expect(authenticateRequest(store, validRequest, { requireCsrf: true })).resolves.toMatchObject({ id: "user-vet" });
  });

  it("rejects matching CSRF cookie and header tokens that belong to another session", async () => {
    const store = new MemoryStore(createDemoState("test-password"));
    const authenticatedSession = await loginUser(store, "vet@cvg.local", "test-password");
    const otherSession = await loginUser(store, "admin@cvg.local", "test-password");
    const request = new Request("http://localhost/api/v1/diagnostic-requests", {
      headers: {
        cookie: `cvg_session=${authenticatedSession.sessionToken}; cvg_csrf=${otherSession.csrfToken}`,
        "x-csrf-token": otherSession.csrfToken
      }
    });

    await expect(authenticateRequest(store, request, { requireCsrf: true })).rejects.toMatchObject({
      code: "CSRF_INVALID",
      status: 403
    });
  });
});
