import { describe, expect, it, beforeEach } from "vitest";
import { GET, PATCH, POST, PUT } from "./route";
import { resetRuntimeStore } from "../../../../server/store/runtime";
import { resetMetrics } from "../../../../server/observability/metrics";

process.env.APP_DATA_MODE = "memory";
process.env.DEMO_PASSWORD = "api-test-password";
process.env.LOGIN_RATE_LIMIT = "100";

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

async function login(email = "vet@cvg.local") {
  const response = await POST(new Request("http://localhost/api/v1/session/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "api-test-password" })
  }), params(["session", "login"]));
  const setCookie = response.headers.get("set-cookie") ?? "";
  const session = setCookie.match(/cvg_session=([^;]+)/)?.[1];
  const csrf = setCookie.match(/cvg_csrf=([^;]+)/)?.[1];
  if (!session || !csrf) throw new Error("session cookies missing");
  return { cookie: `cvg_session=${session}; cvg_csrf=${csrf}`, csrf };
}

describe("versioned API boundary", () => {
  beforeEach(() => {
    resetRuntimeStore();
    resetMetrics();
  });

  it("exposes liveness with correlation metadata without authentication", async () => {
    const response = await GET(new Request("http://localhost/api/v1/livez"), params(["livez"]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ok");
    expect(response.headers.get("x-correlation-id")).toBeTruthy();
  });

  it("reports readiness only after the configured store is available", async () => {
    const response = await GET(new Request("http://localhost/api/v1/readyz"), params(["readyz"]));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ status: "ready", dataMode: "memory" });
  });

  it("reports storage readiness failure and exposes the failure counter only to an administrator", async () => {
    process.env.STORAGE_MODE = "s3";
    delete process.env.STORAGE_ENDPOINT;
    try {
      const response = await GET(new Request("http://localhost/api/v1/readyz"), params(["readyz"]));
      expect(response.status).toBe(503);

      delete process.env.STORAGE_MODE;
      const admin = await login("admin@cvg.local");
      const metrics = await GET(new Request("http://localhost/api/v1/metrics", { headers: { cookie: admin.cookie } }), params(["metrics"]));
      expect(await metrics.text()).toContain("cvg_readiness_failures 1");
    } finally {
      delete process.env.STORAGE_MODE;
      delete process.env.STORAGE_ENDPOINT;
      resetRuntimeStore();
    }
  });

  it("rejects protected resources when no session exists", async () => {
    const response = await GET(new Request("http://localhost/api/v1/diagnostic-services"), params(["diagnostic-services"]));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("exposes versioned administration reads only to configuration actors", async () => {
    const admin = await login("admin@cvg.local");
    const services = await GET(new Request("http://localhost/api/v1/diagnostic-services?includeInactive=true", { headers: { cookie: admin.cookie } }), params(["diagnostic-services"]));
    expect(services.status).toBe(200);
    expect((await services.json()).data[0]).toMatchObject({ code: "HEMOGRAM", active: true, version: 1 });

    const reasons = await GET(new Request("http://localhost/api/v1/reason-codes", { headers: { cookie: admin.cookie } }), params(["reason-codes"]));
    expect(reasons.status).toBe(200);
    expect((await reasons.json()).data.map((entry: { code: string }) => entry.code)).toContain("HEMOLYZED");

    const vet = await login();
    const denied = await GET(new Request("http://localhost/api/v1/diagnostic-services?includeInactive=true", { headers: { cookie: vet.cookie } }), params(["diagnostic-services"]));
    expect(denied.status).toBe(404);
  });

  it("creates a request through the authenticated HTTP boundary", async () => {
    const auth = await login();
    const response = await POST(new Request("http://localhost/api/v1/diagnostic-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookie,
        "x-csrf-token": auth.csrf,
        "idempotency-key": "api-request-1"
      },
      body: JSON.stringify({
        patientId: "patient-thor",
        encounterId: "encounter-thor",
        priority: "URGENT",
        items: [{ serviceId: "service-hemogram" }]
      })
    }), params(["diagnostic-requests"]));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.requestCode).toMatch(/^EX-/);
    expect(body.data.items[0].service.code).toBe("HEMOGRAM");

    const itemResponse = await GET(new Request(`http://localhost/api/v1/diagnostic-items/${body.data.items[0].id}`, { headers: { cookie: auth.cookie } }), params(["diagnostic-items", body.data.items[0].id]));
    expect(itemResponse.status).toBe(200);
    expect((await itemResponse.json()).data.service.code).toBe("HEMOGRAM");

    const realtimeResponse = await GET(new Request("http://localhost/api/v1/realtime/events?snapshot=true", { headers: { cookie: auth.cookie } }), params(["realtime", "events"]));
    const realtimeBody = await realtimeResponse.text();
    expect(realtimeResponse.status).toBe(200);
    expect(realtimeBody).toContain("retry: 5000");
    expect(realtimeBody).toContain("event: diagnostic.updated");
    const eventId = realtimeBody.match(/id: ([^\n]+)/)?.[1];
    expect(eventId).toBeTruthy();

    const replay = await GET(new Request("http://localhost/api/v1/realtime/events?snapshot=true", { headers: { cookie: auth.cookie, "last-event-id": eventId! } }), params(["realtime", "events"]));
    expect(await replay.text()).not.toContain(`id: ${eventId}`);

    const resync = await GET(new Request("http://localhost/api/v1/realtime/events?snapshot=true", { headers: { cookie: auth.cookie, "last-event-id": "expired-event" } }), params(["realtime", "events"]));
    expect(await resync.text()).toContain("event: resync_required");
  });

  it("rejects non-object JSON bodies at the command boundary", async () => {
    const auth = await login();
    const response = await PATCH(new Request("http://localhost/api/v1/results/result-missing/draft", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: auth.cookie, "x-csrf-token": auth.csrf },
      body: JSON.stringify([])
    }), params(["results", "result-missing", "draft"]));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("exposes bounded metrics only to readiness-capable administrators", async () => {
    const admin = await login("admin@cvg.local");
    const response = await GET(new Request("http://localhost/api/v1/metrics", { headers: { cookie: admin.cookie } }), params(["metrics"]));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("http_requests_total");
    expect(body).not.toContain("patient-thor");

    const vet = await login();
    const denied = await GET(new Request("http://localhost/api/v1/metrics", { headers: { cookie: vet.cookie } }), params(["metrics"]));
    expect(denied.status).toBe(404);
  });

  it("tracks active SSE connections and cleans the gauge when the client disconnects", async () => {
    const admin = await login("admin@cvg.local");
    const stream = await GET(new Request("http://localhost/api/v1/realtime/events", { headers: { cookie: admin.cookie } }), params(["realtime", "events"]));
    const reader = stream.body?.getReader();
    expect(reader).toBeTruthy();
    await reader!.read();

    const active = await GET(new Request("http://localhost/api/v1/metrics", { headers: { cookie: admin.cookie } }), params(["metrics"]));
    expect(await active.text()).toContain("cvg_sse_connections 1");

    await reader!.cancel();
    const inactive = await GET(new Request("http://localhost/api/v1/metrics", { headers: { cookie: admin.cookie } }), params(["metrics"]));
    expect(await inactive.text()).toContain("cvg_sse_connections 0");
  });

  it("rejects an attachment body after reading it when content-length is absent or false", async () => {
    const auth = await login();
    process.env.ATTACHMENT_MAX_BYTES = "10";
    try {
      const response = await PUT(new Request("http://localhost/api/v1/attachments/attachment-missing/content", {
        method: "PUT",
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf, "content-type": "application/octet-stream" },
        body: new Uint8Array(11)
      }), params(["attachments", "attachment-missing", "content"]));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    } finally {
      delete process.env.ATTACHMENT_MAX_BYTES;
    }
  });

  it("rejects unsupported list filters instead of silently returning an empty page", async () => {
    const auth = await login();
    const response = await GET(new Request("http://localhost/api/v1/diagnostic-requests?status=NOT_A_STATUS", {
      headers: { cookie: auth.cookie }
    }), params(["diagnostic-requests"]));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid queue limits at the HTTP boundary", async () => {
    const auth = await login("lab@cvg.local");
    const response = await GET(new Request("http://localhost/api/v1/queues/LABORATORY/items?limit=-1", {
      headers: { cookie: auth.cookie }
    }), params(["queues", "LABORATORY", "items"]));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("exposes scoped patient diagnostics and audit events through read endpoints", async () => {
    const vet = await login();
    const create = await POST(new Request("http://localhost/api/v1/diagnostic-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: vet.cookie,
        "x-csrf-token": vet.csrf,
        "idempotency-key": "api-read-model-request"
      },
      body: JSON.stringify({
        patientId: "patient-thor",
        encounterId: "encounter-thor",
        priority: "ROUTINE",
        items: [{ serviceId: "service-hemogram" }]
      })
    }), params(["diagnostic-requests"]));
    expect(create.status).toBe(201);

    const diagnostics = await GET(new Request("http://localhost/api/v1/patients/patient-thor/diagnostics?limit=10", {
      headers: { cookie: vet.cookie }
    }), params(["patients", "patient-thor", "diagnostics"]));
    expect(diagnostics.status).toBe(200);
    expect((await diagnostics.json()).data.items).toHaveLength(1);

    const manager = await login("manager@cvg.local");
    const audit = await GET(new Request("http://localhost/api/v1/audit-events?limit=10", {
      headers: { cookie: manager.cookie }
    }), params(["audit-events"]));
    expect(audit.status).toBe(200);
    expect((await audit.json()).data.length).toBeGreaterThan(0);
  });

  it("serves a scoped report with attachment metadata after release", async () => {
    const vet = await login();
    const create = await POST(new Request("http://localhost/api/v1/diagnostic-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: vet.cookie,
        "x-csrf-token": vet.csrf,
        "idempotency-key": "api-report-request"
      },
      body: JSON.stringify({
        patientId: "patient-thor",
        encounterId: "encounter-thor",
        priority: "ROUTINE",
        items: [{ serviceId: "service-hemogram" }]
      })
    }), params(["diagnostic-requests"]));
    const created = await create.json();
    const itemId = created.data.items[0].id as string;

    const lab = await login("lab@cvg.local");
    const receive = await POST(new Request(`http://localhost/api/v1/diagnostic-items/${itemId}/receive-sample`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: lab.cookie, "x-csrf-token": lab.csrf, "idempotency-key": "api-report-receive" },
      body: JSON.stringify({ accessionCode: "ACC-API-REPORT", sampleType: "EDTA" })
    }), params(["diagnostic-items", itemId, "receive-sample"]));
    const received = await receive.json();
    const start = await POST(new Request(`http://localhost/api/v1/diagnostic-items/${itemId}/start-processing`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: lab.cookie, "x-csrf-token": lab.csrf, "idempotency-key": "api-report-start" },
      body: JSON.stringify({ expectedVersion: received.data.items[0].version })
    }), params(["diagnostic-items", itemId, "start-processing"]));
    expect(start.status).toBe(200);
    const draft = await POST(new Request(`http://localhost/api/v1/diagnostic-items/${itemId}/results`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: lab.cookie, "x-csrf-token": lab.csrf, "idempotency-key": "api-report-draft" },
      body: JSON.stringify({ narrative: "Hemograma dentro do protocolo.", content: {} })
    }), params(["diagnostic-items", itemId, "results"]));
    const draftBody = await draft.json();
    const release = await POST(new Request(`http://localhost/api/v1/results/${draftBody.data.result.id}/release`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: lab.cookie, "x-csrf-token": lab.csrf, "idempotency-key": "api-report-release" },
      body: JSON.stringify({})
    }), params(["results", draftBody.data.result.id, "release"]));
    expect(release.status).toBe(200);

    const report = await GET(new Request(`http://localhost/api/v1/reports/${draftBody.data.result.id}`, { headers: { cookie: vet.cookie } }), params(["reports", draftBody.data.result.id]));
    expect(report.status).toBe(200);
    expect((await report.json()).data).toMatchObject({ result: { id: draftBody.data.result.id }, attachments: [] });
  });
});
