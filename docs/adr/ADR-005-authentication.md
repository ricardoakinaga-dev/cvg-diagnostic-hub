# ADR-005 — Session authentication and identity boundary

- Status: Proposed pending OQ-012
- Date: 2026-08-18

## Context

Hospital identity provider is unknown. Browser-stored bearer tokens increase exposure; identity must be replaceable without rewriting authorization.

## Decision

Expose an `IdentityProvider` port. Use secure server-side opaque sessions for MVP; integrate OIDC/AD when TI confirms. Cookies are HttpOnly/Secure/SameSite, sessions revocable, CSRF protected, and roles/scopes server-derived.

## Alternatives

JWT in localStorage, a custom identity system as permanent source, direct provider coupling.

## Consequences

Good browser containment and replaceability; requires session storage/rotation and provider mapping. Production cannot pass until OQ-012 is resolved.
