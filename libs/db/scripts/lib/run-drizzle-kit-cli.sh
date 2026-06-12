#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"
drizzle_kit_bin="$repo_root/node_modules/drizzle-kit/bin.cjs"

if [[ ! -f "$drizzle_kit_bin" ]]; then
  echo "Missing drizzle-kit CLI at $drizzle_kit_bin." >&2
  echo "Install workspace dependencies, then rerun the command." >&2
  exit 1
fi

exec node "$drizzle_kit_bin" "$@"
