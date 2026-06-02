#!/usr/bin/env bash
set -euo pipefail

dump_file="${1:-}"
wrangler_config="${2:-../../apps/atlas-api/wrangler.jsonc}"
persist_dir="${3:-../../.local/d1/dev}"

if [[ -z "$dump_file" ]]; then
  echo "Usage: $0 <dump.sql> [wrangler-config] [persist-dir]" >&2
  exit 1
fi

if [[ ! -f "$dump_file" ]]; then
  echo "Dump file not found: $dump_file" >&2
  exit 1
fi

wrangler d1 execute ss-db-preview \
  --config "$wrangler_config" \
  --env preview \
  --local \
  --persist-to "$persist_dir" \
  --file "$dump_file"

echo "Imported $dump_file into local D1 at $persist_dir"
