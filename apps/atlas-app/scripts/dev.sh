#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"

cd "$repo_root/apps/atlas-app"
bun run i18n:build
# Keep the public origin stable while allowing tailnet development to override it.
PUBLIC_ATLAS_API_BASE_URL="${PUBLIC_ATLAS_API_BASE_URL:-http://api.atlas.localhost}" \
  ORIGIN="${ORIGIN:-http://atlas.localhost}" exec bun x vite dev
