# Components and module contracts

**Knowledge status:** `DECISION` de boundaries para planejamento; nenhum componente de aplicação existe ainda no repositório.

## 1. Web application

- App shell/navigation by permission.
- Query/cache layer that treats SSE as invalidation signal, not truth.
- Forms with progressive disclosure and schema-generated types.
- Shared `DiagnosticStatus`, `PriorityBadge`, `SlaIndicator`, `PatientIdentity`, `NotificationRow` and `ErrorState` components.
- Accessibility primitives for focus, keyboard and live regions.

## 2. API layers

```text
transport/controller
  → request schema/DTO validation
  → application command/query handlers
  → domain rules/value objects
  → repository ports
  → PostgreSQL adapters
  → outbox/audit adapters
```

Controllers never make direct table mutations or decide authorization from client input.

## 3. Internal ports

| Port | Contract |
| --- | --- |
| `PatientContextPort` | resolve patient/encounter/admission + external refs within scope |
| `DiagnosticCatalogPort` | service capabilities, labels, schema and policy versions |
| `DiagnosticWorkflowPort` | validate/execute service-specific transitions |
| `SamplePort` | receive/reject/link/recollection chain |
| `ProcedurePort` | schedule/perform/reschedule |
| `ResultPort` | draft/release/amend/view/review |
| `AuthorizationPort` | actor/action/resource/scope decision |
| `AuditPort` | append immutable event |
| `NotificationPort` | create durable intent, inbox and acknowledgement |
| `FileStoragePort` | presigned upload, finalize, scan, authorized download |
| `ClockPort` | server time for deterministic tests |

## 4. Shared contracts

Keep only stable cross-module types in `packages/contracts` when implementation starts: IDs, enums, event envelopes, API error codes and pagination. Do not create a generic “domain” package that owns every rule.

## 5. Read models

Queue cards, dashboard counters, notification inbox and search may use query projections/materialized views, but each field must state its source event/timestamp and refresh behavior. They cannot write lifecycle state.

## 6. Infrastructure adapters

PostgreSQL repositories, S3 storage, session store, outbox worker, SSE broadcaster and telemetry are replaceable adapters. Local MinIO is for development only; production bucket policy, encryption, retention and lifecycle are separate configuration.
