import type { ItemState, WorkflowType } from "@cvg/contracts";

export type AggregateStatus =
  | "REQUESTED"
  | "IN_PROGRESS"
  | "PARTIALLY_AVAILABLE"
  | "RESULTS_AVAILABLE"
  | "COMPLETED"
  | "CANCELLED";

type Transition = readonly [ItemState, ItemState];

const commonTransitions: readonly Transition[] = [
  ["REQUESTED", "CANCELLED"],
  ["REQUESTED", "REJECTED"],
  ["RESULT_AVAILABLE", "REVIEWED"],
  ["RESULT_AVAILABLE", "RESULT_VOIDED"],
  ["RESULT_AVAILABLE", "RESULT_AVAILABLE"],
  ["REVIEWED", "COMPLETED"],
  ["REVIEWED", "RESULT_VOIDED"],
  ["COMPLETED", "RESULT_VOIDED"],
  ["RESULT_VOIDED", "IN_PROGRESS"],
  ["RESULT_VOIDED", "RESULT_AVAILABLE"]
];

const workflowTransitions: Record<WorkflowType, readonly Transition[]> = {
  LABORATORY: [
    ["REQUESTED", "RECEIVED"],
    ["RECEIVED", "IN_PROGRESS"],
    ["RECEIVED", "RECOLLECTION_REQUIRED"],
    ["RECEIVED", "REJECTED"],
    ["RECEIVED", "CANCELLED"],
    ["IN_PROGRESS", "RECOLLECTION_REQUIRED"],
    ["IN_PROGRESS", "RESULT_AVAILABLE"],
    ["RECOLLECTION_REQUIRED", "RECEIVED"],
    ["RECOLLECTION_REQUIRED", "CANCELLED"],
    ["IN_PROGRESS", "FAILED"],
    ["IN_PROGRESS", "CANCELLED"],
    ["FAILED", "RECEIVED"],
    ["FAILED", "REQUESTED"],
    ["FAILED", "CANCELLED"],
    ...commonTransitions
  ],
  RADIOLOGY: [
    ["REQUESTED", "IN_PROGRESS"],
    ["REQUESTED", "SCHEDULED"],
    ["SCHEDULED", "IN_PROGRESS"],
    ["SCHEDULED", "CANCELLED"],
    ["IN_PROGRESS", "FAILED"],
    ["IN_PROGRESS", "CANCELLED"],
    ["IN_PROGRESS", "AWAITING_REPORT"],
    ["AWAITING_REPORT", "RESULT_AVAILABLE"],
    ["AWAITING_REPORT", "CANCELLED"],
    ...commonTransitions
  ],
  ULTRASOUND: [
    ["REQUESTED", "SCHEDULED"],
    ["SCHEDULED", "IN_PROGRESS"],
    ["SCHEDULED", "SCHEDULED"],
    ["SCHEDULED", "CANCELLED"],
    ["IN_PROGRESS", "FAILED"],
    ["IN_PROGRESS", "CANCELLED"],
    ["IN_PROGRESS", "AWAITING_REPORT"],
    ["AWAITING_REPORT", "RESULT_AVAILABLE"],
    ["AWAITING_REPORT", "CANCELLED"],
    ...commonTransitions
  ]
};

export function canTransitionItem(
  from: ItemState,
  to: ItemState,
  workflow: WorkflowType
): boolean {
  return workflowTransitions[workflow].some(([source, target]) => source === from && target === to);
}

export function transitionItem(
  from: ItemState,
  to: ItemState,
  workflow: WorkflowType
): ItemState {
  if (!canTransitionItem(from, to, workflow)) {
    throw new Error("INVALID_STATE_TRANSITION");
  }

  return to;
}

export function aggregateRequestStatus(items: ReadonlyArray<{ status: ItemState }>): AggregateStatus {
  if (items.length === 0) {
    return "REQUESTED";
  }

  const statuses = items.map((item) => item.status);
  const terminalStatuses = statuses.filter((status) =>
    ["COMPLETED", "CANCELLED", "REJECTED"].includes(status)
  );
  const activeStatuses = statuses.filter(
    (status) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(status)
  );

  if (terminalStatuses.length === statuses.length) {
    return terminalStatuses.some((status) => status === "COMPLETED") ? "COMPLETED" : "CANCELLED";
  }

  const hasReleasedResult = statuses.some((status) =>
    ["RESULT_AVAILABLE", "REVIEWED", "COMPLETED"].includes(status)
  );
  if (
    activeStatuses.length > 0 &&
    activeStatuses.every((status) => ["RESULT_AVAILABLE", "REVIEWED"].includes(status))
  ) {
    return "RESULTS_AVAILABLE";
  }

  if (hasReleasedResult && activeStatuses.length > 0) {
    return "PARTIALLY_AVAILABLE";
  }

  if (activeStatuses.every((status) => status === "REQUESTED")) {
    return "REQUESTED";
  }

  return "IN_PROGRESS";
}
