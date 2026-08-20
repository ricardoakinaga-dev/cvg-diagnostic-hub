# Technical backlog

**Knowledge status (20/08/2026):** `DECISION/PLAN + BUILD STATUS`; IDs continuam sendo unidades de rastreabilidade, e a tabela de status abaixo distingue implementação local, parcial e gates ainda não resolvidos.

Para a execução incremental dos gates remanescentes, use [`BACKLOG_95.md`](BACKLOG_95.md), com barra e roadmap em [`QUALITY_SCORECARD_95.md`](QUALITY_SCORECARD_95.md) e [`ROADMAP_95.md`](ROADMAP_95.md). Este backlog histórico permanece para preservar a ligação com os requisitos originais.

Tasks are intentionally small vertical slices. The current artifact is a single Next.js modular monolith; ownership paths in older rows remain target boundaries until the module split is justified.

| ID | Milestone | Requirement IDs | Description | Dependencies | Expected ownership | Acceptance/evidence | Tests | DoD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BLD-FOUND-001 | M0 | NFR-API-001,NFR-OBS-001 | Workspace, config validation, API envelope, correlation and health | — | `apps/api`, `packages/contracts` | running `/livez`/`/readyz`, safe error envelope | TEST-NFR-API-001,TEST-NFR-OBS-001 | lint/type/build/docs |
| BLD-FOUND-002 | M0 | NFR-SEC-001,NFR-REL-001,NFR-SEC-004,FR-AUD-001 | DB migration runner, session/idempotency/audit/outbox base tables | BLD-FOUND-001 | `apps/api/db` | disposable DB migrates and rolls forward | TEST-NFR-REL-001,TEST-NFR-SEC-004,TEST-FR-AUD-001 | migration/rollback evidence |
| BLD-FOUND-003 | M0 | NFR-UX-002 | app shell, tokens, status/priority/error/loading primitives | BLD-FOUND-001 | `apps/web` | keyboard/focus baseline and no fake actions | TEST-NFR-UX-002 | visual/accessibility checks |
| BLD-ID-001 | M1 | FR-AUTH-001,NFR-SEC-001 | Secure session login/logout with provider port | BLD-FOUND-002 | Identity module | session cannot be forged/reused after revoke | TEST-NFR-SEC-001 | security review |
| BLD-ID-002 | M1 | FR-AUTH-001 | roles/departments/scope policy and middleware | BLD-ID-001 | Identity + policy | matrix decisions enforced server-side | TEST-FR-AUTH-001 | unit/integration |
| BLD-REG-001 | M1 | FR-DATA-001 | Patient/Encounter/Admission/ExternalReference queries and homonym card | BLD-ID-002 | Registry + web | context relationship and safe identity bundle | TEST-FR-DATA-001 | E2E/accessibility |
| BLD-CAT-001 | M2 | FR-CORE-002,FR-IMG-003,FR-ADMIN-001 | seed/configure DiagnosticService, capabilities and reasons | BLD-ID-002 | Catalog | workflow type/capabilities versioned | TEST-FR-CAT-001,TEST-FR-IMG-003,TEST-FR-ADMIN-001 | migration/API |
| BLD-REQ-001 | M2 | FR-CORE-001,FR-CORE-002,FR-CORE-003 | create multi-item request/protocol sequence | BLD-REG-001,BLD-CAT-001 | Diagnostics | server context + unique human code | TEST-FR-CORE-001,TEST-FR-CORE-002,TEST-FR-CORE-003 | integration/E2E |
| BLD-REQ-002 | M2 | FR-CORE-004,FR-CORE-005,FR-CORE-006 | duplicate warning, transfer/alta, cancellation and idempotency | BLD-REQ-001 | Diagnostics/web | warning/override, phase-safe cancellation and no auto-cancel | TEST-FR-CORE-004,TEST-FR-CORE-005,TEST-FR-CORE-006 | security/E2E |
| BLD-LAB-001 | M3 | FR-LAB-001 | sample/accession receive and item links | BLD-REQ-001 | Lab | one sample/many items with constraints | TEST-FR-LAB-001 | integration |
| BLD-LAB-002 | M3 | FR-LAB-002 | lab queue and processing transition | BLD-LAB-001 | Lab/web | priority/SLA/next action, no invalid state | TEST-FR-LAB-002 | E2E |
| BLD-LAB-003 | M3 | FR-LAB-003 | reject/recollection/replacement chain | BLD-LAB-001 | Lab | reason + notification/audit + new sample | TEST-FR-LAB-003 | E2E/security |
| BLD-IMG-001 | M4 | FR-IMG-001 | RX perform/report path without lab-only states | BLD-REQ-001 | Imaging | procedure/report lifecycle | TEST-FR-IMG-001 | integration/E2E |
| BLD-IMG-002 | M4 | FR-IMG-002 | US schedule/reschedule/forward path | BLD-IMG-001 | Imaging/web | conflict/history/next action | TEST-FR-IMG-002 | E2E/accessibility |
| BLD-RES-001 | M5 | FR-RESULT-001 | result draft/schema and release transaction | BLD-LAB-002,BLD-IMG-001 | Results | current version, item state, audit/outbox atomic | TEST-FR-RESULT-001 | integration |
| BLD-RES-002 | M5 | FR-RESULT-002,FR-RESULT-003 | immutable version, amend, view/review/reopen | BLD-RES-001 | Results/web | old version retained; stale review conflict | TEST-FR-RESULT-002,TEST-FR-RESULT-003 | E2E |
| BLD-FILE-001 | M5 | FR-FILE-001,NFR-SEC-003 | upload session/finalize/scan/private download | BLD-RES-001 | Files/storage | invalid/quarantine never released | TEST-FR-FILE-001,TEST-NFR-SEC-003 | security/integration |
| BLD-NOTIF-001 | M6 | FR-NOTIF-001,FR-AUD-001 | inbox, durable delivery and acknowledgement | BLD-RES-001 | Notifications | dedupe, deep link, audit | TEST-FR-NOTIF-001 | integration/E2E |
| BLD-NOTIF-002 | M6 | FR-RESULT-004 | critical policy, escalation and re-notification; gated by approved OQ-005 | BLD-NOTIF-001 | Notifications/clinical policy | ack required, no hardcoded thresholds, OQ-005 resolved before activation | TEST-FR-RESULT-004 | failure injection/E2E |
| BLD-RT-001 | M6 | FR-NOTIF-002,NFR-REL-002 | SSE event stream, replay/fallback/degraded UI | BLD-NOTIF-001 | API/web | versioned invalidation and refetch | TEST-REALTIME-001,TEST-NFR-REL-002 | network E2E |
| BLD-OPS-001 | M7 | FR-OPS-001,FR-OPS-002 | queue filters, SLA projection and overdue jobs | BLD-REQ-001,BLD-LAB-002,BLD-IMG-002 | Operations/web | explainable ordering/overdue | TEST-FR-OPS-001,TEST-FR-OPS-002 | integration/perf |
| BLD-SEARCH-001 | M7 | FR-OPS-003 | indexed global search/cursor/homonym safety | BLD-REG-001,BLD-REQ-001 | Search/web | exact code and scoped text search | TEST-FR-OPS-003 | API/perf/security |
| BLD-TIME-001 | M7 | FR-OPS-004 | event-derived timeline/deep links | BLD-RES-002,BLD-NOTIF-001 | Audit/Operations/web | rebuildable, no duplicate truth | TEST-FR-OPS-004 | integration/E2E |
| BLD-DASH-001 | M7 | FR-OPS-005 | actionable dashboard/metric definitions | BLD-OPS-001,BLD-TIME-001 | Operations/web | overdue/critical/recollect cards | TEST-FR-OPS-005 | visual/perf |
| BLD-HARD-001 | M8 | NFR-UX-001,NFR-UX-002 | responsive, keyboard, states and task-time tuning | BLD-REQ-001,BLD-REQ-002,BLD-LAB-001,BLD-LAB-002,BLD-LAB-003,BLD-IMG-001,BLD-IMG-002,BLD-RES-001,BLD-RES-002,BLD-FILE-001,BLD-NOTIF-001,BLD-NOTIF-002,BLD-RT-001,BLD-OPS-001,BLD-SEARCH-001,BLD-TIME-001,BLD-DASH-001 | Web | desktop/tablet/mobile evidence | TEST-NFR-UX-001,TEST-NFR-UX-002 | accessibility/E2E |
| BLD-HARD-002 | M8 | NFR-PERF-001,NFR-PERF-002 | representative load/index/query review | BLD-OPS-001,BLD-SEARCH-001 | API/DB | p95/p99/error targets recorded | TEST-NFR-PERF-001,TEST-NFR-PERF-002 | benchmark |
| BLD-HARD-003 | M8 | NFR-OPS-001,NFR-OBS-001 | backup/restore, alerts, release/rollback runbooks | BLD-FOUND-001,BLD-FOUND-002,BLD-FOUND-003,BLD-ID-001,BLD-ID-002,BLD-REG-001,BLD-CAT-001,BLD-REQ-001,BLD-REQ-002,BLD-LAB-001,BLD-LAB-002,BLD-LAB-003,BLD-IMG-001,BLD-IMG-002,BLD-RES-001,BLD-RES-002,BLD-FILE-001,BLD-NOTIF-001,BLD-NOTIF-002,BLD-RT-001,BLD-OPS-001,BLD-SEARCH-001,BLD-TIME-001,BLD-DASH-001 | Ops/TI | isolated restore meets approved target | TEST-NFR-OPS-001,TEST-NFR-OBS-001 | drill/evidence |
| BLD-HARD-004 | M8 | all release gates | security review, E2E critical journeys, pilot package | BLD-HARD-001,BLD-HARD-002,BLD-HARD-003 | Lead + independent reviewer | no critical/high gap; sign-off | TEST-RELEASE-001 | release checklist |

## Current implementation status

| Status | Tasks | Evidence/limit |
| --- | --- | --- |
| implemented locally | `BLD-FOUND-001`, `BLD-FOUND-002`, `BLD-FOUND-003`, `BLD-ID-001`, `BLD-ID-002`, `BLD-REG-001`, `BLD-CAT-001`, `BLD-REQ-001`, `BLD-LAB-001`, `BLD-LAB-002`, `BLD-LAB-003`, `BLD-IMG-001`, `BLD-IMG-002`, `BLD-RES-001`, `BLD-RES-002`, `BLD-FILE-001`, `BLD-NOTIF-001`, `BLD-RT-001`, `BLD-OPS-001`, `BLD-SEARCH-001`, `BLD-TIME-001`, `BLD-DASH-001`, `BLD-HARD-001`, `BLD-HARD-002`, `BLD-HARD-003` | Local runtime, leased outbox/realtime, storage adapter, observability, perf, accessibility, restore smoke and security evidence are executable. |
| partial | `BLD-REQ-002`, `BLD-HARD-004` | Transfer/alta and pilot release remain external; local code refuses unsupported clinical transitions. |
| gated | `BLD-NOTIF-002` | Critical-result thresholds, acknowledgement SLA and fallback channel require OQ-005/OQ-018 approval; bare environment flag is insufficient. |
| pending | none for the local technical bar | Production evidence and hospital acceptance are tracked as external gates, not hidden implementation work. |

This status is deliberately conservative: a passing local test is evidence for the local synthetic slice, not proof of hospital policy, production availability or clinical safety.
