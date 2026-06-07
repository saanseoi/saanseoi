#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  if [[ -n "${atlas_pid:-}" ]]; then
    kill "$atlas_pid" 2>/dev/null || true
    wait "$atlas_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

(
  cd "$repo_root/apps/atlas-api"
  bash ./scripts/dev.sh
) &
atlas_pid=$!

exec bash "$repo_root/scripts/dev-local-stack.sh"
