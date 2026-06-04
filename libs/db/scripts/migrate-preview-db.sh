#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
wrangler_config="$repo_root/apps/atlas-api/wrangler.jsonc"
script_dir="$(cd "$(dirname "$0")" && pwd)"

bash "$script_dir/run-d1-migrations.sh" ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --remote
