#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_dir="$(cd "$script_dir/.." && pwd)"
migrations_dir="$db_dir/migrations"

cd "$db_dir"
bun drizzle-kit generate --config=./drizzle.config.ts
echo "Generated Drizzle migration artifacts in $migrations_dir"
