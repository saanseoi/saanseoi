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
  current)
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

if [[ -t 0 && -t 1 ]]; then
  bun drizzle-kit generate --config="$config_file"
else
  set +e
  drizzle_output="$(bun drizzle-kit generate --config="$config_file" 2>&1)"
  drizzle_status=$?
  set -e

  printf '%s\n' "$drizzle_output"

  if [[ $drizzle_status -ne 0 ]]; then
    exit $drizzle_status
  fi

  if grep -q "Interactive prompts require a TTY terminal" <<<"$drizzle_output"; then
    echo "Drizzle migration generation aborted: the current schema diff requires interactive rename/drop confirmation, but no TTY was available." >&2
    echo "Run this command from an interactive terminal so Drizzle can ask the rename-resolution questions." >&2
    exit 1
  fi

  if grep -q "^Error:" <<<"$drizzle_output"; then
    echo "Drizzle migration generation reported an error even though it exited with status 0." >&2
    exit 1
  fi
fi

echo "Generated Drizzle migration artifacts for $family in $migrations_dir"
