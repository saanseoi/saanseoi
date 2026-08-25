#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
persist_dir="$repo_root/.local/d1/dev"

mkdir -p "$persist_dir"

exec node "$repo_root/node_modules/wrangler/wrangler-dist/cli.js" dev \
  -c "$repo_root/apps/harbour-api/wrangler.jsonc" \
  -c "$repo_root/apps/harbour-workers/wrangler.jsonc" \
  --persist-to "$persist_dir" \
  --port 8788 \
  --inspector-port 9230
