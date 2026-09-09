#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:stats:government" $argv

# Statistics-owned geometry is a prerequisite of the Divisions composition.
# A combined initialiser may already have completed it; standalone Statistics
# must still restore and publish it before the remaining sources.
if not init_has_completed_prerequisite divisions:geographic
    set -l geography_cache_args
    if test "$saanseoi_init_cache_artefacts" -ne 1
        set geography_cache_args --no-cache-artefacts
    end
    init_run_step ./bin/saanseoi init:divisions:geographic \
        --target $saanseoi_init_target --continue $geography_cache_args
end

# Keep this launch set explicit: it is intentionally narrower than the full
# stats scope, whose datasets may have independent launch schedules.
set -l datasets \
    ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district \
    ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups \
    ds-hk-hkgov-censtatd-division-statistic-major-housing-estates \
    ds-hk-hkgov-censtatd-division-statistic-new-towns \
    ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters \
    ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district \
    ds-hk-hkgov-censtatd-division-statistic-population-households-district \
    ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district

for dataset in $datasets
    set -l geography_args
    if test "$dataset" = ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups
        # This Stats source also owns the complete current HMA Divisions
        # domain. Retain its Statistics release-set deferral while publishing
        # that domain's primary and area resources together.
        set geography_args --include-geography
    end
    init_run_step ./bin/saanseoi update --target $saanseoi_init_target \
        --dataset $dataset --download --check-now --defer-stats-release-set \
        $geography_args --yes
end

# Source datasets frequently complete at different times for the same
# Statistics cohort. Publish the composed cohort only after all of its sources
# have been ingested, so an initial pre-release build has a single release set.
init_run_step ./bin/saanseoi release-sets:bootstrap-stats \
    --target $saanseoi_init_target --region hk

# Statistics release sets are created after the other initialisers' documentation
# pass, so publish their existing Notes and Guide fixtures as the final step too.
init_publish_docs
