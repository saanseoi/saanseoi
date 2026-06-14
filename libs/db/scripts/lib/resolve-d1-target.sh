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

targets_json="$(bun -e '
  const fs = require("fs");

  const path = process.argv[1];
  const dbFamily = process.argv[2];
  const environment = process.argv[3];
  const raw = fs.readFileSync(path, "utf8");
  const config = JSON.parse(raw);
  const envConfig = environment === "production" ? config.env?.production : config.env?.preview;
  const entries = envConfig?.d1_databases ?? config.d1_databases ?? [];

  const bindingMatchers = {
    legacy: binding => binding === "DB",
    meta: binding => binding === "DB_META",
    current: binding => binding === "DB_CURRENT",
    history: binding => /^DB_HISTORY_[A-Z]{2}_\d{4}$/.test(binding),
    source: binding => /^DB_SOURCE_[A-Z]{2}_\d{4}$/.test(binding),
    "history-hk-2025": binding => binding === "DB_HISTORY_HK_2025",
    "history-hk-2026": binding => binding === "DB_HISTORY_HK_2026",
    "source-hk-2025": binding => binding === "DB_SOURCE_HK_2025",
    "source-hk-2026": binding => binding === "DB_SOURCE_HK_2026",
  };

  const matcher = bindingMatchers[dbFamily];
  if (!matcher) {
    process.stderr.write(`Unsupported database family: ${dbFamily}\n`);
    process.exit(1);
  }

  const matches = entries
    .filter(entry => matcher(entry.binding))
    .sort((left, right) => left.binding.localeCompare(right.binding))
    .map(entry => {
      if (!entry.database_name) {
        process.stderr.write(`Missing database_name for binding ${entry.binding} in ${environment}\n`);
        process.exit(1);
      }

      return {
        bindingName: entry.binding,
        databaseId: entry.database_id ?? null,
        databaseName: entry.database_name,
        previewDatabaseId: entry.preview_database_id ?? null,
      };
    });

  if (matches.length === 0) {
    process.stderr.write(`Could not resolve databases for family ${dbFamily} in ${environment}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(matches));
' "$wrangler_config" "$db_family" "$wrangler_env")"

bindings_csv="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(targets.map(target => target.bindingName).join(","));' "$targets_json")"
database_names_csv="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(targets.map(target => target.databaseName).join(","));' "$targets_json")"
target_count="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(String(targets.length));' "$targets_json")"
binding_name="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(targets[0].bindingName);' "$targets_json")"
database_id="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(targets[0].databaseId ?? "");' "$targets_json")"
database_name="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(targets[0].databaseName);' "$targets_json")"
preview_database_id="$(bun -e 'const targets = JSON.parse(process.argv[1]); process.stdout.write(targets[0].previewDatabaseId ?? "");' "$targets_json")"
local_database_id="$(bun -e 'const targets = JSON.parse(process.argv[1]); const target = targets[0]; process.stdout.write(target.previewDatabaseId ?? target.databaseId ?? target.bindingName);' "$targets_json")"

printf 'db_family=%q\n' "$db_family"
printf 'binding_name=%q\n' "$binding_name"
printf 'database_id=%q\n' "$database_id"
printf 'database_name=%q\n' "$database_name"
printf 'preview_database_id=%q\n' "$preview_database_id"
printf 'local_database_id=%q\n' "$local_database_id"
printf 'bindings_csv=%q\n' "$bindings_csv"
printf 'database_names_csv=%q\n' "$database_names_csv"
printf 'target_count=%q\n' "$target_count"
printf 'wrangler_config=%q\n' "$wrangler_config"
printf 'wrangler_env=%q\n' "$wrangler_env"
printf 'persist_dir=%q\n' "$persist_dir"
printf 'drop_sql_file=%q\n' "$drop_sql_file"
