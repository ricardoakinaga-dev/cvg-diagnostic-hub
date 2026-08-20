import { describe, expect, it } from "vitest";
import { createApplicationService } from "./service";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";

function setup() {
  const store = new MemoryStore(createDemoState());
  const service = createApplicationService(store);
  const user = (email: string) => {
    const actor = store.getState().users.find((entry) => entry.email === email);
    if (!actor) throw new Error(`missing fixture actor: ${email}`);
    return actor;
  };
  return { store, service, admin: user("admin@cvg.local"), manager: user("manager@cvg.local"), vet: user("vet@cvg.local") };
}

describe("versioned catalog administration", () => {
  it("creates and updates a service with permission, optimistic version and audit", async () => {
    const { service, admin, manager, store } = setup();
    const created = await service.createDiagnosticService(admin, {
      code: "CT_ABDOMEN",
      name: "Tomografia abdominal",
      category: "IMAGING",
      departmentCode: "RADIOLOGY",
      workflowType: "RADIOLOGY",
      requiresSample: false,
      requiresSchedule: true,
      allowsAttachment: true,
      resultSchema: "NARRATIVE",
      slaHours: { ROUTINE: 72, URGENT: 24, EMERGENCY: 8 },
      idempotencyKey: "catalog-create"
    });
    await expect(service.updateDiagnosticService(manager, created.id, { name: "Tomografia", expectedVersion: 1, idempotencyKey: "catalog-manager-denied" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });

    const updated = await service.updateDiagnosticService(admin, created.id, { name: "Tomografia abdominal", active: false, expectedVersion: created.version, idempotencyKey: "catalog-update" });
    expect(updated.active).toBe(false);
    expect(updated.version).toBe(2);
    await expect(service.updateDiagnosticService(admin, created.id, { expectedVersion: 1, idempotencyKey: "catalog-stale" })).rejects.toMatchObject({ code: "STALE_VERSION" });
    expect(store.getState().auditEvents.some((event) => event.eventType === "DiagnosticServiceUpdated")).toBe(true);
  });

  it("creates, deactivates and rejects duplicate reason codes", async () => {
    const { service, admin } = setup();
    const created = await service.createReasonCode(admin, { type: "REJECT", code: "CLOT", label: "Coágulo", idempotencyKey: "reason-create" });
    expect(created.version).toBe(1);
    await expect(service.createReasonCode(admin, { type: "REJECT", code: "CLOT", label: "Outro", idempotencyKey: "reason-duplicate" })).rejects.toMatchObject({ code: "CONFLICT" });
    const updated = await service.updateReasonCode(admin, created.id, { active: false, expectedVersion: created.version, idempotencyKey: "reason-update" });
    expect(updated.active).toBe(false);
    expect(updated.version).toBe(2);
  });

  it("does not let a care actor mutate the catalog", async () => {
    const { service, vet } = setup();
    await expect(service.createReasonCode(vet, { type: "REJECT", code: "NOPE", label: "Sem permissão", idempotencyKey: "reason-denied" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  });
});
