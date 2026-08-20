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
  return { store, service, vet: user("vet@cvg.local"), lab: user("lab@cvg.local"), us: user("us@cvg.local"), manager: user("manager@cvg.local"), admin: user("admin@cvg.local") };
}

describe("workflow commands", () => {
  it("schedules, reschedules, performs and reports an ultrasound without sample states", async () => {
    const { service, vet, us } = setup();
    const request = await service.createRequest(vet, {
      patientId: "patient-thor",
      encounterId: "encounter-thor",
      priority: "ROUTINE",
      items: [{ serviceId: "service-ultrasound" }]
    }, { idempotencyKey: "workflow-us-request" });
    const item = request.items[0];
    const scheduled = await service.scheduleProcedure(us, item.id, {
      startsAt: "2026-08-20T10:00:00.000Z",
      endsAt: "2026-08-20T10:30:00.000Z",
      resource: "US-01",
      idempotencyKey: "workflow-us-schedule"
    });

    expect(scheduled.item.status).toBe("SCHEDULED");
    expect(scheduled.procedure.status).toBe("SCHEDULED");
    expect(scheduled.schedule.resource).toBe("US-01");

    const rescheduled = await service.rescheduleProcedure(us, scheduled.procedure.id, {
      startsAt: "2026-08-20T11:00:00.000Z",
      endsAt: "2026-08-20T11:30:00.000Z",
      resource: "US-01",
      reason: "Reorganização da agenda",
      idempotencyKey: "workflow-us-reschedule"
    });
    expect(rescheduled.schedule.startsAt).toBe("2026-08-20T11:00:00.000Z");
    expect(rescheduled.history).toHaveLength(2);

    const started = await service.startProcedure(us, item.id, { expectedVersion: rescheduled.item.version, idempotencyKey: "workflow-us-start" });
    expect(started.item.status).toBe("IN_PROGRESS");
    const performed = await service.markProcedurePerformed(us, item.id, { expectedVersion: started.item.version, idempotencyKey: "workflow-us-performed" });
    expect(performed.item.status).toBe("AWAITING_REPORT");
    expect(performed.procedure.status).toBe("PERFORMED");
    expect((await service.timeline(vet, request.id)).items.some((event) => event.entityType === "Procedure")).toBe(true);
  });

  it("rejects overlapping schedules and exposes cancellation as an audited state change", async () => {
    const { service, vet, us, store } = setup();
    const first = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-ultrasound" }] }, { idempotencyKey: "schedule-first-request" });
    const second = await service.createRequest(vet, { patientId: "patient-mel", encounterId: "encounter-mel", priority: "ROUTINE", items: [{ serviceId: "service-ultrasound" }] }, { idempotencyKey: "schedule-second-request" });
    await service.scheduleProcedure(us, first.items[0].id, { startsAt: "2026-08-21T10:00:00.000Z", endsAt: "2026-08-21T10:30:00.000Z", resource: "US-02", idempotencyKey: "schedule-first" });
    await expect(service.scheduleProcedure(us, second.items[0].id, { startsAt: "2026-08-21T10:15:00.000Z", endsAt: "2026-08-21T10:45:00.000Z", resource: "US-02", idempotencyKey: "schedule-conflict" })).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT", status: 409 });

    const cancelled = await service.cancelItem(vet, first.items[0].id, { reasonCode: "CLINICAL_DECISION", reason: "Paciente encaminhado para outra conduta", expectedVersion: 2, idempotencyKey: "schedule-cancel" });
    expect(cancelled.item.status).toBe("CANCELLED");
    expect(store.getState().auditEvents.some((event) => event.eventType === "DiagnosticItemCancelled")).toBe(true);
  });

  it("points the item at the pending replacement sample during recollection", async () => {
    const { service, vet, lab } = setup();
    const request = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "recollection-context-request" });
    const received = await service.receiveSample(lab, [request.items[0].id], { accessionCode: "ACC-RECOLLECTION-CONTEXT", sampleType: "EDTA", idempotencyKey: "recollection-context-receive" });
    const recollection = await service.requestRecollection(lab, received.sample.id, { reasonCode: "HEMOLYZED", idempotencyKey: "recollection-context-requested" });

    expect(recollection.items[0].currentSampleId).toBe(recollection.replacement.id);
    expect(recollection.replacement.status).toBe("EXPECTED");
  });

  it("keeps released versions immutable through amend, void and replacement release", async () => {
    const { service, vet, lab, manager, store } = setup();
    const request = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "result-lifecycle-request" });
    const item = request.items[0];
    const received = await service.receiveSample(lab, [item.id], { accessionCode: "ACC-RESULT-1", sampleType: "EDTA", idempotencyKey: "result-lifecycle-receive" });
    await service.startProcessing(lab, item.id, { expectedVersion: received.items[0].version, idempotencyKey: "result-lifecycle-start" });
    const draft = await service.createResultDraft(lab, item.id, { narrative: "Resultado inicial.", content: { value: 1 }, idempotencyKey: "result-lifecycle-draft" });
    const released = await service.releaseResult(lab, draft.result.id, { expectedVersion: draft.result.version, idempotencyKey: "result-lifecycle-release" });
    await service.viewResult(vet, released.version.id, { idempotencyKey: "result-lifecycle-view" });
    const reviewed = await service.reviewResult(vet, released.result.id, { versionId: released.version.id, expectedVersion: released.item.version, idempotencyKey: "result-lifecycle-review" });
    await expect(service.completeItem(manager, item.id, { expectedVersion: reviewed.item.version, idempotencyKey: "result-lifecycle-cross-department" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await store.transaction((state) => ({ state: { ...state, users: state.users.map((user) => user.id === manager.id ? { ...user, departmentCode: "LABORATORY" } : user) }, result: undefined }));
    const scopedManager = store.getState().users.find((user) => user.id === manager.id);
    if (!scopedManager) throw new Error("scoped manager missing");
    const completed = await service.completeItem(scopedManager, item.id, { expectedVersion: reviewed.item.version, idempotencyKey: "result-lifecycle-complete" });
    expect(completed.item.status).toBe("COMPLETED");

    const amended = await service.amendResult(lab, released.result.id, { reason: "Correção de unidade", narrative: "Resultado corrigido.", content: { value: 2 }, idempotencyKey: "result-lifecycle-amend" });
    expect(amended.version.status).toBe("DRAFT");
    expect(amended.item.status).toBe("RESULT_VOIDED");
    expect(amended.previousVersion.status).toBe("SUPERSEDED");
    const replacement = await service.releaseResult(lab, amended.result.id, { expectedVersion: amended.result.version, idempotencyKey: "result-lifecycle-release-replacement" });
    expect(replacement.version.sequence).toBe(2);
    const voided = await service.voidResult(manager, replacement.result.id, { reason: "Revisão administrativa", expectedVersion: replacement.result.version, idempotencyKey: "result-lifecycle-void" });
    expect(voided.item.status).toBe("RESULT_VOIDED");
    expect(voided.version.status).toBe("VOIDED");
  });
});
