#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
target_dir="${1:-$repo_root/.local/d1/dev}"

rm -rf "$target_dir"
mkdir -p "$target_dir"

echo "Reset local D1 state at $target_dir"
