#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"

cleanup_local_upload_state() {
  local repo_root
  repo_root="$(cd "$script_dir/../../.." && pwd)"
  local release_root="$repo_root/.local/harbour-sql/releases"
  local r2_root="$repo_root/.local/d1/dev/v3/r2"

  # These are local, reproducible pipeline artifacts and Miniflare R2 objects.
  # Keep partial resets narrowly scoped; a full reset starts with no upload state.
  printf 'Clearing local upload artifacts at %s\n' "$release_root"
  rm -rf "$release_root"
  printf 'Clearing local Miniflare R2 objects at %s\n' "$r2_root"
  rm -rf "$r2_root"
}

bash "$script_dir/drop-local-db.sh" "$db_family"
bash "$script_dir/migrate-local-db.sh" "$db_family"

case "$db_family" in
  all|meta)
    bun "$script_dir/syncMetaRegistry.ts" local
    ;;
  current|history|source|history-hk-2025|history-hk-2026|source-hk-2025|source-hk-2026)
    ;;
esac

bash "$script_dir/vacuum-local-db.sh" "$db_family"

if [[ "$db_family" == 'all' ]]; then
  cleanup_local_upload_state
fi
