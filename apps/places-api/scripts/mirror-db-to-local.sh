#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"

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

bun run "$dump_script"
bun run db:reset:local
bun run db:migrate:local
bun run db:import:local
bun run db:rebuild-fts:local

echo "Mirrored $target database into local D1 at .local/d1/dev"
