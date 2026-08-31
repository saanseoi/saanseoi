#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:production" $argv

init_run_step bun run db:reset:production

set -l cache_artefact_args
if test "$saanseoi_init_cache_artefacts" -eq 1
    set cache_artefact_args --cacheArtefacts
end

set -l failed 0

# Keep the production baseline aligned with init:local. Planning Unit and New
# Town remain available as dedicated initialisers, but are intentionally omitted.
for command in \
    init:divisions:geographic \
    init:divisions:hkgov-landsd \
    init:stats:official
    ./bin/saanseoi $command --target production $cache_artefact_args
    or set failed 1
end

# ./bin/saanseoi init:addresses:official --target production

if test $failed -ne 0
    exit 1
end
