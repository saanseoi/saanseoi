#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
set -g saanseoi_init_cache_table_profile places
init_configure "saanseoi init:places:overture" $argv

set -l continue_args
if test "$saanseoi_init_continue" -eq 1
    set continue_args --continue
end

init_run_step ./bin/saanseoi init:places:overture:begin \
    --target $saanseoi_init_target $continue_args

set -l root "$saanseoi_init_repo/data/overture"
# 2025-11-19.0 is intentionally absent: its retained mirror contains only
# the Divisions theme (see data/overture/2025-11-19.0/provenance.json).
set -l releases \
    2025-09-24.0 \
    2025-10-22.0 \
    2025-12-17.0 \
    2026-01-21.0 \
    2026-02-18.0 \
    2026-03-18.0 \
    2026-04-15.0 \
    2026-05-20.0 \
    2026-06-17.0 \
    2026-07-22.0 \
    2026-08-19.0

for release in $releases
    set -l dir "$root/$release/divisions/中国/Hong Kong SAR"
    if not test -d "$dir"
        set dir "$root/$release/divisions/China/Hong Kong"
    end
    set -l file "$dir/place.division.intersects.clipSmart.parquet"
    if not test -f "$file"
        echo "Overture input file not found: $file" >&2
        exit 1
    end

    init_run_upload "dr-hk-overture-place-$release" "$file" \
        --dataset-code ds-hk-overture-place \
        --source overture --source-version $release \
        --type place --theme places --region hk --cohort-key $release \
        --yes --skip-cleanup --defer-api-release-set
    init_publish_docs_if_processed "$saanseoi_init_last_upload_processed"
end

init_reconcile_draft_release_sets ./bin/saanseoi release-sets:reconcile --target $saanseoi_init_target \
    --api-family places --region hk

init_publish_docs_if_needed
init_run_step ./bin/saanseoi init:places:overture:complete --target $saanseoi_init_target
init_complete
