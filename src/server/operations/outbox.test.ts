import { describe, expect, it } from "vitest";
import { createDemoState } from "../store/fixtures";
import type { StoreState } from "../domain/models";
import { MemoryStore } from "../store/memory-store";
import { createSafeConsoleSink, InProcessEventBus, processOutboxBatch } from "./outbox";

function stateWithMessage(): StoreState {
  const state = createDemoState();
  return {
    ...state,
    outbox: [{
      id: "outbox-1",
      eventType: "diagnostic.updated",
      aggregateType: "DiagnosticRequest",
      aggregateId: "request-1",
      payload: { requestId: "request-1" },
      status: "PENDING" as const,
      attempts: 0,
      availableAt: "2026-08-20T10:00:00.000Z",
      correlationId: "corr-1"
    }]
  };
}

describe("durable outbox processing", () => {
  it("claims, publishes and marks a message as processed", async () => {
    const store = new MemoryStore(stateWithMessage());
    const bus = new InProcessEventBus();

    const summary = await processOutboxBatch(store, bus, {
      now: () => new Date("2026-08-20T10:01:00.000Z"),
      workerId: "worker-test",
      batchSize: 1
    });

    expect(summary).toMatchObject({ claimed: 1, processed: 1, retried: 0, failed: 0 });
    expect(store.getState().outbox[0]).toMatchObject({ status: "PROCESSED", attempts: 1 });
    expect(store.getState().outbox[0].lockedAt).toBeUndefined();
    expect(bus.read()).toEqual([expect.objectContaining({ id: "outbox-1", eventType: "diagnostic.updated" })]);
  });

  it("releases a failed claim with exponential backoff and dead-letters at the limit", async () => {
    const store = new MemoryStore(stateWithMessage());
    const sink = { publish: async () => { throw new Error("downstream unavailable"); } };

    const first = await processOutboxBatch(store, sink, { now: () => new Date("2026-08-20T10:01:00.000Z"), maxAttempts: 2, batchSize: 1, baseDelayMs: 1000 });
    expect(first).toMatchObject({ claimed: 1, processed: 0, retried: 1, failed: 0 });
    expect(store.getState().outbox[0]).toMatchObject({ status: "PENDING", attempts: 1, lastError: "downstream unavailable" });
    expect(store.getState().outbox[0].availableAt).toBe("2026-08-20T10:01:01.000Z");

    const second = await processOutboxBatch(store, sink, { now: () => new Date("2026-08-20T10:01:02.000Z"), maxAttempts: 2, batchSize: 1, baseDelayMs: 1000 });
    expect(second).toMatchObject({ claimed: 1, processed: 0, retried: 0, failed: 1 });
    expect(store.getState().outbox[0]).toMatchObject({ status: "FAILED", attempts: 2 });
  });

  it("reclaims an expired processing lease but not an active lease", async () => {
    const state = stateWithMessage();
    state.outbox = [{ ...state.outbox[0], status: "PROCESSING", attempts: 1, lockedAt: "2026-08-20T09:59:00.000Z", workerId: "old-worker" }];
    const store = new MemoryStore(state);
    const bus = new InProcessEventBus();

    const summary = await processOutboxBatch(store, bus, { now: () => new Date("2026-08-20T10:01:00.000Z"), leaseMs: 60_000, batchSize: 1 });

    expect(summary.processed).toBe(1);
    expect(store.getState().outbox[0]).toMatchObject({ status: "PROCESSED", attempts: 2 });
  });

  it("returns an empty summary when no message is available and keeps console output safe", async () => {
    const lines: string[] = [];
    const sink = createSafeConsoleSink((line) => lines.push(line));
    const store = new MemoryStore(createDemoState());
    const summary = await processOutboxBatch(store, sink, { batchSize: 1 });

    expect(summary).toEqual({ claimed: 0, processed: 0, retried: 0, failed: 0 });
    await sink.publish({ id: "outbox-safe", eventType: "diagnostic.updated", aggregateType: "Patient", aggregateId: "patient-secret", payload: { displayName: "não deve logar" }, status: "PROCESSED", attempts: 1, availableAt: "2026-08-20T10:00:00.000Z", correlationId: "corr-safe" });
    expect(lines[0]).not.toContain("patient-secret");
    expect(lines[0]).not.toContain("não deve logar");
  });
});
