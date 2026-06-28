#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <wrangler-arg> [wrangler-arg...]" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_root/.local/wrangler}"

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

if bun x wrangler d1 export "$@" >"$tmp_output" 2>&1; then
  filter_output <"$tmp_output"
  exit 0
fi

filter_output <"$tmp_output" >&2
exit 1
