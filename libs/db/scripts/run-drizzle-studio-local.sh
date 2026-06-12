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

resolve_local_db_path() {
  local family="$1"
  local persist_dir="$repo_root/.local/d1/dev/v3/d1/miniflare-D1DatabaseObject"
  local sentinel_table=""

  case "$family" in
    meta)
      sentinel_table="publishers"
      ;;
    source)
      sentinel_table="sourceOvertureDivisions"
      ;;
    *)
      return 1
      ;;
  esac

  if [[ ! -d "$persist_dir" ]]; then
    return 1
  fi

  local resolved
  resolved="$(
    bun -e '
      const { Database } = require("bun:sqlite");
      const fs = require("fs");
      const path = require("path");

      const dir = process.argv[1];
      const sentinelTable = process.argv[2];
      const candidates = fs
        .readdirSync(dir)
        .filter(name => name.endsWith(".sqlite") && name !== "metadata.sqlite")
        .map(name => path.join(dir, name))
        .sort();

      for (const candidate of candidates) {
        const db = new Database(candidate, { readonly: true });
        try {
          const row = db
            .query("SELECT 1 AS found FROM sqlite_master WHERE type = '\''table'\'' AND name = ? LIMIT 1")
            .get(sentinelTable);
          if (row?.found === 1) {
            process.stdout.write(candidate);
            process.exit(0);
          }
        } finally {
          db.close();
        }
      }

      process.exit(1);
    ' "$persist_dir" "$sentinel_table" 2>/dev/null
  )" || return 1

  printf '%s\n' "$resolved"
}

if [[ -z "$local_db_path" ]]; then
  local_db_path="$(resolve_local_db_path "$db_family" || true)"
fi

if [[ -z "$local_db_path" ]]; then
  echo "Missing $local_path_env for the $db_family family." >&2
  echo >&2
  echo "Set it in your shell or .env.local, then rerun \`bun run --filter @repo/db db:studio:$db_family\`." >&2
  echo "Auto-discovery currently supports local persisted meta/source DBs only." >&2
  exit 1
fi

cd "$repo_root/libs/db"
exec env \
  "$local_path_env=$local_db_path" \
  bash "$script_dir/lib/run-drizzle-kit-cli.sh" studio --config="$config_file"
