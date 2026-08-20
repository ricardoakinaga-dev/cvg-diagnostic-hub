# Gauntlet Progress

- Goal: Elevar o CVG Diagnostics Hub do estado local atual para uma entrega local/produtiva com scorecard alvo de 95/100 por dimensão; criar plano, roadmap e backlog; implementar melhorias seguras; validar o artefato real; manter gates clínicos/operacionais explícitos.
- Phase: DISCOVER → DEFINE_BAR → BUILD → RUN → INSPECT → CRITIQUE → FIX → RETEST
- Current round: 10 (LAN development access hardening and final retest)
- Active workstreams: Foundation/contracts, durable events, observability/storage/recovery, web/UX, verification/operations.
- Frozen bar: [`docs/build/QUALITY_SCORECARD_95.md`](../docs/build/QUALITY_SCORECARD_95.md)
- Roadmap/backlog: [`docs/build/ROADMAP_95.md`](../docs/build/ROADMAP_95.md) and [`docs/build/BACKLOG_95.md`](../docs/build/BACKLOG_95.md)
- Final local verification: `npm run test:coverage` PASS (109 testes; 95.35% statements, 81.05% branches); typecheck/lint/build PASS; PostgreSQL persistence/audit/outbox smoke PASS; disposable restore PASS (`1|26|13`); Playwright 24/24 across desktop/tablet/mobile, including the LAN URL and request-detail layout; explicit accessibility suite 6/6; four-route production perf smoke 400 requests/0 errors/max p95 434.69 ms against 500 ms; OpenAPI 47 paths/docs 56 files/secret scan/audit PASS; `git diff --check` PASS.
- Current gap: the local technical bar is complete at the documented boundary; external gates remain identity/ownership hospitalar, delegated-manager policy, transferência/alta, critical-result fallback policy, AV/object storage production, retention/RPO/RTO, representative hospital workload, manual accessibility acceptance, remote CI and pilot sign-off.
- Stop rule: no score is raised without fresh evidence, and no external clinical policy is invented in code or documentation.

Next largest gap:
External evidence and named ownership. No local technical gate remains without an explicit conditional or blocked status.

## Round 10 — LAN development access hardening and final retest — 2026-08-20

Gap:
The local app rendered on `localhost`, but opening it through the machine's LAN address stayed on the loading screen. Next 16 rejected development assets from the LAN origin, and plain HTTP on the LAN did not expose `crypto.randomUUID`, which prevented login/request client actions before the API call.

Change:
Allowlisted only the current local demo host in `allowedDevOrigins`; added a `crypto.getRandomValues`/time fallback for client-generated idempotency and correlation IDs; and added regression tests covering LAN-compatible login/request submission.

Retest:
`npm run test:coverage` → 109/109, 95.35% statements and 81.05% branches; typecheck/lint/build → PASS; isolated LAN Playwright E2E → 24/24, including accessibility 6/6 and the request-detail layout regression; OpenAPI → 47 paths; docs → 56 files; secret scan, high-severity audit and diff check → PASS.

Decision:
The local LAN demo is usable at the current host address. Keep synthetic data and `NOT READY` for hospital use.

## Round 09 — Authorization hardening, stable pagination and final retest — 2026-08-20

Gap:
The previous independent audit found server-side authorization gaps for sample receipt, manager scoping, ADMIN clinical bypasses, mixed timeline contexts, notification acknowledgement, SSE revocation and sensitive role changes. It also identified offset cursors and incomplete query/OpenAPI descriptions.

Change:
Closed those local gaps with server-side department/resource checks, technical-only ADMIN permissions, manager-scoped patient/request/item/search/queue/dashboard/audit reads, matching timeline contexts, permissioned notification acknowledgement, keyset cursors, SSE authorization snapshots, password re-authentication plus expected-version/reason/confirmation controls for role changes, and aligned route schemas/OpenAPI/docs. Added a positive approved-policy test so the critical-policy guard remains executable without inventing clinical thresholds.

Retest:
`npm run test:coverage` → 107/107, 95.4% statements and 81.01% branches; typecheck/lint/build → PASS; OpenAPI → 47 paths; docs → 56 files; PostgreSQL smoke → PASS; restore smoke → PASS (`1|26|13`); production `next start` perf smoke → 400 requests, 0 errors, max p95 434.69 ms against 500 ms; Playwright E2E → 21/21; accessibility → 6/6; secret scan, high-severity audit and diff check → PASS.

Independent critique:
The compatible read-only audit returned `REJECT` with five concrete local findings: session-revoked SSE streams stayed open; a manager could complete an item outside the manager's department; notification acknowledgement lacked idempotency/version/reason/confirmation controls; timeline omitted derived Sample/ResultVersion/Procedure/Attachment events; and the OpenAPI envelope/header contract diverged from runtime. Each finding was fixed and locked by targeted regression tests and fresh gates. The specialized reviewer profile and a second post-fix explorer were unavailable in this account, so no unsupported independent approval is claimed. External gates remain blocked/conditional and are not represented as local implementation failures.

Decision:
Local technical gates are green at the synthetic/local boundary. The release remains `NOT READY` for hospital use until identity/ownership, delegated-manager policy, transfer/alta, approved critical-result fallback, production AV/object storage/credentials, retention/RPO/RTO, representative workload, manual acceptance, remote CI and pilot sign-off are evidenced by responsible owners.

## Round 07 — Workflow closure, artifact verification and final retest — 2026-08-20

Implementation closure:
The documented priority gaps are implemented locally: patient/encounter context replaces hardcoded request context; queue, request detail and result detail expose server-confirmed next actions; dashboard and indicators retain partial data and surface retry/degraded states; patient, indicators and administration surfaces are available with explicit permission denial; catalog/reason reads and scoped diagnostics/audit/report reads are versioned API paths; command bodies and streamed attachment bodies are bounded and validated; client errors are safe by code rather than raw server message.

Independent evidence:
The compatible default reviewer was commissioned for a fresh read-only audit after the unavailable specialized reviewer profile, but the harness did not return a result within the finalization window and the agent was shut down. A fresh local read-only audit was completed instead; no reviewer result is converted into an approval without concrete evidence.

Fresh retest:
`npm run validate` → PASS, 93 tests, 94.39% statements, 80.3% branches; `npm run build` → PASS; production `next start` → ready on port 3000; `npm run test:e2e` → 21/21 across chromium, tablet and mobile; `npm run test:accessibility` → 6/6; `DATABASE_URL=... npm run db:smoke` → PASS; `ALLOW_DB_RESTORE_SMOKE=true npm run db:restore:smoke` → PASS (`1|18|9`); `BASE_URL=http://localhost:3000 PERF_REQUESTS=100 PERF_CONCURRENCY=10 PERF_WARMUP=10 npm run perf:smoke` → 0 errors, p95 134.54 ms; outbox one-shot → PASS; `npm run validate:openapi` → 44 paths; `npm run validate:docs` → 56 files; `npm run security:scan` and `npm audit --audit-level=high` → PASS; `git diff --check` → PASS.

Decision:
All local technical gates are green at the synthetic/local boundary. The release remains `NOT READY` for hospital use because identity/ownership, transfer/alta, critical-result thresholds/fallback, production AV/object storage/credentials, retention/RPO/RTO, representative hospital workload, manual clinical/accessibility acceptance, remote CI and pilot sign-off remain external gates.

## Round 08 — Contract slices, representative local workload and retest — 2026-08-20

Gap:
The Round 07 audit identified local contract gaps in indicator definitions, request/search/timeline query semantics, user/role administration and performance evidence limited to one catalog endpoint. The independent audit also found that critical-result fallback, transfer/alta and production object-storage recovery must remain external gates.

Change:
Added a single-snapshot dashboard indicator contract with explicit numerator/denominator/definition/next-action fields; corrected `newResults` to count only released results awaiting review; added validated request filters, typed scoped search results and stable cursor metadata for search/timeline; added ADMIN-only versioned/audited user-role administration with safe user fields and controlled UI; aligned API/OpenAPI/docs contracts; expanded perf smoke to diagnostic services, requests, search and dashboard.

Retest:
`npm test -- --run` → 102/102; `npm run test:coverage` → 94.69% statements and 80.23% branches; `npm run typecheck`/`npm run lint`/`npm run build` → PASS; `npm run validate:docs` → 56 files; `npm run validate:openapi` → 46 paths; PostgreSQL smoke → PASS; restore smoke → PASS (`1|20|10`); perf smoke → 400 requests, 0 errors, max p95 346.03 ms against 500 ms; `npm run security:scan` and `npm audit --audit-level=high` → PASS; clean Playwright-managed dev run → E2E 21/21 and accessibility 6/6. A stale reused production server initially caused a transient E2E rate-limit failure after the benchmark; it was resolved by rerunning with the configured isolated test server and is not counted as artifact evidence.

Independent critique:
A specialized reviewer profile was rejected by the account harness because its fixed model is unsupported. A compatible default read-only reviewer was commissioned for the final diff; its result is pending and must be integrated before the final commit decision.

Decision:
Local implementation evidence is green at the synthetic boundary, but the release remains `NOT READY` for hospital use. Critical-result fallback/escalation, transfer/alta/ownership, production AV/object storage/credentials, approved retention/RPO/RTO, representative hospital load, manual accessibility/clinical acceptance, remote CI and pilot sign-off remain conditional or blocked external gates.
