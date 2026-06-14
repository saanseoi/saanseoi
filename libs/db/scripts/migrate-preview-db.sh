#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-legacy}"
environment="${2:-preview}"

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" "$environment")"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

for i in "${!database_names[@]}"; do
  printf 'Applying %s migrations for %s (%s)\n' "$wrangler_env" "${binding_names[$i]}" "${database_names[$i]}"
  bash "$script_dir/run-d1-migrations.sh" "${database_names[$i]}" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --remote
done
