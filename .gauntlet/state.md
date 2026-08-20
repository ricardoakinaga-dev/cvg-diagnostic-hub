# Gauntlet State

## Goal

Produzir, em um repositório inicialmente vazio, a documentação completa e coerente do CVG Diagnostics Hub seguindo `DISCOVERY → PRD → SPEC → BUILD PLAN`, incluindo discovery operacional, Event Storming, PRD/MVP, especificação de domínio/estados/dados/permissões/API/realtime, arquitetura, UX, segurança, testes, operações, ADRs, backlog e matriz de rastreabilidade. Não implementar a aplicação antes de a documentação estar revisada e coerente.

Restrições: não inventar fatos operacionais; classificar informação como `FACT`, `ASSUMPTION`, `DECISION` ou `OPEN QUESTION`; manter o produto focado no fluxo diagnóstico; priorizar segurança clínica, simplicidade operacional e rastreabilidade; não adicionar microserviços ou tecnologias sem necessidade demonstrada.

## Quality Bar Control

- Current version: v1
- Frozen before implementation: yes — documentation-only scope; baseline captured before edits.
- Revision log: v1 completed after Round 03 final review.

## Quality Bar

| ID | Dimension | Criterion | Target | Evidence method | Required | Priority | Baseline | Validity notes | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DOC-1 | Reconnaissance | O estado inicial do repositório e seus limites devem estar registrados | Fact explícito de repositório vazio, sem arquitetura existente | `git status`, `ls -la`, `docs/discovery/DISCOVERY.md` | yes | critical | Diretório vazio; sem `.git` | Evidência local; sem histórico para inspecionar | PASS |
| DOC-2 | Discovery | Problema, stakeholders, personas, jobs, jornadas, blueprint e Event Storming devem estar documentados | Todos os artefatos Discovery obrigatórios presentes e cross-referenciados | `bash scripts/validate-docs.sh` + inspeção dos arquivos | yes | critical | Nenhum documento | Testa presença e âncoras, não substitui julgamento operacional | PASS |
| DOC-3 | Epistemologia | Fatos, hipóteses, decisões e perguntas abertas não podem ser misturados | Cada registro relevante classificado; perguntas clínicas/operacionais não resolvidas permanecem visíveis | Inspeção dos registros e banners de status downstream | yes | high | Ausente | Não prova validade das premissas no hospital | PASS |
| DOC-4 | PRD/MVP | O PRD deve definir outcome, non-goals, MoSCoW, requisitos versionados, histórias e acceptance criteria | Todo requisito MVP possui ID, prioridade e critério Given/When/Then; MVP executável em vertical slices | `rg` por IDs e leitura do PRD/traceability | yes | critical | Nenhum PRD | Critérios são proposta para validação humana | PASS |
| DOC-5 | Domain correctness | Domínio, invariantes e estados devem explicar os fluxos Lab/RX/US, recoleta, cancelamento, crítico e correção | Transições válidas, atores, precondições, efeitos e terminais documentados sem estado impossível conhecido | Inspeção de `DOMAIN_MODEL.md` e `STATE_MACHINES.md` + Critic | yes | critical | Ausente | Segurança clínica ainda depende de validação do responsável | PASS |
| DOC-6 | Data/API integrity | Persistência e API devem manter auditoria, versionamento de resultado, idempotência, concorrência e erros | Modelo com constraints/timestamps/indexes e endpoints de comando alinhados ao domínio | Inspeção de `DATA_MODEL.md`, `API_SPEC.md`, `ERROR_MODEL.md` | yes | critical | Ausente | Não é contrato OpenAPI executável ainda | PASS |
| DOC-7 | Access/security | A autorização deve ser por ator, ação e escopo; ameaças, uploads e LGPD devem estar tratados | Matriz de permissões e threat model cobrem todos os comandos clínicos e recursos sensíveis | Inspeção de `PERMISSIONS.md`, `SECURITY.md`, `THREAT_MODEL.md` + Critic | yes | critical | Ausente | Sem implementação não há teste de exploração real | PASS documental |
| DOC-8 | Architecture/UX | Arquitetura simples e extensível e UX operacional devem estar especificadas | Modular monolith, contratos de módulo, fluxos, telas e estados assíncronos são explícitos | Inspeção dos docs de arquitetura/UX e ADRs | yes | high | Ausente | Qualidade visual só será verificável após BUILD | PASS |
| DOC-9 | Operations/testing | Plano de testes, backup/restore, observabilidade, readiness e release checklist devem ser acionáveis | Cada requisito crítico mapeia para validação; RPO/RTO propostos e restore testável; gates de release definidos | Inspeção de docs + validador | yes | high | Ausente | Alvos operacionais são propostas, marcadas para validação | PASS documental |
| DOC-10 | Traceability | Problem → requirement → acceptance → spec → build task → test deve ser navegável | Toda FR/NFR/AC crítica tem linha de rastreabilidade e nenhuma referência órfã conhecida | `bash scripts/validate-docs.sh` + cobertura por IDs | yes | critical | Ausente | A matriz não prova implementação; prova preparação para BUILD | PASS |
| DOC-11 | Consistency | Termos, enums, endpoints, eventos e decisões devem permanecer consistentes entre documentos | Validador sem falhas e revisão cruzada sem divergência material aberta | `bash scripts/validate-docs.sh` + revisão independente | yes | critical | Ausente | Revisão final independente aprovou após o mapeamento endpoint–permissão | PASS |
| DOC-12 | Scope discipline | A entrega não deve conter código de produto nem complexidade ornamental | Nenhuma implementação de aplicação; Build Plan é o próximo passo documentado | `rg --files`, inspeção de árvore e `DISCOVERY.md` | yes | high | Repositório vazio | Scripts de validação não são produto | PASS |

## Gauntlet Score

| Dimension | Status | Actual evidence | Target | Confidence | Trend |
| --- | --- | --- | --- | --- | --- |
| Repository reconnaissance | PASS | `ls -la` mostrou apenas `.` e `..`; não há `.git` nem arquivos de produto | DOC-1 | high | baseline |
| Documentation completeness | PASS | 56 arquivos obrigatórios; PRD com 42 requisitos e 42 AC; validador verde | DOC-2, DOC-4, DOC-8, DOC-9 | high | better |
| Domain correctness | PASS documental | `RESULTS_AVAILABLE`, completion policy/API, cancelamento faseado, void/reopen/replacement e coerência Lab/RX/US revisados; Critic final aprovou | DOC-5, DOC-6 | high | better |
| Security and operations | PASS documental | matriz granular, threat model e alert/runbook ownership; sem runtime evidence por escopo | DOC-7, DOC-9 | medium | better |
| Traceability and consistency | PASS | 42/42 requisitos, 42/42 ACs, 28/28 tarefas e 17 operações API cobertos; permissões canônicas conferidas; Critic final aprovou | DOC-10, DOC-11 | high | better |

## Workstreams

| Workstream | Bar IDs | Owner/boundary | Order | Status |
| --- | --- | --- | --- | --- |
| Reconnaissance and quality bar | DOC-1, DOC-12 | Lead; `.gauntlet/`, initial report | completed | completed |
| Discovery and Event Storming | DOC-2, DOC-3 | Lead; `docs/discovery/**` | sequential first | completed |
| PRD and MVP | DOC-4 | Lead; `docs/prd/**` | after Discovery | completed |
| Technical specification | DOC-5, DOC-6, DOC-7 | Lead; `docs/spec/**`, `docs/api/**`, `docs/security/**` | after PRD | completed; retested |
| Architecture and UX | DOC-8 | Lead; `docs/architecture/**`, `docs/ux/**`, `docs/adr/**` | after core SPEC | completed |
| Testing and operations | DOC-9 | Lead; `docs/testing/**`, `docs/operations/**` | after SPEC | completed |
| Build plan and traceability | DOC-10 | Lead; `docs/build/**`, `docs/TRACEABILITY_MATRIX.md` | final planning phase | completed; retested |
| Integration review | DOC-11 | Fresh reviewer / Lead integration | after all docs | completed |

## Rounds

### Round 00 — Reconnaissance

Gap:
The repository is empty and has no application architecture, package manager, tests, CI, Docker, migration history, or existing documentation.

Evidence:
`pwd` → `/home/ricardo/Área de trabalho/cvg-diagnostic-hub`; `ls -la` → only `.` and `..`; `git status` and `git log` → not a Git repository; `rg --files` for manifests/docs → no matches.

Root cause:
FACT: this is a new documentation-first project, not an existing codebase to extend.

Change:
Freeze a documentation-only quality bar and record the absence of architecture as a fact. Do not install dependencies or create product code.

Retest:
Pending creation of the documentation tree and validator.

Critic:
Not yet commissioned; reconnaissance is direct evidence from the filesystem.

Next largest gap:
Create Discovery and Event Storming while keeping supplied operational descriptions separate from validated facts.

### Round 01 — Documentation wave and first independent critique

Gap:
The first complete document wave had an incomplete aggregate-state contract: requests with all results released/reviewed had no explicit aggregate outcome; completion had no explicit API/policy; phase-specific cancellation was incomplete. The critic also found coarse permissions, non-canonical backlog dependencies, test/backlog mismatch and stale status/classification markers.

Evidence:
`bash scripts/validate-docs.sh` passed with 55 required files, but independent Critic decision was `REJECT` with high-confidence critical findings in `SYSTEM_SPEC.md`, `STATE_MACHINES.md`, `API_SPEC.md`, `PERMISSIONS.md` and `BACKLOG.md`.

Root cause:
The documentation wave was assembled around the happy path before independently checking every aggregate outcome and command against the API/action matrix.

Change:
Add aggregate `RESULTS_AVAILABLE`, explicit completion policy plus `/diagnostic-items/{id}/complete`, phase-safe cancel/void rules, granular draft/void/upload/download permissions, canonical `BLD-*` dependencies/tests, alert ownership/runbook mapping, downstream knowledge-status banners and explicit final Discovery review.

Retest:
`bash scripts/validate-docs.sh` → PASS; PRD requirement/AC coverage → 42/42; local-link check → PASS; negative harness test removing `docs/prd/PRD.md` → correctly rejected.

Critic:
Fresh Critic round commissioned after the fix; result pending.

Next largest gap:
Obtain final independent decision and ensure no material state/API/traceability gap remains.

### Round 02 — State and integration repair

Gap:
Close the Round 01 critical state/API and consistency findings.

Evidence:
`SYSTEM_SPEC.md` now defines `RESULTS_AVAILABLE` and all request aggregate cases; `STATE_MACHINES.md` covers scheduled/recollection/failed/awaiting-report cancellation and automatic/manual completion; `API_SPEC.md` exposes item cancel/complete; `PERMISSIONS.md` covers draft/void/upload/finalize/download; backlog dependencies use `BLD-*` IDs.

Root cause:
Missing cross-document contract, not an application runtime defect.

Change:
Applied the coherent documentation repair and added a final reviewer request.

Retest:
`bash scripts/validate-docs.sh` → PASS (56 files); no orphan requirements or AC; no forbidden placeholders; link resolver PASS; 42 PRD requirements and 42 ACs are represented.

Critic:
Pending final independent Critic.

Next largest gap:
Final critique and completion audit.

### Round 03 — Final authorization and consistency gate

Gap:
The first final critique found that API resources had permissions in aggregate but individual endpoint actions did not have an explicit permission mapping.

Evidence:
The critique was `REJECT` with high confidence. Local audit also showed the need for a canonical permission catalog rather than relying only on action labels.

Root cause:
The API contract and the RBAC action matrix used different levels of granularity.

Change:
Added 46 canonical permission identifiers to `docs/spec/PERMISSIONS.md`, an exhaustive 54-row endpoint authorization contract to `docs/api/API_SPEC.md`, and a `Permission(s)` column to all 17 API operation traceability rows. The map covers query, command, attachment, notification, configuration, health and realtime routes.

Retest:
`bash scripts/validate-docs.sh` → PASS; local permission audit → 54 endpoint rows, 48 referenced permission IDs, 0 undefined IDs, 17/17 API trace rows with permissions; 42/42 requirements, 42/42 ACs and 28/28 backlog tasks remain covered; negative validator harness still rejects a required-file removal.

Critic:
Fresh independent final reviewer using a compatible model returned `APPROVE` and found no remaining gaps.

Next largest gap:
Human validation of hospital policy and implementation evidence, which is outside this documentation-only goal and explicitly tracked as an input to BUILD.

## Open Gaps

- Operational workflows, role boundaries, SLA clocks, critical-value policy and retention rules still require validation with the hospital stakeholders; they are explicitly tracked in `docs/discovery/OPEN_QUESTIONS.md`.
- There is no executable application, so runtime/API/security/performance evidence cannot yet be claimed. The current goal is documentation readiness, not production readiness.
- Independent reviews rejected concrete gaps in earlier rounds; all findings were fixed and the final independent review approved the current documentation set.

## Stop Decision

- State: STOP
- Reason: All required documentation quality-bar criteria pass, the final independent reviewer approved the repaired contract, and no required work remains within the documentation-only goal.
- Last integrated verification: `bash scripts/validate-docs.sh`; canonical permission/endpoint audit; 42/42 requirement and AC coverage; 28/28 backlog coverage; local-link and negative-harness checks; final independent `APPROVE`.
- Next largest gap: Resolve the human validation questions in `docs/discovery/OPEN_QUESTIONS.md` before BUILD and obtain runtime evidence; these are explicit next-phase gates, not unfinished documentation work.

## Build Extension — 2026-08-19

### Goal

Implement the documented CVG Diagnostics Hub as a runnable, testable modular monolith, covering the planned M0–M8 slices and preserving the documented safety boundary: synthetic/local data only, configurable clinical policies, no invented critical-result thresholds, no production deployment, and no claim of hospital approval.

### Quality Bar v2 — frozen before implementation

| ID | Dimension | Criterion | Target | Evidence method | Required | Priority | Baseline |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUILD-1 | Runtime | The real artifact starts from a clean checkout with documented configuration | `npm ci` + `npm run build` + `npm run start` serve the web/API | yes | critical | no application |
| BUILD-2 | Foundation/API | Versioned API, safe envelope/errors, correlation and health are executable | `/api/v1/livez`, `/api/v1/readyz`, validation, `X-Correlation-Id`, stable error envelope pass contract tests | yes | critical | no endpoints |
| BUILD-3 | Data integrity | PostgreSQL schema/migrations encode core relationships, audit, idempotency and outbox | disposable PostgreSQL migration/seed/rollback smoke passes; no in-memory-only clinical path | yes | critical | no DB |
| BUILD-4 | Domain | Request/item state machines, aggregate status, samples, imaging and result version rules are enforced | unit + API integration tests cover valid/invalid/terminal/concurrent transitions | yes | critical | no domain |
| BUILD-5 | Access | Session, CSRF, RBAC and resource/department scope are server-side and deny by default | auth/security tests cover expiry/revocation, wrong role/scope, guessed IDs and safe errors | yes | critical | no auth |
| BUILD-6 | Core journeys | Lab normal/recollection, RX, US schedule, request/cancel and result release/view/review/amend/void work end-to-end | API + browser E2E with synthetic fixtures; reload preserves truth | yes | critical | no journeys |
| BUILD-7 | Communication/realtime | Durable notifications, critical acknowledgement gate, SSE invalidation/reconnect and fallback are real | integration/network tests prove no false clinical success, dedupe and resync behavior | yes | high | no notification |
| BUILD-8 | Operations | scoped search, queues/SLA, event-derived timeline, dashboard, observability and safe attachment flow work | API/integration/UI checks, parameterized queries, quarantine/private download and metrics/correlation evidence | yes | high | no operations |
| BUILD-9 | UX/accessibility | Operational screens expose next action and loading/empty/error/partial/offline/permission states | Playwright at desktop/tablet/mobile plus keyboard/axe/manual inspection; no color-only status | yes | high | no UI |
| BUILD-10 | Quality/security | Tests are first-class and business-code coverage is at least 80% | unit/integration/API/E2E/security suites pass; `npm run test:coverage` meets threshold; audit/secret scans clean | yes | critical | no tests |
| BUILD-11 | Ops/recovery | Dev/test environment, synthetic seed, backup/restore and release/runbook evidence are executable or clearly gated | compose/migration/backup/restore smoke scripts and readiness docs; OQ gates remain explicit | yes | high | no ops |
| BUILD-12 | Traceability | Implemented slices map back to requirements/tasks and docs state the actual build status | traceability/backlog/status updates and final requirement audit | yes | high | all tasks planned |

### Build workstreams and ownership

- Foundation/contracts: root config, `apps/web`, `apps/api`/API routes, `packages/contracts`, `packages/config`, migrations and scripts.
- Domain/application: `src/server` modules for identity, registry, catalog, diagnostics, lab, imaging, results, notifications, audit and operations.
- Web/UX: `src/app`, `src/components`, `src/styles`, Playwright flows.
- Verification/operations: tests, fixtures, compose, backup/restore and security checks.

Shared contracts are integrated by the Lead sequentially. No implementation claim is accepted from a Builder without raw test/runtime evidence; independent review is required before the final verdict.

### Baseline

- `bash scripts/validate-docs.sh` → PASS (56 documentation files).
- `node v22.22.2`, `npm 10.9.7`, `pnpm 10.33.0`, `bun 1.3.14`, Docker 29.7.2 available.
- No `package.json`, source, migration, test, CI or running artifact exists.
- No `.git` metadata exists; pre-existing documentation and `.gauntlet` history are preserved.

### Round 00B — Build baseline and frozen bar

Gap:
The prior documentation goal is complete, but every implementation task and all runtime evidence are absent.

Evidence:
`rg --files -g '!docs/**'` shows only `README.md`, `QUESTIONS.md` and `scripts/validate-docs.sh`; `README.md` and `DISCOVERY.md` explicitly say phase documental/no application.

Root cause:
The repository was intentionally stopped after documentation readiness.

Change:
Start the authorized BUILD extension with Quality Bar v2 above; keep clinical/identity/retention gates configurable and visible.

Retest:
Pending first failing tests and runtime bootstrap.

Critic:
Independent planning review commissioned; implementation critic required after first artifact wave.

Next largest gap:
Create the first failing tests and foundation workspace without hiding domain requirements behind a fake demo.

### Round 01 — Foundation and first runnable vertical slices — 2026-08-19

Gap:
The frozen documentation bar had no executable artifact, persistence boundary, API or user-facing workflow.

Evidence:
The repository now contains a Next.js 16/React/TypeScript modular monolith, shared contracts, versioned API envelope, opaque sessions, CSRF, RBAC/scope, synthetic fixtures, PostgreSQL migration/seed/smoke scripts and responsive operational screens. Typecheck, lint and production build passed.

Root cause:
The missing implementation was expected after the documentation-only phase; no prior runtime contract could be reused.

Change:
Built the foundation through vertical slices: request context and multi-item request, Lab sample/recollection, RX/US procedures, versioned results, local attachment lifecycle, notifications, queues/search/timeline/dashboard and browser shell.

Retest:
Unit/API and integration tests passed; PostgreSQL migration, synthetic seed and persistence smoke passed. The local runtime is explicitly synthetic and not hospital-approved.

Critic:
Initial read-only evidence review completed. A compatible independent reviewer was commissioned for the final implementation audit; one reviewer profile was unavailable in the harness.

Next largest gap:
Security-scope proof, operational hardening and cross-viewport browser verification.

### Round 02 — Integrity, files, persistence and catalog hardening — 2026-08-19

Gap:
The first artifact wave needed stronger upload integrity, durable database evidence, versioned catalog mutations and a complete command idempotency boundary.

Evidence:
Checksum and byte-size verification now happen before storage; MIME signature and quarantine rules are enforced; private responses redact `storageKey`; Postgres transactions project audit/outbox records; service/reason-code administration is permissioned, versioned and audited; mandatory idempotency keys are enforced for release/amend/void/recollection/cancel/review/complete/finalize.

Change:
Added optimistic-version checks, draft editing, catalog create/update commands, catalog API schemas, attachment expiry/checksum tests and PostgreSQL smoke coverage. The runtime refuses critical-result activation while the clinical policy flag is disabled.

Retest:
`npm test -- --run` → 46 tests passed; `npm run test:coverage` → 95.49% lines/statements, 93.98% functions, 80.18% branches; `npm audit --audit-level=high` → 0 vulnerabilities; PostgreSQL migration/seed/smoke → PASS.

Critic:
Local security review identified service-to-service request item overexposure in public command/read responses; it was fixed in the next round with a regression test.

Next largest gap:
Cross-department response filtering and end-to-end evidence across the three viewport projects.

### Round 03 — Scope isolation and browser verification — 2026-08-19

Gap:
Executor reads and command responses could expose unrelated department item IDs; the first Playwright matrix also exposed a host-browser tablet launch issue, duplicate fixture collisions and a hidden mobile protocol.

Change:
Added department-aware patient/request/item/result views, filtered command responses, service-scoped search/timeline/dashboard visibility, and a regression proving Lab cannot receive Radiology item IDs. Playwright tablet uses a stable emulated viewport with the host Chrome; each project uses an isolated request scenario; mobile keeps the protocol visible.

Retest:
Playwright desktop/tablet/mobile → 9/9 passed. API replay tests cover bounded SSE `Last-Event-ID`, `retry: 5000` and `resync_required`. `/readyz` now verifies the configured runtime store instead of returning readiness unconditionally.

Critic:
The available reviewer profile that required `gpt-5.3-codex` was rejected by the account harness; a compatible default reviewer remained pending at the time of this state write.

Next largest gap:
Final independent review and documentation/status synchronization.

### Round 04 — Final verification and bounded stop — 2026-08-20

Gap:
Implementation evidence and the normative documentation still diverged on what was local, partial, gated or pending; the gauntlet progress file also described the pre-build repository.

Change:
Synchronized README, Build Plan, backlog, traceability, API/System/Test/Operations status and this state file. The status is conservative: local workflows are complete within the synthetic MVP boundary; production object storage/AV, durable notification worker/escalation, transfer/alta policy, critical-result policy, performance, accessibility, restore drill, CI and pilot approval remain explicit gates.

Retest:
Current evidence is tracked in the final handoff: 47 Vitest tests, coverage above the 80% threshold, typecheck/lint/build, compiled `next start` plus `/livez` smoke, PostgreSQL migration/seed/smoke, 9/9 Playwright flows, docs validator and high-severity npm audit. No Git history exists in this workspace, so no commit/PR evidence can be claimed.

Critic:
The final implementation audit was attempted with the available compatible default reviewer; the unsupported reviewer profile is recorded above. Remaining gaps are policy/operations or deliberately bounded production integrations, not hidden clinical assumptions.

Stop decision:
Complete the local implementation goal at the documented safety boundary. Do not call the artifact production-ready; the remaining gates require hospital/TI decisions or external infrastructure and cannot be safely invented in code.

## Build Extension v3 — 2026-08-20 — 95/100 hardening

### Goal

Elevar cada dimensão do build local para uma barra alvo de 95/100, criar roadmap/backlog executáveis, implementar as melhorias técnicas seguras e deixar explícitos os gates que dependem de decisão clínica, TI ou aceite hospitalar.

### Frozen bar

The canonical scorecard is [`docs/build/QUALITY_SCORECARD_95.md`](../docs/build/QUALITY_SCORECARD_95.md). The 12 dimensions remain BUILD-1 through BUILD-12. Baseline scores are evidence-backed local estimates; target is >=95 for every dimension. `BLOCKED EXTERNAL` is not silently converted into a code pass.

### Round 05 — Plan and baseline

Gap:
The previous local MVP had explicit production gaps but no execution contract aimed at 95/100, no incremental backlog for those gaps and no separated roadmap for technical versus external gates.

Change:
Added the 95/100 scorecard, roadmap and executable backlog; linked them from the documentation map and Build Plan; started a new gauntlet round without deleting the previous implementation history.

Retest:
`bash scripts/validate-docs.sh` → PASS; baseline `npm test -- --run` → 47 tests passed; previous coverage/typecheck/lint/build/Postgres/E2E/audit evidence remains valid as the starting point.

Next largest gap:
Implement W1 foundation changes first, then close durable event, observability/storage/recovery, performance and accessibility evidence in the order defined by `docs/build/ROADMAP_95.md`.

### Round 06 — Independent critique closure and final retest — 2026-08-20

Independent critique:
The read-only explorer found no critical vulnerability or false production-ready claim. It identified four high-priority technical gaps: active SSE connections were not reflected in metrics, outbox oldest-age/readiness-failure gauges were not refreshed, readiness checked only basic connectivity, and failure/degradation coverage was thin. It also reaffirmed that accessibility, proxy trust, hospital identity, critical-result policy, AV/object storage, RPO/RTO and pilot evidence remain conditional or external.

Changes:
- `src/server/observability/metrics.ts` now refreshes bounded outbox depth/age, tracks readiness failures and active SSE connections without event identifiers.
- `src/app/api/v1/[...path]/route.ts` keeps SSE open by default with heartbeat, counts connections cleanup-safely, supports an optional `REALTIME_STREAM_MAX_MS` cap, and reports readiness failures.
- `MemoryStore`, `PostgresStore` and `LocalFileStore` readiness checks now validate state shape, applied runtime schema and local writability; PostgreSQL `/readyz` was exercised against the live disposable development database.
- Added regression tests for readiness failure, active SSE disconnect cleanup, metric refresh/privacy and operational gauge behavior; updated realtime/observability contracts and `.env.example`.

Final retest:
`npm run validate` → 62 tests, 95.71% lines, 81.12% branches; `npm test -- --run` → 62/62; `npm run build` → PASS; Playwright desktop/tablet/mobile → 15/15 with selected axe rules; memory and PostgreSQL `/readyz` → 200; perf smoke → 100/100 successful reads, p95 54.7 ms; PostgreSQL migration/smoke → PASS; disposable backup/restore → PASS (`1|12|6`); OpenAPI (40 paths), documentation validator (56 files), secret scan and `npm audit --audit-level=high` → PASS.

Decision:
Local technical gates are complete at the synthetic-MVP boundary and score >=95 in all 12 dimensions. Release remains `NOT READY` for hospital use until external evidence closes the conditional/blocked rows; no clinical threshold, SLA, fallback, ownership or retention policy was invented.
