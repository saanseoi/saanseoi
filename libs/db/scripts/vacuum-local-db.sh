#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <all|meta|current|history|source|history-hk-before|history-hk-2025|history-hk-2026|source-hk-before|source-hk-2025|source-hk-2026>" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
db_family="$1"
targets_payload="$(bash "$script_dir/lib/list-d1-targets.sh" local)"

mapfile -t targets < <(
  bun -e '
    const payload = JSON.parse(process.argv[1]);
    const family = process.argv[2];
    const matches = {
      all: binding =>
        binding === "DB_META" ||
        binding === "DB_CURRENT" ||
        /^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(binding) ||
        /^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(binding),
      meta: binding => binding === "DB_META",
      current: binding => binding === "DB_CURRENT",
      history: binding => /^DB_HISTORY_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(binding),
      source: binding => /^DB_SOURCE_[A-Z]{2}_(?:\d{4}|BEFORE)$/.test(binding),
      "history-hk-before": binding => binding === "DB_HISTORY_HK_BEFORE",
      "history-hk-2025": binding => binding === "DB_HISTORY_HK_2025",
      "history-hk-2026": binding => binding === "DB_HISTORY_HK_2026",
      "source-hk-before": binding => binding === "DB_SOURCE_HK_BEFORE",
      "source-hk-2025": binding => binding === "DB_SOURCE_HK_2025",
      "source-hk-2026": binding => binding === "DB_SOURCE_HK_2026",
    };
    const matchesFamily = matches[family];
    if (!matchesFamily) {
      throw new Error(`Unsupported database family: ${family}`);
    }
    for (const target of payload.targets.filter(target => matchesFamily(target.bindingName))) {
      process.stdout.write(`${target.bindingName}\t${target.localDatabaseId}\n`);
    }
  ' "$targets_payload" "$db_family"
)

if [[ "${#targets[@]}" -eq 0 ]]; then
  echo "Could not resolve local D1 targets for $db_family." >&2
  exit 1
fi

vacuum_targets='[]'

for target in "${targets[@]}"; do
  IFS=$'\t' read -r binding_name local_database_id <<< "$target"
  sqlite_path="$(bash "$script_dir/lib/resolve-local-d1-sqlite-path.sh" "$local_database_id")"

  if [[ ! -f "$sqlite_path" ]]; then
    echo "Could not resolve local SQLite file for $binding_name at $sqlite_path." >&2
    exit 1
  fi

  vacuum_targets="$(bun -e '
    const targets = JSON.parse(process.argv[1]);
    targets.push({ bindingName: process.argv[2], sqlitePath: process.argv[3] });
    process.stdout.write(JSON.stringify(targets));
  ' "$vacuum_targets" "$binding_name" "$sqlite_path")"
done

bun "$script_dir/vacuum-local-db.ts" "$vacuum_targets"
