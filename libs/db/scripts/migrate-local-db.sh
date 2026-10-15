#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
migration_jobs="${LOCAL_D1_MIGRATION_JOBS:-1}"

if [[ ! "$migration_jobs" =~ ^[1-9][0-9]*$ ]]; then
  echo "LOCAL_D1_MIGRATION_JOBS must be a positive integer." >&2
  exit 1
fi

if ! resolved_targets="$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" local)"; then
  exit 1
fi

eval "$resolved_targets"

mkdir -p "$persist_dir"

# Local D1 is a shared SQLite store. Serialise migration invocations from
# independently started dev processes before Wrangler/workerd opens it.
lock_file="$(dirname "$persist_dir")/migrations.lock"
exec 9>"$lock_file"
flock 9

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

# The inline-HISTORY data conversion verifies statistic ownership in local META.
metadata_id="$(bun -e '
  const config = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  const entry = (config.env?.[process.argv[2]]?.d1_databases ?? config.d1_databases)
    .find(entry => entry.binding === "DB_META");
  if (!entry) throw new Error("Missing local META binding");
  process.stdout.write(entry.preview_database_id ?? entry.database_id);
' "$wrangler_config" "$wrangler_env")"
metadata_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$metadata_id")"

history_args=()
while IFS= read -r history_id; do
  history_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$history_id")"
  history_args+=(--history "$history_path")
done < <(bun -e '
  const config = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const entry of config.env[process.argv[2]].d1_databases)
    if (entry.binding.startsWith("DB_HISTORY_"))
      console.log(entry.preview_database_id ?? entry.database_id ?? entry.binding);
' "$wrangler_config" "$wrangler_env")

run_migration() {
  local binding_name="$1"
  local database_name="$2"

  printf 'Applying local migrations for %s (%s)\n' "$binding_name" "$database_name"
  local target_fields sqlite_path
  target_fields="$(bun -e '
    const config = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const entry = (config.env?.[process.argv[2]]?.d1_databases ?? config.d1_databases)
      .find(entry => entry.binding === process.argv[3]);
    if (!entry?.migrations_dir) throw new Error("Missing migration directory");
    console.log([
      entry.preview_database_id ?? entry.database_id ?? entry.binding,
      require("node:path").resolve(require("node:path").dirname(process.argv[1]), entry.migrations_dir),
      entry.migrations_table ?? "d1_migrations",
    ].join("\t"));
  ' "$wrangler_config" "$wrangler_env" "$binding_name")" || return
  local local_id migrations_dir migrations_table
  IFS=$'\t' read -r local_id migrations_dir migrations_table <<< "$target_fields"
  sqlite_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$local_id")" || return
  python3 "$script_dir/migrate-local-sqlite.py" "$sqlite_path" "$migrations_dir" \
    "$(dirname "$persist_dir")/migration-backups" --table "$migrations_table" --metadata "$metadata_path" "${history_args[@]}"
}

if [[ "${#database_names[@]}" -eq 1 ]]; then
  status=0
  if ! run_migration "${binding_names[0]}" "${database_names[0]}"; then
    printf 'Local migrations failed for %s (%s)\n' "${binding_names[0]}" "${database_names[0]}" >&2
    status=1
  fi
  exit "$status"
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
