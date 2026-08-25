#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:stats:official" $argv

# Keep this launch set explicit: it is intentionally narrower than the full
# stats scope, whose datasets may have independent launch schedules.
set -l datasets \
    ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district \
    ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups \
    ds-hk-hkgov-censtatd-division-statistic-major-housing-estates \
    ds-hk-hkgov-censtatd-division-statistic-new-towns \
    ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type \
    ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district \
    ds-hk-hkgov-censtatd-division-statistic-population-households-district \
    ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district

for dataset in $datasets
    init_run_step ./bin/saanseoi update --target $saanseoi_init_target \
        --dataset $dataset --download --check-now --yes
end
