#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"

if [[ "$target" != "preview" && "$target" != "production" ]]; then
  echo "Usage: $0 <preview|production>" >&2
  exit 1
fi

load_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

load_env_file "$repo_root/.env"

case "$target" in
  preview)
    load_env_file "$repo_root/.env.preview"
    load_env_file "$repo_root/.env.preview.local"
    ;;
  production)
    load_env_file "$repo_root/.env.prod"
    load_env_file "$repo_root/.env.prod.local"
    ;;
esac

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Missing CLOUDFLARE_ACCOUNT_ID. Define it in your shell or $repo_root/.env." >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_D1_TOKEN:-}" ]]; then
  echo "Missing CLOUDFLARE_D1_TOKEN. Define it in your shell or $repo_root/.env." >&2
  exit 1
fi

case "$target" in
  preview)
    if [[ -z "${CLOUDFLARE_DATABASE_ID_PREVIEW:-}" ]]; then
      echo "Missing CLOUDFLARE_DATABASE_ID_PREVIEW. Define it in $repo_root/.env.preview.local." >&2
      exit 1
    fi
    ;;
  production)
    if [[ -z "${CLOUDFLARE_DATABASE_ID_PRODUCTION:-}" ]]; then
      echo "Missing CLOUDFLARE_DATABASE_ID_PRODUCTION. Define it in $repo_root/.env.prod.local." >&2
      exit 1
    fi
    ;;
esac

cd "$repo_root/libs/db"
exec env CLOUDFLARE_D1_TARGET="$target" bun drizzle-kit studio --config=./drizzle.config.ts
