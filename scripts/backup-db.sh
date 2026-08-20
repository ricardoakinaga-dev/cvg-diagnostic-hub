#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL é obrigatório}"
backup_dir="${BACKUP_DIR:-backups}"
mkdir -p "$backup_dir"
backup_file="${1:-$backup_dir/cvg-$(date -u +%Y%m%dT%H%M%SZ).dump}"
pg_dump --format=custom --no-owner --file "$backup_file" "$DATABASE_URL"
echo "Backup PostgreSQL criado em $backup_file"
