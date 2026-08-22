# TASK-V4-DATA-001 cross-instance persistence baseline

Timestamp: 2026-08-22T05:27:51Z
Status: **CONFIRMED DEFECT / IMPLEMENTATION NOT YET CLAIMED**

Static tracing confirmed that each `PostgresStore` loads a process-local snapshot and
that `getState()` can remain stale indefinitely after another instance commits. The
database row lock protects concurrent writers, but it does not refresh authentication,
read models or SSE readers in another process. The sequential database smoke test does
not exercise two stores open at once.

Security-sensitive stale-read surfaces include session authentication/revocation,
role and department changes, clinical read models, SSE authorization and attachment
I/O. Attachment upload additionally needs a transactional claim/finalize protocol and
object-store compensation; a fresh read alone is insufficient.

The authorized implementation boundary is frozen in the ExecPlan:

1. add asynchronous immutable `readState()` semantics without weakening transactional
   command preconditions;
2. add a fail-closed disposable two-store PostgreSQL harness that can only create and
   drop validated `cvg_test_<pid>_<uuid>` databases through a separate loopback admin URL;
3. prove cross-instance login, revocation, role/scope, SSE and canonical result behavior;
4. add expand-only schema/runtime validation, migration serialization/checksums,
   append-only audit enforcement and data-free invalidation;
5. implement claimed two-phase attachment I/O with inaccessible orphan cleanup.

No production database, real clinical data or destructive down migration is authorized.
