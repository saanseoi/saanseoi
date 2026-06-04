#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
persist_dir="$repo_root/.local/d1/dev"
port=8787
inspector_port=9249

mkdir -p "$persist_dir"

# Clear any stale local Atlas dev processes still holding the expected ports.
for target_port in "$port" "$inspector_port"; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${target_port}/tcp" 2>/dev/null || true
  fi
done

exec bun x wrangler dev --persist-to "$persist_dir" \
  --port "$port" \
  --inspector-port "$inspector_port"
