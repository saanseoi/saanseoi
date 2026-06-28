#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <local-database-id>" >&2
  exit 1
fi

local_database_id="$1"
repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
miniflare_d1_dir="$repo_root/.local/d1/dev/v3/d1/miniflare-D1DatabaseObject"

resolved_path="$(
  bun -e '
    const crypto = require("node:crypto");
    const path = require("node:path");

    const persistDir = process.argv[1];
    const databaseId = process.argv[2];
    const uniqueKey = "miniflare-D1DatabaseObject";

    const key = crypto.createHash("sha256").update(uniqueKey).digest();
    const nameHmac = crypto.createHmac("sha256", key).update(databaseId).digest().subarray(0, 16);
    const hmac = crypto.createHmac("sha256", key).update(nameHmac).digest().subarray(0, 16);
    const objectId = Buffer.concat([nameHmac, hmac]).toString("hex");

    process.stdout.write(path.join(persistDir, `${objectId}.sqlite`));
  ' "$miniflare_d1_dir" "$local_database_id"
)"

printf '%s\n' "$resolved_path"
