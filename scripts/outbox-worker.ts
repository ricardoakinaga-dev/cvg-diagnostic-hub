import { createSafeConsoleSink, processOutboxBatch } from "../src/server/operations/outbox";
import { getRuntimeStoreAsync } from "../src/server/store/runtime";

const once = process.argv.includes("--once") || process.env.OUTBOX_ONCE === "true";
const intervalMs = positiveInteger(process.env.OUTBOX_INTERVAL_MS, 5_000);
const sink = createSafeConsoleSink((line) => console.log(line));
let stopping = false;

async function runOnce(): Promise<void> {
  const store = await getRuntimeStoreAsync();
  const summary = await processOutboxBatch(store, sink, {
    workerId: process.env.OUTBOX_WORKER_ID ?? `worker_${process.pid}`,
    batchSize: positiveInteger(process.env.OUTBOX_BATCH_SIZE, 25),
    maxAttempts: positiveInteger(process.env.OUTBOX_MAX_ATTEMPTS, 5),
    leaseMs: positiveInteger(process.env.OUTBOX_LEASE_MS, 30_000)
  });
  console.log(JSON.stringify({ event: "outbox.batch", ...summary }));
}

async function main(): Promise<void> {
  if (once) {
    await runOnce();
    return;
  }
  while (!stopping) {
    try {
      await runOnce();
    } catch (error) {
      console.error(JSON.stringify({ event: "outbox.worker_error", message: error instanceof Error ? error.message : "OUTBOX_WORKER_FAILED" }));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}

process.once("SIGTERM", () => { stopping = true; });
process.once("SIGINT", () => { stopping = true; });

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "outbox.worker_fatal", message: error instanceof Error ? error.message : "OUTBOX_WORKER_FAILED" }));
  process.exitCode = 1;
});
