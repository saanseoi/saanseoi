#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
db_family="${2:-meta}"
requested_year="${3:-}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
eval "$(bash "$script_dir/lib/resolve-db-family-config.sh" "$db_family" "$requested_year")"

if [[ "$target" != "preview" && "$target" != "production" ]]; then
  echo "Usage: $0 <preview|production> [meta|current|history|source] [year]" >&2
  exit 1
fi

load_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

load_env_file "$repo_root/.env"
eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$d1_target_family" "$target")"

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Missing CLOUDFLARE_ACCOUNT_ID. Define it in your shell or $repo_root/.env." >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_D1_TOKEN:-}" ]]; then
  echo "Missing CLOUDFLARE_D1_TOKEN. Define it in your shell or $repo_root/.env." >&2
  exit 1
fi

if [[ -z "${database_id:-}" ]]; then
  echo "Missing remote database_id for $db_family in the $target Wrangler config." >&2
  echo "Check $wrangler_config env.$wrangler_env.d1_databases for $binding_name." >&2
  exit 1
fi

cd "$repo_root/libs/db"
exec env \
  CLOUDFLARE_D1_TARGET="$target" \
  DRIZZLE_DB_YEAR="$drizzle_db_year" \
  "$remote_database_id_env=$database_id" \
  bash "$script_dir/lib/run-drizzle-kit-cli.sh" studio --config="$config_file"
