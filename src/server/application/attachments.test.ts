import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationService } from "./service";
import { createDemoState } from "../store/fixtures";
import { MemoryStore } from "../store/memory-store";
import { LocalFileStore } from "../storage/file-store";

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "cvg-attachments-"));
  const store = new MemoryStore(createDemoState());
  const service = createApplicationService(store, { storage: new LocalFileStore(root) });
  const actor = store.getState().users.find((user) => user.email === "vet@cvg.local");
  const imaging = store.getState().users.find((user) => user.email === "rx@cvg.local");
  if (!actor || !imaging) throw new Error("fixture actors missing");
  const request = await service.createRequest(actor, { patientId: "patient-thor", encounterId: "encounter-thor", priority: "ROUTINE", items: [{ serviceId: "service-xray" }] }, { idempotencyKey: `attachment-request-${Date.now()}` });
  const started = await service.startProcedure(imaging, request.items[0].id, { idempotencyKey: `attachment-start-${Date.now()}` });
  await service.markProcedurePerformed(imaging, request.items[0].id, { expectedVersion: started.item.version, idempotencyKey: `attachment-performed-${Date.now()}` });
  const draft = await service.createResultDraft(imaging, request.items[0].id, { narrative: "Laudo com imagem.", content: { impression: "Sem alterações" }, idempotencyKey: `attachment-draft-${Date.now()}` });
  return { root, store, service, actor, imaging, requestId: request.id, versionId: draft.version.id };
}

describe("secure attachment lifecycle", () => {
  it("requires clean finalized content before release and streams only authorized finalized bytes", async () => {
    const context = await setup();
    try {
      const content = Buffer.from("%PDF-1.7\nsynthetic report\n");
      const checksum = createHash("sha256").update(content).digest("hex");
      const session = await context.service.createAttachmentUploadSession(context.imaging, context.versionId, { filename: "laudo clínico.pdf", mimeType: "application/pdf", sizeBytes: content.length, checksum, idempotencyKey: "attachment-session" });
      expect(session.uploadUrl).toContain(`/attachments/${session.attachment.id}/content`);
      expect(session.attachment).not.toHaveProperty("storageKey");
      await expect(context.service.releaseResult(context.imaging, context.store.getState().results[0].id, { idempotencyKey: "release-blocked" })).rejects.toMatchObject({ code: "RESULT_RELEASE_BLOCKED" });
      const uploaded = await context.service.uploadAttachment(context.imaging, session.attachment.id, content);
      expect(uploaded.attachment.scanStatus).toBe("CLEAN");
      const finalized = await context.service.finalizeAttachment(context.imaging, session.attachment.id, { idempotencyKey: "attachment-finalize" });
      expect(finalized.attachment.uploadStatus).toBe("FINALIZED");
      expect(finalized.attachment).not.toHaveProperty("storageKey");
      const resultId = context.store.getState().results[0].id;
      await context.service.releaseResult(context.imaging, resultId, { idempotencyKey: "release-after-attachment" });
      expect((await context.service.timeline(context.actor, context.requestId)).items.some((event) => event.entityType === "Attachment")).toBe(true);
      const downloaded = await context.service.downloadAttachment(context.actor, session.attachment.id);
      expect(downloaded.content.equals(content)).toBe(true);
    } finally {
      await rm(context.root, { recursive: true, force: true });
    }
  });

  it("quarantines content whose detected signature does not match its declared MIME", async () => {
    const context = await setup();
    try {
      const content = Buffer.from("not a PDF");
      const session = await context.service.createAttachmentUploadSession(context.imaging, context.versionId, { filename: "laudo.pdf", mimeType: "application/pdf", sizeBytes: content.length, checksum: createHash("sha256").update(content).digest("hex"), idempotencyKey: "quarantine-session" });
      const uploaded = await context.service.uploadAttachment(context.imaging, session.attachment.id, content);
      expect(uploaded.attachment.scanStatus).toBe("QUARANTINED");
      await expect(context.service.finalizeAttachment(context.imaging, session.attachment.id, { idempotencyKey: "quarantine-finalize" })).rejects.toMatchObject({ code: "ATTACHMENT_QUARANTINED" });
    } finally {
      await rm(context.root, { recursive: true, force: true });
    }
  });

  it("rejects a content checksum mismatch before writing the private object", async () => {
    const context = await setup();
    try {
      const declaredContent = Buffer.from("%PDF-1.7\nsynthetic report\n");
      const receivedContent = Buffer.from("%PDF-1.7\nsynthetic reporT\n");
      const session = await context.service.createAttachmentUploadSession(context.imaging, context.versionId, {
        filename: "laudo.pdf",
        mimeType: "application/pdf",
        sizeBytes: declaredContent.length,
        checksum: createHash("sha256").update(declaredContent).digest("hex"),
        idempotencyKey: "checksum-session"
      });

      await expect(context.service.uploadAttachment(context.imaging, session.attachment.id, receivedContent)).rejects.toMatchObject({ code: "ATTACHMENT_CHECKSUM_MISMATCH", status: 400 });
      expect(context.store.getState().attachments.find((entry) => entry.id === session.attachment.id)?.uploadStatus).toBe("INITIATED");
    } finally {
      await rm(context.root, { recursive: true, force: true });
    }
  });
});
