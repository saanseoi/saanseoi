#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"

bash "$script_dir/drop-local-db.sh" "${1:-}"
bash "$script_dir/migrate-local-db.sh"
