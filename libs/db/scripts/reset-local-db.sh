#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
exec bun "$script_dir/reset-local-db.ts" "${1:-all}"
