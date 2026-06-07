#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
persist_dir="$repo_root/apps/harbour-api/.wrangler/state"
db_migrate_script="$repo_root/libs/db/scripts/migrate-local-db.sh"

mkdir -p "$persist_dir"

bash "$db_migrate_script"

exec bun x wrangler dev --persist-to "$persist_dir" \
  --port 8788 \
  --inspector-port 9230
