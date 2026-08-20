#!/usr/bin/env bash
set -euo pipefail

mode="${1:-all}"
filters=()

case "$mode" in
  all)
    filters=(harbour-api atlas-api atlas-app basemap-viewer)
    ;;
  atlas)
    filters=(atlas-api atlas-app)
    ;;
  harbour)
    filters=(harbour-api)
    ;;
  *)
    printf 'Unknown development mode: %s\n' "$mode" >&2
    printf 'Usage: %s [all|atlas|harbour]\n' "$0" >&2
    exit 64
    ;;
esac

turbo_filters=()
for filter in "${filters[@]}"; do
  turbo_filters+=("--filter=$filter")
done

exec bun x turbo run dev "${turbo_filters[@]}"
