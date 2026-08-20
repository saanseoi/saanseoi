#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:divisions:overture" $argv

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
    2026-07-22.0
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
    set -l release_notes_url

    switch $year
        case 2016
            set release_notes_url "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635932488538_10765"
        case 2021
            set release_notes_url "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933617052_68946"
    end

    if not test -f "$file"
        echo "C&SD input file not found: $file" >&2
        exit 1
    end

    # A standard C&SD upload also publishes its simplified display-geometry
    # companion. Do not explicitly upload --transform simplified again.
    init_run_upload "dr-hk-hkgov-censtatd-division-area-district-$year" "$file" \
        --source hkgov-censtatd --source-version $year \
        --type divisionArea --theme divisions --region hk --cohort-key $year \
        --release-notes-url "$release_notes_url" --yes
    init_publish_docs_if_processed "$saanseoi_init_last_upload_processed"
end

# A resumed initialiser may skip C&SD releases that are already published.
# Re-evaluate the draft Overture sets after every dependency is available.
init_run_step ./bin/saanseoi release-sets:reconcile --target $saanseoi_init_target \
    --api-family divisions --region hk
set -g saanseoi_init_docs_pending 1

# Publishing release documentation scans every published release. Defer it until
# all cohort uploads have completed so an initial run does not repeat that scan
# after each individual source release.
init_publish_docs_if_needed
