#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
environment="${2:-preview}"

case "$environment" in
  production|preview|local)
    ;;
  *)
    echo "drop-remote-db.sh rejects environment '$environment'; allowed environments are production, preview, and local." >&2
    exit 1
    ;;
esac

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" "$environment")"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"
IFS=',' read -r -a drop_types <<< "$drop_types_csv"

for i in "${!database_names[@]}"; do
  drop_sql_file="$sql_dir/drop-${drop_types[$i]}-db.sql"

  if [[ ! -f "$drop_sql_file" ]]; then
    echo "Missing drop SQL file: $drop_sql_file" >&2
    exit 1
  fi

  printf 'Dropping %s %s tables for %s (%s)\n' "$wrangler_env" "${drop_types[$i]}" "${binding_names[$i]}" "${database_names[$i]}"
  bash "$script_dir/run-d1-execute.sh" "${database_names[$i]}" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --remote \
    --file "$drop_sql_file"
done
