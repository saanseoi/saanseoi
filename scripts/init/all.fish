#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init" $argv

set -l continuation_args
if test "$saanseoi_init_continue" -eq 1
    set continuation_args --continue
end

set -l cache_artefact_args
if test "$saanseoi_init_cache_artefacts" -eq 1
    set cache_artefact_args --cacheArtefacts
end

for command in \
    init:divisions:overture \
    init:divisions:hkgov-pland-pu \
    init:divisions:hkgov-pland-new-town \
    init:divisions:hkgov-landsd \
    init:streets:hkgov-landsd \
    init:addresses:default
    init_run_step ./bin/saanseoi $command --target $saanseoi_init_target \
        $continuation_args $cache_artefact_args
end
