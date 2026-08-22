ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum text;

ALTER TABLE schema_migrations
  ALTER COLUMN checksum SET NOT NULL;

CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $audit_guard$
BEGIN
  RAISE EXCEPTION 'AUDIT_EVENTS_ARE_APPEND_ONLY' USING ERRCODE = '55000';
END;
$audit_guard$;

DROP TRIGGER IF EXISTS audit_events_append_only_guard ON audit_events;
CREATE TRIGGER audit_events_append_only_guard
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_audit_event_mutation();

DROP TRIGGER IF EXISTS audit_events_truncate_guard ON audit_events;
CREATE TRIGGER audit_events_truncate_guard
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION reject_audit_event_mutation();

CREATE OR REPLACE FUNCTION notify_runtime_state_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $runtime_invalidation$
BEGIN
  PERFORM pg_notify('cvg_runtime_state_changed', NEW.version::text);
  RETURN NEW;
END;
$runtime_invalidation$;

DROP TRIGGER IF EXISTS cvg_runtime_state_invalidation ON cvg_runtime_state;
CREATE TRIGGER cvg_runtime_state_invalidation
  AFTER UPDATE ON cvg_runtime_state
  FOR EACH ROW
  EXECUTE FUNCTION notify_runtime_state_changed();
