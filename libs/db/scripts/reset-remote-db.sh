#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
environment="${2:-preview}"

bash "$script_dir/drop-remote-db.sh" "$db_family" "$environment"
bash "$script_dir/migrate-remote-db.sh" "$db_family" "$environment"

case "$db_family" in
  all|meta)
    bun "$script_dir/seed-meta.ts" "$environment"
    ;;
  current|history|source|history-hk-2025|history-hk-2026|source-hk-2025|source-hk-2026)
    ;;
esac
