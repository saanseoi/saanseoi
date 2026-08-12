#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"

# When started on its own, ensure the metadata schema exists before Vite's
# Cloudflare platform proxy opens the shared local D1 database.
if [[ "${SAANSEOI_LOCAL_D1_MIGRATIONS_READY:-}" != "1" ]]; then
  bash "$repo_root/libs/db/scripts/migrate-local-db.sh" meta
fi

cd "$repo_root/apps/atlas-app"
bun run i18n:build
exec bun x vite dev
