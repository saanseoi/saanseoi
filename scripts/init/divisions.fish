#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:divisions" $argv

set -l continuation_args
if test "$saanseoi_init_continue" -eq 1
    set continuation_args --continue
end

set -l cache_artefact_opt_out_args
if test "$saanseoi_init_cache_artefacts" -ne 1
    set cache_artefact_opt_out_args --no-cache-artefacts
end

for command in \
    init:divisions:geographic \
    init:divisions:hkgov-censtatd-hma \
    init:divisions:hkgov-pland-pu \
    init:divisions:hkgov-pland-new-town \
    init:divisions:hkgov-landsd
    SAANSEOI_INIT_DEFER_DOCS=1 init_run_step ./bin/saanseoi $command --target $saanseoi_init_target \
        $continuation_args $cache_artefact_opt_out_args
end

# These source-only ingredients are pinned by the curated release manifest.
# Retain them in the selected local database before publishing that manifest.
set -l protomaps_release_code dr-hk-protomaps-island-2026-09-01.3
if not init_skip_completed_release "$protomaps_release_code"
    set -l protomaps_archive \
        "$saanseoi_init_repo/.local/protomaps-islands/2026-09-01.3/$protomaps_release_code.zip"
    if not test -f "$protomaps_archive"
        echo "Protomaps island archive not found: $protomaps_archive" >&2
        exit 1
    end
    init_run_step bun run --silent dataops -- protomaps-islands:ingest \
        "$protomaps_archive" --target $saanseoi_init_target
    set -g saanseoi_init_docs_pending 1
end

set -l rvd_release_code dr-hk-hkgov-rvd-division-2015-04-30.0
if not init_skip_completed_release "$rvd_release_code"
    set -l rvd_pdf "$saanseoi_init_repo/.local/rvd-review/06.pdf"
    if not test -f "$rvd_pdf"
        echo "RVD Property Review appendix not found: $rvd_pdf" >&2
        exit 1
    end
    init_run_step bun run --silent dataops -- hkgov-rvd:areas "$rvd_pdf" \
        --out-dir "$saanseoi_init_repo/.local/rvd-review/ingested" \
        --target $saanseoi_init_target
    set -g saanseoi_init_docs_pending 1
end

# Overture publishes through deprecated v0.1. Assemble both curated v0.2
# editions after their exact publisher ingredients have been retained.
for edition in 2026-09-01.0 2026-10-01.0
    set -l curated_release_dir "$saanseoi_init_repo/.local/curated-divisions/init/$edition"
    init_run_step bun run --silent dataops -- saanseoi-divisions:assemble \
        --target local --out-dir "$curated_release_dir" --edition "$edition"
    for archive in "$curated_release_dir"/dr-hk-saanseoi-division-*.zip
        if not test -f "$archive"
            echo "Curated Division release archive not found: $archive" >&2
            exit 1
        end
        set -l release_code (string replace -r '\.zip$' '' -- (path basename "$archive"))
        if not string match -qr '^dr-hk-saanseoi-division(-area)?-[0-9]' -- "$release_code"
            continue
        end
        init_run_upload "$release_code" "$archive" --yes --defer-api-release-set
        init_publish_docs_if_processed "$saanseoi_init_last_upload_processed"
    end
end

# Reconcile only after the complete curated Division and DivisionArea pair has
# been ingested with every pinned publisher archive available.
init_reconcile_draft_release_sets ./bin/saanseoi release-sets:reconcile \
    --target $saanseoi_init_target --api-family divisions --region hk

init_publish_docs
