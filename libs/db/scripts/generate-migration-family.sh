#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <meta|current|history|source>" >&2
  exit 1
fi

family="$1"
script_dir="$(cd "$(dirname "$0")" && pwd)"
db_dir="$(cd "$script_dir/.." && pwd)"

case "$family" in
  meta)
    config_file="./drizzle.meta.config.ts"
    migrations_dir="$db_dir/migrations/meta"
    ;;
  current|api-current)
    config_file="./drizzle.current.config.ts"
    migrations_dir="$db_dir/migrations/current"
    ;;
  history)
    config_file="./drizzle.history.config.ts"
    migrations_dir="$db_dir/migrations/history"
    ;;
  source)
    config_file="./drizzle.source.config.ts"
    migrations_dir="$db_dir/migrations/source"
    ;;
  *)
    echo "Unsupported migration family: $family" >&2
    exit 1
    ;;
esac

cd "$db_dir"
mkdir -p "$migrations_dir"

bun drizzle-kit generate --config="$config_file"

echo "Generated Drizzle migration artifacts for $family in $migrations_dir"
