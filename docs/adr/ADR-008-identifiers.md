# ADR-008 — Technical IDs and human protocol

- Status: Accepted for planning
- Date: 2026-08-18

## Context

Users need a short code to communicate/search a request; sequential numeric primary keys leak information and are vulnerable to enumeration.

## Decision

Use opaque UUIDv7 technical IDs. Generate a human `request_code` such as `EX-YYMMDD-0042` from a server-side local-date sequence in a locked transaction; enforce unique constraint and keep code separate from PK.

## Alternatives

Expose UUID only, random short code, sequential PK as public ID.

## Consequences

Readable support/search code with collision protection; sequence allocation must handle rollback/gaps and timezone explicitly. A code is not authorization.
