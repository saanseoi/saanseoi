#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
persist_dir="$repo_root/.local/d1/dev"

mkdir -p "$persist_dir"

exec bun x wrangler dev --persist-to "$persist_dir" \
  --port 8787 \
  --inspector-port 9229
