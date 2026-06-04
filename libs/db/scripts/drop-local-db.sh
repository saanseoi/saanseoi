#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
persist_dir="${1:-$repo_root/apps/harbour-api/.wrangler/state}"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"
sql_file="$(cd "$(dirname "$0")" && pwd)/sql/drop-preview-db.sql"
script_dir="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$persist_dir"

bash "$script_dir/run-d1-execute.sh" ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir" \
  --file "$sql_file"

echo "Dropped local D1 tables at $persist_dir"
