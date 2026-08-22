#!/usr/bin/env bash

set -euo pipefail

mode="${1:-all}"

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
    echo "Unknown development mode: $mode" >&2
    echo "Usage: $0 [all|atlas|harbour]" >&2
    exit 64
    ;;
esac

turbo_filters=()
for filter in "${filters[@]}"; do
  turbo_filters+=("--filter=$filter")
done

exec bun x turbo run dev "${turbo_filters[@]}"
