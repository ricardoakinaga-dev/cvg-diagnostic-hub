import { randomUUID } from "node:crypto";
import type { OutboxMessage, StateStore } from "../domain/models";

export interface PublishedEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  availableAt: string;
  correlationId: string;
}

export interface OutboxSink {
  publish(message: OutboxMessage): Promise<void>;
}

export interface OutboxProcessOptions {
  now?: () => Date;
  workerId?: string;
  leaseMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  batchSize?: number;
}

export interface OutboxProcessSummary {
  claimed: number;
  processed: number;
  retried: number;
  failed: number;
}

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_ERROR_LENGTH = 240;

export class InProcessEventBus implements OutboxSink {
  private readonly events: PublishedEvent[] = [];

  constructor(private readonly maxEvents = 1_000) {}

  async publish(message: OutboxMessage): Promise<void> {
    const event: PublishedEvent = {
      id: message.id,
      eventType: message.eventType,
      aggregateType: message.aggregateType,
      aggregateId: message.aggregateId,
      availableAt: message.availableAt,
      correlationId: message.correlationId
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  read(): PublishedEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}

export function createSafeConsoleSink(logger: (line: string) => void = console.log): OutboxSink {
  return {
    async publish(message) {
      logger(JSON.stringify({ event: "outbox.publish", id: message.id, type: message.eventType, aggregateType: message.aggregateType, correlationId: message.correlationId }));
    }
  };
}

export async function processOutboxBatch(store: StateStore, sink: OutboxSink, options: OutboxProcessOptions = {}): Promise<OutboxProcessSummary> {
  const now = options.now ?? (() => new Date());
  const workerId = options.workerId ?? `worker_${randomUUID()}`;
  const leaseMs = Math.max(1, options.leaseMs ?? DEFAULT_LEASE_MS);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(1, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const summary: OutboxProcessSummary = { claimed: 0, processed: 0, retried: 0, failed: 0 };

  for (let index = 0; index < batchSize; index += 1) {
    const claimed = await claimNext(store, now(), workerId, leaseMs);
    if (!claimed) break;
    summary.claimed += 1;
    try {
      await sink.publish(claimed);
      await finishMessage(store, claimed.id, (message) => ({ ...message, status: "PROCESSED", lockedAt: undefined, workerId: undefined, lastError: undefined }));
      summary.processed += 1;
    } catch (error) {
      const permanentlyFailed = claimed.attempts >= maxAttempts;
      const retryDelay = baseDelayMs * (2 ** Math.max(0, claimed.attempts - 1));
      const nextAvailableAt = new Date(now().getTime() + Math.min(retryDelay, 15 * 60_000)).toISOString();
      const safeMessage = normalizeError(error);
      await finishMessage(store, claimed.id, (message) => ({
        ...message,
        status: permanentlyFailed ? "FAILED" : "PENDING",
        availableAt: nextAvailableAt,
        lockedAt: undefined,
        workerId: undefined,
        lastError: safeMessage
      }));
      if (permanentlyFailed) summary.failed += 1;
      else summary.retried += 1;
    }
  }

  return summary;
}

async function claimNext(store: StateStore, currentTime: Date, workerId: string, leaseMs: number): Promise<OutboxMessage | undefined> {
  const nowIso = currentTime.toISOString();
  const nowMs = currentTime.getTime();
  return store.transaction((state) => {
    const index = state.outbox.findIndex((message) => {
      if (message.status === "PENDING") return message.availableAt <= nowIso;
      if (message.status !== "PROCESSING") return false;
      return !message.lockedAt || nowMs - new Date(message.lockedAt).getTime() >= leaseMs;
    });
    if (index < 0) return { state, result: undefined };
    const selected = state.outbox[index];
    const claimed: OutboxMessage = { ...selected, status: "PROCESSING", attempts: selected.attempts + 1, lockedAt: nowIso, workerId, lastError: undefined };
    const outbox = state.outbox.map((message, messageIndex) => messageIndex === index ? claimed : message);
    return { state: { ...state, outbox }, result: claimed };
  });
}

async function finishMessage(store: StateStore, id: string, update: (message: OutboxMessage) => OutboxMessage): Promise<void> {
  await store.transaction((state) => {
    const outbox = state.outbox.map((message) => message.id === id ? update(message) : message);
    return { state: { ...state, outbox }, result: undefined };
  });
}

function normalizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "OUTBOX_SINK_FAILED";
  return message.replaceAll(/[\r\n\t]+/g, " ").slice(0, MAX_ERROR_LENGTH) || "OUTBOX_SINK_FAILED";
}
