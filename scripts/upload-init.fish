#!/usr/bin/env fish

set -l script_dir (command dirname (status filename))
set -l repo (command realpath "$script_dir/..")
set -l root "$repo/data/overture"

builtin cd "$repo"; or exit 1

function run_step
    $argv
    or exit $status
end

set -l continue_upload 0

if test (count $argv) -gt 1; or test (count $argv) -eq 1; and test "$argv[1]" != "--continue"
    echo "Usage: saanseoi upload:init [--continue]" >&2
    exit 1
end

if test (count $argv) -eq 1
    set continue_upload 1
end

set -g completed_release_codes

function load_completed_release_codes
    set -l output (bun x wrangler d1 execute ss-meta-db-preview \
        --config "$repo/apps/harbour-api/wrangler.jsonc" \
        --env preview --local --persist-to "$repo/.local/d1/dev" --json \
        --command "SELECT code FROM releases WHERE status IN ('published', 'superseded');" 2>&1)

    if test $status -ne 0
        string join \n -- $output >&2
        return 1
    end

    set -g completed_release_codes (string join \n -- $output | jq -r '.[0].results[]?.code')
end

function is_completed_release
    contains -- $argv[1] $completed_release_codes
end

function run_upload_step
    set -l release_code $argv[1]
    set -e argv[1]

    if test "$continue_upload" -eq 1; and is_completed_release "$release_code"
        echo "Skipping completed release $release_code."
        return
    end

    run_step ./bin/saanseoi upload --target local $argv
end

if test "$continue_upload" -eq 1
    if not load_completed_release_codes
        echo "Cannot continue upload initialization: could not read completed local releases." >&2
        exit 1
    end
else
    run_step bun run db:reset:local
end

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
    2026-06-17.0
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
        set -l file "$dir/$type.division.intersects.clipSmart.parquet"

        if not test -f "$file"
            echo "Overture input file not found: $file" >&2
            exit 1
        end

        set -l release_code "dr-hk-overture-"(string replace -a -- 'division_area' 'division-area' $type)(string replace -a -- 'division_boundary' 'division-boundary' "-$release")
        run_upload_step "$release_code" "$file" --yes --skip-cleanup

        if test "$had_uploaded" -eq 0; and test "$release" = "2025-09-24.0"; and test "$type" = division
            run_upload_step dr-hk-hkgov-had-division-area-district-2022 \
                "$repo/data/hkgov/had/2022/hkgov-had-districts-20230609.geojson" \
                --yes --skip-cleanup --cohort-key 2022
            set had_uploaded 1
        end
    end
end

for year in 2016 2021
    set -l file "$repo/data/hkgov/censtatd/district-council-districts-$year.gml"

    if not test -f "$file"
        echo "C&SD input file not found: $file" >&2
        exit 1
    end

    # A standard C&SD upload also publishes its simplified display-geometry
    # companion. Do not explicitly upload --transform simplified again.
    run_upload_step "dr-hk-hkgov-censtatd-division-area-district-$year" "$file" \
        --source hkgov-censtatd --source-version $year \
        --type divisionArea --theme divisions --region hk --cohort-key $year \
        --yes
end

set -l continue_args
if test "$continue_upload" -eq 1
    set continue_args --continue
end

run_step ./bin/saanseoi backfill:hkgov-pland-pu --target local $continue_args
run_step ./bin/saanseoi backfill:hkgov-pland-new-town --target local $continue_args

run_step ./bin/saanseoi docs:publish --target local --scope all
run_step ./bin/saanseoi ingest-hkgov-dpo-local \
    "$repo/data/hkgov/dpo/ALS" \
    --target local --cohort-key 2025-12-17.0
