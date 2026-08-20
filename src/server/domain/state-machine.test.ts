import { describe, expect, it } from "vitest";
import { aggregateRequestStatus, canTransitionItem, transitionItem } from "./state-machine";

describe("diagnostic item state machine", () => {
  it("allows a laboratory item to receive and start processing", () => {
    expect(canTransitionItem("REQUESTED", "RECEIVED", "LABORATORY")).toBe(true);
    expect(transitionItem("REQUESTED", "RECEIVED", "LABORATORY")).toBe("RECEIVED");
    expect(transitionItem("RECEIVED", "IN_PROGRESS", "LABORATORY")).toBe("IN_PROGRESS");
  });

  it("rejects a laboratory-only transition for an imaging item", () => {
    expect(canTransitionItem("REQUESTED", "RECEIVED", "RADIOLOGY")).toBe(false);
    expect(() => transitionItem("REQUESTED", "RECEIVED", "RADIOLOGY")).toThrow(
      "INVALID_STATE_TRANSITION"
    );
  });

  it("keeps terminal items immutable through ordinary transitions", () => {
    expect(canTransitionItem("COMPLETED", "IN_PROGRESS", "LABORATORY")).toBe(false);
    expect(() => transitionItem("COMPLETED", "IN_PROGRESS", "LABORATORY")).toThrow(
      "INVALID_STATE_TRANSITION"
    );
  });

  it("derives a partially available request without mutating items", () => {
    const items = [
      { status: "RESULT_AVAILABLE" as const },
      { status: "IN_PROGRESS" as const },
      { status: "CANCELLED" as const }
    ];

    expect(aggregateRequestStatus(items)).toBe("PARTIALLY_AVAILABLE");
    expect(items).toEqual([
      { status: "RESULT_AVAILABLE" },
      { status: "IN_PROGRESS" },
      { status: "CANCELLED" }
    ]);
  });

  it("reports results available when every non-terminal item has a released result", () => {
    expect(
      aggregateRequestStatus([
        { status: "RESULT_AVAILABLE" },
        { status: "REVIEWED" },
        { status: "CANCELLED" }
      ])
    ).toBe("RESULTS_AVAILABLE");
  });

  it("keeps imaging workflows away from laboratory sample states", () => {
    expect(canTransitionItem("REQUESTED", "RECEIVED", "RADIOLOGY")).toBe(false);
    expect(canTransitionItem("REQUESTED", "SCHEDULED", "ULTRASOUND")).toBe(true);
  });
});
