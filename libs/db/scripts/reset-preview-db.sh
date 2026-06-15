#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
environment="${2:-preview}"

bash "$script_dir/drop-preview-db.sh" "$db_family" "$environment"
bash "$script_dir/migrate-preview-db.sh" "$db_family" "$environment"
