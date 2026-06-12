#!/usr/bin/env bash
set -euo pipefail

db_family="${1:-meta}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
eval "$(bash "$script_dir/lib/resolve-db-family-config.sh" "$db_family")"

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
load_env_file "$repo_root/.env.local"

local_db_path="${!local_path_env:-}"

if [[ -z "$local_db_path" ]]; then
  echo "Missing $local_path_env for the $db_family family." >&2
  echo >&2
  echo "Set it in your shell or .env.local, then rerun \`bun run --filter @repo/db db:studio:$db_family\`." >&2
  exit 1
fi

cd "$repo_root/libs/db"
exec env "$local_path_env=$local_db_path" bun drizzle-kit studio --config="$config_file"
