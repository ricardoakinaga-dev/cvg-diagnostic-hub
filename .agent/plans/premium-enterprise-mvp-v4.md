# Premium enterprise MVP v4 — ExecPlan

## Purpose / Big Picture

Deliver a defensible local/synthetic MVP in which clinical confidentiality and
integrity, durable multi-instance behavior, the published API, real browser journeys
and operational evidence agree. Success is observable only when every required item
in `docs/build/PREMIUM_MVP_V4.md` passes on the current revision and a fresh critic
finds no unresolved CRITICAL/HIGH local defect. This does not authorize hospital use.

## Progress

- [x] (2026-08-22T02:24:52Z) Recovered the clean repository and existing gauntlet state.
- [x] (2026-08-22T02:24:52Z) Read the complete documentation inventory through six
  bounded audit workstreams and consolidated requirement, contract and evidence gaps.
- [x] (2026-08-22T02:24:52Z) Re-ran the local baseline and independent security audit.
- [x] (2026-08-22T02:24:52Z) Froze Quality Bar v4 without aggregate-score shortcuts.
- [x] (2026-08-22T03:04:22Z) Closed the first security/integrity wave after RED-first
  implementation, 142-test regression, production build and independent ACCEPT.
- [x] (2026-08-22T03:50:33Z) Defined and executed the initial contract/body RED wave
  and a second critic-driven RED cycle with AJV validation of real route responses.
- [ ] Complete the implementation, integration, runtime and criticism milestones.

## Surprises & Discoveries

- Observation: `npm run validate` passes 119 tests and the global coverage gate, yet
  ordinary tests force memory mode and no automated test exercises Postgres.
  Evidence: test configuration and `.agent/audits/AUDIT-V4-BASELINE.md`.
  Impact: durable behavior requires a disposable database harness, not inferred proof.
- Observation: the project validator reports OpenAPI success while a semantic linter
  reports 51 errors and 47 warnings.
  Evidence: `scripts/validate-openapi.mjs`, `docs/api/openapi.json`, baseline audit.
  Impact: V4 requires a standards validator and runtime drift checks.
- Observation: an independent reviewer reproduced draft disclosure, cross-author
  draft edit, a known ADMIN password and duplicate result drafts.
  Evidence: `.agent/audits/AUDIT-V4-BASELINE.md`.
  Impact: security/integrity repairs precede feature expansion.
- Observation: `PostgresStore` loads one JSONB snapshot at construction and only
  refreshes it during a transaction executed by that same process. Authentication,
  read services and SSE therefore keep stale sessions, roles, scopes and outbox state
  indefinitely in a second instance.
  Evidence: `src/server/store/postgres-store.ts`, `src/server/security/session.ts`,
  `src/app/api/v1/[...path]/route.ts` and the TASK-V4-DATA-001 read-only audit.
  Impact: current security reads must become fresh asynchronous store reads, and the
  two-instance behavior must be locked on a disposable PostgreSQL database.
- Observation: the deployed database is a transitional JSONB snapshot with audit and
  outbox projections, not the relational clinical schema described in `DATA_MODEL.md`;
  the application role can currently update, delete and truncate audit rows.
  Evidence: migrations 001/002 and direct PostgreSQL catalog inspection on the local
  PostgreSQL 16 development container.
  Impact: V4-DB-03 can close locally only through an honest, tested expand/contract
  migration boundary plus additive schema-version/append-only protections; it cannot
  claim that the target relational model is already deployed.
- Observation: a generated OpenAPI document and its generator-derived drift tests can
  agree while contradicting the real response envelope. The first contract GREEN
  modeled paginated audit/search/timeline data as objects although the route emitted
  arrays and placed pagination in `meta`.
  Evidence: independent TASK-V4-CONTRACT-001 critic and
  `src/server/http/openapi-runtime-response.test.ts` AJV RED.
  Impact: contract closure requires validating representative real HTTP payloads
  against the generated OpenAPI, not only comparing generated artifacts to each other.

## Decision Log

- Decision: supersede subjective 95/96 closure claims with binary Quality Bar v4.
  Context: required failures were hidden by aggregate scores and presence-only checks.
  Alternatives: accept historical closure; patch only reported symptoms.
  Reason: the executable artifact contradicts its acceptance evidence.
  Consequences: all old evidence is historical until rerun against v4 criteria.
  Date/Author: 2026-08-22 / primary agent.
- Decision: preserve external clinical and hospital choices as explicit blocked gates.
  Context: the user authorized repository implementation, not invention of policy.
  Alternatives: encode fixture assumptions as production defaults.
  Reason: clinical thresholds, identity authority and retention need accountable owners.
  Consequences: the local MVP can be technically complete while release remains blocked.
  Date/Author: 2026-08-22 / primary agent.
- Decision: build in vertical, test-first waves and serialize edits to shared route/store
  contracts while parallelizing independent documentation/review work.
  Context: `service.ts` and the catch-all route are current merge hotspots.
  Alternatives: broad parallel rewrite.
  Reason: minimizes conflicting ownership and makes each invariant demonstrable.
  Consequences: architecture extraction follows correctness fixes, not before them.
  Date/Author: 2026-08-22 / primary agent.

## Outcomes & Retrospective

In progress. The legacy local-complete verdict is rejected; no v4 completion claim has
been made.

## Context and Orientation

The project is a brownfield Next.js 16 application. HTTP dispatch lives in
`src/app/api/v1/[...path]/route.ts`; application/domain behavior is concentrated in
`src/server/application/service.ts`; persistence implementations are under
`src/server/store/`; security is under `src/server/security/`; Playwright tests are in
`tests/e2e/`; API and product contracts are under `docs/`. The current Postgres adapter
stores a full JSONB state snapshot and process-local cache. The historical gauntlet
record is `.gauntlet/`; `.agent/` is the current engineering control plane.

## Scope and Constraints

- In scope: all locally implementable MUST/acceptance behavior, security defects,
  API/data/operation contracts, maintainability, real critical journeys, evidence and
  documentation required by Quality Bar v4.
- Out of scope: production deployment, real clinical data, signed hospital policies,
  provider procurement and any external approval.
- Applicable instructions: user-provided `AGENTS.md`, repository `AGENTS.md`, local
  Next.js route/data-security/production guides, and the selected gauntlet,
  orchestration, engineering, TDD, security and coding standards skills.
- Requirements/decisions: `docs/prd/`, `docs/spec/`, `docs/adr/`,
  `docs/build/PREMIUM_MVP_V4.md` and this plan.
- Tier/risk/blast radius: `T3_SYSTEM` / `HIGH` / `SYSTEM`, because changes cross
  clinical authorization, data, API and browser behavior.
- Authorization constraints: the workspace owner authorized local repository changes
  and verification; external systems and hospital decisions are not authorized.

## Architecture and Interfaces

Keep one authoritative server-side application boundary, but extract cohesive domain
modules with explicit immutable inputs/outputs. HTTP must validate authentication,
authorization, headers, bounded bodies and schemas before domain calls. Domain
commands enforce ownership, service scope, expected version and lifecycle invariants.
Postgres must provide current reads across instances and database-enforced constraints;
security state may not depend on indefinite process cache. Outbox claims require an
owner/token compare-and-set. OpenAPI and a route manifest must describe the same
operations. UI journeys use only real served endpoints.

## Milestones

### Milestone 1 — Clinical security and integrity

- Outcome: draft confidentiality, exact draft ownership/service scope, fail-closed
  bootstrap and one canonical result lineage.
- Scope/dependencies: TASK-V4-SEC-001; no external policy required.
- Demonstration: targeted RED tests fail on baseline, pass after the smallest fix.
- Acceptance/evidence: V4-SEC-01/02/03 and V4-DOM-01.

### Milestone 2 — Exact API and durable data

- Outcome: semantically valid OpenAPI, bounded requests and cross-instance Postgres
  consistency with automated durable journeys.
- Scope/dependencies: TASK-V4-CONTRACT-001 then TASK-V4-DATA-001.
- Demonstration: standards lint, drift tests and disposable two-store integration.
- Acceptance/evidence: V4-API-01/02 and V4-DB-01/02/03.

#### TASK-V4-CONTRACT-001 design freeze

- Introduce one typed operation manifest that enumerates every accepted method/path,
  exact dynamic segments, public/session security, CSRF/idempotency headers, body
  media/schema and success statuses. The catch-all route uses the same matcher that
  the drift checker consumes, so an undocumented wildcard is not silently accepted.
- Replace permissive operation references with standard OpenAPI 3.1 operation
  objects. Every operation has a unique `operationId`, summary, tag, path/query/header
  parameters, security, request body where applicable and explicit response content.
- Pin the standards linter in the development toolchain and make
  `npm run validate:openapi` run both semantic lint and manifest drift validation.
- Replace `request.json()` with a streaming byte-limited UTF-8 JSON reader. Enforce a
  configurable finite byte ceiling, a finite nesting ceiling, strict object schemas
  and safe malformed/unsupported-media errors before application code executes.
- RED evidence is required for: current 51-error/47-warning spec; manifest/spec drift;
  undeclared/overlong dynamic routes; oversized declared and chunked JSON; excessive
  nesting; malformed JSON/UTF-8; and a valid bounded command. Implementation is split
  between contract artifacts and the body/route boundary, then integrated through the
  full API regression and a fresh independent review.

#### TASK-V4-DATA-001 design freeze

- Add a fresh asynchronous `readState()` store boundary. Memory returns an immutable
  clone; PostgreSQL selects and validates the current `{state, version}` row and
  refreshes its local inspection cache. Authentication, application reads and each SSE
  heartbeat use the fresh boundary instead of an indefinitely cached snapshot.
- Prove behavior in a dedicated Vitest PostgreSQL project that requires a separate
  loopback `POSTGRES_TEST_ADMIN_URL`, creates only `cvg_test_<pid>_<uuid>` databases,
  applies the real migrations, opens two independent stores, closes pools and drops
  only the validated disposable database in `finally`. The normal unit suite never
  silently skips or substitutes this job.
- RED evidence covers cross-instance session revocation and role/scope changes, SSE
  termination, upload revocation during object-store I/O, canonical concurrent result
  creation, durable reload/projections, transaction rollback, projection reconciliation
  and catalog-enforced schema/audit invariants.
- Add an expand-only migration with runtime schema version/shape checks, a data-free
  `{id, version}` invalidation notification, append-only audit enforcement, migration
  serialization/checksums and readiness against the latest expected migration. Rollback
  is application/feature-flag rollback; no destructive down migration is authorized.
- Treat object storage and PostgreSQL as a claimed two-phase workflow: authorize and
  claim in a transaction, write bytes, re-read/re-authorize/compare claim in a second
  transaction, delete on failed commit, and keep failed cleanup inaccessible for an
  explicit orphan reconciler. Only `FINALIZED + CLEAN` content is downloadable.
- Reconcile architecture/data/build/test/readiness documentation to state that JSONB is
  a transitional adapter, audit/outbox are projections, the relational model is a
  target, and production/pilot stays blocked until expand/backfill/dual-write/reconcile/
  cutover is exercised. This is the safe-boundary branch of V4-DB-03, not normalization.

### Milestone 3 — Reliable operations and maintainable architecture

- Outcome: claim-safe outbox, production-mode controls and cohesive source modules
  under the project size limit.
- Scope/dependencies: secured contracts and durable data.
- Demonstration: race/config tests, architecture fitness tests and full regression.
- Acceptance/evidence: V4-OPS-01/02 and V4-ARCH-01.

### Milestone 4 — Complete user journeys and documentation

- Outcome: real Lab/RX/US/results/files/notifications browser flows and one consistent
  requirements-to-evidence corpus.
- Scope/dependencies: stable API/data/domain architecture.
- Demonstration: Postgres-backed Playwright without forced actions or mocked mutations;
  docs/traceability validators.
- Acceptance/evidence: V4-UX-01/02, V4-DOC-01 and V4-TRACE-01.

### Milestone 5 — Gauntlet closure

- Outcome: current full artifact evidence and a fresh independent critic verdict.
- Scope/dependencies: all implementation milestones.
- Demonstration: clean build/start, test/coverage, DB/restore, security, performance,
  browser, accessibility and visual checks; repeat after fixes.
- Acceptance/evidence: V4-REG-01 and V4-CRITIC-01.

## Plan of Work

TASK-V4-SEC-001 is the first critical path. TASK-V4-CONTRACT-001 may prepare contract
work in disjoint files, but shared route edits integrate after the security slice.
TASK-V4-DATA-001 follows the canonical-result contract. TASK-V4-OPS-001 and
TASK-V4-ARCH-001 follow stable domain/data behavior. TASK-V4-JOURNEY-001 follows the
real API. TASK-V4-DOC-001 reconciles each completed slice. TASK-V4-AUDIT-001 runs last
and may reopen any predecessor when fresh evidence reveals a gap.

## Concrete Steps

From the repository root:

1. Add focused failing tests for GAP-V4-01 through GAP-V4-04 and capture RED output.
2. Implement the smallest authorization/bootstrap/result-lineage changes and rerun the
   targeted tests, then `npm run validate`.
3. Repeat the milestone sequence, recording each real command in
   `.agent/verification.jsonl` and decisions in `.agent/execution-log.jsonl`.
4. Run the final complete verification and independent criticism packet; fix and
   retest until the stop rule is satisfied.

## Validation and Acceptance

| Criterion | Required | Procedure/environment | Expected observation | Evidence destination |
| --- | --- | --- | --- | --- |
| V4-SEC/DOM | yes | targeted unit/API/Postgres tests | all forbidden cases deny; one lineage | verification ledger |
| V4-API | yes | standard lint plus route drift/negative tests | zero semantic errors/drift; bounded failures | verification ledger |
| V4-DB/OPS | yes | disposable Postgres and concurrency/config tests | current cross-instance state; claim-safe/fail-closed | verification ledger |
| V4-ARCH | yes | fitness checks, typecheck, review | cohesive acyclic files, each <=800 lines | verification ledger |
| V4-UX | yes | served Postgres-backed Playwright/axe/screenshots | all real journeys pass without force | test artifacts and ledger |
| V4-DOC/TRACE | yes | docs and traceability validation | no contradiction or orphan requirement | verification ledger |
| V4-REG/CRITIC | yes | full fresh suite and separated review | all local gates pass; no CRITICAL/HIGH | final audit packet |

## Risks and Human Decisions

| Risk/decision | Evidence/confidence | Controls | Residual/authority | Trigger |
| --- | --- | --- | --- | --- |
| clinical disclosure/integrity | reproduced/high | deny-by-default, versioned commands, RED tests | HIGH during build; user-authorized local repair | any failed negative test |
| data migration/concurrency | code inspection/high | disposable DB, transactions, idempotent migration, rollback | HIGH; no production execution | schema or cross-instance change |
| external policy | docs/high | closed feature gates and explicit owners | BLOCKED EXTERNAL | signed authority evidence |
| broad refactor regression | 2,436-line service/high | extract after invariant fixes, small commits, full suite | MEDIUM | module-boundary change |

## Idempotence and Recovery

All test data is synthetic and disposable. Migrations must be transactional and safe to
rerun. Never reset or discard unrelated user changes. On interruption, read
`.agent/state.json`, the active task in `.agent/backlog.json`, the last execution and
verification ledger entries, then this plan. Failed gates roll forward with a new
record; prior audit/gate records remain append-oriented.

## Artifacts and Evidence

- `docs/build/PREMIUM_MVP_V4.md`: frozen acceptance bar and external boundary.
- `.agent/audits/AUDIT-V4-BASELINE.md`: evidence-backed rejection of legacy closure.
- `.agent/backlog.json`: dependency graph and task contracts.
- `.agent/verification.jsonl`: typed outcomes; baseline begins as FAIL.
- `.gauntlet/state.md`: historical loop plus v4 round pointer.

Plan revision note, 2026-08-22: initialized after complete documentation, runtime,
contract and independent security inspection; replaces the unsupported “no local
technical gap remains” premise.

Progress note, 2026-08-22T05:27:50Z: TASK-V4-CONTRACT-001 closed after two RED
correction rounds, 188/188 full tests, production build, exact 62-operation/58-path
OpenAPI drift and final independent ACCEPT. TASK-V4-DATA-001 is the next critical
path; its two-store stale-read and attachment-I/O baseline is persisted under
`.agent/audits/TASK-V4-DATA-001-BASELINE.md`.
