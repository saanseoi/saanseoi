#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <wrangler-arg> [wrangler-arg...]" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_root/.local/wrangler}"
export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-$repo_root/.local/wrangler/logs}"

mkdir -p "$XDG_CONFIG_HOME"
mkdir -p "$WRANGLER_LOG_PATH"

tmp_output="$(mktemp)"
cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

# See run-d1-execute.sh: prefer the dedicated D1 import token and never inherit
# an application API token that points at a different Cloudflare account.
if [[ -n "${CLOUDFLARE_D1_TOKEN:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_D1_TOKEN"
else
  unset CLOUDFLARE_API_TOKEN
fi

if bun x wrangler d1 migrations apply "$@" >"$tmp_output" 2>&1; then
  grep -E "Migrations to be applied:|Executing on (local|remote) database|commands executed successfully|status \||✅|No migrations to apply" "$tmp_output" || true
  exit 0
fi

cat "$tmp_output" >&2
exit 1
