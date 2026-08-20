# Release checklist

**Knowledge status:** `DECISION/PROPOSAL` de processo de release; só pode ser marcado com evidência após BUILD.

Use for every pilot/production release; checkboxes require evidence link or command output.

## Current local evidence (20/08/2026)

`npm run test:coverage` (119/119; 94.97% statements, 80.74% branches), typecheck/lint/build, isolated Playwright desktop/tablet/mobile via the LAN URL (33/33), including the manager control center/access/catalog workflows, delegated manager scope configuration, request-detail layout and the technical ADMIN landing, `npm run test:accessibility` (6/6), PostgreSQL migration/seed/smoke, restore smoke (`1|26|13`), OpenAPI validation (49 paths), secret scan, production `next start` perf smoke (400 requests, 0 errors; maximum p95 434.69 ms against 500 ms) and `npm audit --audit-level=high` have passed for the synthetic local MVP. The checklist remains open because production evidence, policy approval and operational ownership are not yet present.

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
