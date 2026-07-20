#!/usr/bin/env fish

set -l script_dir (command dirname (status filename))
set -l repo (command realpath "$script_dir/..")
set -l root "$repo/data/overture"

builtin cd "$repo"; or exit 1

function run_step
    $argv
    or exit $status
end

run_step bun run db:reset:local

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

        run_step ./bin/saanseoi upload --target local "$file" --yes --skip-cleanup

        if test "$had_uploaded" -eq 0; and test "$release" = "2025-09-24.0"; and test "$type" = division
            run_step ./bin/saanseoi upload --target local \
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
    run_step ./bin/saanseoi upload --target local "$file" \
        --source hkgov-censtatd --source-version $year \
        --type divisionArea --theme divisions --region hk --cohort-key $year \
        --yes
end

run_step ./bin/saanseoi docs:publish --target local --scope all
run_step ./bin/saanseoi ingest-hkgov-dpo-local \
    "$repo/data/hkgov/dpo/ALS" \
    --target local --cohort-key 2025-12-17.0
