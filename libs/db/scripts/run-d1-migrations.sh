#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <wrangler-arg> [wrangler-arg...]" >&2
  exit 1
fi

tmp_output="$(mktemp)"
cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

if bun x wrangler d1 migrations apply "$@" >"$tmp_output" 2>&1; then
  grep -E "Migrations to be applied:|Executing on (local|remote) database|commands executed successfully|status \||✅|No migrations to apply" "$tmp_output" || true
  exit 0
fi

cat "$tmp_output" >&2
exit 1
