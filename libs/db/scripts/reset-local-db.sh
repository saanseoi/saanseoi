#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-legacy}"

bash "$script_dir/drop-local-db.sh" "$db_family"
bash "$script_dir/migrate-local-db.sh" "$db_family"
