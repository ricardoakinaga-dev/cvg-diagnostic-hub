import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createApplicationService } from "../../../../server/application/service";
import { createSuccessResponse, toApiErrorResponse } from "../../../../server/http/envelope";
import { getRuntimeFileStore, getRuntimeReadiness, getRuntimeStoreAsync } from "../../../../server/store/runtime";
import { assertCsrf, authenticateRequest, clearSessionCookies, getCookieValue, loginUser, revokeSession, sessionCookies } from "../../../../server/security/session";
import type { CommandMeta } from "../../../../server/application/service";
import { ApiError } from "../../../../server/http/envelope";
import { canAccessResource } from "../../../../server/security/authorization";
import type { User } from "../../../../server/domain/models";
import { assertRateLimit } from "../../../../server/security/rate-limit";
import { incrementGauge, recordHttpRequest, recordReadinessFailure, refreshOperationalMetrics, renderPrometheus, routeMetricLabel } from "../../../../server/observability/metrics";

type RouteContext = { params: Promise<{ path: string[] }> };

const createRequestSchema = z.object({
  patientId: z.string().min(1).max(100),
  encounterId: z.string().min(1).max(100),
  admissionId: z.string().min(1).max(100).optional(),
  priority: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]),
  items: z.array(z.object({ serviceId: z.string().min(1).max(100), note: z.string().max(2000).optional() })).min(1).max(20),
  overrideReason: z.string().max(500).optional()
}).strict();

const loginSchema = z.object({ email: z.string().email().max(320), password: z.string().min(1).max(200) }).strict();
const serviceCreateSchema = z.object({
  code: z.string().min(2).max(60),
  name: z.string().min(1).max(120),
  category: z.enum(["LABORATORY", "IMAGING"]),
  departmentCode: z.string().min(1).max(60),
  workflowType: z.enum(["LABORATORY", "RADIOLOGY", "ULTRASOUND"]),
  requiresSample: z.boolean(),
  requiresSchedule: z.boolean(),
  allowsAttachment: z.boolean(),
  resultSchema: z.enum(["NUMERIC_PANEL", "NARRATIVE"]),
  slaHours: z.object({ ROUTINE: z.number().positive().max(720), URGENT: z.number().positive().max(720), EMERGENCY: z.number().positive().max(720) }).strict()
}).strict();
const servicePatchSchema = z.object({ name: z.string().min(1).max(120).optional(), active: z.boolean().optional(), allowsAttachment: z.boolean().optional(), slaHours: z.object({ ROUTINE: z.number().positive().max(720), URGENT: z.number().positive().max(720), EMERGENCY: z.number().positive().max(720) }).strict().optional(), expectedVersion: z.number().int().positive().optional() }).strict();
const reasonCreateSchema = z.object({ type: z.enum(["RECOLLECTION", "CANCEL", "REJECT", "AMEND"]), code: z.string().min(2).max(60), label: z.string().min(1).max(160) }).strict();
const reasonPatchSchema = z.object({ label: z.string().min(1).max(160).optional(), active: z.boolean().optional(), expectedVersion: z.number().int().positive().optional() }).strict();

function correlationFrom(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : `corr_${randomUUID()}`;
}

function requestId(): string {
  return `req_${randomUUID()}`;
}

function responseFor<T>(data: T, correlationId: string, id: string, status = 200, extraMeta?: Record<string, unknown>): NextResponse {
  const response = createSuccessResponse(data, correlationId, id, status, extraMeta);
  const nextResponse = NextResponse.json(response.body, { status: response.status });
  nextResponse.headers.set("x-correlation-id", correlationId);
  nextResponse.headers.set("cache-control", "no-store");
  return nextResponse;
}

function errorFor(error: unknown, correlationId: string, id: string): NextResponse {
  const response = toApiErrorResponse(error, correlationId, id);
  const nextResponse = NextResponse.json(response.body, { status: response.status });
  nextResponse.headers.set("x-correlation-id", correlationId);
  nextResponse.headers.set("cache-control", "no-store");
  return nextResponse;
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "O corpo JSON da requisição é inválido.", 400);
  }
}

async function objectBody(request: Request): Promise<Record<string, unknown>> {
  const body = await jsonBody(request);
  if (!isRecord(body)) throw new ApiError("VALIDATION_ERROR", "O corpo JSON deve ser um objeto.", 400);
  return body;
}

function commandMeta(request: Request, body: Record<string, unknown>): CommandMeta {
  const expectedVersion = body.expectedVersion;
  const ifMatch = request.headers.get("if-match")?.replace(/^W\//, "").replace(/^"|"$/g, "");
  const headerVersion = ifMatch && /^\d+$/.test(ifMatch) ? Number(ifMatch) : undefined;
  return {
    idempotencyKey: request.headers.get("idempotency-key") ?? undefined,
    expectedVersion: typeof expectedVersion === "number" ? expectedVersion : headerVersion,
    correlationId: request.headers.get("x-correlation-id") ?? undefined
  };
}

async function pathFor(context: RouteContext): Promise<string[]> {
  const params = await context.params;
  return params.path.map((segment) => decodeURIComponent(segment));
}

async function dispatch(method: string, request: Request, context: RouteContext): Promise<Response> {
  const startedAt = performance.now();
  let metricPath: string[] = [];
  try {
    metricPath = await pathFor(context);
  } catch {
    metricPath = ["invalid"];
  }
  const response = await dispatchInner(method, request, context);
  recordHttpRequest(method, routeMetricLabel(metricPath), response.status, performance.now() - startedAt);
  return response;
}

async function dispatchInner(method: string, request: Request, context: RouteContext): Promise<Response> {
  const correlationId = correlationFrom(request);
  const id = requestId();
  try {
    const path = await pathFor(context);
    const clientAddress = process.env.TRUST_PROXY === "true"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "forwarded-client"
      : "local-client";
    const loginRateLimit = positiveInteger(process.env.LOGIN_RATE_LIMIT, 10);
    assertRateLimit(`${clientAddress}:${path.slice(0, 2).join("/")}`, path[0] === "session" && path[1] === "login" ? loginRateLimit : 240, 60_000);
    const isLogin = path.join("/") === "session/login";
    const isPublic = path[0] === "livez" || path[0] === "readyz" || isLogin;
    if (method !== "GET" && !isLogin) assertCsrf(request);

    if (path[0] === "livez" && method === "GET") return responseFor({ status: "ok", service: "cvg-diagnostics-hub" }, correlationId, id);
    if (path[0] === "readyz" && method === "GET") {
      try {
        return responseFor({ status: "ready", ...(await getRuntimeReadiness()) }, correlationId, id);
      } catch {
        recordReadinessFailure();
        throw new ApiError("NOT_READY", "A dependência de persistência ainda não está disponível.", 503, { retryable: true });
      }
    }
    const store = await getRuntimeStoreAsync();
    const service = createApplicationService(store, { storage: getRuntimeFileStore() });
    if (isPublic && isLogin && method === "POST") {
      const parsed = loginSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Informe e-mail e senha válidos.", 400);
      const login = await loginUser(store, parsed.data.email, parsed.data.password);
      const response = responseFor({ user: publicUser(login.user), expiresAt: login.expiresAt }, correlationId, id);
      for (const cookie of sessionCookies(login)) response.headers.append("set-cookie", cookie);
      return response;
    }

    const actor = await authenticateRequest(store, request);
    if (path[0] === "metrics" && method === "GET") {
      if (!canAccessResource(actor, "health.readiness", {})) throw new ApiError("NOT_FOUND", "Rota não encontrada.", 404);
      const state = store.getState();
      refreshOperationalMetrics(state);
      const body = renderPrometheus();
      return new Response(body, { status: 200, headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store", "x-correlation-id": correlationId } });
    }
    if (path[0] === "session" && path[1] === "me" && method === "GET") return responseFor({ user: publicUser(actor) }, correlationId, id);
    if (path[0] === "session" && path[1] === "logout" && method === "POST") {
      const sessionToken = getCookieValue(request, "cvg_session");
      if (sessionToken) await revokeSession(store, sessionToken);
      const response = responseFor({ loggedOut: true }, correlationId, id);
      for (const cookie of clearSessionCookies()) response.headers.append("set-cookie", cookie);
      return response;
    }

    if (path[0] === "diagnostic-services" && method === "GET" && path.length === 1) return responseFor(await service.listServices(actor), correlationId, id);
    if (path[0] === "diagnostic-services" && path.length === 1 && method === "POST") {
      const body = await objectBody(request);
      const parsed = serviceCreateSchema.safeParse(body);
      if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Os dados do serviço são inválidos.", 400);
      return responseFor(await service.createDiagnosticService(actor, { ...parsed.data, ...commandMeta(request, body) }), correlationId, id, 201);
    }
    if (path[0] === "diagnostic-services" && path.length === 2 && method === "PATCH") {
      const body = await objectBody(request);
      const parsed = servicePatchSchema.safeParse(body);
      if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Os dados do serviço são inválidos.", 400);
      return responseFor(await service.updateDiagnosticService(actor, path[1], { ...parsed.data, ...commandMeta(request, body) }), correlationId, id);
    }
    if (path[0] === "reason-codes" && path.length === 1 && method === "POST") {
      const body = await objectBody(request);
      const parsed = reasonCreateSchema.safeParse(body);
      if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Os dados do motivo são inválidos.", 400);
      return responseFor(await service.createReasonCode(actor, { ...parsed.data, ...commandMeta(request, body) }), correlationId, id, 201);
    }
    if (path[0] === "reason-codes" && path.length === 2 && method === "PATCH") {
      const body = await objectBody(request);
      const parsed = reasonPatchSchema.safeParse(body);
      if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Os dados do motivo são inválidos.", 400);
      return responseFor(await service.updateReasonCode(actor, path[1], { ...parsed.data, ...commandMeta(request, body) }), correlationId, id);
    }
    if (path[0] === "patients" && method === "GET" && path.length === 1) return responseFor(await service.listPatients(actor, new URL(request.url).searchParams.get("q") ?? ""), correlationId, id);
    if (path[0] === "patients" && method === "GET" && path.length === 2) return responseFor(await service.getPatient(actor, path[1]), correlationId, id);
    if (path[0] === "encounters" && method === "GET" && path.length === 2) return responseFor(await service.getEncounter(actor, path[1]), correlationId, id);
    if (path[0] === "admissions" && method === "GET" && path.length === 2) return responseFor(await service.getAdmission(actor, path[1]), correlationId, id);

    if (path[0] === "diagnostic-requests" && path.length === 1 && method === "GET") {
      const search = new URL(request.url).searchParams;
      const data = await service.listRequests(actor, { status: (search.get("status") as never) || undefined, departmentCode: search.get("departmentCode") ?? undefined, cursor: search.get("cursor") ?? undefined, limit: Number(search.get("limit") ?? 25) });
      return responseFor(data.items, correlationId, id, 200, { nextCursor: data.nextCursor, limit: data.limit, total: data.total });
    }
    if (path[0] === "diagnostic-requests" && path.length === 1 && method === "POST") {
      const parsed = createRequestSchema.safeParse(await jsonBody(request));
      if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Os dados da solicitação são inválidos.", 400);
      const body = parsed.data;
      const result = await service.createRequest(actor, body, { ...commandMeta(request, body), allowDuplicateOverride: request.headers.get("x-duplicate-override") === "true" });
      return responseFor(result, correlationId, id, 201);
    }
    if (path[0] === "diagnostic-requests" && path.length === 2 && method === "GET") return responseFor(await service.getRequest(actor, path[1]), correlationId, id);
    if (path[0] === "diagnostic-requests" && path.length === 3 && path[2] === "cancel" && method === "POST") {
      const body = await objectBody(request);
      return responseFor(await service.cancelRequest(actor, path[1], { ...commandMeta(request, body), reasonCode: String(body.reasonCode ?? ""), reason: typeof body.reason === "string" ? body.reason : undefined, itemIds: Array.isArray(body.itemIds) ? body.itemIds.filter((value): value is string => typeof value === "string") : undefined }), correlationId, id);
    }

    if (path[0] === "diagnostic-items" && path.length === 2 && method === "GET") return responseFor(await service.getItem(actor, path[1]), correlationId, id);
    if (path[0] === "diagnostic-items" && path.length >= 3) {
      const itemId = path[1];
      const action = path[2];
      if (method !== "POST") throw new ApiError("NOT_FOUND", "Rota não encontrada.", 404);
      const body = await objectBody(request);
      const meta = commandMeta(request, body);
      if (action === "receive-sample") return responseFor(await service.receiveSample(actor, [itemId], { ...meta, accessionCode: String(body.accessionCode ?? ""), sampleType: String(body.sampleType ?? "") }), correlationId, id);
      if (action === "start-processing") return responseFor(await service.startProcessing(actor, itemId, meta), correlationId, id);
      if (action === "cancel") return responseFor(await service.cancelItem(actor, itemId, { ...meta, reasonCode: String(body.reasonCode ?? ""), reason: typeof body.reason === "string" ? body.reason : undefined }), correlationId, id);
      if (action === "reject") return responseFor(await service.rejectItem(actor, itemId, { ...meta, reasonCode: String(body.reasonCode ?? ""), note: typeof body.note === "string" ? body.note : undefined }), correlationId, id);
      if (action === "complete") return responseFor(await service.completeItem(actor, itemId, meta), correlationId, id);
      if (action === "schedule") return responseFor(await service.scheduleProcedure(actor, itemId, { ...meta, startsAt: String(body.startsAt ?? ""), endsAt: String(body.endsAt ?? ""), resource: String(body.resource ?? ""), reason: typeof body.reason === "string" ? body.reason : undefined }), correlationId, id);
      if (action === "start-procedure") return responseFor(await service.startProcedure(actor, itemId, meta), correlationId, id);
      if (action === "mark-performed") return responseFor(await service.markProcedurePerformed(actor, itemId, meta), correlationId, id);
      if (action === "request-recollection") {
        const item = store.getState().items.find((entry) => entry.id === itemId);
        if (!item?.currentSampleId) throw new ApiError("INVALID_STATE_TRANSITION", "Este item não possui amostra recebida para recoleta.", 409);
        return responseFor(await service.requestRecollection(actor, item.currentSampleId, { ...meta, reasonCode: String(body.reasonCode ?? ""), note: typeof body.note === "string" ? body.note : undefined }), correlationId, id);
      }
      if (action === "results" && method === "POST") return responseFor(await service.createResultDraft(actor, itemId, { ...meta, narrative: String(body.narrative ?? ""), conclusion: typeof body.conclusion === "string" ? body.conclusion : undefined, content: isRecord(body.content) ? body.content : {} }), correlationId, id, 201);
    }

    if (path[0] === "samples" && path.length === 3 && path[2] === "receive-replacement" && method === "POST") {
      const body = await objectBody(request);
      return responseFor(await service.receiveReplacement(actor, path[1], { ...commandMeta(request, body), accessionCode: String(body.accessionCode ?? ""), sampleType: String(body.sampleType ?? "") }), correlationId, id);
    }
    if (path[0] === "procedures" && path.length === 3 && path[2] === "reschedule" && method === "POST") {
      const body = await objectBody(request);
      return responseFor(await service.rescheduleProcedure(actor, path[1], { ...commandMeta(request, body), startsAt: String(body.startsAt ?? ""), endsAt: String(body.endsAt ?? ""), resource: String(body.resource ?? ""), reason: typeof body.reason === "string" ? body.reason : undefined }), correlationId, id);
    }
    if (path[0] === "result-versions" && path.length === 4 && path[2] === "attachments" && path[3] === "upload-session" && method === "POST") {
      const body = await objectBody(request);
      return responseFor(await service.createAttachmentUploadSession(actor, path[1], { ...commandMeta(request, body), filename: String(body.filename ?? ""), mimeType: String(body.mimeType ?? ""), sizeBytes: Number(body.sizeBytes ?? 0), checksum: String(body.checksum ?? "") }), correlationId, id, 201);
    }
    if (path[0] === "attachments" && path.length === 3 && path[2] === "content" && method === "PUT") {
      const maxAttachmentBytes = positiveInteger(process.env.ATTACHMENT_MAX_BYTES, 25 * 1024 * 1024);
      const declaredLength = Number(request.headers.get("content-length") ?? 0);
      if (declaredLength > maxAttachmentBytes) throw new ApiError("VALIDATION_ERROR", "Arquivo excede o limite permitido.", 400);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > maxAttachmentBytes) throw new ApiError("VALIDATION_ERROR", "Arquivo excede o limite permitido.", 400);
      return responseFor(await service.uploadAttachment(actor, path[1], bytes), correlationId, id);
    }
    if (path[0] === "attachments" && path.length === 3 && path[2] === "finalize" && method === "POST") {
      const body = await objectBody(request);
      return responseFor(await service.finalizeAttachment(actor, path[1], commandMeta(request, body)), correlationId, id);
    }
    if (path[0] === "attachments" && path.length === 3 && path[2] === "download" && method === "GET") {
      const downloaded = await service.downloadAttachment(actor, path[1]);
      return new Response(downloaded.content as unknown as BodyInit, { status: 200, headers: { "content-type": downloaded.attachment.detectedMime, "content-length": String(downloaded.content.byteLength), "content-disposition": `attachment; filename="${downloaded.attachment.safeName}"`, "cache-control": "private, no-store", "x-correlation-id": correlationId } });
    }

    if (path[0] === "results" && path.length >= 2) {
      const resultId = path[1];
      if (path.length === 2 && method === "GET") return responseFor(await service.getResult(actor, resultId), correlationId, id);
      if (path[2] === "versions" && method === "GET") return responseFor(await service.listResultVersions(actor, resultId), correlationId, id);
      if (path[2] === "draft" && method === "PATCH") {
        const body = await objectBody(request);
        return responseFor(await service.updateResultDraft(actor, resultId, { ...commandMeta(request, body), narrative: String(body.narrative ?? ""), conclusion: typeof body.conclusion === "string" ? body.conclusion : undefined, content: isRecord(body.content) ? body.content : {} }), correlationId, id);
      }
      if (path[2] === "release" && method === "POST") {
        const body = await objectBody(request);
        return responseFor(await service.releaseResult(actor, resultId, { ...commandMeta(request, body), critical: body.critical === true }), correlationId, id);
      }
      if (path[2] === "amend" && method === "POST") {
        const body = await objectBody(request);
        return responseFor(await service.amendResult(actor, resultId, { ...commandMeta(request, body), reason: String(body.reason ?? ""), narrative: String(body.narrative ?? ""), conclusion: typeof body.conclusion === "string" ? body.conclusion : undefined, content: isRecord(body.content) ? body.content : {}, critical: body.critical === true }), correlationId, id);
      }
      if (path[2] === "void" && method === "POST") {
        const body = await objectBody(request);
        return responseFor(await service.voidResult(actor, resultId, { ...commandMeta(request, body), reason: String(body.reason ?? "") }), correlationId, id);
      }
      if (path[2] === "view" && method === "POST") {
        const body = await objectBody(request);
        const current = await service.getResult(actor, resultId);
        const versionId = String(body.versionId ?? "");
        if (current.version.id !== versionId) throw new ApiError("REVIEW_STALE", "A versão do resultado mudou. Atualize o contexto.", 409);
        return responseFor(await service.viewResult(actor, versionId, commandMeta(request, body)), correlationId, id);
      }
      if (path[2] === "review" && method === "POST") {
        const body = await objectBody(request);
        return responseFor(await service.reviewResult(actor, resultId, { ...commandMeta(request, body), versionId: String(body.versionId ?? "") }), correlationId, id);
      }
    }

    if (path[0] === "notifications" && method === "GET") return responseFor(await service.listNotifications(actor, (new URL(request.url).searchParams.get("filter") as "ALL" | "UNREAD" | "ACTIONABLE" | "CRITICAL") ?? "ALL"), correlationId, id);
    if (path[0] === "notifications" && path[2] === "acknowledge" && method === "POST") return responseFor(await service.acknowledgeNotification(actor, path[1], commandMeta(request, {})), correlationId, id);
    if (path[0] === "queues" && path[2] === "items" && method === "GET") {
      const search = new URL(request.url).searchParams;
      return responseFor(await service.listQueue(actor, path[1], { status: (search.get("status") as never) || undefined, overdue: search.has("overdue") ? search.get("overdue") === "true" : undefined, limit: Number(search.get("limit") ?? 25) }), correlationId, id);
    }
    if (path[0] === "search" && method === "GET") return responseFor(await service.search(actor, new URL(request.url).searchParams.get("q") ?? "", Number(new URL(request.url).searchParams.get("limit") ?? 25)), correlationId, id);
    if (path[0] === "timeline" && method === "GET") {
      const search = new URL(request.url).searchParams;
      return responseFor(await service.timeline(actor, search.get("requestId") ?? undefined, search.get("itemId") ?? undefined), correlationId, id);
    }
    if (path[0] === "dashboard" && method === "GET") return responseFor(await service.dashboard(actor), correlationId, id);
    if (path[0] === "realtime" && path[1] === "events" && method === "GET") {
      if (!canAccessResource(actor, "realtime.connect", {})) throw new ApiError("SCOPE_DENIED", "Você não tem acesso ao canal em tempo real.", 404);
      return realtimeResponse(store, actor, correlationId, request.headers.get("last-event-id") ?? undefined, new URL(request.url).searchParams.get("snapshot") === "true", request);
    }

    throw new ApiError("NOT_FOUND", "Rota não encontrada.", 404);
  } catch (error) {
    return errorFor(error, correlationId, id);
  }
}

function publicUser(user: { id: string; email: string; displayName: string; role: string; departmentCode: string; timezone: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, departmentCode: user.departmentCode, timezone: user.timezone };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function realtimeResponse(store: Awaited<ReturnType<typeof getRuntimeStoreAsync>>, actor: User, correlationId: string, lastEventId: string | undefined, snapshot: boolean, request: Request): Response {
  const state = store.getState();
  const boundedEvents = state.outbox.slice(-20);
  const lastIndex = lastEventId ? boundedEvents.findIndex((message) => message.id === lastEventId) : -1;
  const replayExpired = Boolean(lastEventId) && lastIndex < 0;
  const replayWindow = lastEventId && !replayExpired ? boundedEvents.slice(lastIndex + 1) : boundedEvents;
  const events = replayWindow.filter((message) => eventVisible(state, actor, message.aggregateType, message.aggregateId, message.payload)).map((message) => ({ eventId: message.id, type: message.eventType, occurredAt: message.availableAt, entityType: message.aggregateType, entityId: message.aggregateId, correlationId: message.correlationId }));
  const resync = replayExpired ? `event: resync_required\ndata: ${JSON.stringify({ reason: "event_window_expired" })}\n\n` : "";
  const payload = `${resync}${events.map((event) => `id: ${event.eventId}\nevent: diagnostic.updated\ndata: ${JSON.stringify(event)}\n\n`).join("")}`;
  const headers = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-correlation-id": correlationId };
  if (snapshot) return new Response(`retry: 5000\n\n${payload || ": heartbeat\n\n"}`, { headers });
  let timer: ReturnType<typeof setInterval> | undefined;
  let expirationTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let metricRegistered = false;
  const maxStreamMs = positiveInteger(process.env.REALTIME_STREAM_MAX_MS, 0);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let cursor = lastEventId;
      incrementGauge("sse_connections");
      metricRegistered = true;
      const cleanup = () => {
        if (timer) clearInterval(timer);
        if (expirationTimer) clearTimeout(expirationTimer);
        if (metricRegistered) {
          incrementGauge("sse_connections", -1);
          metricRegistered = false;
        }
      };
      const closeStream = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      };
      const send = () => {
        if (closed) return;
        const current = store.getState();
        const messages = current.outbox.slice(-20);
        const cursorIndex = cursor ? messages.findIndex((message) => message.id === cursor) : -1;
        const expired = Boolean(cursor) && cursorIndex < 0;
        const replay = cursor && !expired ? messages.slice(cursorIndex + 1) : messages;
        const visible = replay.filter((message) => eventVisible(current, actor, message.aggregateType, message.aggregateId, message.payload));
        const nextPayload = `${expired ? `event: resync_required\ndata: ${JSON.stringify({ reason: "event_window_expired" })}\n\n` : ""}${visible.map((message) => {
          cursor = message.id;
          return `id: ${message.id}\nevent: diagnostic.updated\ndata: ${JSON.stringify({ eventId: message.id, type: message.eventType, occurredAt: message.availableAt, entityType: message.aggregateType, entityId: message.aggregateId, correlationId: message.correlationId })}\n\n`;
        }).join("") || ": heartbeat\n\n"}`;
        controller.enqueue(encoder.encode(nextPayload));
      };
      controller.enqueue(encoder.encode(`retry: 5000\n\n${payload || ": heartbeat\n\n"}`));
      timer = setInterval(send, 5_000);
      if (maxStreamMs > 0) expirationTimer = setTimeout(closeStream, maxStreamMs);
      request.signal.addEventListener("abort", () => {
        closeStream();
      }, { once: true });
      if (request.signal.aborted) closeStream();
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (expirationTimer) clearTimeout(expirationTimer);
      if (metricRegistered) {
        incrementGauge("sse_connections", -1);
        metricRegistered = false;
      }
    }
  });
  return new Response(stream, { headers });
}

function eventVisible(state: ReturnType<Awaited<ReturnType<typeof getRuntimeStoreAsync>>["getState"]>, actor: User, entityType: string, entityId: string, payload: Record<string, unknown>): boolean {
  if (actor.role === "ADMIN") return true;
  let patientId: string | undefined;
  let departmentCode: string | undefined;
  if (entityType === "DiagnosticRequest") {
    const request = state.requests.find((entry) => entry.id === entityId);
    patientId = request?.patientId;
    const serviceItem = request?.itemIds.map((itemId) => state.items.find((entry) => entry.id === itemId)).find((item) => item?.departmentCode === actor.departmentCode);
    departmentCode = serviceItem?.departmentCode ?? request?.requestingDepartmentCode;
  } else if (entityType === "DiagnosticRequestItem") {
    const item = state.items.find((entry) => entry.id === entityId);
    const request = item ? state.requests.find((entry) => entry.id === item.requestId) : undefined;
    patientId = request?.patientId;
    departmentCode = item?.departmentCode;
  } else if (entityType === "Sample") {
    const sample = state.samples.find((entry) => entry.id === entityId);
    const request = sample ? state.requests.find((entry) => entry.id === sample.requestId) : undefined;
    patientId = request?.patientId;
    departmentCode = sample ? "LABORATORY" : undefined;
  } else if (entityType === "Result" || entityType === "Procedure") {
    const itemId = entityType === "Result" ? state.results.find((entry) => entry.id === entityId)?.itemId : state.procedures.find((entry) => entry.id === entityId)?.itemId;
    const item = itemId ? state.items.find((entry) => entry.id === itemId) : undefined;
    const request = item ? state.requests.find((entry) => entry.id === item.requestId) : undefined;
    patientId = request?.patientId;
    departmentCode = item?.departmentCode;
  } else if (entityType === "Attachment") {
    const attachment = state.attachments.find((entry) => entry.id === entityId);
    const version = attachment ? state.resultVersions.find((entry) => entry.id === attachment.resultVersionId) : undefined;
    const result = version ? state.results.find((entry) => entry.id === version.resultId) : undefined;
    const item = result ? state.items.find((entry) => entry.id === result.itemId) : undefined;
    const request = item ? state.requests.find((entry) => entry.id === item.requestId) : undefined;
    patientId = request?.patientId;
    departmentCode = item?.departmentCode;
  } else if (entityType === "ResultVersion") {
    const resultId = typeof payload.resultId === "string" ? payload.resultId : typeof payload.versionId === "string" ? state.resultVersions.find((entry) => entry.id === payload.versionId)?.resultId : undefined;
    const result = resultId ? state.results.find((entry) => entry.id === resultId) : undefined;
    const item = result ? state.items.find((entry) => entry.id === result.itemId) : undefined;
    const request = item ? state.requests.find((entry) => entry.id === item.requestId) : undefined;
    patientId = request?.patientId;
    departmentCode = item?.departmentCode;
  }
  if (!patientId && !departmentCode) return false;
  return canAccessResource(actor, "realtime.connect", { patientId, departmentCode });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return dispatch("GET", request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return dispatch("POST", request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return dispatch("PATCH", request, context);
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  return dispatch("PUT", request, context);
}
