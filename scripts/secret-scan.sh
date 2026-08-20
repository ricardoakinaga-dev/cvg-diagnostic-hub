#!/usr/bin/env bash
set -euo pipefail

if rg --hidden --no-heading --line-number \
  --glob '!node_modules/**' \
  --glob '!coverage/**' \
  --glob '!playwright-report/**' \
  --glob '!.next/**' \
  --glob '!package-lock.json' \
  --glob '!.env.example' \
  --glob '!docs/**' \
  -P '(BEGIN (?:RSA|EC|OPENSSH|DSA) PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk-[A-Za-z0-9]{20,})' .; then
  echo "Secret scan falhou: padrão de segredo encontrado." >&2
  exit 1
fi

for env_file in $(rg --files --hidden -g '.env' -g '.env.*' -g '!node_modules/**' -g '!.env.example' 2>/dev/null || true); do
  if [[ -f "$env_file" ]]; then
    echo "Secret scan falhou: arquivo de ambiente local não deve ser versionado: $env_file" >&2
    exit 1
  fi
done

echo "Secret scan passou: nenhum padrão de segredo versionável encontrado."
