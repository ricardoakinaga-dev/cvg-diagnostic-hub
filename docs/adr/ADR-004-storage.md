# ADR-004 — S3-compatible object storage

- Status: Accepted for planning
- Date: 2026-08-18

## Context

Results may contain PDFs, images and attachments. Large blobs in PostgreSQL complicate backup and delivery; files need independent security/scanning.

## Decision

Store file bytes in private S3-compatible object storage (MinIO locally); PostgreSQL stores metadata, checksum, scan state, relationship and audit. Use short-lived authorized URLs and quarantine.

## Alternatives

PostgreSQL bytea, public bucket, filesystem-only storage.

## Consequences

Scalable file boundary and future PACS integration; backup/restore must cover DB + object storage and production scanning is a release gate.
