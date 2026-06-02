#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
wrangler_config="$repo_root/apps/atlas-api/wrangler.jsonc"
persist_dir="$repo_root/.local/d1/dev"

mkdir -p "$persist_dir"

exec bun x wrangler d1 migrations apply ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir"
