import { describe, expect, it } from "vitest";
import { createApplicationService } from "./service";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";

function setup() {
  const store = new MemoryStore(createDemoState());
  const service = createApplicationService(store);
  const actor = store.getState().users.find((user) => user.email === "vet@cvg.local");
  const labActor = store.getState().users.find((user) => user.email === "lab@cvg.local");
  if (!actor || !labActor) throw new Error("missing fixture actor");
  return { store, service, actor, labActor };
}

describe("diagnostic application service", () => {
  it("creates a contextual multi-item request and stable human protocol", async () => {
    const { service, actor } = setup();
    const patient = "patient-thor";
    const encounter = "encounter-thor";

    const result = await service.createRequest(actor, {
      patientId: patient,
      encounterId: encounter,
      priority: "URGENT",
      items: [{ serviceId: "service-hemogram" }, { serviceId: "service-xray" }]
    }, { idempotencyKey: "request-1", correlationId: "corr-request-1" });

    expect(result.requestCode).toMatch(/^EX-/);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.status)).toEqual(["REQUESTED", "REQUESTED"]);
    expect(result.requesterId).toBe(actor.id);
  });

  it("returns the committed request for a repeated idempotency key", async () => {
    const { service, actor } = setup();
    const input = {
      patientId: "patient-thor",
      encounterId: "encounter-thor",
      priority: "ROUTINE" as const,
      items: [{ serviceId: "service-hemogram" }]
    };

    const first = await service.createRequest(actor, input, { idempotencyKey: "request-retry" });
    const second = await service.createRequest(actor, input, { idempotencyKey: "request-retry" });

    expect(second.id).toBe(first.id);
    expect(second.requestCode).toBe(first.requestCode);
  });

  it("keeps duplicate requests behind an explicit warning and reason", async () => {
    const { service, actor } = setup();
    const input = {
      patientId: "patient-thor",
      encounterId: "encounter-thor",
      priority: "ROUTINE" as const,
      items: [{ serviceId: "service-hemogram" }]
    };

    await service.createRequest(actor, input, { idempotencyKey: "request-original" });
    await expect(
      service.createRequest(actor, input, { idempotencyKey: "request-duplicate" })
    ).rejects.toMatchObject({ code: "DUPLICATE_WARNING", status: 409 });

    const override = await service.createRequest(
      actor,
      { ...input, overrideReason: "Repetir coleta por decisão clínica" },
      { idempotencyKey: "request-override", allowDuplicateOverride: true }
    );
    expect(override.items).toHaveLength(1);
  });

  it("preserves a rejected sample chain and makes replacement actionable", async () => {
    const { service, actor, labActor } = setup();
    const request = await service.createRequest(actor, {
      patientId: "patient-thor",
      encounterId: "encounter-thor",
      priority: "ROUTINE",
      items: [{ serviceId: "service-hemogram" }, { serviceId: "service-crp" }]
    }, { idempotencyKey: "request-lab" });

    const received = await service.receiveSample(labActor, request.items.map((item) => item.id), {
      accessionCode: "ACC-0001",
      sampleType: "EDTA",
      expectedVersion: 1,
      idempotencyKey: "sample-receive"
    });
    const recollection = await service.requestRecollection(labActor, received.sample.id, {
      reasonCode: "HEMOLYZED",
      note: "Amostra hemolisada",
      expectedVersion: received.sample.version,
      idempotencyKey: "sample-recollect"
    });

    expect(recollection.sample.status).toBe("REJECTED");
    expect(recollection.replacement.replacesSampleId).toBe(received.sample.id);
    expect(recollection.items.every((item) => item.status === "RECOLLECTION_REQUIRED")).toBe(true);
    expect((await service.timeline(actor, request.id)).items.some((event) => event.entityType === "Sample")).toBe(true);
  });

  it("releases once, records notifications, and rejects stale review", async () => {
    const { service, actor, labActor, store } = setup();
    const request = await service.createRequest(actor, {
      patientId: "patient-thor",
      encounterId: "encounter-thor",
      priority: "ROUTINE",
      items: [{ serviceId: "service-hemogram" }]
    }, { idempotencyKey: "request-result" });
    const item = request.items[0];
    await service.receiveSample(labActor, [item.id], {
      accessionCode: "ACC-0002",
      sampleType: "EDTA",
      expectedVersion: 1,
      idempotencyKey: "sample-result"
    });
    await service.startProcessing(labActor, item.id, { expectedVersion: 2, idempotencyKey: "start-result" });
    const draft = await service.createResultDraft(labActor, item.id, {
      narrative: "Hemograma dentro dos parâmetros.",
      content: { hemoglobin: 12.4 },
      idempotencyKey: "draft-result"
    });
    await expect(service.updateResultDraft(actor, draft.result.id, {
      narrative: "Hemograma atualizado dentro dos parâmetros.",
      content: { hemoglobin: 12.5 },
      expectedVersion: draft.result.version,
      idempotencyKey: "draft-update-denied"
    })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const updatedDraft = await service.updateResultDraft(labActor, draft.result.id, {
      narrative: "Hemograma atualizado dentro dos parâmetros.",
      content: { hemoglobin: 12.5 },
      expectedVersion: draft.result.version,
      idempotencyKey: "draft-update"
    });
    expect(updatedDraft.version.narrative).toContain("atualizado");
    expect(updatedDraft.result.version).toBe(draft.result.version + 1);
    const released = await service.releaseResult(labActor, draft.result.id, {
      expectedVersion: updatedDraft.result.version,
      idempotencyKey: "release-result"
    });

    expect(released.version.status).toBe("RELEASED");
    expect(released.item.status).toBe("RESULT_AVAILABLE");
    expect((await service.listResultVersions(actor, released.result.id))).toHaveLength(1);
    expect(store.getState().notifications).toHaveLength(1);
    expect(store.getState().auditEvents.some((event) => event.eventType === "ResultReleased")).toBe(true);
    expect((await service.timeline(actor, request.id)).items.some((event) => event.entityType === "ResultVersion")).toBe(true);

    const repeated = await service.releaseResult(labActor, draft.result.id, {
      expectedVersion: updatedDraft.result.version,
      idempotencyKey: "release-result"
    });
    expect(repeated.version.id).toBe(released.version.id);

    await service.viewResult(actor, released.version.id, { idempotencyKey: "view-result" });
    await expect(
      service.reviewResult(actor, released.result.id, {
        versionId: "different-version",
        expectedVersion: released.item.version,
        idempotencyKey: "review-stale"
      })
    ).rejects.toMatchObject({ code: "REVIEW_STALE", status: 409 });
  });
});
