import type { StateStore, StoreState } from "../domain/models";

function cloneState(state: StoreState): StoreState {
  return structuredClone(state);
}

export class MemoryStore implements StateStore {
  private state: StoreState;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(initialState: StoreState) {
    this.state = cloneState(initialState);
  }

  getState(): StoreState {
    return cloneState(this.state);
  }

  async transaction<T>(
    operation: (state: StoreState) => Promise<{ state: StoreState; result: T }> | { state: StoreState; result: T }
  ): Promise<T> {
    const run = this.queue.then(async () => {
      const outcome = await operation(this.getState());
      this.state = cloneState(outcome.state);
      return outcome.result;
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async reset(state: StoreState): Promise<void> {
    await this.transaction(() => ({ state: cloneState(state), result: undefined }));
  }

  async healthcheck(): Promise<void> {
    const state = this.getState();
    const collections: (keyof typeof state)[] = ["users", "sessions", "patients", "encounters", "admissions", "services", "reasonCodes", "requests", "items", "samples", "procedures", "schedules", "results", "resultVersions", "notifications", "auditEvents", "outbox", "idempotency", "attachments"];
    if (!Number.isSafeInteger(state.protocolSequence) || state.protocolSequence < 0 || collections.some((key) => !Array.isArray(state[key]))) {
      throw new Error("MEMORY_RUNTIME_STATE_INVALID");
    }
  }
}
