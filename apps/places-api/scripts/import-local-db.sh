#!/usr/bin/env bash
set -euo pipefail

dump_file="${1:-}"

if [[ -z "$dump_file" ]]; then
  echo "Usage: $0 <dump.sql>" >&2
  exit 1
fi

if [[ ! -f "$dump_file" ]]; then
  echo "Dump file not found: $dump_file" >&2
  exit 1
fi

wrangler d1 execute ss-preview \
  --env preview \
  --local \
  --persist-to ".local/d1/dev" \
  --file "$dump_file"

echo "Imported $dump_file into local D1"
