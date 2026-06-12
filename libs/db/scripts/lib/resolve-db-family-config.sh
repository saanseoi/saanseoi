#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <meta|current|history|source>" >&2
  exit 1
fi

db_family="$1"

case "$db_family" in
  meta)
    config_file="./drizzle.meta.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_META"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_META"
    ;;
  current)
    config_file="./drizzle.current.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_CURRENT"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_CURRENT"
    ;;
  history)
    config_file="./drizzle.history.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_HISTORY_HK_2026"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_HISTORY_HK_2026"
    ;;
  source)
    config_file="./drizzle.source.config.ts"
    local_path_env="LOCAL_D1_SQLITE_PATH_SOURCE_HK_2026"
    remote_database_id_env="CLOUDFLARE_DATABASE_ID_SOURCE_HK_2026"
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
