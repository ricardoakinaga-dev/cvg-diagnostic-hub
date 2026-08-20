import { describe, expect, it } from "vitest";
import type { ItemState, WorkflowType } from "@cvg/contracts";
import { workflowActionFor } from "./workflow-action";

const item = (status: ItemState, workflowType: WorkflowType, currentResultId?: string, currentSampleId?: string) => ({ status, workflowType, currentResultId, currentSampleId });

describe("workflow action mapping", () => {
  it("maps the next executable action by workflow capability", () => {
    expect(workflowActionFor(item("REQUESTED", "LABORATORY"))).toBe("RECEIVE_SAMPLE");
    expect(workflowActionFor(item("REQUESTED", "RADIOLOGY"))).toBe("START_PROCEDURE");
    expect(workflowActionFor(item("REQUESTED", "ULTRASOUND"))).toBe("SCHEDULE");
    expect(workflowActionFor(item("RECEIVED", "LABORATORY"))).toBe("START_PROCESSING");
    expect(workflowActionFor(item("AWAITING_REPORT", "RADIOLOGY"))).toBe("CREATE_RESULT");
  });

  it("keeps review and replacement actions contextual", () => {
    expect(workflowActionFor(item("RESULT_AVAILABLE", "LABORATORY", "result-1"))).toBe("REVIEW_RESULT");
    expect(workflowActionFor(item("RECOLLECTION_REQUIRED", "LABORATORY", undefined, "sample-expected"))).toBe("RECEIVE_REPLACEMENT");
    expect(workflowActionFor(item("RECOLLECTION_REQUIRED", "LABORATORY"))).toBeUndefined();
    expect(workflowActionFor(item("COMPLETED", "LABORATORY"))).toBeUndefined();
  });
});
