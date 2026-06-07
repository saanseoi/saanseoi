#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"
persist_dir="$repo_root/apps/harbour-api/.wrangler/state"
sql_file="$(cd "$(dirname "$0")" && pwd)/sql/rebuild-places-fts.sql"

mkdir -p "$persist_dir"

exec bun x wrangler d1 execute ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir" \
  --file "$sql_file"
