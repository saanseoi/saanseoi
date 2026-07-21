#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
drop_jobs="${LOCAL_D1_DROP_JOBS:-8}"

if [[ ! "$drop_jobs" =~ ^[1-9][0-9]*$ ]]; then
  echo "LOCAL_D1_DROP_JOBS must be a positive integer." >&2
  exit 1
fi

if ! resolved_targets="$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" local)"; then
  exit 1
fi

eval "$resolved_targets"

mkdir -p "$persist_dir"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"
IFS=',' read -r -a drop_types <<< "$drop_types_csv"

drop_database() {
  local binding_name="$1"
  local database_name="$2"
  local drop_type="$3"
  local drop_sql_file="$sql_dir/drop-$drop_type-db.sql"

  if [[ ! -f "$drop_sql_file" ]]; then
    echo "Missing drop SQL file: $drop_sql_file" >&2
    return 1
  fi

  printf 'Dropping local %s tables for %s (%s)\n' "$drop_type" "$binding_name" "$database_name"
  bash "$script_dir/run-d1-execute.sh" "$database_name" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --local \
    --persist-to "$persist_dir" \
    --file "$drop_sql_file"
}

if [[ "${#database_names[@]}" -eq 1 ]]; then
  drop_database "${binding_names[0]}" "${database_names[0]}" "${drop_types[0]}"
else
  printf 'Dropping local tables for %s databases with up to %s parallel jobs\n' "${#database_names[@]}" "$drop_jobs"

  next_index=0
  while [[ "$next_index" -lt "${#database_names[@]}" ]]; do
    pids=()
    labels=()

    for ((job = 0; job < drop_jobs && next_index < ${#database_names[@]}; job++, next_index++)); do
      drop_database \
        "${binding_names[$next_index]}" \
        "${database_names[$next_index]}" \
        "${drop_types[$next_index]}" &
      pids+=("$!")
      labels+=("${binding_names[$next_index]} (${database_names[$next_index]})")
    done

    for i in "${!pids[@]}"; do
      if ! wait "${pids[$i]}"; then
        printf 'Local table drop failed for %s\n' "${labels[$i]}" >&2
        exit 1
      fi
    done
  done
fi

echo "Dropped local $db_family D1 tables at $persist_dir"
