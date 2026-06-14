#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <legacy|meta|current|history|source|history-hk-2025|history-hk-2026|source-hk-2025|source-hk-2026> [local|preview|production]" >&2
  exit 1
fi

db_family="$1"
environment="${2:-preview}"

repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"
persist_dir="$repo_root/.local/d1/dev"
drop_sql_file="$(cd "$(dirname "$0")/.." && pwd)/sql/drop-preview-db.sql"

case "$db_family" in
  legacy)
    binding_name="DB"
    ;;
  meta)
    binding_name="DB_META"
    ;;
  current)
    binding_name="DB_CURRENT"
    ;;
  history|history-hk-2026)
    binding_name="DB_HISTORY_HK_2026"
    ;;
  history-hk-2025)
    binding_name="DB_HISTORY_HK_2025"
    ;;
  source|source-hk-2026)
    binding_name="DB_SOURCE_HK_2026"
    ;;
  source-hk-2025)
    binding_name="DB_SOURCE_HK_2025"
    ;;
  *)
    echo "Unsupported database family: $db_family" >&2
    exit 1
    ;;
esac

case "$environment" in
  local|preview)
    wrangler_env="preview"
    ;;
  production)
    wrangler_env="production"
    ;;
  *)
    echo "Unsupported environment: $environment" >&2
    exit 1
    ;;
esac

database_name="$(bun -e '
  const fs = require("fs");
  const path = process.argv[1];
  const bindingName = process.argv[2];
  const environment = process.argv[3];
  const raw = fs.readFileSync(path, "utf8");
  const config = JSON.parse(raw);
  const envConfig = environment === "production" ? config.env?.production : config.env?.preview;
  const entries = envConfig?.d1_databases ?? config.d1_databases ?? [];
  const match = entries.find(entry => entry.binding === bindingName);
  if (!match?.database_name) {
    process.stderr.write(`Could not resolve database for binding ${bindingName} in ${environment}\n`);
    process.exit(1);
  }
  process.stdout.write(match.database_name);
' "$wrangler_config" "$binding_name" "$wrangler_env")"

printf 'db_family=%q\n' "$db_family"
printf 'binding_name=%q\n' "$binding_name"
printf 'database_name=%q\n' "$database_name"
printf 'wrangler_config=%q\n' "$wrangler_config"
printf 'wrangler_env=%q\n' "$wrangler_env"
printf 'persist_dir=%q\n' "$persist_dir"
printf 'drop_sql_file=%q\n' "$drop_sql_file"
