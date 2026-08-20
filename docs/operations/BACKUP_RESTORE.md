# Backup and restore

**Knowledge status:** `DECISION/PROPOSAL` operacional; RPO/RTO e retenção aguardam aprovação de TI/gestão.

## 1. Scope

Backup must cover PostgreSQL data, object storage attachments, encryption/key metadata required to decrypt, configuration needed to rebuild and documented external references. A database-only backup is insufficient for released result attachments.

## 2. Proposed pilot targets

`ASSUMPTION/PROPOSED`: RPO ≤ 15 minutes and RTO ≤ 4 hours for pilot. TI/management must approve or replace these targets before production.

## 3. Strategy

- PostgreSQL: encrypted point-in-time/WAL plus periodic full backup; verify completion and size.
- Object storage: versioning/replication or scheduled encrypted snapshot according to provider; preserve checksum/metadata.
- Config/secrets: never backup plaintext secrets in repo; store recoverable references and rotation procedure.
- Retention: duration is OQ-013; do not enable deletion until approved.
- Separate credentials and backup access from application role; least privilege and MFA where available.

## 4. Restore runbook

1. declare incident and freeze writes if integrity is uncertain;
2. identify recovery point and scope (DB/files/config);
3. provision isolated target with approved credentials;
4. restore PostgreSQL and object storage;
5. verify checksums, migrations/schema, request/result counts and attachment links;
6. run smoke tests: login, scoped request view, result/version/timeline, notification queue;
7. compare RPO/RTO and record gaps;
8. approve cutover/rollback; preserve incident/audit evidence.

## 5. Drill cadence and evidence

At least monthly backup verification and periodic full restore drill during pilot (final cadence to TI). Evidence includes backup ID/time, restore target, duration, checksum/sample reconciliation, test results and owner sign-off. Never run a destructive restore over production.

## 6. Failure handling

Missing/failed backup is a release/operations alert, not a warning to ignore. Storage unavailable blocks attachment release where required; DB unavailable makes readiness false. Ransomware scenario uses immutable/offline copy and credential rotation.
