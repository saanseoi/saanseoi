#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"

bash "$script_dir/drop-preview-db.sh"
bash "$script_dir/migrate-preview-db.sh"
