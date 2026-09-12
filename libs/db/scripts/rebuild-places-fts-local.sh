#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"
persist_dir="$repo_root/.local/d1/dev"
sql_file="$(cd "$(dirname "$0")" && pwd)/sql/rebuild-places-fts.sql"
address_sql_file="$(cd "$(dirname "$0")" && pwd)/sql/rebuild-addresses-fts.sql"
division_sql_file="$(cd "$(dirname "$0")" && pwd)/sql/rebuild-divisions-fts.sql"

mkdir -p "$persist_dir"

bun x wrangler d1 execute ss-current-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir" \
  --file "$sql_file"

bun x wrangler d1 execute ss-current-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir" \
  --file "$address_sql_file"

exec bun x wrangler d1 execute ss-current-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir" \
  --file "$division_sql_file"
