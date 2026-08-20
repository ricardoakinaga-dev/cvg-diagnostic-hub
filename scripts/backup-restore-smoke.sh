#!/usr/bin/env bash
set -euo pipefail

: "${ALLOW_DB_RESTORE_SMOKE:?Defina ALLOW_DB_RESTORE_SMOKE=true para confirmar o smoke de restore}"
if [[ "$ALLOW_DB_RESTORE_SMOKE" != "true" ]]; then
  echo "Restore smoke bloqueado: ALLOW_DB_RESTORE_SMOKE precisa ser true." >&2
  exit 1
fi

compose_service="${POSTGRES_SERVICE:-postgres}"
db_user="${POSTGRES_USER:-cvg}"
source_db="${POSTGRES_DB:-cvg_diagnostics}"
smoke_db="cvg_restore_smoke_${BASHPID}"
temp_dir="$(mktemp -d -t cvg-restore-smoke.XXXXXX)"
dump_file="$temp_dir/source.dump"

cleanup() {
  docker compose exec -T "$compose_service" dropdb --if-exists -U "$db_user" "$smoke_db" >/dev/null 2>&1 || true
  rm -f "$dump_file"
  rmdir "$temp_dir" 2>/dev/null || true
}
trap cleanup EXIT

docker compose exec -T "$compose_service" pg_dump --format=custom --no-owner -U "$db_user" -d "$source_db" > "$dump_file"
docker compose exec -T "$compose_service" createdb -U "$db_user" "$smoke_db"
docker compose exec -T "$compose_service" pg_restore --exit-on-error --no-owner -U "$db_user" -d "$smoke_db" < "$dump_file"

result="$(docker compose exec -T "$compose_service" psql -At -v ON_ERROR_STOP=1 -U "$db_user" -d "$smoke_db" -c "SELECT (SELECT count(*) FROM cvg_runtime_state), (SELECT count(*) FROM audit_events), (SELECT count(*) FROM outbox_messages);")"
if [[ ! "$result" =~ ^1\|[0-9]+\|[0-9]+$ ]]; then
  echo "Restore smoke falhou: resultado inesperado '$result'." >&2
  exit 1
fi
echo "Backup/restore smoke passou em banco descartável: $smoke_db ($result)"
