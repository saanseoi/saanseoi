#!/usr/bin/env fish

source (command dirname (status filename))/common.fish
init_configure "saanseoi init:production" $argv

init_run_step bun run db:reset:production
init_clear_clean_run_manifests production
# A reset replaces every remote release ID. Re-export the planning cache before
# an upload compares C&SD release statistics, otherwise it can resolve an ID
# retained from the database that was just erased.
init_run_step ./bin/saanseoi cache:seed-reset --target production

set -l cache_artefact_args
if test "$saanseoi_init_cache_artefacts" -eq 1
    set cache_artefact_args --cacheArtefacts
end

for command in \
    init:divisions:geographic \
    init:divisions:hkgov-pland-pu \
    init:divisions:hkgov-pland-new-town \
    init:divisions:hkgov-landsd \
    init:addresses:official \
    init:places:overture \
    init:stats:official
    init_run_step ./bin/saanseoi $command --target production $cache_artefact_args
end
