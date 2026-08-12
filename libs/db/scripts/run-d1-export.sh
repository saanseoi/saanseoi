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

filter_output() {
  sed \
    -e '/You can also download your export from the following URL manually\./d' \
    -e '/https:\/\/.*r2\.cloudflarestorage\.com\/d1-sqlio-outgoing/d'
}

# Do not let Bun auto-load the repository's .env files in this child process.
# Authentication is intentionally inherited from the caller's environment.
if (
  cd /tmp
  env -u CLOUDFLARE_API_TOKEN \
    node "$repo_root/node_modules/wrangler/bin/wrangler.js" d1 export "$@"
) >"$tmp_output" 2>&1; then
  filter_output <"$tmp_output"
  exit 0
fi

filter_output <"$tmp_output" >&2
exit 1
