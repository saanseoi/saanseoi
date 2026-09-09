#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:divisions:hkgov-landsd" $argv

set -l file "$saanseoi_init_repo/data/hkgov/csdi/archive/landsd_rcd_1648571595120_89752/2026-Q2/source.zip"
set -l release_notes_url "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752"
set -l source_archive_key "by-source/hk/hkgov-csdi/landsd_rcd_1648571595120_89752/cf340ddceea2bbb60b54e366db7e09c752cece053a51963022a918a4c4d69c71-source.zip"
set -l source_archive_sha256 "cf340ddceea2bbb60b54e366db7e09c752cece053a51963022a918a4c4d69c71"

if not test -f "$file"
    echo "LandsD input file not found: $file" >&2
    exit 1
end

set -l release_code "dr-hk-hkgov-landsd-division-2026-06-10.0"
if init_skip_completed_release "$release_code"
    # The source ledger and divisions projection share this release boundary.
else
    init_run_step bun run --silent dataops -- hkgov-landsd:place-name "$file" \
        --target $saanseoi_init_target --source-version 2026-06-10.0 \
        --release-notes-url "$release_notes_url" \
        --source-archive-key "$source_archive_key" \
        --source-archive-sha256 "$source_archive_sha256"
    set -g saanseoi_init_docs_pending 1
end
init_publish_docs_if_needed
init_complete
