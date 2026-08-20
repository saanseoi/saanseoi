#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
persist_dir="$repo_root/.local/d1/dev"
db_migrate_script="$repo_root/libs/db/scripts/migrate-local-db.sh"

mkdir -p "$persist_dir"

# Ensure the local preview D1 schema exists before workerd binds the database.
# A parent root development command may perform this once before starting services.
if [[ "${SAANSEOI_LOCAL_D1_MIGRATIONS_READY:-}" != "1" ]]; then
  bash "$db_migrate_script"
fi

exec bun x wrangler dev \
  -c "$repo_root/apps/harbour-api/wrangler.jsonc" \
  -c "$repo_root/apps/harbour-workers/wrangler.jsonc" \
  --persist-to "$persist_dir" \
  --port 8788 \
  --inspector-port 9230
