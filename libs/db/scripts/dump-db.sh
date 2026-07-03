#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
target="${1:-}"
db_family="${2:-all}"
dump_root="${3:-$repo_root/.local/d1/dumps}"

if [[ -z "$target" ]]; then
  echo "Usage: $0 <preview|production> [db-family] [dump-dir]" >&2
  exit 1
fi

case "$target" in
  preview|production)
    ;;
  *)
    echo "Unsupported target: $target" >&2
    exit 1
    ;;
esac

eval "$(bash "$script_dir/lib/resolve-d1-target.sh" "$db_family" "$target")"

export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_root/.local/wrangler}"
export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-$repo_root/.local/wrangler/logs}"

mkdir -p "$XDG_CONFIG_HOME"
mkdir -p "$WRANGLER_LOG_PATH"

json_string() {
  bun -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""));' "$1"
}

list_export_tables() {
  local database_name="$1"
  local config="$2"
  local env_name="$3"
  local tmp_output

  tmp_output="$(mktemp)"

  if ! bun x wrangler d1 execute "$database_name" \
    --config "$config" \
    --env "$env_name" \
    --remote \
    --json \
    --command "
      WITH virtual_tables AS (
        SELECT name
        FROM sqlite_schema
        WHERE type = 'table'
          AND upper(sql) LIKE 'CREATE VIRTUAL TABLE%'
      )
      SELECT table_schema.name
      FROM sqlite_schema AS table_schema
      WHERE table_schema.type = 'table'
        AND table_schema.name NOT LIKE 'sqlite_%'
        AND table_schema.name NOT IN (SELECT name FROM virtual_tables)
        AND NOT EXISTS (
          SELECT 1
          FROM virtual_tables
          WHERE table_schema.name GLOB (virtual_tables.name || '_*')
        )
      ORDER BY table_schema.name;
    " >"$tmp_output" 2>&1; then
    cat "$tmp_output" >&2
    rm -f "$tmp_output"
    return 1
  fi

  bun -e '
    const fs = require("node:fs");
    const raw = fs.readFileSync(process.argv[1], "utf8");
    const payload = JSON.parse(raw);
    const first = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {};
    const rows = Array.isArray(first.results) ? first.results : [];
    for (const row of rows) {
      if (typeof row.name === "string" && row.name.length > 0) {
        console.log(row.name);
      }
    }
  ' "$tmp_output"

  rm -f "$tmp_output"
}

dump_dir="$dump_root/$target"
manifest_file="$dump_dir/manifest.json"

rm -rf "$dump_dir"
mkdir -p "$dump_dir/tables"

IFS=',' read -r -a binding_names <<< "$bindings_csv"
IFS=',' read -r -a database_names <<< "$database_names_csv"

printf '{"target":%s,"family":%s,"createdAt":%s,"databases":[' \
  "$(json_string "$target")" \
  "$(json_string "$db_family")" \
  "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" > "$manifest_file"

for i in "${!database_names[@]}"; do
  binding_name="${binding_names[$i]}"
  database_name="${database_names[$i]}"
  binding_dump_file="$dump_dir/${binding_name}.sql"

  printf 'Dumping %s (%s)\n' "$binding_name" "$database_name"
  printf 'PRAGMA defer_foreign_keys = true;\n' > "$binding_dump_file"

  mapfile -t table_names < <(list_export_tables "$database_name" "$wrangler_config" "$wrangler_env")

  for table_name in "${table_names[@]}"; do
    table_file="$dump_dir/tables/${binding_name}-${table_name}.sql"

    bash "$script_dir/run-d1-export.sh" "$database_name" \
      --config "$wrangler_config" \
      --env "$wrangler_env" \
      --remote \
      --table="$table_name" \
      --output "$table_file"

    printf '\n' >> "$binding_dump_file"
    cat "$table_file" >> "$binding_dump_file"
  done

  if [[ "$i" -gt 0 ]]; then
    printf ',' >> "$manifest_file"
  fi

  printf '{"bindingName":%s,"databaseName":%s,"file":%s,"tables":[' \
    "$(json_string "$binding_name")" \
    "$(json_string "$database_name")" \
    "$(json_string "$(basename "$binding_dump_file")")" >> "$manifest_file"

  for table_index in "${!table_names[@]}"; do
    if [[ "$table_index" -gt 0 ]]; then
      printf ',' >> "$manifest_file"
    fi

    printf '%s' "$(json_string "${table_names[$table_index]}")" >> "$manifest_file"
  done

  printf ']}' >> "$manifest_file"
done

printf ']}\n' >> "$manifest_file"

rm -f "$dump_root/latest"
ln -s "$dump_dir" "$dump_root/latest"

echo "Dumped $target $db_family D1 databases to $dump_dir"
