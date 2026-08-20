# ADR-007 — Transactional outbox without broker

- Status: Accepted for planning
- Date: 2026-08-18

## Context

Release/recollection must not commit clinical state without a durable notification intent. A distributed broker adds operational cost before load is known.

## Decision

Write an outbox row in the same PostgreSQL transaction as domain/audit change. A bounded worker claims, retries and deduplicates messages; in-process/SSE delivery is a consumer, not source of truth.

## Alternatives

Direct publish after commit, Redis/Kafka from day one, synchronous external notification.

## Consequences

Crash-safe intent and simpler deployment; worker lag/dead letters need metrics/runbooks. Scale/fanout can be revisited with evidence.
