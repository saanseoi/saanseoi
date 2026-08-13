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

# Node avoids Bun's automatic repository .env loading. Prefer the scoped D1
# token over a general Cloudflare token, matching the other D1 helper scripts.
wrangler_env=(env -u CLOUDFLARE_API_TOKEN)
if [[ -n "${CLOUDFLARE_D1_TOKEN:-}" ]]; then
  wrangler_env=(env "CLOUDFLARE_API_TOKEN=$CLOUDFLARE_D1_TOKEN")
fi

if (
  cd /tmp
  "${wrangler_env[@]}" node "$repo_root/node_modules/wrangler/bin/wrangler.js" d1 export "$@"
) >"$tmp_output" 2>&1; then
  filter_output <"$tmp_output"
  exit 0
fi

filter_output <"$tmp_output" >&2
exit 1
