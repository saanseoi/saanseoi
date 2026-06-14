#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <meta|current|history|source> [year]" >&2
  exit 1
fi

db_family="$1"
requested_year="${2:-}"
current_year="$(date +%Y)"
drizzle_db_year=""

case "$db_family" in
  meta)
    d1_target_family="meta"
    config_file="./drizzle.meta.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_META"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_META"
    ;;
  current)
    d1_target_family="current"
    config_file="./drizzle.current.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_CURRENT"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_CURRENT"
    ;;
  history)
    drizzle_db_year="${requested_year:-$current_year}"
    d1_target_family="history-hk-${drizzle_db_year}"
    config_file="./drizzle.history.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_HISTORY_HK_${drizzle_db_year}"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_HISTORY_HK_${drizzle_db_year}"
    ;;
  source)
    drizzle_db_year="${requested_year:-$current_year}"
    d1_target_family="source-hk-${drizzle_db_year}"
    config_file="./drizzle.source.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_SOURCE_HK_${drizzle_db_year}"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_SOURCE_HK_${drizzle_db_year}"
    ;;
  *)
    echo "Unsupported database family: $db_family" >&2
    exit 1
    ;;
esac

printf 'db_family=%q\n' "$db_family"
printf 'config_file=%q\n' "$config_file"
printf 'local_path_env=%q\n' "$local_path_env"
printf 'remote_database_id_env=%q\n' "$remote_database_id_env"
printf 'drizzle_db_year=%q\n' "$drizzle_db_year"
printf 'd1_target_family=%q\n' "$d1_target_family"
