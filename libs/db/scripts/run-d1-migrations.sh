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

# Generated Place DDL changes canonical dependency ownership and hashes. Never
# discard retained row dependencies through an unreviewed populated migration.
bun x wrangler d1 execute "$@" --json --command "SELECT count(*) AS legacy FROM sqlite_master WHERE type='table' AND name='places' AND NOT EXISTS (SELECT 1 FROM pragma_table_info('places') WHERE name='addressRole')" >"$tmp_output"
legacy_places="$(python3 -c 'import json,sys; print(sum(row.get("legacy",0) for result in json.load(sys.stdin) for row in result.get("results",[])))' <"$tmp_output")"
if [[ "$legacy_places" != "0" ]]; then
  bun x wrangler d1 execute "$@" --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('places','placePublicationState','addressPublicationState','address2d')" >"$tmp_output"
  dependency_tables="$(python3 -c 'import json,sys; print(" ".join(row["name"] for result in json.load(sys.stdin) for row in result.get("results",[])))' <"$tmp_output")"
  for dependency_table in $dependency_tables; do
    bun x wrangler d1 execute "$@" --json --command "SELECT count(*) AS records FROM $dependency_table" >"$tmp_output"
    dependency_rows="$(python3 -c 'import json,sys; print(sum(row.get("records",0) for result in json.load(sys.stdin) for row in result.get("results",[])))' <"$tmp_output")"
    if [[ "$dependency_rows" != "0" ]]; then
      echo "Populated Place and Address data requires a reset and reinitialisation. Schema migrations were not applied." >&2
      exit 1
    fi
  done
fi

if bun x wrangler d1 migrations apply "$@" >"$tmp_output" 2>&1; then
  grep -E "Migrations to be applied:|Executing on (local|remote) database|commands executed successfully|status \||✅|No migrations to apply" "$tmp_output" || true
  exit 0
fi

cat "$tmp_output" >&2
exit 1
