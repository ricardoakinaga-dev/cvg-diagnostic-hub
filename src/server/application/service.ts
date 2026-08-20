import { createHash, randomUUID } from "node:crypto";
import type { ItemState, Permission, Priority, WorkflowType } from "@cvg/contracts";
import { aggregateRequestStatus, transitionItem } from "../domain/state-machine";
import type {
  Admission,
  Attachment,
  AuditEvent,
  DiagnosticItem,
  DiagnosticRequest,
  DiagnosticService,
  Notification,
  Procedure,
  ProcedureSchedule,
  ReasonCode,
  Result,
  ResultVersion,
  Sample,
  StateStore,
  StoreState,
  User
} from "../domain/models";
import { canAccessResource } from "../security/authorization";
import { ApiError } from "../http/envelope";
import { createFileStoreFromEnv, type FileStore } from "../storage/file-store";

export interface CommandMeta {
  idempotencyKey?: string;
  expectedVersion?: number;
  correlationId?: string;
}

export interface CreateRequestInput {
  patientId: string;
  encounterId: string;
  admissionId?: string;
  priority: Priority;
  items: Array<{ serviceId: string; note?: string }>;
  overrideReason?: string;
}

export interface ReceiveSampleInput extends CommandMeta {
  accessionCode: string;
  sampleType: string;
}

export interface RecollectionInput extends CommandMeta {
  reasonCode: string;
  note?: string;
}

export interface ResultDraftInput extends CommandMeta {
  narrative: string;
  conclusion?: string;
  content: Record<string, unknown>;
}

export interface ReleaseInput extends CommandMeta {
  critical?: boolean;
}

export interface ReviewInput extends CommandMeta {
  versionId: string;
}

export interface AmendInput extends CommandMeta {
  reason: string;
  narrative: string;
  conclusion?: string;
  content: Record<string, unknown>;
  critical?: boolean;
}

export interface ScheduleInput extends CommandMeta {
  startsAt: string;
  endsAt: string;
  resource: string;
  reason?: string;
}

export interface CancelInput extends CommandMeta {
  reasonCode: string;
  reason?: string;
}

export interface RejectInput extends CommandMeta {
  reasonCode: string;
  note?: string;
}

export interface VoidInput extends CommandMeta {
  reason: string;
}

export interface AttachmentUploadInput extends CommandMeta {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
}

export interface DiagnosticServiceCreateInput extends CommandMeta {
  code: string;
  name: string;
  category: DiagnosticService["category"];
  departmentCode: string;
  workflowType: WorkflowType;
  requiresSample: boolean;
  requiresSchedule: boolean;
  allowsAttachment: boolean;
  resultSchema: DiagnosticService["resultSchema"];
  slaHours: Record<Priority, number>;
}

export interface DiagnosticServicePatchInput extends CommandMeta {
  name?: string;
  active?: boolean;
  allowsAttachment?: boolean;
  slaHours?: Record<Priority, number>;
}

export interface ReasonCodeCreateInput extends CommandMeta {
  type: ReasonCode["type"];
  code: string;
  label: string;
}

export interface ReasonCodePatchInput extends CommandMeta {
  label?: string;
  active?: boolean;
}

interface RequestView extends DiagnosticRequest {
  patient: StoreState["patients"][number];
  encounter: StoreState["encounters"][number];
  items: Array<DiagnosticItem & { service: DiagnosticService }>;
}

interface ResultView {
  result: Result;
  version: ResultVersion;
  item: DiagnosticItem;
  request: DiagnosticRequest;
  patient: StoreState["patients"][number];
  service: DiagnosticService;
}

interface ItemView {
  item: DiagnosticItem;
  request: DiagnosticRequest;
  patient: StoreState["patients"][number];
  service: DiagnosticService;
}

type SampleCommandResult = { sample: Sample; items: DiagnosticItem[]; request: DiagnosticRequest };
type ResultDraftCommandResult = { result: Result; version: ResultVersion; item: DiagnosticItem; request: DiagnosticRequest };
type ResultReleaseCommandResult = { result: Result; version: ResultVersion; item: DiagnosticItem; request: DiagnosticRequest };
type ReviewCommandResult = { result: Result; version: ResultVersion; item: DiagnosticItem; request: DiagnosticRequest };
type ItemCommandResult = { item: DiagnosticItem; request: DiagnosticRequest };
type ProcedureScheduleCommandResult = { item: DiagnosticItem; procedure: Procedure; schedule: ProcedureSchedule; request: DiagnosticRequest };
type ProcedureRescheduleCommandResult = { procedure: Procedure; schedule: ProcedureSchedule; history: ProcedureSchedule[]; item: DiagnosticItem; request: DiagnosticRequest };
type ProcedureExecutionCommandResult = { item: DiagnosticItem; procedure: Procedure; request: DiagnosticRequest };
type AmendCommandResult = { result: Result; version: ResultVersion; previousVersion: ResultVersion; item: DiagnosticItem; request: DiagnosticRequest };
type VoidCommandResult = { result: Result; version: ResultVersion; item: DiagnosticItem; request: DiagnosticRequest; replacementRequired: boolean };
type PublicAttachment = Omit<Attachment, "storageKey">;
type AttachmentSessionResult = { attachment: PublicAttachment; uploadUrl: string; expiresAt: string };
type AttachmentFinalizationResult = { attachment: PublicAttachment };

const MAX_NOTE_LENGTH = 2000;
const MAX_RESULT_NARRATIVE_LENGTH = 20000;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const ALLOWED_ATTACHMENT_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

function criticalPolicyIsReady(): boolean {
  if (process.env.CRITICAL_POLICY_ENABLED !== "true") return false;
  if (!process.env.CRITICAL_POLICY_VERSION?.trim() || !process.env.CRITICAL_POLICY_APPROVAL_REF?.trim()) return false;
  return Boolean(process.env.CRITICAL_POLICY_APPROVED_AT && !Number.isNaN(Date.parse(process.env.CRITICAL_POLICY_APPROVED_AT)));
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function requireText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ApiError("VALIDATION_ERROR", `${field} é obrigatório e deve ter no máximo ${maxLength} caracteres.`, 400);
  }
  return normalized;
}

function requireActiveUser(state: StoreState, actor: User): User {
  const current = state.users.find((user) => user.id === actor.id);
  if (!current || !current.active) {
    throw new ApiError("UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);
  }
  return current;
}

function requirePermission(actor: User, permission: Permission, resource: { patientId?: string; departmentCode?: string; serviceCode?: string; ownerId?: string }): void {
  if (!canAccessResource(actor, permission, resource)) {
    throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
  }
}

function isExecutorRole(actor: User): boolean {
  return ["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(actor.role);
}

function hasServicePatientContext(state: StoreState, actor: User, patientId: string): boolean {
  return state.requests.some((request) => request.patientId === patientId && request.itemIds.some((itemId) => state.items.find((item) => item.id === itemId)?.departmentCode === actor.departmentCode));
}

function requirePatientPermission(state: StoreState, actor: User, permission: Permission, patientId: string): void {
  if (isExecutorRole(actor)) {
    if (!hasServicePatientContext(state, actor, patientId)) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
    requirePermission(actor, permission, { departmentCode: actor.departmentCode });
    return;
  }
  requirePermission(actor, permission, { patientId });
}

function requireRequestPermission(state: StoreState, actor: User, permission: Permission, request: DiagnosticRequest): void {
  if (isExecutorRole(actor)) {
    const serviceItem = request.itemIds.map((itemId) => itemFor(state, itemId)).find((item) => item.departmentCode === actor.departmentCode);
    if (!serviceItem) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
    requirePermission(actor, permission, { departmentCode: serviceItem.departmentCode });
    return;
  }
  if (actor.role === "MANAGER") {
    requirePermission(actor, permission, {});
    return;
  }
  requirePermission(actor, permission, { patientId: request.patientId, departmentCode: request.requestingDepartmentCode });
}

function findOrThrow<T>(value: T | undefined, code = "NOT_FOUND", message = "Recurso não encontrado."): T {
  if (!value) {
    throw new ApiError(code, message, 404);
  }
  return value;
}

function createAudit(
  eventType: string,
  actorId: string | undefined,
  entityType: string,
  entityId: string,
  correlationId: string,
  previousState?: string,
  newState?: string,
  metadata: AuditEvent["metadata"] = {}
): AuditEvent {
  return {
    id: id("audit"),
    eventType,
    actorId,
    entityType,
    entityId,
    previousState,
    newState,
    correlationId,
    metadata,
    occurredAt: now()
  };
}

function createOutbox(eventType: string, aggregateType: string, aggregateId: string, correlationId: string, payload: Record<string, unknown>): StoreState["outbox"][number] {
  return {
    id: id("outbox"),
    eventType,
    aggregateType,
    aggregateId,
    payload,
    status: "PENDING",
    attempts: 0,
    availableAt: now(),
    correlationId
  };
}

function notificationFor(
  state: StoreState,
  notification: Omit<Notification, "id" | "createdAt" | "attempts" | "state">
): StoreState {
  if (state.notifications.some((item) => item.dedupeKey === notification.dedupeKey && item.recipientUserId === notification.recipientUserId)) {
    return state;
  }
  const nextNotification: Notification = {
    ...notification,
    id: id("notification"),
    createdAt: now(),
    attempts: 0,
    state: "DELIVERED"
  };
  return { ...state, notifications: [...state.notifications, nextNotification] };
}

function withIdempotency<T>(
  state: StoreState,
  actorId: string,
  scope: string,
  key: string | undefined,
  payload: unknown
): { found: boolean; existing?: T; state: StoreState } {
  if (!key) {
    return { found: false, state };
  }
  const payloadHash = hashPayload(payload);
  const existing = state.idempotency.find((record) => record.actorId === actorId && record.scope === scope && record.key === key);
  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      throw new ApiError("IDEMPOTENCY_KEY_REUSED", "A chave de repetição já foi usada com outro conteúdo.", 409);
    }
    return { found: true, existing: existing.response as T, state };
  }
  return { found: false, state };
}

function saveIdempotency(state: StoreState, actorId: string, scope: string, key: string | undefined, response: unknown, payload: unknown): StoreState {
  if (!key) return state;
  const payloadHash = hashPayload(payload);
  const exists = state.idempotency.some((record) => record.actorId === actorId && record.scope === scope && record.key === key);
  if (!exists) {
    return {
      ...state,
      idempotency: [...state.idempotency, { actorId, scope, key, payloadHash, response, createdAt: now() }]
    };
  }
  return {
    ...state,
    idempotency: state.idempotency.map((record) =>
      record.actorId === actorId && record.scope === scope && record.key === key ? { ...record, payloadHash, response } : record
    )
  };
}

function requireIdempotencyKey(key: string | undefined): void {
  if (!key?.trim() || key.length > 200) {
    throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", "Esta operação exige um Idempotency-Key válido.", 400);
  }
}

function validatedSlaHours(value: Record<Priority, number>): Record<Priority, number> {
  const priorities: Priority[] = ["ROUTINE", "URGENT", "EMERGENCY"];
  if (!value || priorities.some((priority) => !Number.isFinite(value[priority]) || value[priority] <= 0 || value[priority] > 720)) {
    throw new ApiError("VALIDATION_ERROR", "SLA deve informar horas positivas de até 720 horas para cada prioridade.", 400);
  }
  return { ROUTINE: value.ROUTINE, URGENT: value.URGENT, EMERGENCY: value.EMERGENCY };
}

function serviceFor(state: StoreState, serviceId: string): DiagnosticService {
  return findOrThrow(state.services.find((service) => service.id === serviceId && service.active), "NOT_FOUND", "Serviço diagnóstico indisponível.");
}

function requestFor(state: StoreState, requestId: string): DiagnosticRequest {
  return findOrThrow(state.requests.find((request) => request.id === requestId));
}

function itemFor(state: StoreState, itemId: string): DiagnosticItem {
  return findOrThrow(state.items.find((item) => item.id === itemId));
}

function resultFor(state: StoreState, resultId: string): Result {
  return findOrThrow(state.results.find((result) => result.id === resultId));
}

function procedureFor(state: StoreState, procedureId: string): Procedure {
  return findOrThrow(state.procedures.find((procedure) => procedure.id === procedureId));
}

function scheduleWindow(input: ScheduleInput): { startsAt: string; endsAt: string; resource: string } {
  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  const resource = requireText(input.resource, "resource", 100);
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) {
    throw new ApiError("VALIDATION_ERROR", "A janela da agenda é inválida.", 400);
  }
  if (ends.getTime() - starts.getTime() > 24 * 60 * 60 * 1000) {
    throw new ApiError("VALIDATION_ERROR", "A janela da agenda não pode exceder 24 horas.", 400);
  }
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString(), resource };
}

function hasScheduleConflict(state: StoreState, window: { startsAt: string; endsAt: string; resource: string }, excludeProcedureId?: string): boolean {
  const starts = new Date(window.startsAt).getTime();
  const ends = new Date(window.endsAt).getTime();
  return state.schedules.some((schedule) => {
    if (schedule.status !== "SCHEDULED" || schedule.resource !== window.resource) return false;
    if (excludeProcedureId && schedule.procedureId === excludeProcedureId) return false;
    return starts < new Date(schedule.endsAt).getTime() && ends > new Date(schedule.startsAt).getTime();
  });
}

function activeReason(state: StoreState, type: "CANCEL" | "REJECT" | "AMEND", code: string) {
  return findOrThrow(
    state.reasonCodes.find((reason) => reason.type === type && reason.code === code && reason.active),
    "VALIDATION_ERROR",
    "Motivo informado não está disponível."
  );
}

function attachmentFor(state: StoreState, attachmentId: string): Attachment {
  return findOrThrow(state.attachments.find((attachment) => attachment.id === attachmentId));
}

function publicAttachment(attachment: Attachment): PublicAttachment {
  const { storageKey: _storageKey, ...safeAttachment } = attachment;
  return safeAttachment;
}

function safeAttachmentName(filename: string): string {
  const basename = filename.split(/[\\/]/).pop()?.trim() ?? "attachment";
  const safe = basename.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  if (!safe) throw new ApiError("VALIDATION_ERROR", "Nome de arquivo inválido.", 400);
  return safe;
}

function assertAttachmentMetadata(input: AttachmentUploadInput): { safeName: string; mimeType: string; checksum: string } {
  const safeName = safeAttachmentName(input.filename);
  const mimeType = input.mimeType.trim().toLowerCase();
  const checksum = input.checksum.trim().toLowerCase();
  if (!ALLOWED_ATTACHMENT_MIME.has(mimeType)) throw new ApiError("VALIDATION_ERROR", "Tipo de arquivo não permitido.", 400);
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_ATTACHMENT_SIZE) throw new ApiError("VALIDATION_ERROR", "Tamanho de arquivo não permitido.", 400);
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new ApiError("VALIDATION_ERROR", "Checksum SHA-256 inválido.", 400);
  return { safeName, mimeType, checksum };
}

function detectedMime(content: Uint8Array): string | undefined {
  if (content.length >= 5 && Buffer.from(content.subarray(0, 5)).toString("ascii") === "%PDF-") return "application/pdf";
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.length >= 8 && Buffer.from(content.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  return undefined;
}

function requestView(state: StoreState, request: DiagnosticRequest): RequestView {
  const patient = findOrThrow(state.patients.find((item) => item.id === request.patientId));
  const encounter = findOrThrow(state.encounters.find((item) => item.id === request.encounterId));
  const items = request.itemIds.map((itemId) => {
    const item = itemFor(state, itemId);
    return { ...item, service: serviceFor(state, item.serviceId) };
  });
  return { ...request, patient, encounter, items };
}

function requestViewForActor(state: StoreState, actor: User, request: DiagnosticRequest): RequestView {
  const view = requestView(state, request);
  if (!isExecutorRole(actor)) return view;
  const items = view.items.filter((item) => item.departmentCode === actor.departmentCode);
  return { ...view, itemIds: items.map((item) => item.id), items };
}

function resultView(state: StoreState, result: Result): ResultView {
  const item = itemFor(state, result.itemId);
  const request = requestFor(state, item.requestId);
  const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
  const service = serviceFor(state, item.serviceId);
  const currentVersion = findOrThrow(
    state.resultVersions.find((version) => version.id === result.currentVersionId) ??
      state.resultVersions.filter((version) => version.resultId === result.id).sort((left, right) => right.sequence - left.sequence)[0]
  );
  return { result, version: currentVersion, item, request, patient, service };
}

function ensureExpectedVersion(actual: number, expectedVersion: number | undefined): void {
  if (expectedVersion !== undefined && actual !== expectedVersion) {
    throw new ApiError("STALE_VERSION", "O registro mudou enquanto você trabalhava. Atualize a tela para continuar.", 409, { currentVersion: actual, retryable: false });
  }
}

function calculateDueAt(startedAt: string, service: DiagnosticService, priority: Priority): string {
  return new Date(new Date(startedAt).getTime() + service.slaHours[priority] * 60 * 60 * 1000).toISOString();
}

function nextRequestState(state: StoreState, request: DiagnosticRequest, itemUpdates: DiagnosticItem[]): StoreState {
  const nextItems = state.items.map((item) => itemUpdates.find((updated) => updated.id === item.id) ?? item);
  const nextStatus = aggregateRequestStatus(request.itemIds.map((itemId) => nextItems.find((item) => item.id === itemId)!));
  const nextRequest = { ...request, aggregateStatus: nextStatus, updatedAt: now(), version: request.version + 1 };
  return {
    ...state,
    items: nextItems,
    requests: state.requests.map((entry) => (entry.id === request.id ? nextRequest : entry))
  };
}

export function createApplicationService(store: StateStore, dependencies: { storage?: FileStore } = {}) {
  const storage = dependencies.storage ?? createFileStoreFromEnv();
  return {
    async createRequest(actor: User, input: CreateRequestInput, meta: CommandMeta & { allowDuplicateOverride?: boolean } = {}): Promise<RequestView> {
      const scope = "POST:/diagnostic-requests";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requirePermission(currentActor, "request.create", { patientId: input.patientId, departmentCode: currentActor.departmentCode });
        const idempotent = withIdempotency<RequestView>(originalState, currentActor.id, scope, meta.idempotencyKey, { input, allowDuplicateOverride: meta.allowDuplicateOverride });
        if (idempotent.found) return { state: originalState, result: idempotent.existing as RequestView };
        if (!input.patientId || !input.encounterId || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) {
          throw new ApiError("VALIDATION_ERROR", "Paciente, atendimento e pelo menos um serviço são obrigatórios.", 400);
        }
        const patient = findOrThrow(originalState.patients.find((entry) => entry.id === input.patientId));
        const encounter = findOrThrow(originalState.encounters.find((entry) => entry.id === input.encounterId));
        if (encounter.patientId !== patient.id) throw new ApiError("VALIDATION_ERROR", "Atendimento não pertence ao paciente informado.", 400);
        const admission = input.admissionId ? findOrThrow(originalState.admissions.find((entry) => entry.id === input.admissionId)) : undefined;
        if (admission && admission.encounterId !== encounter.id) throw new ApiError("VALIDATION_ERROR", "Internação não pertence ao atendimento informado.", 400);
        const services = input.items.map((entry) => serviceFor(originalState, entry.serviceId));
        const duplicateItems = originalState.items.filter((item) =>
          item.status !== "COMPLETED" && item.status !== "CANCELLED" && item.status !== "REJECTED" &&
          item.requestId && input.items.some((requested) => requested.serviceId === item.serviceId) &&
          originalState.requests.some((request) => request.id === item.requestId && request.patientId === patient.id)
        );
        if (duplicateItems.length > 0 && !meta.allowDuplicateOverride) {
          throw new ApiError("DUPLICATE_WARNING", "Já existe um exame ativo compatível para este paciente.", 409, {
            existingRequestCodes: duplicateItems.map((item) => requestFor(originalState, item.requestId).requestCode)
          });
        }
        if (meta.allowDuplicateOverride) {
          requirePermission(currentActor, "request.duplicate_override", { patientId: patient.id, departmentCode: currentActor.departmentCode });
          requireText(input.overrideReason ?? "", "overrideReason", 500);
        }
        const createdAt = now();
        const requestId = id("request");
        const requestCode = `EX-${createdAt.slice(2, 10).replace(/-/g, "")}-${String(originalState.protocolSequence).padStart(4, "0")}`;
        const request: DiagnosticRequest = {
          id: requestId,
          requestCode,
          patientId: patient.id,
          encounterId: encounter.id,
          admissionId: admission?.id,
          requesterId: currentActor.id,
          requestingDepartmentCode: currentActor.departmentCode,
          priority: input.priority,
          aggregateStatus: "REQUESTED",
          itemIds: [],
          createdAt,
          updatedAt: createdAt,
          version: 1
        };
        const items = input.items.map((entry, index) => {
          const service = services[index];
          const itemId = id("item");
          const note = entry.note ? requireText(entry.note, "note", MAX_NOTE_LENGTH) : undefined;
          return {
            id: itemId,
            requestId,
            serviceId: service.id,
            departmentCode: service.departmentCode,
            workflowType: service.workflowType,
            priority: input.priority,
            status: "REQUESTED" as const,
            note,
            requestedAt: createdAt,
            slaStartedAt: createdAt,
            dueAt: calculateDueAt(createdAt, service, input.priority),
            slaPolicyVersion: service.version,
            version: 1
          } satisfies DiagnosticItem;
        });
        const nextRequest = { ...request, itemIds: items.map((item) => item.id) };
        const correlationId = meta.correlationId ?? id("corr");
        const audits = [
          createAudit("DiagnosticRequestCreated", currentActor.id, "DiagnosticRequest", request.id, correlationId, undefined, "REQUESTED", { requestCode }),
          ...items.map((item) => createAudit("DiagnosticItemRequested", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, undefined, item.status, { serviceCode: serviceFor(originalState, item.serviceId).code }))
        ];
        const nextState: StoreState = {
          ...originalState,
          protocolSequence: originalState.protocolSequence + 1,
          requests: [...originalState.requests, nextRequest],
          items: [...originalState.items, ...items],
          auditEvents: [...originalState.auditEvents, ...audits],
          outbox: [...originalState.outbox, createOutbox("DiagnosticRequestCreated", "DiagnosticRequest", request.id, correlationId, { requestCode })]
        };
        const response = requestView(nextState, nextRequest);
        return { state: saveIdempotency(nextState, currentActor.id, scope, meta.idempotencyKey, response, { input, allowDuplicateOverride: meta.allowDuplicateOverride }), result: response };
      });
    },

    async getRequest(actor: User, requestId: string): Promise<RequestView> {
      const state = store.getState();
      const request = requestFor(state, requestId);
      requireRequestPermission(state, actor, "request.view", request);
      return requestViewForActor(state, actor, request);
    },

    async getItem(actor: User, itemId: string): Promise<ItemView> {
      const state = store.getState();
      const item = itemFor(state, itemId);
      const request = requestFor(state, item.requestId);
      const service = serviceFor(state, item.serviceId);
      if (isExecutorRole(actor)) {
        requirePermission(actor, "item.view", { departmentCode: service.departmentCode });
      } else {
        requirePermission(actor, "item.view", { patientId: request.patientId, departmentCode: request.requestingDepartmentCode });
      }
      const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
      return { item, request: requestViewForActor(state, actor, request), patient, service };
    },

    async receiveSample(actor: User, itemIds: string[], input: ReceiveSampleInput) {
      const scope = "POST:/receive-sample";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<SampleCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemIds, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        if (!itemIds.length || itemIds.length > 20) throw new ApiError("VALIDATION_ERROR", "Selecione ao menos um item.", 400);
        const items = itemIds.map((itemId) => itemFor(originalState, itemId));
        const request = requestFor(originalState, items[0].requestId);
        const serviceItems = items.map((item) => ({ item, service: serviceFor(originalState, item.serviceId) }));
        if (serviceItems.some(({ item, service }) => item.requestId !== request.id || service.workflowType !== "LABORATORY" || item.status !== "REQUESTED")) {
          throw new ApiError("INVALID_STATE_TRANSITION", "A amostra só pode ser recebida para itens laboratoriais solicitados.", 409);
        }
        if (!input.accessionCode.match(/^[A-Z0-9][A-Z0-9-]{2,39}$/)) throw new ApiError("VALIDATION_ERROR", "Accession inválido.", 400);
        if (originalState.samples.some((sample) => sample.accessionCode === input.accessionCode)) throw new ApiError("CONFLICT", "Accession já utilizado.", 409);
        const receivedAt = now();
        const sample: Sample = { id: id("sample"), requestId: request.id, accessionCode: input.accessionCode, sampleType: requireText(input.sampleType, "sampleType", 100), status: "RECEIVED", itemIds: items.map((item) => item.id), receivedAt, receivedBy: currentActor.id, version: 1 };
        const updatedItems = items.map((item) => ({ ...item, status: transitionItem(item.status, "RECEIVED", item.workflowType), receivedAt, currentSampleId: sample.id, version: item.version + 1 }));
        let nextState = nextRequestState({ ...originalState, samples: [...originalState.samples, sample] }, request, updatedItems);
        const correlationId = input.correlationId ?? id("corr");
        const audits = updatedItems.map((item) => createAudit("SampleReceived", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, "REQUESTED", "RECEIVED", { accessionCode: sample.accessionCode }));
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, ...audits], outbox: [...nextState.outbox, createOutbox("SampleReceived", "Sample", sample.id, correlationId, { accessionCode: sample.accessionCode, itemIds: sample.itemIds })] };
        const result = { sample, items: updatedItems, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemIds, input }), result };
      });
    },

    async requestRecollection(actor: User, sampleId: string, input: RecollectionInput) {
      const scope = "POST:/request-recollection";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<SampleCommandResult & { replacement: Sample }>(originalState, currentActor.id, scope, input.idempotencyKey, { sampleId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const sample = findOrThrow(originalState.samples.find((entry) => entry.id === sampleId));
        const request = requestFor(originalState, sample.requestId);
        const linkedItems = sample.itemIds.map((itemId) => itemFor(originalState, itemId));
        const service = serviceFor(originalState, linkedItems[0].serviceId);
        requirePermission(currentActor, "sample.recollection.request", { departmentCode: service.departmentCode });
        if (sample.status !== "RECEIVED") throw new ApiError("INVALID_STATE_TRANSITION", "A amostra não está disponível para recoleta.", 409);
        const reason = findOrThrow(originalState.reasonCodes.find((entry) => entry.type === "RECOLLECTION" && entry.code === input.reasonCode && entry.active), "VALIDATION_ERROR", "Motivo de recoleta inválido.");
        const rejectionNote = input.note ? requireText(input.note, "note", MAX_NOTE_LENGTH) : undefined;
        const rejectedSample: Sample = { ...sample, status: "REJECTED", rejectionCode: reason.code, rejectionNote, version: sample.version + 1 };
        const replacement: Sample = { id: id("sample"), requestId: request.id, accessionCode: `PENDING-${randomUUID().slice(0, 8).toUpperCase()}`, sampleType: sample.sampleType, status: "EXPECTED", replacesSampleId: sample.id, itemIds: [...sample.itemIds], version: 1 };
        const updatedItems = linkedItems.map((item) => ({ ...item, status: transitionItem(item.status, "RECOLLECTION_REQUIRED", item.workflowType), version: item.version + 1 }));
        let nextState = nextRequestState({ ...originalState, samples: [...originalState.samples.filter((entry) => entry.id !== sample.id), rejectedSample, replacement] }, request, updatedItems);
        const requester = findOrThrow(originalState.users.find((user) => user.id === request.requesterId));
        const correlationId = input.correlationId ?? id("corr");
        const notification: Omit<Notification, "id" | "createdAt" | "attempts" | "state"> = { category: "ACTIONABLE", priority: "HIGH", recipientUserId: requester.id, entityType: "SAMPLE", entityId: replacement.id, deepLink: `/requests/${request.id}`, title: "Nova coleta necessária", body: `${requester.displayName}, a amostra ${sample.accessionCode} precisa ser recolhida: ${reason.label}.`, dedupeKey: `recollection:${sample.id}:${replacement.id}` };
        nextState = notificationFor(nextState, notification);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("SampleRejected", currentActor.id, "Sample", sample.id, correlationId, "RECEIVED", "REJECTED", { reasonCode: reason.code }), createAudit("RecollectionRequested", currentActor.id, "Sample", replacement.id, correlationId, undefined, "EXPECTED", { replacesSampleId: sample.id })], outbox: [...nextState.outbox, createOutbox("RecollectionRequested", "Sample", replacement.id, correlationId, { reasonCode: reason.code, replacesSampleId: sample.id })] };
        const result = { sample: rejectedSample, replacement, items: updatedItems, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { sampleId, input }), result };
      });
    },

    async receiveReplacement(actor: User, sampleId: string, input: ReceiveSampleInput) {
      const scope = "POST:/receive-replacement";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<SampleCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { sampleId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const expected = findOrThrow(originalState.samples.find((entry) => entry.id === sampleId));
        requirePermission(currentActor, "sample.replacement.receive", { departmentCode: "LABORATORY" });
        if (expected.status !== "EXPECTED" || !expected.replacesSampleId) throw new ApiError("INVALID_STATE_TRANSITION", "A recoleta não está aguardando recebimento.", 409);
        if (originalState.samples.some((sample) => sample.accessionCode === input.accessionCode)) throw new ApiError("CONFLICT", "Accession já utilizado.", 409);
        const receivedAt = now();
        const replacement: Sample = { ...expected, accessionCode: input.accessionCode, sampleType: requireText(input.sampleType, "sampleType", 100), status: "RECEIVED", receivedAt, receivedBy: currentActor.id, version: expected.version + 1 };
        const request = requestFor(originalState, replacement.requestId);
        const items = replacement.itemIds.map((itemId) => itemFor(originalState, itemId));
        const updatedItems = items.map((item) => ({ ...item, status: transitionItem(item.status, "RECEIVED", item.workflowType), currentSampleId: replacement.id, receivedAt, version: item.version + 1 }));
        let nextState = nextRequestState({ ...originalState, samples: originalState.samples.map((sample) => sample.id === expected.id ? replacement : sample) }, request, updatedItems);
        const correlationId = input.correlationId ?? id("corr");
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("SampleReceived", currentActor.id, "Sample", replacement.id, correlationId, "EXPECTED", "RECEIVED", { replacesSampleId: expected.replacesSampleId })], outbox: [...nextState.outbox, createOutbox("SampleReceived", "Sample", replacement.id, correlationId, { replacesSampleId: expected.replacesSampleId })] };
        const result = { sample: replacement, items: updatedItems, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { sampleId, input }), result };
      });
    },

    async startProcessing(actor: User, itemId: string, input: CommandMeta) {
      return this.updateItemState(actor, itemId, "IN_PROGRESS", input, "sample.process");
    },

    async updateItemState(actor: User, itemId: string, target: ItemState, input: CommandMeta, permission: Permission) {
      const scope = `POST:/items/${target}`;
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ItemCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, target, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        requirePermission(currentActor, permission, { departmentCode: service.departmentCode });
        ensureExpectedVersion(item.version, input.expectedVersion);
        const nextItem = { ...item, status: transitionItem(item.status, target, item.workflowType), startedAt: target === "IN_PROGRESS" ? (item.startedAt ?? now()) : item.startedAt, version: item.version + 1 };
        const request = requestFor(originalState, item.requestId);
        let nextState = nextRequestState(originalState, request, [nextItem]);
        const correlationId = input.correlationId ?? id("corr");
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ProcessingStarted", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, item.status, nextItem.status, {})] };
        const result = { item: nextItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, target, input }), result };
      });
    },

    async scheduleProcedure(actor: User, itemId: string, input: ScheduleInput) {
      const scope = "POST:/procedure/schedule";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ProcedureScheduleCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "procedure.schedule", { departmentCode: service.departmentCode });
        if (!(["RADIOLOGY", "ULTRASOUND"] as WorkflowType[]).includes(item.workflowType) || !service.requiresSchedule && item.workflowType === "RADIOLOGY" && item.status !== "REQUESTED") {
          throw new ApiError("VALIDATION_ERROR", "Este item não aceita agendamento nesta etapa.", 400);
        }
        if (item.status !== "REQUESTED") throw new ApiError("INVALID_STATE_TRANSITION", "O item já possui uma execução iniciada ou agendada.", 409);
        const window = scheduleWindow(input);
        if (hasScheduleConflict(originalState, window)) throw new ApiError("SCHEDULE_CONFLICT", "O recurso já está reservado neste intervalo.", 409);
        const createdAt = now();
        const procedure: Procedure = { id: id("procedure"), itemId, workflowType: item.workflowType as "RADIOLOGY" | "ULTRASOUND", status: "SCHEDULED", scheduleIds: [], version: 1 };
        const schedule: ProcedureSchedule = { id: id("schedule"), procedureId: procedure.id, ...window, status: "SCHEDULED", actorId: currentActor.id, createdAt };
        const nextProcedure = { ...procedure, scheduleIds: [schedule.id] };
        const updatedItem = { ...item, status: transitionItem(item.status, "SCHEDULED", item.workflowType), procedureId: procedure.id, version: item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, procedures: [...originalState.procedures, nextProcedure], schedules: [...originalState.schedules, schedule] }, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ProcedureScheduled", currentActor.id, "Procedure", procedure.id, correlationId, "REQUESTED", "SCHEDULED", { resource: window.resource }), createAudit("ScheduleCreated", currentActor.id, "ProcedureSchedule", schedule.id, correlationId, undefined, "SCHEDULED", { procedureId: procedure.id })], outbox: [...nextState.outbox, createOutbox("ProcedureScheduled", "Procedure", procedure.id, correlationId, { scheduleId: schedule.id, itemId })] };
        const result = { item: updatedItem, procedure: nextProcedure, schedule, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, input }), result };
      });
    },

    async rescheduleProcedure(actor: User, procedureId: string, input: ScheduleInput) {
      const scope = "POST:/procedure/reschedule";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ProcedureRescheduleCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { procedureId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const procedure = procedureFor(originalState, procedureId);
        const item = itemFor(originalState, procedure.itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "procedure.reschedule", { departmentCode: service.departmentCode });
        ensureExpectedVersion(procedure.version, input.expectedVersion);
        if (procedure.status !== "SCHEDULED" || item.status !== "SCHEDULED") throw new ApiError("INVALID_STATE_TRANSITION", "Somente um procedimento agendado pode ser remarcado.", 409);
        const window = scheduleWindow(input);
        if (hasScheduleConflict(originalState, window, procedure.id)) throw new ApiError("SCHEDULE_CONFLICT", "O recurso já está reservado neste intervalo.", 409);
        const currentSchedule = findOrThrow(originalState.schedules.filter((schedule) => schedule.procedureId === procedure.id && schedule.status === "SCHEDULED").sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]);
        const reason = input.reason ? requireText(input.reason, "reason", 500) : undefined;
        const cancelledSchedule = { ...currentSchedule, status: "CANCELLED" as const, reason };
        const schedule: ProcedureSchedule = { id: id("schedule"), procedureId: procedure.id, ...window, status: "SCHEDULED", actorId: currentActor.id, createdAt: now() };
        const updatedProcedure = { ...procedure, scheduleIds: [...procedure.scheduleIds, schedule.id], version: procedure.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, procedures: originalState.procedures.map((entry) => entry.id === procedure.id ? updatedProcedure : entry), schedules: [...originalState.schedules.map((entry) => entry.id === currentSchedule.id ? cancelledSchedule : entry), schedule], auditEvents: [...originalState.auditEvents, createAudit("ProcedureRescheduled", currentActor.id, "Procedure", procedure.id, correlationId, "SCHEDULED", "SCHEDULED", { reason: reason ?? null }), createAudit("ScheduleCreated", currentActor.id, "ProcedureSchedule", schedule.id, correlationId, undefined, "SCHEDULED", { supersedesScheduleId: currentSchedule.id })], outbox: [...originalState.outbox, createOutbox("ProcedureRescheduled", "Procedure", procedure.id, correlationId, { scheduleId: schedule.id, previousScheduleId: currentSchedule.id })] };
        const result = { procedure: updatedProcedure, schedule, history: nextState.schedules.filter((entry) => entry.procedureId === procedure.id), item, request };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { procedureId, input }), result };
      });
    },

    async startProcedure(actor: User, itemId: string, input: CommandMeta) {
      const scope = "POST:/procedure/start";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ItemCommandResult & { procedure: Procedure }>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "procedure.start", { departmentCode: service.departmentCode });
        ensureExpectedVersion(item.version, input.expectedVersion);
        let procedure = item.procedureId ? procedureFor(originalState, item.procedureId) : undefined;
        if (item.workflowType === "ULTRASOUND" && (!procedure || procedure.status !== "SCHEDULED" || item.status !== "SCHEDULED")) throw new ApiError("INVALID_STATE_TRANSITION", "O ultrassom precisa estar agendado antes de iniciar.", 409);
        if (item.workflowType === "RADIOLOGY" && item.status === "REQUESTED" && !procedure) {
          procedure = { id: id("procedure"), itemId, workflowType: "RADIOLOGY", status: "EXPECTED", scheduleIds: [], version: 1 };
        }
        if (!procedure || !["EXPECTED", "SCHEDULED"].includes(procedure.status)) throw new ApiError("INVALID_STATE_TRANSITION", "O procedimento não está pronto para iniciar.", 409);
        const updatedProcedure = { ...procedure, status: "IN_PROGRESS" as const, version: procedure.version + 1 };
        const updatedItem = { ...item, status: transitionItem(item.status, "IN_PROGRESS", item.workflowType), startedAt: item.startedAt ?? now(), procedureId: procedure.id, version: item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, procedures: procedure.id === item.procedureId ? originalState.procedures.map((entry) => entry.id === procedure!.id ? updatedProcedure : entry) : [...originalState.procedures, updatedProcedure] }, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ProcedureStarted", currentActor.id, "Procedure", procedure.id, correlationId, procedure.status, "IN_PROGRESS", {})], outbox: [...nextState.outbox, createOutbox("ProcedureStarted", "Procedure", procedure.id, correlationId, { itemId })] };
        const result = { item: updatedItem, procedure: updatedProcedure, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, input }), result };
      });
    },

    async markProcedurePerformed(actor: User, itemId: string, input: CommandMeta) {
      const scope = "POST:/procedure/mark-performed";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ItemCommandResult & { procedure: Procedure }>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const procedure = item.procedureId ? procedureFor(originalState, item.procedureId) : undefined;
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "procedure.mark_performed", { departmentCode: service.departmentCode });
        ensureExpectedVersion(item.version, input.expectedVersion);
        if (!procedure || procedure.status !== "IN_PROGRESS" || item.status !== "IN_PROGRESS") throw new ApiError("INVALID_STATE_TRANSITION", "O procedimento não está em execução.", 409);
        const performedAt = now();
        const updatedProcedure = { ...procedure, status: "PERFORMED" as const, performedAt, performedBy: currentActor.id, version: procedure.version + 1 };
        const updatedItem = { ...item, status: transitionItem(item.status, "AWAITING_REPORT", item.workflowType), performedAt, version: item.version + 1 };
        const schedules = originalState.schedules.map((schedule) => procedure.scheduleIds.includes(schedule.id) && schedule.status === "SCHEDULED" ? { ...schedule, status: "COMPLETED" as const } : schedule);
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, procedures: originalState.procedures.map((entry) => entry.id === procedure.id ? updatedProcedure : entry), schedules }, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ProcedurePerformed", currentActor.id, "Procedure", procedure.id, correlationId, "IN_PROGRESS", "PERFORMED", {})], outbox: [...nextState.outbox, createOutbox("ProcedurePerformed", "Procedure", procedure.id, correlationId, { itemId })] };
        const result = { item: updatedItem, procedure: updatedProcedure, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, input }), result };
      });
    },

    async cancelItem(actor: User, itemId: string, input: CancelInput) {
      const scope = "POST:/diagnostic-items/cancel";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<ItemCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "item.cancel", { patientId: request.patientId, departmentCode: service.departmentCode });
        ensureExpectedVersion(item.version, input.expectedVersion);
        activeReason(originalState, "CANCEL", input.reasonCode);
        if (!["REQUESTED", "RECEIVED", "SCHEDULED", "IN_PROGRESS", "AWAITING_REPORT", "RECOLLECTION_REQUIRED", "FAILED"].includes(item.status)) throw new ApiError("INVALID_STATE_TRANSITION", "Este item não pode ser cancelado nesta fase.", 409);
        const reason = input.reason ? requireText(input.reason, "reason", 500) : input.reasonCode;
        const updatedItem = { ...item, status: transitionItem(item.status, "CANCELLED", item.workflowType), cancellationReason: reason, version: item.version + 1 };
        const schedules = originalState.schedules.map((schedule) => item.procedureId && schedule.procedureId === item.procedureId && schedule.status === "SCHEDULED" ? { ...schedule, status: "CANCELLED" as const, reason } : schedule);
        const requestState = nextRequestState({ ...originalState, schedules }, request, [updatedItem]);
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...requestState, auditEvents: [...requestState.auditEvents, createAudit("DiagnosticItemCancelled", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, item.status, "CANCELLED", { reasonCode: input.reasonCode })], outbox: [...requestState.outbox, createOutbox("DiagnosticItemCancelled", "DiagnosticRequestItem", item.id, correlationId, { reasonCode: input.reasonCode })] };
        const result = { item: updatedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, input }), result };
      });
    },

    async cancelRequest(actor: User, requestId: string, input: CancelInput & { itemIds?: string[] }) {
      const scope = "POST:/diagnostic-requests/cancel";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<RequestView>(originalState, currentActor.id, scope, input.idempotencyKey, { requestId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const request = requestFor(originalState, requestId);
        requirePermission(currentActor, "request.cancel", { patientId: request.patientId, departmentCode: request.requestingDepartmentCode });
        activeReason(originalState, "CANCEL", input.reasonCode);
        const selected = input.itemIds?.length ? new Set(input.itemIds) : new Set(request.itemIds);
        const targets = request.itemIds.map((itemId) => itemFor(originalState, itemId)).filter((item) => selected.has(item.id));
        if (!targets.length) throw new ApiError("VALIDATION_ERROR", "Selecione pelo menos um item para cancelar.", 400);
        const reason = input.reason ? requireText(input.reason, "reason", 500) : input.reasonCode;
        const updatedItems = targets.map((item) => {
          if (!["REQUESTED", "RECEIVED", "SCHEDULED", "IN_PROGRESS", "AWAITING_REPORT", "RECOLLECTION_REQUIRED", "FAILED"].includes(item.status)) throw new ApiError("INVALID_STATE_TRANSITION", "Um dos itens não pode ser cancelado nesta fase.", 409);
          return { ...item, status: transitionItem(item.status, "CANCELLED", item.workflowType), cancellationReason: reason, version: item.version + 1 };
        });
        const schedules = originalState.schedules.map((schedule) => updatedItems.some((item) => item.procedureId === schedule.procedureId) && schedule.status === "SCHEDULED" ? { ...schedule, status: "CANCELLED" as const, reason } : schedule);
        let nextState = nextRequestState({ ...originalState, schedules }, request, updatedItems);
        const correlationId = input.correlationId ?? id("corr");
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, ...updatedItems.map((item) => createAudit("DiagnosticItemCancelled", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, targets.find((target) => target.id === item.id)!.status, "CANCELLED", { reasonCode: input.reasonCode }))], outbox: [...nextState.outbox, createOutbox("DiagnosticRequestCancelled", "DiagnosticRequest", request.id, correlationId, { itemIds: updatedItems.map((item) => item.id), reasonCode: input.reasonCode })] };
        const result = requestViewForActor(nextState, currentActor, requestFor(nextState, request.id));
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { requestId, input }), result };
      });
    },

    async rejectItem(actor: User, itemId: string, input: RejectInput) {
      const scope = "POST:/diagnostic-items/reject";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ItemCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "item.reject", { departmentCode: service.departmentCode });
        ensureExpectedVersion(item.version, input.expectedVersion);
        activeReason(originalState, "REJECT", input.reasonCode);
        if (!["REQUESTED", "RECEIVED", "IN_PROGRESS"].includes(item.status)) throw new ApiError("INVALID_STATE_TRANSITION", "Este item não pode ser rejeitado nesta fase.", 409);
        const updatedItem = { ...item, status: transitionItem(item.status, "REJECTED", item.workflowType), rejectionReason: input.note ? requireText(input.note, "note", MAX_NOTE_LENGTH) : input.reasonCode, version: item.version + 1 };
        const sample = item.currentSampleId ? originalState.samples.find((entry) => entry.id === item.currentSampleId) : undefined;
        const samples = sample ? originalState.samples.map((entry) => entry.id === sample.id ? { ...entry, status: "REJECTED" as const, rejectionCode: input.reasonCode, rejectionNote: input.note, version: entry.version + 1 } : entry) : originalState.samples;
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, samples }, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("DiagnosticItemRejected", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, item.status, "REJECTED", { reasonCode: input.reasonCode })], outbox: [...nextState.outbox, createOutbox("DiagnosticItemRejected", "DiagnosticRequestItem", item.id, correlationId, { reasonCode: input.reasonCode })] };
        const result = { item: updatedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, input }), result };
      });
    },

    async completeItem(actor: User, itemId: string, input: CommandMeta) {
      const scope = "POST:/diagnostic-items/complete";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<ItemCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "item.complete", { departmentCode: service.departmentCode });
        ensureExpectedVersion(item.version, input.expectedVersion);
        if (item.status !== "REVIEWED") throw new ApiError("INVALID_STATE_TRANSITION", "Somente um resultado revisado pode ser concluído.", 409);
        const updatedItem = { ...item, status: transitionItem(item.status, "COMPLETED", item.workflowType), completedAt: now(), version: item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState(originalState, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("RequestItemCompleted", currentActor.id, "DiagnosticRequestItem", item.id, correlationId, "REVIEWED", "COMPLETED", {})], outbox: [...nextState.outbox, createOutbox("RequestItemCompleted", "DiagnosticRequestItem", item.id, correlationId, {})] };
        const result = { item: updatedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { itemId, input }), result };
      });
    },

    async createResultDraft(actor: User, itemId: string, input: ResultDraftInput) {
      const scope = "POST:/results/draft";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ResultDraftCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { itemId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const item = itemFor(originalState, itemId);
        const service = serviceFor(originalState, item.serviceId);
        const request = requestFor(originalState, item.requestId);
        requirePermission(currentActor, "result.draft.create", { departmentCode: service.departmentCode });
        if (!["IN_PROGRESS", "AWAITING_REPORT", "RESULT_VOIDED"].includes(item.status)) {
          throw new ApiError("RESULT_RELEASE_BLOCKED", "O item ainda não está pronto para receber um resultado.", 422);
        }
        const narrative = requireText(input.narrative, "narrative", MAX_RESULT_NARRATIVE_LENGTH);
        const result: Result = { id: id("result"), itemId, lifecycleStatus: "DRAFT", needsReReview: false, version: 1 };
        const version: ResultVersion = { id: id("result-version"), resultId: result.id, sequence: 1, status: "DRAFT", content: { ...input.content }, narrative, conclusion: input.conclusion?.trim(), authorId: currentActor.id, createdAt: now(), critical: false, needsReReview: false, version: 1 };
        const updatedItem = { ...item, currentResultId: result.id, version: item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, results: [...originalState.results, result], resultVersions: [...originalState.resultVersions, version] }, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ResultDraftCreated", currentActor.id, "Result", result.id, correlationId, undefined, "DRAFT", { itemId })] };
        const response = { result, version, item: updatedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { itemId, input }), result: response };
      });
    },

    async updateResultDraft(actor: User, resultId: string, input: ResultDraftInput) {
      const scope = "PATCH:/results/draft";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ResultDraftCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { resultId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const result = resultFor(originalState, resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "result.draft.edit_own", { departmentCode: view.service.departmentCode, ownerId: view.version.authorId });
        ensureExpectedVersion(result.version, input.expectedVersion);
        if (view.version.status !== "DRAFT" || result.lifecycleStatus !== "DRAFT") {
          throw new ApiError("INVALID_STATE_TRANSITION", "Somente o draft atual e não liberado pode ser editado.", 409);
        }
        const narrative = requireText(input.narrative, "narrative", MAX_RESULT_NARRATIVE_LENGTH);
        const updatedVersion: ResultVersion = { ...view.version, content: { ...input.content }, narrative, conclusion: input.conclusion?.trim(), version: view.version.version + 1 };
        const updatedResult: Result = { ...result, version: result.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = { ...originalState, results: originalState.results.map((entry) => entry.id === result.id ? updatedResult : entry), resultVersions: originalState.resultVersions.map((entry) => entry.id === view.version.id ? updatedVersion : entry) };
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ResultDraftUpdated", currentActor.id, "ResultVersion", updatedVersion.id, correlationId, "DRAFT", "DRAFT", { resultId })], outbox: [...nextState.outbox, createOutbox("ResultDraftUpdated", "Result", result.id, correlationId, { versionId: updatedVersion.id })] };
        const response = { result: updatedResult, version: updatedVersion, item: view.item, request: requestViewForActor(nextState, currentActor, requestFor(nextState, view.request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { resultId, input }), result: response };
      });
    },

    async releaseResult(actor: User, resultId: string, input: ReleaseInput) {
      const scope = "POST:/results/release";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<ResultReleaseCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { resultId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const result = resultFor(originalState, resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "result.release", { departmentCode: view.service.departmentCode });
        ensureExpectedVersion(result.version, input.expectedVersion);
        if (view.version.status !== "DRAFT") throw new ApiError("INVALID_STATE_TRANSITION", "Somente um draft pode ser liberado.", 409);
        const blockedAttachments = originalState.attachments.filter((attachment) => attachment.resultVersionId === view.version.id && (attachment.uploadStatus !== "FINALIZED" || attachment.scanStatus !== "CLEAN"));
        if (blockedAttachments.length > 0) throw new ApiError("RESULT_RELEASE_BLOCKED", "Finalize ou remova os anexos pendentes antes de liberar o resultado.", 422, { retryable: true });
        if (input.critical && !criticalPolicyIsReady()) {
          throw new ApiError("CRITICAL_POLICY_MISSING", "A política de resultado crítico ainda não foi aprovada/ativada.", 422);
        }
        const releasedAt = now();
        const releasedVersion: ResultVersion = { ...view.version, status: "RELEASED", releasedAt, releasedBy: currentActor.id, critical: input.critical === true, version: view.version.version + 1 };
        const releasedResult: Result = { ...result, lifecycleStatus: "RELEASED", currentVersionId: releasedVersion.id, version: result.version + 1 };
        const releasedItem = { ...view.item, status: transitionItem(view.item.status, "RESULT_AVAILABLE", view.item.workflowType), releasedAt, version: view.item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, results: originalState.results.map((entry) => entry.id === result.id ? releasedResult : entry), resultVersions: originalState.resultVersions.map((entry) => entry.id === view.version.id ? releasedVersion : entry) }, view.request, [releasedItem]);
        const requester = findOrThrow(originalState.users.find((user) => user.id === view.request.requesterId));
        const notification: Omit<Notification, "id" | "createdAt" | "attempts" | "state"> = { category: releasedVersion.critical ? "CRITICAL" : "ACTIONABLE", priority: releasedVersion.critical ? "URGENT" : "HIGH", recipientUserId: requester.id, entityType: "RESULT_VERSION", entityId: releasedVersion.id, deepLink: `/results/${result.id}`, title: releasedVersion.critical ? "Resultado crítico requer confirmação" : "Resultado disponível", body: `${view.patient.displayName} · ${view.service.name} · versão ${releasedVersion.sequence} liberada.`, dedupeKey: `release:${releasedVersion.id}:${requester.id}` };
        nextState = notificationFor(nextState, notification);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ResultReleased", currentActor.id, "ResultVersion", releasedVersion.id, correlationId, "DRAFT", "RELEASED", { resultId, critical: releasedVersion.critical }), createAudit("DiagnosticItemResultAvailable", currentActor.id, "DiagnosticRequestItem", releasedItem.id, correlationId, view.item.status, releasedItem.status, {})], outbox: [...nextState.outbox, createOutbox("ResultReleased", "Result", result.id, correlationId, { versionId: releasedVersion.id, critical: releasedVersion.critical })] };
        const response = { result: releasedResult, version: releasedVersion, item: releasedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, view.request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { resultId, input }), result: response };
      });
    },

    async amendResult(actor: User, resultId: string, input: AmendInput) {
      const scope = "POST:/results/amend";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<AmendCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { resultId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const result = resultFor(originalState, resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "result.amend", { departmentCode: view.service.departmentCode });
        ensureExpectedVersion(result.version, input.expectedVersion);
        if (!["RELEASED", "REVIEWED", "COMPLETED"].includes(view.version.status) || !["RESULT_AVAILABLE", "REVIEWED", "COMPLETED"].includes(view.item.status)) throw new ApiError("INVALID_STATE_TRANSITION", "Somente um resultado liberado pode ser emendado.", 409);
        const reason = requireText(input.reason, "reason", 500);
        const narrative = requireText(input.narrative, "narrative", MAX_RESULT_NARRATIVE_LENGTH);
        const supersededVersion = { ...view.version, status: "SUPERSEDED" as const, version: view.version.version + 1 };
        const nextVersion: ResultVersion = { id: id("result-version"), resultId: result.id, sequence: view.version.sequence + 1, status: "DRAFT", content: { ...input.content }, narrative, conclusion: input.conclusion?.trim(), authorId: currentActor.id, createdAt: now(), amendmentReason: reason, supersedesId: view.version.id, critical: input.critical === true, needsReReview: true, version: 1 };
        const amendedResult = { ...result, currentVersionId: nextVersion.id, lifecycleStatus: "DRAFT" as const, needsReReview: true, version: result.version + 1 };
        const amendedItem = { ...view.item, status: transitionItem(view.item.status, "RESULT_VOIDED", view.item.workflowType), version: view.item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, results: originalState.results.map((entry) => entry.id === result.id ? amendedResult : entry), resultVersions: [...originalState.resultVersions.map((entry) => entry.id === view.version.id ? supersededVersion : entry), nextVersion] }, view.request, [amendedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ResultAmended", currentActor.id, "ResultVersion", nextVersion.id, correlationId, view.version.status, "DRAFT", { resultId, supersedesId: view.version.id, reason })], outbox: [...nextState.outbox, createOutbox("ResultAmended", "Result", result.id, correlationId, { versionId: nextVersion.id, supersedesId: view.version.id })] };
        const response = { result: amendedResult, version: nextVersion, previousVersion: supersededVersion, item: amendedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, view.request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { resultId, input }), result: response };
      });
    },

    async voidResult(actor: User, resultId: string, input: VoidInput) {
      const scope = "POST:/results/void";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<VoidCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { resultId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const result = resultFor(originalState, resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "result.void", { departmentCode: view.service.departmentCode });
        ensureExpectedVersion(result.version, input.expectedVersion);
        if (!["RELEASED", "REVIEWED"].includes(view.version.status)) throw new ApiError("INVALID_STATE_TRANSITION", "Somente uma versão liberada pode ser invalidada.", 409);
        const reason = requireText(input.reason, "reason", 500);
        const voidedVersion = { ...view.version, status: "VOIDED" as const, needsReReview: false, version: view.version.version + 1 };
        const voidedResult = { ...result, lifecycleStatus: "VOIDED" as const, needsReReview: false, version: result.version + 1 };
        const updatedItem = { ...view.item, status: view.item.status === "RESULT_VOIDED" ? view.item.status : transitionItem(view.item.status, "RESULT_VOIDED", view.item.workflowType), version: view.item.version + 1 };
        const requester = findOrThrow(originalState.users.find((user) => user.id === view.request.requesterId));
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, results: originalState.results.map((entry) => entry.id === result.id ? voidedResult : entry), resultVersions: originalState.resultVersions.map((entry) => entry.id === view.version.id ? voidedVersion : entry) }, view.request, [updatedItem]);
        nextState = notificationFor(nextState, { category: "ACTIONABLE", priority: "HIGH", recipientUserId: requester.id, entityType: "RESULT_VERSION", entityId: voidedVersion.id, deepLink: `/results/${result.id}`, title: "Resultado invalidado", body: `${view.patient.displayName} · ${view.service.name}: um novo resultado é necessário.`, dedupeKey: `void:${voidedVersion.id}:${requester.id}` });
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ResultVoided", currentActor.id, "ResultVersion", voidedVersion.id, correlationId, view.version.status, "VOIDED", { resultId, reason })], outbox: [...nextState.outbox, createOutbox("ResultVoided", "Result", result.id, correlationId, { versionId: voidedVersion.id, reason })] };
        const response = { result: voidedResult, version: voidedVersion, item: updatedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, view.request.id)), replacementRequired: true };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { resultId, input }), result: response };
      });
    },

    async viewResult(actor: User, versionId: string, input: CommandMeta = {}) {
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const version = findOrThrow(originalState.resultVersions.find((entry) => entry.id === versionId));
        const result = resultFor(originalState, version.resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "result.view", { patientId: view.request.patientId, departmentCode: view.service.departmentCode });
        if (version.status === "DRAFT" || version.status === "VOIDED") throw new ApiError("NOT_FOUND", "Resultado não disponível.", 404);
        const scope = `POST:/results/${result.id}/view`;
        const idempotent = withIdempotency<{ versionId: string; resultId: string; viewedAt: string }>(originalState, currentActor.id, scope, input.idempotencyKey, { versionId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const correlationId = input.correlationId ?? id("corr");
        const audit = createAudit("ResultViewed", currentActor.id, "ResultVersion", version.id, correlationId, undefined, undefined, { resultId: result.id });
        const response = { versionId: version.id, resultId: result.id, viewedAt: audit.occurredAt };
        const nextState = { ...originalState, auditEvents: [...originalState.auditEvents, audit] };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { versionId, input }), result: response };
      });
    },

    async reviewResult(actor: User, resultId: string, input: ReviewInput) {
      const scope = "POST:/results/review";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<ReviewCommandResult>(originalState, currentActor.id, scope, input.idempotencyKey, { resultId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const result = resultFor(originalState, resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "result.review", { patientId: view.request.patientId });
        if (view.version.id !== input.versionId || view.item.status !== "RESULT_AVAILABLE") throw new ApiError("REVIEW_STALE", "O resultado mudou. Abra a versão atual antes de revisar.", 409);
        ensureExpectedVersion(view.item.version, input.expectedVersion);
        const wasViewed = originalState.auditEvents.some((event) => event.eventType === "ResultViewed" && event.entityId === input.versionId && event.actorId === currentActor.id);
        if (!wasViewed) throw new ApiError("VALIDATION_ERROR", "Abra o resultado antes de marcar como revisado.", 400);
        const reviewedAt = now();
        const reviewedItem = { ...view.item, status: transitionItem(view.item.status, "REVIEWED", view.item.workflowType), reviewedAt, version: view.item.version + 1 };
        const reviewedResult = { ...result, needsReReview: false, version: result.version + 1 };
        const reviewedVersion = { ...view.version, needsReReview: false, version: view.version.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...originalState, results: originalState.results.map((entry) => entry.id === result.id ? reviewedResult : entry), resultVersions: originalState.resultVersions.map((entry) => entry.id === view.version.id ? reviewedVersion : entry) }, view.request, [reviewedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit("ResultReviewed", currentActor.id, "ResultVersion", view.version.id, correlationId, "RESULT_AVAILABLE", "REVIEWED", { resultId })] };
        const response = { result: reviewedResult, version: reviewedVersion, item: reviewedItem, request: requestViewForActor(nextState, currentActor, requestFor(nextState, view.request.id)) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, response, { resultId, input }), result: response };
      });
    },

    async getResult(actor: User, resultId: string): Promise<ResultView> {
      const state = store.getState();
      const result = resultFor(state, resultId);
      const view = resultView(state, result);
      requirePermission(actor, "result.view", { patientId: view.request.patientId, departmentCode: view.service.departmentCode });
      return { ...view, request: requestViewForActor(state, actor, view.request) };
    },

    async listResultVersions(actor: User, resultId: string): Promise<ResultVersion[]> {
      const state = store.getState();
      const result = resultFor(state, resultId);
      const view = resultView(state, result);
      requirePermission(actor, "result.history.view", { patientId: view.request.patientId, departmentCode: view.service.departmentCode });
      return state.resultVersions.filter((version) => version.resultId === result.id).sort((left, right) => right.sequence - left.sequence);
    },

    async createAttachmentUploadSession(actor: User, versionId: string, input: AttachmentUploadInput): Promise<AttachmentSessionResult> {
      const scope = "POST:/attachments/upload-session";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<AttachmentSessionResult>(originalState, currentActor.id, scope, input.idempotencyKey, { versionId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const version = findOrThrow(originalState.resultVersions.find((entry) => entry.id === versionId));
        const result = resultFor(originalState, version.resultId);
        const view = resultView(originalState, result);
        const metadata = assertAttachmentMetadata(input);
        requirePermission(currentActor, "attachment.upload_session", { departmentCode: view.service.departmentCode });
        if (!view.service.allowsAttachment) throw new ApiError("VALIDATION_ERROR", "Este serviço não aceita anexos.", 400);
        if (version.status !== "DRAFT") throw new ApiError("INVALID_STATE_TRANSITION", "Anexos só podem ser preparados em um draft.", 409);
        const createdAt = now();
        const attachment: Attachment = { id: id("attachment"), resultVersionId: version.id, safeName: metadata.safeName, storageKey: `attachments/${result.id}/${randomUUID()}/${metadata.safeName}`, detectedMime: metadata.mimeType, sizeBytes: input.sizeBytes, checksum: metadata.checksum, scanStatus: "PENDING", uploadStatus: "INITIATED", expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), createdBy: currentActor.id, createdAt };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, attachments: [...originalState.attachments, attachment], auditEvents: [...originalState.auditEvents, createAudit("AttachmentUploadSessionCreated", currentActor.id, "Attachment", attachment.id, correlationId, undefined, "INITIATED", { resultVersionId: version.id, sizeBytes: attachment.sizeBytes })] };
        const resultPayload = { attachment: publicAttachment(attachment), uploadUrl: `/api/v1/attachments/${attachment.id}/content`, expiresAt: attachment.expiresAt! };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, resultPayload, { versionId, input }), result: resultPayload };
      });
    },

    async uploadAttachment(actor: User, attachmentId: string, content: Uint8Array): Promise<AttachmentFinalizationResult> {
      const originalState = store.getState();
      const attachment = attachmentFor(originalState, attachmentId);
      const version = findOrThrow(originalState.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
      const result = resultFor(originalState, version.resultId);
      const view = resultView(originalState, result);
      requirePermission(actor, "attachment.finalize", { departmentCode: view.service.departmentCode });
      if (attachment.uploadStatus !== "INITIATED") throw new ApiError("INVALID_STATE_TRANSITION", "A sessão de upload não está aberta.", 409);
      if (attachment.expiresAt && new Date(attachment.expiresAt).getTime() < Date.now()) throw new ApiError("UPLOAD_EXPIRED", "A sessão de upload expirou.", 409);
      const bytes = Buffer.from(content);
      const actualChecksum = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== attachment.sizeBytes) throw new ApiError("ATTACHMENT_SIZE_MISMATCH", "O tamanho enviado não corresponde à sessão de upload.", 400);
      if (actualChecksum !== attachment.checksum) throw new ApiError("ATTACHMENT_CHECKSUM_MISMATCH", "O checksum enviado não corresponde ao conteúdo recebido.", 400);
      const detected = detectedMime(bytes);
      const suspicious = bytes.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
      const scanMode = process.env.STORAGE_SCAN_MODE ?? "local";
      const scanStatus = scanMode === "external" ? "PENDING" as const : suspicious || detected !== attachment.detectedMime ? "QUARANTINED" as const : "CLEAN" as const;
      await storage.put(attachment.storageKey, bytes);
      const updated = { ...attachment, uploadStatus: "UPLOADED" as const, scanStatus, detectedMime: detected ?? "application/octet-stream" };
      await store.transaction((state) => ({ state: { ...state, attachments: state.attachments.map((entry) => entry.id === attachment.id ? updated : entry) }, result: { attachment: updated } }));
      return { attachment: publicAttachment(updated) };
    },

    async finalizeAttachment(actor: User, attachmentId: string, input: CommandMeta): Promise<AttachmentFinalizationResult> {
      const scope = "POST:/attachments/finalize";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<AttachmentFinalizationResult>(originalState, currentActor.id, scope, input.idempotencyKey, { attachmentId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const attachment = attachmentFor(originalState, attachmentId);
        const version = findOrThrow(originalState.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
        const result = resultFor(originalState, version.resultId);
        const view = resultView(originalState, result);
        requirePermission(currentActor, "attachment.finalize", { departmentCode: view.service.departmentCode });
        if (attachment.uploadStatus !== "UPLOADED") throw new ApiError("INVALID_STATE_TRANSITION", "O arquivo ainda não foi enviado.", 409);
        if (attachment.expiresAt && new Date(attachment.expiresAt).getTime() < Date.now()) throw new ApiError("UPLOAD_EXPIRED", "A sessão de upload expirou.", 409);
        if (attachment.scanStatus === "PENDING") throw new ApiError("SCAN_UNAVAILABLE", "A varredura de segurança ainda não foi concluída.", 422, { retryable: true });
        if (attachment.scanStatus !== "CLEAN") throw new ApiError("ATTACHMENT_QUARANTINED", "O arquivo foi colocado em quarentena e não pode ser anexado.", 422);
        const finalized = { ...attachment, uploadStatus: "FINALIZED" as const };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, attachments: originalState.attachments.map((entry) => entry.id === attachment.id ? finalized : entry), auditEvents: [...originalState.auditEvents, createAudit("AttachmentFinalized", currentActor.id, "Attachment", attachment.id, correlationId, "UPLOADED", "FINALIZED", { resultVersionId: version.id })], outbox: [...originalState.outbox, createOutbox("AttachmentFinalized", "Attachment", attachment.id, correlationId, { resultVersionId: version.id })] };
        const resultPayload = { attachment: publicAttachment(finalized) };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, resultPayload, { attachmentId, input }), result: resultPayload };
      });
    },

    async downloadAttachment(actor: User, attachmentId: string): Promise<{ attachment: Attachment; content: Buffer }> {
      const state = store.getState();
      const attachment = attachmentFor(state, attachmentId);
      const version = findOrThrow(state.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
      const result = resultFor(state, version.resultId);
      const view = resultView(state, result);
      requirePermission(actor, "attachment.download", { patientId: view.request.patientId, departmentCode: view.service.departmentCode });
      if (attachment.uploadStatus !== "FINALIZED" || attachment.scanStatus !== "CLEAN") throw new ApiError("NOT_FOUND", "Anexo não disponível.", 404);
      try {
        return { attachment, content: await storage.get(attachment.storageKey) };
      } catch {
        throw new ApiError("STORAGE_UNAVAILABLE", "O conteúdo do anexo não está disponível.", 503, { retryable: true });
      }
    },

    async listServices(actor: User) {
      const state = store.getState();
      requirePermission(actor, "service.catalog.view", {});
      return state.services.filter((service) => service.active).map((service) => ({
        id: service.id,
        code: service.code,
        name: service.name,
        category: service.category,
        departmentCode: service.departmentCode,
        workflowType: service.workflowType,
        requiresSample: service.requiresSample,
        requiresSchedule: service.requiresSchedule,
        allowsAttachment: service.allowsAttachment,
        resultSchema: service.resultSchema,
        slaHours: { ...service.slaHours },
        version: service.version
      }));
    },

    async createDiagnosticService(actor: User, input: DiagnosticServiceCreateInput) {
      const scope = "POST:/diagnostic-services";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<DiagnosticService>(originalState, currentActor.id, scope, input.idempotencyKey, { input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        requirePermission(currentActor, "service.catalog.manage", { departmentCode: input.departmentCode });
        const code = requireText(input.code, "code", 60).toUpperCase();
        if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(code)) throw new ApiError("VALIDATION_ERROR", "Código de serviço inválido.", 400);
        if (originalState.services.some((service) => service.code === code)) throw new ApiError("CONFLICT", "Código de serviço já utilizado.", 409);
        const service: DiagnosticService = {
          id: id("service"),
          code,
          name: requireText(input.name, "name", 120),
          category: input.category,
          departmentCode: requireText(input.departmentCode, "departmentCode", 60).toUpperCase(),
          workflowType: input.workflowType,
          requiresSample: input.requiresSample,
          requiresSchedule: input.requiresSchedule,
          allowsAttachment: input.allowsAttachment,
          active: true,
          resultSchema: input.resultSchema,
          slaHours: validatedSlaHours(input.slaHours),
          version: 1
        };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, services: [...originalState.services, service], auditEvents: [...originalState.auditEvents, createAudit("DiagnosticServiceCreated", currentActor.id, "DiagnosticService", service.id, correlationId, undefined, "ACTIVE", { code: service.code, workflowType: service.workflowType })] };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, service, { input }), result: service };
      });
    },

    async updateDiagnosticService(actor: User, serviceId: string, input: DiagnosticServicePatchInput) {
      const scope = "PATCH:/diagnostic-services";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<DiagnosticService>(originalState, currentActor.id, scope, input.idempotencyKey, { serviceId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const service = findOrThrow(originalState.services.find((entry) => entry.id === serviceId));
        requirePermission(currentActor, "service.catalog.manage", { departmentCode: service.departmentCode });
        ensureExpectedVersion(service.version, input.expectedVersion);
        const updated: DiagnosticService = {
          ...service,
          name: input.name === undefined ? service.name : requireText(input.name, "name", 120),
          active: input.active ?? service.active,
          allowsAttachment: input.allowsAttachment ?? service.allowsAttachment,
          slaHours: input.slaHours ? validatedSlaHours(input.slaHours) : { ...service.slaHours },
          version: service.version + 1
        };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, services: originalState.services.map((entry) => entry.id === service.id ? updated : entry), auditEvents: [...originalState.auditEvents, createAudit("DiagnosticServiceUpdated", currentActor.id, "DiagnosticService", service.id, correlationId, String(service.version), String(updated.version), { active: updated.active, allowsAttachment: updated.allowsAttachment })] };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, updated, { serviceId, input }), result: updated };
      });
    },

    async createReasonCode(actor: User, input: ReasonCodeCreateInput) {
      const scope = "POST:/reason-codes";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ReasonCode>(originalState, currentActor.id, scope, input.idempotencyKey, { input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        requirePermission(currentActor, "reason_code.manage", {});
        const code = requireText(input.code, "code", 60).toUpperCase();
        if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(code)) throw new ApiError("VALIDATION_ERROR", "Código de motivo inválido.", 400);
        if (originalState.reasonCodes.some((reason) => reason.type === input.type && reason.code === code)) throw new ApiError("CONFLICT", "Motivo já utilizado para este tipo.", 409);
        const reason: ReasonCode = { id: id("reason"), type: input.type, code, label: requireText(input.label, "label", 160), active: true, version: 1 };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, reasonCodes: [...originalState.reasonCodes, reason], auditEvents: [...originalState.auditEvents, createAudit("ReasonCodeCreated", currentActor.id, "ReasonCode", reason.id, correlationId, undefined, "ACTIVE", { type: reason.type, code: reason.code })] };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, reason, { input }), result: reason };
      });
    },

    async updateReasonCode(actor: User, reasonId: string, input: ReasonCodePatchInput) {
      const scope = "PATCH:/reason-codes";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency<ReasonCode>(originalState, currentActor.id, scope, input.idempotencyKey, { reasonId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const reason = findOrThrow(originalState.reasonCodes.find((entry) => entry.id === reasonId));
        requirePermission(currentActor, "reason_code.manage", {});
        ensureExpectedVersion(reason.version, input.expectedVersion);
        const updated: ReasonCode = { ...reason, label: input.label === undefined ? reason.label : requireText(input.label, "label", 160), active: input.active ?? reason.active, version: reason.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, reasonCodes: originalState.reasonCodes.map((entry) => entry.id === reason.id ? updated : entry), auditEvents: [...originalState.auditEvents, createAudit("ReasonCodeUpdated", currentActor.id, "ReasonCode", reason.id, correlationId, String(reason.version), String(updated.version), { active: updated.active })] };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, updated, { reasonId, input }), result: updated };
      });
    },

    async listPatients(actor: User, query = "") {
      const state = store.getState();
      requirePermission(actor, "patient.view", {});
      const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
      return state.patients
        .filter((patient) => actor.role === "ADMIN" || actor.role === "MANAGER" || actor.patientIds?.includes(patient.id) || (isExecutorRole(actor) && hasServicePatientContext(state, actor, patient.id)))
        .filter((patient) => !normalizedQuery || [patient.displayName, patient.externalId, patient.species, patient.ownerLabel].some((field) => field.toLocaleLowerCase("pt-BR").includes(normalizedQuery)))
        .map((patient) => ({ ...patient }));
    },

    async getPatient(actor: User, patientId: string) {
      const state = store.getState();
      const patient = findOrThrow(state.patients.find((entry) => entry.id === patientId));
      requirePatientPermission(state, actor, "patient.view", patient.id);
      return patient;
    },

    async getEncounter(actor: User, encounterId: string) {
      const state = store.getState();
      const encounter = findOrThrow(state.encounters.find((entry) => entry.id === encounterId));
      requirePatientPermission(state, actor, "encounter.view", encounter.patientId);
      return encounter;
    },

    async getAdmission(actor: User, admissionId: string): Promise<Admission> {
      const state = store.getState();
      const admission = findOrThrow(state.admissions.find((entry) => entry.id === admissionId));
      const encounter = findOrThrow(state.encounters.find((entry) => entry.id === admission.encounterId));
      requirePatientPermission(state, actor, "admission.view", encounter.patientId);
      return admission;
    },

    async listRequests(actor: User, filters: { status?: ItemState; departmentCode?: string; limit?: number; cursor?: string } = {}) {
      const state = store.getState();
      requirePermission(actor, "request.list", {});
      const limit = Math.min(Math.max(filters.limit ?? DEFAULT_PAGE_SIZE, 1), 100);
      const offset = filters.cursor ? Number.parseInt(Buffer.from(filters.cursor, "base64url").toString("utf8"), 10) || 0 : 0;
      const requests = state.requests
        .filter((request) => request.itemIds.some((itemId) => {
          const item = itemFor(state, itemId);
          const service = serviceFor(state, item.serviceId);
          const visibleByPatient = actor.role === "ADMIN" || actor.role === "MANAGER" || Boolean(actor.patientIds?.includes(request.patientId));
          const visibleByService = ["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(actor.role) && service.departmentCode === actor.departmentCode;
          return (visibleByPatient || visibleByService) && (!filters.status || item.status === filters.status) && (!filters.departmentCode || item.departmentCode === filters.departmentCode);
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const page = requests.slice(offset, offset + limit).map((request) => requestViewForActor(state, actor, request));
      const nextCursor = offset + limit < requests.length ? Buffer.from(String(offset + limit)).toString("base64url") : undefined;
      return { items: page, nextCursor, limit, total: requests.length };
    },

    async listNotifications(actor: User, filter: "ALL" | "UNREAD" | "ACTIONABLE" | "CRITICAL" = "ALL") {
      const state = store.getState();
      requirePermission(actor, "notification.view", {});
      return state.notifications
        .filter((notification) => notification.recipientUserId === actor.id)
        .filter((notification) => filter === "ALL" || (filter === "UNREAD" && notification.state !== "SEEN" && notification.state !== "ACKNOWLEDGED") || (filter === "ACTIONABLE" && notification.category === "ACTIONABLE") || (filter === "CRITICAL" && notification.category === "CRITICAL"))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async acknowledgeNotification(actor: User, notificationId: string, input: CommandMeta) {
      const scope = "POST:/notifications/acknowledge";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        const idempotent = withIdempotency(originalState, currentActor.id, scope, input.idempotencyKey, { notificationId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const notification = findOrThrow(originalState.notifications.find((entry) => entry.id === notificationId));
        if (notification.recipientUserId !== currentActor.id && currentActor.role !== "MANAGER" && currentActor.role !== "ADMIN") throw new ApiError("NOT_FOUND", "Notificação não encontrada.", 404);
        const acknowledgedAt = now();
        const updated = { ...notification, state: "ACKNOWLEDGED" as const, acknowledgedAt, acknowledgedBy: currentActor.id };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, notifications: originalState.notifications.map((entry) => entry.id === notification.id ? updated : entry), auditEvents: [...originalState.auditEvents, createAudit("NotificationAcknowledged", currentActor.id, "Notification", notification.id, correlationId, notification.state, "ACKNOWLEDGED", {})] };
        const result = updated;
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { notificationId, input }), result };
      });
    },

    async listQueue(actor: User, departmentCode: string, filters: { status?: ItemState; overdue?: boolean; limit?: number } = {}) {
      const state = store.getState();
      requirePermission(actor, "queue.view", { departmentCode });
      if (actor.role !== "ADMIN" && actor.role !== "MANAGER" && actor.departmentCode !== departmentCode) throw new ApiError("NOT_FOUND", "Fila não encontrada.", 404);
      const currentTime = Date.now();
      const priorityRank: Record<Priority, number> = { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 };
      const items = state.items
        .filter((item) => item.departmentCode === departmentCode)
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => filters.overdue === undefined || (new Date(item.dueAt).getTime() < currentTime && !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status)) === filters.overdue)
        .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.dueAt.localeCompare(right.dueAt))
        .slice(0, Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, 100));
      return items.map((item) => {
        const request = requestFor(state, item.requestId);
        const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
        const service = serviceFor(state, item.serviceId);
        return { ...item, requestId: request.id, requestCode: request.requestCode, patient: { id: patient.id, displayName: patient.displayName, species: patient.species, sex: patient.sex, externalId: patient.externalId }, service: { id: service.id, code: service.code, name: service.name }, overdue: new Date(item.dueAt).getTime() < currentTime && !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status), nextAction: nextActionFor(item, service) };
      });
    },

    async search(actor: User, query: string, limit = DEFAULT_PAGE_SIZE) {
      const normalized = query.trim().toLocaleLowerCase("pt-BR");
      if (normalized.length < 2) throw new ApiError("VALIDATION_ERROR", "Digite pelo menos 2 caracteres ou use um protocolo completo.", 400);
      const state = store.getState();
      requirePermission(actor, "search.execute", {});
      const results = state.requests.flatMap((request) => {
        const items = request.itemIds.map((itemId) => itemFor(state, itemId));
        const visible = items.some((item) => {
          const service = serviceFor(state, item.serviceId);
          return actor.role === "ADMIN" || actor.role === "MANAGER" || actor.patientIds?.includes(request.patientId) || (["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(actor.role) && service.departmentCode === actor.departmentCode);
        });
        if (!visible) return [];
        const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
        const visibleItems = isExecutorRole(actor) ? items.filter((item) => item.departmentCode === actor.departmentCode) : items;
        const searchableFields = [request.requestCode, patient.displayName, patient.externalId, ...visibleItems.map((item) => serviceFor(state, item.serviceId).name), ...visibleItems.flatMap((item) => state.samples.filter((sample) => sample.itemIds.includes(item.id)).map((sample) => sample.accessionCode))];
        if (!searchableFields.some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized))) return [];
        return [{ type: "REQUEST", id: request.id, label: request.requestCode, patient: patient.displayName, status: request.aggregateStatus, deepLink: `/requests/${request.id}` }];
      });
      return results.slice(0, Math.min(limit, 100));
    },

    async timeline(actor: User, requestId?: string, itemId?: string) {
      const state = store.getState();
      const item = itemId ? itemFor(state, itemId) : undefined;
      const request = requestId ? requestFor(state, requestId) : item ? requestFor(state, item.requestId) : undefined;
      if (!request) throw new ApiError("VALIDATION_ERROR", "Informe requestId ou itemId.", 400);
      requireRequestPermission(state, actor, "timeline.view", request);
      const visibleItemIds = isExecutorRole(actor) ? request.itemIds.filter((itemId) => itemFor(state, itemId).departmentCode === actor.departmentCode) : request.itemIds;
      const entityIds = new Set([request.id, ...visibleItemIds, ...(item ? [item.id] : [])]);
      return state.auditEvents.filter((event) => entityIds.has(event.entityId)).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    },

    async dashboard(actor: User) {
      const state = store.getState();
      requirePermission(actor, "dashboard.view", { departmentCode: actor.departmentCode });
      const visibleItems = state.items.filter((item) => {
        const request = requestFor(state, item.requestId);
        const service = serviceFor(state, item.serviceId);
        return actor.role === "ADMIN" || actor.role === "MANAGER" || actor.patientIds?.includes(request.patientId) || (["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(actor.role) && service.departmentCode === actor.departmentCode);
      });
      const overdue = visibleItems.filter((item) => new Date(item.dueAt).getTime() < Date.now() && !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status)).length;
      const recollections = visibleItems.filter((item) => item.status === "RECOLLECTION_REQUIRED").length;
      const newResults = visibleItems.filter((item) => ["RESULT_AVAILABLE", "REVIEWED"].includes(item.status)).length;
      const critical = state.notifications.filter((notification) => notification.recipientUserId === actor.id && notification.category === "CRITICAL" && notification.state !== "ACKNOWLEDGED").length;
      return { overdue, recollections, newResults, critical, totalActive: visibleItems.filter((item) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status)).length, updatedAt: now() };
    }
  };
}

function nextActionFor(item: DiagnosticItem, service: DiagnosticService): string {
  if (item.status === "REQUESTED" && service.requiresSample) return "Receber amostra";
  if (item.status === "REQUESTED" && service.requiresSchedule) return "Agendar exame";
  if (item.status === "REQUESTED") return "Encaminhar paciente";
  if (item.status === "RECEIVED") return "Iniciar processamento";
  if (item.status === "IN_PROGRESS") return service.workflowType === "LABORATORY" ? "Registrar resultado" : "Marcar exame realizado";
  if (item.status === "AWAITING_REPORT") return "Produzir laudo";
  if (item.status === "RESULT_AVAILABLE") return "Revisar resultado";
  if (item.status === "RECOLLECTION_REQUIRED") return "Aguardar nova coleta";
  return "Acompanhar item";
}
