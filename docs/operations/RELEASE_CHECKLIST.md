# Release checklist

**Knowledge status:** `DECISION/PROPOSAL` de processo de release; só pode ser marcado com evidência após BUILD.

Use for every pilot/production release; checkboxes require evidence link or command output.

## Current local evidence (20/08/2026)

`npm run typecheck`, `npm run lint`, `npm test -- --run` (62/62), `npm run test:coverage` (95.71% lines, 81.12% branches), `npm run build`, Playwright desktop/tablet/mobile (15/15 including selected axe rules), PostgreSQL migration/seed/smoke, restore smoke, OpenAPI validation, secret scan, perf smoke (p95 90.97 ms/100 reads) and `npm audit --audit-level=high` have passed for the synthetic local MVP. The checklist remains open because production evidence, policy approval and operational ownership are not yet present.

## Change and migration

- [ ] PRD/SPEC/traceability updated for observable change.
- [ ] Migration reviewed for expand/contract and backup point.
- [ ] Staging migration + rollback/roll-forward rehearsal passed.
- [ ] Seed/fixtures contain synthetic data only.

## Security/configuration

- [ ] Environment variables/secrets present via approved manager; no values committed.
- [ ] TLS, security headers, CORS/CSRF, session and rate limits verified.
- [ ] Roles/scopes reviewed; admin/break-glass access audited.
- [ ] Upload allowlist/scan/storage policy enabled.

## Verification

- [ ] Lint/typecheck/unit/integration/API/E2E/accessibility/security pass.
- [ ] Critical flows smoke-tested: request, Lab, recollection, result release/review, critical ack, search.
- [ ] Realtime reconnect/degraded behavior verified.
- [ ] Error/correlation ID and audit trail inspected.

## Data/operations

- [ ] Backup succeeded; restore evidence is current.
- [ ] Health/readiness/metrics/log alerts route to owners.
- [ ] Outbox depth/retry/dead-letter is clear or understood.
- [ ] Release/rollback owner and incident contacts available.

## Communication

- [ ] Release notes describe behavior/config changes and known limitations.
- [ ] Pilot users trained on next actions, critical acknowledgement and offline state.
- [ ] Feedback window and success metrics baseline scheduled.
