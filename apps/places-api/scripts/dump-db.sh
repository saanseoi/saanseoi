#!/usr/bin/env bash
set -euo pipefail

target="${1:-}"

if [[ -z "$target" ]]; then
  echo "Usage: $0 <preview|production>" >&2
  exit 1
fi

case "$target" in
  preview)
    database_name="ss-preview"
    env_name="preview"
    output_file=".local/d1/dumps/preview.sql"
    ;;
  production)
    database_name="ss-prod"
    env_name="production"
    output_file=".local/d1/dumps/production.sql"
    ;;
  *)
    echo "Unsupported target: $target" >&2
    exit 1
    ;;
esac

mkdir -p ".local/d1/dumps"
rm -f "$output_file" ".local/d1/dumps/latest.sql"

tables=(
  "datasets"
  "ingestRuns"
  "entityVersions"
  "entityAliases"
  "division"
  "divisionI18n"
  "street"
  "address2d"
  "address2dI18n"
  "address3d"
  "address3dI18n"
  "streetI18n"
  "streetAddress"
  "placesCurrent"
  "placesCurrentI18n"
  "placesCurrentDivision"
  "placesCurrentCells"
)

printf 'PRAGMA defer_foreign_keys = true;\n' > "$output_file"

for table_name in "${tables[@]}"; do
  table_file=".local/d1/dumps/${target}-${table_name}.sql"

  wrangler d1 export "$database_name" \
    --env "$env_name" \
    --remote \
    --table="$table_name" \
    --output "$table_file"

  printf '\n' >> "$output_file"
  cat "$table_file" >> "$output_file"
done

cp "$output_file" ".local/d1/dumps/latest.sql"
echo "Dumped $database_name to $output_file"
