#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
db_family="${2:-meta}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
eval "$(bash "$script_dir/lib/resolve-db-family-config.sh" "$db_family")"

if [[ "$target" != "preview" && "$target" != "production" ]]; then
  echo "Usage: $0 <preview|production> [meta|current|history|source]" >&2
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

case "$target" in
  preview)
    load_env_file "$repo_root/.env.preview"
    load_env_file "$repo_root/.env.preview.local"
    remote_database_id_target_env="${remote_database_id_env}_PREVIEW"
    ;;
  production)
    load_env_file "$repo_root/.env.prod"
    load_env_file "$repo_root/.env.prod.local"
    remote_database_id_target_env="${remote_database_id_env}_PRODUCTION"
    ;;
esac

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Missing CLOUDFLARE_ACCOUNT_ID. Define it in your shell or $repo_root/.env." >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_D1_TOKEN:-}" ]]; then
  echo "Missing CLOUDFLARE_D1_TOKEN. Define it in your shell or $repo_root/.env." >&2
  exit 1
fi

if [[ -z "${!remote_database_id_target_env:-}" ]]; then
  echo "Missing $remote_database_id_target_env for the $db_family family." >&2
  echo "Define it in the matching repo-root env file for $target." >&2
  exit 1
fi

cd "$repo_root/libs/db"
exec env \
  CLOUDFLARE_D1_TARGET="$target" \
  "$remote_database_id_env=${!remote_database_id_target_env}" \
  bash "$script_dir/lib/run-drizzle-kit-cli.sh" studio --config="$config_file"
