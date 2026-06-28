#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <local|preview|production>" >&2
  exit 1
fi

environment="$1"
repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"

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

bun -e '
  const fs = require("node:fs");

  const path = process.argv[1];
  const environment = process.argv[2];
  const raw = fs.readFileSync(path, "utf8");
  const config = JSON.parse(raw);
  const envConfig = environment === "production" ? config.env?.production : config.env?.preview;
  const entries = envConfig?.d1_databases ?? config.d1_databases ?? [];

  const targets = entries
    .filter(entry => {
      const binding = entry.binding ?? "";
      return (
        binding === "DB_META" ||
        binding === "DB_CURRENT" ||
        /^DB_HISTORY_[A-Z]{2}_\d{4}$/.test(binding) ||
        /^DB_SOURCE_[A-Z]{2}_\d{4}$/.test(binding)
      );
    })
    .sort((left, right) => left.binding.localeCompare(right.binding))
    .map(entry => {
      if (!entry.binding || !entry.database_name) {
        throw new Error("Expected D1 bindings to include binding and database_name.");
      }

      return {
        bindingName: entry.binding,
        databaseId: entry.database_id ?? null,
        databaseName: entry.database_name,
        localDatabaseId: entry.preview_database_id ?? entry.database_id ?? entry.binding,
        previewDatabaseId: entry.preview_database_id ?? null,
        migrationsDir: entry.migrations_dir
          ? require("node:path").resolve(require("node:path").dirname(path), entry.migrations_dir)
          : null,
        migrationsTable: entry.migrations_table ?? "d1_migrations",
      };
    });

  if (targets.length === 0) {
    throw new Error(`Could not resolve D1 targets for ${environment}.`);
  }

  process.stdout.write(JSON.stringify({ environment, wranglerEnv: environment === "production" ? "production" : "preview", targets }));
' "$wrangler_config" "$environment"
