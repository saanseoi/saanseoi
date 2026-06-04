#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"
persist_dir="$repo_root/apps/harbour-api/.wrangler/state"
script_dir="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$persist_dir"

bash "$script_dir/run-d1-migrations.sh" ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir"
