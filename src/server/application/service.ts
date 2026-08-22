import { createHash, createHmac, randomUUID } from "node:crypto";
import { ITEM_STATES, PRIORITIES, ROLES } from "@cvg/contracts";
import type { ItemState, Permission, Priority, RoleCode, WorkflowType } from "@cvg/contracts";
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
import { canAccessResource, managerCanAccessDepartment, managerDepartmentCodes } from "../security/authorization";
import { ApiError } from "../http/envelope";
import { createFileStoreFromEnv, type FileStore } from "../storage/file-store";
import { hashPassword } from "../security/password";

export interface CommandMeta {
  idempotencyKey?: string;
  expectedVersion?: number;
  correlationId?: string;
}

export interface NotificationAcknowledgeInput extends CommandMeta {
  reason: string;
  confirm: true;
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
  category?: DiagnosticService["category"];
  departmentCode?: string;
  workflowType?: WorkflowType;
  requiresSample?: boolean;
  requiresSchedule?: boolean;
  active?: boolean;
  allowsAttachment?: boolean;
  resultSchema?: DiagnosticService["resultSchema"];
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

export interface UserRoleUpdateInput extends CommandMeta {
  role: RoleCode;
  departmentCode: string;
  managedDepartmentCodes?: string[];
  active?: boolean;
  reason: string;
  confirm: true;
}

export interface ManagedUserCreateInput extends CommandMeta {
  email: string;
  displayName: string;
  password: string;
  role: RoleCode;
  departmentCode: string;
  managedDepartmentCodes?: string[];
  timezone: string;
  reason: string;
  confirm: true;
}

export interface ManagedUserDeactivateInput extends CommandMeta {
  reason: string;
  confirm: true;
}

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: RoleCode;
  departmentCode: string;
  managedDepartmentCodes?: ReadonlyArray<string>;
  timezone: string;
  active: boolean;
  createdAt: string;
  version: number;
}

export interface ManagementOverview {
  asOf: string;
  scope: { departments: string[]; label: string };
  summary: {
    totalRequests: number;
    activeItems: number;
    overdue: number;
    recollections: number;
    newResults: number;
    critical: number;
    pendingRequests: number;
    completedToday: number;
  };
  departments: Array<{
    departmentCode: string;
    serviceCount: number;
    totalRequests: number;
    activeItems: number;
    overdue: number;
    pending: number;
  }>;
  pending: Array<{
    id: string;
    requestId: string;
    requestCode: string;
    patient: string;
    service: string;
    departmentCode: string;
    status: ItemState;
    priority: Priority;
    dueAt: string;
    overdue: boolean;
    nextAction: string;
    deepLink: string;
  }>;
  recentRequests: Array<{
    id: string;
    requestCode: string;
    patient: string;
    aggregateStatus: DiagnosticRequest["aggregateStatus"];
    priority: Priority;
    updatedAt: string;
    itemCount: number;
    deepLink: string;
  }>;
}

export type DashboardIndicatorKey = "overdue" | "recollections" | "newResults" | "critical" | "totalActive";

export interface DashboardIndicator {
  key: DashboardIndicatorKey;
  label: string;
  count: number;
  denominator: number;
  denominatorDefinition: string;
  definition: string;
  nextAction: string;
}

export interface DashboardWindow {
  kind: "CURRENT_STATE";
  label: "Estado atual";
  timezone: string;
  asOf: string;
}

export interface DashboardView {
  overdue: number;
  recollections: number;
  newResults: number;
  critical: number;
  totalActive: number;
  updatedAt: string;
  window: DashboardWindow;
  indicators: DashboardIndicator[];
}

export interface RequestListFilters {
  status?: ItemState;
  departmentCode?: string;
  priority?: Priority;
  serviceId?: string;
  overdue?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export type SearchResultType = "REQUEST" | "ITEM";

export interface SearchFilters {
  types?: SearchResultType[];
  status?: ItemState;
  departmentCode?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface SearchResult {
  type: SearchResultType;
  id: string;
  label: string;
  patient: string;
  status: ItemState | DiagnosticRequest["aggregateStatus"];
  priority: Priority;
  updatedAt: string;
  departmentCode: string;
  deepLink: string;
}

export interface TimelineFilters {
  limit?: number;
  cursor?: string;
}

export interface TimelineResult {
  items: AuditEvent[];
  nextCursor?: string;
  limit: number;
  total: number;
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
type PublicAttachment = Omit<Attachment, "storageKey" | "uploadClaimToken" | "uploadClaimExpiresAt">;
type AttachmentSessionResult = { attachment: PublicAttachment; uploadUrl: string; expiresAt: string };
type AttachmentFinalizationResult = { attachment: PublicAttachment };
type PatientDiagnosticsResult = {
  patient: StoreState["patients"][number];
  items: RequestView[];
  events: AuditEvent[];
  nextCursor?: string;
  limit: number;
  total: number;
};
type ReportView = ResultView & { attachments: PublicAttachment[] };

const MAX_NOTE_LENGTH = 2000;
const MAX_RESULT_NARRATIVE_LENGTH = 20000;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 25;
const ALLOWED_ATTACHMENT_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

const INDICATOR_DEFINITIONS: Record<DashboardIndicatorKey, Omit<DashboardIndicator, "key" | "count" | "denominator">> = {
  overdue: {
    label: "Atrasados",
    denominatorDefinition: "itens ativos visíveis no escopo autorizado",
    definition: "Itens não terminais cujo prazo calculado pelo servidor já passou.",
    nextAction: "Abrir a fila e tratar por prioridade e SLA."
  },
  recollections: {
    label: "Recoletas",
    denominatorDefinition: "itens laboratoriais visíveis no escopo autorizado",
    definition: "Itens laboratoriais que aguardam uma nova amostra após recoleta solicitada.",
    nextAction: "Receber a nova amostra ou acompanhar o item."
  },
  newResults: {
    label: "Resultados novos",
    denominatorDefinition: "itens visíveis no escopo autorizado",
    definition: "Itens com resultado liberado que ainda aguardam revisão.",
    nextAction: "Abrir e revisar o resultado autorizado."
  },
  critical: {
    label: "Críticos",
    denominatorDefinition: "notificações críticas do usuário, confirmadas ou não",
    definition: "Notificações críticas do usuário que ainda não estão confirmadas.",
    nextAction: "Abrir a notificação e seguir a política crítica aprovada."
  },
  totalActive: {
    label: "Ativos",
    denominatorDefinition: "itens visíveis no escopo autorizado",
    definition: "Itens não terminais atualmente visíveis no escopo autorizado.",
    nextAction: "Abrir a fila e acompanhar os itens ativos."
  }
};

function criticalPolicyIsReady(): boolean {
  if (process.env.CRITICAL_POLICY_ENABLED !== "true") return false;
  if (!process.env.CRITICAL_POLICY_VERSION?.trim() || !process.env.CRITICAL_POLICY_APPROVAL_REF?.trim()) return false;
  return Boolean(process.env.CRITICAL_POLICY_APPROVED_AT && !Number.isNaN(Date.parse(process.env.CRITICAL_POLICY_APPROVED_AT)));
}

function now(): string {
  return new Date().toISOString();
}

function dashboardTimezone(actor: User): string {
  const candidate = actor.timezone?.trim() || process.env.APP_TIMEZONE?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

function managedUser(user: User): ManagedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    departmentCode: user.departmentCode,
    managedDepartmentCodes: user.managedDepartmentCodes ? [...user.managedDepartmentCodes] : undefined,
    timezone: user.timezone,
    active: user.active !== false,
    createdAt: user.createdAt,
    version: user.version
  };
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
  return createHash("sha256").update(stableSerialize(idempotencyFingerprint(value))).digest("hex");
}

function idempotencyFingerprint(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  const input = payload.input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) return payload;
  const semanticInput = Object.fromEntries(Object.entries(input as Record<string, unknown>)
    .filter(([key]) => key !== "correlationId" && key !== "idempotencyKey")
    .map(([key, entry]) => {
      if (key !== "password" || typeof entry !== "string") return [key, entry];
      const secret = process.env.SESSION_SECRET;
      if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
        throw new Error("SESSION_SECRET deve conter ao menos 32 caracteres em produção.");
      }
      const digest = secret
        ? createHmac("sha256", secret).update(entry).digest("hex")
        : createHash("sha256").update(entry).digest("hex");
      return [key, { confidentialDigest: digest }];
    }));
  return { ...payload, input: semanticInput };
}

function requireText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > maxLength) {
    throw new ApiError("VALIDATION_ERROR", `${field} é obrigatório e deve ter no máximo ${maxLength} caracteres.`, 400);
  }
  return normalized;
}

const operationalManagedRoles: RoleCode[] = ["VETERINARIAN", "INPATIENT_TEAM", "LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM", "VIEWER"];

function canManageUserTarget(actor: User, role: RoleCode, departmentCode: string): boolean {
  if (actor.role === "ADMIN") return true;
  return actor.role === "MANAGER" && operationalManagedRoles.includes(role) && managerCanAccessDepartment(actor, departmentCode);
}

function normalizedEmail(value: string): string {
  const email = requireText(value, "email", 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("VALIDATION_ERROR", "O e-mail informado é inválido.", 400);
  return email;
}

function validatedTimezone(value: string): string {
  const timezone = requireText(value, "timezone", 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new ApiError("VALIDATION_ERROR", "O fuso horário informado é inválido.", 400);
  }
  return timezone;
}

function validatedPassword(value: string): string {
  if (typeof value !== "string" || Array.from(value).length < 12 || Array.from(value).length > 200 || !/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new ApiError("VALIDATION_ERROR", "A senha deve ter pelo menos 12 caracteres, letras e números.", 400);
  }
  return value;
}

function normalizedManagedDepartments(value: string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (value.length > 20) throw new ApiError("VALIDATION_ERROR", "O colaborador não pode ter mais de 20 setores delegados.", 400);
  const normalized = Array.from(new Set(value.map((code) => requireText(code, "managedDepartmentCode", 60).toUpperCase())));
  if (normalized.some((code) => !/^[A-Z0-9_-]{1,60}$/.test(code))) throw new ApiError("VALIDATION_ERROR", "Um setor delegado é inválido.", 400);
  return normalized;
}

function revokeUserSessions(state: StoreState, userId: string): StoreState["sessions"] {
  const revokedAt = now();
  return state.sessions.map((session) => session.userId === userId && !session.revokedAt
    ? { ...session, revokedAt, version: session.version + 1 }
    : session);
}

function requireRecentReauthentication(actor: User): void {
  const reauthenticatedAt = actor.reauthenticatedAt ? Date.parse(actor.reauthenticatedAt) : Number.NaN;
  if (Number.isNaN(reauthenticatedAt) || Date.now() - reauthenticatedAt > 10 * 60 * 1000 || reauthenticatedAt > Date.now() + 30_000) {
    throw new ApiError("REAUTH_REQUIRED", "Confirme sua identidade novamente antes de alterar acessos.", 403, { retryable: true });
  }
}

function requireActiveUser(state: StoreState, actor: User): User {
  const current = state.users.find((user) => user.id === actor.id);
  const session = actor.sessionId ? state.sessions.find((entry) => entry.id === actor.sessionId && entry.userId === actor.id) : undefined;
  if (
    !current
    || !current.active
    || current.version !== actor.version
    || current.role !== actor.role
    || current.departmentCode !== actor.departmentCode
    || (actor.sessionId !== undefined && (!session || session.revokedAt !== undefined || Date.parse(session.expiresAt) <= Date.now()))
  ) {
    throw new ApiError("UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);
  }
  const narrowed = (persisted: readonly string[] | undefined, asserted: readonly string[] | undefined): string[] | undefined => asserted === undefined
    ? persisted ? [...persisted] : undefined
    : (persisted ?? []).filter((entry) => asserted.includes(entry));
  return {
    ...current,
    managedDepartmentCodes: narrowed(current.managedDepartmentCodes, actor.managedDepartmentCodes),
    patientIds: narrowed(current.patientIds, actor.patientIds),
    serviceCodes: narrowed(current.serviceCodes, actor.serviceCodes),
    sessionId: actor.sessionId,
    reauthenticatedAt: session?.reauthenticatedAt ?? actor.reauthenticatedAt
  };
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

function hasManagerRequestContext(state: StoreState, actor: User, request: DiagnosticRequest): boolean {
  return managerCanAccessDepartment(actor, request.requestingDepartmentCode) || request.itemIds.some((itemId) => managerCanAccessDepartment(actor, itemFor(state, itemId).departmentCode));
}

function hasManagerPatientContext(state: StoreState, actor: User, patientId: string): boolean {
  return state.requests.some((request) => request.patientId === patientId && hasManagerRequestContext(state, actor, request));
}

function requirePatientPermission(state: StoreState, actor: User, permission: Permission, patientId: string): void {
  if (isExecutorRole(actor)) {
    if (!hasServicePatientContext(state, actor, patientId)) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
    requirePermission(actor, permission, { departmentCode: actor.departmentCode });
    return;
  }
  if (actor.role === "MANAGER") {
    if (!hasManagerPatientContext(state, actor, patientId)) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
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
    if (!hasManagerRequestContext(state, actor, request)) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
    requirePermission(actor, permission, { departmentCode: actor.departmentCode });
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
  notification: Omit<Notification, "id" | "createdAt" | "attempts" | "state" | "version">
): StoreState {
  if (state.notifications.some((item) => item.dedupeKey === notification.dedupeKey && item.recipientUserId === notification.recipientUserId)) {
    return state;
  }
  const nextNotification: Notification = {
    ...notification,
    id: id("notification"),
    createdAt: now(),
    attempts: 0,
    state: "DELIVERED",
    version: 1
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
  if (!key?.trim() || Array.from(key).length > 200) {
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

function validateServiceDefinition(category: DiagnosticService["category"], workflowType: WorkflowType): void {
  const valid = (category === "LABORATORY" && workflowType === "LABORATORY") || (category === "IMAGING" && ["RADIOLOGY", "ULTRASOUND"].includes(workflowType));
  if (!valid) throw new ApiError("VALIDATION_ERROR", "Categoria e workflow do serviço não são compatíveis.", 400);
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
  const {
    storageKey: _storageKey,
    uploadClaimToken: _uploadClaimToken,
    uploadClaimExpiresAt: _uploadClaimExpiresAt,
    ...safeAttachment
  } = attachment;
  return safeAttachment;
}

async function deleteStoredObject(storage: FileStore, storageKey: string): Promise<void> {
  if (storage.delete) {
    await storage.delete(storageKey);
    return;
  }
  await storage.remove(storageKey);
}

async function releaseUploadClaim(store: StateStore, attachmentId: string, claimToken: string): Promise<void> {
  await store.transaction((state) => {
    const attachment = state.attachments.find((entry) => entry.id === attachmentId);
    if (!attachment || attachment.uploadClaimToken !== claimToken) return { state, result: undefined };
    const released = { ...attachment, uploadClaimToken: undefined, uploadClaimExpiresAt: undefined };
    return {
      state: {
        ...state,
        attachments: state.attachments.map((entry) => entry.id === attachment.id ? released : entry)
      },
      result: undefined
    };
  });
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

function requireAttachmentOwner(actor: User, version: ResultVersion, attachment?: Attachment): void {
  if (version.authorId !== actor.id || (attachment && attachment.createdBy !== actor.id)) {
    throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
  }
}

function attachmentSessionIsExpired(attachment: Attachment, at = Date.now()): boolean {
  return attachment.uploadStatus !== "FINALIZED"
    && attachment.expiresAt !== undefined
    && Date.parse(attachment.expiresAt) < at;
}

function attachmentUploadClaimIsActive(attachment: Attachment, at = Date.now()): boolean {
  return attachment.uploadClaimToken !== undefined
    && (attachment.uploadClaimExpiresAt === undefined || Date.parse(attachment.uploadClaimExpiresAt) > at);
}

function attachmentStorageKeys(attachment: Attachment): string[] {
  const claimedStorageKey = attachment.uploadClaimToken
    ? `${attachment.storageKey}.claim-${attachment.uploadClaimToken}`
    : undefined;
  return [...new Set([attachment.storageKey, claimedStorageKey].filter((key): key is string => key !== undefined))];
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
  if (!isExecutorRole(actor) && actor.role !== "MANAGER") return view;
  const items = view.items.filter((item) => actor.role === "MANAGER" ? managerCanAccessDepartment(actor, item.departmentCode) : item.departmentCode === actor.departmentCode);
  return { ...view, itemIds: items.map((item) => item.id), items };
}

function canViewRequest(state: StoreState, actor: User, request: DiagnosticRequest): boolean {
  if (actor.role === "ADMIN") return false;
  if (isExecutorRole(actor)) {
    return request.itemIds.some((itemId) => itemFor(state, itemId).departmentCode === actor.departmentCode);
  }
  if (actor.role === "MANAGER") {
    return hasManagerRequestContext(state, actor, request) && canAccessResource(actor, "request.view", { departmentCode: request.requestingDepartmentCode });
  }
  return Boolean(actor.patientIds?.includes(request.patientId)) && canAccessResource(actor, "request.view", { patientId: request.patientId });
}

function requestForAuditEvent(state: StoreState, event: AuditEvent): DiagnosticRequest | undefined {
  if (event.entityType === "DiagnosticRequest") return state.requests.find((request) => request.id === event.entityId);
  if (event.entityType === "DiagnosticRequestItem") {
    const item = state.items.find((entry) => entry.id === event.entityId);
    return item ? state.requests.find((request) => request.id === item.requestId) : undefined;
  }
  if (event.entityType === "Sample") {
    const sample = state.samples.find((entry) => entry.id === event.entityId);
    return sample ? state.requests.find((request) => request.id === sample.requestId) : undefined;
  }
  if (event.entityType === "Result" || event.entityType === "ResultVersion") {
    const resultId = event.entityType === "Result"
      ? event.entityId
      : state.resultVersions.find((version) => version.id === event.entityId)?.resultId;
    const result = resultId ? state.results.find((entry) => entry.id === resultId) : undefined;
    const item = result ? state.items.find((entry) => entry.id === result.itemId) : undefined;
    return item ? state.requests.find((request) => request.id === item.requestId) : undefined;
  }
  if (event.entityType === "Procedure" || event.entityType === "ProcedureSchedule") {
    const procedureId = event.entityType === "Procedure" ? event.entityId : state.schedules.find((schedule) => schedule.id === event.entityId)?.procedureId;
    const procedure = procedureId ? state.procedures.find((entry) => entry.id === procedureId) : undefined;
    const item = procedure ? state.items.find((entry) => entry.id === procedure.itemId) : undefined;
    return item ? state.requests.find((request) => request.id === item.requestId) : undefined;
  }
  if (event.entityType === "Attachment") {
    const attachment = state.attachments.find((entry) => entry.id === event.entityId);
    const resultVersion = attachment ? state.resultVersions.find((version) => version.id === attachment.resultVersionId) : undefined;
    const result = resultVersion ? state.results.find((entry) => entry.id === resultVersion.resultId) : undefined;
    const item = result ? state.items.find((entry) => entry.id === result.itemId) : undefined;
    return item ? state.requests.find((request) => request.id === item.requestId) : undefined;
  }
  return undefined;
}

function auditEventItem(state: StoreState, event: AuditEvent): DiagnosticItem | undefined {
  const itemId = auditEventItemIds(state, event)[0];
  return itemId ? state.items.find((item) => item.id === itemId) : undefined;
}

function auditEventItemIds(state: StoreState, event: AuditEvent): string[] {
  if (event.entityType === "DiagnosticRequestItem") return state.items.some((item) => item.id === event.entityId) ? [event.entityId] : [];
  if (event.entityType === "Sample") return state.samples.find((entry) => entry.id === event.entityId)?.itemIds ?? [];
  let itemId: string | undefined;
  if (event.entityType === "Result") itemId = state.results.find((result) => result.id === event.entityId)?.itemId;
  if (event.entityType === "ResultVersion") {
    const resultId = state.resultVersions.find((version) => version.id === event.entityId)?.resultId;
    itemId = resultId ? state.results.find((result) => result.id === resultId)?.itemId : undefined;
  }
  if (event.entityType === "Procedure") itemId = state.procedures.find((procedure) => procedure.id === event.entityId)?.itemId;
  if (event.entityType === "ProcedureSchedule") {
    const procedureId = state.schedules.find((schedule) => schedule.id === event.entityId)?.procedureId;
    itemId = procedureId ? state.procedures.find((procedure) => procedure.id === procedureId)?.itemId : undefined;
  }
  if (event.entityType === "Attachment") {
    const attachment = state.attachments.find((entry) => entry.id === event.entityId);
    const resultVersion = attachment ? state.resultVersions.find((version) => version.id === attachment.resultVersionId) : undefined;
    const result = resultVersion ? state.results.find((entry) => entry.id === resultVersion.resultId) : undefined;
    itemId = result?.itemId;
  }
  return itemId && state.items.some((item) => item.id === itemId) ? [itemId] : [];
}

function auditEventDepartmentCode(state: StoreState, event: AuditEvent): string | undefined {
  return auditEventItem(state, event)?.departmentCode;
}

function canViewManagementAudit(state: StoreState, actor: User, event: AuditEvent): boolean {
  if (actor.role !== "MANAGER") return false;
  if (event.entityType === "ReasonCode") return true;
  if (event.entityType === "DiagnosticService") {
    const service = state.services.find((entry) => entry.id === event.entityId);
    return Boolean(service && managerCanAccessDepartment(actor, service.departmentCode));
  }
  if (event.entityType === "User") {
    const user = state.users.find((entry) => entry.id === event.entityId);
    return Boolean(user && canManageUserTarget(actor, user.role, user.departmentCode));
  }
  return false;
}

function requestForNotification(state: StoreState, notification: Notification): DiagnosticRequest | undefined {
  if (notification.entityType === "REQUEST") return state.requests.find((request) => request.id === notification.entityId);
  if (notification.entityType === "ITEM") {
    const item = state.items.find((entry) => entry.id === notification.entityId);
    return item ? state.requests.find((request) => request.id === item.requestId) : undefined;
  }
  if (notification.entityType === "SAMPLE") {
    const sample = state.samples.find((entry) => entry.id === notification.entityId);
    return sample ? state.requests.find((request) => request.id === sample.requestId) : undefined;
  }
  const version = state.resultVersions.find((entry) => entry.id === notification.entityId);
  const result = version ? state.results.find((entry) => entry.id === version.resultId) : undefined;
  const item = result ? state.items.find((entry) => entry.id === result.itemId) : undefined;
  return item ? state.requests.find((request) => request.id === item.requestId) : undefined;
}

interface SearchCursor {
  rank: number;
  updatedAt: string;
  id: string;
}

interface TimelineCursor {
  occurredAt: string;
  id: string;
}

interface RequestCursor {
  createdAt: string;
  id: string;
}

interface AuditCursor {
  occurredAt: string;
  id: string;
}

function decodeKeysetCursor<T>(cursor: string | undefined, valid: (value: Record<string, unknown>) => boolean): T | undefined {
  if (!cursor) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) || !valid(decoded as Record<string, unknown>)) throw new Error("invalid");
    return decoded as T;
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Cursor inválido.", 400);
  }
}

function decodeSearchCursor(cursor: string | undefined): SearchCursor | undefined {
  return decodeKeysetCursor<SearchCursor>(cursor, (value) => Number.isSafeInteger(value.rank) && Number(value.rank) >= 0 && Number(value.rank) <= 2 && typeof value.updatedAt === "string" && !Number.isNaN(Date.parse(value.updatedAt)) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 200);
}

function decodeTimelineCursor(cursor: string | undefined): TimelineCursor | undefined {
  return decodeKeysetCursor<TimelineCursor>(cursor, (value) => typeof value.occurredAt === "string" && !Number.isNaN(Date.parse(value.occurredAt)) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 200);
}

function decodeRequestCursor(cursor: string | undefined): RequestCursor | undefined {
  return decodeKeysetCursor<RequestCursor>(cursor, (value) => typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt)) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 200);
}

function decodeAuditCursor(cursor: string | undefined): AuditCursor | undefined {
  return decodeKeysetCursor<AuditCursor>(cursor, (value) => typeof value.occurredAt === "string" && !Number.isNaN(Date.parse(value.occurredAt)) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 200);
}

function encodeKeysetCursor(value: SearchCursor | TimelineCursor | RequestCursor | AuditCursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function pageSize(value: number | undefined): number {
  const resolved = value ?? DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > 100) throw new ApiError("VALIDATION_ERROR", "O limite deve ser um inteiro entre 1 e 100.", 400);
  return resolved;
}

function dateFilter(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!value || value.length > 100 || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)) {
    throw new ApiError("VALIDATION_ERROR", `O filtro ${field} é inválido.`, 400);
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) throw new ApiError("VALIDATION_ERROR", `O filtro ${field} é inválido.`, 400);
  return timestamp;
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

function visibleResultVersions(state: StoreState, resultId: string): ResultVersion[] {
  return state.resultVersions
    .filter((version) => version.resultId === resultId && ["RELEASED", "SUPERSEDED"].includes(version.status))
    .sort((left, right) => right.sequence - left.sequence);
}

function requireCurrentResultRead(actor: User, view: ResultView): "ResultRead" | "ResultDraftRead" {
  const resource = {
    patientId: view.request.patientId,
    departmentCode: view.service.departmentCode,
    serviceCode: view.service.code
  };
  if (view.version.status === "DRAFT") {
    const draftResource = {
      ...resource,
      ownerId: view.version.authorId
    };
    if (!canAccessResource(actor, "result.draft.edit_own", draftResource)) {
      throw new ApiError("NOT_FOUND", "Resultado não disponível.", 404);
    }
    return "ResultDraftRead";
  }
  if (view.version.status !== "RELEASED") {
    throw new ApiError("NOT_FOUND", "Resultado não disponível.", 404);
  }
  requirePermission(actor, "result.view", resource);
  return "ResultRead";
}

function ensureExpectedVersion(actual: number, expectedVersion: number | undefined): void {
  if (expectedVersion === undefined) {
    throw new ApiError("VALIDATION_ERROR", "expectedVersion ou If-Match é obrigatório para esta operação.", 400);
  }
  if (actual !== expectedVersion) {
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
        if (meta.allowDuplicateOverride) requireIdempotencyKey(meta.idempotencyKey);
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
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const request = requestFor(state, requestId);
      requireRequestPermission(state, currentActor, "request.view", request);
      return requestViewForActor(state, currentActor, request);
    },

    async getPatientDiagnostics(actor: User, patientId: string, filters: { limit?: number; cursor?: string } = {}): Promise<PatientDiagnosticsResult> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const patient = findOrThrow(state.patients.find((entry) => entry.id === patientId));
      const limit = pageSize(filters.limit);
      requirePatientPermission(state, currentActor, "patient.view", patient.id);
      requirePatientPermission(state, currentActor, "diagnostic.timeline.view", patient.id);
      const cursor = decodeRequestCursor(filters.cursor);
      const requests = state.requests
        .filter((request) => request.patientId === patient.id && canViewRequest(state, currentActor, request))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
      const afterCursor = cursor ? requests.filter((request) => request.createdAt < cursor.createdAt || (request.createdAt === cursor.createdAt && request.id > cursor.id)) : requests;
      const pageRequests = afterCursor.slice(0, limit);
      const page = pageRequests.map((request) => requestViewForActor(state, currentActor, request));
      const visibleRequestIds = new Set(requests.map((request) => request.id));
      const visibleItemIds = new Set(requests.flatMap((request) => request.itemIds));
      const events = state.auditEvents
        .filter((event) => {
          const request = requestForAuditEvent(state, event);
          return request?.patientId === patient.id && (visibleRequestIds.has(request.id) || (event.entityType === "DiagnosticRequestItem" && visibleItemIds.has(event.entityId)));
        })
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
      const last = pageRequests.at(-1);
      const nextCursor = last && pageRequests.length < afterCursor.length ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id }) : undefined;
      return { patient: { ...patient }, items: page, events, nextCursor, limit, total: requests.length };
    },

    async getItem(actor: User, itemId: string): Promise<ItemView> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const item = itemFor(state, itemId);
      const request = requestFor(state, item.requestId);
      const service = serviceFor(state, item.serviceId);
      if (isExecutorRole(currentActor)) {
        requirePermission(currentActor, "item.view", { departmentCode: service.departmentCode });
      } else if (currentActor.role === "MANAGER") {
        if (!hasManagerRequestContext(state, currentActor, request) || service.departmentCode !== currentActor.departmentCode) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este recurso.", 404);
        requirePermission(currentActor, "item.view", { departmentCode: service.departmentCode });
      } else {
        requirePermission(currentActor, "item.view", { patientId: request.patientId, departmentCode: request.requestingDepartmentCode });
      }
      const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
      return { item, request: requestViewForActor(state, currentActor, request), patient, service };
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
        requirePermission(currentActor, "sample.receive", { departmentCode: serviceItems[0].service.departmentCode });
        items.forEach((item) => ensureExpectedVersion(item.version, input.expectedVersion));
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
        linkedItems.forEach((item) => ensureExpectedVersion(item.version, input.expectedVersion));
        if (sample.status !== "RECEIVED") throw new ApiError("INVALID_STATE_TRANSITION", "A amostra não está disponível para recoleta.", 409);
        const reason = findOrThrow(originalState.reasonCodes.find((entry) => entry.type === "RECOLLECTION" && entry.code === input.reasonCode && entry.active), "VALIDATION_ERROR", "Motivo de recoleta inválido.");
        const rejectionNote = input.note ? requireText(input.note, "note", MAX_NOTE_LENGTH) : undefined;
        const rejectedSample: Sample = { ...sample, status: "REJECTED", rejectionCode: reason.code, rejectionNote, version: sample.version + 1 };
        const replacement: Sample = { id: id("sample"), requestId: request.id, accessionCode: `PENDING-${randomUUID().slice(0, 8).toUpperCase()}`, sampleType: sample.sampleType, status: "EXPECTED", replacesSampleId: sample.id, itemIds: [...sample.itemIds], version: 1 };
        const updatedItems = linkedItems.map((item) => ({ ...item, status: transitionItem(item.status, "RECOLLECTION_REQUIRED", item.workflowType), currentSampleId: replacement.id, version: item.version + 1 }));
        let nextState = nextRequestState({ ...originalState, samples: [...originalState.samples.filter((entry) => entry.id !== sample.id), rejectedSample, replacement] }, request, updatedItems);
        const requester = findOrThrow(originalState.users.find((user) => user.id === request.requesterId));
        const correlationId = input.correlationId ?? id("corr");
        const notification: Omit<Notification, "id" | "createdAt" | "attempts" | "state" | "version"> = { category: "ACTIONABLE", priority: "HIGH", recipientUserId: requester.id, entityType: "SAMPLE", entityId: replacement.id, deepLink: `/requests/${request.id}`, title: "Nova coleta necessária", body: `${requester.displayName}, a amostra ${sample.accessionCode} precisa ser recolhida: ${reason.label}.`, dedupeKey: `recollection:${sample.id}:${replacement.id}` };
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
        const guardedItems = expected.itemIds.map((itemId) => itemFor(originalState, itemId));
        guardedItems.forEach((item) => ensureExpectedVersion(item.version, input.expectedVersion));
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
        ensureExpectedVersion(item.version, input.expectedVersion);
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
        ensureExpectedVersion(request.version, input.expectedVersion);
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
        requireIdempotencyKey(input.idempotencyKey);
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
        requirePermission(currentActor, "result.draft.create", { departmentCode: service.departmentCode, serviceCode: service.code });
        ensureExpectedVersion(item.version, input.expectedVersion);
        if (!["IN_PROGRESS", "AWAITING_REPORT", "RESULT_VOIDED"].includes(item.status)) {
          throw new ApiError("RESULT_RELEASE_BLOCKED", "O item ainda não está pronto para receber um resultado.", 422);
        }
        const narrative = requireText(input.narrative, "narrative", MAX_RESULT_NARRATIVE_LENGTH);
        const itemResults = originalState.results.filter((entry) => entry.itemId === item.id);
        if (itemResults.length > 1) {
          throw new ApiError("INVALID_STATE_TRANSITION", "O item possui mais de uma linhagem de resultado e exige reconciliação.", 409);
        }
        const existingResult = itemResults[0];
        if (existingResult && (
          item.currentResultId !== existingResult.id ||
          item.status !== "RESULT_VOIDED" ||
          existingResult.lifecycleStatus !== "VOIDED"
        )) {
          throw new ApiError("INVALID_STATE_TRANSITION", "Já existe um draft ou resultado para este item.", 409);
        }
        const previousVersion = existingResult ? resultView(originalState, existingResult).version : undefined;
        if (previousVersion && previousVersion.status !== "VOIDED") {
          throw new ApiError("INVALID_STATE_TRANSITION", "Já existe um draft ou resultado para este item.", 409);
        }
        const versionId = id("result-version");
        const resultId = existingResult?.id ?? id("result");
        const version: ResultVersion = {
          id: versionId,
          resultId,
          sequence: (previousVersion?.sequence ?? 0) + 1,
          status: "DRAFT",
          content: { ...input.content },
          narrative,
          conclusion: input.conclusion?.trim(),
          authorId: currentActor.id,
          createdAt: now(),
          ...(previousVersion ? { supersedesId: previousVersion.id } : {}),
          critical: false,
          needsReReview: false,
          version: 1
        };
        const result: Result = existingResult
          ? { ...existingResult, currentVersionId: version.id, lifecycleStatus: "DRAFT", needsReReview: false, version: existingResult.version + 1 }
          : { id: resultId, itemId, currentVersionId: version.id, lifecycleStatus: "DRAFT", needsReReview: false, version: 1 };
        const updatedItem = {
          ...item,
          currentResultId: result.id,
          status: item.status === "RESULT_VOIDED" ? transitionItem(item.status, "IN_PROGRESS", item.workflowType) : item.status,
          version: item.version + 1
        };
        const correlationId = input.correlationId ?? id("corr");
        const nextResults = existingResult
          ? originalState.results.map((entry) => entry.id === result.id ? result : entry)
          : [...originalState.results, result];
        let nextState = nextRequestState({ ...originalState, results: nextResults, resultVersions: [...originalState.resultVersions, version] }, request, [updatedItem]);
        nextState = { ...nextState, auditEvents: [...nextState.auditEvents, createAudit(previousVersion ? "ReplacementResultDraftCreated" : "ResultDraftCreated", currentActor.id, "Result", result.id, correlationId, previousVersion?.status, "DRAFT", { itemId, versionId: version.id })] };
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
        requirePermission(currentActor, "result.draft.edit_own", { departmentCode: view.service.departmentCode, serviceCode: view.service.code, ownerId: view.version.authorId });
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
        requirePermission(currentActor, "result.release", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
        ensureExpectedVersion(result.version, input.expectedVersion);
        if (view.version.status !== "DRAFT") throw new ApiError("INVALID_STATE_TRANSITION", "Somente um draft pode ser liberado.", 409);
        const releaseCheckTime = Date.now();
        const blockedAttachments = originalState.attachments.filter((attachment) =>
          attachment.resultVersionId === view.version.id
          && (attachment.uploadStatus !== "FINALIZED" || attachment.scanStatus !== "CLEAN")
          && (
            !attachmentSessionIsExpired(attachment, releaseCheckTime)
            || attachmentUploadClaimIsActive(attachment, releaseCheckTime)
          )
        );
        if (blockedAttachments.length > 0) throw new ApiError("RESULT_RELEASE_BLOCKED", "Finalize ou remova os anexos pendentes antes de liberar o resultado.", 422, { retryable: true });
        if (input.critical && !criticalPolicyIsReady()) {
          throw new ApiError("CRITICAL_POLICY_MISSING", "A política de resultado crítico ainda não foi aprovada/ativada.", 422);
        }
        const expiredAttachments = originalState.attachments.filter((attachment) =>
          attachment.resultVersionId === view.version.id
          && attachmentSessionIsExpired(attachment, releaseCheckTime)
          && !attachmentUploadClaimIsActive(attachment, releaseCheckTime)
        );
        const expiredAttachmentIds = new Set(expiredAttachments.map((attachment) => attachment.id));
        const retainedAttachments = originalState.attachments.filter((attachment) => !expiredAttachmentIds.has(attachment.id));
        const retainedStorageKeys = new Set(retainedAttachments.flatMap(attachmentStorageKeys));
        const expiredStorageKeys = [...new Set(expiredAttachments.flatMap(attachmentStorageKeys))]
          .filter((storageKey) => !retainedStorageKeys.has(storageKey));
        // Storage and state persistence cannot share a commit. Delete first so a storage
        // failure preserves metadata; a later state rollback also preserves only expired,
        // non-finalized metadata, and retrying safely repeats the idempotent object delete.
        try {
          for (const storageKey of expiredStorageKeys) await deleteStoredObject(storage, storageKey);
        } catch {
          throw new ApiError("STORAGE_UNAVAILABLE", "Não foi possível remover os anexos expirados do armazenamento privado.", 503, { retryable: true });
        }
        const releaseState: StoreState = expiredAttachments.length === 0 ? originalState : {
          ...originalState,
          attachments: retainedAttachments,
          auditEvents: [
            ...originalState.auditEvents,
            ...expiredAttachments.map((attachment) => createAudit(
              "AttachmentUploadSessionExpired",
              currentActor.id,
              "Attachment",
              attachment.id,
              input.correlationId ?? id("corr"),
              attachment.uploadStatus,
              "EXPIRED",
              { resultVersionId: view.version.id }
            ))
          ]
        };
        const releasedAt = now();
        const releasedVersion: ResultVersion = { ...view.version, status: "RELEASED", releasedAt, releasedBy: currentActor.id, critical: input.critical === true, version: view.version.version + 1 };
        const releasedResult: Result = { ...result, lifecycleStatus: "RELEASED", currentVersionId: releasedVersion.id, version: result.version + 1 };
        const releasedItem = { ...view.item, status: transitionItem(view.item.status, "RESULT_AVAILABLE", view.item.workflowType), releasedAt, version: view.item.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        let nextState = nextRequestState({ ...releaseState, results: releaseState.results.map((entry) => entry.id === result.id ? releasedResult : entry), resultVersions: releaseState.resultVersions.map((entry) => entry.id === view.version.id ? releasedVersion : entry) }, view.request, [releasedItem]);
        const requester = findOrThrow(releaseState.users.find((user) => user.id === view.request.requesterId));
        const notification: Omit<Notification, "id" | "createdAt" | "attempts" | "state" | "version"> = { category: releasedVersion.critical ? "CRITICAL" : "ACTIONABLE", priority: releasedVersion.critical ? "URGENT" : "HIGH", recipientUserId: requester.id, entityType: "RESULT_VERSION", entityId: releasedVersion.id, deepLink: `/results/${result.id}`, title: releasedVersion.critical ? "Resultado crítico requer confirmação" : "Resultado disponível", body: `${view.patient.displayName} · ${view.service.name} · versão ${releasedVersion.sequence} liberada.`, dedupeKey: `release:${releasedVersion.id}:${requester.id}` };
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
        requirePermission(currentActor, "result.amend", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
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
        requirePermission(currentActor, "result.void", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
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
        const resource = { patientId: view.request.patientId, departmentCode: view.service.departmentCode, serviceCode: view.service.code };
        requirePermission(currentActor, "result.view", resource);
        requirePermission(currentActor, "result.view.record", resource);
        ensureExpectedVersion(view.item.version, input.expectedVersion);
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
        requirePermission(currentActor, "result.review", { patientId: view.request.patientId, departmentCode: view.service.departmentCode, serviceCode: view.service.code });
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
      return store.transaction((state) => {
        const currentActor = requireActiveUser(state, actor);
        const result = resultFor(state, resultId);
        const view = resultView(state, result);
        const eventType = requireCurrentResultRead(currentActor, view);
        const response = { ...view, request: requestViewForActor(state, currentActor, view.request) };
        const audit = createAudit(eventType, currentActor.id, "ResultVersion", view.version.id, id("corr"), undefined, undefined, { resultId: result.id });
        return { state: { ...state, auditEvents: [...state.auditEvents, audit] }, result: response };
      });
    },

    async getReport(actor: User, reportId: string): Promise<ReportView> {
      return store.transaction((state) => {
        const currentActor = requireActiveUser(state, actor);
        const result = resultFor(state, reportId);
        const view = resultView(state, result);
        requireCurrentResultRead(currentActor, view);
        requirePermission(currentActor, "attachment.view", { patientId: view.request.patientId, departmentCode: view.service.departmentCode, serviceCode: view.service.code });
        const attachments = state.attachments
          .filter((attachment) => attachment.resultVersionId === view.version.id)
          .map(publicAttachment);
        const response = { ...view, request: requestViewForActor(state, currentActor, view.request), attachments };
        const audit = createAudit("ReportRead", currentActor.id, "ResultVersion", view.version.id, id("corr"), undefined, undefined, { resultId: result.id, attachmentCount: attachments.length });
        return { state: { ...state, auditEvents: [...state.auditEvents, audit] }, result: response };
      });
    },

    async listResultVersions(actor: User, resultId: string): Promise<ResultVersion[]> {
      return store.transaction((state) => {
        const currentActor = requireActiveUser(state, actor);
        const result = resultFor(state, resultId);
        const view = resultView(state, result);
        requirePermission(currentActor, "result.history.view", { patientId: view.request.patientId, departmentCode: view.service.departmentCode, serviceCode: view.service.code });
        const versions = visibleResultVersions(state, result.id);
        if (versions.length === 0) throw new ApiError("NOT_FOUND", "Resultado não disponível.", 404);
        const audit = createAudit("ResultHistoryRead", currentActor.id, "Result", result.id, id("corr"), undefined, undefined, { versionCount: versions.length });
        return { state: { ...state, auditEvents: [...state.auditEvents, audit] }, result: versions };
      });
    },

    async createAttachmentUploadSession(actor: User, versionId: string, input: AttachmentUploadInput): Promise<AttachmentSessionResult> {
      const scope = "POST:/attachments/upload-session";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        const idempotent = withIdempotency<AttachmentSessionResult>(originalState, currentActor.id, scope, input.idempotencyKey, { versionId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const version = findOrThrow(originalState.resultVersions.find((entry) => entry.id === versionId));
        const result = resultFor(originalState, version.resultId);
        const view = resultView(originalState, result);
        const metadata = assertAttachmentMetadata(input);
        requirePermission(currentActor, "attachment.upload_session", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
        requireAttachmentOwner(currentActor, version);
        ensureExpectedVersion(version.version, input.expectedVersion);
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

    async authorizeAttachmentUpload(actor: User, attachmentId: string): Promise<{ sizeBytes: number }> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const attachment = attachmentFor(state, attachmentId);
      const version = findOrThrow(state.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
      const result = resultFor(state, version.resultId);
      const view = resultView(state, result);
      requirePermission(currentActor, "attachment.finalize", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
      requireAttachmentOwner(currentActor, version, attachment);
      if (attachment.uploadStatus !== "INITIATED") throw new ApiError("INVALID_STATE_TRANSITION", "A sessão de upload não está aberta.", 409);
      if (attachmentSessionIsExpired(attachment)) throw new ApiError("UPLOAD_EXPIRED", "A sessão de upload expirou.", 409);
      return { sizeBytes: attachment.sizeBytes };
    },

    async uploadAttachment(actor: User, attachmentId: string, content: Uint8Array): Promise<AttachmentFinalizationResult> {
      const bytes = Buffer.from(content);
      const detected = detectedMime(bytes);
      const suspicious = bytes.includes(Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"));
      const scanMode = process.env.STORAGE_SCAN_MODE ?? "local";
      const claimToken = randomUUID();
      const claimed = await store.transaction((state) => {
        const currentActor = requireActiveUser(state, actor);
        const attachment = attachmentFor(state, attachmentId);
        const version = findOrThrow(state.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
        const result = resultFor(state, version.resultId);
        const view = resultView(state, result);
        requirePermission(currentActor, "attachment.finalize", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
        requireAttachmentOwner(currentActor, version, attachment);
        if (attachment.uploadStatus !== "INITIATED") throw new ApiError("INVALID_STATE_TRANSITION", "A sessão de upload não está aberta.", 409);
        if (attachment.expiresAt && new Date(attachment.expiresAt).getTime() < Date.now()) throw new ApiError("UPLOAD_EXPIRED", "A sessão de upload expirou.", 409);
        if (attachment.uploadClaimToken && (!attachment.uploadClaimExpiresAt || Date.parse(attachment.uploadClaimExpiresAt) > Date.now())) {
          throw new ApiError("UPLOAD_IN_PROGRESS", "Este anexo já está sendo enviado.", 409);
        }
        const actualChecksum = createHash("sha256").update(bytes).digest("hex");
        if (bytes.byteLength !== attachment.sizeBytes) throw new ApiError("ATTACHMENT_SIZE_MISMATCH", "O tamanho enviado não corresponde à sessão de upload.", 400);
        if (actualChecksum !== attachment.checksum) throw new ApiError("ATTACHMENT_CHECKSUM_MISMATCH", "O checksum enviado não corresponde ao conteúdo recebido.", 400);
        const storageKey = `${attachment.storageKey}.claim-${claimToken}`;
        const claimedAttachment = { ...attachment, uploadClaimToken: claimToken, uploadClaimExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
        return {
          state: {
            ...state,
            attachments: state.attachments.map((entry) => entry.id === attachment.id ? claimedAttachment : entry)
          },
          result: { attachment, storageKey }
        };
      });
      const scanStatus = scanMode === "external" ? "PENDING" as const : suspicious || detected !== claimed.attachment.detectedMime ? "QUARANTINED" as const : "CLEAN" as const;
      try {
        await storage.put(claimed.storageKey, bytes);
      } catch {
        await deleteStoredObject(storage, claimed.storageKey).catch(() => undefined);
        await releaseUploadClaim(store, attachmentId, claimToken).catch(() => undefined);
        throw new ApiError("STORAGE_UNAVAILABLE", "O armazenamento privado não está disponível.", 503, { retryable: true });
      }
      try {
        const updated = await store.transaction((state) => {
          const currentActor = requireActiveUser(state, actor);
          const attachment = attachmentFor(state, attachmentId);
          const version = findOrThrow(state.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
          const result = resultFor(state, version.resultId);
          const view = resultView(state, result);
          requirePermission(currentActor, "attachment.finalize", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
          requireAttachmentOwner(currentActor, version, attachment);
          if (attachment.uploadStatus !== "INITIATED" || attachment.uploadClaimToken !== claimToken) {
            throw new ApiError("UPLOAD_CLAIM_LOST", "A sessão de upload foi alterada durante o envio.", 409, { retryable: true });
          }
          if (attachment.expiresAt && Date.parse(attachment.expiresAt) < Date.now()) {
            throw new ApiError("UPLOAD_EXPIRED", "A sessão de upload expirou.", 409);
          }
          const committed: Attachment = {
            ...attachment,
            storageKey: claimed.storageKey,
            uploadStatus: "UPLOADED",
            scanStatus,
            detectedMime: detected ?? "application/octet-stream",
            uploadClaimToken: undefined,
            uploadClaimExpiresAt: undefined
          };
          return {
            state: {
              ...state,
              attachments: state.attachments.map((entry) => entry.id === attachment.id ? committed : entry)
            },
            result: committed
          };
        });
        return { attachment: publicAttachment(updated) };
      } catch (error) {
        let authoritativeState: StoreState;
        try {
          authoritativeState = await store.readState();
        } catch {
          throw error;
        }
        const committed = authoritativeState.attachments.find((entry) =>
          entry.id === attachmentId && entry.storageKey === claimed.storageKey && entry.uploadStatus !== "INITIATED"
        );
        if (committed) return { attachment: publicAttachment(committed) };
        const storageKeyIsReferenced = authoritativeState.attachments.some((entry) => entry.storageKey === claimed.storageKey);
        if (!storageKeyIsReferenced) await deleteStoredObject(storage, claimed.storageKey).catch(() => undefined);
        await releaseUploadClaim(store, attachmentId, claimToken).catch(() => undefined);
        throw error;
      }
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
        requirePermission(currentActor, "attachment.finalize", { departmentCode: view.service.departmentCode, serviceCode: view.service.code });
        requireAttachmentOwner(currentActor, version, attachment);
        ensureExpectedVersion(version.version, input.expectedVersion);
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
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const attachment = attachmentFor(state, attachmentId);
      const version = findOrThrow(state.resultVersions.find((entry) => entry.id === attachment.resultVersionId));
      const result = resultFor(state, version.resultId);
      const view = resultView(state, result);
      const resource = { patientId: view.request.patientId, departmentCode: view.service.departmentCode, serviceCode: view.service.code };
      requirePermission(currentActor, "attachment.download", resource);
      requirePermission(currentActor, "attachment.view", resource);
      if (!["RELEASED", "SUPERSEDED"].includes(version.status)) throw new ApiError("NOT_FOUND", "Anexo não disponível.", 404);
      if (attachment.uploadStatus !== "FINALIZED" || attachment.scanStatus !== "CLEAN") throw new ApiError("NOT_FOUND", "Anexo não disponível.", 404);
      let content: Buffer;
      try {
        content = await storage.get(attachment.storageKey);
      } catch {
        throw new ApiError("STORAGE_UNAVAILABLE", "O conteúdo do anexo não está disponível.", 503, { retryable: true });
      }
      if (content.byteLength !== attachment.sizeBytes || createHash("sha256").update(content).digest("hex") !== attachment.checksum) {
        throw new ApiError("ATTACHMENT_INTEGRITY_FAILED", "A integridade do anexo armazenado não pôde ser confirmada.", 503, { retryable: false });
      }
      const auditedAttachment = await store.transaction((currentState) => {
        const auditedActor = requireActiveUser(currentState, currentActor);
        const currentAttachment = attachmentFor(currentState, attachment.id);
        const currentVersion = findOrThrow(currentState.resultVersions.find((entry) => entry.id === currentAttachment.resultVersionId));
        const currentResult = resultFor(currentState, currentVersion.resultId);
        const currentView = resultView(currentState, currentResult);
        const currentResource = { patientId: currentView.request.patientId, departmentCode: currentView.service.departmentCode, serviceCode: currentView.service.code };
        requirePermission(auditedActor, "attachment.download", currentResource);
        requirePermission(auditedActor, "attachment.view", currentResource);
        if (!["RELEASED", "SUPERSEDED"].includes(currentVersion.status) || currentAttachment.uploadStatus !== "FINALIZED" || currentAttachment.scanStatus !== "CLEAN") {
          throw new ApiError("NOT_FOUND", "Anexo não disponível.", 404);
        }
        const audit = createAudit("AttachmentDownloaded", auditedActor.id, "Attachment", currentAttachment.id, id("corr"), undefined, undefined, { resultVersionId: currentVersion.id });
        if (content.byteLength !== currentAttachment.sizeBytes || createHash("sha256").update(content).digest("hex") !== currentAttachment.checksum) {
          throw new ApiError("ATTACHMENT_INTEGRITY_FAILED", "A integridade do anexo armazenado não pôde ser confirmada.", 503, { retryable: false });
        }
        return { state: { ...currentState, auditEvents: [...currentState.auditEvents, audit] }, result: currentAttachment };
      });
      return { attachment: auditedAttachment, content };
    },

    async listManagedUsers(actor: User): Promise<ManagedUser[]> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "user_role.manage", {});
      return state.users
        .filter((user) => canManageUserTarget(currentActor, user.role, user.departmentCode))
        .slice()
        .sort((left, right) => left.displayName.localeCompare(right.displayName, "pt-BR"))
        .map(managedUser);
    },

    async updateUserRole(actor: User, userId: string, input: UserRoleUpdateInput): Promise<ManagedUser> {
      const scope = "POST:/users/roles";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        requirePermission(currentActor, "user_role.manage", {});
        requireRecentReauthentication(currentActor);
        if (input.expectedVersion === undefined) throw new ApiError("VALIDATION_ERROR", "expectedVersion é obrigatório para alterar uma role.", 400);
        if (input.confirm !== true) throw new ApiError("VALIDATION_ERROR", "A confirmação explícita da alteração é obrigatória.", 400);
        if (typeof input.reason !== "string") throw new ApiError("VALIDATION_ERROR", "reason é obrigatório para alterar uma role.", 400);
        const reason = requireText(input.reason, "reason", 500);
        const idempotent = withIdempotency<ManagedUser>(originalState, currentActor.id, scope, input.idempotencyKey, { userId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        if (currentActor.id === userId) throw new ApiError("VALIDATION_ERROR", "A própria sessão não pode alterar seu role.", 400);
        if (!ROLES.includes(input.role)) throw new ApiError("VALIDATION_ERROR", "O role informado é inválido.", 400);
        const departmentCode = requireText(input.departmentCode, "departmentCode", 60).toUpperCase();
        if (!/^[A-Z0-9_-]{1,60}$/.test(departmentCode)) throw new ApiError("VALIDATION_ERROR", "O departamento informado é inválido.", 400);
        const target = findOrThrow(originalState.users.find((user) => user.id === userId));
        if (!canManageUserTarget(currentActor, target.role, target.departmentCode) || !canManageUserTarget(currentActor, input.role, departmentCode)) {
          throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este colaborador.", 404);
        }
        ensureExpectedVersion(target.version, input.expectedVersion);
        const managedDepartmentCodes = input.role === "MANAGER"
          ? input.managedDepartmentCodes === undefined ? target.managedDepartmentCodes : normalizedManagedDepartments(input.managedDepartmentCodes)
          : undefined;
        if (input.role !== "MANAGER" && input.managedDepartmentCodes?.length) throw new ApiError("VALIDATION_ERROR", "Somente MANAGER pode ter setores delegados.", 400);
        const nextActive = input.active ?? target.active;
        if (target.role === "ADMIN" && target.active && !nextActive && originalState.users.filter((user) => user.active && user.role === "ADMIN" && user.id !== target.id).length === 0) {
          throw new ApiError("CONFLICT", "O último administrador ativo não pode ser desativado.", 409);
        }
        const updated: User = { ...target, role: input.role, departmentCode, managedDepartmentCodes, active: nextActive, version: target.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = {
          ...originalState,
          users: originalState.users.map((user) => user.id === target.id ? updated : user),
          sessions: revokeUserSessions(originalState, target.id),
          auditEvents: [...originalState.auditEvents, createAudit("UserRoleUpdated", currentActor.id, "User", target.id, correlationId, `${target.role}:${target.departmentCode}:${target.active}`, `${updated.role}:${updated.departmentCode}:${updated.active}`, { reason, managedDepartmentCodes: managedDepartmentCodes?.join(",") ?? "" })]
        };
        const result = managedUser(updated);
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { userId, input }), result };
      });
    },

    async createManagedUser(actor: User, input: ManagedUserCreateInput): Promise<ManagedUser> {
      const scope = "POST:/users";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        requirePermission(currentActor, "user_role.manage", {});
        requireRecentReauthentication(currentActor);
        if (input.confirm !== true) throw new ApiError("VALIDATION_ERROR", "A confirmação explícita da criação é obrigatória.", 400);
        const reason = requireText(input.reason, "reason", 500);
        const idempotent = withIdempotency<ManagedUser>(originalState, currentActor.id, scope, input.idempotencyKey, { input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        if (!ROLES.includes(input.role)) throw new ApiError("VALIDATION_ERROR", "O role informado é inválido.", 400);
        const departmentCode = requireText(input.departmentCode, "departmentCode", 60).toUpperCase();
        if (!/^[A-Z0-9_-]{1,60}$/.test(departmentCode)) throw new ApiError("VALIDATION_ERROR", "O departamento informado é inválido.", 400);
        if (!canManageUserTarget(currentActor, input.role, departmentCode)) throw new ApiError("SCOPE_DENIED", "Você não pode provisionar este tipo de colaborador neste setor.", 404);
        const email = normalizedEmail(input.email);
        if (originalState.users.some((user) => user.email.toLowerCase() === email)) throw new ApiError("CONFLICT", "Já existe um colaborador com este e-mail.", 409);
        const displayName = requireText(input.displayName, "displayName", 160);
        const password = validatedPassword(input.password);
        const timezone = validatedTimezone(input.timezone);
        const managedDepartmentCodes = input.role === "MANAGER" ? normalizedManagedDepartments(input.managedDepartmentCodes) : undefined;
        if (input.role !== "MANAGER" && input.managedDepartmentCodes?.length) throw new ApiError("VALIDATION_ERROR", "Somente MANAGER pode ter setores delegados.", 400);
        const user: User = {
          id: id("user"),
          email,
          displayName,
          role: input.role,
          departmentCode,
          passwordHash: hashPassword(password),
          timezone,
          managedDepartmentCodes,
          createdAt: now(),
          version: 1,
          active: true
        };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = {
          ...originalState,
          users: [...originalState.users, user],
          auditEvents: [...originalState.auditEvents, createAudit("UserCreated", currentActor.id, "User", user.id, correlationId, undefined, "ACTIVE", { role: user.role, departmentCode: user.departmentCode, reason })]
        };
        const result = managedUser(user);
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { input }), result };
      });
    },

    async deactivateManagedUser(actor: User, userId: string, input: ManagedUserDeactivateInput): Promise<ManagedUser> {
      const scope = "DELETE:/users";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        requirePermission(currentActor, "user_role.manage", {});
        requireRecentReauthentication(currentActor);
        if (input.confirm !== true) throw new ApiError("VALIDATION_ERROR", "A confirmação explícita da desativação é obrigatória.", 400);
        const reason = requireText(input.reason, "reason", 500);
        const idempotent = withIdempotency<ManagedUser>(originalState, currentActor.id, scope, input.idempotencyKey, { userId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        if (currentActor.id === userId) throw new ApiError("VALIDATION_ERROR", "A própria sessão não pode ser desativada.", 400);
        const target = findOrThrow(originalState.users.find((user) => user.id === userId));
        if (!canManageUserTarget(currentActor, target.role, target.departmentCode)) throw new ApiError("SCOPE_DENIED", "Você não tem acesso a este colaborador.", 404);
        ensureExpectedVersion(target.version, input.expectedVersion);
        if (target.role === "ADMIN" && target.active && originalState.users.filter((user) => user.active && user.role === "ADMIN" && user.id !== target.id).length === 0) {
          throw new ApiError("CONFLICT", "O último administrador ativo não pode ser desativado.", 409);
        }
        const updated: User = { ...target, active: false, version: target.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = {
          ...originalState,
          users: originalState.users.map((user) => user.id === target.id ? updated : user),
          sessions: revokeUserSessions(originalState, target.id),
          auditEvents: [...originalState.auditEvents, createAudit("UserDeactivated", currentActor.id, "User", target.id, correlationId, "ACTIVE", "INACTIVE", { reason })]
        };
        const result = managedUser(updated);
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { userId, input }), result };
      });
    },

    async listServices(actor: User, options: { includeInactive?: boolean } = {}) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const includeInactive = options.includeInactive === true;
      if (includeInactive) requirePermission(currentActor, "service.catalog.manage", {});
      else requirePermission(currentActor, "service.catalog.view", {});
      return state.services
        .filter((service) => currentActor.role !== "MANAGER" || managerCanAccessDepartment(currentActor, service.departmentCode))
        .filter((service) => includeInactive || service.active)
        .map((service) => ({
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
        active: service.active,
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
        validateServiceDefinition(input.category, input.workflowType);
        const departmentCode = requireText(input.departmentCode, "departmentCode", 60).toUpperCase();
        if (!/^[A-Z0-9_-]{1,60}$/.test(departmentCode)) throw new ApiError("VALIDATION_ERROR", "O departamento informado é inválido.", 400);
        const service: DiagnosticService = {
          id: id("service"),
          code,
          name: requireText(input.name, "name", 120),
          category: input.category,
          departmentCode,
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
        const departmentCode = input.departmentCode === undefined ? service.departmentCode : requireText(input.departmentCode, "departmentCode", 60).toUpperCase();
        if (!/^[A-Z0-9_-]{1,60}$/.test(departmentCode)) throw new ApiError("VALIDATION_ERROR", "O departamento informado é inválido.", 400);
        requirePermission(currentActor, "service.catalog.manage", { departmentCode });
        const category = input.category ?? service.category;
        const workflowType = input.workflowType ?? service.workflowType;
        const requiresSample = input.requiresSample ?? service.requiresSample;
        const requiresSchedule = input.requiresSchedule ?? service.requiresSchedule;
        const resultSchema = input.resultSchema ?? service.resultSchema;
        validateServiceDefinition(category, workflowType);
        const structuralChanged = category !== service.category || departmentCode !== service.departmentCode || workflowType !== service.workflowType || requiresSample !== service.requiresSample || requiresSchedule !== service.requiresSchedule || resultSchema !== service.resultSchema;
        if (structuralChanged && originalState.items.some((item) => item.serviceId === service.id)) {
          throw new ApiError("CATALOG_IN_USE", "A estrutura deste serviço já está referenciada por solicitações e não pode ser alterada.", 409);
        }
        const updated: DiagnosticService = {
          ...service,
          name: input.name === undefined ? service.name : requireText(input.name, "name", 120),
          category,
          departmentCode,
          workflowType,
          requiresSample,
          requiresSchedule,
          active: input.active ?? service.active,
          allowsAttachment: input.allowsAttachment ?? service.allowsAttachment,
          resultSchema,
          slaHours: input.slaHours ? validatedSlaHours(input.slaHours) : { ...service.slaHours },
          version: service.version + 1
        };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, services: originalState.services.map((entry) => entry.id === service.id ? updated : entry), auditEvents: [...originalState.auditEvents, createAudit("DiagnosticServiceUpdated", currentActor.id, "DiagnosticService", service.id, correlationId, String(service.version), String(updated.version), { active: updated.active, departmentCode: updated.departmentCode, workflowType: updated.workflowType, allowsAttachment: updated.allowsAttachment })] };
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, updated, { serviceId, input }), result: updated };
      });
    },

    async listReasonCodes(actor: User) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "reason_code.manage", {});
      return state.reasonCodes.map((reason) => ({ ...reason }));
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
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "patient.view", {});
      const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
      if (Array.from(normalizedQuery).length > 200) throw new ApiError("VALIDATION_ERROR", "A busca de pacientes é muito longa.", 400);
      return state.patients
        .filter((patient) => currentActor.role === "MANAGER" ? hasManagerPatientContext(state, currentActor, patient.id) : Boolean(currentActor.patientIds?.includes(patient.id)) || (isExecutorRole(currentActor) && hasServicePatientContext(state, currentActor, patient.id)))
        .filter((patient) => !normalizedQuery || [patient.displayName, patient.externalId, patient.species, patient.ownerLabel].some((field) => field.toLocaleLowerCase("pt-BR").includes(normalizedQuery)))
        .map((patient) => ({ ...patient }))
        .slice(0, 100);
    },

    async listAuditEvents(actor: User, filters: { limit?: number; cursor?: string } = {}) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "audit.view", { departmentCode: currentActor.departmentCode });
      const limit = pageSize(filters.limit);
      const cursor = decodeAuditCursor(filters.cursor);
      const events = state.auditEvents
        .filter((event) => {
          const request = requestForAuditEvent(state, event);
          if (!request) return currentActor.role === "ADMIN" || (currentActor.role === "MANAGER" && canViewManagementAudit(state, currentActor, event));
          const eventDepartmentCode = auditEventDepartmentCode(state, event);
          if (currentActor.role === "MANAGER" && eventDepartmentCode && !managerCanAccessDepartment(currentActor, eventDepartmentCode)) return false;
          return canViewRequest(state, currentActor, request);
        })
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
      const afterCursor = cursor ? events.filter((event) => event.occurredAt < cursor.occurredAt || (event.occurredAt === cursor.occurredAt && event.id > cursor.id)) : events;
      const page = afterCursor.slice(0, limit);
      const items = page.map((event) => ({ ...event, metadata: { ...event.metadata } }));
      const last = page.at(-1);
      const nextCursor = last && page.length < afterCursor.length ? encodeKeysetCursor({ occurredAt: last.occurredAt, id: last.id }) : undefined;
      return { items, nextCursor, limit, total: events.length };
    },

    async getPatient(actor: User, patientId: string) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const patient = findOrThrow(state.patients.find((entry) => entry.id === patientId));
      requirePatientPermission(state, currentActor, "patient.view", patient.id);
      return patient;
    },

    async listEncounters(actor: User, patientId: string) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const patient = findOrThrow(state.patients.find((entry) => entry.id === patientId));
      requirePatientPermission(state, currentActor, "encounter.view", patient.id);
      return state.encounters.filter((encounter) => encounter.patientId === patient.id).map((encounter) => ({ ...encounter }));
    },

    async getEncounter(actor: User, encounterId: string) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const encounter = findOrThrow(state.encounters.find((entry) => entry.id === encounterId));
      requirePatientPermission(state, currentActor, "encounter.view", encounter.patientId);
      return encounter;
    },

    async getAdmission(actor: User, admissionId: string): Promise<Admission> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const admission = findOrThrow(state.admissions.find((entry) => entry.id === admissionId));
      const encounter = findOrThrow(state.encounters.find((entry) => entry.id === admission.encounterId));
      requirePatientPermission(state, currentActor, "admission.view", encounter.patientId);
      return admission;
    },

    async listRequests(actor: User, filters: RequestListFilters = {}) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "request.list", {});
      if (filters.status && !ITEM_STATES.includes(filters.status)) throw new ApiError("VALIDATION_ERROR", "O status informado é inválido.", 400);
      if (filters.priority && !PRIORITIES.includes(filters.priority)) throw new ApiError("VALIDATION_ERROR", "A prioridade informada é inválida.", 400);
      const limit = pageSize(filters.limit);
      const cursor = decodeRequestCursor(filters.cursor);
      const departmentCode = filters.departmentCode?.trim().toUpperCase();
      if (departmentCode && !/^[A-Z0-9_-]{1,60}$/.test(departmentCode)) throw new ApiError("VALIDATION_ERROR", "O departamento informado é inválido.", 400);
      const serviceId = filters.serviceId?.trim();
      if (serviceId && (serviceId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(serviceId))) throw new ApiError("VALIDATION_ERROR", "O serviço informado é inválido.", 400);
      const from = dateFilter(filters.from, "from");
      const to = dateFilter(filters.to, "to");
      if (from !== undefined && to !== undefined && from > to) throw new ApiError("VALIDATION_ERROR", "O intervalo de datas é inválido.", 400);
      const currentTime = Date.now();
      const requests = state.requests
        .filter((request) => (from === undefined || Date.parse(request.createdAt) >= from) && (to === undefined || Date.parse(request.createdAt) <= to))
        .filter((request) => request.itemIds.some((itemId) => {
          const item = itemFor(state, itemId);
          const service = serviceFor(state, item.serviceId);
          const visibleByPatient = canViewRequest(state, currentActor, request) || Boolean(currentActor.patientIds?.includes(request.patientId));
          const visibleByService = ["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(currentActor.role) && service.departmentCode === currentActor.departmentCode;
          const managerItemScope = currentActor.role !== "MANAGER" || managerCanAccessDepartment(currentActor, item.departmentCode);
          const overdue = new Date(item.dueAt).getTime() < currentTime && !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status);
          return (visibleByPatient || visibleByService) && managerItemScope &&
            (!filters.status || item.status === filters.status) &&
            (!departmentCode || item.departmentCode === departmentCode) &&
            (!filters.priority || item.priority === filters.priority) &&
            (!serviceId || item.serviceId === serviceId) &&
            (filters.overdue === undefined || overdue === filters.overdue);
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
      const afterCursor = cursor ? requests.filter((request) => request.createdAt < cursor.createdAt || (request.createdAt === cursor.createdAt && request.id > cursor.id)) : requests;
      const pageRequests = afterCursor.slice(0, limit);
      const page = pageRequests.map((request) => requestViewForActor(state, currentActor, request));
      const last = pageRequests.at(-1);
      const nextCursor = last && pageRequests.length < afterCursor.length ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id }) : undefined;
      return { items: page, nextCursor, limit, total: requests.length };
    },

    async listNotifications(
      actor: User,
      filter: "ALL" | "UNREAD" | "ACTIONABLE" | "CRITICAL" = "ALL",
      options: { cursor?: string; limit?: number } = {}
    ) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "notification.view", {});
      if (!["ALL", "UNREAD", "ACTIONABLE", "CRITICAL"].includes(filter)) throw new ApiError("VALIDATION_ERROR", "O filtro de notificações é inválido.", 400);
      const limit = pageSize(options.limit);
      const cursor = decodeRequestCursor(options.cursor);
      const notifications = state.notifications
        .filter((notification) => notification.recipientUserId === currentActor.id)
        .filter((notification) => filter === "ALL" || (filter === "UNREAD" && notification.state !== "SEEN" && notification.state !== "ACKNOWLEDGED") || (filter === "ACTIONABLE" && notification.category === "ACTIONABLE") || (filter === "CRITICAL" && notification.category === "CRITICAL"))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
      const afterCursor = cursor
        ? notifications.filter((notification) => notification.createdAt < cursor.createdAt || (notification.createdAt === cursor.createdAt && notification.id > cursor.id))
        : notifications;
      const items = afterCursor.slice(0, limit);
      const last = items.at(-1);
      const nextCursor = last && items.length < afterCursor.length ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id }) : undefined;
      return { items, nextCursor, limit, total: notifications.length };
    },

    async acknowledgeNotification(actor: User, notificationId: string, input: NotificationAcknowledgeInput) {
      const scope = "POST:/notifications/acknowledge";
      return store.transaction(async (originalState) => {
        const currentActor = requireActiveUser(originalState, actor);
        requireIdempotencyKey(input.idempotencyKey);
        requirePermission(currentActor, "notification.view", {});
        requirePermission(currentActor, "notification.acknowledge", {});
        if (input.confirm !== true) throw new ApiError("VALIDATION_ERROR", "A confirmação explícita é obrigatória.", 400);
        const reason = requireText(input.reason, "reason", 500);
        const idempotent = withIdempotency(originalState, currentActor.id, scope, input.idempotencyKey, { notificationId, input });
        if (idempotent.found) return { state: originalState, result: idempotent.existing! };
        const notification = findOrThrow(originalState.notifications.find((entry) => entry.id === notificationId));
        ensureExpectedVersion(notification.version, input.expectedVersion);
        if (notification.recipientUserId !== currentActor.id) {
          const request = requestForNotification(originalState, notification);
          if (currentActor.role !== "MANAGER" || !request || !hasManagerRequestContext(originalState, currentActor, request)) throw new ApiError("NOT_FOUND", "Notificação não encontrada.", 404);
        }
        const acknowledgedAt = now();
        const updated = { ...notification, state: "ACKNOWLEDGED" as const, acknowledgedAt, acknowledgedBy: currentActor.id, version: notification.version + 1 };
        const correlationId = input.correlationId ?? id("corr");
        const nextState = { ...originalState, notifications: originalState.notifications.map((entry) => entry.id === notification.id ? updated : entry), auditEvents: [...originalState.auditEvents, createAudit("NotificationAcknowledged", currentActor.id, "Notification", notification.id, correlationId, notification.state, "ACKNOWLEDGED", { reason })] };
        const result = updated;
        return { state: saveIdempotency(nextState, currentActor.id, scope, input.idempotencyKey, result, { notificationId, input }), result };
      });
    },

    async listQueue(actor: User, departmentCode: string, filters: { status?: ItemState; overdue?: boolean; limit?: number } = {}) {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const normalizedDepartment = departmentCode.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,60}$/.test(normalizedDepartment)) throw new ApiError("VALIDATION_ERROR", "O departamento informado é inválido.", 400);
      requirePermission(currentActor, "queue.view", { departmentCode: normalizedDepartment });
      if (currentActor.role !== "MANAGER" && currentActor.departmentCode !== normalizedDepartment) throw new ApiError("NOT_FOUND", "Fila não encontrada.", 404);
      const currentTime = Date.now();
      const priorityRank: Record<Priority, number> = { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 };
      const items = state.items
        .filter((item) => item.departmentCode === normalizedDepartment)
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => filters.overdue === undefined || (new Date(item.dueAt).getTime() < currentTime && !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status)) === filters.overdue)
        .sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.dueAt.localeCompare(right.dueAt))
        .slice(0, pageSize(filters.limit));
      return items.map((item) => {
        const request = requestFor(state, item.requestId);
        const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
        const service = serviceFor(state, item.serviceId);
        return { ...item, requestId: request.id, requestCode: request.requestCode, patient: { id: patient.id, displayName: patient.displayName, species: patient.species, sex: patient.sex, externalId: patient.externalId }, service: { id: service.id, code: service.code, name: service.name }, overdue: new Date(item.dueAt).getTime() < currentTime && !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status), nextAction: nextActionFor(item, service) };
      });
    },

    async search(actor: User, query: string, filters: SearchFilters = {}) {
      const normalized = query.trim().toLocaleLowerCase("pt-BR");
      const boundedLimit = pageSize(filters.limit);
      const cursor = decodeSearchCursor(filters.cursor);
      if (Array.from(normalized).length < 2) throw new ApiError("VALIDATION_ERROR", "Digite pelo menos 2 caracteres ou use um protocolo completo.", 400);
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "search.execute", {});
      if (filters.status && !ITEM_STATES.includes(filters.status)) throw new ApiError("VALIDATION_ERROR", "O status informado é inválido.", 400);
      const departmentCode = filters.departmentCode?.trim().toUpperCase();
      if (departmentCode && !/^[A-Z0-9_-]{1,60}$/.test(departmentCode)) throw new ApiError("VALIDATION_ERROR", "O setor informado é inválido.", 400);
      const from = dateFilter(filters.from, "from");
      const to = dateFilter(filters.to, "to");
      if (from !== undefined && to !== undefined && from > to) throw new ApiError("VALIDATION_ERROR", "O intervalo de datas é inválido.", 400);
      const requestedTypes = filters.types?.length ? new Set(filters.types) : new Set<SearchResultType>(["REQUEST"]);
      if ([...requestedTypes].some((type) => !["REQUEST", "ITEM"].includes(type))) throw new ApiError("VALIDATION_ERROR", "O tipo de busca é inválido.", 400);
      const rankFor = (fields: string[]): number | undefined => {
        const normalizedFields = fields.map((field) => field.toLocaleLowerCase("pt-BR"));
        if (normalizedFields.some((field) => field === normalized)) return 0;
        if (normalizedFields.some((field) => field.startsWith(normalized))) return 1;
        if (normalizedFields.some((field) => field.includes(normalized))) return 2;
        return undefined;
      };
      const ranked: Array<{ result: SearchResult; rank: number }> = [];
      for (const request of state.requests) {
        if ((from !== undefined && Date.parse(request.createdAt) < from) || (to !== undefined && Date.parse(request.createdAt) > to)) continue;
        const items = request.itemIds.map((itemId) => itemFor(state, itemId));
        const visibleItems = items.filter((item) => {
          const service = serviceFor(state, item.serviceId);
          const visibleByRequest = canViewRequest(state, currentActor, request) || currentActor.patientIds?.includes(request.patientId);
          const visibleByService = ["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(currentActor.role) && service.departmentCode === currentActor.departmentCode;
          const managerItemScope = currentActor.role !== "MANAGER" || managerCanAccessDepartment(currentActor, service.departmentCode);
          const visible = Boolean(visibleByRequest || visibleByService) && managerItemScope;
          return visible && (!filters.status || item.status === filters.status) && (!departmentCode || item.departmentCode === departmentCode);
        });
        if (!visibleItems.length) continue;
        const patient = findOrThrow(state.patients.find((entry) => entry.id === request.patientId));
        const requester = state.users.find((user) => user.id === request.requesterId);
        const visibleEntityIds = new Set([request.id, ...visibleItems.map((item) => item.id)]);
        const reviewerFields = state.auditEvents
          .filter((event) => visibleEntityIds.has(event.entityId) && event.actorId)
          .flatMap((event) => {
            const user = state.users.find((entry) => entry.id === event.actorId);
            return [event.actorId!, user?.displayName ?? "", user?.email ?? ""];
          });
        const requestFields = [request.requestCode, patient.displayName, patient.ownerLabel, patient.externalId, request.requesterId, requester?.displayName ?? "", requester?.email ?? "", ...reviewerFields];
        const requestRank = rankFor(requestFields);
        if (requestRank !== undefined && requestedTypes.has("REQUEST")) {
          ranked.push({
            rank: requestRank,
            result: {
              type: "REQUEST",
              id: request.id,
              label: request.requestCode,
              patient: patient.displayName,
              status: request.aggregateStatus,
              priority: request.priority,
              updatedAt: request.updatedAt,
              departmentCode: visibleItems[0].departmentCode,
              deepLink: `/requests/${request.id}`
            }
          });
        }
        if (requestedTypes.has("ITEM")) {
          for (const item of visibleItems) {
            const service = serviceFor(state, item.serviceId);
            const sampleFields = state.samples.filter((sample) => sample.itemIds.includes(item.id)).map((sample) => sample.accessionCode);
            const itemRank = rankFor([item.id, item.departmentCode, service.id, service.code, service.name, ...sampleFields]);
            if (itemRank === undefined) continue;
            ranked.push({
              rank: itemRank,
              result: {
                type: "ITEM",
                id: item.id,
                label: `${service.code} · ${request.requestCode}`,
                patient: patient.displayName,
                status: item.status,
                priority: item.priority,
                updatedAt: request.updatedAt,
                departmentCode: item.departmentCode,
                deepLink: `/requests/${request.id}#${item.id}`
              }
            });
          }
        }
      }
      const sorted = ranked.sort((left, right) => left.rank - right.rank || right.result.updatedAt.localeCompare(left.result.updatedAt) || left.result.id.localeCompare(right.result.id));
      const afterCursor = cursor
        ? sorted.filter((entry) => entry.rank > cursor.rank || (entry.rank === cursor.rank && (entry.result.updatedAt < cursor.updatedAt || (entry.result.updatedAt === cursor.updatedAt && entry.result.id > cursor.id))))
        : sorted;
      const page = afterCursor.slice(0, boundedLimit);
      const last = page.at(-1);
      const nextCursor = last && page.length < afterCursor.length ? encodeKeysetCursor({ rank: last.rank, updatedAt: last.result.updatedAt, id: last.result.id }) : undefined;
      return { items: page.map((entry) => entry.result), nextCursor, limit: boundedLimit, total: sorted.length };
    },

    async timeline(actor: User, requestId?: string, itemId?: string, filters: TimelineFilters = {}): Promise<TimelineResult> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      const item = itemId ? itemFor(state, itemId) : undefined;
      const request = requestId ? requestFor(state, requestId) : item ? requestFor(state, item.requestId) : undefined;
      if (!request) throw new ApiError("VALIDATION_ERROR", "Informe requestId ou itemId.", 400);
      if (item && item.requestId !== request.id) throw new ApiError("NOT_FOUND", "A solicitação e o item não pertencem ao mesmo contexto.", 404);
      requireRequestPermission(state, currentActor, "timeline.view", request);
      const visibleItemIds = isExecutorRole(currentActor)
        ? request.itemIds.filter((entryId) => itemFor(state, entryId).departmentCode === currentActor.departmentCode)
        : currentActor.role === "MANAGER"
          ? request.itemIds.filter((entryId) => managerCanAccessDepartment(currentActor, itemFor(state, entryId).departmentCode))
          : request.itemIds;
      const limit = pageSize(filters.limit);
      const cursor = decodeTimelineCursor(filters.cursor);
      const events = state.auditEvents
        .filter((event) => {
          const eventRequest = requestForAuditEvent(state, event);
          if (!eventRequest || eventRequest.id !== request.id) return false;
          const eventItemIds = auditEventItemIds(state, event);
          return eventItemIds.length === 0 || eventItemIds.some((eventItemId) => visibleItemIds.includes(eventItemId));
        })
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
      const afterCursor = cursor
        ? events.filter((event) => event.occurredAt > cursor.occurredAt || (event.occurredAt === cursor.occurredAt && event.id > cursor.id))
        : events;
      const page = afterCursor.slice(0, limit);
      const last = page.at(-1);
      const nextCursor = last && page.length < afterCursor.length ? encodeKeysetCursor({ occurredAt: last.occurredAt, id: last.id }) : undefined;
      const items = page.map((event) => ({ ...event, metadata: { ...event.metadata } }));
      return { items, nextCursor, limit, total: events.length };
    },

    async dashboard(actor: User): Promise<DashboardView> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      requirePermission(currentActor, "dashboard.view", { departmentCode: currentActor.departmentCode });
      const visibleItems = state.items.filter((item) => {
        const request = requestFor(state, item.requestId);
        const service = serviceFor(state, item.serviceId);
        if (currentActor.role === "MANAGER") return managerCanAccessDepartment(currentActor, item.departmentCode);
        return Boolean(currentActor.patientIds?.includes(request.patientId)) || (["LAB_TECH", "RADIOLOGY_TEAM", "ULTRASOUND_TEAM"].includes(currentActor.role) && service.departmentCode === currentActor.departmentCode);
      });
      const asOf = now();
      const currentTime = Date.parse(asOf);
      const terminalStatuses = new Set(["COMPLETED", "CANCELLED", "REJECTED"]);
      const activeItems = visibleItems.filter((item) => !terminalStatuses.has(item.status));
      const laboratoryItems = visibleItems.filter((item) => item.workflowType === "LABORATORY");
      const criticalNotifications = state.notifications.filter((notification) => notification.recipientUserId === currentActor.id && notification.category === "CRITICAL");
      const overdue = activeItems.filter((item) => new Date(item.dueAt).getTime() < currentTime).length;
      const recollections = visibleItems.filter((item) => item.status === "RECOLLECTION_REQUIRED").length;
      const newResults = visibleItems.filter((item) => item.status === "RESULT_AVAILABLE").length;
      const critical = criticalNotifications.filter((notification) => notification.state !== "ACKNOWLEDGED").length;
      const totalActive = activeItems.length;
      const counts: Record<DashboardIndicatorKey, number> = { overdue, recollections, newResults, critical, totalActive };
      const denominators: Record<DashboardIndicatorKey, number> = {
        overdue: totalActive,
        recollections: laboratoryItems.length,
        newResults: visibleItems.length,
        critical: criticalNotifications.length,
        totalActive: visibleItems.length
      };
      const indicators = (Object.keys(INDICATOR_DEFINITIONS) as DashboardIndicatorKey[]).map((key) => ({
        key,
        count: counts[key],
        denominator: denominators[key],
        ...INDICATOR_DEFINITIONS[key]
      }));
      const window: DashboardWindow = { kind: "CURRENT_STATE", label: "Estado atual", timezone: dashboardTimezone(currentActor), asOf };
      return { overdue, recollections, newResults, critical, totalActive, updatedAt: asOf, window, indicators };
    },

    async managementOverview(actor: User): Promise<ManagementOverview> {
      const state = await store.readState();
      const currentActor = requireActiveUser(state, actor);
      if (currentActor.role !== "MANAGER") throw new ApiError("SCOPE_DENIED", "Este centro é exclusivo da gestão operacional.", 404);
      requirePermission(currentActor, "dashboard.view", { departmentCode: currentActor.departmentCode });
      requirePermission(currentActor, "user_role.manage", { departmentCode: currentActor.departmentCode });
      const asOf = now();
      const currentTime = Date.parse(asOf);
      const terminalStatuses = new Set<ItemState>(["COMPLETED", "CANCELLED", "REJECTED"]);
      const visibleItems = state.items
        .filter((item) => managerCanAccessDepartment(currentActor, item.departmentCode))
        .map((item) => ({ item, request: requestFor(state, item.requestId), service: findOrThrow(state.services.find((entry) => entry.id === item.serviceId)) }));
      const activeItems = visibleItems.filter(({ item }) => !terminalStatuses.has(item.status));
      const visibleRequestIds = new Set(visibleItems.map(({ request }) => request.id));
      const overdueItems = activeItems.filter(({ item }) => Date.parse(item.dueAt) < currentTime);
      const pendingItems = activeItems
        .slice()
        .sort((left, right) => {
          const priorityRank: Record<Priority, number> = { EMERGENCY: 0, URGENT: 1, ROUTINE: 2 };
          return priorityRank[left.item.priority] - priorityRank[right.item.priority] || left.item.dueAt.localeCompare(right.item.dueAt);
        });
      const critical = state.notifications.filter((notification) => {
        if (notification.category !== "CRITICAL" || notification.state === "ACKNOWLEDGED") return false;
        const request = requestForNotification(state, notification);
        return Boolean(request && request.itemIds.some((itemId) => managerCanAccessDepartment(currentActor, itemFor(state, itemId).departmentCode)));
      }).length;
      const departments = managerDepartmentCodes(currentActor)
        .filter((departmentCode) => state.services.some((service) => service.departmentCode === departmentCode))
        .sort()
        .map((departmentCode) => {
          const departmentItems = visibleItems.filter(({ item }) => item.departmentCode === departmentCode);
          const departmentRequests = new Set(departmentItems.map(({ request }) => request.id));
          return {
            departmentCode,
            serviceCount: state.services.filter((service) => service.departmentCode === departmentCode && service.active).length,
            totalRequests: departmentRequests.size,
            activeItems: departmentItems.filter(({ item }) => !terminalStatuses.has(item.status)).length,
            overdue: departmentItems.filter(({ item }) => !terminalStatuses.has(item.status) && Date.parse(item.dueAt) < currentTime).length,
            pending: departmentItems.filter(({ item }) => !terminalStatuses.has(item.status)).length
          };
        });
      const today = asOf.slice(0, 10);
      const recentRequests = Array.from(visibleRequestIds)
        .map((requestId) => requestFor(state, requestId))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 12)
        .map((request) => ({
          id: request.id,
          requestCode: request.requestCode,
          patient: findOrThrow(state.patients.find((patient) => patient.id === request.patientId)).displayName,
          aggregateStatus: request.aggregateStatus,
          priority: request.priority,
          updatedAt: request.updatedAt,
          itemCount: request.itemIds.filter((itemId) => managerCanAccessDepartment(currentActor, itemFor(state, itemId).departmentCode)).length,
          deepLink: `/requests/${request.id}`
        }));
      return {
        asOf,
        scope: { departments: managerDepartmentCodes(currentActor), label: managerDepartmentCodes(currentActor).join(" · ") },
        summary: {
          totalRequests: visibleRequestIds.size,
          activeItems: activeItems.length,
          overdue: overdueItems.length,
          recollections: visibleItems.filter(({ item }) => item.status === "RECOLLECTION_REQUIRED").length,
          newResults: visibleItems.filter(({ item }) => item.status === "RESULT_AVAILABLE").length,
          critical,
          pendingRequests: new Set(activeItems.map(({ request }) => request.id)).size,
          completedToday: visibleItems.filter(({ item }) => item.completedAt?.slice(0, 10) === today).length
        },
        departments,
        pending: pendingItems.slice(0, 50).map(({ item, request, service }) => ({
          id: item.id,
          requestId: request.id,
          requestCode: request.requestCode,
          patient: findOrThrow(state.patients.find((patient) => patient.id === request.patientId)).displayName,
          service: service.name,
          departmentCode: item.departmentCode,
          status: item.status,
          priority: item.priority,
          dueAt: item.dueAt,
          overdue: Date.parse(item.dueAt) < currentTime,
          nextAction: nextActionFor(item, service),
          deepLink: `/requests/${request.id}#${item.id}`
        })),
        recentRequests
      };
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
