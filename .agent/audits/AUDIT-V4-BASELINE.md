# Audit — CVG Diagnostics Hub pre-v4 baseline

## Record and scope

- Audit ID: `AUDIT-V4-BASELINE`
- Trigger/goal: verify whether the documented 95/96 local score is reproducible
  before continuing the premium enterprise MVP build.
- System/revision/environment/window: `main` at `7728140`, local synthetic data,
  Node/Next workspace, 2026-08-22T02:24:52Z.
- Included boundaries: every file under `docs/`, application/API/store/security code,
  automated test configuration, OpenAPI, build and local verification evidence.
- Excluded boundaries: hospital systems, production infrastructure, real clinical data,
  signed policies and human acceptance.
- Reviewer/independence: six separated read-only workstreams; the security workstream
  independently reproduced defects. Final integration is by the primary agent.

## Methods and safety

| Criterion | Procedure | Environment/data | Safety constraint | Evidence |
| --- | --- | --- | --- | --- |
| Baseline suite | `npm run validate` | local/synthetic | no external writes | 119/119 tests, coverage threshold pass |
| API semantics | `npx --yes @redocly/cli@1.34.5 lint docs/api/openapi.json --format stylish` | local contract | read-only | exit 1, 51 errors and 47 warnings |
| Documentation | split complete `docs/` inventory across six bounded audits | repository files | read-only | findings below and agent transcripts |
| Security | static inspection plus ephemeral synthetic reproductions | memory/local | no `.env` inspection; no real data | independent verdict `REJECT` |
| Architecture/data | code, migrations, scripts and test configuration inspection | repository files | read-only | findings below |

## Findings

| ID | Assessment | Actual observation | Confidence | Closure proof |
| --- | --- | --- | --- | --- |
| GAP-V4-01 | NONCOMPLIANT | `GET /results/:id`, report and history expose DRAFT/VOIDED data without the audited view workflow | high | V4-SEC-01 |
| GAP-V4-02 | NONCOMPLIANT | `result.draft.edit_own` does not require ownership and ignores `serviceCodes` | high | V4-SEC-02 |
| GAP-V4-03 | NONCOMPLIANT | missing config selects memory and a known ADMIN demo password | high | V4-SEC-03 |
| GAP-V4-04 | NONCOMPLIANT | multiple results can be created for one item and overwrite its pointer | high | V4-DOM-01 |
| GAP-V4-05 | NONCOMPLIANT | Postgres state is cached per process, including session/role/SSE security state | high | V4-DB-02 |
| GAP-V4-06 | NONCOMPLIANT | OpenAPI uses invalid `components.operations`, unresolved operation references, missing path params and permissive schemas | high | V4-API-01 |
| GAP-V4-07 | PARTIAL | ordinary JSON parsing has no effective byte/depth boundary | high | V4-API-02 |
| GAP-V4-08 | NONCOMPLIANT | Postgres persists one mutable JSONB snapshot; no automated Postgres tests exist | high | V4-DB-01/03 |
| GAP-V4-09 | NONCOMPLIANT | Playwright counts viewports as flows and mocks most clinical mutations | high | V4-UX-01/02 |
| GAP-V4-10 | NONCOMPLIANT | notification and outbox ownership semantics can report delivery or completion without authoritative confirmation | high | V4-OPS-01 |
| GAP-V4-11 | NONCOMPLIANT | default local scanner classifies content by magic bytes/EICAR only; rate limiting is per-process and spoofable when proxy trust is broad | high | V4-OPS-02 |
| GAP-V4-12 | NONCOMPLIANT | a 2,436-line shared-state service contradicts the modular architecture contract and file-size rule | high | V4-ARCH-01 |
| GAP-V4-13 | NONCOMPLIANT | result lifecycle, auth matrix, target architecture, upload protocol and readiness claims conflict across docs | high | V4-DOC-01 |
| GAP-V4-14 | NONCOMPLIANT | traceability validates presence rather than requirement-to-test execution | high | V4-TRACE-01 |

## Verdict, residual risk, and evolution

- Verification/gate decision: `FAIL` for the former local-complete claim.
- Rationale: required confidentiality, integrity, contract and durability criteria are
  not met despite the legacy aggregate score.
- Residual risk/authority: HIGH for local implementation; hospital release remains
  unauthorized and externally blocked.
- Evolution routing: `.agent/backlog.json` and
  `.agent/plans/premium-enterprise-mvp-v4.md`.
- Next gate: `IMPLEMENTATION_READY`.
- Next action: freeze the v4 plan, bind the implementation gate, then write RED tests
  for GAP-V4-01 through GAP-V4-04.
