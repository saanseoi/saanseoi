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

init_publish_docs
