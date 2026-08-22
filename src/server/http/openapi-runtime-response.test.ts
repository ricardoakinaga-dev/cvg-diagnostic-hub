import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "../../app/api/v1/[...path]/route";
import { resetRuntimeStore } from "../store/runtime";

process.env.APP_DATA_MODE = "memory";
process.env.DEMO_PASSWORD = "api-test-password";
process.env.LOGIN_RATE_LIMIT = "100";

type JsonObject = Record<string, unknown>;

const document = JSON.parse(
  readFileSync(new URL("../../../docs/api/openapi.json", import.meta.url), "utf8")
) as JsonObject;
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(document, "cvg-openapi");

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

async function login(email: string): Promise<{ cookie: string; csrf: string }> {
  const response = await POST(new Request("http://localhost/api/v1/session/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "api-test-password" })
  }), params(["session", "login"]));
  const cookies = response.headers.get("set-cookie") ?? "";
  const session = cookies.match(/cvg_session=([^;]+)/)?.[1];
  const csrf = cookies.match(/cvg_csrf=([^;]+)/)?.[1];
  if (!session || !csrf) throw new Error("session cookies missing");
  return { cookie: `cvg_session=${session}; cvg_csrf=${csrf}`, csrf };
}

function operation(path: string, method: string): JsonObject {
  return ((document.paths as JsonObject)[path] as JsonObject)[method] as JsonObject;
}

function expectResponseMatches(path: string, method: string, status: number, body: unknown): void {
  const response = (operation(path, method).responses as JsonObject)[String(status)] as JsonObject;
  const media = (response.content as JsonObject)["application/json"] as JsonObject;
  const schema = media.schema as { $ref: string };
  const validate = ajv.compile({ $ref: `cvg-openapi${schema.$ref}` });
  expect(validate(body), JSON.stringify(validate.errors, null, 2)).toBe(true);
}

describe("OpenAPI schemas against real route responses", () => {
  beforeEach(() => resetRuntimeStore());

  it("validates public, audit, search and timeline envelopes emitted by the runtime", async () => {
    const liveness = await GET(new Request("http://localhost/api/v1/livez"), params(["livez"]));
    const livenessBody = await liveness.json();
    expectResponseMatches("/livez", "get", liveness.status, livenessBody);

    const admin = await login("admin@cvg.local");
    const audit = await GET(new Request("http://localhost/api/v1/audit-events?limit=10", {
      headers: { cookie: admin.cookie }
    }), params(["audit-events"]));
    const auditBody = await audit.json();
    expectResponseMatches("/audit-events", "get", audit.status, auditBody);

    const vet = await login("vet@cvg.local");
    const created = await POST(new Request("http://localhost/api/v1/diagnostic-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: vet.cookie,
        "x-csrf-token": vet.csrf,
        "idempotency-key": "openapi-runtime-response"
      },
      body: JSON.stringify({
        patientId: "patient-thor",
        encounterId: "encounter-thor",
        priority: "ROUTINE",
        items: [{ serviceId: "service-hemogram" }]
      })
    }), params(["diagnostic-requests"]));
    const createdBody = await created.json();
    expectResponseMatches("/diagnostic-requests", "post", created.status, createdBody);

    const search = await GET(new Request("http://localhost/api/v1/search?q=Thor&limit=10", {
      headers: { cookie: vet.cookie }
    }), params(["search"]));
    expectResponseMatches("/search", "get", search.status, await search.json());

    const requestId = createdBody.data.id as string;
    const timeline = await GET(new Request(`http://localhost/api/v1/timeline?requestId=${requestId}&limit=10`, {
      headers: { cookie: vet.cookie }
    }), params(["timeline"]));
    expectResponseMatches("/timeline", "get", timeline.status, await timeline.json());
  });
});
