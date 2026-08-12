#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"

# Migrate before any local Worker opens the shared persisted D1 databases.
bash "$repo_root/libs/db/scripts/migrate-local-db.sh"

export SAANSEOI_LOCAL_D1_MIGRATIONS_READY=1
exec bun x turbo run dev \
  --filter=harbour-api \
  --filter=atlas-api \
  --filter=atlas-app \
  --filter=basemap-viewer
