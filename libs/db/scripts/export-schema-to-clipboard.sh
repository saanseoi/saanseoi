#!/usr/bin/env bash

set -euo pipefail

CHARTDB_DIR="${CHARTDB_DIR:-$HOME/.tools/chartdb}"
CHARTDB_LOG="/tmp/chartdb-dev.log"
CHARTDB_PID="/tmp/chartdb-dev.pid"

if [[ ! -d "$CHARTDB_DIR" ]]; then
  echo "ChartDB directory not found: $CHARTDB_DIR" >&2
  exit 1
fi

if command -v wl-copy >/dev/null 2>&1; then
  bun run drizzle-kit export --sql | wl-copy
elif command -v xclip >/dev/null 2>&1; then
  bun run drizzle-kit export --sql | xclip -selection clipboard
elif command -v xsel >/dev/null 2>&1; then
  bun run drizzle-kit export --sql | xsel --clipboard --input
else
  echo "No clipboard utility found. Install wl-copy, xclip, or xsel." >&2
  exit 1
fi

echo "Schema SQL copied to clipboard."

extract_chartdb_url() {
  if [[ -f "$CHARTDB_LOG" ]]; then
    grep -Eo 'https?://(localhost|127\.0\.0\.1):[0-9]+' "$CHARTDB_LOG" | tail -n 1
  fi
}

start_chartdb() {
  : >"$CHARTDB_LOG"
  (
    cd "$CHARTDB_DIR"
    bun run dev --host 127.0.0.1
  ) >"$CHARTDB_LOG" 2>&1 &
  echo "$!" >"$CHARTDB_PID"
}

if [[ -f "$CHARTDB_PID" ]] && kill -0 "$(cat "$CHARTDB_PID")" 2>/dev/null; then
  chartdb_url="$(extract_chartdb_url || true)"
else
  rm -f "$CHARTDB_PID"
  start_chartdb
  chartdb_url=""
fi

if [[ -z "${chartdb_url:-}" ]]; then
  for _ in $(seq 1 60); do
    if [[ -f "$CHARTDB_PID" ]] && ! kill -0 "$(cat "$CHARTDB_PID")" 2>/dev/null; then
      echo "ChartDB dev server exited unexpectedly. Check $CHARTDB_LOG" >&2
      exit 1
    fi

    chartdb_url="$(extract_chartdb_url || true)"
    if [[ -n "$chartdb_url" ]]; then
      break
    fi
    sleep 1
  done
fi

if [[ -z "${chartdb_url:-}" ]]; then
  echo "Could not determine ChartDB URL. Check $CHARTDB_LOG" >&2
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$chartdb_url" >/dev/null 2>&1 &
  echo "Opened ChartDB at $chartdb_url"
else
  echo "ChartDB is running at $chartdb_url"
fi
