#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_file="$repo_root/scripts/fish/conf.d/saanseoi-upload-completion.fish"
target_dir="${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d"
target_file="$target_dir/saanseoi-upload-completion.fish"

mkdir -p "$target_dir"
ln -sfn "$source_file" "$target_file"

echo "Installed Fish completion:"
echo "  $target_file -> $source_file"
echo
echo "Open a new Fish session or run:"
echo "  source $target_file"
