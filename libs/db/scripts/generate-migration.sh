#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_dir="$(cd "$script_dir/.." && pwd)"
migrations_dir="$db_dir/migrations"

cd "$db_dir"
bun drizzle-kit generate --config=./drizzle.config.ts

find "$migrations_dir" -mindepth 1 -maxdepth 1 -type d | sort | while read -r migration_dir; do
  migration_name="$(basename "$migration_dir")"
  migration_sql="$migration_dir/migration.sql"
  flat_sql="$migrations_dir/${migration_name}.sql"

  if [[ -f "$migration_sql" ]]; then
    cp "$migration_sql" "$flat_sql"
  fi
done

echo "Synced flat SQL migrations for Wrangler in $migrations_dir"
