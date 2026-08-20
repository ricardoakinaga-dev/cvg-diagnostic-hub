# Event Storming simplificado

## Escopo

O mapa cobre o caminho request → item → sample/procedure → result → review e as políticas de notificação/SLA. Os nomes são contratos candidatos; a SPEC os normaliza.

## Atores

- `REQUESTER`: veterinário ou equipe autorizada de cuidado.
- `LAB_TECH`: técnico/equipe do laboratório.
- `IMAGING_OPERATOR`: radiologia ou ultrassom.
- `REVIEWER`: profissional de cuidado autorizado.
- `MANAGER`: gestor operacional.
- `ADMIN`: administrador técnico/configuração.
- `SYSTEM`: jobs de SLA, notificações e métricas.

## Commands → events

| Command | Actor | Event(s) | Aggregate/owner | Policy/efeito |
| --- | --- | --- | --- | --- |
| Create diagnostic request | REQUESTER | `DiagnosticRequestCreated`, `DiagnosticItemRequested` | Diagnostics | duplicate warning, audit |
| Receive sample | LAB_TECH | `SampleReceived`, `DiagnosticItemReceived` | Sample/Item | link one sample to many items |
| Reject sample/request recollection | LAB_TECH/MANAGER | `SampleRejected`, `RecollectionRequested` | Sample/Item | reason mandatory, notification |
| Start processing | LAB_TECH | `ProcessingStarted` | Item | conditional version check |
| Perform exam | IMAGING_OPERATOR | `ExamPerformed` | Procedure/Item | imaging state transition |
| Schedule/reschedule | IMAGING_OPERATOR/MANAGER | `ProcedureScheduled`, `ProcedureRescheduled` | Procedure | conflict policy |
| Create result draft | executor | `ResultDraftCreated` | Result | editable before release |
| Release result | result owner | `ResultReleased` | Result/Item | atomic audit + outbox |
| Mark critical | authorized executor | `CriticalResultDetected` | ResultVersion | policy-driven notification |
| View result | authenticated scoped user | `ResultViewed` | ResultVersion | idempotent per user/version or event policy |
| Review result | REVIEWER | `ResultReviewed` | Result/Item | current version must be released |
| Amend result | result owner/manager | `ResultAmended` | Result | reason, new version, re-review |
| Void released result | result owner/manager | `ResultVoided` | Result/Item | prior version invalidated, replacement required, notification |
| Cancel item/request | authorized actor | `DiagnosticItemCancelled`, `DiagnosticRequestCancelled` | Item/Request | stage-based permission |
| Reject item | executor/manager | `DiagnosticItemRejected` | Item | reason, terminal unless appeal policy |
| Detect overdue | SYSTEM | `DiagnosticItemOverdue` | SLA policy/Item | actionable notification, no clinical state mutation |
| Acknowledge notification | recipient | `NotificationAcknowledged` | Notification | critical confirmation audit |
| Complete request | SYSTEM/domain | `DiagnosticRequestCompleted` | Request | all items satisfy completion invariant |

## Aggregates and boundaries

| Aggregate | Owns | Invariants discovered |
| --- | --- | --- |
| DiagnosticRequest | patient/encounter context, code, item grouping | request cannot cross patient/encounter; item identities remain independent |
| DiagnosticRequestItem | service, priority, workflow state, SLA link | only valid transitions; terminal item cannot be processed |
| Sample | accession, chain/replacement, collection/receipt | sample identity and rejection reason immutable after audit |
| Procedure | schedule and execution steps | one active schedule; reschedule preserves history |
| Result | logical result and current version | released content is not overwritten; review applies to current version |
| Notification | recipient, category, delivery/ack state | critical notification remains actionable until confirmation/escalation |
| AuditEvent | immutable action history | users cannot edit/delete clinical history |

## Policies

- `DuplicateRequestPolicy`: warns on same patient + compatible service + active item; authorized override records reason.
- `SlaPolicy`: computes `due_at` from service/priority and configured start event; it never silently pauses.
- `CriticalResultPolicy`: creates internal high-priority notifications and escalation when confirmation is absent.
- `CompletionPolicy`: request completes only when all items are completed, cancelled or rejected according to the agreed terminal rule.
- `AmendmentPolicy`: a released result creates an immutable new version and re-notifies/requires re-review when applicable.
- `AccessPolicy`: every command checks actor, role, department/scope and current state.
- `OutboxPolicy`: domain/audit changes and durable notification intents commit atomically.

## Invariants to carry into SPEC

1. A result cannot be reviewed before release.
2. A cancelled/rejected item cannot start without an explicit recovery policy.
3. A recollection requires a reason and a new sample chain node.
4. A release is idempotent and never creates two current versions.
5. Critical detection/release produces an auditable communication path.
6. Request completion requires every item to satisfy the terminal policy.
7. Server time is authoritative for audit and SLA timestamps.
8. A user cannot access a patient/result solely by guessing an ID.
9. An attachment cannot become visible before validation/scan policy succeeds.
10. A timeline entry must reference an audit/domain event; it is not independently edited.

## Open modeling questions

- `OPEN QUESTION`: one accession per request or per item in each laboratory workflow?
- `OPEN QUESTION`: whether a cancelled item can be reopened, and by which authority.
- `OPEN QUESTION`: who is the responsible professional for critical-result fallback.
- `OPEN QUESTION`: exact clinical policy for critical values.
