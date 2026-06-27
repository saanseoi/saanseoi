#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="${1:-all}"
environment="${2:-preview}"

bash "$script_dir/drop-remote-db.sh" "$db_family" "$environment"
bash "$script_dir/migrate-remote-db.sh" "$db_family" "$environment"
