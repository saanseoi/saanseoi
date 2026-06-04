#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
wrangler_config="$repo_root/apps/atlas-api/wrangler.jsonc"
sql_file="$(cd "$(dirname "$0")" && pwd)/sql/drop-preview-db.sql"
script_dir="$(cd "$(dirname "$0")" && pwd)"

bash "$script_dir/run-d1-execute.sh" ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --remote \
  --file "$sql_file"
