#!/usr/bin/env bash
set -euo pipefail

target="${1:-all}"
iterations="${2:-20}"

run_probe() {
  local url="$1"
  printf '\n# %s\n' "$url"
  if command -v jq >/dev/null 2>&1; then
    curl -s "${url}?iterations=${iterations}" | jq
  else
    curl -s "${url}?iterations=${iterations}"
    printf '\n'
  fi
}

case "$target" in
  preview)
    run_probe "https://preview.saanseoi.hk/api/v0/meta/d1-placement-probe"
    run_probe "https://preview.harbour.saanseoi.hk/api/v1/meta/d1-placement-probe"
    ;;
  production)
    run_probe "https://saanseoi.hk/api/v0/meta/d1-placement-probe"
    run_probe "https://harbour.saanseoi.hk/api/v1/meta/d1-placement-probe"
    ;;
  all)
    run_probe "https://saanseoi.hk/api/v0/meta/d1-placement-probe"
    run_probe "https://preview.saanseoi.hk/api/v0/meta/d1-placement-probe"
    run_probe "https://preview.harbour.saanseoi.hk/api/v1/meta/d1-placement-probe"
    run_probe "https://harbour.saanseoi.hk/api/v1/meta/d1-placement-probe"
    ;;
  *)
    echo "Usage: $0 [preview|production|all] [iterations]" >&2
    exit 1
    ;;
esac
