#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
Combined migration generation is not supported in this repo.

Generate a specific database family instead:
  bun run db:migration:generate:meta
  bun run db:migration:generate:current
  bun run db:migration:generate:history
  bun run db:migration:generate:source
EOF

exit 1
