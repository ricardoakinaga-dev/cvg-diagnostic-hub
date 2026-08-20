import { describe, expect, it } from "vitest";
import { createApplicationService } from "./service";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";

describe("authorized read models", () => {
  it("serves scoped catalog, queues, search, timeline and dashboard data", async () => {
    const store = new MemoryStore(createDemoState());
    const service = createApplicationService(store);
    const actor = store.getState().users.find((user) => user.email === "vet@cvg.local");
    const lab = store.getState().users.find((user) => user.email === "lab@cvg.local");
    if (!actor || !lab) throw new Error("fixture actors missing");

    const request = await service.createRequest(actor, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "URGENT", items: [{ serviceId: "service-hemogram" }, { serviceId: "service-xray" }] }, { idempotencyKey: "read-model-request" });
    const services = await service.listServices(actor);
    expect(services.map((entry) => entry.code)).toContain("HEMOGRAM");
    expect((await service.listPatients(actor, "thor")).map((entry) => entry.id)).toEqual(["patient-thor"]);
    expect((await service.listPatients(actor, "does-not-exist"))).toEqual([]);
    expect((await service.getPatient(actor, "patient-thor")).displayName).toBe("Thor");
    expect((await service.getEncounter(actor, "encounter-thor")).patientId).toBe("patient-thor");
    expect((await service.getAdmission(actor, "admission-thor")).bed).toBe("Box 03");
    expect((await service.getPatient(lab, "patient-thor")).displayName).toBe("Thor");
    await expect(service.getPatient(lab, "patient-mel")).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    const labRequest = await service.getRequest(lab, request.id);
    expect(labRequest.id).toBe(request.id);
    expect(labRequest.itemIds).toEqual([request.items[0].id]);
    const labItem = await service.getItem(lab, request.items[0].id);
    expect(labItem.service.code).toBe("HEMOGRAM");
    expect(labItem.request.itemIds).toEqual([request.items[0].id]);
    await expect(service.getItem(lab, request.items[1].id)).rejects.toMatchObject({ code: "SCOPE_DENIED" });
    expect((await service.timeline(lab, request.id)).length).toBeGreaterThan(0);

    const listed = await service.listRequests(actor, { limit: 1 });
    expect(listed.items[0].id).toBe(request.id);
    expect(listed.total).toBe(1);
    expect((await service.listRequests(actor, { cursor: Buffer.from("1").toString("base64url") })).items).toEqual([]);

    const queue = await service.listQueue(lab, "LABORATORY", { overdue: false });
    expect(queue[0].requestId).toBe(request.id);
    expect((await service.search(lab, request.requestCode))[0]?.id).toBe(request.id);
    await expect(service.search(actor, "x")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await service.timeline(actor, request.id)).length).toBeGreaterThan(0);
    expect((await service.dashboard(actor)).totalActive).toBe(2);

    const received = await service.receiveSample(lab, [request.items[0].id], { accessionCode: "ACC-READ-1", sampleType: "EDTA", idempotencyKey: "read-model-receive" });
    await service.requestRecollection(lab, received.sample.id, { reasonCode: "HEMOLYZED", idempotencyKey: "read-model-recollect" });
    expect((await service.listNotifications(actor, "ACTIONABLE")).length).toBe(1);
    expect((await service.listNotifications(actor, "UNREAD")).length).toBe(1);
    const notification = (await service.listNotifications(actor))[0];
    await service.acknowledgeNotification(actor, notification.id, { idempotencyKey: "read-model-ack" });
    expect((await service.listNotifications(actor, "UNREAD"))).toHaveLength(0);
  });

  it("labels each workflow queue with its next server-side action", async () => {
    const store = new MemoryStore(createDemoState());
    const service = createApplicationService(store);
    const vet = store.getState().users.find((user) => user.email === "vet@cvg.local");
    const lab = store.getState().users.find((user) => user.email === "lab@cvg.local");
    const rx = store.getState().users.find((user) => user.email === "rx@cvg.local");
    const us = store.getState().users.find((user) => user.email === "us@cvg.local");
    if (!vet || !lab || !rx || !us) throw new Error("fixture actors missing");

    const labRequest = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-hemogram" }] }, { idempotencyKey: "action-lab-request" });
    expect((await service.listQueue(lab, "LABORATORY"))[0].nextAction).toBe("Receber amostra");
    const received = await service.receiveSample(lab, [labRequest.items[0].id], { accessionCode: "ACC-ACTION-1", sampleType: "EDTA", idempotencyKey: "action-receive" });
    expect((await service.listQueue(lab, "LABORATORY"))[0].nextAction).toBe("Iniciar processamento");
    await service.startProcessing(lab, labRequest.items[0].id, { expectedVersion: received.items[0].version, idempotencyKey: "action-start" });
    expect((await service.listQueue(lab, "LABORATORY"))[0].nextAction).toBe("Registrar resultado");
    const draft = await service.createResultDraft(lab, labRequest.items[0].id, { narrative: "Ação", content: {}, idempotencyKey: "action-draft" });
    await service.releaseResult(lab, draft.result.id, { idempotencyKey: "action-release" });
    expect((await service.listQueue(lab, "LABORATORY"))[0].nextAction).toBe("Revisar resultado");

    const rxRequest = await service.createRequest(vet, { patientId: "patient-mel", encounterId: "encounter-mel", priority: "ROUTINE", items: [{ serviceId: "service-xray" }] }, { idempotencyKey: "action-rx-request" });
    expect((await service.listQueue(rx, "RADIOLOGY"))[0].nextAction).toBe("Encaminhar paciente");
    const rxStarted = await service.startProcedure(rx, rxRequest.items[0].id, { idempotencyKey: "action-rx-start" });
    expect((await service.listQueue(rx, "RADIOLOGY"))[0].nextAction).toBe("Marcar exame realizado");
    const performed = await service.markProcedurePerformed(rx, rxRequest.items[0].id, { expectedVersion: rxStarted.item.version, idempotencyKey: "action-rx-performed" });
    expect((await service.listQueue(rx, "RADIOLOGY"))[0].nextAction).toBe("Produzir laudo");
    await service.createResultDraft(rx, rxRequest.items[0].id, { narrative: "Laudo", content: {}, idempotencyKey: "action-rx-draft" });
    expect(performed.item.status).toBe("AWAITING_REPORT");

    const usRequest = await service.createRequest(vet, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "EMERGENCY", items: [{ serviceId: "service-ultrasound" }] }, { idempotencyKey: "action-us-request" });
    expect((await service.listQueue(us, "ULTRASOUND"))[0].nextAction).toBe("Agendar exame");
    const scheduled = await service.scheduleProcedure(us, usRequest.items[0].id, { startsAt: "2026-08-25T10:00:00.000Z", endsAt: "2026-08-25T10:30:00.000Z", resource: "US-ACTION", idempotencyKey: "action-us-schedule" });
    expect((await service.listQueue(us, "ULTRASOUND"))[0].nextAction).toBe("Acompanhar item");
    expect(scheduled.item.status).toBe("SCHEDULED");
  });
});
