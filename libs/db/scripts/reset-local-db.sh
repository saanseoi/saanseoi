#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"

bash "$script_dir/drop-local-db.sh" "$db_family"
bash "$script_dir/migrate-local-db.sh" "$db_family"

case "$db_family" in
  all|meta)
    bun "$script_dir/syncMetaRegistry.ts" local
    ;;
  current|history|source|history-hk-2025|history-hk-2026|source-hk-2025|source-hk-2026)
    ;;
esac
