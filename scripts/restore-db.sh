#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL é obrigatório}"
: "${ALLOW_DB_RESTORE:?Defina ALLOW_DB_RESTORE=true para confirmar a restauração}"
if [[ "$ALLOW_DB_RESTORE" != "true" ]]; then
  echo "Restauração bloqueada: ALLOW_DB_RESTORE precisa ser true." >&2
  exit 1
fi
restore_file="${1:?Informe o caminho do arquivo .dump}"
if [[ ! -f "$restore_file" ]]; then
  echo "Backup não encontrado: $restore_file" >&2
  exit 1
fi
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" "$restore_file"
echo "Backup restaurado. Execute npm run db:migrate; use db:smoke somente em um banco local dedicado cvg_smoke/cvg_test com opt-in explícito."
