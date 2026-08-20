# ADR-003 — SSE for realtime

- Status: Accepted for planning
- Date: 2026-08-18

## Context

The Hub needs server-to-client queue/inbox updates. Client-to-server commands already use HTTPS and do not need bidirectional socket semantics in MVP.

## Decision

Use authenticated SSE with event IDs, `Last-Event-ID`, bounded replay/resync, versioned invalidation and polling fallback. Streams remain open with heartbeat by default and may be capped by deployment configuration. PostgreSQL/outbox remains durable truth.

## Alternatives

WebSocket, client polling only, external pub/sub.

## Consequences

Lower protocol complexity and good fit for notifications; connection limits, reconnect storms and multi-instance fanout need operations. Revisit only with measured requirement.
