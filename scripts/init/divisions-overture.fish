#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:divisions:geographic" $argv

set -l root "$saanseoi_init_repo/data/overture"
set -l releases \
    2025-09-24.0 \
    2025-10-22.0 \
    2025-11-19.0 \
    2025-12-17.0 \
    2026-01-21.0 \
    2026-02-18.0 \
    2026-03-18.0 \
    2026-04-15.0 \
    2026-05-20.0 \
    2026-06-17.0 \
    2026-07-22.0 \
    2026-08-19.0
set -l had_uploaded 0

for release in $releases
    set -l dir "$root/$release/divisions/中国/Hong Kong SAR"

    if not test -d "$dir"
        set dir "$root/$release/divisions/China/Hong Kong"
    end

    if not test -d "$dir"
        echo "Overture Hong Kong divisions directory not found for $release." >&2
        exit 1
    end

    for type in division division_area division_boundary
        set -l resource_type_processed 0
        set -l file "$dir/$type.division.intersects.clipSmart.parquet"

        if not test -f "$file"
            echo "Overture input file not found: $file" >&2
            exit 1
        end

        set -l type_slug (string replace -a -- '_' '-' $type)
        set -l release_code "dr-hk-overture-$type_slug-$release"
        init_run_upload "$release_code" "$file" --yes --skip-cleanup
        if test "$saanseoi_init_last_upload_processed" -eq 1
            set resource_type_processed 1
        end

        if test "$had_uploaded" -eq 0; and test "$release" = "2025-09-24.0"; and test "$type" = division
            init_run_upload dr-hk-hkgov-had-division-area-district-2022 \
                "$saanseoi_init_repo/data/hkgov/had/2022/hkgov-had-districts-20230609.geojson" \
                --yes --skip-cleanup --cohort-key 2022
            if test "$saanseoi_init_last_upload_processed" -eq 1
                set resource_type_processed 1
            end
            set had_uploaded 1
        end

        init_publish_docs_if_processed "$resource_type_processed"
    end
end

for year in 2016 2021
    set -l file "$saanseoi_init_repo/data/hkgov/censtatd/district-council-districts-$year.gml"

    if not test -f "$file"
        echo "C&SD input file not found: $file" >&2
        exit 1
    end

    # A standard C&SD upload also publishes its simplified display-geometry
    # companion. Do not explicitly upload --transform simplified again.
    init_run_upload "dr-hk-hkgov-censtatd-division-area-district-$year" "$file" \
        --source hkgov-censtatd --source-version $year \
        --type divisionArea --theme divisions --region hk --cohort-key $year \
        --yes
    init_publish_docs_if_processed "$saanseoi_init_last_upload_processed"
end

# The Permanent Living Quarters C&SD source derives the required hkgov-censtatd-area geometry
# after the Overture canonical divisions are available. It must precede draft
# release-set reconciliation so the first initialisation run can publish them.
set -l censtatd_area_archive \
    "$saanseoi_init_repo/data/hkgov/csdi/archive/censtatd_rcd_1635933883228_46491/2023-Q4/source.zip"
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
# A normal update maintains the source-statistics release. Its Geographic
# `divisionArea` companion is replayed below from the prepared archive. It is
# one completed source release, so a resumed initializer must use the same
# skip convention as the preceding division uploads rather than entering the
# update and dataops-specific status UIs.
set -l censtatd_area_release_code \
    dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-2023-H2
if test "$saanseoi_init_continue" -eq 1; and init_is_completed_release "$censtatd_area_release_code"
    echo "Skipping completed release $censtatd_area_release_code."
else
    init_run_step ./bin/saanseoi update --target $saanseoi_init_target \
        --dataset ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters \
        --download --yes
    init_run_step bun run --silent dataops -- hkgov-censtatd:statistics \
        "$censtatd_area_archive" --target $saanseoi_init_target \
        --dataset-code ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters \
        --source-version 2023-H2 \
        --release-notes-url "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933883228_46491" \
        --source-archive-key by-source/hk/hkgov-csdi/censtatd_rcd_1635933883228_46491/2023-Q4/f481982c28e83faf0c470e3093146b146921e10739c6c455fe8d08cd31841070-source.zip \
        --source-archive-sha256 f481982c28e83faf0c470e3093146b146921e10739c6c455fe8d08cd31841070 \
        --geography-only
    set -g saanseoi_init_docs_pending 1
end

# A resumed initialiser may skip C&SD releases that are already published.
# Re-evaluate the draft Overture sets after every dependency is available.
init_reconcile_draft_release_sets ./bin/saanseoi release-sets:reconcile --target $saanseoi_init_target \
    --api-family divisions --region hk

# Do not delay the final summary behind a full documentation scan when any
# source release failed. A successful --continue run will publish the docs.
init_complete

# Publishing release documentation scans every published release. Defer it until
# all cohort uploads have completed so an initial run does not repeat that scan
# after each individual source release.
init_publish_docs_if_needed
