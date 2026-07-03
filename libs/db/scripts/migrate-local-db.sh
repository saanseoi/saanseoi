#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
migration_jobs="${LOCAL_D1_MIGRATION_JOBS:-1}"

if [[ ! "$migration_jobs" =~ ^[1-9][0-9]*$ ]]; then
  echo "LOCAL_D1_MIGRATION_JOBS must be a positive integer." >&2
  exit 1
fi

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" local)"

mkdir -p "$persist_dir"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

run_migration() {
  local binding_name="$1"
  local database_name="$2"

  printf 'Applying local migrations for %s (%s)\n' "$binding_name" "$database_name"
  bash "$script_dir/run-d1-migrations.sh" "$database_name" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --local \
    --persist-to "$persist_dir"
}

if [[ "${#database_names[@]}" -eq 1 ]]; then
  run_migration "${binding_names[0]}" "${database_names[0]}"
  exit 0
fi

printf 'Applying local migrations for %s databases with up to %s parallel jobs\n' "${#database_names[@]}" "$migration_jobs"

status=0
next_index=0
while [[ "$next_index" -lt "${#database_names[@]}" ]]; do
  pids=()
  labels=()

  for ((job = 0; job < migration_jobs && next_index < ${#database_names[@]}; job++, next_index++)); do
    run_migration "${binding_names[$next_index]}" "${database_names[$next_index]}" &
    pids+=("$!")
    labels+=("${binding_names[$next_index]} (${database_names[$next_index]})")
  done

  for i in "${!pids[@]}"; do
    if ! wait "${pids[$i]}"; then
      printf 'Local migrations failed for %s\n' "${labels[$i]}" >&2
      status=1
    fi
  done

  if [[ "$status" -ne 0 ]]; then
    exit "$status"
  fi
done

exit "$status"
