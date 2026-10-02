#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
persist_dir="$repo_root/.local/d1/dev"
port=8787
inspector_port=9249

mkdir -p "$persist_dir"

# Killing a listener can make its Wrangler supervisor respawn it and race startup.
# Leave existing servers intact and ask for their owning dev command to be stopped.
for target_port in "$port" "$inspector_port"; do
  if command -v fuser >/dev/null 2>&1 && fuser -s "${target_port}/tcp"; then
    echo "Atlas cannot start: TCP port $target_port is already in use." >&2
    echo "Stop the existing Atlas dev command (Ctrl+C in its terminal), then retry." >&2
    fuser -v "${target_port}/tcp" >&2 || true
    exit 1
  fi
done

exec bun x wrangler dev --persist-to "$persist_dir" \
  --port "$port" \
  --inspector-port "$inspector_port"
