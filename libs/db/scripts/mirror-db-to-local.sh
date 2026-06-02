#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"

if [[ -z "$target" ]]; then
  echo "Usage: $0 <preview|production>" >&2
  exit 1
fi

case "$target" in
  preview)
    dump_script="db:dump:preview"
    ;;
  production)
    dump_script="db:dump:production"
    ;;
  *)
    echo "Unsupported target: $target" >&2
    exit 1
    ;;
esac

bun run --cwd "$repo_root" "$dump_script"
bun run --cwd "$repo_root" db:reset:local
bun run --cwd "$repo_root" db:migration:run:local
bun run --cwd "$repo_root" db:import:local
bun run --cwd "$repo_root" db:rebuild-fts:local

echo "Mirrored $target database into local D1 at apps/atlas-api/.local/d1/dev"
