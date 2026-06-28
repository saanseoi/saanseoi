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

if bun x wrangler d1 execute "$@" --json >"$tmp_output" 2>&1; then
  bun -e '
    const raw = require("fs").readFileSync(process.argv[1], "utf8");
    const payload = JSON.parse(raw);
    const first = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {};
    const meta = first.meta ?? {};
    const resultCount = Array.isArray(first.results) ? first.results.length : 0;
    const summary = [
      "D1 execute succeeded.",
      meta.served_by ? `served_by=${meta.served_by}` : null,
      meta.duration != null ? `duration_ms=${meta.duration}` : null,
      meta.rows_read != null ? `rows_read=${meta.rows_read}` : null,
      meta.rows_written != null ? `rows_written=${meta.rows_written}` : null,
      meta.changed_db != null ? `changed_db=${meta.changed_db}` : null,
      `result_rows=${resultCount}`
    ].filter(Boolean);
    console.log(summary.join(" "));
  ' "$tmp_output"
  exit 0
fi

cat "$tmp_output" >&2
exit 1
