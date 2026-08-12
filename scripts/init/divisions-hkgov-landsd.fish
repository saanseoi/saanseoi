#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:divisions:hkgov-landsd" $argv

set -l file "$saanseoi_init_repo/data/hkgov/csdi/hkgov-landsd-division/2026-06-10.0.geojson"
set -l release_notes_url "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752"

if not test -f "$file"
    echo "LandsD input file not found: $file" >&2
    exit 1
end

init_run_upload dr-hk-hkgov-landsd-division-2026-06-10.0 "$file" \
    --source hkgov-landsd --source-version 2026-06-10.0 \
    --type division --theme divisions --region hk \
    --release-notes-url "$release_notes_url" --yes
init_publish_docs_if_processed "$saanseoi_init_last_upload_processed"
