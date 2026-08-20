CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cvg_runtime_state (
  id integer PRIMARY KEY CHECK (id = 1),
  state jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  actor_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  previous_state text,
  new_state text,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events (entity_type, entity_id, occurred_at);
CREATE INDEX IF NOT EXISTS audit_events_correlation_idx ON audit_events (correlation_id);

CREATE TABLE IF NOT EXISTS outbox_messages (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL,
  correlation_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_messages_pending_idx ON outbox_messages (status, available_at);

COMMENT ON TABLE cvg_runtime_state IS 'Transactional MVP snapshot. Domain projections are added by later expand/contract migrations; the row lock preserves aggregate atomicity across app instances.';
COMMENT ON TABLE audit_events IS 'Append-only audit projection of committed state transitions.';
COMMENT ON TABLE outbox_messages IS 'Transactional outbox projection for notifications and realtime invalidation.';
