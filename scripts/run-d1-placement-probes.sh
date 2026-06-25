#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
target="${1:-preview}"
iterations="${2:-20}"

for env_file in "${repo_root}/.env.local" "${repo_root}/.env"; do
  if [[ -n "${D1_PLACEMENT_PROBE_API_KEY:-}" ]]; then
    break
  fi

  if [[ -f "${env_file}" ]]; then
    D1_PLACEMENT_PROBE_API_KEY="$(
      sed -n 's/^D1_PLACEMENT_PROBE_API_KEY=//p' "${env_file}" | head -n 1
    )"
  fi
done

if [[ -z "${D1_PLACEMENT_PROBE_API_KEY:-}" ]]; then
  echo "Missing D1_PLACEMENT_PROBE_API_KEY. Export it or define it in ${repo_root}/.env.local or ${repo_root}/.env." >&2
  exit 1
fi

run_probe() {
  local url="$1"
  printf '\n# %s\n' "$url"
  if command -v jq >/dev/null 2>&1; then
    curl -s -H "x-api-key: ${D1_PLACEMENT_PROBE_API_KEY}" "${url}?iterations=${iterations}" | jq
  else
    curl -s -H "x-api-key: ${D1_PLACEMENT_PROBE_API_KEY}" "${url}?iterations=${iterations}"
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
