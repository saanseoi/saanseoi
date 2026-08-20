#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

mode="${1:-all}"
filters=()

case "$mode" in
  all)
    filters=(harbour-api atlas-api atlas-app basemap-viewer)
    ;;
  atlas)
    filters=(atlas-api atlas-app)
    ;;
  harbour)
    filters=(harbour-api)
    ;;
  *)
    printf 'Unknown development mode: %s\n' "$mode" >&2
    printf 'Usage: %s [all|atlas|harbour]\n' "$0" >&2
    exit 64
    ;;
esac

turbo_filters=()
for filter in "${filters[@]}"; do
  turbo_filters+=("--filter=$filter")
done

# Migrate before any local Worker opens the shared persisted D1 databases.
bash "$repo_root/libs/db/scripts/migrate-local-db.sh"

export SAANSEOI_LOCAL_D1_MIGRATIONS_READY=1
exec bun x turbo run dev "${turbo_filters[@]}"
