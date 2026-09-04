#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:local" $argv

init_run_step bun run db:reset:local
init_clear_clean_run_manifests local

set -l cache_artefact_args
if test "$saanseoi_init_cache_artefacts" -eq 1
    set cache_artefact_args --cacheArtefacts
end

set -l failed 0

for command in \
    init:divisions:geographic \
    init:divisions:hkgov-pland-pu \
    init:divisions:hkgov-pland-new-town \
    init:divisions:hkgov-landsd \
    init:addresses:official \
    init:places:overture \
    init:stats:official
    ./bin/saanseoi $command --target local $cache_artefact_args
    or set failed 1
end

if test $failed -ne 0
    exit 1
end
