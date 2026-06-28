#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" local)"

mkdir -p "$persist_dir"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"
IFS=',' read -r -a drop_types <<< "$drop_types_csv"

for i in "${!database_names[@]}"; do
  drop_sql_file="$sql_dir/drop-${drop_types[$i]}-db.sql"

  if [[ ! -f "$drop_sql_file" ]]; then
    echo "Missing drop SQL file: $drop_sql_file" >&2
    exit 1
  fi

  printf 'Dropping local %s tables for %s (%s)\n' "${drop_types[$i]}" "${binding_names[$i]}" "${database_names[$i]}"
  bash "$script_dir/run-d1-execute.sh" "${database_names[$i]}" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --local \
    --persist-to "$persist_dir" \
    --file "$drop_sql_file"
done

echo "Dropped local $db_family D1 tables at $persist_dir"
