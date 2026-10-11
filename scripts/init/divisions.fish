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
    # Government domains finish their release sets without publishing an
    # intermediate catalogue. The first curated edition includes those sets.
    set -l defer_catalog 1
    if test "$command" = init:divisions:geographic
        set defer_catalog 0
    end
    SAANSEOI_INIT_DEFER_DIVISIONS_CATALOG=$defer_catalog SAANSEOI_INIT_DEFER_DOCS=1 init_run_step ./bin/saanseoi $command --target $saanseoi_init_target \
        $continuation_args $cache_artefact_opt_out_args
end

# These source-only ingredients are pinned by the curated release manifest.
# Retain them in the selected local database before publishing that manifest.
for protomaps_version in 2026-09-01.3 2026-10-01.1
    set -l protomaps_release_code "dr-hk-protomaps-island-$protomaps_version"
    if not init_skip_completed_release "$protomaps_release_code::divisionArea"
        set -l protomaps_archive \
            "$saanseoi_init_repo/.local/protomaps-islands/$protomaps_version/$protomaps_release_code.zip"
        if not test -f "$protomaps_archive"
            echo "Protomaps island archive not found: $protomaps_archive" >&2
            exit 1
        end
        init_run_step bun run --silent dataops -- protomaps-islands:ingest \
            "$protomaps_archive" --target $saanseoi_init_target
        set -g saanseoi_init_docs_pending 1
    end
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

# The three C&SD regional polygons reference SaanSeoi identities. Retain both
# curated source editions before validating this geometry and reconciling v0.2.
set -l censtatd_area_release_code \
    dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2
if not init_is_completed_release "$censtatd_area_release_code::divisionStatistic"; or not init_is_completed_release "$censtatd_area_release_code::divisionArea"
    set -l censtatd_area_archive \
        "$saanseoi_init_repo/data/hkgov/csdi/archive/censtatd_rcd_1635933883228_46491/2023-Q4/81e2fd2c5aaeadaaf1c651a4b6d42f37f5cd7812fce2437303fa5054d978aa4a-source.zip"
    set -l censtatd_area_manifest "$censtatd_area_archive.manifest.json"
    if not test -f "$censtatd_area_archive"; or not test -f "$censtatd_area_manifest"
        # A cache miss is recoverable: force the CSDI archive updater to retrieve
        # and prepare the publisher ZIP, but defer ingestion until the normal
        # update pass below. The dataops replay mirrors the prepared archive to the
        # selected target before attempting to link its derived source releases.
        init_run_step ./bin/saanseoi update --target $saanseoi_init_target \
            --dataset ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters \
            --download --force-download --no-upload --yes
    end
    if not test -f "$censtatd_area_archive"; or not test -f "$censtatd_area_manifest"
        echo "C&SD Permanent Living Quarters input file not found: $censtatd_area_archive" >&2
        exit 1
    end
    # Materialise the Statistics snapshot before the geometry-only companion. The
    # latter registers the same source release, so waiting for the later
    # Stats-only initialiser would make the statistics intake appear current and
    # leave this cohort without an API snapshot.
    init_run_step bun run --silent dataops -- hkgov-censtatd:statistics \
        "$censtatd_area_archive" --target $saanseoi_init_target \
        --dataset-code ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters \
        --source-version 2023-H2 \
        --release-notes-url "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933883228_46491" \
        --source-archive-key by-source/hk/hkgov-csdi/censtatd_rcd_1635933883228_46491/f481982c28e83faf0c470e3093146b146921e10739c6c455fe8d08cd31841070-source.zip \
        --source-archive-sha256 f481982c28e83faf0c470e3093146b146921e10739c6c455fe8d08cd31841070 \
        --defer-stats-release-set --include-geography --defer-api-release-set --yes
    set -g saanseoi_init_docs_pending 1
else
    for resource_type in divisionStatistic divisionArea
        init_skip_completed_release "$censtatd_area_release_code::$resource_type"
    end
end

# Reconcile only after the complete curated Division and DivisionArea pair has
# been ingested with every pinned publisher archive available.
init_reconcile_draft_release_sets ./bin/saanseoi release-sets:reconcile \
    --target $saanseoi_init_target --api-family divisions --region hk

init_publish_docs
