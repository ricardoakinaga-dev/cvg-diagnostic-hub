# ADR-002 — PostgreSQL as system of record

- Status: Accepted for planning
- Date: 2026-08-18

## Context

Clinical workflow needs relational integrity, transactions, constraints, indexed queues/search and durable audit/outbox. Initial load is unknown but expected to fit vertical scaling while measured.

## Decision

Use PostgreSQL for operational state, versioned results metadata, audit events, notification/outbox and projections. Use migrations, FKs, unique/check constraints and explain-plan review.

## Alternatives

Document database, external search as primary, distributed SQL.

## Consequences

Strong integrity and simple backup/restore; textual search starts in PostgreSQL. Add specialized search/cache only after measured query/load evidence and a new ADR.
