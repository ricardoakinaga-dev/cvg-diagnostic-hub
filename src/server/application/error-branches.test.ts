import { describe, expect, it } from "vitest";
import { createApplicationService } from "./service";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";

describe("server-side validation and conflict branches", () => {
  it("rejects malformed request context and unsafe idempotency reuse", async () => {
    const store = new MemoryStore(createDemoState());
    const service = createApplicationService(store);
    const vet = store.getState().users.find((user) => user.email === "vet@cvg.local");
    if (!vet) throw new Error("fixture actor missing");
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [] }, { idempotencyKey: "invalid-empty" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-mel", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "invalid-encounter" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", admissionId: "admission-missing", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "invalid-admission" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "invalid-service" })).resolves.toBeTruthy();
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-crp" }] }, { idempotencyKey: "invalid-service" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-xray", note: "x".repeat(2001) }] }, { idempotencyKey: "invalid-note" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-xray" }], overrideReason: "" }, { idempotencyKey: "invalid-override", allowDuplicateOverride: true })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.getRequest(vet, "request-missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid operational phases, roles, reasons and schedule windows", async () => {
    const store = new MemoryStore(createDemoState());
    const service = createApplicationService(store);
    const vet = store.getState().users.find((user) => user.email === "vet@cvg.local");
    const lab = store.getState().users.find((user) => user.email === "lab@cvg.local");
    const us = store.getState().users.find((user) => user.email === "us@cvg.local");
    if (!vet || !lab || !us) throw new Error("fixture actors missing");
    const labRequest = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "error-lab-request" });
    await expect(service.receiveSample(vet, [labRequest.items[0].id], { accessionCode: "ACC-UNAUTHORIZED", sampleType: "EDTA", idempotencyKey: "unauthorized-sample" })).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(service.receiveSample(lab, [], { accessionCode: "ACC-ERR", sampleType: "EDTA" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.requestRecollection(lab, "sample-missing", { reasonCode: "HEMOLYZED", idempotencyKey: "missing-recollect" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.createResultDraft(lab, labRequest.items[0].id, { narrative: "Ainda não", content: {} })).rejects.toMatchObject({ code: "RESULT_RELEASE_BLOCKED" });
    await expect(service.cancelItem(vet, labRequest.items[0].id, { reasonCode: "MISSING_REASON", idempotencyKey: "missing-cancel" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.rejectItem(lab, labRequest.items[0].id, { reasonCode: "MISSING_REASON" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.timeline(vet)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.listQueue(vet, "LABORATORY")).rejects.toMatchObject({ code: "NOT_FOUND" });

    const usRequest = await service.createRequest(vet, { patientId: "patient-mel", encounterId: "encounter-mel", priority: "ROUTINE", items: [{ serviceId: "service-ultrasound" }] }, { idempotencyKey: "error-us-request" });
    await expect(service.timeline(vet, labRequest.id, usRequest.items[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.scheduleProcedure(us, usRequest.items[0].id, { startsAt: "bad", endsAt: "also-bad", resource: "US-ERR" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.scheduleProcedure(us, usRequest.items[0].id, { startsAt: "2026-08-25T10:00:00.000Z", endsAt: "2026-08-27T11:00:00.000Z", resource: "US-ERR" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("covers retries, sample conflicts and replacement guards", async () => {
    const store = new MemoryStore(createDemoState());
    const service = createApplicationService(store);
    const vet = store.getState().users.find((user) => user.email === "vet@cvg.local");
    const lab = store.getState().users.find((user) => user.email === "lab@cvg.local");
    const rx = store.getState().users.find((user) => user.email === "rx@cvg.local");
    if (!vet || !lab || !rx) throw new Error("fixture actors missing");
    const input = { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE" as const, items: [{ serviceId: "service-hemogram" }] };
    const first = await service.createRequest(vet, input, { idempotencyKey: "retry-request" });
    expect((await service.createRequest(vet, input, { idempotencyKey: "retry-request" })).id).toBe(first.id);
    await expect(service.createRequest({ ...vet, id: "inactive-user" }, input)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await service.getRequest(lab, first.id)).id).toBe(first.id);
    await expect(service.getRequest(rx, first.id)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    await expect(service.receiveSample(lab, [first.items[0].id], { accessionCode: "bad", sampleType: "EDTA" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const received = await service.receiveSample(lab, [first.items[0].id], { accessionCode: "ACC-RETRY-1", sampleType: "EDTA", idempotencyKey: "retry-sample" });
    expect((await service.receiveSample(lab, [first.items[0].id], { accessionCode: "ACC-RETRY-1", sampleType: "EDTA", idempotencyKey: "retry-sample" })).sample.id).toBe(received.sample.id);
    await expect(service.receiveSample(lab, [first.items[0].id], { accessionCode: "ACC-RETRY-2", sampleType: "EDTA", idempotencyKey: "retry-sample-new" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    await expect(service.requestRecollection(lab, received.sample.id, { reasonCode: "MISSING_REASON", idempotencyKey: "bad-recollect" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const recollection = await service.requestRecollection(lab, received.sample.id, { reasonCode: "HEMOLYZED", idempotencyKey: "retry-recollect" });
    expect((await service.requestRecollection(lab, received.sample.id, { reasonCode: "HEMOLYZED", idempotencyKey: "retry-recollect" })).replacement.id).toBe(recollection.replacement.id);
    const replacement = await service.receiveReplacement(lab, recollection.replacement.id, { accessionCode: "ACC-RETRY-2", sampleType: "EDTA", idempotencyKey: "retry-replacement" });
    expect((await service.receiveReplacement(lab, recollection.replacement.id, { accessionCode: "ACC-RETRY-2", sampleType: "EDTA", idempotencyKey: "retry-replacement" })).sample.id).toBe(replacement.sample.id);
    await expect(service.receiveReplacement(lab, recollection.replacement.id, { accessionCode: "ACC-RETRY-3", sampleType: "EDTA", idempotencyKey: "retry-replacement-new" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
    const started = await service.startProcessing(lab, first.items[0].id, { expectedVersion: replacement.items[0].version, idempotencyKey: "retry-processing" });
    expect((await service.startProcessing(lab, first.items[0].id, { expectedVersion: replacement.items[0].version, idempotencyKey: "retry-processing" })).item.id).toBe(started.item.id);
    await expect(service.startProcessing(lab, first.items[0].id, { expectedVersion: 1, idempotencyKey: "stale-processing" })).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("covers critical release policy and result visibility guards", async () => {
    const store = new MemoryStore(createDemoState());
    const service = createApplicationService(store);
    const vet = store.getState().users.find((user) => user.email === "vet@cvg.local");
    const lab = store.getState().users.find((user) => user.email === "lab@cvg.local");
    if (!vet || !lab) throw new Error("fixture actors missing");
    const request = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-crp" }] }, { idempotencyKey: "critical-request" });
    const received = await service.receiveSample(lab, [request.items[0].id], { accessionCode: "ACC-CRITICAL-1", sampleType: "EDTA", idempotencyKey: "critical-receive" });
    await service.startProcessing(lab, request.items[0].id, { expectedVersion: received.items[0].version, idempotencyKey: "critical-start" });
    const draft = await service.createResultDraft(lab, request.items[0].id, { narrative: "Resultado sensível.", content: {}, conclusion: "Necessita avaliação", idempotencyKey: "critical-draft" });
    await expect(service.releaseResult(lab, draft.result.id, { critical: true, idempotencyKey: "critical-release" })).rejects.toMatchObject({ code: "CRITICAL_POLICY_MISSING" });
    const previousPolicyFlag = process.env.CRITICAL_POLICY_ENABLED;
    const previousPolicyVersion = process.env.CRITICAL_POLICY_VERSION;
    const previousPolicyApprovalRef = process.env.CRITICAL_POLICY_APPROVAL_REF;
    const previousPolicyApprovedAt = process.env.CRITICAL_POLICY_APPROVED_AT;
    process.env.CRITICAL_POLICY_ENABLED = "true";
    try {
      await expect(service.releaseResult(lab, draft.result.id, { critical: true, idempotencyKey: "critical-release-bare-flag" })).rejects.toMatchObject({ code: "CRITICAL_POLICY_MISSING" });
      await expect(service.viewResult(vet, draft.version.id, { idempotencyKey: "draft-view" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(service.reviewResult(vet, draft.result.id, { versionId: draft.version.id, idempotencyKey: "draft-review" })).rejects.toMatchObject({ code: "REVIEW_STALE" });
      await expect(service.amendResult(lab, draft.result.id, { reason: "Ainda draft", narrative: "Nova versão", content: {}, idempotencyKey: "draft-amend" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      await expect(service.voidResult(lab, draft.result.id, { reason: "Ainda draft", idempotencyKey: "draft-void" })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      process.env.CRITICAL_POLICY_VERSION = "policy-v1";
      process.env.CRITICAL_POLICY_APPROVAL_REF = "approval-test-1";
      process.env.CRITICAL_POLICY_APPROVED_AT = "2026-08-20T10:00:00.000Z";
      const released = await service.releaseResult(lab, draft.result.id, { critical: true, idempotencyKey: "critical-release-approved" });
      expect(released.version).toMatchObject({ status: "RELEASED", critical: true });
      expect(store.getState().notifications).toContainEqual(expect.objectContaining({ category: "CRITICAL", entityId: released.version.id }));
    } finally {
      if (previousPolicyFlag === undefined) delete process.env.CRITICAL_POLICY_ENABLED;
      else process.env.CRITICAL_POLICY_ENABLED = previousPolicyFlag;
      if (previousPolicyVersion === undefined) delete process.env.CRITICAL_POLICY_VERSION;
      else process.env.CRITICAL_POLICY_VERSION = previousPolicyVersion;
      if (previousPolicyApprovalRef === undefined) delete process.env.CRITICAL_POLICY_APPROVAL_REF;
      else process.env.CRITICAL_POLICY_APPROVAL_REF = previousPolicyApprovalRef;
      if (previousPolicyApprovedAt === undefined) delete process.env.CRITICAL_POLICY_APPROVED_AT;
      else process.env.CRITICAL_POLICY_APPROVED_AT = previousPolicyApprovedAt;
    }
  });
});
