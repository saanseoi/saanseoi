#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"

cd "$repo_root/apps/atlas-app"
bun run i18n:build
exec bun x vite dev
