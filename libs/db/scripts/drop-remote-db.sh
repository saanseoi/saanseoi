#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
environment="${2:-preview}"

case "$environment" in
  preview|local)
    ;;
  *)
    echo "drop-remote-db.sh rejects environment '$environment'; only preview-target environments are allowed." >&2
    exit 1
    ;;
esac

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" "$environment")"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

for i in "${!database_names[@]}"; do
  printf 'Dropping %s tables for %s (%s)\n' "$wrangler_env" "${binding_names[$i]}" "${database_names[$i]}"
  bash "$script_dir/run-d1-execute.sh" "${database_names[$i]}" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --remote \
    --file "$drop_sql_file"
done
