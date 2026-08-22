# Premium enterprise MVP — Quality Bar v4

**Frozen at:** 2026-08-22T02:24:52Z
**Applies to:** the executable local/synthetic CVG Diagnostics Hub artifact
**Release posture:** `NOT READY` for hospital or production use

This bar supersedes the local 95/96 score claims recorded on 20 August 2026. Those
claims remain useful as historical evidence, but they are not a current acceptance
decision: a standards-based OpenAPI linter reports 51 errors, the automated suite
does not exercise PostgreSQL, and an independent security audit reproduced HIGH
confidentiality and integrity defects.

## Rules of evidence

- A criterion is `PASS` only when its exact procedure is rerun against the current
  revision and the raw result is recorded.
- Presence of a route, test name, document, or status label is not proof of behavior.
- Every behavioral change starts with a failing regression test.
- Memory-store tests cannot prove PostgreSQL behavior; mocked browser routes cannot
  prove an end-to-end clinical journey.
- External clinical, hospital, infrastructure, and acceptance decisions remain
  blocked until their responsible authority supplies evidence. Fixtures never close
  those gates.
- No aggregate score can hide a failed required criterion.

## Frozen required criteria

| ID | Required outcome | Acceptance target | Evidence |
| --- | --- | --- | --- |
| V4-SEC-01 | Unreleased and voided results remain confidential | Clinical readers cannot fetch result, report, or version history before release; every permitted read is audited | negative API/service tests plus audit inspection |
| V4-SEC-02 | Actor/resource/action authorization is exact | Draft edit requires author ownership, department, and service scope; all mismatches deny | two-actor/two-service regression matrix |
| V4-SEC-03 | Bootstrap fails closed | Non-test startup cannot create an ADMIN with a known/default password or silently select memory persistence | configuration tests and production-start smoke |
| V4-DOM-01 | One canonical result exists per item | Sequential and concurrent draft creation preserve one result lineage and an explicit version contract | unit and PostgreSQL concurrency tests |
| V4-DOM-02 | Result lifecycle is unambiguous | release, review, amend, re-review and void invariants are consistent in model, API, docs and UI | state-transition matrix and journey tests |
| V4-DB-01 | Durable behavior is exercised | Disposable PostgreSQL tests cover critical writes, reload, rollback and projections | automated integration suite in CI-equivalent environment |
| V4-DB-02 | Multiple instances observe current security state | Session revocation, role/scope changes and SSE authorization in instance A are immediately effective in B | two-store PostgreSQL integration test |
| V4-DB-03 | Persistence architecture matches its contract | Operational data uses reviewable relational constraints/indexes, or docs explicitly and consistently define a safe migration boundary | migration inspection, schema tests and query plans |
| V4-API-01 | The public contract is standard and exact | OpenAPI has zero semantic errors; every runtime operation, path parameter, auth rule, header, request and response is modeled | standards linter plus runtime-manifest drift test |
| V4-API-02 | Request parsing is bounded and strict | JSON byte size, nesting and schema are bounded at the HTTP boundary; malformed/oversized inputs fail safely | route-level negative tests |
| V4-OPS-01 | Async delivery has ownership semantics | Notification state follows sink confirmation; outbox completion requires an unexpired claim token/owner | two-worker lease-race tests |
| V4-OPS-02 | Production controls are not simulated | Distributed rate limiting and external malware scanning are required outside explicit local/test mode | config fail-closed tests and adapter contract tests |
| V4-ARCH-01 | The implemented architecture is maintainable | Actual Next.js architecture is documented; domain modules are cohesive, acyclic and no production source file exceeds 800 lines | architecture fitness checks plus review |
| V4-UX-01 | Critical journeys are real | Lab/recollection, RX, ultrasound/reschedule, result release/amend/void/review, attachment and notification journeys run without mocked mutation routes | Playwright against served app and PostgreSQL |
| V4-UX-02 | Interaction quality is accessible and resilient | Critical paths work by keyboard without `force`, across three viewports, with complete axe scan and visible loading/empty/error/degraded states | Playwright, axe and screenshot inspection |
| V4-DOC-01 | Documentation is internally consistent | current-vs-target architecture, result lifecycle, upload protocol, auth matrix, scope, owners and external gates have one non-contradictory contract | docs validator plus requirement-by-requirement review |
| V4-TRACE-01 | Evidence is traceable, not presence-only | each MUST/acceptance criterion links to executable test IDs, implementation surface and fresh result | traceability validator and ledger inspection |
| V4-REG-01 | No regression is hidden | typecheck, lint, build, >=80% statements/branches/functions/lines, dependency/security scans, DB/restore/perf/E2E/accessibility gates all pass | clean full verification run |
| V4-CRITIC-01 | Closure survives fresh criticism | an independent read-only reviewer finds no unresolved CRITICAL/HIGH local defect; lower findings are fixed or explicitly accepted by authority | post-fix review packet and retest |

## External release gates

| Gate | Required owner | Exit evidence | Current state |
| --- | --- | --- | --- |
| Hospital identity, ownership, transfer and discharge policy | hospital product/security owner | approved policy and integration evidence | `BLOCKED EXTERNAL` |
| Delegated-manager authority and department scope | hospital security/operations owner | approved role matrix and accountable owner | `BLOCKED EXTERNAL` |
| Critical-result thresholds, fallback and escalation | clinical governance owner | signed policy and exercised workflow | `BLOCKED EXTERNAL` |
| Production object storage, malware scanner and secrets | infrastructure/security owner | configured service, recovery and security evidence | `BLOCKED EXTERNAL` |
| Retention, residency, RPO and RTO | privacy/infrastructure owner | approved policy and restore evidence | `BLOCKED EXTERNAL` |
| Representative load, manual accessibility, clinical acceptance and pilot | product/clinical owner | witnessed acceptance packet and rollback authority | `BLOCKED EXTERNAL` |

The local implementation may prepare safe integration boundaries for these gates,
but it must not invent their values or mark the release ready.

## Work order

1. Lock the reproduced security and clinical-integrity defects with RED tests.
2. Fix those defects without widening permissions or changing unapproved policy.
3. Make the API contract standard and bound every request body.
4. Prove durable and cross-instance behavior on disposable PostgreSQL.
5. Correct outbox, rate-limit and malware-scanning production boundaries.
6. Split the application service along domain boundaries while keeping tests green.
7. Complete real browser journeys and accessibility evidence.
8. Reconcile every document and traceability edge with the implemented artifact.
9. Run the complete artifact, obtain fresh criticism, fix the largest remaining gap,
   and repeat until every required local criterion passes.
