# Data flow

**Knowledge status:** `DECISION` de fluxo esperado; tempos, integrações e ownership reais são `ASSUMPTION`/`OPEN QUESTION` do Discovery.

## 1. Create request

```mermaid
sequenceDiagram
  participant U as Usuário
  participant W as Web
  participant A as API
  participant D as Diagnostics
  participant R as Registry
  participant C as Catalog
  participant DB as PostgreSQL
  U->>W: seleciona patient/encounter + services
  W->>A: POST diagnostic-requests + Idempotency-Key
  A->>R: valida contexto/escopo
  A->>C: resolve service/capability/policy
  A->>D: command create request
  D->>DB: transaction request + items + audit + outbox
  DB-->>A: committed request/version
  A-->>W: 201 request summary
  DB-->>A: notification/realtime worker later
```

## 2. Result release and notification

```mermaid
sequenceDiagram
  participant E as Executor
  participant A as API
  participant R as Results
  participant DB as PostgreSQL
  participant O as Outbox worker
  participant N as Notifications
  participant C as Care UI
  E->>A: POST /results/{id}/release
  A->>R: authorize + validate current draft/version
  R->>DB: result version + item state + audit + outbox (atomic)
  DB-->>A: commit/version
  A-->>E: released result/version
  O->>N: deliver durable in-app intent
  N-->>C: SSE invalidation / inbox row
  C->>A: GET authorized result
  A-->>C: current version
```

## 3. Recollection

Rejection and request of recollection commit sample chain, item exception state, audit and notification intent together. Physical collection is a later event; a missing replacement remains visible in the queue.

## 4. Timeline

Timeline query reads immutable audit/domain events, enriches them with authorized labels/context and paginates by cursor. It must not join unscoped patient data. A projection can improve performance, but the event is the source of truth and projection rebuild is possible.

## 5. File flow

```text
create result draft → upload session → direct object upload → finalize/checksum/MIME/scan → attachment linked to version → release eligibility → authorized temporary download
```

An orphan upload is garbage-collected only after retention/policy allows and with storage audit; it is never mistaken for a released clinical attachment.
