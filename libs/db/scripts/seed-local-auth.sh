#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
targets_payload="$(bash "$script_dir/lib/list-d1-targets.sh" local)"
local_database_id="$(bun -e '
  const target = JSON.parse(process.argv[1]).targets.find(target => target.bindingName === "DB_META");
  if (!target?.localDatabaseId) throw new Error("Missing local DB_META target");
  process.stdout.write(target.localDatabaseId);
' "$targets_payload")"
sqlite_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$local_database_id")"

if [[ ! -f "$sqlite_path" ]]; then
  echo "Local DB_META must be migrated before seeding accounts." >&2
  exit 1
fi

sqlite3 -bail -cmd '.timeout 5000' "$sqlite_path" < "$repo_root/fixtures/local/auth.sql"
