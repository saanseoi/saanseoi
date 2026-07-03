#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
dump_path="${1:-$repo_root/.local/d1/dumps/latest}"
db_family="${2:-all}"
persist_dir="${3:-$repo_root/.local/d1/dev}"

if [[ -z "$dump_path" ]]; then
  echo "Usage: $0 <dump.sql|dump-dir> [db-family] [persist-dir]" >&2
  exit 1
fi

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" local)"

import_sql_file() {
  local database_name="$1"
  local sql_file="$2"

  if [[ ! -f "$sql_file" ]]; then
    echo "Dump file not found: $sql_file" >&2
    exit 1
  fi

  bash "$script_dir/run-d1-execute.sh" "$database_name" \
    --config "$wrangler_config" \
    --env "$wrangler_env" \
    --local \
    --persist-to "$persist_dir" \
    --file "$sql_file"
}

if [[ -f "$dump_path" ]]; then
  import_sql_file "$database_name" "$dump_path"
  echo "Imported $dump_path into local D1 at $persist_dir"
  exit 0
fi

if [[ -L "$dump_path" ]]; then
  dump_path="$(readlink -f "$dump_path")"
fi

manifest_file="$dump_path/manifest.json"

if [[ ! -f "$manifest_file" ]]; then
  echo "Dump manifest not found: $manifest_file" >&2
  exit 1
fi

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

for i in "${!binding_names[@]}"; do
  binding_name="${binding_names[$i]}"
  local_database_name="${database_names[$i]}"
  dump_file="$(
    bun -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const bindingName = process.argv[2];
      const database = manifest.databases?.find(item => item.bindingName === bindingName);

      if (!database?.file) {
        process.exit(2);
      }

      process.stdout.write(database.file);
    ' "$manifest_file" "$binding_name" || true
  )"

  if [[ -z "$dump_file" ]]; then
    echo "Dump manifest does not include $binding_name; skipping." >&2
    continue
  fi

  printf 'Importing %s into local %s\n' "$binding_name" "$local_database_name"
  import_sql_file "$local_database_name" "$dump_path/$dump_file"
done

echo "Imported $dump_path into local D1 at $persist_dir"
