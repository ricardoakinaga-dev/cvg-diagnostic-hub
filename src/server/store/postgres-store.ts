import { Pool, type PoolClient } from "pg";
import type { StateStore, StoreState } from "../domain/models";

function cloneState(state: StoreState): StoreState {
  return structuredClone(state);
}

function stateFromRow(value: unknown): StoreState {
  if (!value || typeof value !== "object") throw new Error("PostgreSQL runtime state is invalid.");
  return cloneState(value as StoreState);
}

export class PostgresStore implements StateStore {
  private readonly pool: Pool;
  private state: StoreState;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(pool: Pool, state: StoreState) {
    this.pool = pool;
    this.state = cloneState(state);
  }

  static async create(connectionString: string, fallbackState: StoreState): Promise<PostgresStore> {
    const pool = new Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10), idleTimeoutMillis: 30_000 });
    try {
      const result = await pool.query<{ state: unknown }>("SELECT state FROM cvg_runtime_state WHERE id = 1");
      if (result.rowCount === 0) {
        await pool.query("INSERT INTO cvg_runtime_state (id, state) VALUES (1, $1::jsonb)", [JSON.stringify(fallbackState)]);
        return new PostgresStore(pool, fallbackState);
      }
      return new PostgresStore(pool, stateFromRow(result.rows[0].state));
    } catch (error) {
      await pool.end();
      throw new Error(`Não foi possível abrir o estado PostgreSQL. Execute npm run db:migrate antes de iniciar. ${(error as Error).message}`);
    }
  }

  getState(): StoreState {
    return cloneState(this.state);
  }

  async transaction<T>(operation: (state: StoreState) => Promise<{ state: StoreState; result: T }> | { state: StoreState; result: T }): Promise<T> {
    const run = this.queue.then(async () => {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query<{ state: unknown }>("SELECT state FROM cvg_runtime_state WHERE id = 1 FOR UPDATE");
        if (locked.rowCount !== 1) throw new Error("PostgreSQL runtime state row is missing.");
        const currentState = stateFromRow(locked.rows[0].state);
        const outcome = await operation(currentState);
        await client.query("UPDATE cvg_runtime_state SET state = $1::jsonb, version = version + 1, updated_at = now() WHERE id = 1", [JSON.stringify(outcome.state)]);
        await this.projectCommittedEvents(client, currentState, outcome.state);
        await client.query("COMMIT");
        this.state = cloneState(outcome.state);
        return outcome.result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async reset(state: StoreState): Promise<void> {
    await this.transaction(async () => ({ state: cloneState(state), result: undefined }));
  }

  async close(): Promise<void> {
    await this.queue;
    await this.pool.end();
  }

  async healthcheck(): Promise<void> {
    const result = await this.pool.query<{ state_exists: boolean; outbox_schema_ready: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM cvg_runtime_state WHERE id = 1) AS state_exists, EXISTS (SELECT 1 FROM schema_migrations WHERE version = '002_outbox_processing') AS outbox_schema_ready"
    );
    const row = result.rows[0];
    if (!row?.state_exists || !row.outbox_schema_ready) throw new Error("POSTGRES_RUNTIME_SCHEMA_NOT_READY");
  }

  private async projectCommittedEvents(client: PoolClient, before: StoreState, after: StoreState): Promise<void> {
    const previousAuditIds = new Set(before.auditEvents.map((event) => event.id));
    for (const event of after.auditEvents.filter((entry) => !previousAuditIds.has(entry.id))) {
      await client.query(
        "INSERT INTO audit_events (id, event_type, actor_id, entity_type, entity_id, previous_state, new_state, correlation_id, metadata, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) ON CONFLICT (id) DO NOTHING",
        [event.id, event.eventType, event.actorId ?? null, event.entityType, event.entityId, event.previousState ?? null, event.newState ?? null, event.correlationId, JSON.stringify(event.metadata), event.occurredAt]
      );
    }
    const previousOutbox = new Map(before.outbox.map((event) => [event.id, event]));
    for (const message of after.outbox.filter((entry) => !previousOutbox.has(entry.id))) {
      await client.query(
        "INSERT INTO outbox_messages (id, event_type, aggregate_type, aggregate_id, payload, status, attempts, available_at, correlation_id, locked_at, worker_id, last_error) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING",
        [message.id, message.eventType, message.aggregateType, message.aggregateId, JSON.stringify(message.payload), message.status, message.attempts, message.availableAt, message.correlationId, message.lockedAt ?? null, message.workerId ?? null, message.lastError ?? null]
      );
    }
    for (const message of after.outbox) {
      const previous = previousOutbox.get(message.id);
      if (!previous || JSON.stringify(previous) === JSON.stringify(message)) continue;
      await client.query(
        "UPDATE outbox_messages SET status = $2, attempts = $3, available_at = $4, locked_at = $5, worker_id = $6, last_error = $7 WHERE id = $1",
        [message.id, message.status, message.attempts, message.availableAt, message.lockedAt ?? null, message.workerId ?? null, message.lastError ?? null]
      );
    }
  }
}
