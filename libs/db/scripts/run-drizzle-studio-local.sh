#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"

local_db_glob="$repo_root/.local/d1/dev/v3/d1/miniflare-D1DatabaseObject/*.sqlite"
local_db_path="${LOCAL_D1_SQLITE_PATH:-}"

if [[ -z "$local_db_path" ]]; then
  for candidate in $local_db_glob; do
    if [[ -f "$candidate" && "$candidate" != *"/metadata.sqlite" ]]; then
      local_db_path="$candidate"
      break
    fi
  done
fi

if [[ -z "$local_db_path" ]]; then
  echo "Could not find a local D1 sqlite file." >&2
  echo >&2
  echo "Run \`bun run db:migration:run:local\` first or set LOCAL_D1_SQLITE_PATH." >&2
  exit 1
fi

cd "$repo_root/libs/db"
exec env LOCAL_D1_SQLITE_PATH="$local_db_path" bun drizzle-kit studio --config=./drizzle.config.ts
