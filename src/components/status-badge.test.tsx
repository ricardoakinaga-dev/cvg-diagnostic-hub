/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriorityBadge, StatusBadge, statusLabel } from "./status-badge";

describe("diagnostic badges", () => {
  it("renders every operational state with a human label", () => {
    const states = ["REQUESTED", "RECEIVED", "SCHEDULED", "IN_PROGRESS", "AWAITING_REPORT", "RESULT_AVAILABLE", "REVIEWED", "COMPLETED", "RECOLLECTION_REQUIRED", "FAILED", "CANCELLED", "REJECTED", "RESULT_VOIDED"] as const;
    render(<div>{states.map((status) => <StatusBadge key={status} status={status} />)}</div>);
    expect(screen.getByText("Amostra recebida")).toBeVisible();
    expect(screen.getByText("Resultado invalidado")).toBeVisible();
    expect(statusLabel("REQUESTED")).toBe("Solicitado");
  });

  it("uses distinct priority labels", () => {
    render(<div><PriorityBadge priority="ROUTINE" /><PriorityBadge priority="URGENT" /><PriorityBadge priority="EMERGENCY" /></div>);
    expect(screen.getByText("Rotina")).toBeVisible();
    expect(screen.getByText("Urgente")).toBeVisible();
    expect(screen.getByText("Emergência")).toBeVisible();
  });
});
