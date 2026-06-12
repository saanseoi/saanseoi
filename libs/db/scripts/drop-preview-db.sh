#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-legacy}"
environment="${2:-preview}"

case "$environment" in
  preview|local)
    ;;
  *)
    echo "drop-preview-db.sh rejects environment '$environment'; only preview-target environments are allowed." >&2
    exit 1
    ;;
esac

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" "$environment")"

bash "$script_dir/run-d1-execute.sh" "$database_name" \
  --config "$wrangler_config" \
  --env "$wrangler_env" \
  --remote \
  --file "$drop_sql_file"
