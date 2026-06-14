#!/usr/bin/env bash
set -euo pipefail

db_family="${1:-meta}"
requested_year="${2:-}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
eval "$(bash "$script_dir/lib/resolve-db-family-config.sh" "$db_family" "$requested_year")"

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

resolve_miniflare_db_path() {
  local target_family="$1"
  local persist_dir="$repo_root/.local/d1/dev/v3/d1/miniflare-D1DatabaseObject"
  local local_database_id

  eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$target_family" local)"

  bun -e '
    const crypto = require("node:crypto");
    const path = require("node:path");

    const persistDir = process.argv[1];
    const databaseId = process.argv[2];
    const uniqueKey = "miniflare-D1DatabaseObject";

    const key = crypto.createHash("sha256").update(uniqueKey).digest();
    const nameHmac = crypto.createHmac("sha256", key).update(databaseId).digest().subarray(0, 16);
    const hmac = crypto.createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
    const objectId = Buffer.concat([nameHmac, hmac]).toString("hex");

    process.stdout.write(path.join(persistDir, `${objectId}.sqlite`));
  ' "$persist_dir" "$local_database_id"
}

if [[ -z "$local_db_path" ]]; then
  local_db_path="$(resolve_miniflare_db_path "$d1_target_family" || true)"
fi

if [[ -z "$local_db_path" ]]; then
  echo "Missing $local_path_env for the $db_family family." >&2
  echo >&2
  if [[ -n "$drizzle_db_year" ]]; then
    echo "Set it in your shell or .env.local, then rerun \`bun run --filter @repo/db db:studio:$db_family:$drizzle_db_year\`." >&2
    echo "Could not resolve the Miniflare binding path for $d1_target_family." >&2
  else
    echo "Set it in your shell or .env.local, then rerun \`bun run --filter @repo/db db:studio:$db_family\`." >&2
    echo "Could not resolve the Miniflare binding path for $d1_target_family." >&2
  fi
  exit 1
fi

cd "$repo_root/libs/db"
exec env \
  DRIZZLE_DB_YEAR="$drizzle_db_year" \
  "$local_path_env=$local_db_path" \
  bash "$script_dir/lib/run-drizzle-kit-cli.sh" studio --config="$config_file"
