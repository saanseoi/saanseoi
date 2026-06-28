#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <local|preview|production>" >&2
  exit 1
fi

environment="$1"

case "$environment" in
  local|preview|production)
    ;;
  *)
    echo "Unsupported environment: $environment" >&2
    exit 1
    ;;
esac

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
wrangler_config="$repo_root/apps/harbour-api/wrangler.jsonc"
snapshot_root="$repo_root/.local/d1/snapshots/$environment"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_root/.local/wrangler}"
prompt_fd=0

mkdir -p "$XDG_CONFIG_HOME"

if [[ ! -t 0 ]]; then
  if [[ -r /dev/tty && -w /dev/tty ]]; then
    exec 3<>/dev/tty
    prompt_fd=3
  else
    echo "Interactive input requires a terminal." >&2
    exit 1
  fi
fi

prompt_read() {
  local __var_name="$1"
  local __prompt="$2"
  local __value

  printf '%s' "$__prompt" >&"$prompt_fd"

  if ! IFS= read -r -u "$prompt_fd" __value; then
    printf '\n' >&"$prompt_fd"
    echo "Interactive input cancelled." >&2
    exit 1
  fi

  printf -v "$__var_name" '%s' "$__value"
}

prompt_description() {
  local description

  while true; do
    prompt_read description "Snapshot description: "
    if [[ -n "${description// }" ]]; then
      printf '%s\n' "$description"
      return 0
    fi
    echo "Description cannot be empty." >&2
  done
}

sanitize_description() {
  printf '%s' "$1" | bun -e '
    const raw = require("node:fs").readFileSync(0, "utf8").trim();
    const sanitized = raw
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();

    process.stdout.write(sanitized || "snapshot");
  '
}

list_remote_tables() {
  local binding_name="$1"
  local tmp_output

  tmp_output="$(mktemp)"

  bun x wrangler d1 execute "$binding_name" \
    --config "$wrangler_config" \
    --env "$environment" \
    --remote \
    --command "
      SELECT name, COALESCE(sql, '') AS sql
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT GLOB '_cf_*'
        AND name != 'd1_migrations'
      ORDER BY name;
    " \
    --json >"$tmp_output"

  bun -e '
    const fs = require("node:fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const first = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {};
    const rows = Array.isArray(first.results) ? first.results : [];
    const virtualTableNames = new Set(
      rows
        .filter(row => typeof row.name === "string" && /^CREATE VIRTUAL TABLE\b/i.test(row.sql ?? ""))
        .map(row => row.name)
    );

    for (const row of rows) {
      if (typeof row.name !== "string" || row.name.length === 0) {
        continue;
      }

      const isVirtualTable = virtualTableNames.has(row.name);
      const isShadowTable = [...virtualTableNames].some(virtualName => row.name.startsWith(`${virtualName}_`));
      if (!isVirtualTable && !isShadowTable) {
        process.stdout.write(row.name + "\n");
      }
    }
  ' "$tmp_output"

  rm -f "$tmp_output"
}

list_local_applied_migrations() {
  local sqlite_path="$1"
  local migrations_table="$2"

  if [[ "$(sqlite3 "$sqlite_path" "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = '$migrations_table';")" != "1" ]]; then
    return 0
  fi

  sqlite3 "$sqlite_path" "SELECT name FROM \"$migrations_table\" ORDER BY id;"
}

list_remote_applied_migrations() {
  local binding_name="$1"
  local migrations_table="$2"
  local tmp_output

  tmp_output="$(mktemp)"

  bun x wrangler d1 execute "$binding_name" \
    --config "$wrangler_config" \
    --env "$environment" \
    --remote \
    --command "
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = '$migrations_table';
    " \
    --json >"$tmp_output"

  if [[ "$(
    bun -e '
      const fs = require("node:fs");
      const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const first = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {};
      const rows = Array.isArray(first.results) ? first.results : [];
      process.stdout.write(String(rows.length));
    ' "$tmp_output"
  )" == "0" ]]; then
    rm -f "$tmp_output"
    return 0
  fi

  bun x wrangler d1 execute "$binding_name" \
    --config "$wrangler_config" \
    --env "$environment" \
    --remote \
    --command "SELECT name FROM \"$migrations_table\" ORDER BY id;" \
    --json >"$tmp_output"

  bun -e '
    const fs = require("node:fs");
    const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const first = Array.isArray(payload) ? payload[0] ?? {} : payload ?? {};
    const rows = Array.isArray(first.results) ? first.results : [];
    for (const row of rows) {
      if (typeof row.name === "string" && row.name.length > 0) {
        process.stdout.write(row.name + "\n");
      }
    }
  ' "$tmp_output"

  rm -f "$tmp_output"
}

description="$(prompt_description)"
safe_description="$(sanitize_description "$description")"
timestamp="$(date '+%Y-%m-%d %H-%M-%S')"
created_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
snapshot_dir="$snapshot_root/$timestamp - $safe_description"
targets_payload="$(bash "$script_dir/lib/list-d1-targets.sh" "$environment")"
completed=0
database_entries_file="$(mktemp)"

cleanup() {
  rm -f "$database_entries_file"
  if [[ "$completed" -eq 0 && -d "$snapshot_dir" ]]; then
    rm -rf "$snapshot_dir"
  fi
}

trap cleanup EXIT

mkdir -p "$snapshot_dir"

while IFS=$'\t' read -r binding_name database_name local_database_id database_id migrations_table; do
  printf 'Snapshotting %s (%s)\n' "$binding_name" "$database_name"

  if [[ "$environment" == "local" ]]; then
    sqlite_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$local_database_id")"
    mapfile -t applied_migrations < <(list_local_applied_migrations "$sqlite_path" "$migrations_table")
    output_file="$snapshot_dir/${binding_name}.sqlite"

    rm -f "$output_file"
    sqlite3 "$sqlite_path" "VACUUM INTO '$output_file';"
  else
    output_file="$snapshot_dir/${binding_name}.sql"
    mapfile -t table_names < <(list_remote_tables "$binding_name")
    mapfile -t applied_migrations < <(list_remote_applied_migrations "$binding_name" "$migrations_table")
    export_args=()
    for table_name in "${table_names[@]}"; do
      export_args+=("--table=$table_name")
    done

    bash "$script_dir/run-d1-export.sh" "$database_name" \
      --config "$wrangler_config" \
      --env "$environment" \
      --remote \
      --skip-confirmation \
      --no-schema \
      "${export_args[@]}" \
      --output "$output_file"
  fi

  applied_migrations_json="$(
    printf '%s\n' "${applied_migrations[@]:-}" | bun -e '
      const entries = require("node:fs")
        .readFileSync(0, "utf8")
        .split("\n")
        .filter(Boolean);
      process.stdout.write(JSON.stringify(entries));
    '
  )"

  bun -e '
    const fs = require("node:fs");
    const entry = {
      bindingName: process.argv[1],
      databaseId: process.argv[2] || null,
      databaseName: process.argv[3],
      localDatabaseId: process.argv[4] || null,
      sqlFile: process.argv[5] || null,
      sqliteFile: process.argv[6] || null,
      migrationsTable: process.argv[7],
      appliedMigrations: JSON.parse(process.argv[8]),
    };
    fs.appendFileSync(process.argv[9], JSON.stringify(entry) + "\n");
  ' \
    "$binding_name" \
    "$database_id" \
    "$database_name" \
    "$local_database_id" \
    "$( [[ "$environment" == "local" ]] && printf '' || printf '%s.sql' "$binding_name" )" \
    "$( [[ "$environment" == "local" ]] && printf '%s.sqlite' "$binding_name" || printf '' )" \
    "$migrations_table" \
    "$applied_migrations_json" \
    "$database_entries_file"
done < <(
  bun -e '
    const payload = JSON.parse(process.argv[1]);
    for (const target of payload.targets) {
      process.stdout.write(
        [
          target.bindingName,
          target.databaseName,
          target.localDatabaseId ?? "",
          target.databaseId ?? "",
          target.migrationsTable ?? "d1_migrations",
        ].join("\t") + "\n"
      );
    }
  ' "$targets_payload"
)

bun -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const payload = JSON.parse(process.argv[2]);
  const createdAt = process.argv[3];
  const description = process.argv[4];
  const safeDescription = process.argv[5];
  const databases = require("node:fs")
    .readFileSync(process.argv[6], "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const manifest = {
    version: 1,
    environment: payload.environment,
    wranglerEnv: payload.wranglerEnv,
    createdAt,
    description,
    safeDescription,
    databases,
  };

  fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
 ' "$snapshot_dir/manifest.json" "$targets_payload" "$created_at" "$description" "$safe_description" "$database_entries_file"

completed=1
printf 'Created snapshot at %s\n' "$snapshot_dir"
