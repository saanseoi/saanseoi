#!/usr/bin/env bash
set -euo pipefail

target_dir="${1:-../../.local/d1/dev}"

rm -rf "$target_dir"
mkdir -p "$target_dir"

echo "Reset local D1 state at $target_dir"
