# Production readiness

**Knowledge status:** `DECISION` de gates; o status atual é uma avaliação documental, não evidência de produção.

Status: `NOT READY` until implementation, operational validation and human gates exist. This checklist defines what “ready” must prove.

## Local MVP evidence (20/08/2026)

The local synthetic artifact has executable evidence for session/RBAC/CSRF/scope, API envelopes and health, core Lab/RX/US/result/file flows, scoped search/filter/timeline/dashboard contracts, ADMIN-only versioned role administration with recent re-authentication, incremental PostgreSQL migration/seed/smoke, 107 automated Vitest tests, 95.4% statement coverage, 81.01% branch coverage, 21 Playwright E2E runs across desktop/tablet/mobile, an explicit 6/6 accessibility suite, bounded metrics, S3/MinIO adapter, restore smoke (`1|26|13`), a four-route perf smoke on `next start` with 400 requests, 0 errors and maximum route p95 434.69 ms against a 500 ms target, OpenAPI validation (47 paths), secret scan and a clean high-severity npm audit. This evidence does not check any release box by itself.

The remaining release blockers are explicit: hospital identity/ownership and transfer/alta policy, approved critical-result/fallback policy, production object storage/AV/credentials, representative hospital workload, manual accessibility/clinical acceptance, approved RPO/RTO and retention, remote CI execution and pilot sign-off. The local technical boundaries are implemented; the blockers are not silently marked as production-ready.

## Product/clinical

- [ ] OQ-002/OQ-003/OQ-005/OQ-006/OQ-007/OQ-015/OQ-018 resolved or explicitly gated.
- [ ] Lab normal, recoleta, RX, US, critical, overdue and cancellation journeys observed/accepted.
- [ ] Patient identity/homonym and sample/accession policies approved.
- [ ] Result release/amend/review/void ownership approved.

## Security/privacy

- [ ] Authentication, session, RBAC/scope, CSRF/CORS/headers/TLS tested.
- [ ] IDOR, privilege escalation, SQLi/XSS, rate limit and upload abuse tests pass.
- [ ] Threat model reviewed; audit immutability verified.
- [ ] LGPD data inventory, purpose, retention, export/deletion and incident contacts approved.
- [ ] No secrets or real patient/tutor data in code, fixtures, logs or client bundle.

## Reliability/operations

- [ ] Migrations tested from representative prior version; rollback/roll-forward plan.
- [ ] PostgreSQL + object storage backups verified and restore drill passed against approved RPO/RTO. Local evidence covers PostgreSQL only; object storage and RPO/RTO remain external.
- [ ] `/livez`, `/readyz`, logs, metrics, correlation, outbox retry/dead letter and alert routing tested.
- [ ] Storage scan/quarantine and signed downloads work.
- [ ] Incident, critical notification and degraded-network runbooks rehearsed.

## Quality/UX

- [ ] Unit/integration/API/E2E/accessibility/security suite passes; business coverage ≥80%.
- [ ] Responsive desktop/tablet/mobile critical states inspected.
- [ ] Loading, empty, partial, error, offline/degraded and permission denied flows verified.
- [ ] Performance targets measured with representative hospital data/concurrency. Local evidence covers four synthetic read workloads at concurrency 10; it is not representative-load sign-off.
- [ ] No fake implementation, silent error, critical pending item or unowned alert.

## Deployment

- [ ] Environment separation and secret manager configured.
- [ ] TLS/reverse proxy, database/storage access and least-privileged service accounts reviewed.
- [ ] Smoke test, release notes, rollback and support owner defined.
- [ ] Pilot scope and feedback loop approved.
