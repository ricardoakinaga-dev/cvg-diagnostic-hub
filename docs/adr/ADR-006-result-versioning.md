# ADR-006 — Result versioning and audit

- Status: Accepted for planning
- Date: 2026-08-18

## Context

Released results may be corrected after viewing/reviewing. Silent overwrite can conceal a clinically meaningful change.

## Decision

Keep a logical Result with immutable ResultVersion snapshots. Before release, draft may be edited; after release, `amend` creates a new version with prior/new references, reason, actor/server time, notification decision and `needs_re_review`.

## Alternatives

In-place update, append-only event sourcing for all state, immutable PDF only.

## Consequences

Clear history/review semantics and audit; storage/UI/version comparison complexity is accepted because data integrity is mandatory.
