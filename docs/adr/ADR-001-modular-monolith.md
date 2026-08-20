# ADR-001 — Modular monolith

- Status: Accepted for planning
- Date: 2026-08-18

## Context

The product needs atomic result/audit/notification intent changes, simple hospital deployment and a small team. There is no measured scale requiring distributed services.

## Decision

Use a modular monolith with explicit internal module ownership and ports. Deploy as one application boundary initially; separate web/API/worker processes are allowed when operationally useful without creating independent domain services.

## Alternatives

Microservices, event sourcing/CQRS, serverless per workflow.

## Consequences

Positive: transaction/debugging simplicity, lower ops burden, easy local setup.  
Tradeoff: team must enforce module contracts and avoid a shared-table monolith. Extraction remains possible only after measured need.

## Links

`docs/architecture/ARCHITECTURE.md`, `docs/architecture/COMPONENTS.md`, `docs/build/BUILD_PLAN.md`.
