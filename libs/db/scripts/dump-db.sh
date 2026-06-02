#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"
wrangler_config="${2:-../../apps/atlas-api/wrangler.jsonc}"
dump_dir="${3:-../../apps/atlas-api/.local/d1/dumps}"

if [[ -z "$target" ]]; then
  echo "Usage: $0 <preview|production> [wrangler-config] [dump-dir]" >&2
  exit 1
fi

case "$target" in
  preview)
    database_name="ss-preview"
    env_name="preview"
    output_file="$dump_dir/preview.sql"
    ;;
  production)
    database_name="ss-prod"
    env_name="production"
    output_file="$dump_dir/production.sql"
    ;;
  *)
    echo "Unsupported target: $target" >&2
    exit 1
    ;;
esac

mkdir -p "$dump_dir"
rm -f "$output_file" "$dump_dir/latest.sql"

tables=(
  "datasets"
  "ingestRuns"
  "entityAliases"
  "divisions"
  "divisionsVersions"
  "divisionsI18n"
  "divisionsVersionsI18n"
  "streets"
  "streetsVersions"
  "address2d"
  "address2dVersions"
  "address2dI18n"
  "address2dVersionsI18n"
  "address3d"
  "address3dVersions"
  "address3dI18n"
  "address3dVersionsI18n"
  "streetsI18n"
  "streetsVersionsI18n"
  "streetsAddress"
  "places"
  "placesVersions"
  "placesI18n"
  "placesVersionsI18n"
  "placesDivision"
  "placesCells"
)

printf 'PRAGMA defer_foreign_keys = true;\n' > "$output_file"

for table_name in "${tables[@]}"; do
  table_file="$dump_dir/${target}-${table_name}.sql"

  wrangler d1 export "$database_name" \
    --config "$wrangler_config" \
    --env "$env_name" \
    --remote \
    --table="$table_name" \
    --output "$table_file"

  printf '\n' >> "$output_file"
  cat "$table_file" >> "$output_file"
done

cp "$output_file" "$dump_dir/latest.sql"
echo "Dumped $database_name to $output_file"
