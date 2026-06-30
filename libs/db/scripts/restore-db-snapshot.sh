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
persist_dir="$repo_root/.local/d1/dev"
snapshot_root="$repo_root/.local/d1/snapshots/$environment"
rebuild_places_fts_sql="$script_dir/sql/rebuild-places-fts.sql"
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

if [[ ! -d "$snapshot_root" ]]; then
  echo "No snapshots found for $environment at $snapshot_root" >&2
  exit 1
fi

mapfile -t snapshot_dirs < <(find "$snapshot_root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)

if [[ "${#snapshot_dirs[@]}" -eq 0 ]]; then
  echo "No snapshots found for $environment at $snapshot_root" >&2
  exit 1
fi

echo "Available $environment snapshots:"
for i in "${!snapshot_dirs[@]}"; do
  printf '%d. %s\n' "$((i + 1))" "${snapshot_dirs[$i]}"
done

selection=""
while true; do
  prompt_read selection "Select snapshot [1-${#snapshot_dirs[@]}]: "
  if [[ "$selection" =~ ^[0-9]+$ ]] && (( selection >= 1 && selection <= ${#snapshot_dirs[@]} )); then
    break
  fi
  echo "Please enter a number between 1 and ${#snapshot_dirs[@]}." >&2
done

snapshot_name="${snapshot_dirs[$((selection - 1))]}"
snapshot_dir="$snapshot_root/$snapshot_name"
manifest_file="$snapshot_dir/manifest.json"

if [[ ! -f "$manifest_file" ]]; then
  echo "Snapshot manifest not found: $manifest_file" >&2
  exit 1
fi

description="$(
  bun -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(manifest.description ?? "");
  ' "$manifest_file"
)"

created_at="$(
  bun -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(manifest.createdAt ?? "");
  ' "$manifest_file"
)"

echo
echo "Selected snapshot: $snapshot_name"
if [[ -n "$description" ]]; then
  printf 'Description: %s\n' "$description"
fi
if [[ -n "$created_at" ]]; then
  printf 'Created at: %s\n' "$created_at"
fi
echo
if [[ "$environment" == "local" ]]; then
  echo "This will replace the current local SQLite database files with the selected snapshot."
else
  echo "This will delete the current $environment databases, reapply the snapshot's recorded migrations, and then restore snapshot data."
fi

confirmation=""
prompt_read confirmation "Type RESTORE to continue: "
if [[ "$confirmation" != "RESTORE" ]]; then
  echo "Restore cancelled."
  exit 1
fi

if [[ "$environment" == "local" ]]; then
  while IFS=$'\t' read -r binding_name sqlite_file local_database_id; do
    if [[ -z "$sqlite_file" ]]; then
      echo "Snapshot $snapshot_name does not contain raw local SQLite files. Recreate it with the updated snapshot command." >&2
      exit 1
    fi

    sqlite_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$local_database_id")"
    snapshot_sqlite_path="$snapshot_dir/$sqlite_file"

    if [[ ! -f "$snapshot_sqlite_path" ]]; then
      echo "Snapshot SQLite file not found: $snapshot_sqlite_path" >&2
      exit 1
    fi

    printf 'Restoring local SQLite for %s from %s\n' "$binding_name" "$sqlite_file"
    rm -f "${sqlite_path}-wal" "${sqlite_path}-shm"
    cp "$snapshot_sqlite_path" "$sqlite_path"
  done < <(
    bun -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const database of manifest.databases ?? []) {
        process.stdout.write(
          [database.bindingName, database.sqliteFile ?? "", database.localDatabaseId ?? ""].join("\t") + "\n"
        );
      }
    ' "$manifest_file"
  )
else
  bash "$script_dir/drop-remote-db.sh" all "$environment"
  bun "$script_dir/applyD1MigrationManifest.ts" "$manifest_file" \
    --config "$wrangler_config" \
    --env "$environment" \
    --remote
fi

restored_current_db=0

if [[ "$environment" != "local" ]]; then
  while IFS=$'\t' read -r binding_name sql_file; do
    sql_path="$snapshot_dir/$sql_file"

    if [[ ! -f "$sql_path" ]]; then
      echo "Snapshot SQL file not found: $sql_path" >&2
      exit 1
    fi

    printf 'Restoring %s from %s\n' "$binding_name" "$sql_file"

    if [[ "$binding_name" == "DB_CURRENT" ]]; then
      restored_current_db=1
    fi

    bash "$script_dir/run-d1-execute.sh" "$binding_name" \
      --config "$wrangler_config" \
      --env "$environment" \
      --remote \
      --file "$sql_path"
  done < <(
    bun -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      for (const database of manifest.databases ?? []) {
        process.stdout.write([database.bindingName, database.sqlFile].join("\t") + "\n");
      }
    ' "$manifest_file"
  )
else
  restored_current_db="$(
    bun -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(
        (manifest.databases ?? []).some(database => database.bindingName === "DB_CURRENT") ? "1" : "0"
      );
    ' "$manifest_file"
  )"
fi

if [[ "$restored_current_db" -eq 1 && "$environment" != "local" ]]; then
  echo "Rebuilding places FTS index"
  bash "$script_dir/run-d1-execute.sh" DB_CURRENT \
    --config "$wrangler_config" \
    --env "$environment" \
    --remote \
    --file "$rebuild_places_fts_sql"
fi

printf 'Restored snapshot %s into %s\n' "$snapshot_name" "$environment"
