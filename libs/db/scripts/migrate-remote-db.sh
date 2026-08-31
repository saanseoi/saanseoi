#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
environment="${2:-preview}"

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" "$environment")"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

migration_concurrency="${SAANSEOI_D1_MIGRATION_CONCURRENCY:-4}"
if ! [[ "$migration_concurrency" =~ ^[1-9][0-9]*$ ]]; then
  echo "SAANSEOI_D1_MIGRATION_CONCURRENCY must be a positive integer." >&2
  exit 1
fi

run_migration() {
  local index="$1"
  printf 'Applying %s migrations for %s (%s)\n' "$wrangler_env" "${binding_names[$index]}" "${database_names[$index]}"
  bash "$script_dir/run-d1-migrations.sh" "${database_names[$index]}" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --remote
}

running=0
failed=0
for i in "${!database_names[@]}"; do
  run_migration "$i" &
  running=$((running + 1))
  if (( running >= migration_concurrency )); then
    if ! wait -n; then
      failed=1
    fi
    running=$((running - 1))
  fi
done
while (( running > 0 )); do
  if ! wait -n; then
    failed=1
  fi
  running=$((running - 1))
done
exit "$failed"
